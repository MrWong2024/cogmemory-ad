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
- 已确认编号口径：MMSE“表达”为第 9 项，MMSE“绘图”为第 10 项；MoCA 两个抽象项分别为 `N1.2.12.1`（火车和自行车）与 `N1.2.12.2`（手表和秤）。内部稳定语义编码与 CRF 映射分离，CRF 编码用于经确认的追溯和导出映射。
- 资料治理与访问口径：项目“来源”中的 `MMSE+MoCA.pdf` 是 MMSE / MoCA 的权威原始资料；仓库根目录与 `docs`、`backend`、`frontend` 同级的 `.local/reference/MMSE+MoCA.pdf` 仅是供 Codex 读取的本地工作镜像，不是第二套独立业务基线，并由根目录 `.gitignore` 的 `/.local/reference/` 排除，不进入 Git。涉及题项、指导语、评分规则、CRF 编码、图片素材或种子数据时，必须在核对最新代码和 handoff 所载当前实现事实的同时实际参阅该 PDF，不得只依据既有 seed、页面、handoff、代码命名或模型记忆推断。
- 冲突处理口径：PDF 是权威原始资料，但其原始编号、排版错误或明显笔误不得反向覆盖已确认并落地的上述编号修正、内部稳定语义编码或当前业务契约。如项目来源、本地工作镜像、handoff 与代码之间出现无法合理解释的不一致，后续任务必须停止相关实现并报告差异，不得由 Codex 自行选择某一版本覆盖现有契约。
- 影响范围：`backend\src\modules\scales` 和后端 handoff 文档。
- 后续复查点：后续如进入数据库 seed runner、公开配置查询 API、MMSE / MoCA 评估执行页面、作答提交、自动计分触发、认知域计算触发、报告生成、AI、认证权限或科研导出阶段，应以单独任务明确 Controller、DTO、权限、写库边界、规则执行边界和测试口径，并单独同步 handoff。

### D-019：建设评估执行工作流内部编排底座，不暴露公开 API

- 日期：2026-07-10
- 决策：后端 A9 在 `assessments` 内部模块落地 `AssessmentExecutionService`，基于 MMSE / MoCA seed 构建评估执行初始化计划，并在内部方法中创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；本阶段不新增 Controller，不暴露公开 HTTP API。
- 背景：在 A8 已具备 MMSE / MoCA seed 只读配置后，需要先形成评估执行初始化的内部编排底座，使后续公开评估流程或页面可以复用同一套版本追溯、题目快照、score 初始占位、分步记录、提示后表现、计时与证据占位口径。
- 影响范围：`backend\src\modules\assessments` 和后端 handoff 文档；`AssessmentsModule` 为注入 `ScaleSeedDataService` 最小导入 `ScalesModule`。
- 后续复查点：本阶段不实现事务、幂等、并发控制、作答提交、媒体上传、自动计分触发、认知域计算触发、报告生成、AI、认证或权限。后续如进入公开业务 API 或真实评估工作流，应单独确认 Controller、DTO、权限、Mongo session / transaction 或补偿策略、幂等策略和测试口径。

### D-020：建设认证、用户、会话与角色权限模型底座，不暴露公开认证 API

- 日期：2026-07-10
- 决策：后端 A10 新增 `users` 与 `auth` 内部模块，主登录态遵循服务端 Session + HttpOnly Cookie 口径；本阶段只建设 `User` / `Session` 模型、内部 `UsersService`、内部 `AuthService`、认证上下文、`@Public()` / `@Roles()` / `@CurrentUser()` 装饰器、`SessionAuthGuard` 与 `RolesGuard` 底座。
- 背景：A1-A9 已完成量表、患者、评估、作答、媒体、计分、认知域、报告和评估执行初始化内部模型 / Service 底座，后续公开业务接口需要先具备系统账号、服务端会话、密码哈希、会话校验和角色 Guard 的后端基础能力。
- 影响范围：`backend\src\app.module.ts`、`backend\src\modules\users`、`backend\src\modules\auth` 和后端 handoff 文档。
- 后续复查点：本阶段不新增 Controller，不暴露登录、登出、auth me、users me、公开用户管理或权限管理 API；不使用 JWT 作为主登录态；不设置或清除 Cookie；不注册全局 Guard；不影响 A10 当时唯一公开接口 `GET /health`。A11 公开认证 API 决策已单独记录为 D-021。

