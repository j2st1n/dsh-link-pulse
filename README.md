# dsh-link-pulse

[![npm](https://img.shields.io/npm/v/dsh-link-pulse?color=blue)](https://www.npmjs.com/package/dsh-link-pulse)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](./LICENSE)

DeepSeek Harness (DSH) 模型链路与上游网关延迟感知插件：实时呈现网络往返延迟，一眼分清网络拥堵与模型长思考。

## 核心特性

- **当前对话模型感知**：侧栏常驻条目随聊天选中的模型动态变化，实时显示对应网关名称与延迟（如 `● CPA · Gemini 3.7 · 126ms`）。
- **Keep-Alive 真实 1-RTT 测速**：基于就绪 TLS 加密通道测量纯 HTTP 往返耗时，精准反映物理网络时延，零 Token 消耗。
- **动态 Provider 发现**：自动读取 `~/.dsh/settings.yaml` 配置的上游网关（CPA、OpenCode、DeepSeek 官方等），无需硬编码。
- **悬停预览与测速对比**：鼠标悬停即刻弹出微型预览卡片，支持查看全网关延迟排行与健康状态。

## 安装与使用

### 一键安装

```bash
dsh plugin --profile web add dsh-link-pulse
```

> 或通过 GitHub 仓库安装：`dsh plugin --profile web add github:j2st1n/dsh-link-pulse`

### 快速使用

1. 安装完成后启动或重启 DSH Web 界面 (`dsh web`)。
2. 侧栏底部常驻延迟胶囊，悬停可快速对比各模型网关延迟。

### 卸载

```bash
dsh plugin --profile web remove dsh-link-pulse
```

## License

[Apache-2.0](./LICENSE)
