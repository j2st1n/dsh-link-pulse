window.__ModuleLoader__.load({
  id: 'dsh-link-pulse',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState, useCallback, useMemo } = React

    let globalCtx = null

    const T = {
      bg: 'var(--dsw-alias-bg-layer-2, #ffffff)',
      layer: 'var(--dsw-alias-bg-layer-2, #ffffff)',
      layer1: 'var(--dsw-alias-bg-layer-1, #f4f4f5)',
      border: 'var(--dsw-alias-border-l1, rgba(0,0,0,.1))',
      border2: 'var(--dsw-alias-border-l2, rgba(0,0,0,.15))',
      label: 'var(--dsw-alias-label-primary, #18181b)',
      secondary: 'var(--dsw-alias-label-secondary, #71717a)',
      brand: 'var(--dsw-alias-brand-primary, #3b82f6)',
      ok: 'var(--dsw-alias-state-success-primary, #22c55e)',
      warn: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
      err: 'var(--dsw-alias-state-error-primary, #ef4444)',
    }

    const CSS = `
      @keyframes pulseFadeSlideUp { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
      @keyframes pulseFadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
      @keyframes pulseSpin { to { transform: rotate(360deg) } }
      @keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,.45) } 70% { box-shadow: 0 0 0 5px rgba(34,197,94,0) } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0) } }
      
      .pulse-panel-enter { animation: pulseFadeSlideUp .2s cubic-bezier(.2,.9,.3,1.2) both }
      .pulse-btn { min-width: 0; transition: background .15s ease, border-color .15s ease, color .15s ease, transform .1s ease, opacity .15s ease }
      .pulse-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-1)); border-color: var(--dsw-alias-border-l2) }
      .pulse-btn:active:not(:disabled) { transform: scale(.97) }
      .pulse-dot-live { animation: pulseGlow 2.4s ease-out infinite }
      .pulse-spin { display: inline-block; animation: pulseSpin .8s linear infinite }
    `

    const dotStyle = (color) => ({
      display: 'inline-block',
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
      verticalAlign: 'middle',
    })

    const btnBase = {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px',
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      background: 'transparent',
      color: T.label,
      fontSize: 12,
      lineHeight: '18px',
      height: 28,
      boxSizing: 'border-box',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }

    // ---------- 全局单例共享状态（网络延迟数据） ----------
    const store = {
      state: {
        data: null,
        loading: false,
        open: false,
      },
      listeners: new Set(),
      set(patch) {
        store.state = { ...store.state, ...patch }
        for (const fn of store.listeners) fn()
      },
      subscribe(fn) {
        store.listeners.add(fn)
        return () => store.listeners.delete(fn)
      },
    }

    function useStore() {
      return React.useSyncExternalStore(store.subscribe, () => store.state)
    }

    async function fetchStatus(force = false) {
      if (store.state.loading && !force) return
      try {
        store.set({ loading: true })
        const res = await fetch(`/api/link-pulse/status${force ? '?refresh=1' : ''}`)
        if (res.ok) {
          const json = await res.json()
          store.set({ data: json, loading: false })
        } else {
          store.set({ loading: false })
        }
      } catch {
        store.set({ loading: false })
      }
    }

    function getQualityColor(quality, latencyMs) {
      if (quality === 'excellent' || (latencyMs > 0 && latencyMs <= 200)) return T.ok
      if (quality === 'good' || (latencyMs > 200 && latencyMs <= 600)) return T.warn
      return T.err
    }

    // ---------- 渠道三态：未配置 / 不可达 / 正常 ----------
    //
    // 数据层始终返回全部 provider（含未配置项，便于排查），区分只发生在展示层：
    //   unconfigured  没有 baseURL —— 该渠道根本没接入，不是故障；
    //   unreachable   有 baseURL 但探针失败 —— 这才是真正的故障/不可达；
    //   ok            探针拿到 RTT。
    // 之前两者共用「网关未知」兜底并按 offline 染红，把「没配」误呈现成「坏了」。
    function providerState(provider) {
      if (!provider) return 'pending'
      if (!provider.baseURL) return 'unconfigured'
      if (!provider.probe) return 'pending'
      if (provider.probe.reachable === false) return 'unreachable'
      return provider.probe.latencyMs > 0 ? 'ok' : 'unreachable'
    }

    /** 未配置项一律用中性色（次要文字色），绝不复用错误红。 */
    function stateColor(provider) {
      const state = providerState(provider)
      if (state === 'unconfigured' || state === 'pending') return T.secondary
      return getQualityColor(provider?.probe?.quality, provider?.probe?.latencyMs)
    }

    /** 次级说明行：未配置不再显示空白或「未知」，而是明确说明缺什么。 */
    function providerGatewayLine(provider) {
      if (providerState(provider) === 'unconfigured') return '未配置网关地址'
      return provider?.baseURL || ''
    }

    /** 质量副标题：未配置不再落进「不可达」。 */
    function qualityCaption(provider) {
      const state = providerState(provider)
      if (state === 'unconfigured') return '未配置'
      if (state === 'pending') return '探测中'
      const lat = provider?.probe?.latencyMs ?? -1
      if (lat <= 0) return '不可达'
      return lat < 200 ? '极佳' : '良好'
    }

    function probeLabel(provider) {
      const state = providerState(provider)
      if (state === 'unconfigured') return '未配置'
      if (state === 'pending') return '探测中'
      if (provider?.probe?.quality === 'timeout') return '超时'
      return provider?.probe?.latencyMs > 0 ? `${provider.probe.latencyMs} ms` : '不可达'
    }

    /** 当前会话选中的渠道：未配置时给出可读提示，而不是红色故障态。 */
    function activeProbeLabel(provider) {
      if (providerState(provider) === 'unconfigured') return '该渠道未配置'
      return probeLabel(provider)
    }

    function activeProvider(data, providerId) {
      if (!data) return null
      if (data.providerMap && Object.hasOwn(data.providerMap, providerId)) return data.providerMap[providerId]
      return data.providers?.find((provider) => provider.id === providerId)
        ?? { id: providerId, name: providerId.toUpperCase(), baseURL: '', probe: null }
    }

    /** 主列表只展示已接入的渠道；未配置项收进次级折叠区，不参与主链路对比。 */
    function splitOtherProviders(data, activeId) {
      const others = (data?.providers || []).filter((p) => p.id !== activeId)
      return {
        shown: others.filter((p) => providerState(p) !== 'unconfigured'),
        unconfigured: others.filter((p) => providerState(p) === 'unconfigured'),
      }
    }

    function formatModelShortName(modelId) {
      // 展示完整的 provider-owned model ID，不做 GPT/Gemini/Claude 等简称映射。
      return modelId || 'Auto'
    }

    /**
     * 权威实时抓取：直接从 DSH 官方 sessions 与 modelDirectories 服务订阅当前正在对话的模型与供应商
     */
    function useCurrentActiveModel(defaultConfig) {
      const [selection, setSelection] = useState(() => ({
        provider: defaultConfig?.provider || '',
        model: defaultConfig?.model || '',
      }))

      // 后端状态异步到达时，用实际配置补齐初始选择；不再硬编码 CPA/Gemini。
      useEffect(() => {
        if (!defaultConfig?.provider || !defaultConfig?.model) return
        setSelection((current) => current?.provider && current?.model ? current : {
          provider: defaultConfig.provider,
          model: defaultConfig.model,
        })
      }, [defaultConfig?.provider, defaultConfig?.model])

      useEffect(() => {
        if (!globalCtx) return

        const getSessions = () => (globalCtx.get ? globalCtx.get('sessions') : globalCtx.sessions)
        const getModelDirs = () => (globalCtx.get ? globalCtx.get('modelDirectories') : globalCtx.modelDirectories)
        const getUiSession = () => (globalCtx.get ? globalCtx.get('uiSession') : globalCtx.uiSession)

        let dirUnsub = null
        let observedSessionId = null

        const getCurrentSessionId = (sessions) => {
          // uiSession 是 DSH 官方“主视图当前会话”状态源；其 current 快照的 key 为 SessionId。
          const uiSession = getUiSession()
          const uiSnapshot = uiSession?.current?.getSnapshot?.()
          if (uiSnapshot?.key) return uiSnapshot.key

          // 兼容没有 uiSession 的宿主：选择当前仍由 mainView 保留的会话。
          const list = sessions?.list?.getSnapshot?.()
          const byId = list?.byId || {}
          return Object.values(byId).find((item) => (item?.retainedBy?.mainView || 0) > 0)?.id || null
        }

        const sync = () => {
          try {
            const sessions = getSessions()
            const modelDirs = getModelDirs()
            if (!sessions || !modelDirs) return

            const curSessionId = getCurrentSessionId(sessions)
            if (!curSessionId) return

            if (curSessionId !== observedSessionId) {
              if (dirUnsub) dirUnsub()
              observedSessionId = curSessionId
              const dir = modelDirs.directoryFor?.(curSessionId)
              if (!dir) return

              dirUnsub = dir.store?.subscribe ? dir.store.subscribe(applyDirectorySnapshot) : null

              function applyDirectorySnapshot() {
                const snap = dir.store?.getSnapshot?.()
                if (snap?.current?.provider && snap?.current?.model) {
                  setSelection({
                    provider: snap.current.provider,
                    model: snap.current.model,
                    reasoningEffort: snap.current.reasoningEffort,
                  })
                }
              }

              applyDirectorySnapshot()
            }
          } catch {}
        }

        sync()

        const sessions = getSessions()
        const unsubSessions = sessions?.list?.subscribe ? sessions.list.subscribe(sync) : null
        const uiSession = getUiSession()
        const unsubCurrent = uiSession?.current?.subscribe ? uiSession.current.subscribe(sync) : null

        return () => {
          if (unsubSessions) unsubSessions()
          if (unsubCurrent) unsubCurrent()
          if (dirUnsub) dirUnsub()
        }
      }, [defaultConfig])

      return selection
    }

    function FooterEntry(props) {
      const { wide } = props
      const state = useStore()
      const [hovering, setHovering] = useState(false)
      const hoverTimerRef = React.useRef(null)

      useEffect(() => {
        fetchStatus(false)
        const timer = setInterval(() => fetchStatus(false), 45_000)
        return () => clearInterval(timer)
      }, [])

      const data = state.data
      const defaultModelConfig = data?.defaultModelConfig
      const activeSelection = useCurrentActiveModel(defaultModelConfig)

      const providerId = activeSelection.provider || defaultModelConfig?.provider || ''
      const activeProviderInfo = useMemo(() => activeProvider(data, providerId), [data, providerId])

      const currentLatency = activeProviderInfo?.probe?.latencyMs ?? -1
      const currentQuality = activeProviderInfo?.probe?.quality || 'offline'
      // 未配置的当前渠道用中性色，不能因为 offline 就染成故障红。
      const statusColor = stateColor(activeProviderInfo)
      const providerDisplayName = activeProviderInfo?.name || activeSelection.provider.toUpperCase()
      const modelShortName = formatModelShortName(activeSelection.model)

      const onMouseEnter = useCallback(() => {
        clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = setTimeout(() => setHovering(true), 220)
      }, [])
      const onMouseLeave = useCallback(() => {
        clearTimeout(hoverTimerRef.current)
        setHovering(false)
      }, [])

      // 主列表不含未配置渠道；未配置项只在展开面板的次级区提及。
      const otherProviderSplit = splitOtherProviders(data, activeProviderInfo?.id)
      const otherProviders = otherProviderSplit.shown

      const segments = [
        { text: providerDisplayName, color: T.label, bold: true },
        { text: modelShortName, color: T.secondary },
        { text: activeProbeLabel(activeProviderInfo), color: statusColor, bold: true },
      ]

      const node = h(
        'button',
        {
          className: 'pulse-btn',
          onClick: () => store.set({ open: !state.open }),
          onMouseEnter: onMouseEnter,
          onMouseLeave: onMouseLeave,
          style: {
            ...btnBase,
            width: '100%',
            justifyContent: wide ? 'flex-start' : 'center',
            borderColor: state.open ? T.brand : T.border,
            background: state.open ? 'var(--dsw-alias-interactive-bg-hover, rgba(59,130,246,.12))' : 'transparent',
          },
        },
        h('span', {
          className: statusColor === T.ok ? 'pulse-dot-live' : undefined,
          style: dotStyle(statusColor),
        }),
        wide &&
          h(
            'span',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: '18px',
                whiteSpace: 'nowrap',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
            },
            segments.flatMap((s, i) =>
              i === 0
                ? [h('span', { key: `s${i}`, style: { color: s.color, fontWeight: 500, flexShrink: 0 } }, s.text)]
                : [
                    h('span', { key: `sep${i}`, style: { color: T.secondary, margin: '0 5px', opacity: 0.7, flexShrink: 0 } }, '·'),
                    h(
                      'span',
                      {
                        key: `s${i}`,
                        style: {
                          color: s.color,
                          fontWeight: s.bold ? 500 : undefined,
                          fontVariantNumeric: 'tabular-nums',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flexShrink: i === segments.length - 1 ? 0 : 1,
                        },
                      },
                      s.text,
                    ),
                  ],
            ),
          ),
      )

      if (!hovering || state.open) return node

      return h(
        'div',
        {
          style: { position: 'relative', width: '100%' },
          onMouseEnter: onMouseEnter,
          onMouseLeave: onMouseLeave,
        },
        node,
        h(
          'div',
          {
            className: 'pulse-panel-enter',
            style: {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 'calc(100% + 6px)',
              background: T.bg,
              border: `1px solid ${T.border2}`,
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,.18)',
              padding: '10px 12px',
              fontSize: '11px',
              lineHeight: '17px',
              color: T.label,
              whiteSpace: 'pre',
              zIndex: 100,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            },
          },
          h('div', { style: { fontWeight: 600, fontSize: '12px', marginBottom: 4 } }, `🎯 ${activeSelection.model}`),
          h('div', { style: { color: T.secondary } }, `🏢 ${providerDisplayName}`),
          h(
            'div',
            {
              style: {
                color: statusColor,
                fontWeight: 600,
                marginTop: 2,
                marginBottom: otherProviders.length > 0 ? 6 : 0,
              },
            },
            `⚡ ${activeProbeLabel(activeProviderInfo)}`,
          ),
          otherProviders.length > 0 &&
            h(
              'div',
              {
                style: {
                  borderTop: `1px dashed ${T.border}`,
                  paddingTop: 6,
                  color: T.secondary,
                },
              },
              '🌐 其它 Provider 链路',
            ),
          otherProviders.map((p, i) =>
            h(
              'div',
              {
                key: i,
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                },
              },
              h(
                'span',
                { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                h('span', {
                  style: {
                    ...dotStyle(stateColor(p)),
                    width: 5,
                    height: 5,
                  },
                }),
                p.name,
              ),
              h(
                'span',
                {
                  style: {
                    color: stateColor(p),
                    fontWeight: 600,
                  },
                },
                probeLabel(p),
              ),
            ),
          ),
        ),
      )
    }

    function OverlayPanel() {
      const state = useStore()
      const isOpen = state.open
      const data = state.data
      const loading = state.loading

      const defaultModelConfig = data?.defaultModelConfig
      const activeSelection = useCurrentActiveModel(defaultModelConfig)

      const providerId = activeSelection.provider || defaultModelConfig?.provider || ''
      const activeProviderInfo = useMemo(() => activeProvider(data, providerId), [data, providerId])

      if (!isOpen) return null

      const currentLatency = activeProviderInfo?.probe?.latencyMs ?? -1
      const currentQuality = activeProviderInfo?.probe?.quality || 'offline'
      const statusColor = stateColor(activeProviderInfo)
      const otherProviderSplit = splitOtherProviders(data, activeProviderInfo?.id)
      const otherProviders = otherProviderSplit.shown
      const unconfiguredProviders = otherProviderSplit.unconfigured
      const providerDisplayName = activeProviderInfo?.name || activeSelection.provider.toUpperCase()

      return h(
        'div',
        {
          style: {
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.45)',
            backdropFilter: 'blur(4px)',
          },
          onClick: (e) => {
            if (e.target === e.currentTarget) store.set({ open: false })
          },
        },
        h(
          'div',
          {
            className: 'pulse-panel-enter',
            style: {
              width: '92%',
              maxWidth: '540px',
              background: T.bg,
              border: `1px solid ${T.border2}`,
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,.25)',
              color: T.label,
              overflow: 'hidden',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            },
          },
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: `1px solid ${T.border}`,
              },
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
              h('span', { style: { fontSize: '20px' } }, '📡'),
              h(
                'div',
                null,
                h('div', { style: { fontSize: '15px', fontWeight: 600 } }, '模型链路与上游延迟脉搏'),
                h(
                  'div',
                  { style: { fontSize: '11px', color: T.secondary } },
                  '实时订阅当前对话供应商与模型状态',
                ),
              ),
            ),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(
                'button',
                {
                  className: 'pulse-btn',
                  onClick: () => fetchStatus(true),
                  disabled: loading,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${T.border}`,
                    background: 'transparent',
                    color: T.label,
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  },
                },
                loading ? h('span', { className: 'pulse-spin' }, '⚡') : '⚡ 立即测速',
              ),
              h(
                'button',
                {
                  className: 'pulse-btn',
                  onClick: () => store.set({ open: false }),
                  style: {
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: `1px solid ${T.border}`,
                    background: 'transparent',
                    color: T.secondary,
                    fontSize: '14px',
                    cursor: 'pointer',
                  },
                },
                '✕',
              ),
            ),
          ),
          h(
            'div',
            {
              style: {
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              },
            },
            h(
              'div',
              {
                style: {
                  background: T.layer1,
                  border: `1px solid ${T.border}`,
                  borderRadius: '12px',
                  padding: '14px 16px',
                },
              },
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                  h('span', { style: dotStyle(statusColor) }),
                  h('span', { style: { fontWeight: 600, fontSize: '14px' } }, activeSelection.model),
                  h(
                    'span',
                    {
                      style: {
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(59,130,246,.15)',
                        color: T.brand,
                        fontWeight: 600,
                      },
                    },
                    `供应商: ${providerDisplayName}`,
                  ),
                ),
                h(
                  'span',
                  {
                    style: {
                      fontSize: '16px',
                      fontWeight: 700,
                      color: statusColor,
                    },
                  },
                  activeProbeLabel(activeProviderInfo),
                ),
              ),
              h(
                'div',
                { style: { fontSize: '11px', color: T.secondary, wordBreak: 'break-all' } },
                // 当前渠道未配置时明确说明原因，而不是留一个「网关：未知」的空洞。
                providerState(activeProviderInfo) === 'unconfigured'
                  ? '网关：未配置（该渠道尚未接入，无可用网络地址）'
                  : `网关：${activeProviderInfo?.baseURL || '未知'}`,
              ),
            ),
            h(
              'div',
              {
                style: {
                  background: T.layer1,
                  border: `1px solid ${T.border}`,
                  borderRadius: '12px',
                  padding: '14px 16px',
                },
              },
              h(
                'div',
                {
                  style: {
                    fontSize: '12px',
                    fontWeight: 600,
                    color: T.secondary,
                    marginBottom: '10px',
                  },
                },
                '🌐 其它可用 Provider 链路测速',
              ),
              (() => {
                if (otherProviders.length === 0) {
                  return h(
                    'div',
                    {
                      style: {
                        fontSize: '11px',
                        color: T.secondary,
                        textAlign: 'center',
                        padding: '12px 0',
                      },
                    },
                    '暂无其它已接入的 Provider',
                  )
                }

                return h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                  otherProviders.map((p, idx) => {
                    const col = stateColor(p)

                    return h(
                      'div',
                      {
                        key: idx,
                        style: {
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: 'rgba(0,0,0,.03)',
                          border: `1px solid transparent`,
                        },
                      },
                      h(
                        'div',
                        null,
                        h(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                          h('span', { style: dotStyle(col) }),
                          h('span', { style: { fontWeight: 600, fontSize: '12px' } }, p.name),
                        ),
                        h(
                          'div',
                          { style: { fontSize: '10px', color: T.secondary, marginTop: '2px' } },
                          providerGatewayLine(p),
                        ),
                      ),
                      h(
                        'div',
                        { style: { textAlign: 'right' } },
                        h(
                          'div',
                          { style: { fontWeight: 700, fontSize: '13px', color: col } },
                          probeLabel(p),
                        ),
                        h(
                          'div',
                          { style: { fontSize: '9px', color: T.secondary } },
                          qualityCaption(p),
                        ),
                      ),
                    )
                  }),
                )
              })(),
              // 未配置渠道默认从主列表收起：它们是「没接入」，不是「链路坏了」，
              // 放在测速列表里会污染对比。用次级折叠区保留可发现性，并明确标注。
              unconfiguredProviders.length > 0 &&
                h(
                  'details',
                  {
                    style: {
                      marginTop: '10px',
                      borderTop: `1px dashed ${T.border}`,
                      paddingTop: '8px',
                    },
                  },
                  h(
                    'summary',
                    {
                      style: {
                        fontSize: '11px',
                        color: T.secondary,
                        cursor: 'pointer',
                        listStyle: 'revert',
                      },
                    },
                    `未配置的渠道（${unconfiguredProviders.length}）`,
                  ),
                  h(
                    'div',
                    {
                      style: {
                        marginTop: '8px',
                        fontSize: '11px',
                        color: T.secondary,
                        lineHeight: '17px',
                      },
                    },
                    unconfiguredProviders.map((p, idx) =>
                      h(
                        'div',
                        {
                          key: idx,
                          style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px 2px',
                          },
                        },
                        h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                          h('span', { style: dotStyle(stateColor(p)) }),
                          p.name,
                        ),
                        h('span', null, '未配置'),
                      ),
                    ),
                  ),
                ),
            ),
          ),
        ),
      )
    }

    function apply(ctx) {
      globalCtx = ctx

      ctx.effect(() => {
        const el = document.createElement('style')
        el.id = 'dsh-link-pulse-styles'
        el.textContent = CSS
        document.head.appendChild(el)
        return () => el.remove()
      })

      ctx.effect(() =>
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'link-pulse', order: -10 },
            (props) => h(FooterEntry, props),
          ),
        ),
      )

      ctx.effect(() =>
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'link-pulse-panel', order: 5 },
            () => h(OverlayPanel),
          ),
        ),
      )
    }

    exports.apply = apply
    exports.inject = ['slots', 'sessions', 'modelDirectories', 'uiSession']
    // 展示层纯函数导出：供测试直接验证「未配置 / 不可达 / 正常」三态判定，
    // 不需要在测试里渲染 React 树。
    exports.__display = {
      providerState,
      stateColor,
      probeLabel,
      activeProbeLabel,
      providerGatewayLine,
      qualityCaption,
      splitOtherProviders,
    }
    return module.exports
  },
})