### D-021：建设最小公开认证 API 底座并统一 Session Cookie 名称

- 日期：2026-07-10
- 决策：后端 A11 在 `auth` 模块新增 `AuthController`，公开 `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`；AuthModule 内部 Cookie 名称统一为 `cogmemory_ad_session`，登录成功下发 HttpOnly Cookie，主登录态继续采用服务端 Session + HttpOnly Cookie，不采用 JWT 主登录态。
- 背景：A10 已具备 `users` / `auth` 认证、用户、会话和角色权限模型底座，但尚无公开登录、登出和认证探针接口；A11 需要形成最小后端认证 API 闭环，同时与当前项目配置默认 Cookie 口径对齐。
- 影响范围：`backend\src\modules\auth`、`backend\src\modules\users` 相关测试和后端 handoff 文档。
- 后续复查点：本阶段不注册全局 Guard，不影响 `GET /health`；不新增 UsersController；不实现用户管理、注册、密码重置、短信验证码、OAuth / SSO、前端登录页、前端认证态或权限菜单；后续如接入前端认证态、CSRF / CORS 策略、用户管理或业务接口鉴权，应以单独任务明确边界、测试和文档同步。

### D-022：建设第一组受保护临床业务 API

- 日期：2026-07-10
- 决策：后端 A12 在 `patients` / `assessments` 模块公开患者列表、创建、详情和患者访视列表、创建五个最小 API；所有接口统一使用服务端 Session，并显式绑定 `SessionAuthGuard`、`RolesGuard` 与 `@Roles('admin', 'doctor', 'nurse', 'research_assistant')`。
- 背景：A2 已具备 Patient / AssessmentVisit 模型底座，A10 / A11 已具备服务端 Session 和角色 Guard，需要形成第一组可由临床工作流角色访问的真实业务 HTTP 闭环。
- 影响范围：`backend\src\modules\patients`、`backend\src\modules\assessments`、`backend\test` 和指定 backend handoff / roadmap 文档；不修改 Schema、认证 API、全局 Guard、前端或配置。
- 安全决策：患者 / 访视公开响应使用显式 mapper，不暴露 arbitrary Mixed 字段 `externalRefs`、`metadata`、`clinicalContext`；访视 patientId / subjectCode / status / operatorSnapshot 由服务端所有，其中 operatorSnapshot 从当前认证用户生成。
- 错误与并发决策：患者编号和访视编号既做创建前检查，也捕获 MongoDB duplicate key 竞态，并分别稳定映射为 `PATIENT_SUBJECT_CODE_CONFLICT`、`VISIT_CODE_CONFLICT`；患者不存在、非 active 和非法日期范围使用稳定业务 code。
- 后续复查点：本阶段不开放患者或访视更新、删除、归档 / 状态流转，不开放量表实例初始化、作答提交、媒体上传、计分、认知域计算、报告或 AI；后续扩展必须以单独任务确认 DTO、权限、事务 / 幂等和审计边界。

### D-023：建设访视详情、可用量表目录与量表执行初始化最小公开 API

- 日期：2026-07-10
- 决策：后端 A13 新增 `GET /scales/available`、`GET /patients/:patientId/visits/:visitId`、`POST /patients/:patientId/visits/:visitId/scale-instances`；三个接口显式使用 `SessionAuthGuard`、`RolesGuard` 和四个临床工作流角色。
- 目录与物化决策：可用目录来自经 `validateScaleSeeds()` 校验的 MMSE / MoCA seed，GET 目录不写数据库；第一次初始化对应版本时按 definition code 和 definitionId + version 使用 `$setOnInsert` 幂等物化，已有配置只复用不覆盖，追溯或 group / item 数量冲突直接返回 409。该能力不是全量 seed runner，不在应用启动时执行。
- 运行时决策：同访视同 scaleCode 在 A13 只允许一份实例；instanceNo 固定 1，instanceCode、subjectCode、definition / version 引用、状态、版本追溯和 operatorSnapshot 均由服务端生成。只有 active 患者和 draft / in_progress 访视可以初始化。
- 一致性决策：`ScaleInstance` 创建后如 `ItemResponse.insertMany()` 失败，按本次 scaleInstanceId 尝试清理题目和实例并重新抛错；当前使用补偿式一致性，没有使用 Mongo transaction，也不宣称严格事务原子性。后续生产部署采用 replica set 时可重新评估 transaction。
- 安全决策：所有公开响应使用显式 mapper；目录不返回完整题目、评分规则或 expectedValue，访视 / 初始化不返回 definition / version ObjectId、Mixed 内部字段或 ItemResponse 全量骨架。
- 影响范围：`backend\src\modules\scales`、`backend\src\modules\assessments`、A13 E2E 和指定 backend handoff / roadmap；未修改 Schema、认证 API、全局 Guard、前端、依赖或环境配置。
- 后续复查点：前端访视详情 / 量表初始化尚未接入；本阶段不开放单实例执行详情、作答查询 / 保存 / 提交、媒体、计时、状态流转、计分、认知域、报告或 AI。

