# Security Policy

## 零 Token 消耗与安全声明

1. **零 Token 消耗**：本插件探针采用 HTTP `HEAD` / `GET` 轻量级连接测试，仅测试网络往返延迟（RTT），绝不调用 `/chat/completions` 等模型推理接口，不消耗任何 Token 配额。
2. **本地配置只读**：插件后端仅以只读方式解析 `settings.yaml`，不写入或篡改任何系统配置与密钥。
3. **无敏感数据外泄**：所有探测数据仅供本地 DSH Web 界面消费，不向任何第三方上报遥测数据。
