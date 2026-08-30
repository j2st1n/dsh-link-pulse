import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { name, inject, loadDynamicProviders, probeLatency } from '../src/index.js'

describe('dsh-link-pulse tests', () => {
  test('plugin metadata and cordis inject declaration', () => {
    assert.equal(name, 'link-pulse')
    assert.ok(Array.isArray(inject), 'inject should be a flat array for cordis@4 compatibility')
    assert.deepEqual(inject, ['webServer'])
  })

  test('loadDynamicProviders loads providers and providerMap correctly', () => {
    const { providers, providerMap, defaultModelConfig } = loadDynamicProviders()
    assert.ok(Array.isArray(providers))
    assert.ok(providers.length > 0)
    assert.ok(typeof providerMap === 'object')
    assert.ok(defaultModelConfig)

    // 验证官方 deepseek 和 opencode-go 网关分离，绝不混淆
    // DSH 内置官方 DeepSeek 路由的运行时 provider id 为 deepseek-official，
    // 兜底节点必须使用同 id，否则客户端按当前会话 provider 查找会落空
    if (providerMap['deepseek-official']) {
      assert.equal(providerMap['deepseek-official'].baseURL, 'https://api.deepseek.com')
      assert.equal(providerMap['deepseek-official'].name, 'DeepSeek 官方')
    }
    if (providerMap['deepseek']) {
      assert.equal(providerMap['deepseek'].baseURL, 'https://api.deepseek.com')
      assert.equal(providerMap['deepseek'].name, 'DeepSeek 官方')
    }
    if (providerMap['opencode-go']) {
      assert.equal(providerMap['opencode-go'].baseURL, 'https://opencode.ai')
      assert.equal(providerMap['opencode-go'].name, 'OpenCode GO')
    }
  })

  test('probeLatency handles invalid or empty URLs', async () => {
    const res1 = await probeLatency('')
    assert.equal(res1.latencyMs, -1)
    assert.equal(res1.reachable, undefined)

    const res2 = await probeLatency('not-a-url')
    assert.equal(res2.latencyMs, -1)
  })
})
