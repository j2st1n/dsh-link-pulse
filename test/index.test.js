import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import net from 'node:net'
import { apply, name, inject, loadDynamicProviders, probeLatency } from '../src/index.js'

/** 在沙箱里加载 client.js，返回其导出的展示纯函数（不渲染 React 树）。 */
function loadDisplay() {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  let definition = null
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useEffect: () => {},
    useState: (v) => [v, () => {}],
    useRef: (v) => ({ current: v }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useSyncExternalStore: () => ({}),
  }
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: (d) => { definition = d },
      },
    },
    document: {
      createElement: () => ({ remove() {} }),
      head: { appendChild() {} },
    },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    fetch: async () => ({ ok: false }),
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client.js' })
  assert.ok(definition, 'client.js 必须通过 __ModuleLoader__.load 注册')
  const plugin = definition.factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })
  assert.ok(plugin.__display, 'client 必须导出展示纯函数')
  return plugin.__display
}

describe('dsh-link-pulse tests', () => {
  test('plugin metadata and cordis inject declaration', () => {
    assert.equal(name, 'link-pulse')
    assert.ok(Array.isArray(inject), 'inject should be a flat array for cordis@4 compatibility')
    assert.deepEqual(inject, ['webServer'])
  })

  test('client 弹出面板与参考插件同形，且不再使用 emoji 装饰', () => {
    const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
    // 居中模态 + 全屏遮罩已移除，面板改为与 dsh-weather / dsh-version-status / dsh-cpa-status
    // 一致的左下浮动面板。
    assert.doesNotMatch(source, /inset:\s*0/)
    assert.doesNotMatch(source, /backdropFilter/)
    assert.match(source, /left:\s*12,\s*\n\s*bottom:\s*54,/)
    // 移除遮罩后必须由 window mousedown 接管「点外部关闭」，并在卸载时移除监听。
    assert.match(source, /window\.addEventListener\('mousedown'/)
    assert.match(source, /window\.removeEventListener\('mousedown'/)
    // 装饰性 emoji（含 ✕ 字符）已全部替换为文本标签或内联 SVG 图标。
    assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
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

  test('discovers live provider gateways without assuming every adapter exposes an endpoint', (t) => {
    const key = 'LINK_PULSE_TEST_GATEWAY'
    const previous = process.env[key]
    process.env[key] = 'https://environment.example/v1'
    t.after(() => {
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    })

    const { providerMap } = loadDynamicProviders({
      registered: [
        { id: 'custom', name: 'Custom' },
        { id: 'catalog', name: 'Catalog' },
        { id: 'environment', name: 'Environment' },
        { id: 'workbuddy', name: 'WorkBuddy' },
        { id: 'workbuddy-global', name: 'WorkBuddy AI' },
        { id: 'opaque', name: 'Opaque' },
      ],
      configurable: [
        { provider: 'custom', settingsNs: 'adapter', settingsPath: ['routes', 'custom'], defaultBaseURL: 'https://catalog.example' },
        { provider: 'catalog', defaultBaseURL: 'https://catalog.example/v1' },
        { provider: 'environment', baseURLEnv: [key], defaultBaseURL: 'https://catalog.example' },
        { provider: 'workbuddy', settingsNs: 'connector', settingsPath: [] },
        { provider: 'workbuddy-global', settingsNs: 'connector', settingsPath: [] },
        { provider: 'dormant', defaultBaseURL: 'https://dormant.example' },
      ],
      namespaces: [
        { ns: 'llm-pi-ai', value: { providers: {} } },
        { ns: 'adapter', value: { routes: { custom: { baseURL: 'https://placeholder:placeholder@custom.example/v1?key=placeholder', models: ['m'] } } } },
        { ns: 'connector', value: { regions: { cn: { cnBase: 'https://wb.tencentbuddy.com/path' }, global: {} } } },
        { ns: 'agent-default-model', value: { provider: 'custom', model: 'm' } },
      ],
    })

    assert.equal(providerMap.custom.baseURL, 'https://custom.example')
    assert.deepEqual(providerMap.custom.models, ['m'])
    assert.equal(providerMap.custom.isDefault, true)
    assert.equal(providerMap.catalog.baseURL, 'https://catalog.example')
    assert.equal(providerMap.environment.baseURL, 'https://environment.example')
    assert.equal(providerMap.workbuddy.baseURL, 'https://wb.tencentbuddy.com')
    assert.equal(providerMap['workbuddy-global'].baseURL, '')
    assert.equal(providerMap.opaque.baseURL, '')
    assert.equal(providerMap.dormant, undefined)
  })

  test('uses the default WorkBuddy gateway when the connector rejects a custom host', () => {
    const { providerMap } = loadDynamicProviders({
      registered: [{ id: 'workbuddy', name: 'WorkBuddy' }],
      configurable: [{ provider: 'workbuddy', settingsNs: 'connector', settingsPath: [] }],
      namespaces: [{ ns: 'connector', value: { regions: { cn: { cnBase: 'https://workbuddy.cn.example' } } } }],
    })
    assert.equal(providerMap.workbuddy.baseURL, 'https://copilot.tencent.com')
  })

  test('status returns provider-specific RTT from a credential-free HEAD to each gateway', async (t) => {
    const requests = []
    t.mock.method(net, 'connect', (options, onConnect) => {
      const socket = new EventEmitter()
      socket.destroy = () => {}
      socket.write = (request) => {
        requests.push({ host: options.host, request })
        queueMicrotask(() => socket.emit('data', Buffer.from('HTTP/1.1 204 No Content\r\n\r\n')))
      }
      queueMicrotask(onConnect)
      return socket
    })
    const origin = 'http://gateway.example'

    let route
    apply({
      inject: (_, mount) => mount({
        llm: {
          listProviders: () => [{ id: 'custom', name: 'Custom' }, { id: 'opaque', name: 'Opaque' }],
          listConfigurableProviders: () => [{ provider: 'custom', settingsNs: 'adapter', settingsPath: [] }],
        },
        settings: {
          describe: (options) => {
            assert.deepEqual(options, { redactSecrets: true })
            return [
              { ns: 'llm-pi-ai', value: { providers: { 'deepseek-official': { baseURL: origin } } } },
              { ns: 'adapter', value: { baseURL: `${origin}/v1?key=placeholder` } },
            ]
          },
        },
        effect: () => {},
      }),
      effect: (mount) => mount(),
      webServer: { register: (entry) => { route = entry } },
    })

    const response = { setHeader() {}, end(body) { this.body = JSON.parse(body) } }
    await route.handler({ method: 'GET', url: '/api/link-pulse/status', headers: { host: '127.0.0.1:3080' } }, response)
    assert.equal(response.statusCode, 200)
    assert.ok(response.body.providerMap.custom.probe.latencyMs > 0)
    assert.deepEqual(response.body.providerMap.custom.probe, response.body.providerMap['deepseek-official'].probe)
    assert.equal(response.body.providerMap.opaque.probe.status, 'no_url')
    assert.equal(requests.length, 1)
    assert.equal(requests[0].host, 'gateway.example')
    assert.match(requests[0].request, /^HEAD \/ HTTP\/1\.1\r\n/)
    assert.doesNotMatch(requests[0].request, /authorization|placeholder/i)
  })

  // -------------------------------------------------------------------------
  // Host/Origin fence：exact 路由不经过宿主准入，路由必须自己拒绝伪造来源。
  // 这些用例实际驱动注册的 handler，而不是断言源码字符串。
  // -------------------------------------------------------------------------
  describe('status 路由的 Host/Origin fence', () => {
    /**
     * 启动插件并捕获注册的 exact 路由。
     * @param {{webServer?: object, connection?: object}} [options] 监听器 bind 地址与 connection 服务
     */
    function harness({ webServer = {}, connection } = {}) {
      let route
      apply({
        inject: (_, mount) => mount({
          llm: {
            listProviders: () => [{ id: 'custom', name: 'Custom' }],
            listConfigurableProviders: () => [],
          },
          settings: {
            describe: () => [
              { ns: 'llm-pi-ai', value: { providers: { 'deepseek-official': { baseURL: 'http://gateway.example' } } } },
            ],
          },
          effect: () => {},
        }),
        effect: (mount) => mount(),
        // 真实 DSH 宿主的 ctx.get 对未知服务返回 null（不是 undefined），
        // 缺省就按这个形态注入，确保 fence 的 null 分支被真实覆盖。
        get: (service) => (service === 'connection' ? (connection ?? null) : undefined),
        webServer: {
          register: (entry) => { route = entry },
          host: webServer.host ?? '127.0.0.1',
          protocol: webServer.protocol ?? 'http:',
        },
      })
      return route
    }

    /** 模拟响应对象；只记录 statusCode 与解析后的 body。 */
    function makeResponse() {
      return { setHeader() {}, end(body) { this.body = JSON.parse(body) } }
    }

    /** 用给定请求头调用一次已注册的 handler。 */
    async function call(route, headers, method = 'GET') {
      const response = makeResponse()
      await route.handler({ method, url: '/api/link-pulse/status', headers }, response)
      return response
    }

    test('正常 loopback 请求放行', async (t) => {
      t.mock.method(net, 'connect', (options, onConnect) => {
        const socket = new EventEmitter()
        socket.destroy = () => {}
        socket.write = () => queueMicrotask(() => socket.emit('data', Buffer.from('HTTP/1.1 204 No Content\r\n\r\n')))
        queueMicrotask(() => onConnect(socket))
        return socket
      })
      const route = harness()

      const plain = await call(route, { host: '127.0.0.1:3080' })
      assert.equal(plain.statusCode, 200)

      const localhost = await call(route, { host: 'localhost:3080' })
      assert.equal(localhost.statusCode, 200)

      // 同源 Origin 与 loopback Host 一致：放行。
      const sameOrigin = await call(route, { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' })
      assert.equal(sameOrigin.statusCode, 200)

      // 默认端口按 Origin 的 scheme 归一化后仍属同一 authority。
      const httpsDefault = await call(route, { host: 'localhost', origin: 'https://localhost' })
      assert.equal(httpsDefault.statusCode, 200)

      // 缺省 scheme 的 Origin 头（Firefox 历史行为）不应误伤。
      const noSecFetchSite = await call(route, { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' })
      assert.equal(noSecFetchSite.statusCode, 200)
    })

    test('伪造 Host / 缺失 Host 被拒 403', async (t) => {
      t.mock.method(net, 'connect', () => { throw new Error('fence 拒绝后不得探测网关') })
      const route = harness()

      // DNS rebinding 形态：Origin 与 Host 同为攻击者域名，Origin 自洽也必须被拒。
      const rebound = await call(route, { host: 'evil.example.test:3080', origin: 'http://evil.example.test:3080' })
      assert.equal(rebound.statusCode, 403)
      assert.equal(rebound.body.error.code, 'FORBIDDEN')

      const reboundBare = await call(route, { host: 'evil.example.test' })
      assert.equal(reboundBare.statusCode, 403)

      const missingHost = await call(route, {})
      assert.equal(missingHost.statusCode, 403)

      const emptyHost = await call(route, { host: '' })
      assert.equal(emptyHost.statusCode, 403)

      // 形似 loopback 但不属于 127/8 的地址不放行。
      const lookalike = await call(route, { host: '127.0.0.1.evil.example.test' })
      assert.equal(lookalike.statusCode, 403)
    })

    test('cross-site 请求被拒 403', async (t) => {
      t.mock.method(net, 'connect', () => { throw new Error('fence 拒绝后不得探测网关') })
      const route = harness()

      // Host 是合法 loopback，仅靠 Sec-Fetch-Site 识别跨站。
      const crossSite = await call(route, { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' })
      assert.equal(crossSite.statusCode, 403)
      assert.equal(crossSite.body.error.code, 'FORBIDDEN')

      const crossSiteWithOrigin = await call(route, {
        host: '127.0.0.1:3080',
        origin: 'http://127.0.0.1:3080',
        'sec-fetch-site': 'cross-site',
      })
      assert.equal(crossSiteWithOrigin.statusCode, 403)
    })

    test('不匹配的 Origin 被拒 403', async (t) => {
      t.mock.method(net, 'connect', () => { throw new Error('fence 拒绝后不得探测网关') })
      const route = harness()

      const foreignOrigin = await call(route, { host: '127.0.0.1:3080', origin: 'http://evil.example.test' })
      assert.equal(foreignOrigin.statusCode, 403)
      assert.equal(foreignOrigin.body.error.code, 'FORBIDDEN')

      // 端口不同即不同 authority。
      const otherPort = await call(route, { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:9999' })
      assert.equal(otherPort.statusCode, 403)

      // 非 http(s) 的 Origin 视为不匹配。
      const badScheme = await call(route, { host: '127.0.0.1:3080', origin: 'null' })
      assert.equal(badScheme.statusCode, 403)
    })

    test('监听器 bind 地址与 connection.trustedHosts 中的 Host 放行', async (t) => {
      t.mock.method(net, 'connect', (options, onConnect) => {
        const socket = new EventEmitter()
        socket.destroy = () => {}
        socket.write = () => queueMicrotask(() => socket.emit('data', Buffer.from('HTTP/1.1 204 No Content\r\n\r\n')))
        queueMicrotask(() => onConnect(socket))
        return socket
      })

      const bindRoute = harness({ webServer: { host: '192.168.1.10' } })
      const bindHost = await call(bindRoute, { host: '192.168.1.10:3080' })
      assert.equal(bindHost.statusCode, 200)

      const trustedRoute = harness({ connection: { trustedHosts: ['harness.internal:3080'] } })
      const trustedHost = await call(trustedRoute, { host: 'harness.internal:3080' })
      assert.equal(trustedHost.statusCode, 200)
      const untrusted = await call(trustedRoute, { host: 'other.internal:3080' })
      assert.equal(untrusted.statusCode, 403)
    })

    test('宿主提供 connection.isTrusted 时以其判定为准', async (t) => {
      t.mock.method(net, 'connect', (options, onConnect) => {
        const socket = new EventEmitter()
        socket.destroy = () => {}
        socket.write = () => queueMicrotask(() => socket.emit('data', Buffer.from('HTTP/1.1 204 No Content\r\n\r\n')))
        queueMicrotask(() => onConnect(socket))
        return socket
      })
      const route = harness({ connection: { isTrusted: (req) => req.headers?.host === 'harness.internal:3080' } })

      // 官方判定拒绝的 Host 即便看起来像 loopback 也不放行。
      const rejected = await call(route, { host: '127.0.0.1:3080' })
      assert.equal(rejected.statusCode, 403)

      // 官方判定认可的 Host 即便不是 loopback 也放行。
      const accepted = await call(route, { host: 'harness.internal:3080' })
      assert.equal(accepted.statusCode, 200)

      // isTrusted 抛错时按不可信处理，不泄露异常细节。
      const throwing = harness({ connection: { isTrusted: () => { throw new Error('boom') } } })
      const failed = await call(throwing, { host: '127.0.0.1:3080' })
      assert.equal(failed.statusCode, 403)
    })

    test('非 GET 方法在 fence 之后仍返回 405', async (t) => {
      t.mock.method(net, 'connect', () => { throw new Error('fence 拒绝后不得探测网关') })
      const route = harness()

      // 可信来源的 POST 落到 handler 内部的方法判定。
      const trustedPost = await call(route, { host: '127.0.0.1:3080' }, 'POST')
      assert.equal(trustedPost.statusCode, 405)

      // 与 opencode 语义一致：fencedRead 只围栏 GET，其余方法由 handler 的方法判定处理
      // （不返回数据，因此不构成读取面）。写路由由 writeMethods 走 assertTrustedWrite。
      const untrustedPost = await call(route, { host: 'evil.example.test:3080' }, 'POST')
      assert.equal(untrustedPost.statusCode, 405)

      // 不可信来源的 GET 才是真正的读取面，必须在进入 handler 前被拒。
      const untrustedGet = await call(route, { host: 'evil.example.test:3080' }, 'GET')
      assert.equal(untrustedGet.statusCode, 403)
    })

    // 缺陷回归：t16 审查发现 F16-1。
    // 真实宿主 ctx.get('connection') 返回 null 时，若空值判定写成 !== undefined，
    // null 会进入官方判定分支读 null.isTrusted，抛 TypeError；该错误没有 statusCode，
    // 被 guard 包成 500，围栏因此失效，还把内部错误文本泄漏给客户端。
    test('无 connection 服务（ctx.get 返回 null）时伪造 Host 返回 403 而非 500', async (t) => {
      t.mock.method(net, 'connect', () => { throw new Error('fence 拒绝后不得探测网关') })

      // 缺省 harness 的 connection 即 null，等价于真实宿主无 connection 服务。
      const route = harness()

      const forged = await call(route, { host: 'evil.example.test:3080', origin: 'http://evil.example.test:3080' })
      assert.equal(forged.statusCode, 403, '无 connection 服务时伪造 Host 必须 403，不能退化为 500')
      assert.equal(forged.body.error.code, 'FORBIDDEN')

      // 不得把内部异常文本回传给客户端。
      const payload = JSON.stringify(forged.body)
      assert.doesNotMatch(payload, /TypeError/)
      assert.doesNotMatch(payload, /Cannot read properties/)
      assert.doesNotMatch(payload, /isTrusted/)

      // 缺失 Host 同样走本地回退、得到 403。
      const noHost = await call(route, {})
      assert.equal(noHost.statusCode, 403)
      assert.equal(noHost.body.error.code, 'FORBIDDEN')

      // 对照组：无 connection 服务时可信 loopback 仍要放行，
      // 证明 403 来自围栏判定本身，而不是把所有请求一律拒掉。
      t.mock.method(net, 'connect', (options, onConnect) => {
        const socket = new EventEmitter()
        socket.destroy = () => {}
        socket.write = () => queueMicrotask(() => socket.emit('data', Buffer.from('HTTP/1.1 204 No Content\r\n\r\n')))
        queueMicrotask(() => onConnect(socket))
        return socket
      })
      const trusted = await call(route, { host: '127.0.0.1:3080' })
      assert.equal(trusted.statusCode, 200, '无 connection 服务时 loopback 必须回退到本地 fence 并放行')
    })
  })

  // -------------------------------------------------------------------------
  // 未配置渠道：数据层不得过滤，且必须与「不可达」区分开。
  // 背景：deepseek-account / workbuddy-global 由运行时注册表注入、baseURL 为空，
  // 展示层曾把「没接入」渲染成「故障」。
  // -------------------------------------------------------------------------
  describe('未配置渠道的状态语义', () => {
    /** 以给定 provider 拓扑启动插件，返回注册的 exact 路由。 */
    function harnessWith({ registered = [], configurable = [], namespaces = [] } = {}) {
      let route
      apply({
        inject: (_, mount) => mount({
          llm: {
            listProviders: () => registered,
            listConfigurableProviders: () => configurable,
          },
          settings: { describe: () => namespaces },
          effect: () => {},
        }),
        effect: (mount) => mount(),
        get: () => null,
        webServer: {
          register: (entry) => { route = entry },
          host: '127.0.0.1',
          protocol: 'http:',
        },
      })
      return route
    }

    async function fetchStatus(route) {
      const response = { setHeader() {}, end(body) { this.body = JSON.parse(body) } }
      // cachedData 是模块级缓存（真实 DSH 每进程只 apply 一次）；同文件里前面的用例
      // 已经填充过缓存，这里显式 refresh=1 走强制探测，保证断言看到的是本次拓扑。
      await route.handler({ method: 'GET', url: '/api/link-pulse/status?refresh=1', headers: { host: '127.0.0.1:3080' } }, response)
      return response
    }

    test('数据层保留全部 provider，未配置项被显式标记且不参与探测', async (t) => {
      // 只要走到探测就会抛错：以此证明未配置项确实没有发起连接尝试。
      const probed = []
      t.mock.method(net, 'connect', (options, onConnect) => {
        probed.push(options.host)
        const socket = new EventEmitter()
        socket.destroy = () => {}
        socket.write = () => queueMicrotask(() => socket.emit('data', Buffer.from('HTTP/1.1 204 No Content\r\n\r\n')))
        queueMicrotask(() => onConnect(socket))
        return socket
      })

      // 三个 provider：都来自运行时注册表且没有 baseURL。
      const route = harnessWith({
        registered: [
          { id: 'cpa-like', name: 'CPA' },
          { id: 'deepseek-account', name: 'DeepSeek Account' },
          { id: 'workbuddy-global', name: 'WorkBuddy Global' },
        ],
      })

      const response = await fetchStatus(route)
      assert.equal(response.statusCode, 200)

      // 数据层完整性：未配置项仍在 providers / providerMap 里（排查要看全量）。
      const ids = response.body.providers.map((p) => p.id)
      assert.ok(ids.includes('deepseek-account'), '未配置项必须保留在数据层')
      assert.ok(ids.includes('workbuddy-global'), '未配置项必须保留在数据层')
      assert.ok(response.body.providerMap['deepseek-account'], 'providerMap 同样不能缺少未配置项')

      // 显式标记：configured=false 是展示层区分「没配」与「坏了」的唯一依据。
      assert.equal(response.body.providerMap['deepseek-account'].configured, false)
      assert.equal(response.body.providerMap['workbuddy-global'].configured, false)
      // 没有 baseURL 的注册项同样视为未配置——它并不因为「注册过」就有网关。
      assert.equal(response.body.providerMap['cpa-like'].configured, false)

      // 未配置项的形状与 no_url 分支一致，但不会真的发起连接。
      const unconfigured = response.body.providerMap['deepseek-account']
      assert.equal(unconfigured.baseURL, '')
      assert.equal(unconfigured.probe.status, 'no_url')
      assert.equal(unconfigured.probe.latencyMs, -1)

      // 只有配置了网关的 provider 走了探测。
      assert.equal(probed.length, 0, '三个 provider 都没有 baseURL 之外的探测来源，不应发起连接')
    })

    test('未配置与不可达可区分：同一次响应里两种状态并存且字段不同', async (t) => {
      // 网关 A 连接成功（可达），网关 B 连接失败（不可达），C 未配置。
      const connectHosts = []
      t.mock.method(net, 'connect', (options, onConnect) => {
        connectHosts.push(options.host)
        const socket = new EventEmitter()
        socket.destroy = () => {}
        socket.write = () => {
          if (options.host === 'down.example') {
            queueMicrotask(() => socket.emit('error', new Error('ECONNREFUSED')))
            return
          }
          queueMicrotask(() => socket.emit('data', Buffer.from('HTTP/1.1 204 No Content\r\n\r\n')))
        }
        queueMicrotask(() => onConnect(socket))
        return socket
      })

      const route = harnessWith({
        registered: [
          { id: 'upstream-up', name: 'Upstream Up' },
          { id: 'upstream-down', name: 'Upstream Down' },
          { id: 'unconfigured-one', name: 'Unconfigured One' },
        ],
        configurable: [],
        namespaces: [
          {
            ns: 'llm-pi-ai',
            value: {
              providers: {
                'upstream-up': { baseURL: 'http://up.example' },
                'upstream-down': { baseURL: 'http://down.example' },
                'unconfigured-one': {},
              },
            },
          },
        ],
      })

      const response = await fetchStatus(route)
      assert.equal(response.statusCode, 200)

      const up = response.body.providerMap['upstream-up']
      const down = response.body.providerMap['upstream-down']
      const unconfigured = response.body.providerMap['unconfigured-one']

      // 可达：有正延迟。
      assert.ok(up.probe.latencyMs > 0, '可达项必须有正延迟')
      assert.equal(up.configured, true)

      // 不可达：有 baseURL、探针失败、reachable=false —— 与未配置形状不同。
      assert.equal(down.configured, true, '不可达项仍然是已配置渠道')
      assert.equal(down.probe.reachable, false)
      assert.equal(down.configured, true)
      assert.notEqual(down.baseURL, '')

      // 未配置：无 baseURL、configured=false —— 与不可达不是同一个东西。
      assert.equal(unconfigured.configured, false)
      assert.equal(unconfigured.baseURL, '')

      // 关键区分点：不可达有地址且探过（reachable===false），未配置压根没有地址。
      assert.notEqual(down.probe.reachable, unconfigured.probe.reachable)
      assert.equal(unconfigured.probe.reachable, undefined)

      // 只探测了两个有地址的网关，未配置项没有连接尝试。
      assert.deepEqual(connectHosts.sort(), ['down.example', 'up.example'])
    })
  })

  // -------------------------------------------------------------------------
  // 展示层三态：client.js 的纯函数直接在 vm 沙箱里加载验证。
  // 这里不渲染 React 树，只断言「未配置」「不可达」「正常」三种状态的
  // 文案与颜色互不重叠——这正是本轮修复的核心。
  // -------------------------------------------------------------------------
  describe('展示层的未配置 / 不可达 / 正常三态', () => {
    // 与 client.js 中 T 的取值保持一致：这些是 CSS 变量字符串，不是 'ok'/'err' 之类的别名。
    const T = {
      ok: 'var(--dsw-alias-state-success-primary, #22c55e)',
      warn: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
      err: 'var(--dsw-alias-state-error-primary, #ef4444)',
      secondary: 'var(--dsw-alias-label-secondary, #71717a)',
    }

    const display = loadDisplay()

    // 三态输入：未配置（无 baseURL）/ 不可达（有 baseURL、探针失败）/ 正常（有 RTT）。
    const unconfigured = { id: 'deepseek-account', baseURL: '', probe: { latencyMs: -1, status: 'no_url', quality: 'offline' } }
    const unreachable = { id: 'down', baseURL: 'https://down.example', probe: { latencyMs: -1, quality: 'error', reachable: false } }
    const healthy = { id: 'up', baseURL: 'https://up.example', probe: { latencyMs: 88, quality: 'excellent', reachable: true } }

    test('providerState 正确区分三态', () => {
      assert.equal(display.providerState(unconfigured), 'unconfigured')
      assert.equal(display.providerState(unreachable), 'unreachable')
      assert.equal(display.providerState(healthy), 'ok')
      // 数据还没到时既不是未配置也不是故障。
      assert.equal(display.providerState(null), 'pending')
      assert.equal(display.providerState({ baseURL: 'https://x.example', probe: null }), 'pending')
    })

    test('未配置与不可达的文案完全不同，且不复用「网关未知」', () => {
      const unconfiguredLabel = display.probeLabel(unconfigured)
      const unreachableLabel = display.probeLabel(unreachable)

      assert.equal(unconfiguredLabel, '未配置')
      assert.equal(unreachableLabel, '不可达')
      assert.notEqual(unconfiguredLabel, unreachableLabel, '两种状态不得共用同一文案')

      // 「网关未知」这个历史上混淆两者的兜底必须彻底消失。
      for (const label of [unconfiguredLabel, unreachableLabel, display.activeProbeLabel(unconfigured)]) {
        assert.doesNotMatch(String(label), /网关未知/)
      }

      // 正常项照旧显示延迟。
      assert.equal(display.probeLabel(healthy), '88 ms')
      assert.equal(display.qualityCaption(healthy), '极佳')

      // 次级说明行：未配置说明缺什么，而不是留空或写「未知」。
      assert.equal(display.providerGatewayLine(unconfigured), '未配置网关地址')
      assert.equal(display.providerGatewayLine(unreachable), 'https://down.example')
      assert.equal(display.qualityCaption(unconfigured), '未配置')
      assert.equal(display.qualityCaption(unreachable), '不可达')
    })

    test('未配置项使用中性色，不落进错误红', () => {
      // T.err 是故障红；未配置绝不能用它，否则视觉上等同「坏了」。
      assert.notEqual(display.stateColor(unconfigured), T.err)
      assert.equal(display.stateColor(unconfigured), T.secondary)
      assert.equal(display.stateColor(unreachable), T.err, '真正不可达才用红色')
      assert.equal(display.stateColor(healthy), T.ok, '正常项保持质量色')
    })

    test('主列表默认隐藏未配置项，但数据仍完整保留在拆分结果里', () => {
      const data = {
        providers: [healthy, unreachable, unconfigured, { id: 'another-blank', baseURL: '', probe: null }],
      }
      const split = display.splitOtherProviders(data, healthy.id)

      // 主列表：只有已接入且能探测的渠道。
      assert.deepEqual(split.shown.map((p) => p.id), ['down'])
      assert.equal(split.shown.some((p) => p.id === 'deepseek-account'), false, '未配置项不得出现在主列表')

      // 次级区：未配置项一个不少，供折叠展示与排查。
      assert.deepEqual(split.unconfigured.map((p) => p.id), ['deepseek-account', 'another-blank'])

      // 拆分不丢数据：shown + unconfigured 恰好等于除当前项外的全部。
      const total = split.shown.length + split.unconfigured.length
      assert.equal(total, data.providers.length - 1)
    })

    test('当前会话选中未配置渠道时给出可读提示，而不是红色故障态', () => {
      // 主条目文案换成「该渠道未配置」，不显示「不可达」或「网关未知」。
      assert.equal(display.activeProbeLabel(unconfigured), '该渠道未配置')
      assert.doesNotMatch(display.activeProbeLabel(unconfigured), /网关未知|不可达/)

      // 颜色是中性色而非错误红。
      assert.notEqual(display.stateColor(unconfigured), T.err)

      // 对照：选中一个真正不可达的渠道时，仍要如实显示故障。
      assert.equal(display.activeProbeLabel(unreachable), '不可达')
      assert.equal(display.stateColor(unreachable), T.err)
    })
  })

  // -------------------------------------------------------------------------
  // 折叠 rail 的悬停卡片：rail 只有约 56px 宽，布局列 .sidebarCol 又是
  // overflow: hidden，沿用 left:0/right:0 的绝对定位会被挤成窄带并裁掉。
  // 折叠态改为 fixed + 触发器实测矩形；宽态保持原有绝对定位不变。
  // -------------------------------------------------------------------------
  describe('折叠 rail 的悬停卡片定位', () => {
    const place = loadDisplay().hoverCardPlacement

    test('按触发器矩形算出 fixed 坐标，卡片宽度足以阅读', () => {
      // 典型 rail：图标在栏内、靠近窗口底部。
      const placement = place({ left: 10, top: 720 }, 1280, 800)

      assert.equal(placement.position, 'fixed', '折叠态必须脱离被 overflow 裁切的绝对定位')
      assert.equal(placement.width, 236)
      assert.equal(placement.left, 10)
      // 底边落在触发器上方 6px：800 - 720 + 6。
      assert.equal(placement.bottom, 86)
      assert.equal('right' in placement, false, 'fixed 坐标不能带 right，否则留下矛盾约束')
      assert.equal(placement.maxWidth, 'calc(100vw - 16px)')
    })

    test('靠近视口边缘时整块夹回视口内', () => {
      // 右侧放不下：left 退到 1280 - 236 - 8。
      assert.equal(place({ left: 1100, top: 700 }, 1280, 800).left, 1036)
      // 极窄视口：不越过左边距。
      assert.equal(place({ left: 2, top: 700 }, 200, 800).left, 8)
      // 触发器贴近顶部：bottom 不越过视口上边距。
      assert.equal(place({ left: 10, top: 4 }, 1280, 800).bottom, 792)
      // 视口尺寸未知时仍给出可用的左/下界，不产生 NaN。
      const unknown = place({ left: 10, top: 720 })
      assert.equal(unknown.left, 10)
      assert.equal(unknown.bottom, 8)
    })

    test('量不到触发器矩形时不返回坐标，避免渲染被裁切的卡片', () => {
      assert.equal(place(null, 1280, 800), null)
      assert.equal(place(undefined, 1280, 800), null)
    })

    test('client 把实测坐标接到卡片上，宽态定位与悬停行为保持不变', () => {
      const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

      // 触发器挂了 ref，折叠态才有东西可量。
      assert.match(source, /ref:\s*triggerRef/)
      assert.match(source, /getBoundingClientRect/)
      // 折叠态坐标写进卡片 style。
      assert.match(source, /\.\.\.cardPlacement/)
      // 宽态仍是原来的四条绝对定位属性（left/right 0 + calc(100% + 6px)）。
      assert.match(
        source,
        /position:\s*'absolute',\s*\n\s*left:\s*0,\s*\n\s*right:\s*0,\s*\n\s*bottom:\s*'calc\(100% \+ 6px\)',/,
      )
      // 悬停行为不变：220ms 延时、面板打开不显示、移出立即收起。
      assert.match(source, /setTimeout\(\(\) => setHovering\(true\), 220\)/)
      assert.match(source, /if \(!hovering \|\| state\.open\) return node/)
      assert.match(source, /clearTimeout\(hoverTimerRef\.current\)\s*\n\s*setHovering\(false\)/)
      // 折叠/展开切换要重量：定位 effect 依赖 hovering 与 isFolded。
      assert.match(source, /\}, \[hovering, isFolded\]\)/)
    })
  })
})
