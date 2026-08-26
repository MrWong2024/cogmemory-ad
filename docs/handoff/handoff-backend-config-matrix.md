# CogMemory AD / 智忆评 后端配置矩阵

## 1. 文档定位

本文档是 CogMemory AD 后端的**静态配置事实 owner**，唯一完整维护配置项、配置路径、默认值 / 示例值、配置来源、静态校验、测试数据库用途映射和部署配置约束。

- 测试用途选择、进程隔离、连接前后门禁、角色职责、fixture / verifier / cleanup 与测试证据见 [Backend Testing Playbook](./handoff-backend-testing-playbook.md)。
- 当前模块能力与真实未实现边界见 [Backend Snapshot](./handoff-backend-snapshot.md)。
- 产品阶段与工作包状态见 [Roadmap](./handoff-roadmap.md)。

## 2. 当前状态

- `backend\src\config\configuration.ts` 与 `backend\src\config\env.validation.ts` 已初始化。
- 配置加载顺序为 `.env.${NODE_ENV}`、`.env`。
- 当前已定义 runtime / server、Mongo、Storage / OSS、Session / Auth、LLM、ASR 与 SMS 配置族。
- 配置项存在不表示对应业务 Service 或产品能力可用；current capability 统一以 [Backend Snapshot](./handoff-backend-snapshot.md) 为准。
- 当前不得写入真实密钥、真实数据库密码、真实 OSS AccessKey、真实短信配置或真实大模型 API Key。

## 3. 测试数据库用途静态映射

### 3.1 用途与数据库映射

| 用途 | 数据库 | env file / 配置来源 | `NODE_ENV=test` 静态约束 |
| --- | --- | --- | --- |
| `standard_test` | `cogmemory_ad_test` | `backend/.env.test` | 允许值；未显式指定用途时的默认值 |
| `browser_acceptance` | `cogmemory_ad_browser_test` | `backend/.env.browser-acceptance` | 允许值；必须显式指定用途 |

- `NODE_ENV=test` 时，`COGMEMORY_DATABASE_PURPOSE` 只允许 `standard_test` 或 `browser_acceptance`；未显式指定时默认 `standard_test`。
- 同一进程的静态配置只能选择一个 database purpose；用途切换、进程隔离和连接前后门禁见 [Backend Testing Playbook](./handoff-backend-testing-playbook.md)。
- 本文只记录文件职责和变量映射，不记录实际密码、完整 URI 或本地 env 实际值。

### 3.2 配置消费方与 URI 来源映射

| 配置消费方 | `COGMEMORY_DATABASE_PURPOSE` | `MONGO_URI` 来源 | `MONGO_ADMIN_URI` 来源 |
| --- | --- | --- | --- |
| Browser test backend | `browser_acceptance` | `BROWSER_ACCEPTANCE_APP_MONGO_URI` | `BROWSER_ACCEPTANCE_ADMIN_MONGO_URI` |
| 普通 E2E | `standard_test` | `backend/.env.test` 的普通测试主连接 | `backend/.env.test` 的普通测试管理连接 |

此表只定义 current 配置消费方读取哪个 URI variable / source；`BROWSER_ACCEPTANCE_ADMIN_MONGO_URI` 仍是 Browser acceptance 受控管理连接来源，但 current retained Browser fixture / admin CLI count 为 0。app / db_admin 职责、`readWrite` / `dbOwner` 最小权限、AppModule 连接门禁、current tooling inventory 和未来合法 test admin tooling 的 fixture 规则由 [Backend Testing Playbook](./handoff-backend-testing-playbook.md) 维护。

## 4. 其他配置矩阵

