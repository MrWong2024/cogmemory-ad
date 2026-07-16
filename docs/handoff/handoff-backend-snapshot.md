# CogMemory AD / 智忆评 后端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 后端当前事实快照，帮助后续交接时快速判断后端工程、模块、接口和验证能力的真实状态。

## 2. 当前工程状态

- `backend\src` 公共底座已初始化。
- 已具备 NestJS 启动入口、根模块、全局应用配置、健康检查、配置加载与校验、MongoDB 连接底座、全局 ValidationPipe、全局异常过滤器和 Storage 公共模块。
- `backend\src\modules` 当前包含 `storage`、`scales`、`patients`、`assessments`、`media`、`scoring`、`cognitive-domains`、`reports`、`users` 与 `auth`。
- `StorageModule` 当前只提供 fake / OSS 底层 driver 结构和 `STORAGE_SERVICE` token，不提供业务上传接口。
- `ScalesModule` 当前提供量表定义 / 量表版本 Schema、内部 `ScalesService`、MMSE / MoCA seed、只读 `ScaleSeedDataService`、`validateScaleSeeds()`、公开只读 `ScalesController` 和 `ScaleCatalogService`。`GET /scales/available` 只返回安全摘要且不写数据库；量表初始化时才按需幂等物化对应 seed 版本。
- `PatientsModule` 当前提供患者 / 受试者基础档案 Schema、内部读取底座，以及 `GET /patients`、`POST /patients`、`GET /patients/:patientId` 三个患者最小公开 API。
- `AssessmentsModule` 当前提供访视 / 量表实例 / 题目作答 Schema、`AssessmentsService`、`AssessmentExecutionService`、`AssessmentScaleWorkflowService`、`AssessmentExecutionDetailService`、`ItemResponseDraftService`，以及 `AssessmentVisitsController` / `AssessmentExecutionController`。A14 在既有四个访视 / 初始化 API 之外新增单实例执行详情与单题草稿 PATCH；不自动修改访视或实例状态。
- A16 在 `AssessmentsModule` 新增 `ScaleInstanceSubmissionController`、`ScaleInstanceSubmissionService`、纯 readiness evaluator、提交 DTO 与安全公开响应类型；开放 readiness GET 与 submit POST。
- `MediaModule` 当前在既有媒体证据 Schema / Service 上新增 A15 公开 `MediaEvidenceController`、工作流 Service、安全 mapper、图片与轨迹纯校验；提供题目下列表、multipart 上传、短期签名访问和作废四个接口。
- `ScoringModule` 当前在计分结果快照 Schema、`ScoringService` 与 `summarizeItemScores()` 通用汇总基础上，提供 A17 阶段性 workflow、A18 `ScoreReviewWorkflowService`、纯评分 / 人工复核函数与安全 public mapper；公开 compute / latest / manual-review / confirm，不提供 lock、void、重跑、认知域或报告接口。
- `CognitiveDomainsModule` 当前在认知域结果 Schema、内部读取和 `summarizeDomainScores()` 基础上，新增 A19 Controller、Workflow、确认评分纯映射 / 校验、安全 public mapper 与 runNo=1 创建能力；公开认知域 compute / latest，不提供人工修改、确认、锁定、作废、重算或报告接口。
- `ReportsModule` 当前提供 A20 generation / latest、A21 review、A22 lock、A23 source freeze、A24 archive、A25 corrections 与 A26 replacement lifecycle；合法任意 V2+ 已可复用既有 lock / freeze-sources / archive endpoint。仍不提供退回、签名、unlock / unfreeze / unarchive、correction cancel / branch、作废、PDF 或 AI。
- `UsersModule` 当前只提供系统账号 `User` Schema 与内部 `UsersService` 读取、规范化和安全 mapper 底座，不提供公开用户管理接口。
- `AuthModule` 当前提供服务端 `Session` Schema、内部 `AuthService`、基础认证上下文、`@Public()` / `@Roles()` / `@CurrentUser()` 装饰器、`SessionAuthGuard`、`RolesGuard` 与 `AuthController`；公开最小认证 API `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`，且未注册全局 Guard。
- OSS 业务上传服务、SMS Service、LLM Service 均未实现。
- 本地默认后端端口为 `5002`。
- 本地默认前端 origin 为 `http://localhost:3002`。
- 当前报告接口保持九个；A12-A26 临床接口显式使用 `SessionAuthGuard` + `RolesGuard`。普通 V1 A21 edit / submit 沿用四个患者工作流角色；replacement A21 与 confirm、lock、freeze-sources、archive、corrections 仅 doctor / admin。
- 已完成后端公共底座基础闭环本地验证：`npm install` 成功、`npm run build` 成功、`npm test -- --runInBand` 成功、`npm run start:prod` 启动成功。
- 当前 A26 验证结果为 76 个单元测试套件 / 666 个测试通过；A26 定向真实 HTTP E2E 为 1 个套件 / 7 个测试通过；全量 E2E 为 14 个套件 / 67 个测试通过。
- A24 定向真实 HTTP E2E 已通过：1 个测试套件、6 个测试通过；全量 E2E 为 13 个测试套件、60 个测试通过。A24 完成后补充执行的最近两次全量 E2E 均完整通过，均使用 `NODE_ENV=test`、Jest `--runInBand`、隔离 `cogmemory_ad_test`、fake Storage、stub SMS / LLM 和脱敏人工数据，未调用真实外部服务；A24 按 `SUBJ-A24-TEST-*` / `VISIT-A24-TEST-*` 前缀定向清理运行时数据。此前一次全量复跑曾出现既有跨套件 test catalog / 数据顺序污染现象；该现象在随后两次完整串行复跑中未再次出现。当前验证结论以最近连续两次全量通过为准，但尚不据此宣称潜在测试隔离风险已被永久消除。
- 后端 TypeScript 编译根目录为 `.`，`outDir` 保持 `./dist`，因此 `src/main.ts` 编译后的主入口产物为 `dist/src/main.js`。
- `package.json` 中 `start:prod` 保持指向 `./dist/src/main.js`，当前 build 产物路径已与该启动路径对齐。
- `tsBuildInfoFile` 保持 `./dist/tsconfig.build.tsbuildinfo`；`dist` 与 `*.tsbuildinfo` 均作为生成物处理，不作为项目源文件纳入版本库。
- 用户已补充验证 `npm run start:prod` 本地启动成功；该验证只代表公共底座本地基础启动链路通过，不代表真实生产环境部署完成。
- 当前不得写成完整业务后端已经实现。

## 3. 当前已确认后端事实

- 项目名称为 CogMemory AD / 智忆评。
- health 响应 service 为 `cogmemory-ad-backend`。
- MongoDB 默认命名口径为 `cogmemory_ad_dev`、`cogmemory_ad_test` 和 `cogmemory_ad`。
- 配置模块中的 Session cookie 默认名为 `cogmemory_ad_session`；A11 已将 `AuthModule` 内部 `SESSION_COOKIE_NAME` 统一为 `cogmemory_ad_session`，与当前项目配置默认口径一致。
- Storage object prefix 默认值为 `cogmemory_ad`。
- development / test 默认 `STORAGE_DRIVER=fake`，production 默认 `STORAGE_DRIVER=oss`。
- OSS、SMS、LLM 配置均为占位或示例口径，不包含真实密钥。
- A15 媒体业务上传接口已通过既有 fake / OSS Storage abstraction 实现；SMS Service 与 LLM Service 仍未实现，未新增 Storage interface、driver 或配置。
- 当前 A12-A25 已开放既有评估闭环，以及报告 generate / latest / edit / submit / confirm / lock / freeze-sources / archive / corrections。仍无用户管理、患者 / 访视编辑、批量 / 自动保存、评分 lock / void / 重跑、认知域人工修改 / 确认 / 锁定 / 重算、报告 unlock / unfreeze / unarchive、correction cancel / branch、replacement lock / freeze / archive、PDF、疾病诊断或 AI。
- 当前 `start:prod` 与 TypeScript build 主入口产物路径均指向 `dist/src/main.js`，并已完成本地启动验证。
- 本次仅使用指定外部 GitHub commit `b302b8af7b7ac9cc558939dc1b38ace0976c65b3` 作为后端公共底座来源，不继承其业务事实。

## 4. 当前 scales 模型底座

