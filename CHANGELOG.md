# Changelog

## [0.1.12] - 2026-09-28

### Changed
- 模型名称展示改为完整的原始 model ID（例如 `gpt-6-astra`），不再将 GPT、Gemini、Claude、DeepSeek 等模型简写。

### Fixed
- 修复模型切换始终显示 CPA · Gemini 3.7：改用 DSH `uiSession.current` 获取主会话 ID，不再读取不存在的 `sessions.list.current`。
- 补充客户端 `sessions`、`modelDirectories`、`uiSession` 依赖注入声明。
- 后端默认配置尚未到达时不再硬编码 CPA/Gemini 3.7，改为等待实际默认模型配置。

## [0.1.10] - 2026-09-26

### Fixed
- 支持解析带自定义 YAML tag（如 `!js`）的 `cordis.patch.yml`，以精准发现动态 Provider 配置。

## [0.1.8] - 2026-08-30

### Fixed
- **官方 DeepSeek V4 供应商误显为 CPA**：DSH 内置官方路由的运行时 provider id 为 `deepseek-official`（`dsh-llm-deepseek` 中 `PROVIDER` 常量），而插件兜底官方节点注册的 id 是 `deepseek`，导致客户端按当前会话 provider 查找落空后错误兜底到 provider 列表第一项（CPA）。兜底节点 id 修正为 `deepseek-official`，并同步注册 `KNOWN_PROVIDER_DEFAULTS` 映射。
- **未识别 Provider 张冠李戴**：客户端在 providerMap 查找失败时不再冒名显示列表第一个供应商的名称与延迟，改为展示该 provider 的真实 id（大写），延迟显示为探测中。

## [0.1.7] - 2026-08-29

### Fixed & Refactored
- **权威状态订阅重构**：彻底移除客户端定时器轮询与 DOM 抓取，接入 DSH 原生 `sessions` 与 `modelDirectories` 服务，实现模型切换时 0 毫秒即选即切，无需发消息触发。
- **Provider 网关与同名模型隔离**：将各 Provider 独立隔离（官方 `deepseek` 对应 `https://api.deepseek.com`，`opencode-go` 对应 `https://opencode.ai`），解决 DeepSeek V4 系列在官方与 OpenCode GO 之间的命名空间冲突与错误归属问题。


## [0.1.6] - 2026-08-25

### Docs
- 补充 README 中的 Keep-Alive 纯 1-RTT 测速原理与冷握手 vs 热长连接对比说明表。

## [0.1.5] - 2026-08-25

### Changed
- 侧边栏常驻条目排版样式优化：将延迟数值（如 `126ms`）改为与 OpenCode / CPA 规范统一的紧凑分段格式（`● CPA · Gemini 3.7 · 126ms`），去除两端强行两极分散的 `space-between`，实现视觉规格 100% 像素级对齐。

## [0.1.4] - 2026-08-25

### Changed
- 升级探针算法为 Keep-Alive 纯 RTT 测量：在底层 TLS 加密隧道就绪后测量纯 HTTP 数据往返耗时（1-RTT），真实反映长连接对话场景下的网络脉搏延迟（CPA 德国直连由 ~450ms 降至真实物理往返 ~126ms）。

## [0.1.3] - 2026-08-25

### Fixed
- 修复内外延迟显示不一致问题：引入全局单例状态存储与后端 25 秒探测缓存（支持 `?refresh=1` 强制刷新），确保侧栏按钮、Hover 悬浮小卡片与点击全屏大看板的延迟数据 100% 同步同源。

## [0.1.2] - 2026-08-25

### Changed
- 去除 Provider 链路对比列表中的当前主力通道重复展示：当前主力已在顶部重点呈现，下方列表聚焦展示「其它可用 Provider」的测速对比（Hover 浮层与全屏看板同步生效）。

## [0.1.1] - 2026-08-25

### Fixed
- 主动清理模型选择器文本中夹带的「default / 推理等级 / 模型」等 UI 标签残留，让长模型 ID（如 `opencode minimax-m3`）能正确识别为单个 token。

### Added
- 恢复并改写侧边栏条目 hover 悬浮预览：220ms 悬停延迟后在按钮上方弹出小卡片，展示当前模型 / 供应商 / 实时延迟以及全部 Provider 链路测速对比。

## [0.1.0] - 2026-08-25

### Added
- 初始版本发布：支持从 `settings.yaml` 动态读取 Providers。
- 侧边栏常驻条目与当前会话模型动态感知。
- 多通道实时测速浮层看板。
- 遵循 Cordis@4 扁平依赖注入规范。