| 环境变量 | Config key | development 默认 / 示例 | production 默认 / 示例 | test 默认 / 示例 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | `app.env` | `development` | `production` | `test` | 运行环境 |
| `PORT` | `app.port` | `5002` | `5002` | `5002` | 后端默认端口 |
| `FRONTEND_URL` | `app.frontendUrl` | `http://localhost:3002` | 部署域名覆盖 | `http://localhost:3002` | 本地前端 origin |
| `CORS_ORIGIN` | `app.corsOrigin` | `http://localhost:3002` | 部署域名覆盖 | `http://localhost:3002` | 支持逗号分隔多个 origin |
| `COGMEMORY_DATABASE_PURPOSE` | `mongo.purpose` | 可不设置 | 可不设置 | `standard_test` / `browser_acceptance` | test 进程用途；未设置默认 `standard_test` |
| `MONGO_URI` | `mongo.uri` | `cogmemory_ad_dev` 口径 | required | 按用途映射到普通测试或 Browser 专用库 | 不写真实密码或完整 URI |
| `MONGO_ADMIN_URI` | `mongo.adminUri` | `cogmemory_ad_dev` 口径 | required；运维门禁为 `cogmemory_ad` | standard_test 测试管理连接；browser_acceptance 受控管理连接按 §3.2 映射 | 供受控测试管理或 `db:sync-indexes` 运维脚本使用；不得作为应用常驻连接 |
| `MONGO_AUTO_INDEX` | `mongo.autoIndex` | 默认按非生产启用 | `false` | 默认按非生产启用 | production 强制关闭；索引同步必须显式运行 `db:sync-indexes -- --execute`，不属于应用启动行为 |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `mongo.serverSelectionTimeoutMs` | `5000` | `5000` | `5000` | MongoDB 连接超时 |
| `STORAGE_DRIVER` | `storage.driver` | 默认 `fake`；example 为 `oss` | 默认 / example 为 `oss` | `fake` | 支持 `fake` / `oss` |
| `OSS_REGION` | `storage.oss.region` | `oss-cn-shenzhen` | `oss-cn-shenzhen` | 可为空 | OSS 示例区域 |
| `OSS_BUCKET` | `storage.oss.bucket` | 占位或空 | required when `oss` | 可为空 | 不写真实 bucket |
| `OSS_INTERNAL_ENDPOINT` | `storage.oss.internalEndpoint` | `oss-cn-shenzhen.aliyuncs.com` | `oss-cn-shenzhen-internal.aliyuncs.com` | 可为空 | 后端访问 endpoint |
| `OSS_PUBLIC_ENDPOINT` | `storage.oss.publicEndpoint` | `oss-cn-shenzhen.aliyuncs.com` | `oss-cn-shenzhen.aliyuncs.com` | 可为空 | 签名 URL endpoint |
| `OSS_ACCESS_KEY_ID` | `storage.oss.accessKeyId` | 占位或空 | required when `oss` | 可为空 | 不写真实 AccessKey |
| `OSS_ACCESS_KEY_SECRET` | `storage.oss.accessKeySecret` | 占位或空 | required when `oss` | 可为空 | 不写真实 AccessKey |
| `OSS_OBJECT_PREFIX` | `storage.oss.objectPrefix` | `cogmemory_ad` | `cogmemory_ad` | `cogmemory_ad` | 对象前缀默认值 |
| `SESSION_COOKIE_NAME` | `session.cookieName` | `cogmemory_ad_session` | `cogmemory_ad_session` | `cogmemory_ad_session` | Cookie 名称 |
| `SESSION_TTL_MS` | `session.ttlMs` | `86400000` | `86400000` | `86400000` | 会话 TTL 占位 |
| `MAX_ACTIVE_SESSIONS_PER_USER` | `session.maxActiveSessionsPerUser` | `5` | `5` | `5` | 当前仅配置占位 |
| `SESSION_COOKIE_SECURE` | `session.cookieSecure` | `false` | `true` | `false` | 生产默认 secure |
| `SESSION_COOKIE_SAME_SITE` | `session.cookieSameSite` | `lax` | `lax` | `lax` | `none` 必须搭配 secure |
| `LLM_PROVIDER` | `llm.provider` | `bailian` | `bailian` | `stub` | test 只能为 `stub` |
| `BAILIAN_API_KEY` | `llm.bailian.apiKey` / `asr.bailian.apiKey` | 空或占位；ASR=bailian 时 required | ASR=bailian 时 required | 空 | LLM / ASR 复用密钥变量；不写真实 API Key |
| `BAILIAN_BASE_URL` | `llm.bailian.baseUrl` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 同 development | 同 development | 仅占位 |
| `BAILIAN_MODEL` | `llm.bailian.model` | `qwen3.6-plus` | `qwen3.6-plus` | 空 | 仅占位 |
| `BAILIAN_TIMEOUT_MS` | `llm.bailian.timeoutMs` / `asr.bailian.timeoutMs` | `90000` | `90000` | `90000` | LLM / ASR 复用请求超时；整数且至少为 `1` |
| `BAILIAN_MAX_RETRIES` | `llm.bailian.maxRetries` | `1` | `1` | `1` | 仅占位 |
| `ASR_PROVIDER` | `asr.provider` | 默认 `disabled`；example 为 `bailian`；允许 `disabled` / `stub` / `bailian` | 默认 `disabled`；example 为 `bailian`；只允许 `disabled` / `bailian` | 强制 `stub` | 与 `LLM_PROVIDER` 独立；本行只维护 provider enum 与环境约束 |
| `BAILIAN_ASR_API_URL` | `asr.bailian.apiUrl` | `https://ws-09jkdkybppp4yy0v.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` | `https://ws-09jkdkybppp4yy0v.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` | 空 | `bailian` 时 required 且必须为 HTTPS；必须提供完整 workspace URL，不由代码拼接 |
| `BAILIAN_ASR_MODEL` | `asr.bailian.model` | `qwen-audio-3.0-asr-flash` | `qwen-audio-3.0-asr-flash` | 未显式设置；`stub` 运行时使用内置默认 `qwen-audio-3.0-asr-flash` | Bailian 模式固定模型；test 不调用真实 ASR |
| `SMS_AUTH_PROVIDER` | `smsAuth.provider` | `aliyun` | `aliyun` | `stub` | test 只能为 `stub` |
| `ALIYUN_SMS_ACCESS_KEY_ID` | `smsAuth.aliyun.accessKeyId` | 空或占位 | 空或占位 | 空 | 不写真实密钥 |
| `ALIYUN_SMS_ACCESS_KEY_SECRET` | `smsAuth.aliyun.accessKeySecret` | 空或占位 | 空或占位 | 空 | 不写真实密钥 |
| `ALIYUN_SMS_REGION_ID` | `smsAuth.aliyun.regionId` | `cn-shenzhen` | `cn-shenzhen` | `cn-shenzhen` | 安全示例值 |
| `ALIYUN_SMS_ENDPOINT` | `smsAuth.aliyun.endpoint` | `dysmsapi.aliyuncs.com` | `dysmsapi.aliyuncs.com` | `dysmsapi.aliyuncs.com` | 阿里云 endpoint 示例 |
| `ALIYUN_SMS_COUNTRY_CODE` | `smsAuth.aliyun.countryCode` | `86` | `86` | `86` | 默认国家码 |
| `ALIYUN_SMS_SIGN_NAME` | `smsAuth.aliyun.signName` | 空 | 空 | 空 | 不写真实签名 |
| `ALIYUN_SMS_TEMPLATE_CODE` | `smsAuth.aliyun.templateCode` | 空 | 空 | 空 | 不写真实模板号 |
| `ALIYUN_SMS_TEMPLATE_PARAM` | `smsAuth.aliyun.templateParam` | 空 | 空 | 空 | 不写真实模板参数 |
| `ALIYUN_SMS_CODE_LENGTH` | `smsAuth.aliyun.codeLength` | `6` | `6` | `6` | 验证码策略占位 |
| `ALIYUN_SMS_VALID_TIME_SECONDS` | `smsAuth.aliyun.validTimeSeconds` | `300` | `300` | `300` | 验证码策略占位 |
| `ALIYUN_SMS_DUPLICATE_POLICY` | `smsAuth.aliyun.duplicatePolicy` | `1` | `1` | `1` | 验证码策略占位 |
| `ALIYUN_SMS_INTERVAL_SECONDS` | `smsAuth.aliyun.intervalSeconds` | `60` | `60` | `60` | 验证码策略占位 |
| `ALIYUN_SMS_CODE_TYPE` | `smsAuth.aliyun.codeType` | `1` | `1` | `1` | 验证码策略占位 |
| `ALIYUN_SMS_CASE_AUTH_POLICY` | `smsAuth.aliyun.caseAuthPolicy` | `1` | `1` | `1` | 验证码策略占位 |