- `ScaleDefinition` Schema 位于 `backend\src\modules\scales\schemas\scale-definition.schema.ts`。
- `ScaleDefinition` collection 为 `scale_definitions`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ScaleDefinition` 当前覆盖稳定量表编码、名称、简称、说明、分类、状态、当前版本引用、排序和标签。
- `ScaleDefinition` 当前索引为 `{ code: 1 }` unique 与 `{ status: 1, sortOrder: 1 }`。
- `ScaleVersion` Schema 位于 `backend\src\modules\scales\schemas\scale-version.schema.ts`。
- `ScaleVersion` collection 为 `scale_versions`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ScaleVersion` 当前覆盖量表引用、量表 code、版本、CRF 版本、评分规则版本、字段编码版本、来源材料、状态、总分范围、分组配置、题目配置、质控规则、报告规则、科研导出映射、生效时间和退役时间。
- `ScaleVersion` 当前索引为 `{ scaleDefinitionId: 1, version: 1 }` unique、`{ scaleCode: 1, version: 1 }`、`{ scaleCode: 1, status: 1 }`。
- 内嵌 group / item 配置已预留指导语、作答类型、得分范围、是否计入总分、认知域、证据类型、计时、图片上传、平板手写、操作者备注、质控规则、报告规则和科研导出映射等字段。
- `backend\src\modules\scales\seeds` 当前已新增内部 MMSE / MoCA 初始配置 seed 类型与常量，覆盖 `ScaleDefinition` 配置、`ScaleVersion` 配置、分组、题目、指导语摘要、作答类型、分值范围、是否计入总分、图片 / 手写 / 计时 / 原始文本 / 操作者备注要求、自动计分规则元数据占位、认知域映射、质控规则占位、报告展示规则占位和科研导出字段映射。
- `ScaleSeedDataService` 当前提供内存 seed 的只读读取能力：`normalizeScaleCode()`、`getAllScaleSeeds()`、`getScaleSeedByCode()`、`getScaleVersionSeed()`、`listSeedScaleDefinitions()`、`listSeedScaleVersions()` 和 `validateScaleSeeds()`；不注入 Mongoose model，不读取数据库，不写数据库。
- `ScaleCatalogService` 当前提供 `listAvailableScaleOptions()`、`getAvailableScaleOption()`、`ensureSeedScaleVersionMaterialized()`：前两者只读取经 `validateScaleSeeds()` 校验的 seed；公开目录按 `sortOrder` / code 排序，只返回名称、版本追溯、总分范围、分组 / 题目数量和能力布尔值，不返回完整题目、指导语、评分规则、正确答案、ObjectId 或 Mixed 字段。
- `ensureSeedScaleVersionMaterialized()` 以 definition code 和 definitionId + version 为业务键，使用 `$setOnInsert` upsert 创建或复用记录；已有 definition / version 配置不被覆盖。非 active 记录分别返回 `SCALE_NOT_ACTIVE` / `SCALE_VERSION_NOT_ACTIVE`；追溯字段或分组 / 题目数量冲突返回 `SCALE_CATALOG_VERSION_CONFLICT`；duplicate key 竞态后重新读取。`currentVersionId` 仅在为空或缺失时设置，不覆盖已有引用。
- 该物化能力仅由 A13 初始化调用，不是全量 seed runner，不在应用启动时执行，也没有 CLI、管理 API 或配置编辑能力。
- `validateScaleSeeds()` 当前为不落库的种子数据校验纯函数，覆盖量表 code、版本、group code、item code、groupCode 引用、CRF 编码重复风险、scoreRange、证据 / 计时一致性、MoCA 即刻记忆不计分、MoCA 延迟回忆提示后表现保留、MoCA 抽象项 CRF 修正、MMSE 表达第 9 项和绘图第 10 项修正，以及 MMSE / MoCA 连续减 7 分步配置。
- MMSE / MoCA 资料治理遵循 D-018：项目“来源”中的 `MMSE+MoCA.pdf` 是权威原始资料；仓库根目录与 `docs`、`backend`、`frontend` 同级的 `.local/reference/MMSE+MoCA.pdf` 是 Codex 本地工作镜像，不是第二套业务基线，并由根目录 `.gitignore` 的 `/.local/reference/` 排除而不进入 Git。
- 涉及 MMSE / MoCA 题项、指导语、评分规则、CRF 编码、图片素材或种子数据时，必须同时实际参阅该 PDF；seed 中的 `sourceDocument` 或其他来源标识只用于追溯，不能代替阅读 PDF，也不得只依据 seed、页面、handoff、代码命名或模型记忆推断。
- 最新代码和 handoff 是已演进落地的当前实现事实和业务契约；PDF 的明显原始编号或排版错误不得覆盖 MMSE“表达”第 9 项、“绘图”第 10 项、MoCA 抽象项 `N1.2.12.1` / `N1.2.12.2` 等已确认并落地的修正及内部稳定语义编码。如项目来源、本地工作镜像、handoff 与代码出现无法合理解释的不一致，必须停止相关实现并报告差异。
- MMSE seed 当前来源标识为 `MMSE+MoCA.pdf`，版本为 `1.0`，总分范围 0-30，包含定向力、即刻回忆、注意力和计算力、回忆、语言、视空间 / 绘图分组；题目覆盖时间定向、地点定向、即刻回忆、连续减 7、延迟回忆、命名、重复、阅读并执行、三步指令、表达 / 写完整句子和绘图。
- MoCA seed 当前来源标识为 `MMSE+MoCA.pdf`，版本为 `1.0`，总分范围 0-30，包含视空间与执行功能、命名、即刻记忆、注意、语言、抽象、延迟回忆和定向分组；题目覆盖交替连线、立方体、钟表、命名、两次即刻记忆记录、数字广度、警觉性、连续减 7、句子复述、词语流畅性、两个抽象项、延迟回忆和定向；`N1.2.15` 总分字段保留在 reporting / research export 映射中。
- 当前未实现全量 seed runner、完整题目配置公开 API、批量或自动保存、媒体批量 / 分片 / 直传 / 物理删除 / 原子替换、自动或手工评分、认知域、报告或 AI；A16 只完成实例提交，不完成访视或评分。

## 5. 当前 patients / assessments 运行时与作答模型底座

