import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import tls from 'node:tls'
import net from 'node:net'
import jsYaml from 'js-yaml'

export const name = 'link-pulse'
export const inject = ['webServer']

const KNOWN_PROVIDER_DEFAULTS = {
  deepseek: {
    name: 'DeepSeek 官方',
    baseURL: 'https://api.deepseek.com',
  },
  'deepseek-official': {
    name: 'DeepSeek 官方',
    baseURL: 'https://api.deepseek.com',
  },
  'opencode-go': {
    name: 'OpenCode GO',
    baseURL: 'https://opencode.ai',
  },
  openai: {
    name: 'OpenAI 官方',
    baseURL: 'https://api.openai.com',
  },
  anthropic: {
    name: 'Anthropic 官方',
    baseURL: 'https://api.anthropic.com',
  },
  google: {
    name: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com',
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai',
  },
}

const WORKBUDDY_CN_GATEWAY = 'https://copilot.tencent.com'
const WORKBUDDY_CN_DOMAINS = ['copilot.tencent.com', 'tencentbuddy.com', 'workbuddy.cn', 'codebuddy.cn']

function gatewayOrigin(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin
  } catch {}
  return ''
}

function workBuddyGateway(provider, profile) {
  if (provider !== 'workbuddy' || !profile?.regions) return ''
  const configured = gatewayOrigin(profile.regions.cn?.cnBase)
  if (configured.startsWith('https://')) {
    const { hostname } = new URL(configured)
    if (WORKBUDDY_CN_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return `https://${hostname}`
    }
  }
  return WORKBUDDY_CN_GATEWAY
}

const jsType = new jsYaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: (data) => data,
})
const yamlSchema = jsYaml.DEFAULT_SCHEMA.extend([jsType])

function getCandidateConfigPaths() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return [
    path.join(dshHome, 'profiles/web/cordis.patch.yml'),
    path.join(dshHome, 'settings.yaml'),
    path.join(dshHome, 'cordis.patch.yml'),
  ]
}

export function loadDynamicProviders({ registered = [], configurable = [], namespaces = [] } = {}) {
  let settings = {}

  for (const p of getCandidateConfigPaths()) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8')
        const parsed = jsYaml.load(raw, { schema: yamlSchema })
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.id && item.config) {
              settings[item.id] = { ...(settings[item.id] || {}), ...item.config }
            }
          }
        } else if (parsed && typeof parsed === 'object') {
          settings = { ...settings, ...parsed }
        }
      } catch {}
    }
  }

  const runtimeSettings = new Map(namespaces.map(({ ns, value }) => [ns, value]))
  const section = (ns) => runtimeSettings.get(ns) ?? settings[ns]
  const providersConfig = section('llm-pi-ai')?.providers || {}
  const defaultModelConfig = section('agent-default-model') || {
    provider: 'cpa',
    model: 'gemini-3.8-flash-high',
  }

  const providers = []
  const providerMap = Object.create(null)
  const registeredById = new Map(registered.map((entry) => [entry.id, entry]))
  const configurableById = new Map(configurable.map((entry) => [entry.provider, entry]))
  const providerIds = new Set([...Object.keys(providersConfig), ...registeredById.keys()])

  for (const providerId of providerIds) {
    const entry = configurableById.get(providerId)
    const stored = entry?.settingsPath?.reduce((value, key) => value?.[key], section(entry.settingsNs))
    const profile = Object.hasOwn(providersConfig, providerId) ? providersConfig[providerId] : undefined
    const pConfig = stored ?? profile ?? {}
    const rawModels = pConfig.models || []
    const modelList = rawModels.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)

    const known = KNOWN_PROVIDER_DEFAULTS[providerId] || {}
    const envBaseUrl = entry?.baseURLEnv?.map((key) => gatewayOrigin(process.env[key])).find(Boolean)
    const targetBaseUrl = gatewayOrigin(pConfig.baseURL) || workBuddyGateway(providerId, pConfig) || envBaseUrl
      || gatewayOrigin(entry?.defaultBaseURL) || known.baseURL || ''
    const displayName = pConfig.displayName || pConfig.name || registeredById.get(providerId)?.name
      || known.name || providerId.toUpperCase()

    const item = {
      id: providerId,
      name: displayName,
      baseURL: targetBaseUrl,
      // 显式标记是否配置了网关地址。数据层不过滤任何 provider（排查仍要看全量），
      // 只把这个事实交给展示层，让「未配置」不再被误渲染成「故障」。
      configured: targetBaseUrl !== '',
      api: pConfig.api || 'openai-responses',
      models: modelList,
      isDefault: defaultModelConfig.provider === providerId,
    }

    providers.push(item)
    providerMap[providerId] = item
  }

  // 如果未配置官方 deepseek（DSH 内置官方路由的 provider id 为 deepseek-official），补充作为独立官方探测节点
  if (!providerMap['deepseek-official']) {
    const dsItem = {
      id: 'deepseek-official',
      name: 'DeepSeek 官方',
      baseURL: 'https://api.deepseek.com',
      configured: true,
      api: 'deepseek-native',
      models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      isDefault: defaultModelConfig.provider === 'deepseek-official',
    }
    providers.push(dsItem)
    providerMap['deepseek-official'] = dsItem
  }

  return {
    providers,
    providerMap,
    defaultModelConfig,
  }
}

