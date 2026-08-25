# dsh-link-pulse

[![npm](https://img.shields.io/npm/v/dsh-link-pulse?color=blue)](https://www.npmjs.com/package/dsh-link-pulse)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](./LICENSE)

专为 **DeepSeek Harness (DSH) Web GUI** 打造的**模型链路与上游网关延迟感知插件**。解决日常使用 AI 时的“黑盒卡顿焦虑”，帮助用户一眼分清当前是本地网络拥堵、代理网关排队还是大模型自身在进行长思考（CoT）。

## 核心特性

- **100% 动态 Provider 发现**：自动从 `~/.dsh/settings.yaml` 读取已配置的所有模型网关（CPA、OpenCode GO、DeepSeek 官方直连等），绝不硬编码。
- **当前对话模型感知**：侧边栏常驻条目根据当前聊天选中的模型，动态显示对应供应商名称与实时延迟（如 `● CPA · Gemini 3.7  78ms`）。
- **原生样式像素级对齐**：状态圆点尺寸（`7px`）、呼吸光环与色彩变量严格对齐 `dsh-cpa-status` 与 `dsh-opencode-status`。
- **零 Token 消耗**：轻量级 TCP/TLS RTT 网络心跳探针，绝不消耗任何 API 配额。
- **多通道看板**：点击侧边栏条目即可呼出全局浮层面板，查看所有已接入 Provider 的实时测速对比并支持一键手动测速。

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
