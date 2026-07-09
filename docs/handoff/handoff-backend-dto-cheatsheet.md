# CogMemory AD / 智忆评 后端 DTO 与响应速查

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 DTO、请求参数、响应结构和校验摘要，方便后续开发、测试和交接快速查阅。

## 2. 当前状态

- 当前存在公共底座 DTO、响应 type、Storage interface，以及 `scales`、`patients`、`assessments`、`media`、`scoring` 内部 Service 读取输出 type。
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

## 4. 后续同步规则

- DTO 事实以实际 DTO 文件、校验装饰器、Controller 使用方式和测试为准。
- 不得在业务文档未确认前编造字段、枚举、状态或响应结构。
- DTO 变更影响前端时，应同步更新前端 API 对接文档。
