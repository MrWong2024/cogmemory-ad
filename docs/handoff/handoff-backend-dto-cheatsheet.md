# CogMemory AD / 智忆评 后端 DTO 与响应速查

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 DTO、请求参数、响应结构和校验摘要，方便后续开发、测试和交接快速查阅。

## 2. 当前状态

- 当前存在公共底座 DTO、响应 type、Storage interface，以及各业务模块内部 Service 读取输出 type；A12 已新增患者 / 访视 DTO，A13 已新增量表目录、访视执行详情和量表实例初始化 DTO / 安全响应 type，A14 已新增单实例执行详情、单题草稿 PATCH DTO 与安全执行响应 type，A15 已新增媒体证据路径、multipart body、访问 query、作废 body 和安全公开响应 type。
- 当前新增公开认证请求 DTO：`LoginDto`。
- 当前新增公开患者 / 访视 DTO：`CreatePatientDto`、`ListPatientsQueryDto`、`PatientIdParamDto`、`CreateAssessmentVisitDto`、`ListAssessmentVisitsQueryDto`、`PatientVisitsParamDto`。
- 当前仍没有用户管理、注册、密码重置、整份量表最终提交、批量 / 分片 / 客户端直传、计分、认知域或报告请求 DTO；媒体仅定义 A15 四个题目级接口契约。

## 3. 当前 DTO / Type 清单

- 名称：`AppHealthResponse`
- 文件：`backend\src\app.service.ts`
- 用途：`GET /health` 响应 type。
- 字段：`status: 'ok'`，`service: 'cogmemory-ad-backend'`。

- 名称：`LoginDto`
- 文件：`backend\src\modules\auth\dto\login.dto.ts`
- 用途：`POST /auth/login` 请求 DTO。
- 字段：`accountName: string`、`password: string`。
- 校验：两者均为 string、非空；`accountName` 最长 120，`password` 最长 256。

- 名称：`AuthUserResponse`
- 文件：`backend\src\modules\auth\types\auth-response.types.ts`
- 用途：公开认证响应中的用户公开信息 type。
- 字段：`id`、`accountName`、`displayName`、`roles`、`permissions`、`userType`。
- 安全口径：不包含 `passwordHash`、raw session token、session token hash、`sessionId`、secret 或 credential。

- 名称：`LoginResponse`
- 文件：`backend\src\modules\auth\types\auth-response.types.ts`
- 用途：`POST /auth/login` 成功响应 type。
- 字段：`authenticated: true`、`user: AuthUserResponse`。

- 名称：`MeResponse`
- 文件：`backend\src\modules\auth\types\auth-response.types.ts`
- 用途：`GET /auth/me` 成功响应 type。
- 字段：`authenticated: true`、`user: AuthUserResponse`。

- 名称：`LogoutResponse`
- 文件：`backend\src\modules\auth\types\auth-response.types.ts`
- 用途：`POST /auth/logout` 稳定成功响应 type。
- 字段：`authenticated: false`、`ok: true`。

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

- 名称：`CreatePatientDto`
- 文件：`backend\src\modules\patients\dto\create-patient.dto.ts`
- 用途：`POST /patients` 请求 DTO。
- 允许字段：必填 `subjectCode`；可选 `displayName`、`sourceType`、`sex`、`birthDate`、`educationYears`、`handedness`、`tags`、`notes`。
- 校验摘要：subjectCode trim、非空、最大 80；displayName 最大 120；birthDate 转为 Date；educationYears 为 0-40 整数；tags 最多 20 项、单项 trim 且最大 50、移除空字符串；notes 最大 2000。
- 白名单边界：不声明 status、externalRefs、metadata、operator 或 timestamps，非白名单字段由全局 ValidationPipe 拒绝。

- 名称：`ListPatientsQueryDto`
- 文件：`backend\src\modules\patients\dto\list-patients-query.dto.ts`
- 用途：`GET /patients` query DTO。
- 字段：`page` 默认 1；`pageSize` 默认 20、最大 100；可选 `keyword`、`status`、`sourceType`。
- 校验摘要：keyword trim、最大 100；status 仅 active / inactive / archived；sourceType 仅 clinical / research。

- 名称：`PatientIdParamDto`
- 文件：`backend\src\modules\patients\dto\patient-id-param.dto.ts`
- 用途：`GET /patients/:patientId` path DTO。
- 字段与校验：`patientId: string`，使用 `@IsMongoId()`。