### D-024：开放单实例执行详情与单题作答草稿保存最小公开 API

- 日期：2026-07-10
- 决策：后端 A14 新增单实例执行详情 GET 与单题 ItemResponse 草稿 PATCH；两个接口显式使用 `SessionAuthGuard`、`RolesGuard` 和四个临床工作流角色。执行详情可读历史状态，PATCH 只允许 active Patient、draft / in_progress Visit 与 ScaleInstance、not_started / in_progress / answered ItemResponse。
- 安全决策：公开 mapper 只输出施测所需的题目身份、显式安全 config、现有草稿、既有 step / prompt 槽位、timing 和证据要求状态；不开放完整 itemConfigSnapshot / scoringRule，不返回 expectedValue、正确答案、score、isCorrect、scoreValue、metadata 或内部引用。客户端非白名单字段由全局 ValidationPipe 拒绝，JSON 草稿经过递归安全校验和克隆。
- 写入与状态决策：草稿只原子更新单条 ItemResponse；not_started 在有效草稿后进入 in_progress，markAsAnswered=true 且存在有效作答后进入 answered，answered 后编辑不回退。本阶段不产生 scored，不修改评分字段，不自动修改 AssessmentVisit / ScaleInstance 状态或 startedAt。
- 进度决策：totalItemCount 使用实例下实际 ItemResponse 数量，answeredItemCount 统计 answered / scored；A13 访视详情、A14 详情与 PATCH 响应实时派生，不依赖或回写 ScaleInstance.progress Mixed 快照。
- 并发与非目标：本阶段不新增 revision、If-Match、transaction 或多操作者冲突解决；不实现整份量表最终提交、批量 / 自动保存、媒体、计分、认知域、报告或 AI。最终提交与锁定阶段需重新评估版本控制和审计。
- 影响范围：仅 `backend\src\modules\assessments`、A14 E2E 与指定 backend handoff / roadmap；未修改 Schema、其他业务模块、前端、依赖、环境配置或全局 Guard。

### D-025：开放 photo / handwriting 题目级媒体证据最小公开闭环

- 日期：2026-07-10
- 决策：后端 A15 由服务端接收 multipart 并通过既有 Storage abstraction 写入对象；首阶段只允许 photo / handwriting。photo 只允许 photo_upload / paper_scan；handwriting 只允许 tablet_handwriting，必须有最终渲染图片，轨迹 JSON / strokes 可选且不接受 SVG。
- 单证据决策：同一 ItemResponse、同一 evidenceType 只允许一份 attached / locked 当前有效证据；并发边界由 evidenceRefs 中 mediaEvidenceId 为空且状态 pending / missing 的条件原子更新形成，不依赖新增唯一索引。替换流程为先作废再重新上传，不提供原子替换 API。
- 隐私与文件决策：主图只允许 JPEG / PNG / WebP，校验魔数与 MIME 一致并拒绝 EXIF / XMP / PNG 文本元数据；本阶段不重编码。服务端计算 SHA-256，不保存原始文件名；objectKey 只含受控前缀、内部 ObjectId 和 UUID，不含患者隐私。公开 mapper 不返回 objectKey、bucket、originalFilename、trajectoryObjectKey、metadata 或 Storage 凭据。
- 访问与作废决策：访问使用固定短期签名地址，不提供永久 URL 或自定义有效期。作废把 MediaEvidence 标记 voided、evidenceRef 恢复 pending，并保留存储对象和审计记录；正常作废不调用 deleteObject，voided 证据不可签名访问。
- 一致性决策：上传采用 Storage -> MediaEvidence -> evidenceRef 的补偿式编排，失败只清理本次记录和本次对象；作废先清引用、再标记证据，后者失败尝试恢复引用。没有使用 Mongo transaction，不宣称严格事务原子性，不删除其他证据或其他患者 / 访视 / 实例 / 题目数据。
- 状态与非目标：上传 / 作废要求 active Patient、draft / in_progress Visit 与 ScaleInstance、not_started / in_progress / answered ItemResponse；只读允许历史状态。A15 不修改 ItemResponse / ScaleInstance / AssessmentVisit 状态，不评分；不实现前端采集、PDF / SVG / 音视频、批量 / 分片 / 客户端直传、物理删除、质量审核、OCR / AI、最终提交、认知域或报告。
- 影响范围：`backend\src\modules\media`、`AssessmentsService` 的三项 evidenceRef 原子方法、A15 E2E 与指定 backend handoff / roadmap；未修改任何 Schema、Storage interface / driver、认证模块、全局 Guard、依赖、环境配置或前端。

