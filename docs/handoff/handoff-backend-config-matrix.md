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
| `STORAGE_DRIVER` | `fake` | `oss` | `fake` | 当前仅为公共配置口径 |
| `OSS_BUCKET` | 不需要 | `{COGMEMORY_AD_OSS_BUCKET}` | 不需要 | 仅 `STORAGE_DRIVER=oss` 时需要；真实 bucket 待后续为 CogMemory AD 新建后替换 |
| `OSS_OBJECT_PREFIX` | 不需要 | `cogmemory_ad` | 不需要 | fake 模式使用代码默认 fake storage 配置 |
| `SESSION_COOKIE_NAME` | `cogmemory_ad_session` | `cogmemory_ad_session` | `cogmemory_ad_session` | 会话 Cookie 名称示例 |
| `ALIYUN_SMS_ACCESS_KEY_ID` | `{COGMEMORY_AD_ALIYUN_SMS_ACCESS_KEY_ID}` | `{COGMEMORY_AD_ALIYUN_SMS_ACCESS_KEY_ID}` | 未配置 | 阿里云 SMS 示例 / 待确认配置，当前未实现 SMS Service |
| `ALIYUN_SMS_ACCESS_KEY_SECRET` | `{COGMEMORY_AD_ALIYUN_SMS_ACCESS_KEY_SECRET}` | `{COGMEMORY_AD_ALIYUN_SMS_ACCESS_KEY_SECRET}` | 未配置 | 阿里云 SMS 示例 / 待确认配置，当前未实现 SMS Service |
| `ALIYUN_SMS_SIGN_NAME` | `{COGMEMORY_AD_ALIYUN_SMS_SIGN_NAME}` | `{COGMEMORY_AD_ALIYUN_SMS_SIGN_NAME}` | 未配置 | 阿里云 SMS 示例 / 待确认配置，不写入真实短信签名 |
| `ALIYUN_SMS_TEMPLATE_CODE` | `{COGMEMORY_AD_ALIYUN_SMS_TEMPLATE_CODE}` | `{COGMEMORY_AD_ALIYUN_SMS_TEMPLATE_CODE}` | 未配置 | 阿里云 SMS 示例 / 待确认配置，不写入真实模板号 |
| `ALIYUN_SMS_TEMPLATE_PARAM` | `{COGMEMORY_AD_ALIYUN_SMS_TEMPLATE_PARAM}` | `{COGMEMORY_AD_ALIYUN_SMS_TEMPLATE_PARAM}` | 未配置 | 阿里云 SMS 示例 / 待确认配置，不写入真实模板参数 |
| `LLM_PROVIDER` | `bailian` | `bailian` | `stub` | LLM 占位配置，当前未实现真实大模型调用 |
| `BAILIAN_API_KEY` | `{BAILIAN_API_KEY}` | `{BAILIAN_API_KEY}` | 未配置 | 仅为占位，不写入真实 API Key |
| `BAILIAN_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 未配置 | 仅为 bailian 占位口径 |
| `BAILIAN_MODEL` | `qwen3.6-plus` | `qwen3.6-plus` | 未配置 | 仅为 bailian 占位口径 |

## 4. 安全与部署注意事项

- `.env.*.example` 只能保留占位值或示例值，不得写入真实密钥。
- development / test 默认 `STORAGE_DRIVER=fake`，不需要 `OSS_BUCKET` / `OSS_OBJECT_PREFIX`，fake 模式使用代码默认 fake storage 配置。
- production 默认 `STORAGE_DRIVER=oss`，`OSS_BUCKET` 当前不代表 OSS 已正式开通，真实 bucket 待后续新建后替换。
- production 的 `OSS_OBJECT_PREFIX` 为 `cogmemory_ad`，不代表 OSS Service 已实现。
- SMS 变量当前只保留阿里云 SMS 示例 / 待确认配置，不代表 SMS Service 已实现。
- LLM 变量当前只保留 development / production 的 `bailian` 占位和 test 的 `stub` 口径，不代表 LLM Service 已实现。
- 测试环境不得依赖真实 OSS、真实短信或真实大模型服务。
- 生产 MongoDB 密码必须在真实环境中使用 URL 编码后的安全值，不得写入仓库。

## 5. 后续同步规则

- 新增或调整配置项时，应同步更新本文档和相关部署说明。
- 涉及密钥、个人信息、医疗数据或第三方服务的配置必须明确安全边界。
- 不得在文档中写入真实密钥、真实账号、真实患者信息或生产环境敏感配置。