- 名称：`PatientListItemResponse`、`PatientDetailResponse`、`PatientListResponse`
- 文件：`backend\src\modules\patients\types\patient-response.types.ts`
- 用途：患者公开响应 type。
- 字段摘要：列表项包含 id、subjectCode、displayName、sourceType、sex、birthDate、educationYears、handedness、status、tags；详情额外包含 notes；分页响应包含 items、page、pageSize、total。
- 安全边界：不包含 externalRefs、metadata、`__v` 或 Mongoose document 方法。

- 名称：`CreateAssessmentVisitDto`
- 文件：`backend\src\modules\assessments\dto\create-assessment-visit.dto.ts`
- 用途：`POST /patients/:patientId/visits` 请求 DTO。
- 允许字段：必填 `visitCode`、`assessmentDate`；可选 `visitType`、`notes`。
- 校验摘要：visitCode trim、非空、最大 80；visitType 仅 baseline / follow_up / screening / unscheduled / other；assessmentDate 转为 Date；notes trim、最大 2000。
- 白名单边界：不声明 patientId、subjectCode、status、operatorSnapshot、状态时间、clinicalContext、metadata 或 timestamps。

- 名称：`ListAssessmentVisitsQueryDto`
- 文件：`backend\src\modules\assessments\dto\list-assessment-visits-query.dto.ts`
- 用途：`GET /patients/:patientId/visits` query DTO。
- 字段：`page` 默认 1；`pageSize` 默认 20、最大 100；可选 `status`、`visitType`、`dateFrom`、`dateTo`。
- 校验摘要：status / visitType 使用既有 Schema 枚举口径；dateFrom / dateTo 转为 Date；日期先后关系由 Service 形成 `INVALID_DATE_RANGE` 业务语义。

- 名称：`PatientVisitsParamDto`
- 文件：`backend\src\modules\assessments\dto\patient-visits-param.dto.ts`
- 用途：两个患者访视接口的 path DTO。
- 字段与校验：`patientId: string`，使用 `@IsMongoId()`。

- 名称：`PatientVisitParamDto`
- 文件：`backend\src\modules\assessments\dto\patient-visit-param.dto.ts`
- 用途：`GET /patients/:patientId/visits/:visitId` 与 `POST /patients/:patientId/visits/:visitId/scale-instances` path DTO。
- 字段与校验：`patientId: string`、`visitId: string`，均使用 `@IsMongoId()`。

- 名称：`InitializeScaleInstanceDto`
- 文件：`backend\src\modules\assessments\dto\initialize-scale-instance.dto.ts`
- 用途：A13 量表实例初始化请求 DTO。
- 允许字段：必填 `scaleCode`；可选 `scaleVersion`、`administrationMode`。
- 校验摘要：scaleCode trim + lowercase、非空、最长 50；scaleVersion trim、非空、最长 40；administrationMode 仅 `clinician_administered`、`supervised_patient_input`、`paper_import`，默认 `clinician_administered`。
- 白名单边界：不声明 patientId、visitId、subjectCode、definition / version ID、instanceCode、instanceNo、status、operatorSnapshot、状态时间、progress、qualityControlSummary、metadata、itemResponses、score、report 或 timestamps；这些字段由全局 ValidationPipe 拒绝。

- 名称：`AssessmentVisitListItemResponse`、`AssessmentVisitDetailResponse`、`AssessmentVisitListResponse`
- 文件：`backend\src\modules\assessments\types\assessment-visit-response.types.ts`
- 用途：访视公开响应 type。
- 字段摘要：id、patientId、subjectCode、visitCode、visitType、status、assessmentDate、状态时间、operatorSnapshot、notes；分页响应包含 items、page、pageSize、total。
- 安全边界：不包含 clinicalContext、metadata、`__v` 或 Mongoose document 方法。

- 名称：`ScaleScoreRangeResponse`、`ScaleCapabilityResponse`、`AvailableScaleOptionResponse`、`AvailableScaleListResponse`
- 文件：`backend\src\modules\scales\types\scale-catalog-response.types.ts`
- 用途：`GET /scales/available` 公开安全目录响应。
- 字段摘要：量表 code / name / shortName / description / category、版本追溯、totalScoreRange、groupCount、itemCount，以及 photo / handwriting / timer / raw text / operator note 能力布尔值。
- 安全边界：不包含完整 groups / items、prompt / instruction、scoringRule、正确答案 / expectedValue、ObjectId、Mixed 原始字段、metadata 或 Mongoose document。

- 名称：`MaterializedScaleVersionReference`
- 文件：`backend\src\modules\scales\types\scale-catalog-response.types.ts`
- 用途：`ScaleCatalogService` 向内部初始化工作流返回已解析 definition / version ID 和安全 option；仅内部使用，不是 HTTP 响应 type。

