# CogMemory AD / 智忆评 后端配置矩阵

## 1. 文档定位

本文档用于记录 CogMemory AD 后端配置项、来源、用途、默认值和部署注意事项。

## 2. 当前状态

- `backend\src\config\configuration.ts` 与 `backend\src\config\env.validation.ts` 已初始化。
- 配置加载顺序为 `.env.${NODE_ENV}`、`.env`。
- 当前配置同时覆盖公共底座、D-038 测试数据库用途门禁和第三方能力占位口径；SMS Service 与 LLM Service 仍未实现。
- `MediaModule` 已通过 fake / OSS Storage abstraction 提供题目媒体业务上传、短期访问、作废和重传；`StorageModule` 没有独立、通用的 Storage 管理 API。
- 当前不得写入真实密钥、真实数据库密码、真实 OSS AccessKey、真实短信配置或真实大模型 API Key。

## 3. 测试数据库用途与进程隔离

### 3.1 用途与数据库映射

| 用途 | 数据库 | 配置来源 | 进程边界 |
| --- | --- | --- | --- |
| `standard_test` | `cogmemory_ad_test` | `backend/.env.test` | 只供普通 unit / E2E；不得加载 Browser 配置 |
| `browser_acceptance` | `cogmemory_ad_browser_test` | `backend/.env.browser-acceptance` | 只供 Browser backend 与 fixture CLI；不得与 `.env.test` 叠加 |

- `NODE_ENV=test` 时，`COGMEMORY_DATABASE_PURPOSE` 只允许 `standard_test` 或 `browser_acceptance`；未显式指定时默认 `standard_test`。
- 两个 env 文件可以同时存在于磁盘，但不得同时加载、source 或合并到同一进程，也不得依赖 dotenv 顺序、旧 shell 变量或后加载覆盖选择数据库。
- 切换用途时应启动独立进程；确需复用 shell 时，必须先清除或覆盖数据库主连接、管理连接、用途及其他用途相关变量。
- 本文只记录文件职责和变量映射，不记录实际密码、完整 URI 或本地 env 实际值。

### 3.2 Browser 进程 URI 与角色映射

| 独立进程 | `COGMEMORY_DATABASE_PURPOSE` | `MONGO_URI` 来源 | `MONGO_ADMIN_URI` 来源 | 主连接身份 / 角色 |
| --- | --- | --- | --- | --- |
| Browser test backend | `browser_acceptance` | `BROWSER_ACCEPTANCE_APP_MONGO_URI` | `BROWSER_ACCEPTANCE_ADMIN_MONGO_URI` | app / `readWrite` |
| Browser fixture CLI | `browser_acceptance` | `BROWSER_ACCEPTANCE_ADMIN_MONGO_URI` | `BROWSER_ACCEPTANCE_ADMIN_MONGO_URI` | db_admin / `dbOwner` |
| 普通 E2E | `standard_test` | `.env.test` 的普通测试主连接 | `.env.test` 的普通测试管理连接 | standard_test 用户 / 测试配置角色 |

- `npm run start:browser-test` 是 test-only Browser backend 入口；Browser backend 不得以 db_admin 作为主连接，fixture CLI 不得以 app 用户作为主连接。
- Browser backend 与 fixture CLI 在导入 AppModule 前验证 `NODE_ENV=test`、`browser_acceptance` 用途和 URI 声明库名。
- AppModule 在建连前校验 URI 声明库名与用途固定映射，在建连后校验 Mongoose `connection.name`；Browser 专用进程还校验唯一认证用户和目标库角色。
- 普通 E2E 指向 Browser 库、Browser 进程指向普通测试库或开发库、app/db_admin 身份或角色互换时均立即拒绝，不自动回退或改连。

## 4. 其他配置矩阵

