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

### D-007：一次性授权迁移后端 src 公共底座

- 日期：2026-07-04
- 决策：一次性授权从指定外部 GitHub commit `b302b8af7b7ac9cc558939dc1b38ace0976c65b3` 迁移后端 `src` 公共底座。仅继承 NestJS 启动、配置、异常、校验、MongoDB、Storage 等公共工程经验；排除业务模块、角色权限、业务流程、业务 DTO、业务 Service、业务 Schema 和业务 API。所有项目口径改造为 CogMemory AD / 智忆评。
- 背景：CogMemory AD 需要先具备可编译的 NestJS 后端公共底座，再进入后续业务模块设计。
- 影响范围：`backend\src` 公共底座、`backend\README.md` 和后端 handoff 文档。
- 后续复查点：后续新增认证、用户、医生、患者、量表、评估、报告、SMS、LLM 或业务上传能力时，必须以单独任务明确边界、接口、数据模型和测试。

### D-008：TypeScript 增量构建缓存不纳入版本库

- 日期：2026-07-05
- 决策：保留 `backend\tsconfig.json` 中 `rootDir: "./src"`，用于解决 TypeScript / VS Code 对源代码根目录的提示问题；显式将 `tsBuildInfoFile` 指向 `./dist/tsconfig.build.tsbuildinfo`，并将 `*.tsbuildinfo` 视为 TypeScript 增量构建缓存生成物，不纳入仓库跟踪。
- 背景：后端公共底座已完成本地验证，需要清理误入文件树的 `backend\tsconfig.build.tsbuildinfo`，并避免后续 build 再次带入增量构建缓存。
- 影响范围：`backend\.gitignore`、`backend\tsconfig.json`、后端 README 和 handoff 验证记录。
- 后续复查点：当前后端公共底座已通过 `npm install`、`npm run build`、`npm test -- --runInBand` 验证，验证结果为 3 个测试套件、9 个测试全部通过；lint 和 E2E 未执行，且本决策不代表任何业务模块已经实现。

### D-009：调整 TypeScript rootDir 以匹配生产启动产物路径

- 日期：2026-07-05
- 决策：为匹配 `package.json` 中 `start:prod` 指向的 `./dist/src/main.js`，将 backend TypeScript `rootDir` 从 `"./src"` 调整为 `"."`；`outDir` 保持 `./dist`，`tsBuildInfoFile` 保持 `./dist/tsconfig.build.tsbuildinfo`。本决策更新 D-008 中关于保留 `rootDir: "./src"` 的历史口径。
- 背景：当 `rootDir` 为 `"./src"` 且 `outDir` 为 `"./dist"` 时，`src/main.ts` 会编译到 `dist/main.js`，与当前 `start:prod` 查找的 `dist/src/main.js` 不一致。
- 影响范围：`backend\tsconfig.json`、后端 README 和后端 handoff 文档；不修改 `package.json`、`start:prod`、后端源码、测试、脚本或业务边界。
- 后续复查点：本次验证 `npm run build` 成功，并确认 `dist/src/main.js` 存在；`dist` 与 `*.tsbuildinfo` 继续作为生成物处理，不纳入版本库。本决策不代表真实生产环境启动已验证，也不代表任何业务模块已经实现。

### D-010：记录后端公共底座基础闭环验证通过

- 日期：2026-07-05
- 决策：在 `rootDir` 调整为 `"."` 且 `start:prod` 保持指向 `./dist/src/main.js` 后，用户已本地验证 `npm run start:prod` 启动成功。至此后端公共底座已完成 `npm install`、`npm run build`、`npm test -- --runInBand`、`npm run start:prod` 的基础闭环验证。
- 背景：`src/main.ts` 当前 build 产物为 `dist/src/main.js`，与 `start:prod` 启动路径一致；用户补充完成了本地 `start:prod` 启动验证。
- 影响范围：后端 README 和后端 handoff 文档的验证记录；不修改 package、tsconfig、后端源码、测试、脚本或业务边界。
- 后续复查点：该结论仅覆盖公共底座本地基础启动链路，不代表业务模块、E2E、lint、真实生产部署、OSS/SMS/LLM 集成或医疗业务能力已完成。

### D-011：先建设量表定义模型底座，不暴露公开 API

- 日期：2026-07-09
- 决策：后端 A1 先落地 `scales` 内部模块，建设 `ScaleDefinition` 与 `ScaleVersion` 数据模型和最小内部读取 Service；本阶段不新增 Controller，不暴露公开 HTTP API。
- 背景：通用量表引擎需要先具备量表定义、版本追溯、题目分组、题目配置、证据要求、报告展示规则和科研导出映射等模型承载能力，但当前阶段不实现 MMSE / MoCA 种子数据、评估执行、作答、计分、报告或 AI。
- 影响范围：`backend\src\app.module.ts`、`backend\src\modules\scales` 和后端 handoff 文档。
- 后续复查点：后续进入评估实例、作答记录、计分引擎、报告或 MMSE / MoCA 种子数据阶段时，应继续保持公开 API、数据模型、DTO、权限和测试边界清晰，并单独同步 handoff。