/**
 * 测量 Keep-Alive 状态下的真实单次 RTT 往返延迟
 * (在已建立的加密 socket 上发送 HEAD 并测量首字节返回耗时)
 */
export async function probeLatency(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { latencyMs: -1, status: 'no_url', quality: 'offline', error: '无有效网络地址' }
  }

  return new Promise((resolve) => {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return resolve({ latencyMs: -1, quality: 'error', reachable: false, error: 'URL 格式错误' })
    }

    const host = parsed.hostname
    const isHttps = parsed.protocol === 'https:'
    const port = parseInt(parsed.port, 10) || (isHttps ? 443 : 80)
    const timeout = 3500

    let timer = null
    let socket = null

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      if (socket) {
        socket.removeAllListeners()
        socket.destroy()
      }
    }

    timer = setTimeout(() => {
      cleanup()
      resolve({ latencyMs: 3500, quality: 'timeout', reachable: false, error: '请求超时 (>3.5s)' })
    }, timeout)

    try {
      const onEstablished = (sock) => {
        const start = performance.now()
        const path = parsed.pathname || '/'
        sock.write(`HEAD ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: DSH-LinkPulse/1.0\r\nConnection: close\r\n\r\n`)

        sock.once('data', () => {
          const latencyMs = Math.max(1, Math.round(performance.now() - start))
          cleanup()

          let quality = 'excellent'
          if (latencyMs > 600) quality = 'slow'
          else if (latencyMs > 200) quality = 'good'

          resolve({
            latencyMs,
            quality,
            reachable: true,
          })
        })
      }

      if (isHttps) {
        socket = tls.connect({
          host,
          port,
          servername: host,
          rejectUnauthorized: false,
          timeout,
        }, () => onEstablished(socket))
      } else {
        socket = net.connect({
          host,
          port,
          timeout,
        }, () => onEstablished(socket))
      }

      socket.on('error', (err) => {
        cleanup()
        resolve({
          latencyMs: -1,
          quality: 'error',
          reachable: false,
          error: err.message || '连接失败',
        })
      })

      socket.on('timeout', () => {
        cleanup()
        resolve({
          latencyMs: 3500,
          quality: 'timeout',
          reachable: false,
          error: '连接超时',
        })
      })
    } catch (err) {
      cleanup()
      resolve({
        latencyMs: -1,
        quality: 'error',
        reachable: false,
        error: err.message || '连接异常',
      })
    }
  })
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

// ---------------------------------------------------------------------------
// 本地 Host/Origin fence
//
// 移植自 dsh-opencode-status（零外部依赖），与 DSH client-connection 的
// isTrustedApiRequest 语义一致。exact 路由不会经过宿主准入，因此路由自身必须
// 做来源校验，否则任意网页可用 DNS rebinding 读取本机状态。
// ---------------------------------------------------------------------------

/** PUT/POST 只接受 JSON 请求体，允许带 charset 参数。 */
function isJsonContentType(value) {
  return typeof value === 'string' && /^application\/json\s*(?:;|$)/i.test(value.trim())
}

/** 读取请求头；Node 的 headers 是名字归一化后的普通对象。 */
function headerValue(headers, name) {
  const value = headers?.[name]
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined
}

