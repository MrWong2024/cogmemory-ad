# CogMemory AD / 智忆评 后端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 后端当前事实快照，帮助后续交接时快速判断后端工程、模块、接口和验证能力的真实状态。

## 2. 当前工程状态

- `backend\src` 公共底座已初始化。
- 已具备 NestJS 启动入口、根模块、全局应用配置、健康检查、配置加载与校验、MongoDB 连接底座、全局 ValidationPipe、全局异常过滤器和 Storage 公共模块。
- `backend\src\modules` 当前包含 `storage`、`scales`、`patients`、`assessments`、`media`、`scoring`、`cognitive-domains` 与 `reports`。
- `StorageModule` 当前只提供 fake / OSS 底层 driver 结构和 `STORAGE_SERVICE` token，不提供业务上传接口。
- `ScalesModule` 当前提供量表定义 / 量表版本 Schema、内部 `ScalesService` 读取底座、MMSE / MoCA 初始配置 seed 常量、内部只读 `ScaleSeedDataService` 和 `validateScaleSeeds()` 种子校验纯函数，不提供公开业务接口。
- `PatientsModule` 当前只提供患者 / 受试者基础档案 Schema 与内部 `PatientsService` 读取底座，不提供公开业务接口。
- `AssessmentsModule` 当前只提供访视 / 量表实例运行时 Schema、题目作答数据 Schema 与内部 `AssessmentsService` 读取底座，不提供公开业务接口。
- `MediaModule` 当前只提供媒体证据元数据 Schema 与内部 `MediaEvidenceService` 读取底座，不提供公开媒体上传、下载、查询、删除或签名 URL 接口。
- `ScoringModule` 当前只提供计分结果快照 Schema、内部 `ScoringService` 读取底座和 `summarizeItemScores()` 通用计分汇总纯函数，不提供公开计分触发、查询、复核或报告接口。
- `CognitiveDomainsModule` 当前只提供认知域结果快照 Schema、内部 `CognitiveDomainsService` 读取底座和 `summarizeDomainScores()` 通用认知域汇总纯函数，不提供公开认知域计算触发、查询、复核或报告接口。
- `ReportsModule` 当前只提供临床报告快照 Schema、内部 `ReportsService` 读取底座和报告状态转换校验纯函数，不提供公开报告生成、查询、医生确认、归档、更正、作废、PDF 导出或 AI 生成接口。
- OSS 业务上传服务、SMS Service、LLM Service 均未实现。
- 本地默认后端端口为 `5002`。
- 本地默认前端 origin 为 `http://localhost:3002`。
- `GET /health` 是当前唯一公共接口。
- 已完成后端公共底座基础闭环本地验证：`npm install` 成功、`npm run build` 成功、`npm test -- --runInBand` 成功、`npm run start:prod` 启动成功。
- 单元测试验证结果为 11 个测试套件通过、116 个测试通过。
- 后端 TypeScript 编译根目录为 `.`，`outDir` 保持 `./dist`，因此 `src/main.ts` 编译后的主入口产物为 `dist/src/main.js`。
- `package.json` 中 `start:prod` 保持指向 `./dist/src/main.js`，当前 build 产物路径已与该启动路径对齐。
- `tsBuildInfoFile` 保持 `./dist/tsconfig.build.tsbuildinfo`；`dist` 与 `*.tsbuildinfo` 均作为生成物处理，不作为项目源文件纳入版本库。
- 用户已补充验证 `npm run start:prod` 本地启动成功；该验证只代表公共底座本地基础启动链路通过，不代表真实生产环境部署完成。
- 当前不得写成完整业务后端已经实现。

## 3. 当前已确认后端事实