### D-026：提交与评分解耦，先完整性检查再完成 ScaleInstance

- 决策：A16 公开只读 submission readiness 与显式确认 submit。所有 ScaleVersion 项目（包括 countsTowardTotal=false 的临床过程项）都必须完成或明确 missing；提示槽位不猜测是否施用，不强制全部填写。
- 完整性：有效作答认 false / 0，拒绝空字符串 / 空数组 / 空对象；missing 题要求原因并跳过 step / timing / media / note；已有 countsTowardItemScore=true step 必填。requiresTimer / duration 要求有效非负整数 durationMs。
- 媒体与备注：photo / handwriting 同时要求时视为替代采集方式 one_of，单独要求时必须对应 attached；只信任 evidenceRefs 的 attached + mediaEvidenceId 配对，不查询 MediaEvidence。requiresOperatorNote / operator_note 在提交阶段执行。
- 状态：首次提交只把 ScaleInstance 设为 completed，不设 locked，不完成或锁定 Visit，不修改 ItemResponse。提交审计进入服务端受控 metadata.submission 点路径，保留 operatorSnapshot 与其他 metadata。
- 幂等与一致性：completed 重复 submit 返回同一审计；提交前二次实时 readiness + 单实例条件原子更新降低竞态。当前不使用 Mongo transaction、跨集合事务或分布式锁，不宣称严格事务线性化。
- 非目标：不撤销、reopen、lock、force submit，不执行自动 / 手工评分，不创建 ScoreResult / CognitiveDomainResult / ClinicalReport；后续 A17 才进入评分阶段。
- 影响范围：仅 assessments 模块、A16 E2E 与指定 backend handoff / roadmap；未修改 Schema、auth / patients / scales / media / scoring / reports、依赖、环境配置、AppModule 或前端。

### D-027：completed 实例采用保守混合阶段性评分，人工确认后置

- 日期：2026-07-11
- 决策：A17 只对 completed ScaleInstance 首次创建 runNo=1 阶段性 ScoreResult；提交与评分继续解耦，结果即使全部自动计算也不在 A17 confirmed / locked，`isFinal=false`。
- 自动评分边界：量表通用纯引擎只识别真实 seed 中严格 `multi_step_manual`。expected / actual 仅允许同类型 finite number 或 boolean；MMSE 按正确步骤 maxScore 求和，MoCA 只支持当前 `correctStepCount` 或 `correctStepCountMin/Max` 数组聚合。不做字符串匹配 / 转换，不按 scaleCode / itemCode 分支，不执行表达式。
- 保守复核：manual_exact_match 与其他人工模式、未知模式、missing、既有 ItemResponse 题分均不猜分并进入 reviewQueue；`countsTowardTotal=false` / raw_record_only 过程项排除且不进复核。待复核项不按 0 分处理。
- 阶段性得分：total / group 只累计可靠评分项；存在未评分或待复核计分项时 scorePercent=null、isComplete=false，避免部分得分除以总满分形成误导。group 不是认知域结果。
- 幂等与一致性：computed / needs_review / confirmed / locked 返回既有结果；draft / voided 拒绝。创建不使用临时 draft，依赖 `{ scaleInstanceId, runNo }` 唯一索引，duplicate key 后重读；不使用 Mongo transaction 或分布式锁，不支持重跑。
- 数据与隐私：A17 只创建 ScoreResult，不覆盖 ItemResponse，不修改 Patient / Visit / Instance / step / prompt / media。public mapper 不返回作答、答案 / expectedValue、scoringRule、isCorrect、ItemResponse.score、metadata / qualityHints 或 reviewer。
- 非目标：不做教育年限校正、诊断阈值 / 结论、人工评分录入 / 修改 / 确认 / 锁定 / 作废 / 重跑，不创建 CognitiveDomainResult / ClinicalReport，不调用 AI。A18 再设计可审计人工复核与评分确认。
- 影响范围：仅 scoring 模块、A17 E2E 与指定 backend handoff / roadmap；未修改任何 Schema、seed、AssessmentsService、其他业务模块、AppModule、依赖、环境配置或前端。

