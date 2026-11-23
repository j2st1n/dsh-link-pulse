# Security Policy

## 零 Token 消耗与安全声明

1. **零 Token 消耗**：本插件探针采用 HTTP `HEAD` / `GET` 轻量级连接测试，仅测试网络往返延迟（RTT），绝不调用 `/chat/completions` 等模型推理接口，不消耗任何 Token 配额。
2. **本地配置只读**：插件后端仅以只读方式解析 `settings.yaml`，不写入或篡改任何系统配置与密钥。
3. **无敏感数据外泄**：所有探测数据仅供本地 DSH Web 界面消费，不向任何第三方上报遥测数据。
4. **状态接口有来源围栏**：`/api/link-pulse/status` 会回传 provider 标识、网关地址与延迟。该路由以 `kind: 'exact'` 注册，会绕过宿主对 `/api` 前缀通道的准入校验，因此插件内置了与宿主等价的来源围栏——Host 必须是环回、监听器 bind 地址或 `connection.trustedHosts` 之一；拒绝 `Sec-Fetch-Site: cross-site`；带 Origin 时必须同 authority。伪造 Host（DNS rebinding）、跨站请求与不匹配 Origin 一律返回 403，不再返回数据。宿主提供 `connection.isTrusted` 时以其判定为准，缺失时回退本地等价实现。
   - 边界说明：围栏只拦截**浏览器来源**与 DNS rebinding，**不防同主机其他进程**直接访问回环端口。它不是身份认证机制。