- 项目名称为 CogMemory AD / 智忆评。
- health 响应 service 为 `cogmemory-ad-backend`。
- MongoDB 默认命名口径为 `cogmemory_ad_dev`、`cogmemory_ad_test` 和 `cogmemory_ad`。
- Session cookie 默认名为 `cogmemory_ad_session`。
- Storage object prefix 默认值为 `cogmemory_ad`。
- development / test 默认 `STORAGE_DRIVER=fake`，production 默认 `STORAGE_DRIVER=oss`。
- OSS、SMS、LLM 配置均为占位或示例口径，不包含真实密钥。
- OSS 业务上传服务、SMS Service、LLM Service、业务上传接口均未实现。
- 当前已有 `scales`、`patients`、`assessments`、`media`、`scoring`、`cognitive-domains` 与 `reports` 内部模型底座，其中 `scales` 已包含 MMSE / MoCA 初始配置 seed 常量、只读读取 Service 和 seed 校验纯函数，`assessments` 已包含 `AssessmentVisit`、`ScaleInstance` 与 `ItemResponse`，`media` 已包含 `MediaEvidence`，`scoring` 已包含 `ScoreResult`，`cognitive-domains` 已包含 `CognitiveDomainResult`，`reports` 已包含 `ClinicalReport`；但无公开业务 API、认证、真实患者建档流程、评估执行业务接口、作答提交、媒体上传 / 下载 / 签名 URL、数据库 seed runner、seed 写库、公开 MMSE / MoCA 配置查询接口、计分触发、认知域计算触发、MMSE / MoCA 专用计分规则执行、MMSE / MoCA 专用认知域规则执行、报告生成接口、医生确认写库流程、PDF 导出、疾病诊断或 AI。
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
- `validateScaleSeeds()` 当前为不落库的种子数据校验纯函数，覆盖量表 code、版本、group code、item code、groupCode 引用、CRF 编码重复风险、scoreRange、证据 / 计时一致性、MoCA 即刻记忆不计分、MoCA 延迟回忆提示后表现保留、MoCA 抽象项 CRF 修正、MMSE 表达第 9 项和绘图第 10 项修正，以及 MMSE / MoCA 连续减 7 分步配置。
- MMSE seed 当前来源标识为 `MMSE+MoCA.pdf`，版本为 `1.0`，总分范围 0-30，包含定向力、即刻回忆、注意力和计算力、回忆、语言、视空间 / 绘图分组；题目覆盖时间定向、地点定向、即刻回忆、连续减 7、延迟回忆、命名、重复、阅读并执行、三步指令、表达 / 写完整句子和绘图。
- MoCA seed 当前来源标识为 `MMSE+MoCA.pdf`，版本为 `1.0`，总分范围 0-30，包含视空间与执行功能、命名、即刻记忆、注意、语言、抽象、延迟回忆和定向分组；题目覆盖交替连线、立方体、钟表、命名、两次即刻记忆记录、数字广度、警觉性、连续减 7、句子复述、词语流畅性、两个抽象项、延迟回忆和定向；`N1.2.15` 总分字段保留在 reporting / research export 映射中。
- 当前未实现数据库 seed runner、seed 写库、公开 MMSE / MoCA 配置查询 API、真实评估执行业务流程、作答提交流程、媒体上传 / 下载 / 签名 URL、MMSE / MoCA 专用自动计分规则执行、报告或 AI。

## 5. 当前 patients / assessments 运行时与作答模型底座

- `Patient` Schema 位于 `backend\src\modules\patients\schemas\patient.schema.ts`。
- `Patient` collection 为 `patients`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `Patient` 当前覆盖受试者稳定编码、展示名、来源类型、性别、出生日期、受教育年限、利手、状态、标签、备注、脱敏外部引用和扩展 metadata。
- `Patient` 当前索引为 `{ subjectCode: 1 }` unique、`{ status: 1, subjectCode: 1 }`、`{ sourceType: 1, status: 1 }`。
- `AssessmentVisit` Schema 位于 `backend\src\modules\assessments\schemas\assessment-visit.schema.ts`。
- `AssessmentVisit` collection 为 `assessment_visits`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `AssessmentVisit` 当前覆盖患者引用、受试者编码快照、访视编码、访视类型、状态、评估日期、开始 / 完成 / 锁定 / 作废时间、操作者快照、临床上下文、备注和扩展 metadata。
- `AssessmentVisit` 当前索引为 `{ visitCode: 1 }` unique、`{ patientId: 1, assessmentDate: -1 }`、`{ subjectCode: 1, assessmentDate: -1 }`、`{ status: 1, assessmentDate: -1 }`。
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
- 当前未实现真实患者建档流程、访视创建流程、真实作答提交、作答提交后自动计分触发、MMSE / MoCA 专用计分规则、认知域结果、报告生成流程、AI、认证或权限。