### D-028：自动评分与人工复核分离，并以显式确认完成评分闭环

- 日期：2026-07-11
- 决策：A18 只允许对 ScoreResult 内 countsTowardTotal=true 的 needs_review / manual_scored 项目执行单题人工复核；auto_scored、not_scored 和过程项不可人工覆盖。人工分值按实例当前绑定 ScaleVersion 的 scoreRange / step 验证，不从原始作答建议或重新自动判分。
- 审计：每次人工修改向 `metadata.a18ManualReview.events` 追加 randomUUID 受控事件，保留旧事件和其他 metadata，单结果上限 500。内部事件可保存 previousScoreValue，但公开响应只显示每题最新操作者、时间和意见；不公开 metadata、完整历史或 previousScoreValue。
- 汇总：单题更新后始终复用 `summarizeItemScores()` 从 ScoreResult.itemScores 重新派生 total / group / scorePercent，并按 auto / manual 当前组成派生 scoringSource。客户端不能提交 item / group / total、status、quality 或 reviewer。
- 并发：manual-review 与 confirm 都要求 expectedUpdatedAt，并把 ScoreResult.updatedAt 与完整 ownership / runNo=1 / 状态加入同一次 findOneAndUpdate 条件；原子 miss 后重读并返回稳定 conflict，不自动覆盖或重试。不新增 revision Schema 字段，不使用 transaction 或分布式锁。
- 确认：全部计分项为 auto_scored / manual_scored 且实时汇总、range、source、percentage 与 A17 warning 检查通过后，必须由独立 confirm=true 操作进入 confirmed。confirmed 不等于 locked，不设置 lockedAt；confirmed / locked 重复确认幂等且不重写审计，缺 confirmedAt 的历史数据不猜测。
- 质量口径：确认成功的 qualityStatus=passed 仅表示评分结果完整性与人工复核流程通过，不表示患者正常、疾病诊断或报告结论。A19 再进入认知域结果；A18 不创建 CognitiveDomainResult / ClinicalReport，不实现诊断或 AI。
- 影响范围：仅 scoring 模块、A18 E2E 和指定 backend handoff / roadmap；未修改 Schema、seed、auth / patients / assessments / scales / media / cognitive-domains / reports、AppModule、依赖、环境配置或前端。

### D-029：认知域结果只基于确认评分快照并采用完整分值重叠归因

- 日期：2026-07-11
- 决策：A19 只允许当前 ScaleInstance 的 runNo=1、confirmed / locked ScoreResult 作为首次认知域计算来源；必须具备 confirmedAt、passed quality、reviewed、完整 total 和零 computation warning。只读取 ScoreResult.itemScores 安全快照，并与历史实例绑定 ScaleVersion 的 item set、countsTowardTotal、score range 和 cognitiveDomainCodes 完整校验；不重新读取原始作答、媒体或规则判分。
- mapping：首阶段只支持 mappingSource=scale_config、mappingMode=item_domain_codes、版本 `a19-item-domain-codes-1.0`。domain code trim + lowercase，同 item 同 domain 去重，weight 固定 1；单 item 多 domain 时把完整 score / max 分别归入每个 domain，不按 domain 数量拆分或平均，不引入 weighted_mapping 或客户端权重。
- 解释边界：多 domain 是重叠归因，不是重复计分错误；domain scores 不可跨 domain 求和解释为量表总分。scorePercent 只表示映射项目在合法 min/max 区间内的得分比例，不是正常率、疾病概率、风险等级或诊断结论。
- 结果与幂等：首次直接创建 runNo=1、status=computed、reviewStatus=not_required、qualityStatus=unchecked、isFinal=false 的最终派生文档；computed 不等于 confirmed / locked。computed / needs_review / confirmed / locked 既有结果幂等返回，draft / voided 拒绝；依赖既有唯一索引处理并发 duplicate key，不使用 transaction、分布式锁、临时 draft、重算或 runNo=2。
- 安全与隔离：public mapper 不返回 subjectCode、原始作答、规则、评分 / 确认意见、metadata、qualityHints、computedBy、原始 Mixed mappingRules、媒体地址、阈值或诊断。A19 不修改 Patient / Visit / ScaleInstance / ItemResponse / MediaEvidence / ScoreResult，不创建 ClinicalReport，不实现认知域人工修改、确认、锁定、作废、报告或 AI。
- 影响范围：仅 cognitive-domains 模块、A19 E2E 与指定 backend handoff / roadmap；未修改任何 Schema、seed、auth / patients / assessments / scales / scoring / media / reports / storage、AppModule、依赖、环境配置或前端。