- `Patient` Schema 位于 `backend\src\modules\patients\schemas\patient.schema.ts`。
- `Patient` collection 为 `patients`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `Patient` 当前覆盖受试者稳定编码、展示名、来源类型、性别、出生日期、受教育年限、利手、状态、标签、备注、脱敏外部引用和扩展 metadata。
- `Patient` 当前索引为 `{ subjectCode: 1 }` unique、`{ status: 1, subjectCode: 1 }`、`{ sourceType: 1, status: 1 }`。
- `PatientsController` 当前公开患者分页列表、创建和详情读取；列表支持 `page`、`pageSize`、`keyword`、`status`、`sourceType`，默认按 `subjectCode` 升序。创建只接受确认的结构化字段，`subjectCode` 使用 trim + uppercase，`status` 固定为 `active`，重复编号统一为 `PATIENT_SUBJECT_CODE_CONFLICT`。
- 患者公开 mapper 不返回内部 `externalRefs`、`metadata`、Mongoose document 字段或 `__v`；详情相较列表额外返回 `notes`。
- `AssessmentVisit` Schema 位于 `backend\src\modules\assessments\schemas\assessment-visit.schema.ts`。
- `AssessmentVisit` collection 为 `assessment_visits`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `AssessmentVisit` 当前覆盖患者引用、受试者编码快照、访视编码、访视类型、状态、评估日期、开始 / 完成 / 锁定 / 作废时间、操作者快照、临床上下文、备注和扩展 metadata。
- `AssessmentVisit` 当前索引为 `{ visitCode: 1 }` unique、`{ patientId: 1, assessmentDate: -1 }`、`{ subjectCode: 1, assessmentDate: -1 }`、`{ status: 1, assessmentDate: -1 }`。
- `AssessmentVisitsController` 当前公开患者下访视分页列表、创建、访视详情和量表实例初始化；列表支持 `page`、`pageSize`、`status`、`visitType`、`dateFrom`、`dateTo`，默认按 `assessmentDate` 和 `_id` 倒序。
- 访视创建从路径取得 patientId、从患者档案取得 subjectCode、固定初始化 `draft`，并由当前认证用户生成 operatorSnapshot；客户端不能写 operatorSnapshot、状态、状态时间、clinicalContext 或 metadata。稳定业务错误包括 `PATIENT_NOT_FOUND`、`PATIENT_NOT_ACTIVE`、`VISIT_CODE_CONFLICT`、`INVALID_DATE_RANGE`。
- 访视公开 mapper 不返回 `clinicalContext`、`metadata`、Mongoose document 字段或 `__v`。
- `ScaleInstance` Schema 位于 `backend\src\modules\assessments\schemas\scale-instance.schema.ts`。
- `ScaleInstance` collection 为 `scale_instances`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ScaleInstance` 当前覆盖访视引用、患者引用、受试者编码快照、量表定义引用、量表版本引用、量表 code、量表版本、实例编码、实例序号、状态、施测模式、版本追溯快照、时间字段、用时、操作者快照、进度摘要占位、质控摘要占位、备注和扩展 metadata。
- `ScaleInstance` 当前索引为 `{ instanceCode: 1 }` unique、`{ assessmentVisitId: 1, scaleCode: 1, instanceNo: 1 }` unique、`{ patientId: 1, scaleCode: 1, startedAt: -1 }`、`{ status: 1, updatedAt: -1 }`、`{ scaleCode: 1, scaleVersion: 1 }`。
- `ItemResponse` Schema 位于 `backend\src\modules\assessments\schemas\item-response.schema.ts`。
- `ItemResponse` collection 为 `item_responses`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ItemResponse` 当前覆盖访视引用、量表实例引用、患者引用、受试者编码快照、量表定义引用、量表版本引用、量表 code / version、量表实例编码快照、题目编码、CRF 编码、题目组、题目标题、题目顺序、作答类型、是否计入总分、认知域编码、题目配置快照、版本追溯、作答状态、作答来源、原始作答、结构化作答、文本记录、缺失原因、单题得分、分步结果、提示后表现、计时、证据引用占位、操作者备注、质控占位、metadata、锁定和作废时间。
- `ItemResponse` 当前索引为 `{ scaleInstanceId: 1, itemCode: 1 }` unique、`{ assessmentVisitId: 1, scaleInstanceId: 1, itemOrder: 1 }`、`{ patientId: 1, scaleCode: 1, itemCode: 1 }`、`{ scaleCode: 1, itemCode: 1 }`、`{ status: 1, updatedAt: -1 }`、`{ scaleInstanceId: 1, countsTowardTotal: 1 }`。
- 当前已建立 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ItemResponse` 的运行时 ObjectId 引用关系，并在 `ScaleInstance` 与 `ItemResponse` 中保存量表定义、量表版本和版本追溯快照字段。
- `AssessmentsService` 当前提供 `ItemResponse` 的最小内部读取能力：规范化 item code、按量表实例和题目编码读取单条作答、按量表实例读取作答列表、按量表实例读取已计分作答列表、按访视读取作答列表；返回结果经过 mapper，不直接返回完整 Mongoose document。
- `AssessmentExecutionService` 当前提供内部评估执行初始化编排能力：规范化 subject / instance / scale code，基于 `ScaleSeedDataService` 读取并校验 MMSE / MoCA seed，构建不写库的 `ScaleExecutionPlan`，并在内部写库方法中先创建 `ScaleInstance`、再批量创建初始 `ItemResponse` 骨架。
- `AssessmentExecutionService` 生成的初始 `ItemResponse` 骨架会从 seed 复制 itemCode、CRF 编码、分组、标题、顺序、作答类型、是否计入总分、认知域、item 配置快照、版本追溯、score 初始快照、连续减 7 / 钟表等分步结果占位、MoCA 延迟回忆提示后表现占位、计时占位和 photo / handwriting / duration / raw_text / operator_note 等 evidenceRefs 占位。
- `AssessmentExecutionService` 仍是内部写库能力，由 `AssessmentScaleWorkflowService` 调用；不创建 Patient、AssessmentVisit、MediaEvidence、ScoreResult、CognitiveDomainResult 或 ClinicalReport。`ItemResponse.insertMany()` 失败时，会按本次 `scaleInstanceId` 尝试删除可能已创建的 ItemResponse，再删除本次 ScaleInstance，并重新抛出原始错误供上层转换；不删除其他实例、访视、患者或目录数据。
- `AssessmentScaleWorkflowService` 依次校验患者存在且 active、访视联合归属与 draft / in_progress 状态、可用 seed / version、同访视同 scaleCode 不重复；服务端生成 subjectCode、definition / version 引用、`INST-{VISIT_ID_UPPERCASE}-{SCALE_CODE_UPPERCASE}-1`、instanceNo=1、draft 状态和操作者快照，再调用执行 Service。响应仅返回安全 scale / ScaleInstance 摘要与创建题目数量。
- `GET /patients/:patientId/visits/:visitId` 先确认患者存在，再以 patientId + visitId 联合查询访视，不泄露跨患者归属；量表实例按 scaleCode、instanceNo 排序。公开 mapper 只输出版本追溯、操作者和有限非负 progress 字段，不返回 definition / version ObjectId、metadata、qualityControlSummary 或 ItemResponse 全量数据。
- A14 `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId` 校验 patient / visit / instance 完整归属，从实例的 scaleCode / scaleVersion 读取已物化 `ScaleVersion`，返回安全 scale 身份、排序后的 groups、显式题目 config、现有草稿与实际进度；历史只读不因患者 inactive / archived 或实例 completed / locked / voided 被拒绝。
- A14 公开题目 mapper 只提取 prompt、instruction、scoreRange、evidenceTypes、计时 / 图片 / 手写 / 操作者备注能力和草稿槽位；不透传 itemConfigSnapshot、scoringRule、qualityControlRule、reportingRule、researchExportField、expectedValue、正确答案、score、isCorrect、scoreValue、qualityControlHints、metadata 或内部 ObjectId。
- A14 PATCH 只允许 rawResponse、structuredResponse、responseText、isMissing / missingReason、既有 step 的 actualValue / note、既有 prompt 的 responseAfterPrompt / note、timing、operatorNote 与 markAsAnswered；JSON 值经过普通对象、危险 key、深度、数组 / key / 字符串和 32768 字节限制后递归克隆。保存只原子更新单条 `ItemResponse`，不修改评分字段，不修改 AssessmentVisit / ScaleInstance 状态或 startedAt。
- PATCH 要求 Patient active、Visit / ScaleInstance 为 draft 或 in_progress、ItemResponse 为 not_started / in_progress / answered；资源归属不匹配统一按对应资源不存在处理。not_started 在有效草稿更新后进入 in_progress，markAsAnswered 需存在有效作答并进入 answered，answered 后继续编辑不回退；缺失记录清除实际作答值但保留 timing / operatorNote 与 step / prompt note。
- `AssessmentsService.countItemResponseProgress()` 以实例下实际 ItemResponse 数量作为 totalItemCount，以 answered / scored 状态数量作为 answeredItemCount；A13 访视详情、A14 执行详情与 PATCH 响应均使用实时派生值，不回写 `ScaleInstance.progress` Mixed 快照。
- 当前一致性为补偿式一致性，不是严格事务原子性；未使用 Mongo transaction。后续生产环境采用 replica set 时可重新评估 transaction。
- A14 不等于完整患者管理或完整评估执行流程；不自动修改访视 / 实例 status、不设置实例 startedAt、不提供整份量表最终提交、批量或自动保存，也不触发媒体、计分、认知域、报告或 AI。

### A16 submission readiness 与实例完成

- `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/submission-readiness` 只读检查完整归属、ScaleDefinition / ScaleVersion 绑定、项目集合、answered / scored、有效作答、缺失原因、必填步骤、计时、媒体 evidenceRef 与操作者备注；不写数据库，不返回作答、expectedValue、scoringRule、分数、mediaEvidenceId、objectKey 或 metadata。
- photo / handwriting 同时配置时为 `one_of`，单独配置时必须满足对应类型；attached 必须同时有 mediaEvidenceId，readiness 不直接查询 `MediaEvidence`。
- `POST .../:scaleInstanceId/submit` 要求 `confirm=true`、active Patient、draft / in_progress Visit 与 ScaleInstance。提交前执行两次实时 readiness；单条 `findOneAndUpdate` 条件迁移 ScaleInstance 为 completed，设置服务端 completedAt、可派生 startedAt / durationMs、最终 progress 和受控 `metadata.submission`。
- submission metadata 仅含 submissionId、submittedAt、submittedBy / name / role 与五项 readinessSummary；点路径写入保留既有 metadata，不覆盖 operatorSnapshot，不设置 lockedAt，不修改 AssessmentVisit 或 ItemResponse。
- completed 重复提交幂等，不重写 submissionId、completedAt 或 durationMs；并发原子更新 miss 后重读，completed 返回幂等结果，locked / voided 或其他状态返回稳定冲突。当前不使用 Mongo transaction 或分布式锁，二次检查不是跨集合严格线性化事务。
- startedAt 优先保留实例合法值，否则采用最早合法题目 timing.startedAt；无法确定时 durationMs 保持 null 并产生 warning，不伪造零时长。A16 不执行评分，不创建 ScoreResult、CognitiveDomainResult、ClinicalReport。

## 6. 当前 media 媒体证据模型与 A15 API

- `MediaEvidence` Schema 位于 `backend\src\modules\media\schemas\media-evidence.schema.ts`。
- `MediaEvidence` collection 为 `media_evidences`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `MediaEvidence` 当前覆盖患者、访视、量表实例、题目作答、量表定义和量表版本引用；同时保存受试者编码、量表 code / version、实例编码和题目编码快照。
- 当前已通过 `MediaEvidence.patientId`、`assessmentVisitId`、`scaleInstanceId` 与 `itemResponseId` 建立 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ItemResponse` -> `MediaEvidence` 的证据链 ObjectId 引用关系。
- `MediaEvidence` 当前覆盖证据稳定编码、证据类型、采集方式、证据状态、存储状态、CRF 编码、题目组、题目标题、作答类型、是否计入总分、认知域编码、题目快照、版本追溯、存储对象元数据、图片元数据、平板手写轨迹元数据、采集上下文、操作者快照、质量状态、质量提示占位、操作者备注、描述、扩展 metadata、锁定 / 作废 / 删除时间。
- `MediaEvidence` 当前内嵌 `MediaEvidenceVersionTrace`、`MediaStorageSnapshot`、`MediaImageMetadata`、`HandwritingTraceSnapshot`、`MediaCaptureContext` 与 `MediaOperatorSnapshot` 子文档，均使用 `_id: false`。
- `MediaEvidence` 当前索引为 `{ evidenceCode: 1 }` unique、`{ itemResponseId: 1, evidenceType: 1, status: 1 }`、`{ scaleInstanceId: 1, itemCode: 1, evidenceType: 1 }`、`{ assessmentVisitId: 1, createdAt: -1 }`、`{ patientId: 1, createdAt: -1 }`、`{ status: 1, updatedAt: -1 }`、`{ 'storage.objectKey': 1 }` sparse、`{ scaleCode: 1, itemCode: 1, evidenceType: 1 }`。
- `MediaEvidenceService` 在既有读取方法上新增完整 patient / visit / instance / item 归属查询、题目下未删除记录列表、当前 attached / locked 证据查询、创建、条件作废与仅供补偿的按 ID 删除；内部 Summary 不直接作为 HTTP 响应。
- A15 四个接口统一位于 `/patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences`：GET 列表、POST multipart 上传、GET `:mediaEvidenceId/access-url`、POST `:mediaEvidenceId/void`。
- 上传主文件最大 10 MiB，仅允许 JPEG / PNG / WebP；校验 MIME 白名单、JPEG / PNG / WebP 魔数和 MIME / 实际格式一致性，并拒绝 JPEG EXIF / XMP、PNG eXIf / tEXt / zTXt / iTXt、WebP EXIF / XMP。主文件由服务端计算 SHA-256；不保存客户端原始文件名。
- objectKey 使用经 `StorageConfigService.getObjectPrefix()` 校验的前缀、固定 `clinical-evidence` 目录、内部 ObjectId 与随机 UUID；不使用姓名、受试者编号、病历号、手机号、身份证号、备注或原始文件名。公开 mapper 不返回 objectKey、bucket、objectPrefix、originalFilename、checksum、trajectoryObjectKey、metadata、qualityHints 或数据库关联 ID。
- handwriting 必须包含最终渲染图片，可选上传最大 2 MiB、MIME `application/json` 的轨迹；trajectoryFormat 仅 json / strokes，不接受 SVG。轨迹 JSON 拒绝危险 key、非有限数、非普通对象以及超出深度 10、数组 10000、对象 100 keys、总节点 50000、单字符串 2000 的内容，解析后递归克隆并重新 `JSON.stringify()` 为规范化 Buffer 再写 Storage。
- 上传要求 Patient active，Visit / ScaleInstance 为 draft / in_progress，ItemResponse 为 not_started / in_progress / answered，并要求 evidenceRefs 中存在同类型 pending / missing 要求。相同题目与 evidenceType 已有 attached / locked 证据时返回冲突；最终通过 evidenceRefs 条件更新原子绑定并发边界。
- 上传顺序为 Storage 主文件、可选轨迹、MediaEvidence 创建、ItemResponse evidenceRef 绑定；任一步失败只补偿本次新建记录与本次对象，不使用 Mongo transaction，不删除其他证据或其他业务数据。上传不修改 ItemResponse / ScaleInstance / AssessmentVisit status，不触发计分。
- access-url 仅允许 primary / trajectory，固定使用 `DEFAULT_SIGNED_URL_EXPIRES_SECONDS`；只有 attached / locked 且 storageStatus=stored 可访问。voided / deleted / pending / 存储缺失不可访问，轨迹不存在返回 `MEDIA_TRAJECTORY_NOT_FOUND`。
- 作废要求 3-1000 字符原因，先按当前 mediaEvidenceId 原子清除 evidenceRef 并恢复 pending，再将 MediaEvidence 标记 voided；metadata 仅写 voidReason / voidedBy / voidedAt。标记失败会尝试恢复引用；正常作废保留 Storage 对象和审计记录，允许随后重新上传，不提供原子替换接口。
- A15 不包含前端拍照 / 画布、图片重编码、PDF / SVG / 音频 / 视频、批量 / 分片 / 客户端直传、物理删除、OCR / AI、质量审核、评分、最终提交、认知域或报告。

