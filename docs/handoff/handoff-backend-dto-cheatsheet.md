# CogMemory AD / 智忆评 后端 DTO 与响应速查

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 DTO、请求参数、响应结构和校验摘要，方便后续开发、测试和交接快速查阅。

## 2. 当前状态

- 当前存在公共底座 DTO、响应 type、Storage interface，以及 `scales`、`patients`、`assessments`、`media`、`scoring`、`cognitive-domains`、`reports` 内部 Service 读取输出 type；`scales` 当前还包含 MMSE / MoCA 初始配置 seed 内部 type，`assessments` 当前还包含评估执行初始化内部编排 type。
- 当前不记录任何业务请求 DTO。
- 当前没有认证、用户、医生、患者、量表、评估、媒体、报告或业务上传请求 DTO。

## 3. 当前 DTO / Type 清单

- 名称：`AppHealthResponse`
- 文件：`backend\src\app.service.ts`
- 用途：`GET /health` 响应 type。
- 字段：`status: 'ok'`，`service: 'cogmemory-ad-backend'`。

- 名称：`PaginationQueryDto`
- 文件：`backend\src\common\dto\pagination-query.dto.ts`
- 用途：公共分页 query DTO。
- 字段：`page` 默认 `1`，`pageSize` 默认 `100`。
- 校验：`page` 为不小于 `1` 的整数；`pageSize` 为 `1` 到 `1000` 的整数。

- 名称：`ListFilterQueryDto`
- 文件：`backend\src\common\dto\pagination-query.dto.ts`
- 用途：公共列表过滤 query DTO。
- 字段：`keyword?: string`，`isActive?: boolean`。

- 名称：`PaginatedResponse<T>`
- 文件：`backend\src\common\dto\pagination-query.dto.ts`
- 用途：公共分页响应 type。
- 字段：`items`、`page`、`pageSize`、`total`。

- 名称：`StorageService` 及相关输入输出 type
- 文件：`backend\src\modules\storage\storage.interface.ts`
- 用途：Storage 公共底层接口。
- 相关 type：`UploadFileInput`、`UploadedFileResult`、`SignedUrlOptions`、`SignedUrlResult`。

- 名称：`ScaleDefinitionSummary`
- 文件：`backend\src\modules\scales\services\scales.service.ts`
- 用途：`ScalesService` 内部读取量表定义时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：`id`、`code`、`name`、`shortName`、`description`、`category`、`status`、`currentVersionId`、`sortOrder`、`tags`。

- 名称：`ScaleVersionSummary`
- 文件：`backend\src\modules\scales\services\scales.service.ts`
- 用途：`ScalesService` 内部读取量表版本配置时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：量表引用、量表 code、版本追溯字段、状态、总分范围、分组配置、题目配置、质控规则、报告规则、科研导出映射、生效时间和退役时间。

- 名称：`ScaleScoreRangeSummary`、`ScaleGroupConfigSummary`、`ScaleItemConfigSummary`
- 文件：`backend\src\modules\scales\services\scales.service.ts`
- 用途：`ScaleVersionSummary` 的内部配置输出 type，承载题目分组、题目配置、作答类型、得分范围、证据要求和展示 / 导出规则。

- 名称：`ScaleSeedDefinition`、`ScaleSeedVersion`、`ScaleSeedGroup`、`ScaleSeedItem`、`ScaleSeedData`
- 文件：`backend\src\modules\scales\seeds\scale-seed.types.ts`
- 用途：MMSE / MoCA 初始配置 seed 的内部静态配置 type，不是 HTTP DTO，不定义前端调用契约，不代表数据库写入结构。
- 字段摘要：量表 definition、版本追溯、总分范围、分组、题目、指导语摘要、作答类型、得分范围、证据要求、计时 / 图片 / 手写 / 原始文本 / 操作者备注、规则元数据、认知域映射、质控 / 报告 / 科研导出映射。

- 名称：`ScaleSeedValidationResult`、`ScaleSeedValidationIssue`
- 文件：`backend\src\modules\scales\seeds\scale-seed.types.ts`
- 用途：`validateScaleSeeds()` 种子数据校验纯函数的内部输出 type，不是 HTTP DTO。
- 字段摘要：`valid`、`errors`、`warnings`、`issues`；用于表达量表 code / 版本 / item / group / scoreRange / CRF 修正 / 证据一致性等校验结果。

- 名称：`PatientSummary`
- 文件：`backend\src\modules\patients\services\patients.service.ts`
- 用途：`PatientsService` 内部读取患者 / 受试者基础档案时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：`id`、`subjectCode`、`displayName`、`sourceType`、`sex`、`birthDate`、`educationYears`、`handedness`、`status`、`tags`、`notes`、`externalRefs`、`metadata`。

