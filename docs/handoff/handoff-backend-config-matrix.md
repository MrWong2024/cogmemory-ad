# CogMemory AD / 智忆评 后端配置矩阵

## 1. 文档定位

本文档用于记录 CogMemory AD 后端配置项、来源、用途、默认值和部署注意事项。

## 2. 当前状态

- 当前已初始化后端根目录 `.env.*.example` 示例配置。
- 当前配置只代表公共骨架占位口径，不代表业务模块、数据库连接代码、OSS Service、短信或 AI / LLM 能力已经实现。
- 当前不得写入真实密钥、真实数据库密码、真实 OSS AccessKey、真实短信配置或真实大模型 API Key。

## 3. 配置矩阵

| 配置项 | development 示例 | production 示例 | test 示例 | 备注 |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | `test` | 运行环境 |
| `PORT` | `5002` | `5002` | `5002` | 后端默认端口为 `5002` |
| `FRONTEND_URL` | `http://localhost:3002` | `https://your-cogmemory-ad-frontend-domain.example` | `http://localhost:3002` | 前端本地默认端口为 `3002` |
| `CORS_ORIGIN` | `http://localhost:3002` | `https://your-cogmemory-ad-frontend-domain.example` | `http://localhost:3002` | 前端本地默认端口为 `3002` |
| `MONGO_URI` | `cogmemory_ad_dev` 口径 | `cogmemory_ad` 口径 | `cogmemory_ad_test` 口径 | 示例连接串，不包含真实密码 |
| `MONGO_ADMIN_URI` | `cogmemory_ad_dev` 口径 | `cogmemory_ad` 口径 | `cogmemory_ad_test` 口径 | 示例管理连接串，不包含真实密码 |
| `MONGO_AUTO_INDEX` | `true` | `false` | `true` | 生产默认关闭自动建索引 |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `5000` | `5000` | `5000` | MongoDB 连接超时示例 |
| `STORAGE_DRIVER` | `fake` | `oss` | `fake` | development / production 保留阿里云 OSS 示例 / 待确认配置位；当前未实现 OSS Service |
| `OSS_REGION` | `oss-cn-shenzhen` | `oss-cn-shenzhen` | 未配置 | 阿里云 OSS 示例 / 待确认配置 |
| `OSS_BUCKET` | `{COGMEMORY_AD_OSS_BUCKET}` | `{COGMEMORY_AD_OSS_BUCKET}` | 未配置 | 阿里云 OSS 示例 / 待确认配置，不写入真实 bucket |
| `OSS_INTERNAL_ENDPOINT` | `oss-cn-shenzhen.aliyuncs.com` | `oss-cn-shenzhen-internal.aliyuncs.com` | 未配置 | 阿里云 OSS 示例 / 待确认配置 |
| `OSS_PUBLIC_ENDPOINT` | `oss-cn-shenzhen.aliyuncs.com` | `oss-cn-shenzhen.aliyuncs.com` | 未配置 | 阿里云 OSS 示例 / 待确认配置 |
| `OSS_ACCESS_KEY_ID` | `{COGMEMORY_AD_OSS_ACCESS_KEY_ID}` | `{COGMEMORY_AD_OSS_ACCESS_KEY_ID}` | 未配置 | 阿里云 OSS 示例 / 待确认配置，不写入真实 AccessKey |
| `OSS_ACCESS_KEY_SECRET` | `{COGMEMORY_AD_OSS_ACCESS_KEY_SECRET}` | `{COGMEMORY_AD_OSS_ACCESS_KEY_SECRET}` | 未配置 | 阿里云 OSS 示例 / 待确认配置，不写入真实 AccessKey |
| `OSS_OBJECT_PREFIX` | `cogmemory_ad` | `cogmemory_ad` | 未配置 | 阿里云 OSS 示例 / 待确认配置 |
| `SESSION_COOKIE_NAME` | `cogmemory_ad_session` | `cogmemory_ad_session` | `cogmemory_ad_session` | 会话 Cookie 名称示例 |
| `SMS_AUTH_PROVIDER` | `aliyun` | `aliyun` | 未配置 | 阿里云 SMS 示例 / 待确认配置，当前未实现 SMS Service |
| `ALIYUN_SMS_ACCESS_KEY_ID` | `{COGMEMORY_AD_ALIYUN_SMS_ACCESS_KEY_ID}` | `{COGMEMORY_AD_ALIYUN_SMS_ACCESS_KEY_ID}` | 未配置 | 阿里云 SMS API 相关字段示例 / 待确认配置，不写入真实密钥 |
| `ALIYUN_SMS_ACCESS_KEY_SECRET` | `{COGMEMORY_AD_ALIYUN_SMS_ACCESS_KEY_SECRET}` | `{COGMEMORY_AD_ALIYUN_SMS_ACCESS_KEY_SECRET}` | 未配置 | 阿里云 SMS API 相关字段示例 / 待确认配置，不写入真实密钥 |
| `ALIYUN_SMS_REGION_ID` | `{COGMEMORY_AD_ALIYUN_SMS_REGION_ID}` | `{COGMEMORY_AD_ALIYUN_SMS_REGION_ID}` | 未配置 | 阿里云 SMS API 相关字段示例 / 待确认配置 |
| `ALIYUN_SMS_ENDPOINT` | `{COGMEMORY_AD_ALIYUN_SMS_ENDPOINT}` | `{COGMEMORY_AD_ALIYUN_SMS_ENDPOINT}` | 未配置 | 阿里云 SMS API 相关字段示例 / 待确认配置 |
| `ALIYUN_SMS_COUNTRY_CODE` | `{COGMEMORY_AD_ALIYUN_SMS_COUNTRY_CODE}` | `{COGMEMORY_AD_ALIYUN_SMS_COUNTRY_CODE}` | 未配置 | 阿里云 SMS API 相关字段示例 / 待确认配置 |
| `ALIYUN_SMS_SIGN_NAME` | `{COGMEMORY_AD_ALIYUN_SMS_SIGN_NAME}` | `{COGMEMORY_AD_ALIYUN_SMS_SIGN_NAME}` | 未配置 | 阿里云 SMS 发送参数口径，不写入真实短信签名 |
| `ALIYUN_SMS_TEMPLATE_CODE` | `{COGMEMORY_AD_ALIYUN_SMS_TEMPLATE_CODE}` | `{COGMEMORY_AD_ALIYUN_SMS_TEMPLATE_CODE}` | 未配置 | 阿里云 SMS 发送参数口径，不写入真实模板号 |
| `ALIYUN_SMS_TEMPLATE_PARAM` | `{COGMEMORY_AD_ALIYUN_SMS_TEMPLATE_PARAM}` | `{COGMEMORY_AD_ALIYUN_SMS_TEMPLATE_PARAM}` | 未配置 | 阿里云 SMS 发送参数口径，不写入真实模板参数 |
| `ALIYUN_SMS_CODE_LENGTH` | `{COGMEMORY_AD_ALIYUN_SMS_CODE_LENGTH}` | `{COGMEMORY_AD_ALIYUN_SMS_CODE_LENGTH}` | 未配置 | 项目验证码策略示例 / 待确认配置，不是阿里云 SendSms API 必填字段 |
| `ALIYUN_SMS_VALID_TIME_SECONDS` | `{COGMEMORY_AD_ALIYUN_SMS_VALID_TIME_SECONDS}` | `{COGMEMORY_AD_ALIYUN_SMS_VALID_TIME_SECONDS}` | 未配置 | 项目验证码策略示例 / 待确认配置，不是阿里云 SendSms API 必填字段 |
| `ALIYUN_SMS_DUPLICATE_POLICY` | `{COGMEMORY_AD_ALIYUN_SMS_DUPLICATE_POLICY}` | `{COGMEMORY_AD_ALIYUN_SMS_DUPLICATE_POLICY}` | 未配置 | 项目验证码策略示例 / 待确认配置，不是阿里云 SendSms API 必填字段 |
| `ALIYUN_SMS_INTERVAL_SECONDS` | `{COGMEMORY_AD_ALIYUN_SMS_INTERVAL_SECONDS}` | `{COGMEMORY_AD_ALIYUN_SMS_INTERVAL_SECONDS}` | 未配置 | 项目验证码策略示例 / 待确认配置，不是阿里云 SendSms API 必填字段 |
| `ALIYUN_SMS_CODE_TYPE` | `{COGMEMORY_AD_ALIYUN_SMS_CODE_TYPE}` | `{COGMEMORY_AD_ALIYUN_SMS_CODE_TYPE}` | 未配置 | 项目验证码策略示例 / 待确认配置，不是阿里云 SendSms API 必填字段 |
| `ALIYUN_SMS_CASE_AUTH_POLICY` | `{COGMEMORY_AD_ALIYUN_SMS_CASE_AUTH_POLICY}` | `{COGMEMORY_AD_ALIYUN_SMS_CASE_AUTH_POLICY}` | 未配置 | 项目验证码策略示例 / 待确认配置，不是阿里云 SendSms API 必填字段 |
| `LLM_PROVIDER` | `bailian` | `bailian` | `stub` | LLM 占位配置，当前未实现真实大模型调用 |
| `BAILIAN_API_KEY` | `{BAILIAN_API_KEY}` | `{BAILIAN_API_KEY}` | 未配置 | 仅为占位，不写入真实 API Key |
| `BAILIAN_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 未配置 | 仅为 bailian 占位口径 |
| `BAILIAN_MODEL` | `qwen3.6-plus` | `qwen3.6-plus` | 未配置 | 仅为 bailian 占位口径 |

## 4. 安全与部署注意事项

- `.env.*.example` 只能保留占位值或示例值，不得写入真实密钥。
- development / production env example 保留阿里云 OSS 示例 / 待确认配置位，当前仅为配置占位，不代表 OSS Service 已实现。
- test env example 保持最小 fake 配置，不配置 OSS bucket 与对象前缀。
- production 默认 `STORAGE_DRIVER=oss`，`OSS_BUCKET` 仅使用 CogMemory AD 占位值。
- SMS 变量当前只保留阿里云 SMS 示例 / 待确认配置，不代表 SMS Service 已实现。
- `ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_TEMPLATE_CODE`、`ALIYUN_SMS_TEMPLATE_PARAM` 属于阿里云 SMS 发送参数口径，当前均为占位 / 待确认配置。
- `ALIYUN_SMS_CODE_LENGTH`、`ALIYUN_SMS_VALID_TIME_SECONDS`、`ALIYUN_SMS_DUPLICATE_POLICY`、`ALIYUN_SMS_INTERVAL_SECONDS`、`ALIYUN_SMS_CODE_TYPE`、`ALIYUN_SMS_CASE_AUTH_POLICY` 属于项目验证码策略示例 / 待确认配置，不是阿里云 SendSms API 必填字段。
- LLM 变量当前只保留 development / production 的 `bailian` 占位和 test 的 `stub` 口径，不代表 LLM Service 已实现。
- 测试环境不得依赖真实 OSS、真实短信或真实大模型服务。
- 生产 MongoDB 密码必须在真实环境中使用 URL 编码后的安全值，不得写入仓库。

## 5. 后续同步规则

- 新增或调整配置项时，应同步更新本文档和相关部署说明。
- 涉及密钥、个人信息、医疗数据或第三方服务的配置必须明确安全边界。
- 不得在文档中写入真实密钥、真实账号、真实患者信息或生产环境敏感配置。