| 配置项 | development 默认 / 示例 | production 默认 / 示例 | test 默认 / 示例 | 备注 |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | `test` | 运行环境 |
| `PORT` | `5002` | `5002` | `5002` | 后端默认端口 |
| `FRONTEND_URL` | `http://localhost:3002` | 部署域名覆盖 | `http://localhost:3002` | 本地前端 origin |
| `CORS_ORIGIN` | `http://localhost:3002` | 部署域名覆盖 | `http://localhost:3002` | 支持逗号分隔多个 origin |
| `COGMEMORY_DATABASE_PURPOSE` | 可不设置 | 可不设置 | `standard_test` / `browser_acceptance` | test 进程用途；未设置默认 `standard_test` |
| `MONGO_URI` | `cogmemory_ad_dev` 口径 | required | 按用途映射到普通测试或 Browser 专用库 | 不写真实密码或完整 URI |
| `MONGO_ADMIN_URI` | `cogmemory_ad_dev` 口径 | required | standard_test 测试管理连接；Browser backend/fixture 按上表映射 | 仅供受控测试管理或运维场景 |
| `MONGO_AUTO_INDEX` | 默认按非生产启用 | `false` | 默认按非生产启用 | 生产强制关闭 |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `5000` | `5000` | `5000` | MongoDB 连接超时 |
| `STORAGE_DRIVER` | `fake` | `oss` | `fake` | 支持 `fake` / `oss` |
| `OSS_REGION` | `oss-cn-shenzhen` | `oss-cn-shenzhen` | 可为空 | OSS 示例区域 |
| `OSS_BUCKET` | 占位或空 | required when `oss` | 可为空 | 不写真实 bucket |
| `OSS_INTERNAL_ENDPOINT` | `oss-cn-shenzhen.aliyuncs.com` | `oss-cn-shenzhen-internal.aliyuncs.com` | 可为空 | 后端访问 endpoint |
| `OSS_PUBLIC_ENDPOINT` | `oss-cn-shenzhen.aliyuncs.com` | `oss-cn-shenzhen.aliyuncs.com` | 可为空 | 签名 URL endpoint |
| `OSS_ACCESS_KEY_ID` | 占位或空 | required when `oss` | 可为空 | 不写真实 AccessKey |
| `OSS_ACCESS_KEY_SECRET` | 占位或空 | required when `oss` | 可为空 | 不写真实 AccessKey |
| `OSS_OBJECT_PREFIX` | `cogmemory_ad` | `cogmemory_ad` | `cogmemory_ad` | 对象前缀默认值 |
| `SESSION_COOKIE_NAME` | `cogmemory_ad_session` | `cogmemory_ad_session` | `cogmemory_ad_session` | Cookie 名称 |
| `SESSION_TTL_MS` | `86400000` | `86400000` | `86400000` | 会话 TTL 占位 |
| `MAX_ACTIVE_SESSIONS_PER_USER` | `5` | `5` | `5` | 当前仅配置占位 |
| `SESSION_COOKIE_SECURE` | `false` | `true` | `false` | 生产默认 secure |
| `SESSION_COOKIE_SAME_SITE` | `lax` | `lax` | `lax` | `none` 必须搭配 secure |
| `LLM_PROVIDER` | `bailian` | `bailian` | `stub` | test 只能为 `stub` |
| `BAILIAN_API_KEY` | 空或占位 | 空或占位 | 空 | 不写真实 API Key |
| `BAILIAN_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 同 development | 同 development | 仅占位 |
| `BAILIAN_MODEL` | `qwen3.6-plus` | `qwen3.6-plus` | 空 | 仅占位 |
| `BAILIAN_TIMEOUT_MS` | `90000` | `90000` | `90000` | 仅占位 |
| `BAILIAN_MAX_RETRIES` | `1` | `1` | `1` | 仅占位 |
| `SMS_AUTH_PROVIDER` | `aliyun` | `aliyun` | `stub` | test 只能为 `stub` |
| `ALIYUN_SMS_ACCESS_KEY_ID` | 空或占位 | 空或占位 | 空 | 不写真实密钥 |
| `ALIYUN_SMS_ACCESS_KEY_SECRET` | 空或占位 | 空或占位 | 空 | 不写真实密钥 |
| `ALIYUN_SMS_REGION_ID` | `cn-shenzhen` | `cn-shenzhen` | `cn-shenzhen` | 安全示例值 |
| `ALIYUN_SMS_ENDPOINT` | `dysmsapi.aliyuncs.com` | `dysmsapi.aliyuncs.com` | `dysmsapi.aliyuncs.com` | 阿里云 endpoint 示例 |
| `ALIYUN_SMS_COUNTRY_CODE` | `86` | `86` | `86` | 默认国家码 |
| `ALIYUN_SMS_SIGN_NAME` | 空 | 空 | 空 | 不写真实签名 |
| `ALIYUN_SMS_TEMPLATE_CODE` | 空 | 空 | 空 | 不写真实模板号 |
| `ALIYUN_SMS_TEMPLATE_PARAM` | 空 | 空 | 空 | 不写真实模板参数 |
| `ALIYUN_SMS_CODE_LENGTH` | `6` | `6` | `6` | 验证码策略占位 |
| `ALIYUN_SMS_VALID_TIME_SECONDS` | `300` | `300` | `300` | 验证码策略占位 |
| `ALIYUN_SMS_DUPLICATE_POLICY` | `1` | `1` | `1` | 验证码策略占位 |
| `ALIYUN_SMS_INTERVAL_SECONDS` | `60` | `60` | `60` | 验证码策略占位 |
| `ALIYUN_SMS_CODE_TYPE` | `1` | `1` | `1` | 验证码策略占位 |
| `ALIYUN_SMS_CASE_AUTH_POLICY` | `1` | `1` | `1` | 验证码策略占位 |

## 5. 安全与部署注意事项

- `.env.*.example` 只能保留占位值或示例值，不得写入真实密钥。
- production MongoDB URI 必须由真实部署环境提供，不得写入仓库。
- production 默认 `STORAGE_DRIVER=oss`，但真实 bucket 与 AccessKey 必须由安全环境变量提供。
- test 环境使用 fake storage，不得依赖真实 OSS、真实短信或真实大模型服务。
- `standard_test` 与 `browser_acceptance` 的本地隔离测试凭据可由对应独立进程自动读取，但不得写入跟踪文件、文档、日志、manifest、生成物或最终报告。
- SMS 变量当前只保留阿里云 SMS 配置口径，不代表 SMS Service 已实现。
- LLM 变量当前只保留 `stub` / `bailian` 占位口径，不代表 LLM Service 已实现。

## 6. 后续同步规则

- 新增或调整配置项时，应同步更新本文档和相关部署说明。
- 涉及密钥、个人信息、医疗数据或第三方服务的配置必须明确安全边界。
- 不得在文档中写入真实密钥、真实账号、真实患者信息或生产环境敏感配置。