### D-012：建设患者 / 访视 / 量表实例运行时模型底座，不暴露公开 API

- 日期：2026-07-09
- 决策：后端 A2 落地 `patients` 与 `assessments` 内部模块，建设 `Patient`、`AssessmentVisit` 与 `ScaleInstance` 数据模型和最小内部读取 Service；本阶段不新增 Controller，不暴露公开 HTTP API。
- 背景：通用量表引擎在量表定义模型底座之后，需要具备患者 / 受试者、一次评估 / 访视、一次访视中的量表执行实例，以及量表定义和版本追溯快照的运行时承载能力，但当前阶段不实现真实患者建档流程、访视创建流程、MMSE / MoCA 种子数据、作答、媒体证据、计分、报告或 AI。
- 影响范围：`backend\src\app.module.ts`、`backend\src\modules\patients`、`backend\src\modules\assessments` 和后端 handoff 文档。
- 后续复查点：后续进入题目作答、媒体证据、计分引擎、报告、认证权限或公开业务 API 阶段时，应继续保持 Controller、DTO、数据模型、权限和测试边界清晰，并单独同步 handoff。

### D-013：建设题目作答数据模型底座，不暴露公开 API

- 日期：2026-07-09
- 决策：后端 A3 在 `assessments` 内部模块落地 `ItemResponse` 数据模型和最小内部读取 Service；本阶段不新增 Controller，不暴露公开 HTTP API。
- 背景：通用量表引擎在患者 / 访视 / 量表实例运行时模型之后，需要保存量表实例下单题作答的原始记录、结构化记录、单题得分、版本追溯、分步结果、提示后表现、计时、操作者备注、质控占位和证据引用占位，支持后续 MMSE / MoCA 的逐题采集和追溯；但当前阶段不实现作答提交、媒体证据模型、图片上传、平板手写保存、自动计分、认知域结果、报告或 AI。
- 影响范围：`backend\src\modules\assessments` 和后端 handoff 文档。
- 后续复查点：后续进入媒体证据、自动计分、认知域结果、报告、认证权限或公开业务 API 阶段时，应继续保持数据模型、Controller、DTO、权限和测试边界清晰，并单独同步 handoff。

### D-014：建设媒体证据模型底座，不暴露公开 API

- 日期：2026-07-09
- 决策：后端 A4 落地 `media` 内部模块，建设 `MediaEvidence` 数据模型和最小内部读取 Service；本阶段不新增 Controller，不暴露公开 HTTP API。
- 背景：通用量表引擎在题目作答数据模型之后，需要保存图片、扫描件、平板手写轨迹、音频或原始文本快照等证据材料的元数据，并通过 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ItemResponse` -> `MediaEvidence` 形成证据链；但当前阶段不实现媒体上传、下载、签名 URL、Storage 调用、媒体处理、自动计分、报告或 AI。
- 影响范围：`backend\src\app.module.ts`、`backend\src\modules\media` 和后端 handoff 文档。
- 后续复查点：后续进入媒体上传 / 平板手写保存、自动计分、认知域结果、报告、认证权限或公开业务 API 阶段时，应继续保持 Controller、DTO、数据模型、Storage 调用、权限和测试边界清晰，并单独同步 handoff。

### D-015：建设自动计分结果模型与通用计分汇总底座，不暴露公开 API

- 日期：2026-07-09
- 决策：后端 A5 落地 `scoring` 内部模块，建设 `ScoreResult` 数据模型、最小内部读取 Service 和 `summarizeItemScores()` 通用计分汇总纯函数；本阶段不新增 Controller，不暴露公开 HTTP API。
- 背景：通用量表引擎在媒体证据模型之后，需要保存一次 `ScaleInstance` 的计分结果快照，并通过 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ItemResponse` -> `ScoreResult` 形成计分结果追溯链；当前阶段只汇总已经给出的单题得分快照，不实现 MMSE / MoCA 专用计分规则、作答提交后自动计分触发、认知域结果、报告或 AI。
- 影响范围：`backend\src\app.module.ts`、`backend\src\modules\scoring` 和后端 handoff 文档。
- 后续复查点：后续进入 MMSE / MoCA 专用计分规则、认知域映射、报告、认证权限或公开业务 API 阶段时，应继续保持模型、Controller、DTO、权限、规则边界和测试边界清晰，并单独同步 handoff。

### D-016：建设认知域结果模型与通用认知域汇总底座，不暴露公开 API