## 6. 当前 media 媒体证据模型底座

- `MediaEvidence` Schema 位于 `backend\src\modules\media\schemas\media-evidence.schema.ts`。
- `MediaEvidence` collection 为 `media_evidences`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `MediaEvidence` 当前覆盖患者、访视、量表实例、题目作答、量表定义和量表版本引用；同时保存受试者编码、量表 code / version、实例编码和题目编码快照。
- 当前已通过 `MediaEvidence.patientId`、`assessmentVisitId`、`scaleInstanceId` 与 `itemResponseId` 建立 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ItemResponse` -> `MediaEvidence` 的证据链 ObjectId 引用关系。
- `MediaEvidence` 当前覆盖证据稳定编码、证据类型、采集方式、证据状态、存储状态、CRF 编码、题目组、题目标题、作答类型、是否计入总分、认知域编码、题目快照、版本追溯、存储对象元数据、图片元数据、平板手写轨迹元数据、采集上下文、操作者快照、质量状态、质量提示占位、操作者备注、描述、扩展 metadata、锁定 / 作废 / 删除时间。
- `MediaEvidence` 当前内嵌 `MediaEvidenceVersionTrace`、`MediaStorageSnapshot`、`MediaImageMetadata`、`HandwritingTraceSnapshot`、`MediaCaptureContext` 与 `MediaOperatorSnapshot` 子文档，均使用 `_id: false`。
- `MediaEvidence` 当前索引为 `{ evidenceCode: 1 }` unique、`{ itemResponseId: 1, evidenceType: 1, status: 1 }`、`{ scaleInstanceId: 1, itemCode: 1, evidenceType: 1 }`、`{ assessmentVisitId: 1, createdAt: -1 }`、`{ patientId: 1, createdAt: -1 }`、`{ status: 1, updatedAt: -1 }`、`{ 'storage.objectKey': 1 }` sparse、`{ scaleCode: 1, itemCode: 1, evidenceType: 1 }`。
- `MediaEvidenceService` 当前提供最小内部读取能力：规范化 evidence code、按证据编码读取、按题目作答读取、按量表实例读取、按访视读取、按患者读取、按题目作答读取 attached / locked 证据；返回结果经过 mapper，不直接返回完整 Mongoose document。
- `MediaEvidence` 仅为媒体证据元数据模型底座，不包含真实图片上传、平板手写轨迹保存、下载、删除、签名 URL、Storage 调用、图片压缩、OCR、图像识别、手写轨迹解析、计分触发、MMSE / MoCA 专用计分规则、报告或 AI 能力。

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
- `ScoreResult` 与 `ScoringService` 仅为计分结果模型和通用计分汇总底座，不包含 MMSE / MoCA 专用计分规则、认知域结果、报告生成流程、AI、认证、权限、状态流转、计分触发或公开接口。

## 8. 当前 cognitive-domains 认知域结果模型与通用汇总底座

- `CognitiveDomainResult` Schema 位于 `backend\src\modules\cognitive-domains\schemas\cognitive-domain-result.schema.ts`。
- `CognitiveDomainResult` collection 为 `cognitive_domain_results`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `CognitiveDomainResult` 当前覆盖患者、访视、量表实例、计分结果、量表定义和量表版本引用，并在题目贡献快照中可引用 `ItemResponse` 与 `ScoreResult`。
- 当前已通过 `CognitiveDomainResult.patientId`、`assessmentVisitId`、`scaleInstanceId`、`scoreResultId`、`itemContributions.itemResponseId` 建立 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ScoreResult` -> `CognitiveDomainResult` 的认知域结果引用关系，并保留必要题目作答引用。
- `CognitiveDomainResult` 当前保存受试者编码、量表 code / version、实例编码、认知域结果编码、运行次数、计算状态、映射来源、映射模式、版本追溯、认知域得分快照、题目贡献快照、映射规则快照、计算过程摘要、人工复核状态、质量状态、质量提示、操作者备注、metadata、确认 / 锁定 / 作废时间。
- `CognitiveDomainResult` 当前内嵌 `CognitiveDomainVersionTrace`、`CognitiveDomainScoreSnapshot`、`CognitiveDomainItemContributionSnapshot`、`CognitiveDomainMappingSnapshot`、`CognitiveDomainComputationSnapshot` 与 `CognitiveDomainReviewSnapshot` 子文档，均使用 `_id: false`。
- `CognitiveDomainResult` 当前索引为 `{ domainResultCode: 1 }` unique、`{ scaleInstanceId: 1, runNo: 1 }` unique、`{ scoreResultId: 1, runNo: 1 }`、`{ scaleInstanceId: 1, status: 1, createdAt: -1 }`、`{ assessmentVisitId: 1, scaleCode: 1, createdAt: -1 }`、`{ patientId: 1, scaleCode: 1, createdAt: -1 }`、`{ status: 1, updatedAt: -1 }`、`{ scaleCode: 1, scaleVersion: 1 }`、`{ qualityStatus: 1, updatedAt: -1 }`、`{ 'domainScores.domainCode': 1 }`。
- `CognitiveDomainsService` 当前提供最小内部读取能力：规范化 domain result code、规范化 domain code、按认知域结果编码读取、按量表实例读取最新认知域结果、按量表实例 / 计分结果 / 访视 / 患者读取认知域结果列表；返回结果经过 mapper，不直接返回完整 Mongoose document。
- `CognitiveDomainsService.summarizeDomainScores()` 当前为不落库的通用认知域汇总纯函数，只根据输入的单题得分快照和认知域映射快照汇总认知域得分、最高分、得分率、权重、题目贡献、计入 / 不计入数量、缺失数量、未评分数量、需复核数量和非有限数字 warning；不读取或修改 `ScoreResult` / `ItemResponse`，不根据 `itemCode` 写死 MMSE / MoCA 专用规则，不从 raw response 推断认知域表现。
- `CognitiveDomainResult` 与 `CognitiveDomainsService` 仅为认知域结果模型和通用认知域汇总底座，不包含 MMSE / MoCA 专用认知域映射规则、疾病诊断、AD 风险等级、报告生成流程、AI、认证、权限、状态流转、计算触发或公开接口。

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
- `ClinicalReport` 与 `ReportsService` 仅为临床报告模型与医生确认流程底座，不包含公开报告 API、真实报告生成、医生确认写库、锁定写库、归档写库、更正写库、作废写库、AuditLog 模型、AiAnalysisResult 模型、AI 报告生成、PDF 导出、认证或权限。

