import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { name, inject, loadDynamicProviders, probeLatency } from '../src/index.js'

describe('dsh-link-pulse tests', () => {
  test('plugin metadata and cordis inject declaration', () => {
    assert.equal(name, 'link-pulse')
    assert.ok(Array.isArray(inject), 'inject should be a flat array for cordis@4 compatibility')
    assert.deepEqual(inject, ['webServer'])
  })

  test('loadDynamicProviders loads providers and mappings', () => {
    const { providers, defaultModelConfig, modelToProviderMap } = loadDynamicProviders()
    assert.ok(Array.isArray(providers))
    assert.ok(providers.length > 0)
    assert.ok(typeof modelToProviderMap === 'object')
    assert.ok(defaultModelConfig)
  })

  test('probeLatency handles invalid or empty URLs', async () => {
    const res1 = await probeLatency('')
    assert.equal(res1.latencyMs, -1)
    assert.equal(res1.reachable, undefined)

    const res2 = await probeLatency('not-a-url')
    assert.equal(res2.latencyMs, -1)
  })
})