### D-030：访视级报告由显式多量表 scope 生成规则化非 AI version 1 快照

- 日期：2026-07-11
- 资源与 scope：ClinicalReport 是 AssessmentVisit 级资源；一份报告可纳入同一访视 1-10 个 ScaleInstance。A20 由调用方显式选择 `primaryScaleInstanceIds`，服务端规范化、去重、验证完整归属并按 scaleCode / instanceNo / id 稳定排序；请求顺序不构成差异。
- 来源决策：首次生成只允许 active Patient、draft / in_progress / completed Visit、completed / locked Instance。每个实例必须有与历史 definition / version 完整绑定的 runNo=1 confirmed / locked 最终 ScoreResult，以及 runNo=1 computed / confirmed / locked、scale_config + item_domain_codes 的有效 CognitiveDomainResult。computed 域结果允许进入 draft，但报告必须明确其尚未独立确认；A20 不自动 compute、人工复核、确认或修复来源。
- 快照与解释：报告保存 patient / visit 白名单、历史量表 trace、确认评分、认知域和有效 photo / handwriting 媒体索引快照；visit clinicalContext 不复制、scoreDetails 固定 null、storageObjectKey 只内部。认知域沿用完整题分重叠归因，不跨域求和，scorePercent 不是诊断概率。
- 文本与 AI：narrative 为固定规则模板，只含 chief / score / domain / evidence / limitations；不读取原始作答、人工评分 / 确认意见、媒体备注、clinicalContext 或任意来源 Mixed 自由文本。`aiDraft.status=not_requested`、source=system_draft；不调用 LLM、不创建 AI 分析、不生成诊断阈值 / 结论、治疗建议或趋势分析。
- 版本与并发：A20 固定 reportType=cognitive_assessment、reportVersion=1、status=draft、isFinal=false。reportCode 由 `a20 + patientId + visitId + type + version` 的 SHA-256 前 24 位生成，不含隐私，并复用既有 unique 索引作为并发边界。同 scope 返回既有历史快照；不同 scope 冲突，不覆盖、不重生成、不创建 version 2。duplicate key 后重读；不使用 transaction、分布式锁或临时记录。
- 安全响应：public mapper 明确白名单，不返回 metadata、source ID 数组、scoreDetails、clinicalContext、storageObjectKey、AI draftText 或内部审计对象。generate / latest 显式使用 SessionAuthGuard、RolesGuard 与四个临床工作流角色；未注册全局 Guard。
- 影响范围：仅 reports 模块、A20 E2E 与指定 backend handoff / roadmap；未修改任何 Schema、来源业务模块、AppModule、依赖、配置或前端。
- 后续复查点：A20 不实现报告编辑、pending_confirmation、医生确认、签名、锁定、归档、更正、作废、历史列表、重生成、PDF 或 AI。前端 B10 可先接入 draft generate / latest；A21 / 后续阶段再单独设计编辑与医生确认边界。

### D-031：A21 只开放 clinician narrative，并分离提交与最终确认