## 10. 当前尚未实现

- 尚无认证体系。
- 尚无用户管理。
- 尚无医生端或患者端业务。
- 尚无公开患者、访视、量表实例、题目作答或量表业务接口、评估、报告生成 / 查询 / 医生确认 / 归档 / 更正 / 作废或诊断建议业务。
- 尚无公开媒体上传、媒体查询、媒体下载、媒体删除或签名 URL 业务接口。
- 尚无数据库 seed runner、seed 写库或公开 MMSE / MoCA 配置查询接口。
- 尚无公开计分触发、计分查询、计分复核或报告接口。
- 尚无公开认知域计算触发、认知域查询、认知域复核或报告接口。
- 尚无公开报告 API、真实报告生成任务流、医生确认写库流程、报告锁定写库流程、报告归档 / 更正 / 作废接口、PDF / Word / 打印导出、AuditLog 模型或认证权限。
- 尚无作答提交后自动计分触发、作答提交后自动认知域计算触发、真实计分任务流、真实认知域计算任务流、MMSE / MoCA 专用计分规则或 MMSE / MoCA 专用认知域规则。
- 尚无短信发送接口。
- 尚无 AI / LLM 调用接口。
- 尚无业务 Controller 或公开业务 API。
- 当前 E2E 未执行。
- 已完成本次 `scales` 定向 lint、后端 build 与全量单元测试；全量 lint 当前未执行。

## 11. 后续同步规则

- 后续新增模块、接口、DTO、数据模型、Service 或测试命令后，应同步更新对应 handoff 文档。
- 本文档只记录已确认事实，不承载未确认推测。