/** 与 DSH client-connection 的 isLoopbackHostname 对齐：localhost、[::1] 与 127/8。 */
function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** 按指定 scheme 解析裸 authority（host 或 host:port）；非法值返回 undefined。 */
function parseAuthority(authority, scheme = 'http:') {
  try {
    return new URL(`${scheme}//${authority}`)
  } catch {
    return undefined
  }
}

/** 绑定地址的 URL 主机名形式：IPv6 加方括号，去掉接口 zone。 */
function bindHostname(bindHost) {
  if (typeof bindHost !== 'string' || bindHost === '') return undefined
  const zoneAt = bindHost.indexOf('%')
  const bare = zoneAt === -1 ? bindHost : bindHost.slice(0, zoneAt)
  try {
    return new URL(`http://${bare.includes(':') ? `[${bare}]` : bare}`).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

/** 对齐 DSH 的 isTrustedAuthority：无端口条目匹配任意端口，带端口条目精确匹配。 */
function isTrustedAuthority(hostUrl, trustedHosts, scheme) {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry, scheme)
    if (entryUrl === undefined) return false
    const otherScheme = entryUrl.protocol === 'http:' ? 'https:' : 'http:'
    const explicitPort = entryUrl.port !== '' ? entryUrl.port : new URL(`${otherScheme}//${entry}`).port
    return explicitPort === ''
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/** Origin 的 http(s) scheme；非法或非 http(s) 值返回 undefined。 */
function originScheme(origin) {
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' ? 'https:' : url.protocol === 'http:' ? 'http:' : undefined
  } catch {
    return undefined
  }
}

/** 对齐 DSH 的 isSameAuthorityOrigin：Host 按 Origin 的 scheme 归一化默认端口后比较。 */
function isSameAuthorityOrigin(origin, host) {
  const scheme = originScheme(origin)
  if (scheme === undefined) return false
  const hostUrl = parseAuthority(host, scheme)
  return hostUrl !== undefined && new URL(origin).host === hostUrl.host
}

/** 读取宿主服务；未提供或未注入时 cordis 会抛错，这里统一降级为 undefined。 */
function readService(read) {
  try {
    return read()
  } catch {
    return undefined
  }
}

let cachedData = null
let lastProbeAt = 0

export function apply(ctx) {
  let readRuntime
  ctx.inject(['llm', 'settings'], (scope) => {
    readRuntime = () => ({
      registered: scope.llm.listProviders?.(),
      configurable: scope.llm.listConfigurableProviders?.(),
      namespaces: scope.settings.describe?.({ redactSecrets: true }),
    })
    scope.effect(() => () => { readRuntime = undefined })
  })

  /** connection 服务（DSH Web 的 Host/Origin fence 所有者）及其 trustedHosts。 */
  function connectionService() {
    return readService(() => (typeof ctx.get === 'function' ? ctx.get('connection') : undefined))
  }

  function connectionTrustedHosts() {
    const trusted = readService(() => connectionService()?.trustedHosts)
    return Array.isArray(trusted) ? trusted.filter((entry) => typeof entry === 'string') : []
  }

  /** 监听器 scheme（https 由 TLS 配置决定，从不取自请求头）。 */
  function listenerScheme() {
    const protocol = readService(() => ctx.webServer?.protocol)
    return protocol === 'https:' || protocol === 'http:' ? protocol : 'http:'
  }

  /**
   * 本地 Host/Origin fence，与 DSH client-connection 的 isTrustedApiRequest 等价：
   * Host 必须是 loopback、监听器 bind 地址或 connection.trustedHosts 中的地址；
   * 拒绝 sec-fetch-site: cross-site；带 Origin 时必须是同一 authority（默认端口按 Origin 的 scheme 归一化）。
   */
  function trustedByLocalFence(req) {
    const headers = req.headers ?? {}
    const host = headerValue(headers, 'host')
    if (host === undefined || host === '') return false
    const origin = headerValue(headers, 'origin')
    const scheme = (origin !== undefined && originScheme(origin)) || listenerScheme()
    const hostUrl = parseAuthority(host, scheme)
    if (hostUrl === undefined) return false
    const bind = bindHostname(readService(() => ctx.webServer?.host))
    const hostTrusted = isLoopbackHostname(hostUrl.hostname)
      || (bind !== undefined && hostUrl.hostname === bind)
      || isTrustedAuthority(hostUrl, connectionTrustedHosts(), scheme)
    if (!hostTrusted) return false
    if (headerValue(headers, 'sec-fetch-site') === 'cross-site') return false
    if (origin === undefined || origin === '') return true
    return isSameAuthorityOrigin(origin, host)
  }

  /** 优先使用宿主的官方 fence，缺失 connection 服务时回退到等价的本地实现。 */
  function isTrustedRequest(req) {
    const connection = connectionService()
    // 真实宿主 ctx.get('connection') 返回 null（不是 undefined）。用 != null 同时覆盖两种
    // 「服务不存在」形态；若写成 !== undefined，null 会进入分支读 null.isTrusted 抛 TypeError，
    // 被 guard 包成 500 并泄漏内部错误文本。
    if (connection != null && typeof connection.isTrusted === 'function') {
      return readService(() => connection.isTrusted(req)) === true
    }
    return trustedByLocalFence(req)
  }

  /**
   * 读请求防护：与写请求共用同一套 Host/来源白名单。
   * 只读路径同样会被 DNS rebinding 利用（攻击者页面可读取网关地址与延迟数据），
   * 因此 GET 不再放行任意来源。
   */
  function assertTrustedRead(req) {
    if (!isTrustedRequest(req)) {
      throw Object.assign(new Error('拒绝不可信的读请求来源'), { statusCode: 403, code: 'FORBIDDEN' })
    }
  }

  /** 写请求防护：先做 Host/来源白名单（DNS rebinding 与跨站防护），再校验请求内容类型。 */
  function assertTrustedWrite(req) {
    if (!isTrustedRequest(req)) {
      throw Object.assign(new Error('拒绝不可信的写请求来源'), { statusCode: 403, code: 'FORBIDDEN' })
    }
    if (!isJsonContentType((req.headers ?? {})['content-type'])) {
      // 与宿主 client-connection 对齐：实体格式不受支持时返回 415，而不是 403。
      throw Object.assign(new Error('写请求必须使用 application/json'), {
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
      })
    }
  }

  function guard(handler, { writeMethods = [], fencedRead = false } = {}) {
    return async (req, res) => {
      try {
        const method = String(req.method ?? '').toUpperCase()
        if (writeMethods.includes(method)) assertTrustedWrite(req)
        else if (fencedRead && method === 'GET') assertTrustedRead(req)
        await handler(req, res)
      } catch (error) {
        sendJson(res, error?.statusCode ?? 500, {
          error: { code: error?.code ?? 'INTERNAL', message: String(error?.message ?? error) },
        })
      }
    }
  }

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/link-pulse/status',
      handler: guard(async (req, res) => {
        if (req.method !== 'GET') {
          return sendJson(res, 405, { error: 'GET only' })
        }

        try {
          const isForce = req.url && req.url.includes('refresh=1')
          const now = Date.now()
          if (!isForce && cachedData && now - lastProbeAt < 25_000) {
            return sendJson(res, 200, cachedData)
          }

          const { providers, defaultModelConfig } = loadDynamicProviders(readRuntime?.())

          // 未配置网关的 provider 没有任何地址可探，直接给出确定结论而不是去连空地址。
          // 形状与 probeLatency 的 no_url 分支保持一致，避免下游字段判断分叉。
          const UNCONFIGURED_PROBE = Object.freeze({
            latencyMs: -1,
            status: 'no_url',
            quality: 'offline',
            error: '无有效网络地址',
          })

          const probes = new Map()
          for (const { baseURL } of providers) {
            if (!probes.has(baseURL)) probes.set(baseURL, probeLatency(baseURL))
          }
          const probedProviders = await Promise.all(providers.map(async (provider) => ({
            ...provider,
            probe: await probes.get(provider.baseURL),
          })))
          const probedMap = Object.create(null)
          for (const item of probedProviders) {
            probedMap[item.id] = item
          }

          cachedData = {
            defaultModelConfig,
            providers: probedProviders,
            providerMap: probedMap,
            timestamp: Date.now(),
          }
          lastProbeAt = Date.now()

          sendJson(res, 200, cachedData)
        } catch (err) {
          sendJson(res, 500, { error: String(err && err.message ? err.message : err) })
        }
      }, { fencedRead: true }),
    }),
  )
}