- 名称：`AssessmentVisitSummary`
- 文件：`backend\src\modules\assessments\services\assessments.service.ts`
- 用途：`AssessmentsService` 内部读取访视时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：访视引用输出、患者引用、受试者编码快照、访视编码、访视类型、状态、评估日期、开始 / 完成 / 锁定 / 作废时间、操作者快照、临床上下文、备注和 metadata。

- 名称：`ScaleInstanceSummary`
- 文件：`backend\src\modules\assessments\services\assessments.service.ts`
- 用途：`AssessmentsService` 内部读取量表实例时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：访视引用、患者引用、量表定义引用、量表版本引用、量表 code、量表版本、实例编码、实例序号、状态、施测模式、版本追溯快照、时间字段、用时、操作者快照、进度摘要占位、质控摘要占位、备注和 metadata。

- 名称：`AssessmentOperatorSnapshotSummary`、`ScaleVersionTraceSummary`
- 文件：`backend\src\modules\assessments\services\assessments.service.ts`
- 用途：`AssessmentVisitSummary` / `ScaleInstanceSummary` 的内部嵌套输出 type，承载操作者快照和量表版本追溯快照。

- 名称：`ItemResponseSummary`
- 文件：`backend\src\modules\assessments\services\assessments.service.ts`
- 用途：`AssessmentsService` 内部读取题目作答记录时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：运行时引用、量表版本追溯、题目标识与快照、作答状态、原始作答、结构化作答、单题得分、分步结果、提示后表现、计时、证据引用占位、操作者备注、质控占位和 metadata。

- 名称：`ItemResponseVersionTraceSummary`、`ItemScoreSummary`、`ItemStepResultSummary`、`PromptResponseRecordSummary`、`ItemResponseTimingSummary`、`ItemEvidenceRefSummary`
- 文件：`backend\src\modules\assessments\services\assessments.service.ts`
- 用途：`ItemResponseSummary` 的内部嵌套输出 type，承载版本追溯、单题得分、分步记录、提示后表现、计时与证据引用占位。

- 名称：`BuildScaleExecutionPlanInput`
- 文件：`backend\src\modules\assessments\types\assessment-execution.types.ts`
- 用途：`AssessmentExecutionService.buildScaleExecutionPlan()` / `createScaleExecutionFromSeed()` 的内部输入 type，不是 HTTP DTO。
- 字段摘要：患者 ID、访视 ID、受试者编码、量表定义 ID、量表版本 ID、量表 code / version、实例编码、实例序号、施测模式、操作者快照、开始时间和 metadata。

- 名称：`ScaleExecutionPlan`、`ScaleInstanceDraft`、`ItemResponseDraft`、`ScaleExecutionSeedSummary`
- 文件：`backend\src\modules\assessments\types\assessment-execution.types.ts`
- 用途：评估执行初始化内部计划和写库草稿 type，不是公开 API DTO。
- 字段摘要：`ScaleInstance` 初始草稿、与 seed items 对齐的初始 `ItemResponse` 草稿、seed 摘要和 seed 校验结果；`ItemResponseDraft` 包含题目快照、版本追溯、score 初始占位、stepResults、promptResponses、timing 与 evidenceRefs 占位。

- 名称：`ScaleExecutionCreationResult`、`CreatedScaleInstanceSummary`、`CreatedItemResponseSummary`
- 文件：`backend\src\modules\assessments\types\assessment-execution.types.ts`
- 用途：`AssessmentExecutionService.createScaleExecutionFromPlan()` / `createScaleExecutionFromSeed()` 的内部 mapper 输出 type，不直接暴露 Mongoose document，不是 HTTP DTO。
- 字段摘要：创建后的量表实例摘要、初始题目作答摘要、创建的题目作答数量、量表 code / version 与实例编码。

- 名称：`MediaEvidenceSummary`
- 文件：`backend\src\modules\media\services\media-evidence.service.ts`
- 用途：`MediaEvidenceService` 内部读取媒体证据元数据时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：运行时证据链引用、量表版本追溯、题目标识与快照、证据编码、证据类型、采集方式、存储状态、媒体存储对象元数据、图片元数据、手写轨迹元数据、采集上下文、操作者快照、质量状态、锁定 / 作废 / 删除时间、备注和 metadata。

- 名称：`MediaEvidenceVersionTraceSummary`、`MediaStorageSummary`、`MediaImageMetadataSummary`、`HandwritingTraceSummary`、`MediaCaptureContextSummary`、`MediaOperatorSnapshotSummary`
- 文件：`backend\src\modules\media\services\media-evidence.service.ts`
- 用途：`MediaEvidenceSummary` 的内部嵌套输出 type，承载版本追溯、存储对象、图片、手写轨迹、采集上下文和操作者快照摘要。