- 名称：`ScaleInstanceVersionTraceResponse`、`ScaleInstanceOperatorResponse`、`ScaleInstanceProgressResponse`、`ScaleInstanceListItemResponse`
- 文件：`backend\src\modules\assessments\types\assessment-execution-response.types.ts`
- 用途：访视详情与初始化响应中的安全 ScaleInstance 摘要。
- 字段摘要：公开运行时标识、subject / scale / instance 快照、状态、施测模式、限定版本追溯、状态时间、durationMs、限定操作者快照，以及 totalItemCount / answeredItemCount。
- 安全边界：不包含 scaleDefinitionId、scaleVersionId、metadata、qualityControlSummary、notes、任意完整 Mixed 对象或 ItemResponse 全量数据；非法 progress 值映射为 0。

- 名称：`AssessmentVisitExecutionDetailResponse`
- 文件：`backend\src\modules\assessments\types\assessment-execution-response.types.ts`
- 用途：A13 访视执行详情响应。
- 字段：`visit: AssessmentVisitDetailResponse`、`scaleInstances: ScaleInstanceListItemResponse[]`。

- 名称：`InitializeScaleInstanceResponse`
- 文件：`backend\src\modules\assessments\types\assessment-execution-response.types.ts`
- 用途：A13 初始化成功响应。
- 字段：安全 `scale` 摘要、安全 `scaleInstance` 摘要、`createdItemResponseCount`；不包含 ItemResponse 全量骨架。

- 名称：`ScaleInstanceExecutionParamDto`
- 文件：`backend\src\modules\assessments\dto\scale-instance-execution-param.dto.ts`
- 用途：A14 单实例执行详情 path DTO。
- 字段与校验：`patientId`、`visitId`、`scaleInstanceId` 均使用 `@IsMongoId()`。

- 名称：`ItemResponseDraftParamDto`
- 文件：`backend\src\modules\assessments\dto\item-response-draft-param.dto.ts`
- 用途：A14 单题草稿 PATCH path DTO。
- 字段与校验：`patientId`、`visitId`、`scaleInstanceId`、`itemResponseId` 均使用 `@IsMongoId()`。

- 名称：`UpdateItemResponseDraftDto`
- 文件：`backend\src\modules\assessments\dto\update-item-response-draft.dto.ts`
- 用途：A14 单题草稿 PATCH body DTO。
- 允许字段：rawResponse、structuredResponse、responseText（nullable，最大 10000）、isMissing、missingReason（nullable，最大 1000）、stepResponses、promptResponses、timing（nullable）、operatorNote（nullable，最大 4000）、markAsAnswered。
- 白名单边界：不声明 item 身份 / 配置 / 版本、status、answerSource、score / 正确性、evidence、metadata、锁定 / 作废、所有权 ID 或 timestamps；非白名单字段由全局 ValidationPipe 拒绝。

- 名称：`UpdateItemStepDraftDto`
- 文件：`backend\src\modules\assessments\dto\update-item-response-draft.dto.ts`
- 字段：必填 stepCode（trim + lowercase、最大 200），可选 actualValue 与 note（nullable、最大 2000）；不允许 expectedValue、isCorrect、scoreValue 或 countsTowardItemScore。

- 名称：`UpdatePromptResponseDraftDto`
- 文件：`backend\src\modules\assessments\dto\update-item-response-draft.dto.ts`
- 字段：必填现有 PROMPT_RESPONSE_TYPES 中的 promptType、正整数 order；可选 responseAfterPrompt 与 note（nullable、最大 2000）；不允许 promptText、isCorrect 或 countsTowardScore。

- 名称：`UpdateItemTimingDraftDto`
- 文件：`backend\src\modules\assessments\dto\update-item-response-draft.dto.ts`
- 字段：nullable ISO startedAt / completedAt、nullable 非负整数 durationMs、timerSource（system / manual / imported / none）；跨字段先后关系由 Service 校验。

- 名称：`ItemResponseDraftJsonValue`
- 文件：`backend\src\modules\assessments\types\item-response-execution-response.types.ts`
- 类型：null、string、finite number、boolean、递归数组或普通对象；模块内纯函数限制最大深度 5、数组 100 项、对象 100 keys、字符串 4000、raw / structured 序列化 32768 字节，并拒绝危险 key 和非 JSON 值。