## 5. 安全与部署注意事项

- `.env.*.example` 只能保留占位值或示例值，不得写入真实密钥。
- production MongoDB URI 必须由真实部署环境提供，不得写入仓库。
- production 默认 `STORAGE_DRIVER=oss`，但真实 bucket 与 AccessKey 必须由安全环境变量提供。
- test 环境使用 fake storage，并强制 ASR / LLM / SMS 为 stub；不得依赖真实 OSS、百炼、短信或其他真实大模型服务。
- development / production example 可以保留非敏感 provider、endpoint 与 model 示例；真实 API Key 始终由安全环境提供。Bailian ASR 配置要求非空 `BAILIAN_API_KEY`、HTTPS 完整 API URL 与固定 model。
- 测试 Secret、证据和进程处理规则见 [Backend Testing Playbook](./handoff-backend-testing-playbook.md)；配置对应的 current capability 见 [Backend Snapshot](./handoff-backend-snapshot.md)。

## 6. 后续同步规则

- 配置项、默认值 / 示例值、来源、静态校验或 database purpose 静态映射变化时，更新本文档。
- 测试用途选择、进程隔离、连接门禁、角色、fixture / verifier / cleanup 或 testing evidence 变化时，只更新 [Backend Testing Playbook](./handoff-backend-testing-playbook.md)；本文引用，不复述运行流程。
- 模块级 current capability 变化时更新 [Backend Snapshot](./handoff-backend-snapshot.md)；产品阶段变化时更新 [Roadmap](./handoff-roadmap.md)。
- 若变更不影响静态配置职责，本文保持 zero diff；同步是按 owner 更新并建立引用，不是横向复制。
- 涉及密钥、个人信息、医疗数据或第三方服务的配置必须明确静态安全边界；不得在文档中写入真实密钥、真实账号、真实患者信息或生产环境敏感配置。