- 名称：`ScoreResultSummary`
- 文件：`backend\src\modules\scoring\services\scoring.service.ts`
- 用途：`ScoringService` 内部读取计分结果快照时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：运行时引用、受试者与量表快照、计分结果编码、运行次数、计分状态 / 来源 / 模式、版本追溯、总分、单题得分快照、分项 / 分组得分、计算过程摘要、人工复核、质量状态、质量提示、备注、metadata、确认 / 锁定 / 作废时间。

- 名称：`ScoreVersionTraceSummary`、`TotalScoreSummary`、`ScoreItemSummary`、`ScoreGroupSummary`、`ScoringComputationSnapshotSummary`、`ScoreReviewSummary`
- 文件：`backend\src\modules\scoring\services\scoring.service.ts`
- 用途：`ScoreResultSummary` 的内部嵌套输出 type，承载版本追溯、总分、单题得分、分组得分、计算过程与人工复核摘要。

- 名称：`ScoringItemInput`、`ScoringComputationSummary`、`ScoringComputationWarning`
- 文件：`backend\src\modules\scoring\services\scoring.service.ts`
- 用途：`summarizeItemScores()` 通用计分汇总纯函数的输入 / 输出 type，不是 HTTP DTO；只描述基于单题得分快照的内存汇总结构。

- 名称：`CognitiveDomainResultSummary`
- 文件：`backend\src\modules\cognitive-domains\services\cognitive-domains.service.ts`
- 用途：`CognitiveDomainsService` 内部读取认知域结果快照时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：运行时引用、受试者与量表快照、认知域结果编码、运行次数、计算状态 / 映射来源 / 映射模式、版本追溯、认知域得分快照、题目贡献快照、映射快照、计算过程摘要、人工复核、质量状态、质量提示、备注、metadata、确认 / 锁定 / 作废时间。

- 名称：`CognitiveDomainVersionTraceSummary`、`CognitiveDomainScoreSummary`、`CognitiveDomainItemContributionSummary`、`CognitiveDomainMappingSnapshotSummary`、`CognitiveDomainComputationSnapshotSummary`、`CognitiveDomainReviewSummary`
- 文件：`backend\src\modules\cognitive-domains\services\cognitive-domains.service.ts`
- 用途：`CognitiveDomainResultSummary` 的内部嵌套输出 type，承载版本追溯、认知域得分、题目贡献、映射快照、计算过程与人工复核摘要。

- 名称：`CognitiveDomainItemInput`、`CognitiveDomainMappingInput`、`CognitiveDomainComputationSummary`、`CognitiveDomainComputationWarning`
- 文件：`backend\src\modules\cognitive-domains\services\cognitive-domains.service.ts`
- 用途：`summarizeDomainScores()` 通用认知域汇总纯函数的输入 / 输出 type，不是 HTTP DTO；只描述基于单题得分快照和认知域映射快照的内存汇总结构。

- 名称：`ClinicalReportSummary`
- 文件：`backend\src\modules\reports\services\reports.service.ts`
- 用途：`ReportsService` 内部读取临床报告摘要时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：运行时引用、报告编码 / 编号 / 类型 / 状态 / 版本 / 来源、患者快照、访视快照、量表追溯、计分结果快照、认知域结果快照、媒体证据摘要、报告正文占位、AI 草稿占位、医生确认、锁定、归档、更正、作废、审计引用占位、质控状态、质控提示、备注和 metadata。

- 名称：`ReportPatientSnapshotSummary`、`ReportVisitSnapshotSummary`、`ReportScaleTraceSummary`、`ReportScoreSnapshotSummary`、`ReportDomainSnapshotSummary`、`ReportEvidenceSnapshotSummary`、`ReportNarrativeSummary`、`ReportAiDraftSummary`、`ReportConfirmationSummary`、`ReportCorrectionSummary`
- 文件：`backend\src\modules\reports\services\reports.service.ts`
- 用途：`ClinicalReportSummary` 的内部嵌套输出 type，承载患者 / 访视快照、量表版本追溯、计分与认知域快照、证据摘要、报告正文占位、AI 草稿占位、医生确认和更正记录摘要。

## 4. 后续同步规则

- DTO 事实以实际 DTO 文件、校验装饰器、Controller 使用方式和测试为准。
- 不得在业务文档未确认前编造字段、枚举、状态或响应结构。
- DTO 变更影响前端时，应同步更新前端 API 对接文档。