- 日期：2026-07-09
- 决策：后端 A6 落地 `cognitive-domains` 内部模块，建设 `CognitiveDomainResult` 数据模型、最小内部读取 Service 和 `summarizeDomainScores()` 通用认知域汇总纯函数；本阶段不新增 Controller，不暴露公开 HTTP API。
- 背景：通用量表引擎在计分结果模型之后，需要保存一次 `ScaleInstance` 基于 `ScoreResult` 的认知域结果快照，并通过 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ScoreResult` -> `CognitiveDomainResult` 形成认知域结果追溯链；当前阶段只根据传入的单题得分快照和认知域映射快照做通用汇总，不实现 MMSE / MoCA 专用认知域规则、作答提交后自动认知域计算触发、疾病诊断、报告或 AI。
- 影响范围：`backend\src\app.module.ts`、`backend\src\modules\cognitive-domains` 和后端 handoff 文档。
- 后续复查点：后续进入 MMSE / MoCA 专用认知域规则、报告、认证权限或公开业务 API 阶段时，应继续保持模型、Controller、DTO、权限、规则边界和测试边界清晰，并单独同步 handoff。

### D-017：建设临床报告模型与医生确认流程底座，不暴露公开 API

- 日期：2026-07-09
- 决策：后端 A7 落地 `reports` 内部模块，建设 `ClinicalReport` 数据模型、最小内部读取 Service 和报告状态转换校验纯函数；本阶段不新增 Controller，不暴露公开 HTTP API。
- 背景：通用量表引擎在认知域结果模型之后，需要保存一次评估 / 访视下的临床报告快照，并通过 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ScoreResult` -> `CognitiveDomainResult` -> `ClinicalReport` 形成报告追溯链，同时在证据快照中保留 `ItemResponse` 与 `MediaEvidence` 引用；当前阶段只建设模型、内部读取和状态语义校验，不实现真实报告生成、医生确认写库、归档 / 更正 / 作废写库、AI 报告或 PDF 导出。
- 影响范围：`backend\src\app.module.ts`、`backend\src\modules\reports` 和后端 handoff 文档。
- 后续复查点：后续进入报告生成接口、医生确认接口、报告归档 / 更正 / 作废流程、AuditLog、AI 报告、PDF 导出、认证权限或公开业务 API 阶段时，应继续保持 Controller、DTO、权限、状态流转写库、审计和测试边界清晰，并单独同步 handoff。

### D-018：建设 MMSE / MoCA 初始配置种子数据底座，不暴露公开 API

- 日期：2026-07-10
- 决策：后端 A8 在 `scales` 内部模块落地 MMSE / MoCA 初始配置 seed 常量、只读 `ScaleSeedDataService` 和 `validateScaleSeeds()` 种子数据校验纯函数；本阶段不新增 Controller，不暴露公开 HTTP API，不执行数据库 seed 写入。
- 背景：通用量表引擎在量表定义、运行时、作答、媒体证据、计分、认知域和报告模型底座之后，需要先具备可追溯的 MMSE / MoCA 初始配置数据，覆盖分组、题目、指导语、作答类型、分值范围、证据要求、计时、原始记录、操作者备注、规则元数据、认知域映射、质控 / 报告 / 科研导出映射，并记录 `MMSE+MoCA.pdf` 来源和已确认的 PDF / CRF 编号修正。
- 影响范围：`backend\src\modules\scales` 和后端 handoff 文档。
- 后续复查点：后续如进入数据库 seed runner、公开配置查询 API、MMSE / MoCA 评估执行页面、作答提交、自动计分触发、认知域计算触发、报告生成、AI、认证权限或科研导出阶段，应以单独任务明确 Controller、DTO、权限、写库边界、规则执行边界和测试口径，并单独同步 handoff。

### D-019：建设评估执行工作流内部编排底座，不暴露公开 API

- 日期：2026-07-10
- 决策：后端 A9 在 `assessments` 内部模块落地 `AssessmentExecutionService`，基于 MMSE / MoCA seed 构建评估执行初始化计划，并在内部方法中创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；本阶段不新增 Controller，不暴露公开 HTTP API。
- 背景：在 A8 已具备 MMSE / MoCA seed 只读配置后，需要先形成评估执行初始化的内部编排底座，使后续公开评估流程或页面可以复用同一套版本追溯、题目快照、score 初始占位、分步记录、提示后表现、计时与证据占位口径。
- 影响范围：`backend\src\modules\assessments` 和后端 handoff 文档；`AssessmentsModule` 为注入 `ScaleSeedDataService` 最小导入 `ScalesModule`。
- 后续复查点：本阶段不实现事务、幂等、并发控制、作答提交、媒体上传、自动计分触发、认知域计算触发、报告生成、AI、认证或权限。后续如进入公开业务 API 或真实评估工作流，应单独确认 Controller、DTO、权限、Mongo session / transaction 或补偿策略、幂等策略和测试口径。

## 4. 后续同步规则

- 新增关键技术选型、接口设计、数据模型、测试策略或部署策略后，应追加决策记录。
- 未确认的技术版本、接口设计或数据模型不得写成决策。
- 决策记录应简洁、可追溯，并指向实际代码或业务文档依据。
