# dsh-link-pulse

[![npm](https://img.shields.io/npm/v/dsh-link-pulse?color=blue)](https://www.npmjs.com/package/dsh-link-pulse)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](./LICENSE)

专为 **DeepSeek Harness (DSH) Web GUI** 打造的**模型链路与上游网关延迟感知插件**。解决日常使用 AI 时的“黑盒卡顿焦虑”，帮助用户一眼分清当前是本地网络拥堵、代理网关排队还是大模型自身在进行长思考（CoT）。

## 核心特性

- **Keep-Alive 纯 1-RTT 真实测速**：在底层 TLS 加密管道就绪后测量纯 HTTP 数据往返耗时，真实反映长连接日常对话下的网络脉搏。
- **100% 动态 Provider 发现**：自动从 `~/.dsh/settings.yaml` 读取已配置的所有模型网关（CPA、OpenCode GO、DeepSeek 官方直连等），绝不硬编码。
- **当前对话模型感知**：侧边栏常驻条目根据当前聊天选中的模型，动态显示对应供应商名称与实时延迟（如 `● CPA · Gemini 3.7 · 126ms`）。
- **原生样式像素级对齐**：紧凑点号分段排版，状态圆点尺寸（`7px`）、呼吸光环与色彩变量严格对齐 `dsh-cpa-status` 与 `dsh-opencode-status`。
- **悬停快速预览与去重对比**：鼠标悬停 220ms 弹出微型预览卡片；全屏看板与小卡片均在顶部重点呈现当前主力通道，下方列表聚焦对比「其它可用 Provider」测速。
- **零 Token 消耗**：轻量级网络心跳探针，绝不消耗任何 API 配额。

## 延迟测量原理（Keep-Alive 纯 1-RTT 测速）

在 AI 流式交互与对话场景中，客户端与上游网关之间常驻 **HTTP/2 长连接（Keep-Alive 复用）**。

| 测量维度 | 传统冷握手测速 (Cold Handshake) | LinkPulse Keep-Alive 纯 RTT 探针 (Warm) |
| :--- | :--- | :--- |
| **涵盖流程** | TCP 握手 + TLS 1.3 握手 + 数据传输 (累加 3~4 次往返) | **仅测量已就绪加密通道上的数据往返 (1 次 RTT)** |
| **跨国节点耗时** | 约 $400\sim 550\text{ ms}$ (受多次物理往返累加影响) | **约 $120\sim 140\text{ ms}$ (直达物理光速极限)** |
| **实际映射意义** | 仅代表首次冷启动建连耗时 | **精准反映每次发送 Prompt 到接收流式 Token 首包的真实物理网络时延** |

探针在建立底层 TLS 安全通道后，直接发送轻量 `HEAD` 探针并测算首字节往返时间，避免了将冷建连多次握手耗时误判为网络卡顿。

## 安装与更新

### 方式一：官方 npm 安装（推荐）

```sh
dsh plugin --profile web add dsh-link-pulse
```

### 方式二：GitHub 仓库直接安装

```sh
dsh plugin --profile web add github:j2st1n/dsh-link-pulse
```

> **说明**：
> - 纯原生 JS 零构建（Zero-build）架构，安装后重启 `dsh web` 即可立即生效。

### 卸载

```sh
dsh plugin --profile web remove dsh-link-pulse
```

## 延迟状态等级

| 延迟区间 | 状态颜色 | 质量评级 |
| :--- | :---: | :--- |
| $\le$ 200ms | 🟢 绿色 | 极佳（Excellent） |
| 200ms $\sim$ 600ms | 🟡 黄色 | 良好（Good） |
| > 600ms / 超时 | 🔴 红色 | 缓慢 / 离线（Slow / Timeout） |

## 安全声明

- 详见 [SECURITY.md](./SECURITY.md)。

## License

[Apache-2.0](./LICENSE)