- 决策：A20 五段系统规则摘要与 patient / visit / scale / score / domain / evidence 快照保持不可编辑；A21 只允许显式输入 doctorOpinion 和可选 recommendationText，首次成功编辑后 source=mixed。mixed 表示系统快照与人工补充共存，不表示 AI。
- 审计：编辑事件追加在 `metadata.a21Edits`，单报告最多 200 条；submission / confirmation 分别使用独立 UUID namespace。保留未知顶层 metadata，写入前严格验证 A20 generation 和既有 A21 namespace；不创建 AuditLog 集合。
- 并发：三个写接口使用服务端 `updatedAt` / 客户端 `expectedUpdatedAt` 乐观并发和单文档条件 `findOneAndUpdate`；不自动覆盖、合并或重试，不引入 revision 字段、transaction 或分布式锁。
- 状态：draft edit 与 submit 分离，submit 进入 pending_confirmation；仅 doctor / admin 可从 pending_confirmation 显式 confirm。A21 不公开 pending → draft、reject、withdraw 或 reopen。
- 最终性：确认后 status=confirmed、qualityStatus=passed、public isFinal=true；passed 只表示本阶段报告确认流程通过，不表示患者正常、诊断成立或来源结果锁定。
- 锁定边界：confirmed 不等于 locked。A21 不设置 lockedAt / signatureText，不锁定 Patient、Visit、ScaleInstance、ItemResponse、ScoreResult、CognitiveDomainResult 或 MediaEvidence，不实现 archive / correct / void / PDF / AI。

### D-032：ClinicalReport 锁定采用 confirmed 上的不可逆正交事实

- 状态决策：`ClinicalReportStatus` 不增加 locked。首次锁定后 status 保持 confirmed、isFinal 保持 true，以 lockedAt + lockedBy 表达锁定事实；锁定不创建新 reportVersion，也不等于 archive。
- 权限 / 输入：仅 doctor / admin 可显式 lock；客户端只提交 confirm、lockNote、expectedUpdatedAt，锁定 ID、时间和 actor 全由服务端生成。
- 一致性：以 updatedAt 乐观并发和一次 ClinicalReport `findOneAndUpdate()` 同时写 lockedAt、lockedBy、metadata.a22Lock；不使用 transaction、分布式锁、跨集合补偿或 AuditLog。
- 审计 / 幂等：a22Lock version=1 且只写一次，保留既有 metadata namespace；重复锁定只读返回原 lockId / time / actor / note，即使 expectedUpdatedAt 已旧也不重复写。历史完整 lockedAt + lockedBy 可受控 fallback，残缺或不一致审计拒绝猜测。
- 来源边界：锁定对象仅为当前 confirmed ClinicalReport 历史快照，不锁 Patient、Visit、ScaleInstance、ItemResponse、ScoreResult、CognitiveDomainResult、MediaEvidence 或 Storage，不重读来源或自动修复报告。
- 后续边界：unlock / reopen / return / reject、archive、correct、void、reportVersion=2、PDF 与 AI 均由后续独立阶段决定；A22 不提前实现。
- 后续复查点：前端 B11 可接入受控编辑、提交和 doctor / admin 确认；退回、签名、锁定、来源锁定、更正、归档与 PDF 必须另行设计权限、审计与一致性策略。

### D-033：来源冻结由已锁报告驱动并采用可恢复编排

- 发起点与 scope：只有完整 A22 已锁 ClinicalReport 可发起；scope 只读取报告已有四类来源字段，并补齐这些实例下全部 ItemResponse。首次把精确 ID 集合固化到 `metadata.a23SourceFreeze`，恢复期间不重新扩张或接受客户端 scope。
- 冻结表达：沿用五类 Schema 既有 status / lockedAt；ScaleInstance、ItemResponse、ScoreResult、MediaEvidence 迁移到 locked，CognitiveDomainResult computed/confirmed 只设置 lockedAt 并保留 status，不新增 frozen 状态或修改 Schema。
- 一致性：跨集合不使用 Mongo transaction。先原子写 `in_progress`，再按固定顺序执行幂等批量冻结，最后重读全部精确 ID 验证并写 `completed`；部分失败不 rollback / unfreeze，后续请求使用同 freezeId、scope、note 与 startedBy 恢复。
- 完成与公开：completed 前不宣称整体成功；完成后重复请求只读幂等。公开 report / receipt 仅展示安全 actor、时间、note、状态和 counts，不公开 metadata 或 source IDs。
- 边界：不冻结 Patient、AssessmentVisit、ScaleDefinition、ScaleVersion 或 Storage，不创建 AuditLog / job，不实现 unfreeze、PDF 或 AI。前端后续 B13 只消费确认交互、进度和安全摘要。

