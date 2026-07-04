# CogMemory AD / 智忆评 后端关键决策记录

## 1. 文档定位

本文档用于记录 CogMemory AD 后端方向的关键工程决策、约束来源、影响范围和后续复查点。

## 2. 决策记录格式

后续每条决策建议按以下格式记录：

- 编号：
- 日期：
- 决策：
- 背景：
- 影响范围：
- 后续复查点：

## 3. 当前决策记录

### D-001：后端工程治理遵循 docs 下通用宪法文档

- 日期：2026-07-03
- 决策：后端相关实现、验证与交接同步应遵循 `docs` 下通用宪法文档。
- 背景：当前 handoff 处于初始化阶段，需要先建立治理基线。
- 影响范围：后端代码、接口、DTO、数据模型、测试和 handoff 文档同步。
- 后续复查点：后端工程初始化后，结合实际代码补充更具体的后端决策。

### D-002：handoff 只继承既有项目的文档治理方法

- 日期：2026-07-03
- 决策：本项目 handoff 只参考既有项目的 handoff 治理经验，不继承外部项目业务事实。
- 背景：CogMemory AD / 智忆评是独立项目，业务事实、接口事实、角色事实、数据模型事实、配置事实和阶段事实均需由本项目后续确认。
- 影响范围：全部 handoff 文档。
- 后续复查点：后续补充内容时持续检查是否误写外部项目业务事实。

### D-003：后端根目录公共骨架采用 CogMemory AD 口径初始化

- 日期：2026-07-03
- 决策：CogMemory AD 后端根目录公共骨架采用既有 NestJS 工程骨架经验进行初始化，但仅迁移工程治理与公共配置形态，不继承外部项目业务事实；项目标识、端口、数据库命名、OSS bucket 占位和 session cookie 均改为 CogMemory AD 口径。
- 背景：当前任务只处理 `backend` 根目录公共骨架文件，不初始化 `src`、`test`、`scripts` 或任何业务模块。
- 影响范围：`backend` 根目录包管理、环境示例、工程配置和后端 handoff 文档。
- 后续复查点：后续初始化后端代码目录时，应继续避免继承外部项目业务事实，并按实际代码同步 handoff。

### D-004：统一后端配置口径为 backend 5002 / frontend 3002

- 日期：2026-07-04
- 决策：后端默认端口统一为 `5002`；前端本地默认端口统一为 `3002`，本地 `FRONTEND_URL` / `CORS_ORIGIN` 统一为 `http://localhost:3002`；OSS 与 SMS 配置先按 CogMemory AD 占位口径统一，fake 存储 env 和阿里云 SMS 占位细节后续由 D-005 修正；LLM 仅保留 development / production 的 `bailian` 占位和 test 的 `stub` 口径。
- 背景：后端根目录公共骨架迁移后，env example、README 与 handoff 中存在端口、OSS 前缀、SMS 和 LLM 配置口径不一致，需要在不初始化业务代码的前提下统一。
- 影响范围：`backend\.env.*.example`、`backend\README.md` 和后端 handoff 配置说明。
- 后续复查点：后续真实接入 OSS、SMS 或 LLM 前，必须新建或确认 CogMemory AD 专用资源，并同步更新 env example 与 handoff；本决策不代表 OSS Service、SMS Service 或 LLM Service 已实现。

### D-005：修正 fake 存储 env 口径与阿里云 SMS 占位

- 日期：2026-07-04
- 决策：development / test 默认 `STORAGE_DRIVER=fake` 时，不在 env example 中显式配置 `OSS_BUCKET` / `OSS_OBJECT_PREFIX`；production 的 `OSS_BUCKET` 保持 CogMemory AD 占位，`OSS_OBJECT_PREFIX` 保持 `cogmemory_ad`；SMS 变量保留为阿里云 SMS 示例 / 待确认配置，全部使用 `COGMEMORY_AD_ALIYUN_SMS_*` 占位符。
- 背景：dev/test env example 不应保留看似真实但尚未确认的 OSS bucket；短信配置也需要明确为阿里云 SMS 方向的配置预留。
- 影响范围：`backend\.env.*.example`、`backend\README.md` 和后端 handoff 配置说明。
- 后续复查点：后续真实接入 OSS 或 SMS 前，必须确认 CogMemory AD 专用 OSS bucket 和阿里云 SMS 签名、模板、参数口径；本决策不代表 OSS Service 或 SMS Service 已实现。

### D-006：恢复阿里云 OSS / SMS 示例配置位并保持占位口径

- 日期：2026-07-04
- 决策：修正 `7e1b298` 中对阿里云配置位的过度收缩。development / production env example 保留阿里云 OSS 与阿里云 SMS 示例 / 待确认配置位；test env example 保持最小 fake 配置，不显式配置 `OSS_BUCKET` / `OSS_OBJECT_PREFIX`，也不加入用户明确不需要的 fake storage 默认值说明或真实 OSS bucket 后续替换说明。SMS 计划使用阿里云 SMS，但当前所有字段均为占位或待确认配置，不代表 SMS Service 已实现。
- 背景：env example 需要保留后续对接阿里云 OSS / SMS 时的配置位置，但不得写入真实密钥、真实短信签名、真实模板号、真实模板参数或真实 bucket。
- 影响范围：`backend\.env.*.example`、`backend\README.md` 和后端 handoff 配置说明。
- 后续复查点：后续真实接入 OSS、SMS 或 LLM 时，必须以单独任务实现服务代码并同步配置校验、测试和 handoff；本决策不代表 OSS Service、SMS Service 或 LLM Service 已实现。

## 4. 后续同步规则

- 新增关键技术选型、接口设计、数据模型、测试策略或部署策略后，应追加决策记录。
- 未确认的技术版本、接口设计或数据模型不得写成决策。
- 决策记录应简洁、可追溯，并指向实际代码或业务文档依据。
