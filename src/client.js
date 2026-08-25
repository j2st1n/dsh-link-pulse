window.__ModuleLoader__.load({
  id: 'dsh-link-pulse',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState, useCallback, useMemo } = React

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

    let overlayOpen = false
    const listeners = new Set()
    function setOverlay(val) {
      overlayOpen = val
      listeners.forEach((fn) => fn(val))
    }

    function getQualityColor(quality, latencyMs) {
      if (quality === 'excellent' || (latencyMs > 0 && latencyMs <= 200)) return T.ok
      if (quality === 'good' || (latencyMs > 200 && latencyMs <= 600)) return T.warn
      return T.err
    }

    function formatModelShortName(modelId) {
      if (!modelId) return 'Auto'
      const m = modelId.toLowerCase()
      if (m.includes('gemini-3.7') || m.includes('gemini-3-7')) return 'Gemini 3.7'
      if (m.includes('gemini-2.5') || m.includes('gemini-2-5')) return 'Gemini 2.5'
      if (m.includes('deepseek-v4-flash') || m.includes('v4-flash')) return 'V4 Flash'
      if (m.includes('deepseek-v4-pro') || m.includes('v4-pro')) return 'V4 Pro'
      if (m.includes('deepseek-chat')) return 'Chat'
      if (m.includes('deepseek-reasoner')) return 'Reasoner'
      if (m.includes('claude-3-7') || m.includes('claude-3.7')) return 'Claude 3.7'
      if (m.includes('claude-3-5') || m.includes('claude-3.5')) return 'Claude 3.5'
      if (m.includes('gpt-5')) return 'GPT-5.6'
      if (m.includes('gpt-4o')) return 'GPT-4o'
      if (m.includes('qwen3.7') || m.includes('qwen-3.7')) return 'Qwen 3.7'
      if (m.includes('kimi-k3')) return 'Kimi K3'
      if (m.includes('kimi-k2.7')) return 'Kimi K2.7'
      if (m.includes('kimi')) return 'Kimi'
      if (m.includes('minimax-m3')) return 'MiniMax M3'
      if (m.includes('glm-5')) return 'GLM-5'
      return modelId.split(/[-_]/)[0] || modelId
    }

    function useActiveModel(defaultModel) {
      const [activeModel, setActiveModel] = useState(defaultModel || 'gemini-3.7-flash-high')

      useEffect(() => {
        const detectModel = () => {
          try {
            const modelButton = document.querySelector(
              '[data-slot="conversation.input.model"], button[class*="modelSelect"], div[class*="modelSelector"]',
            )
            if (modelButton && modelButton.textContent) {
              let text = modelButton.textContent.trim()
              // 剥离开关/标签 UI 残留，如「default」「推理等级」「high」等
              text = text
                .split(/[\n|·•]/)[0]
                .replace(/\s*(default|推理等级|模型|model)\s*/gi, '')
                .trim()
              if (text && text.length < 30 && /[a-zA-Z0-9\-_.]/.test(text)) {
                setActiveModel(text)
                return
              }
            }
          } catch {}
          if (defaultModel) setActiveModel(defaultModel)
        }

        detectModel()
        const timer = setInterval(detectModel, 3000)
        return () => clearInterval(timer)
      }, [defaultModel])

      return activeModel
    }

    function FooterEntry(props) {
      const { wide } = props
      const [isOpen, setIsOpen] = useState(overlayOpen)
      const [hovering, setHovering] = useState(false)
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(false)
      const hoverTimerRef = React.useRef(null)

      useEffect(() => {
        listeners.add(setIsOpen)
        return () => listeners.delete(setIsOpen)
      }, [])

      const fetchData = useCallback(async () => {
        try {
          setLoading(true)
          const res = await fetch('/api/link-pulse/status')
          if (res.ok) {
            const json = await res.json()
            setData(json)
          }
        } catch {} finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        fetchData()
        const timer = setInterval(fetchData, 45_000)
        return () => clearInterval(timer)
      }, [fetchData])

      const defaultModel = data?.defaultModelConfig?.model || 'gemini-3.7-flash-high'
      const activeModel = useActiveModel(defaultModel)

      const activeProviderInfo = useMemo(() => {
        if (!data || !data.providers) return null
        const map = data.modelToProviderMap || {}
        const pId = map[activeModel.toLowerCase()] || data.defaultModelConfig?.provider || 'cpa'
        return data.providers.find((p) => p.id === pId) || data.providers[0] || null
      }, [data, activeModel])

      const currentLatency = activeProviderInfo?.probe?.latencyMs ?? -1
      const currentQuality = activeProviderInfo?.probe?.quality || 'offline'
      const statusColor = getQualityColor(currentQuality, currentLatency)
      const providerDisplayName = activeProviderInfo?.name || 'CPA'
      const modelShortName = formatModelShortName(activeModel)

      const onMouseEnter = useCallback(() => {
        clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = setTimeout(() => setHovering(true), 220)
      }, [])
      const onMouseLeave = useCallback(() => {
        clearTimeout(hoverTimerRef.current)
        setHovering(false)
      }, [])

      const node = h(
        'button',
        {
          className: 'pulse-btn',
          onClick: () => setOverlay(!isOpen),
          onMouseEnter: onMouseEnter,
          onMouseLeave: onMouseLeave,
          style: {
            ...btnBase,
            width: '100%',
            justifyContent: wide ? 'flex-start' : 'center',
            borderColor: isOpen ? T.brand : T.border,
            background: isOpen ? 'var(--dsw-alias-interactive-bg-hover, rgba(59,130,246,.12))' : 'transparent',
          },
        },
        h('span', {
          className: statusColor === T.ok ? 'pulse-dot-live' : undefined,
          style: dotStyle(statusColor),
        }),
        wide &&
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flex: 1,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              },
            },
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              },
              h('span', { style: { fontWeight: 500, color: T.label } }, providerDisplayName),
              h('span', { style: { color: T.secondary } }, '·'),
              h('span', { style: { color: T.secondary, overflow: 'hidden', textOverflow: 'ellipsis' } }, modelShortName),
            ),
            h(
              'span',
              {
                style: {
                  fontSize: 11,
                  fontWeight: 600,
                  color: statusColor,
                  marginLeft: 6,
                  flexShrink: 0,
                },
              },
              currentLatency > 0 ? `${currentLatency}ms` : '探测中',
            ),
          ),
      )

      if (!hovering || isOpen) return node

      const providers = data?.providers || []
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
              z: 100,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            },
          },
          h('div', { style: { fontWeight: 600, fontSize: '12px', marginBottom: 4 } }, `🎯 ${activeModel}`),
          h('div', { style: { color: T.secondary } }, `🏢 ${providerDisplayName}`),
          h(
            'div',
            {
              style: {
                color: statusColor,
                fontWeight: 600,
                marginTop: 2,
                marginBottom: 6,
              },
            },
            `⚡ ${currentLatency > 0 ? currentLatency + ' ms' : '检测中'}`,
          ),
          h(
            'div',
            {
              style: {
                borderTop: `1px dashed ${T.border}`,
                paddingTop: 6,
                color: T.secondary,
              },
            },
            '🌐 Provider 链路一览',
          ),
          providers.map((p, i) =>
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
                h('span', { style: { ...dotStyle(getQualityColor(p.probe?.quality, p.probe?.latencyMs)), width: 5, height: 5 } }),
                p.name,
              ),
              h(
                'span',
                {
                  style: {
                    color: getQualityColor(p.probe?.quality, p.probe?.latencyMs),
                    fontWeight: 600,
                  },
                },
                p.probe?.latencyMs > 0 ? `${p.probe.latencyMs} ms` : '离线',
              ),
            ),
          ),
        ),
      )
    }

    function OverlayPanel() {
      const [isOpen, setIsOpen] = useState(overlayOpen)
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(false)

      useEffect(() => {
        listeners.add(setIsOpen)
        return () => listeners.delete(setIsOpen)
      }, [])

      const fetchData = useCallback(async () => {
        try {
          setLoading(true)
          const res = await fetch('/api/link-pulse/status')
          if (res.ok) {
            const json = await res.json()
            setData(json)
          }
        } catch {} finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        if (isOpen) fetchData()
      }, [isOpen, fetchData])

      const defaultModel = data?.defaultModelConfig?.model || 'gemini-3.7-flash-high'
      const activeModel = useActiveModel(defaultModel)

      const activeProviderInfo = useMemo(() => {
        if (!data || !data.providers) return null
        const map = data.modelToProviderMap || {}
        const pId = map[activeModel.toLowerCase()] || data.defaultModelConfig?.provider || 'cpa'
        return data.providers.find((p) => p.id === pId) || data.providers[0] || null
      }, [data, activeModel])

      if (!isOpen) return null

      const providers = data?.providers || []
      const currentLatency = activeProviderInfo?.probe?.latencyMs ?? -1
      const currentQuality = activeProviderInfo?.probe?.quality || 'offline'
      const statusColor = getQualityColor(currentQuality, currentLatency)

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
            if (e.target === e.currentTarget) setOverlay(false)
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
                  '仅探测本机实际接入的 LLM Provider 网关',
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
                  onClick: fetchData,
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
                  onClick: () => setOverlay(false),
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
                  h('span', { style: { fontWeight: 600, fontSize: '14px' } }, activeModel),
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
                    `供应商: ${activeProviderInfo?.name || 'CPA'}`,
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
                  currentLatency > 0 ? `${currentLatency} ms` : '检测中',
                ),
              ),
              h(
                'div',
                { style: { fontSize: '11px', color: T.secondary, wordBreak: 'break-all' } },
                `网关端点: ${activeProviderInfo?.baseURL || '系统内置直连通道'}`,
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
                '🌐 已接入 Provider 链路测速对比',
              ),
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                providers.map((p, idx) => {
                  const lat = p.probe?.latencyMs ?? -1
                  const qual = p.probe?.quality || 'offline'
                  const col = getQualityColor(qual, lat)
                  const isCurrent = activeProviderInfo?.id === p.id

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
                        background: isCurrent ? 'rgba(59,130,246,.08)' : 'rgba(0,0,0,.03)',
                        border: `1px solid ${isCurrent ? 'rgba(59,130,246,.3)' : 'transparent'}`,
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
                        isCurrent &&
                          h(
                            'span',
                            {
                              style: {
                                fontSize: '9px',
                                color: T.brand,
                                fontWeight: 600,
                              },
                            },
                            '● 当前主力',
                          ),
                      ),
                      h(
                        'div',
                        { style: { fontSize: '10px', color: T.secondary, marginTop: '2px' } },
                        p.baseURL || '官方内置通道',
                      ),
                    ),
                    h(
                      'div',
                      { style: { textAlign: 'right' } },
                      h(
                        'div',
                        { style: { fontWeight: 700, fontSize: '13px', color: col } },
                        lat > 0 ? `${lat} ms` : '超时/离线',
                      ),
                      h(
                        'div',
                        { style: { fontSize: '9px', color: T.secondary } },
                        lat > 0 ? (lat < 200 ? '极佳' : '良好') : '不可达',
                      ),
                    ),
                  )
                }),
              ),
            ),
          ),
        ),
      )
    }

    function apply(ctx) {
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
    exports.inject = ['slots']
    return module.exports
  },
})