## 7. 当前 scoring 自动计分结果模型与通用汇总底座

- `ScoreResult` Schema 位于 `backend\src\modules\scoring\schemas\score-result.schema.ts`。
- `ScoreResult` collection 为 `score_results`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ScoreResult` 当前覆盖患者、访视、量表实例、量表定义和量表版本引用，并在单题得分快照中可引用 `ItemResponse`。
- 当前已通过 `ScoreResult.patientId`、`assessmentVisitId`、`scaleInstanceId`、`itemScores.itemResponseId` 建立 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ItemResponse` -> `ScoreResult` 的计分结果引用关系。
- `ScoreResult` 当前保存受试者编码、量表 code / version、实例编码、计分结果编码、计分运行次数、计分状态、计分来源、计分模式、版本追溯、总分、单题得分快照、分项 / 分组得分快照、计算过程摘要、人工复核状态、质量状态、质量提示、操作者备注、metadata、确认 / 锁定 / 作废时间。
- `ScoreResult` 当前内嵌 `ScoreVersionTrace`、`TotalScoreSnapshot`、`ScoreItemSnapshot`、`ScoreGroupSnapshot`、`ScoringComputationSnapshot` 与 `ScoreReviewSnapshot` 子文档，均使用 `_id: false`。
- `ScoreResult` 当前索引为 `{ scoreResultCode: 1 }` unique、`{ scaleInstanceId: 1, runNo: 1 }` unique、`{ scaleInstanceId: 1, status: 1, createdAt: -1 }`、`{ assessmentVisitId: 1, scaleCode: 1, createdAt: -1 }`、`{ patientId: 1, scaleCode: 1, createdAt: -1 }`、`{ status: 1, updatedAt: -1 }`、`{ scaleCode: 1, scaleVersion: 1 }`、`{ qualityStatus: 1, updatedAt: -1 }`。
- `ScoringService` 当前提供最小内部读取能力：规范化 score result code、按计分结果编码读取、按量表实例读取最新计分结果、按量表实例 / 访视 / 患者读取计分结果列表；返回结果经过 mapper，不直接返回完整 Mongoose document。
- `ScoringService.summarizeItemScores()` 当前为不落库的通用计分汇总纯函数，只根据输入的单题得分快照汇总总分、分组分、计入 / 不计入总分数量、未评分数量、缺失数量、需复核数量和非有限数字 warning；不读取或修改 `ItemResponse`，不根据 `itemCode` 写死 MMSE / MoCA 专用规则，不从 raw response 推断单题对错。
- A17 在不修改 ScoreResult Schema 的前提下新增阶段性评分闭环：`POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/compute` 与对应 `GET .../latest`。
- 首次计算要求 active Patient、draft / in_progress / completed Visit、completed ScaleInstance，以及 definition / version / item set / ownership 一致；GET 历史读取允许 inactive / archived Patient 与 completed / locked / voided Visit / ScaleInstance。
- 纯评分引擎不按 scaleCode / itemCode 分支，仅对严格可识别的 `multi_step_manual` 做有限 number / boolean 严格比较。MMSE 真实步骤分值直接求和；MoCA 使用 seed 中 `correctStepCount` 或 `correctStepCountMin/Max` 数组映射。字符串不匹配、不转换，不使用 eval / Function。
- 其他人工模式、未知模式、missing 和既有 ItemResponse 题分进入安全 reviewQueue；`countsTowardTotal=false` / `raw_record_only` 过程项为 not_scored、不中总分且不进复核。
- ScoreResult 首次创建固定 runNo=1、rule_based；状态为 computed / needs_review，来源为 auto_rule / mixed / manual。阶段性总分只累计可靠得分，存在待复核时 scorePercent=null、isComplete=false，A17 新建结果 isFinal=false。
- compute 对 computed / needs_review / confirmed / locked 幂等返回；draft / voided 分别拒绝。创建依赖 `{ scaleInstanceId, runNo }` 唯一索引，duplicate key 后重读恢复；不使用 transaction、分布式锁或临时 draft。
- public mapper 逐字段输出 item / group / total、computation、review 与稳定排序 reviewQueue；不返回原始作答、expectedValue、scoringRule、isCorrect、ItemResponse.score、metadata、qualityHints 或 reviewer 信息。未知 reason / warning 只映射为受控通用值，不原样透传。
- A17 不修改 Patient、AssessmentVisit、ScaleInstance、ItemResponse、step / prompt 或媒体；不创建 CognitiveDomainResult / ClinicalReport，不执行教育校正、诊断或 AI。
- A18 新增 `PATCH .../score-results/:scoreResultId/item-scores/:itemResponseId/manual-review` 与 `POST .../score-results/:scoreResultId/confirm`；路径由 `ScoreItemReviewParamDto` / `ScoreResultParamDto` 校验，body 分别为 `ReviewScoreItemDto` / `ConfirmScoreResultDto`，只接收分值 / 意见 / expectedUpdatedAt 或 confirm / 意见 / expectedUpdatedAt。
- 人工评分仅允许 countsTowardTotal=true 的 needs_review / manual_scored 项目；分值必须是 finite number，并按当前 ScaleVersion item scoreRange 的 min / max / step 验证，0 为合法值。成功后为 manual_scored / operator，保留 A17 reason，调用 `summarizeItemScores(..., { provisional: true })` 重新派生 total / group / scorePercent、result / review / quality 状态与 scoringSource。
- 每次人工修改向 `metadata.a18ManualReview.events` 追加 UUID 事件并保留其他顶层 metadata；单结果上限 500。内部可保存 previousScoreValue，但 public mapper 只公开每题最新 manualReview 摘要，不公开 metadata、历史事件或 previousScoreValue。非法 legacy metadata 在写入时以 `SCORE_RESULT_METADATA_UNSUPPORTED` 拒绝，在公开读取时安全忽略。
- latest / compute / manual-review / confirm 安全响应的 scoreResult 均包含 `updatedAt`。两个 A18 写接口以 expectedUpdatedAt 加入完整 ownership + runNo=1 原子过滤；原子 miss 重读并返回 review / confirmation conflict，不自动覆盖其他操作者，不使用 transaction 或分布式锁。
- 队列清空后结果回到 computed / reviewed / unchecked，仍 isFinal=false；confirm 会实时重新汇总并验证 item range / source、total / groups / scorePercent、A17 warning、Patient / Visit / completed Instance 状态。成功后 status=confirmed、confirmedAt / reviewer / final note 落库、qualityStatus=passed、isFinal=true，并写 `metadata.a18Confirmation` UUID 审计；qualityStatus=passed 只表示评分结果完整性和复核流程通过，不表示疾病结论。
- confirmed / locked 重复 confirm 返回 alreadyConfirmed=true 且不改审计；受控 metadata 缺失时可从 confirmedAt + review 安全回退，confirmedAt 缺失则 `SCORE_RESULT_CONFIRMATION_AUDIT_UNAVAILABLE`。confirmed 不设置 lockedAt。A18 不修改 Patient、Visit、ScaleInstance、ItemResponse / score / step / prompt / media，不创建 CognitiveDomainResult 或 ClinicalReport。

