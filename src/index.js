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

function getSettingsPath() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'settings.yaml')
}

export function loadDynamicProviders() {
  const settingsPath = getSettingsPath()
  let settings = {}
  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, 'utf8')
      settings = jsYaml.load(raw) || {}
    } catch {}
  }

  const providersConfig = settings['llm-pi-ai']?.providers || {}
  const defaultModelConfig = settings['agent-default-model'] || {
    provider: 'cpa',
    model: 'gemini-3.7-flash-high',
  }

  const providers = []
  const providerMap = {}

  for (const [providerId, pConfig] of Object.entries(providersConfig)) {
    const rawModels = pConfig.models || []
    const modelList = rawModels.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
    
    const known = KNOWN_PROVIDER_DEFAULTS[providerId] || {}
    const targetBaseUrl = pConfig.baseURL || known.baseURL || ''
    const displayName = pConfig.name || known.name || providerId.toUpperCase()

    const item = {
      id: providerId,
      name: displayName,
      baseURL: targetBaseUrl,
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

let cachedData = null
let lastProbeAt = 0

export function apply(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/link-pulse/status',
      handler: async (req, res) => {
        if (req.method !== 'GET') {
          return sendJson(res, 405, { error: 'GET only' })
        }

        try {
          const isForce = req.url && req.url.includes('refresh=1')
          const now = Date.now()
          if (!isForce && cachedData && now - lastProbeAt < 25_000) {
            return sendJson(res, 200, cachedData)
          }

          const { providers, providerMap, defaultModelConfig } = loadDynamicProviders()

          const probePromises = providers.map(async (p) => {
            const probeResult = await probeLatency(p.baseURL)
            return {
              ...p,
              probe: probeResult,
            }
          })

          const probedProviders = await Promise.all(probePromises)
          const probedMap = {}
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
      },
    }),
  )
}