- 名称：`ScaleExecutionIdentityResponse`、`ScaleExecutionGroupResponse`、`ItemExecutionConfigResponse`、`ItemResponseExecutionResponse`
- 文件：`backend\src\modules\assessments\types\item-response-execution-response.types.ts`
- 用途：A14 执行详情与 PATCH 成功响应的安全公开结构。
- 字段摘要：安全量表身份与分组；题目身份、作答类型、计分参与 / 认知域、显式 config、版本追溯、草稿值、step / prompt 槽位、timing、证据要求和 operatorNote。
- 安全边界：不包含完整 Mixed 配置、scoringRule、expectedValue、正确答案、score / isCorrect / scoreValue、metadata、qualityControlHints、内部 ObjectId 或 Mongoose document。

- 名称：`ScaleInstanceExecutionDetailResponse`、`UpdateItemResponseDraftResponse`
- 文件：`backend\src\modules\assessments\types\item-response-execution-response.types.ts`
- 字段：详情为 `{ visit, scale, scaleInstance, groups, itemResponses }`；PATCH 为 `{ itemResponse, progress }`。progress 使用 `ScaleInstanceProgressResponse`，由实际 ItemResponse 状态派生。

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

- 名称：`UserMetadata`
- 文件：`backend\src\modules\users\schemas\user.schema.ts`
- 用途：`User` Schema 的内部扩展 metadata type，不是 HTTP DTO。
- 字段摘要：`Record<string, unknown> | null`。

- 名称：`MediaEvidenceItemParamDto`、`MediaEvidenceParamDto`
- 文件：`backend\src\modules\media\dto\media-evidence-item-param.dto.ts`、`media-evidence-param.dto.ts`
- 用途：A15 题目级列表 / 上传路径，以及带单证据 ID 的访问 / 作废路径。
- 字段：patientId、visitId、scaleInstanceId、itemResponseId；单证据 DTO 额外 mediaEvidenceId；全部使用 `@IsMongoId()`。

- 名称：`UploadMediaEvidenceDto`
- 文件：`backend\src\modules\media\dto\upload-media-evidence.dto.ts`
- 用途：A15 multipart 上传文本字段 DTO。
- 必填：evidenceType 仅 photo / handwriting；captureMode 仅 photo_upload / paper_scan / tablet_handwriting，业务矩阵由 Workflow 再校验。
- 可选采集字段：capturedAt、sourceDevice / sourceApp、captureNote、description、operatorNote；图片字段 imageWidth / imageHeight、orientation、pageNo、isColor；手写字段 trajectoryFormat(json / strokes)、strokeCount、trajectoryDurationMs、canvasWidth / canvasHeight、deviceType、inputTool。
- 转换与限制：空字符串转 undefined；数字字符串显式转有限 number，再校验整数 / 范围；boolean 只把字符串 true / false 转换为布尔值，不把 false 误转 true。全局 whitelist + forbidNonWhitelisted 拒绝关联 ID、业务编码、状态、storage、checksum、operatorSnapshot、itemSnapshot、versionTrace、quality / metadata 和审计时间等服务器字段。

- 名称：`MediaEvidenceAccessQueryDto`
- 文件：`backend\src\modules\media\dto\media-evidence-access-query.dto.ts`
- 用途：临时访问地址 query；asset 仅 primary / trajectory，默认 primary；不声明 expiresInSeconds。

- 名称：`VoidMediaEvidenceDto`
- 文件：`backend\src\modules\media\dto\void-media-evidence.dto.ts`
- 用途：A15 作废 body；仅允许 reason，trim 后必填且 3-1000 字符。

- 名称：`UploadedMemoryFile`、`MediaEvidenceUploadedFiles`
- 文件：`backend\src\modules\media\types\uploaded-memory-file.types.ts`
- 用途：不依赖缺失 `@types/multer` 的内存文件安全 type；单文件仅包含 fieldname、originalname、encoding、mimetype、size、buffer，文件集合仅有 file / trajectory。

- 名称：A15 媒体公开响应类型
- 文件：`backend\src\modules\media\types\media-evidence-response.types.ts`
- 类型：`MediaEvidenceFileResponse`、`MediaEvidenceImageMetadataResponse`、`MediaEvidenceHandwritingTraceResponse`、`MediaEvidenceCaptureContextResponse`、`MediaEvidenceOperatorResponse`、`MediaEvidenceResponse`、`MediaEvidenceListResponse`、`EvidenceRequirementStateResponse`、`UploadMediaEvidenceResponse`、`MediaEvidenceAccessUrlResponse`、`VoidMediaEvidenceResponse`。
- 安全边界：公开文件摘要只含 MIME、扩展名、大小、storedAt；手写摘要不含 trajectoryObjectKey；证据响应不含关联 ID、subjectCode、definition / version ID、itemSnapshot、versionTrace、qualityHints、metadata、objectKey、bucket、objectPrefix、originalFilename、checksum、publicUrl 或 deletedAt。

