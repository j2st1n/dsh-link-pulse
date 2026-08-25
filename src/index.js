import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import jsYaml from 'js-yaml'

export const name = 'link-pulse'
export const inject = ['webServer']

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
  const modelToProviderMap = {}

  for (const [providerId, pConfig] of Object.entries(providersConfig)) {
    const rawModels = pConfig.models || []
    const modelList = rawModels.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
    
    for (const m of modelList) {
      modelToProviderMap[m.toLowerCase()] = providerId
    }

    let targetBaseUrl = pConfig.baseURL || ''
    if (!targetBaseUrl && providerId === 'opencode-go') {
      targetBaseUrl = 'https://api.deepseek.com'
    }

    providers.push({
      id: providerId,
      name: providerId.toUpperCase(),
      baseURL: targetBaseUrl,
      api: pConfig.api || 'openai-responses',
      models: modelList,
      isDefault: defaultModelConfig.provider === providerId,
    })
  }

  if (!providers.some((p) => p.id === 'deepseek' || p.id === 'deepseek-official')) {
    const dsModels = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3', 'deepseek-r1']
    for (const m of dsModels) {
      if (!modelToProviderMap[m]) {
        modelToProviderMap[m] = 'deepseek'
      }
    }
    providers.push({
      id: 'deepseek',
      name: 'DeepSeek 官方',
      baseURL: 'https://api.deepseek.com',
      api: 'deepseek-native',
      models: dsModels,
      isDefault: defaultModelConfig.provider === 'deepseek',
    })
  }

  return {
    providers,
    defaultModelConfig,
    modelToProviderMap,
  }
}

export async function probeLatency(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { latencyMs: -1, status: 'no_url', quality: 'offline', error: '无有效网络地址' }
  }

  let probeUrl = url
  try {
    const parsed = new URL(url)
    probeUrl = `${parsed.protocol}//${parsed.host}`
  } catch {}

  const start = performance.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3500)

  try {
    const res = await fetch(probeUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'DSH-LinkPulse/1.0' },
    }).catch(async () => {
      return await fetch(probeUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'DSH-LinkPulse/1.0' },
      })
    })

    clearTimeout(timeoutId)
    const latencyMs = Math.round(performance.now() - start)

    let quality = 'excellent'
    if (latencyMs > 600) quality = 'slow'
    else if (latencyMs > 200) quality = 'good'

    return {
      latencyMs,
      httpStatus: res.status,
      quality,
      reachable: true,
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    return {
      latencyMs: isTimeout ? 3500 : -1,
      quality: isTimeout ? 'timeout' : 'error',
      reachable: false,
      error: isTimeout ? '请求超时 (>3.5s)' : (err.message || '连接失败'),
    }
  }
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

          const { providers, defaultModelConfig, modelToProviderMap } = loadDynamicProviders()

          const probePromises = providers.map(async (p) => {
            const probeResult = await probeLatency(p.baseURL)
            return {
              ...p,
              probe: probeResult,
            }
          })

          const probedProviders = await Promise.all(probePromises)

          cachedData = {
            defaultModelConfig,
            modelToProviderMap,
            providers: probedProviders,
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