## 8. 当前 cognitive-domains 认知域结果与 A19 最小公开闭环

- `CognitiveDomainResult` Schema 位于 `backend\src\modules\cognitive-domains\schemas\cognitive-domain-result.schema.ts`。
- `CognitiveDomainResult` collection 为 `cognitive_domain_results`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `CognitiveDomainResult` 当前覆盖患者、访视、量表实例、计分结果、量表定义和量表版本引用，并在题目贡献快照中可引用 `ItemResponse` 与 `ScoreResult`。
- 当前已通过 `CognitiveDomainResult.patientId`、`assessmentVisitId`、`scaleInstanceId`、`scoreResultId`、`itemContributions.itemResponseId` 建立 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ScoreResult` -> `CognitiveDomainResult` 的认知域结果引用关系，并保留必要题目作答引用。
- `CognitiveDomainResult` 当前保存受试者编码、量表 code / version、实例编码、认知域结果编码、运行次数、计算状态、映射来源、映射模式、版本追溯、认知域得分快照、题目贡献快照、映射规则快照、计算过程摘要、人工复核状态、质量状态、质量提示、操作者备注、metadata、确认 / 锁定 / 作废时间。
- `CognitiveDomainResult` 当前内嵌 `CognitiveDomainVersionTrace`、`CognitiveDomainScoreSnapshot`、`CognitiveDomainItemContributionSnapshot`、`CognitiveDomainMappingSnapshot`、`CognitiveDomainComputationSnapshot` 与 `CognitiveDomainReviewSnapshot` 子文档，均使用 `_id: false`。
- `CognitiveDomainResult` 当前索引为 `{ domainResultCode: 1 }` unique、`{ scaleInstanceId: 1, runNo: 1 }` unique、`{ scoreResultId: 1, runNo: 1 }`、`{ scaleInstanceId: 1, status: 1, createdAt: -1 }`、`{ assessmentVisitId: 1, scaleCode: 1, createdAt: -1 }`、`{ patientId: 1, scaleCode: 1, createdAt: -1 }`、`{ status: 1, updatedAt: -1 }`、`{ scaleCode: 1, scaleVersion: 1 }`、`{ qualityStatus: 1, updatedAt: -1 }`、`{ 'domainScores.domainCode': 1 }`。
- `CognitiveDomainsService` 保留既有规范化、按 code / 实例 / ScoreResult / 访视 / 患者读取能力，并新增按 scaleInstanceId + runNo 精确读取和受控 runNo=1 create；ObjectId 只在 Service 转换，不返回 Mongoose document，duplicate key 不向客户端泄露 Mongo 错误。
- `summarizeDomainScores()` 已向后兼容增强 minScore：完整新输入按 `(score-min)/(max-min)` 计算并限制 0-100；旧调用方未提供 min 时保留 legacy score/max 语义；included 未评分时 percentage=null，excluded contribution 不进入 score / min / max。domainScores 按 domainCode 排序，contributions 按 itemOrder / itemCode / domainCode 排序。
- A19 公开 `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/cognitive-domain-results/compute` 与对应 `GET .../latest`。两个接口显式使用 Session / Roles Guard 和四个临床角色；compute 额外使用 `@CurrentUser()`，只把当前用户 ID 写入内部 computation.computedBy，公开响应不返回该字段。
- 首次 compute 要求 active Patient、draft / in_progress / completed Visit、completed ScaleInstance，以及 runNo=1、confirmed / locked、confirmedAt 完整、qualityStatus=passed、reviewed、total 完整且 computation.warningCount=0 的 ScoreResult。latest 与既有结果幂等返回允许历史 Patient / Visit / Instance 状态。
- 纯映射只读取 ScoreResult.itemScores 安全快照，并与实例绑定 ScaleVersion 的 itemCode 集合、countsTowardTotal、min/max 和 cognitiveDomainCodes 规范化集合一致性逐项校验；不读取 raw / structured / text 作答、missingReason、step / prompt 实际值、图片、手写、expectedValue、scoringRule、isCorrect 或 AI。
- 当前 mappingSource=scale_config、mappingMode=item_domain_codes、domainMappingVersion=`a19-item-domain-codes-1.0`。domain code trim + lowercase，同 item 同 domain 去重；weight 固定 1。单 item 多 domain 时每个 domain 获得完整 score / max，不拆分、不平均，属于重叠归因；domainScores 不可跨 domain 相加解释为量表总分。
- 首次创建固定 domainResultCode=`CDR-{UUID无连字符大写}`、runNo=1、status=computed、reviewStatus=not_required、qualityStatus=unchecked、isFinal=false，不设置 confirmedAt / lockedAt / voidedAt、operatorNote 或客户端 metadata。mappingSnapshot 保存固定 policy 与安全说明；computation 保存固定 rule / engine version、计数、时间和内部 computedBy。
- computed / needs_review / confirmed / locked 既有结果返回 alreadyComputed=true 且不重算；draft / voided 分别拒绝。创建依赖既有 `{ scaleInstanceId, runNo }` 唯一索引，duplicate key 后重读；不使用 transaction、分布式锁、临时 draft 或 runNo=2。
- public mapper 显式输出 domain score、题目贡献、受控 mapping policy / interpretation、computation 和版本追溯；不输出 subjectCode、原始作答、评分 / 确认意见、metadata、qualityHints、computedBy、原始 Mixed mappingRules、阈值或诊断结论。scorePercent 仅是映射项目得分比例，不是疾病概率。

## 9. 当前 reports 临床报告模型与医生确认流程底座

- `ClinicalReport` Schema 位于 `backend\src\modules\reports\schemas\clinical-report.schema.ts`。
- `ClinicalReport` collection 为 `clinical_reports`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ClinicalReport` 当前覆盖患者、访视、主量表实例、计分结果、认知域结果、媒体证据引用，并通过证据快照保留 `MediaEvidence` 与 `ItemResponse` 引用。
- 当前已通过 `ClinicalReport.patientId`、`assessmentVisitId`、`primaryScaleInstanceIds`、`scoreResultIds`、`cognitiveDomainResultIds`、`mediaEvidenceIds`、`evidenceSnapshots.itemResponseId` 建立 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ScoreResult` -> `CognitiveDomainResult` -> `ClinicalReport` 的报告引用链，并保留必要题目作答与媒体证据引用。
- `ClinicalReport` 当前保存报告编码、展示编号、类型、状态、版本、来源、患者快照、访视快照、量表版本追溯、计分结果快照、认知域结果快照、媒体证据摘要、报告正文占位、AI 草稿占位、医生确认、锁定、归档、更正记录占位、作废字段、审计引用占位、质控状态、质控提示和 metadata。
- `ClinicalReport` 当前内嵌 `ReportPatientSnapshot`、`ReportVisitSnapshot`、`ReportScaleTraceSnapshot`、`ReportScoreSnapshot`、`ReportDomainSnapshot`、`ReportEvidenceSnapshot`、`ReportNarrativeSnapshot`、`ReportAiDraftSnapshot`、`ReportConfirmationSnapshot` 与 `ReportCorrectionRecord` 子文档，均使用 `_id: false`。
- `ClinicalReport` 当前索引为 `{ reportCode: 1 }` unique、`{ assessmentVisitId: 1, reportType: 1, reportVersion: -1 }`、`{ patientId: 1, createdAt: -1 }`、`{ subjectCode: 1, createdAt: -1 }`、`{ status: 1, updatedAt: -1 }`、`{ reportType: 1, status: 1 }`、`{ 'scoreSnapshots.scaleCode': 1 }`、`{ 'domainSnapshots.domainCode': 1 }`、`{ qualityStatus: 1, updatedAt: -1 }`。
- `ReportsService` 当前提供最小内部读取能力：规范化 `reportCode`、按报告编码读取、按访视读取最新报告、按访视 / 患者 / 状态读取报告列表、按患者读取 confirmed / archived / corrected 报告列表；返回结果经过 mapper，不直接返回完整 Mongoose document。
- `ReportsService` 当前提供不落库的报告状态转换校验纯函数：支持 `draft -> pending_confirmation / voided`、`pending_confirmation -> draft / confirmed / voided`、`confirmed -> archived / corrected / voided`、`archived -> corrected`，`corrected` 与 `voided` 默认不再流转。
- A20 新增 `POST /patients/:patientId/visits/:visitId/clinical-reports/generate` 和 `GET /patients/:patientId/visits/:visitId/clinical-reports/latest`。报告资源边界为 AssessmentVisit，generate 由客户端显式选择 1-10 个不重复的同访视 ScaleInstance；请求顺序不构成业务差异。
- 首次生成要求 active Patient、draft / in_progress / completed Visit、completed / locked ScaleInstance、绑定 ScaleDefinition / ScaleVersion 一致、runNo=1 confirmed / locked 且 passed / reviewed / 完整无 warning 的 ScoreResult，以及 runNo=1 computed / confirmed / locked、scale_config + item_domain_codes、有效无 warning 的 CognitiveDomainResult；不自动调用 A17-A19，也不修改来源。
- A20 媒体只纳入 selected instance 下 attached / locked、stored、未删除的 photo / handwriting 索引；unchecked / acceptable 可纳入，needs_review 派生报告 needs_review，unusable 或有效证据缺失 objectKey / ownership 字段时阻断。系统不读取 Buffer / 轨迹、不做 OCR、图像识别、媒体评分或 AI。
- A20 单次创建 patientSnapshot、visitSnapshot（clinicalContext 固定 null）、历史 scaleTraces、scoreSnapshots（scoreDetails=null）、domainSnapshots（不编造 minScore）、evidenceSnapshots（storageObjectKey 仅内部）、五段固定 narrative、`aiDraft={ status: 'not_requested', doctorEdited: false }` 与受控 `metadata.a20Generation`。公开 mapper 不返回 metadata、source result ID、media / item ID、storageObjectKey、scoreDetails、clinicalContext、qualityHints 或 AI draftText。
- 新报告固定 reportType=cognitive_assessment、reportVersion=1、status=draft、source=system_draft、confirmation=null、isFinal=false；reportCode 为 `RPT-{SHA256 前 24 位大写十六进制}` 的确定性非隐私编码。metadata 记录 UUID generationId、generatedAt / actor、engineVersion=`a20-clinical-report-draft-1.0`、显式 scope、内部 source ID 和 `aiUsed=false`。
- 同一 Visit / type / version 只允许一个结果：同 scope 返回 `alreadyGenerated=true` 且不重读来源或修改报告；不同 scope 返回 `CLINICAL_REPORT_SCOPE_CONFLICT`；voided 返回 `CLINICAL_REPORT_VOIDED`；不完整历史报告拒绝自动修复。并发由既有 reportCode unique 索引兜底，duplicate key 后重读；没有 transaction、分布式锁、临时 draft、覆盖、重生成或 version 2。
- latest 按 reportVersion、createdAt 倒序只读，允许 inactive / archived Patient 和 locked / voided Visit 的历史读取；公开支持安全展示 draft / pending_confirmation / confirmed / archived / corrected / voided。A20 不实现医生确认、状态写流转、签名、锁定、归档、更正、作废、PDF、Storage 文件或 AI。
- A21 新增 `ClinicalReportResourceParamDto`、`UpdateClinicalReportDraftDto`、`SubmitClinicalReportForConfirmationDto` 与 `ConfirmClinicalReportDto`，请求严格拒绝客户端 status、source、actor、metadata、snapshot、confirmation、签名或锁定字段。
- draft PATCH 只修改 `doctorOpinion` 与显式提供的 `recommendationText`；空 recommendation 表示清除。A20 五段系统 narrative、scope、所有结构化快照、aiDraft、reportCode / version / type 均保持不变，成功后 source 固定为 mixed。
- `metadata.a21Edits` 以 UUID、服务端时间和认证 actor 追加内部审计，保存 changedFields / previousValues / nextValues / editNote，最多 200 条且不静默裁剪；公开只返回 editCount、最后编辑人 / 时间 / changedFields，不返回事件历史或 previous / next。
- submit 显式要求 `confirm=true` 与 submissionNote，readiness 以 ClinicalReport 自身 A20 快照为准，不重读来源；成功写 `a21Submission` 并进入 pending_confirmation。pending 重复提交返回既有 submissionId / 时间 / actor / note，不重写审计。
- confirm 仅 doctor / admin，显式要求 confirmationNote；成功写 Schema confirmation 与 `a21Confirmation`，进入 confirmed、qualityStatus=passed、isFinal=true。confirmed / archived / corrected 重复确认幂等；历史报告缺少 A21 namespace 时可从 Schema confirmation 安全回退，confirmedAt 缺失则拒绝猜测。
- 三个写接口均要求严格 ISO `expectedUpdatedAt`，原子 filter 包含 report / patient / visit ownership、type、version、允许状态和 updatedAt；单次 `findOneAndUpdate({ new: true, runValidators: true })` 完成。没有自动覆盖、自动重试、transaction、分布式锁或 AuditLog 写入。
- confirmed 与 locked 明确分离：A21 不设置 lockedAt / signatureText，不修改 Patient、Visit、ScaleInstance、ItemResponse、ScoreResult、CognitiveDomainResult、MediaEvidence，不调用来源 Service、Storage、LLM 或 PDF。
- A22 新增唯一公开接口 `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/lock`。Body 仅允许 `confirm=true`、trim 3-2000 `lockNote` 与 strict ISO `expectedUpdatedAt`；Controller 复用 `ClinicalReportResourceParamDto`、`SessionAuthGuard`、`RolesGuard`、`@CurrentUser()`，方法级 `@Roles('doctor', 'admin')`。
- 首次锁定要求 active Patient、draft / in_progress / completed Visit，以及完整 confirmed / mixed / passed version 1 cognitive assessment report。报告自身必须具有完整 confirmation、A20 generation、A21 submission / confirmation、patient / visit / scale / score / domain 快照、五段 narrative 与合法 doctorOpinion，且未锁定、未归档、未作废、无 correctionRecords；不重读或验证来源当前状态。
- `ReportsService.lockReportIfUnmodified()` 的单次 `findOneAndUpdate({ new: true, runValidators: true })` filter 包含完整 ownership、type/version、confirmed/mixed/passed、锁定 / 归档 / 作废空值、空 correctionRecords 与 expectedUpdatedAt；update 只写 lockedAt、lockedBy、metadata。没有 transaction、自动重试或来源写入。
- `metadata.a22Lock` version 固定 1，保存服务端 randomUUID lockId、服务端 lockedAt、认证 actor ID / name / doctor-or-admin role 与 trim lockNote；写入时创建新 metadata 根对象，保留 a20Generation、a21Edits / Submission / Confirmation 和未知顶层 namespace，不修改原引用。
- public response 保留 top-level lockedAt，并新增 `lock` 安全摘要；lock response 为 `{ report, lockReceipt }`，receipt 含 lockId、lockedAt、安全 actor、可选 lockNote、alreadyLocked。绝不返回 metadata 或 Schema 原始 lockedBy。
- 重复锁定不写库、不改 updatedAt / lockId / 时间 / actor / note，即使请求携带旧 expectedUpdatedAt 也返回 alreadyLocked=true。合法 a22Lock 返回完整审计；历史 lockedAt + lockedBy 且无 a22Lock 时 lockId=null、role=unknown 安全 fallback；字段残缺或 a22Lock 不一致返回 `CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE`。
- 锁定后 status 仍为 confirmed、qualityStatus 仍为 passed、isFinal 仍为 true，confirmation、reportCode、reportVersion、narrative、快照与来源对象全部不变。A22 不新增 locked status，不实现 unlock / reopen / return / reject / archive / correct / void，不生成 PDF / Storage 文件，不调用 AI / LLM。

## 10. 当前 users / auth 认证、用户、会话与角色权限底座

- `User` Schema 位于 `backend\src\modules\users\schemas\user.schema.ts`。
- `User` collection 为 `users`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `User` 当前覆盖账号名、展示名、staffCode、email、phone、`passwordHash`、密码变更时间、roles、permissions、userType、status、department、organization、lastLoginAt、failedLoginCount、lockedUntil 和 metadata。
- `User.passwordHash` 设置 `select: false`，普通 `UsersService` mapper 输出不包含 `passwordHash`。
- `User` 当前索引为 `{ accountName: 1 }` unique、`{ staffCode: 1 }` unique + sparse、`{ email: 1 }` unique + sparse、`{ phone: 1 }` sparse、`{ status: 1, accountName: 1 }`、`{ roles: 1, status: 1 }`、`{ userType: 1, status: 1 }`。
- `UsersService` 当前提供内部账号读取和规范化能力：`normalizeAccountName()`、`normalizeEmail()`、`normalizeStaffCode()`、`findUserById()`、`findUserByAccountName()`、`findUserCredentialByAccountName()`、`listActiveUsers()`；不创建、更新、删除用户，不实现密码重置或公开用户管理 API。
- `Session` Schema 位于 `backend\src\modules\auth\schemas\session.schema.ts`。
- `Session` collection 为 `sessions`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `Session` 当前覆盖 userId、`sessionTokenHash`、status、expiresAt、revokedAt、lastSeenAt、userAgent、ipAddress、rolesSnapshot、permissionsSnapshot 和 metadata。
- `Session.sessionTokenHash` 设置 `select: false`；AuthService 入库前对 raw session token 做 SHA-256 hash，不保存明文 session token。
- `Session` 当前索引为 `{ sessionTokenHash: 1 }` unique、`{ userId: 1, status: 1 }`、`{ expiresAt: 1 }` TTL（`expireAfterSeconds: 0`）、`{ status: 1, updatedAt: -1 }`、`{ userId: 1, createdAt: -1 }`。
- `AuthService` 当前提供内部认证底座能力：`hashPassword()`、`verifyPassword()`、`generateSessionToken()`、`hashSessionToken()`、`authenticateWithPassword()`、`createSessionForUser()`、`validateSessionToken()`、`revokeSessionByToken()`、`buildPublicAuthUser()` 和 `toAuthUserResponse()`；使用 Node.js 内置 `crypto`，不使用 JWT 作为主登录态。
- `AuthenticatedUserContext` 当前位于 `backend\src\modules\auth\types\auth-user-context.type.ts`，用于后续 Guard 或 Controller 挂载 `req.user`。
- 当前已新增 `@Public()`、`@Roles()`、`@CurrentUser()`、`SessionAuthGuard` 与 `RolesGuard`；`SessionAuthGuard` 可从 cookie-parser cookies 或原始 `cookie` header 读取 `cogmemory_ad_session` 并调用 `AuthService.validateSessionToken()`，成功后挂载 `req.user`；`RolesGuard` 基于 `@Roles()` 和 `req.user.roles` 做角色底座校验。
- `SessionAuthGuard` 与 `RolesGuard` 当前未注册为全局 Guard，不影响 `GET /health`。
- `UsersModule` 与 `AuthModule` 已注册到 `AppModule`；`AuthModule` 声明 `AuthController`，`UsersModule` 不声明 Controller。
- `AuthController` 当前公开 `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`：登录校验账号密码、创建服务端 session 并下发 HttpOnly `cogmemory_ad_session` Cookie；登出从 Cookie 读取 session token，存在则内部撤销 session，并清除 Cookie；`GET /auth/me` 使用 `SessionAuthGuard` 显式保护并返回当前用户公开上下文。
- 当前不提供用户管理或权限管理 API；不提供前端登录页、认证态联动或权限菜单。

## 11. A23 已锁报告来源链冻结

- 唯一新增公开接口为 `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/freeze-sources`；DTO 只接收显式 `confirm=true`、trim 3-2000 `freezeNote` 与 strict ISO `expectedUpdatedAt`，仅 doctor / admin 可执行。
- 首次发起要求 report 为已锁定且完整 confirmed / mixed / passed version 1 报告，并验证 A20 generation、A21 submission / confirmation 与 A22 lock 审计。scope 只来自报告的 primaryScaleInstanceIds、scoreResultIds、cognitiveDomainResultIds、mediaEvidenceIds；实例下全部 ItemResponse ID 在首次审计中固化。
- A23 冻结 ScaleInstance completed→locked、ItemResponse answered/scored→locked、ScoreResult confirmed→locked、MediaEvidence attached→locked；CognitiveDomainResult computed/confirmed 只设置 lockedAt，保留原 status。已有合法锁与 lockedAt 均保留。
- `metadata.a23SourceFreeze` version=1 使用 `in_progress / completed`，保存 freezeId、原始 actor/note/time、sourceLockedAt、内部 scope 和计数。跨五类集合不使用 transaction；部分失败不回滚、不解冻，重复 POST 按固化 scope 恢复；仅在重新读取全部精确来源并验证后写 completed。completed 重复请求即使 expectedUpdatedAt 已旧也只读幂等返回。
- latest 与写响应只返回安全 `sourceFreeze` 摘要和 receipt；不返回 metadata、scope IDs 或来源关联 ID。A14 ItemResponse 草稿、A15 上传/作废、A16 submit、A18 review/confirm 等写路径增加 lockedAt 防御。
- 不冻结 Patient、AssessmentVisit、ScaleDefinition、ScaleVersion、Storage 对象；不实现 unfreeze、rollback、AuditLog、PDF 或 AI。ReportsModule 只调用来源模块导出的 Service，不直接注入来源 Model。
- A23 实际验证：build 通过；69 个单元测试套件 / 597 个测试通过；隔离 test DB 上 12 个 E2E 套件 / 55 个测试通过，其中 A23 为 1 个套件 / 4 个测试。

## 12. A24 已冻结报告归档

- 唯一新增公开接口为 `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/archive`；复用 `ClinicalReportResourceParamDto`、类级 Session / Roles Guard、方法级 doctor / admin 与 `@CurrentUser()`。`ArchiveClinicalReportDto` 只允许显式 `confirm=true`、trim 3-2000 的 `archiveNote` 和 strict ISO `expectedUpdatedAt`。
- Patient 与 Visit 只用于存在性、联合归属和跨患者 / 跨访视防护；Patient inactive 不阻断，Visit locked 不阻断，A24 不修改二者。
- 首次 readiness 要求 version 1 cognitive_assessment 报告为 confirmed / mixed / passed、confirmation 完整、isFinal 可由 status 派生为 true、A22 lockedAt / lockedBy 与受控 a22Lock 一致、A23 sourceFreeze 为完整 completed 审计、归档 / 作废字段为空且无 correctionRecords。A24 不重新读取五类来源或 Storage。
- 归档复用既有 `confirmed -> archived` 状态转换，没有新增状态或修改转换表。`ReportsService.archiveReportIfUnmodified()` 以完整 ownership、type/version、confirmed/mixed/passed、锁定非空、归档 / 作废空值、空 correctionRecords、updatedAt、A23 completed 和 A24 namespace 不存在为 filter，单次 `findOneAndUpdate({ new: true, runValidators: true })` 只 `$set` status、archivedAt、archivedBy、metadata。
- `metadata.a24Archive` version=1，只写一次，保存服务端 UUID archiveId、服务端 archivedAt、认证 actor ID / name / doctor-or-admin role、trim archiveNote，以及 A23 freezeId / completedAt 来源锚点；构造新 metadata 根对象并保留 A20-A23 与未来未知合法 namespace。
- 重复 archived / corrected 归档只读幂等，允许旧 expectedUpdatedAt，不生成新 ID，不改 archivedAt / archivedBy / note / updatedAt。历史完整 archivedAt + archivedBy 且无 a24Archive 时返回 archiveId / sourceFreeze anchor 为 null、actor role=unknown 的安全 fallback，不补写 metadata；字段或审计不一致返回 `CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE`。
- public report 继续保留兼容顶层 archivedAt，并新增 nullable `archive` 安全摘要；写响应为 `{ report, archiveReceipt }`，receipt 额外包含 alreadyArchived。公开响应不含 metadata、Schema 原始 archivedBy、source IDs、A23 scope、Session 或 currentUser。
- 乐观并发冲突返回 `CLINICAL_REPORT_ARCHIVE_CONFLICT`，不自动重试或覆盖；未知持久化失败为 `CLINICAL_REPORT_ARCHIVE_FAILED`。A24 不修改 lockedAt / lockedBy、a22Lock、a23SourceFreeze、confirmation、narrative、快照、scope、reportCode / version / type 或来源对象。
- 实际验证：scoped reports/A24 lint 通过；build 通过；全量 unit 72 个套件 / 625 个测试通过；A24 定向 E2E 1 个套件 / 6 个测试通过；全量 E2E 13 个套件 / 60 个测试通过。A24 完成后补充执行的最近两次全量 E2E 均在 `NODE_ENV=test`、Jest `--runInBand`、隔离 `cogmemory_ad_test`、fake Storage、stub SMS / LLM 和脱敏人工数据环境中完整通过，未调用真实外部服务。此前一次全量复跑曾出现既有跨套件 test catalog / 数据顺序污染现象；该现象在随后两次完整串行复跑中未再次出现。当前验证结论以最近连续两次全量通过为准，但尚不据此宣称潜在测试隔离风险已被永久消除。未运行全模块 lint，既有 scoring 格式技术债未修改。

## 13. A25 归档报告版本化更正

- 唯一新增接口为 `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/corrections`，Body 仅允许 strict `confirm=true`、trim 3-2000 `correctionReason`、trim 3-4000 `changeSummary` 与首次源报告最新 `expectedUpdatedAt`；类级 Session / Roles Guard、方法级 doctor / admin 与 CurrentUser 生效。
- 首次 source 必须是当前 Visit / cognitive_assessment latest，状态 archived、mixed / passed / isFinal，confirmation 与 A21 submission/confirmation 完整，A22 lock、A23 completed freeze、A24 archive 及 freeze anchors 全部合法；historical archive fallback 不可发起。Patient inactive、Visit locked / voided 不阻断，且 Patient / Visit 不被修改。
- 线性链固定 `replacementVersion=sourceVersion+1`、`correctionNo=replacementVersion-1`，replacement code 复用 `buildClinicalReportCode()`。源先写 `metadata.a25Correction.state=in_progress`，创建并验证唯一 replacement，再记录 replacement anchor，最后单文档更新 source 为 corrected、追加一条 correctionRecords 并完成审计；没有 Mongo transaction、回滚、删除或分支。
- replacement 深复制 Patient / Visit、量表、评分、认知域、媒体证据、系统五段 narrative、doctorOpinion / recommendationText、aiDraft 与来源 ID；固定 draft / mixed / needs_review，重置 confirmation、lock、sourceFreeze、archive、void、correctionRecords、auditLogRefs。metadata 仅复制经验证的 a20Generation 并写新的 a25CorrectionReplacement。
- 中断恢复沿用持久化 correctionId / correctionNo / reason / summary / startedBy / archive-freeze anchors；replacement 未创建则继续创建，已创建则验证后完成。completed 请求允许旧 expectedUpdatedAt、只读返回原事实且不修改 updatedAt。
- A20 generate 改为 latest-first：任何合法版本存在时返回最新版本，不再创建 V1；A21 原子 filter 使用服务端读取的真实 reportVersion。合法 V2+ replacement 的 edit / submit / confirm 仅 doctor/admin，并豁免 Patient inactive 与 Visit locked / voided；普通 V1 角色和状态边界不变。
- public report 新增 nullable `correction` / `replacementOf`，写响应新增 sourceReport、replacementReport 与 correctionReceipt；不公开 metadata、原始 correctionRecords、五类来源 ID 或 AuditLog ID。A25 本身不自动锁定、冻结或归档 replacement；A26 允许后续显式复用 A22-A24。
- A25 实际验证：scoped `src/modules/reports + clinical-report-correction.e2e-spec.ts` lint 通过；build 通过；全量 unit 75 suites / 653 tests；A25 定向 E2E 1 suite / 4 tests；全量 E2E 14 suites / 64 tests。测试使用 `NODE_ENV=test`、隔离 test DB、fake Storage、stub SMS/LLM 与脱敏人工数据，未调用真实外部服务；数量来自实际 Jest 执行，不由历史数量相加推算。A24 校准后的 13 suites / 60 tests 历史事实继续保留。

## 14. A26 replacement 不可逆生命周期泛化

- 三个既有 endpoint、请求 DTO、角色与公开 response 未变；V1 继续走原资格。V2+ 在 lock / freeze / archive 初始读取与原子 miss 重读时执行统一全链 lineage 校验，任一非法跳转、缺失或单边 A25 关系返回 409 `CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID`。
- lineage 从当前 `a25CorrectionReplacement` 的 previousReportId 在同 Patient / Visit ownership 内逐级回溯到 V1；每一跳验证连续整数版本、同 reportType、前序 corrected、completed source correction、唯一 correctionRecord、当前 replacement 与 A22-A24 archive/freeze anchors 的完整双向关系。
- V1 lock / freeze 保留 active Patient 与可编辑 Visit；合法 V2+ 不受历史 Patient inactive、Visit locked / voided 阻断。archive 对 V1/V2+ 均只校验 ownership 和报告自身 readiness。所有写入只落当前报告，前序 corrected 报告不变。
- lock、freeze start、freeze complete、archive 的内部输入与原子 filter 使用服务端读取的真实精确 reportVersion。A23 complete 还精确匹配 start 后 updatedAt 与完整 confirmed / lock / unarchived / unvoided / no-correction 前置；没有宽泛 `>=2` 更新。
- replacement freeze 从当前固化快照与来源 ID 建立独立 scope/receipt；前序已冻结共享来源经精确兼容性验证后计入 previouslyFrozen，不再次写五类来源的 status、lockedAt、updatedAt 或首次事实。中断恢复沿用原 freezeId、scope、started actor 与 note。
- A26 实际验证：变更文件定向 ESLint 通过；build 通过；lineage + ReportsService + 三个 Workflow 定向 unit 5 suites / 57 tests；全量 unit 76 suites / 666 tests；A26 定向 E2E 1 suite / 7 tests；全量 E2E 14 suites / 67 tests。E2E 覆盖 V1 回归、V2/V3 A21-A24、inactive Patient + voided Visit、共享来源未重写、权限、非法 lineage、幂等、历史 fallback 与 stale 并发；使用隔离 test DB、fake Storage、stub SMS/LLM 和脱敏人工数据。

## 15. 当前尚未实现

- 尚无公开用户管理接口、角色权限管理接口、短信验证码接口、OAuth / SSO 接口或密码重置接口。
- 尚无医生端或患者端业务。
- A12-A26 已覆盖评分计算/复核/确认、认知域计算、报告生成/编辑/确认/锁定/来源冻结/归档/版本化更正与 replacement 后续生命周期；仍无评分独立 lock / void / reopen / 重跑、认知域人工修改 / 确认 / 作废 / 重算、报告签名 / unfreeze / unarchive、correction cancel / branch 或 PDF 接口。
- 尚无批量作答、自动保存调度、计时动作、提交撤销 / reopen / lock / force submit 或访视状态流转接口。
- 媒体当前仅有题目下列表、服务端 multipart 上传、短期签名访问与逻辑作废；尚无全患者 / 访视 / 实例媒体列表、直接 objectKey 下载、永久 URL、物理删除、替换、批量、分片或客户端直传接口。
- 尚无全量数据库 seed runner、量表管理或完整 MMSE / MoCA 题目配置公开接口；A13 只在初始化时按需物化并提供安全摘要。
- 已有 A17 compute / latest 与 A18 单题人工复核 / 确认；尚无批量人工评分、锁定、作废、撤销确认、reopen、重跑或历史列表接口。
- 已有 A19 认知域 compute / latest；尚无认知域人工复核、确认、锁定、作废、重算、历史列表、跨量表合并或报告接口。
- 已有 A20-A26 报告 generate / latest / edit / submit / confirm / lock / freeze-sources / archive / corrections，以及任意合法线性 replacement 的同一生命周期；尚无签名、unlock / unfreeze / unarchive、correction cancel / branch、历史列表、PDF / Word / 打印导出、AuditLog 模型或 AI 报告。
- 尚无作答提交后自动计分或自动认知域计算触发；A17 / A19 均由显式 compute 触发，不包含 MMSE / MoCA itemCode、domain title 或诊断规则硬编码。
- 尚无短信发送接口。
- 尚无 AI / LLM 调用接口。
- 尚无患者编辑 / 删除 / 归档、访视编辑 / 删除 / 状态流转，以及 A12-A26 已列接口之外的量表、作答、媒体、计分、认知域、报告等其他业务 Controller 或公开业务 API。
- 尚未实现用户创建、用户更新、用户禁用、重置密码、角色权限管理、短信验证码、OAuth / SSO、JWT 主登录态、前端登录页、前端认证态或权限菜单。
- A12-A24 真实 HTTP E2E 已执行；A24 定向 E2E 为 1 个套件 / 6 个测试通过，全量 E2E 为 13 个套件 / 60 个测试通过，A24 完成后补充执行的最近两次全量 E2E 均完整通过。执行使用 `NODE_ENV=test`、Jest `--runInBand`、隔离 `cogmemory_ad_test`、fake Storage、stub SMS / LLM 和脱敏人工数据，未调用真实外部服务。
- 已完成 A24 scoped lint、后端 build、72 个单元测试套件 / 625 个测试通过。此前一次全量复跑曾出现既有跨套件 test catalog / 数据顺序污染现象，该现象在随后两次完整串行复跑中未再次出现；当前验证结论以最近连续两次全量通过为准，但尚不据此宣称潜在测试隔离风险已被永久消除。未运行全模块 lint，既有 scoring 格式技术债未由 A24 修改。

## 16. 后续同步规则

- 后续新增模块、接口、DTO、数据模型、Service 或测试命令后，应同步更新对应 handoff 文档。
- 本文档只记录已确认事实，不承载未确认推测。