### D-034：归档复用既有 archived 状态并以 completed 来源冻结为不可变锚点

- 状态决策：A24 不新增状态、不修改 `ClinicalReportStatus` 或转换表；首次归档复用既有 `confirmed -> archived`，成功后 status=archived、isFinal=true。archivedAt 与 lockedAt 是不同事实，归档不创建 reportVersion=2，也不等于 PDF 或更正。
- 前置与 ownership：首次只接受完整 confirmed / mixed / passed、A22 已锁定且 A23 sourceFreeze completed 的 version 1 cognitive_assessment 报告。Patient / Visit 只用于资源存在性和 ownership，Patient inactive 与 Visit locked 不阻断；A24 不修改二者。
- 审计：`metadata.a24Archive` version=1 且只写一次，保存服务端 UUID / 时间、认证 doctor/admin actor、用户显式 archiveNote，以及 A23 freezeId / completedAt 锚点；构造新 metadata 根对象，保留 A20-A23 和未来未知合法 namespace，不创建 AuditLog 集合。
- 一致性：以 public report.updatedAt / expectedUpdatedAt 做乐观并发，并用一次 ClinicalReport `findOneAndUpdate()` 同时写 status、archivedAt、archivedBy、metadata。原子 filter 还锚定 ownership、type/version、confirmed/mixed/passed、锁定、无归档 / 作废 / correction、A23 completed 与 A24 namespace 不存在；不使用 transaction、分布式锁、自动重试或跨集合补偿。
- 幂等与历史：archived / corrected 重复请求只读返回原归档事实，即使 expectedUpdatedAt 已旧也不写库或修改 ID / 时间 / actor / note / updatedAt。历史完整 archivedAt + archivedBy 且无 a24Archive 时提供 role=unknown、nullable ID / source-freeze anchor 的安全 fallback，不补写 metadata；残缺或不一致审计拒绝猜测。
- 来源边界：A24 只解析已经完成的 A23 审计，不重新读取、冻结或修改 ScaleInstance、ItemResponse、ScoreResult、CognitiveDomainResult、MediaEvidence 或 Storage；lockedAt / lockedBy、a22Lock、a23SourceFreeze、confirmation、narrative、快照与来源 ID 全部不变。
- 后续边界：不实现 unarchive 或恢复 confirmed。后续 A25 可从 archived 建设独立受控更正流程；更正不是取消归档，也不能覆盖原归档报告。A24 不实现 correction、void、delete、PDF / Word / download 或 AI。下一阶段建议为前端 B14 归档确认与安全摘要展示。

### D-035：归档更正采用原报告保留、线性 replacement 与可恢复跨文档编排

- 原报告不原地覆盖：latest archived source 保留固定正文、快照、scope、confirmation、lock、freeze、archive、code 与 version，完成时只转 corrected、追加一条版本替换 correctionRecords 并完成 a25Correction。
- 版本链严格线性：replacementVersion=sourceVersion+1，correctionNo=replacementVersion-1，code 复用确定性 builder；同 source / visit-type-version 只允许一个 replacement，不允许跳号、分支、merge、delete 或 cancel。
- replacement 固定复制历史快照和 A20 provenance，重置为 draft / mixed / needs_review 与空后续生命周期；a25CorrectionReplacement 保存 previous relation、原发起 actor / reason / summary 与 A24/A23 anchors，不复制 A21-A24 lifecycle metadata。
- 编排不是 transaction：source 先原子 start，replacement 独立 create/验证并记录 anchor，source 再原子 complete；中断保留 in_progress 和已创建 replacement，相同 POST 恢复，不生成新 correctionId、不覆盖首次文本、不回滚或删除。
- 合法 replacement 的 A21 仅 doctor/admin，历史 Patient inactive / Visit locked / voided 不阻断；普通 V1 规则保持。A22-A24 泛化到 V2 留给后续独立阶段。
- 不修改 Schema、ClinicalReportStatus 或 REPORT_STATUS_TRANSITIONS，不创建 AuditLog，不读取/修改五类来源，不生成 PDF/Storage 文件，不调用 AI。

## 4. 后续同步规则

- 新增关键技术选型、接口设计、数据模型、测试策略或部署策略后，应追加决策记录。
- 未确认的技术版本、接口设计或数据模型不得写成决策。
- 决策记录应简洁、可追溯，并指向实际代码或业务文档依据。