- 名称：`UserSummary`
- 文件：`backend\src\modules\users\services\users.service.ts`
- 用途：`UsersService` 内部读取系统账号时返回的安全 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：账号 ID、accountName、displayName、staffCode、email、phone、passwordChangedAt、roles、permissions、userType、status、department、organization、lastLoginAt、failedLoginCount、lockedUntil 和 metadata；不包含 `passwordHash`。

- 名称：`UserCredentialRecord`
- 文件：`backend\src\modules\users\services\users.service.ts`
- 用途：`UsersService.findUserCredentialByAccountName()` 返回给内部认证流程的最小凭证读取 type，不是 HTTP DTO，不得作为普通响应输出。
- 字段摘要：账号 ID、accountName、displayName、`passwordHash`、passwordChangedAt、roles、permissions、userType、status、failedLoginCount 和 lockedUntil。

- 名称：`SessionMetadata`
- 文件：`backend\src\modules\auth\schemas\session.schema.ts`
- 用途：`Session` Schema 的内部扩展 metadata type，不是 HTTP DTO。
- 字段摘要：`Record<string, unknown> | null`。

- 名称：`AuthenticatedUserContext`
- 文件：`backend\src\modules\auth\types\auth-user-context.type.ts`
- 用途：后续 Guard 或 Controller 挂载 `req.user` 的内部认证上下文 type，不是公开 API DTO。
- 字段摘要：`id`、`accountName`、`displayName`、`roles`、`permissions`、可选 `sessionId` 和可选 `userType`；不包含 passwordHash、session token 或 token hash。

- 名称：`RequestWithAuthenticatedUser`
- 文件：`backend\src\modules\auth\types\auth-user-context.type.ts`
- 用途：`SessionAuthGuard`、`RolesGuard` 和 `@CurrentUser()` 内部读取 / 挂载 `req.user` 的最小 request type。
- 字段摘要：`headers`、可选 `cookies`、可选 `user`。

- 名称：`CookieLikeRequest`
- 文件：`backend\src\modules\auth\utils\session-cookie.util.ts`
- 用途：`SessionAuthGuard` 与 `AuthController` 复用的轻量 Cookie request type，支持 cookie-parser cookies 和原始 `cookie` header。
- 字段摘要：可选 `cookies`、可选 `headers.cookie`、可选 `headers['user-agent']`、可选 `ip` 和 `socket.remoteAddress`。

- 名称：`CreateSessionForUserInput`
- 文件：`backend\src\modules\auth\services\auth.service.ts`
- 用途：`AuthService.createSessionForUser()` 的内部输入 type，不是公开 API DTO。
- 字段摘要：`userId`、可选 `expiresAt`、可选 `userAgent`、`ipAddress` 和 `metadata`；未显式传入 `expiresAt` 时使用 `DEFAULT_SESSION_TTL_MS`。

- 名称：`CreateSessionForUserResult`
- 文件：`backend\src\modules\auth\services\auth.service.ts`
- 用途：`AuthService.createSessionForUser()` 的内部返回 type；包含 raw token 仅供后续内部登录流程下发 Cookie 时使用，不得作为普通 mapper 输出。
- 字段摘要：`sessionId`、`rawToken`、`expiresAt` 和 `user: AuthenticatedUserContext`；不包含 token hash。

- 名称：`AuthenticateWithPasswordInput`
- 文件：`backend\src\modules\auth\services\auth.service.ts`
- 用途：`AuthService.authenticateWithPassword()` 的内部输入 type，由 `AuthController.login()` 调用；不是公开 API DTO。
- 字段摘要：`accountName`、`password`、可选 `userAgent`、`ipAddress`。

- 名称：`AuthenticateWithPasswordResult`
- 文件：`backend\src\modules\auth\services\auth.service.ts`
- 用途：`AuthService.authenticateWithPassword()` 的内部返回 type；raw session token 仅供 Controller 写入 HttpOnly Cookie。
- 字段摘要：`user: AuthenticatedUserContext`、`rawSessionToken`、`expiresAt`；不包含 token hash。

## 4. 后续同步规则

- DTO 事实以实际 DTO 文件、校验装饰器、Controller 使用方式和测试为准。
- 不得在业务文档未确认前编造字段、枚举、状态或响应结构。
- DTO 变更影响前端时，应同步更新前端 API 对接文档。
