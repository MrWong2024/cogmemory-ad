# CogMemory AD / 智忆评 后端配置矩阵

## 1. 文档定位

本文档用于记录 CogMemory AD 后端配置项、来源、用途、默认值和部署注意事项。

## 2. 当前状态

- `backend\src\config\configuration.ts` 与 `backend\src\config\env.validation.ts` 已初始化。
- 配置加载顺序为 `.env.${NODE_ENV}`、`.env`。
- 当前配置只代表公共底座和第三方能力占位口径，不代表业务模块、SMS Service 或 LLM Service 已实现。
- Storage 当前有底层 fake / OSS adapter，但没有业务上传接口。
- 当前不得写入真实密钥、真实数据库密码、真实 OSS AccessKey、真实短信配置或真实大模型 API Key。

## 3. 配置矩阵

| 配置项 | development 默认 / 示例 | production 默认 / 示例 | test 默认 / 示例 | 备注 |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | `test` | 运行环境 |
| `PORT` | `5002` | `5002` | `5002` | 后端默认端口 |
| `FRONTEND_URL` | `http://localhost:3002` | 部署域名覆盖 | `http://localhost:3002` | 本地前端 origin |
| `CORS_ORIGIN` | `http://localhost:3002` | 部署域名覆盖 | `http://localhost:3002` | 支持逗号分隔多个 origin |
| `MONGO_URI` | `cogmemory_ad_dev` 口径 | required | `cogmemory_ad_test` 口径 | 不写真实密码 |
| `MONGO_ADMIN_URI` | `cogmemory_ad_dev` 口径 | required | `cogmemory_ad_test` 口径 | 仅供受控运维场景 |
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

## 4. 安全与部署注意事项

- `.env.*.example` 只能保留占位值或示例值，不得写入真实密钥。
- production MongoDB URI 必须由真实部署环境提供，不得写入仓库。
- production 默认 `STORAGE_DRIVER=oss`，但真实 bucket 与 AccessKey 必须由安全环境变量提供。
- test 环境使用 fake storage，不得依赖真实 OSS、真实短信或真实大模型服务。
- SMS 变量当前只保留阿里云 SMS 配置口径，不代表 SMS Service 已实现。
- LLM 变量当前只保留 `stub` / `bailian` 占位口径，不代表 LLM Service 已实现。

## 5. 后续同步规则

- 新增或调整配置项时，应同步更新本文档和相关部署说明。
- 涉及密钥、个人信息、医疗数据或第三方服务的配置必须明确安全边界。
- 不得在文档中写入真实密钥、真实账号、真实患者信息或生产环境敏感配置。
