# CogMemory AD / 智忆评 后端 Service 职责地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 Service 职责边界、调用关系、事务要求和测试覆盖口径。

## 2. 当前状态

- 当前存在公共底座 Service / Provider 与 A12-A22 业务能力；A21 在 A20 生成边界外提供独立 Review Workflow，A22 再提供独立 Lock Workflow、纯 lock 函数和单文档原子写。
- 当前没有独立医生、SMS 或 LLM Service；A21 不调用来源计分 / 认知域 / 媒体 Service、Storage、PDF 或 AI 能力。

## 3. 当前 Service / Provider 清单

- Service 名称：`AppService`
- 文件路径：`backend\src\app.service.ts`
- 职责边界：返回 health 响应 `{ status: 'ok', service: 'cogmemory-ad-backend' }`。
- 上游调用方：`AppController.getHealth()`。
- 下游依赖：无。
- 测试覆盖口径：`backend\src\app.controller.spec.ts`。

- Provider 名称：`AllExceptionsFilter`
- 文件路径：`backend\src\common\filters\all-exceptions.filter.ts`
- 职责边界：统一 HTTP 异常与未知异常响应结构。
- 上游调用方：`configureApp()` 全局注册。
- 下游依赖：`HttpAdapterHost`。
- 测试覆盖口径：当前未单独添加 filter spec。

- Service 名称：`StorageConfigService`
- 文件路径：`backend\src\modules\storage\storage-config.service.ts`
- 职责边界：读取 Storage driver 与 OSS 配置，缺少 OSS 必需配置时抛出明确异常。
- 上游调用方：`StorageModule`、`FakeStorageService`、`OssStorageService`。
- 下游依赖：环境变量。
- 测试覆盖口径：`backend\src\modules\storage\storage.service.spec.ts`。

- Service 名称：`FakeStorageService`
- 文件路径：`backend\src\modules\storage\fake-storage.service.ts`
- 职责边界：提供不依赖真实 OSS 的 fake driver。
- 上游调用方：`STORAGE_SERVICE` token。
- 下游依赖：`StorageConfigService`。
- 测试覆盖口径：`backend\src\modules\storage\storage.service.spec.ts`。

- Service 名称：`OssStorageService`
- 文件路径：`backend\src\modules\storage\oss-storage.service.ts`
- 职责边界：提供 Alibaba Cloud OSS 底层适配，包括 put、delete 和 signed URL。
- 上游调用方：`STORAGE_SERVICE` token。
- 下游依赖：`StorageConfigService`、`ali-oss`。
- 测试覆盖口径：`backend\src\modules\storage\storage.service.spec.ts` 仅验证缺少配置时的错误，不调用真实 OSS。

- Provider token：`STORAGE_SERVICE`
- 文件路径：`backend\src\modules\storage\storage.constants.ts`
- 职责边界：根据 `STORAGE_DRIVER` 选择 fake 或 OSS driver。

- Service 名称：`ScalesService`
- 文件路径：`backend\src\modules\scales\services\scales.service.ts`
- 职责边界：提供量表定义与量表版本配置的内部读取底座；规范化 scale code；按 mapper 输出 `ScaleDefinitionSummary` / `ScaleVersionSummary`，不直接返回完整 Mongoose document。
- 当前方法：`normalizeScaleCode(code)`、`findDefinitionByCode(code)`、`findVersionByScaleCodeAndVersion(scaleCode, version)`、`listActiveDefinitions()`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估、计分或配置读取模块内部调用。
- 下游依赖：`ScaleDefinition` 与 `ScaleVersion` Mongoose Model。
- 边界：不创建、更新、删除量表配置；不导入种子数据；不实现评估执行、作答、计分、报告、AI、认证或权限。
- 测试覆盖口径：`backend\src\modules\scales\services\scales.service.spec.ts`，覆盖 code 规范化、查无返回 `null`、mapper 输出、schema collection、索引和关键字段显式类型；不连接真实 MongoDB。

- Service 名称：`ScaleSeedDataService`
- 文件路径：`backend\src\modules\scales\seeds\scale-seed-data.service.ts`
- 职责边界：提供 MMSE / MoCA 初始配置 seed 的内部只读读取能力，并提供 `validateScaleSeeds()` 种子数据校验纯函数；返回 seed 克隆，避免调用方误改全局常量。
- 当前方法：`normalizeScaleCode(code)`、`getAllScaleSeeds()`、`getScaleSeedByCode(scaleCode)`、`getScaleVersionSeed(scaleCode, version)`、`listSeedScaleDefinitions()`、`listSeedScaleVersions()`、`validateScaleSeeds(seeds?)`。
- 上游调用方：当前暂无公开 Controller；预期供后续导入脚本、初始化任务或后端业务模块内部读取 MMSE / MoCA 初始配置。
- 下游依赖：MMSE / MoCA seed 常量；不依赖 Mongoose Model，不依赖 `ScalesService`，不依赖数据库、Storage、SMS 或 LLM。
- 边界：不创建、更新、删除数据库记录；不提供 import / upsert / seed runner；不执行写库；不暴露公开 MMSE / MoCA 配置查询 API；不实现评估执行、作答提交、媒体上传、自动计分触发、报告、AI、认证或权限。
- 测试覆盖口径：`backend\src\modules\scales\seeds\scale-seed-data.service.spec.ts`，覆盖 MMSE / MoCA seed 读取、code 规范化、版本读取、definition / version 列表、内置 seed 校验、总分范围、PDF / CRF 编号修正规则、MoCA 即刻记忆和延迟回忆记录规则、连续减 7 分步规则、图片 / 手写 / 用时证据要求、item code 唯一、groupCode 引用和校验错误分支；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为配置样例或脱敏人工样例。

- Service 名称：`ScaleCatalogService`
- 文件路径：`backend\src\modules\scales\services\scale-catalog.service.ts`
- 职责边界：提供经校验 seed 的安全目录摘要、可用 scale / version 解析，以及初始化时 `ScaleDefinition` / `ScaleVersion` 按需幂等物化。
- 当前方法：`listAvailableScaleOptions()`、`getAvailableScaleOption(scaleCode, version?)`、`ensureSeedScaleVersionMaterialized(scaleCode, version?)`。
- 上游调用方：`ScalesController` 调用只读目录；`AssessmentScaleWorkflowService` 调用解析与按需物化。
- 下游依赖：`ScaleSeedDataService`、`ScaleDefinition` / `ScaleVersion` Model。
- 写库与冲突边界：GET 目录不写库；物化使用 `$setOnInsert`，复用时不覆盖已有临床配置；校验状态、追溯字段和 group / item 数量；duplicate key 竞态后重新读取；currentVersionId 仅空值时设置。
- 错误语义：`SCALE_NOT_AVAILABLE`、`SCALE_VERSION_NOT_AVAILABLE`、`SCALE_NOT_ACTIVE`、`SCALE_VERSION_NOT_ACTIVE`、`SCALE_CATALOG_INVALID`、`SCALE_CATALOG_VERSION_CONFLICT`。
- 测试覆盖口径：`scale-catalog.service.spec.ts` 覆盖摘要、seed 校验失败、创建 / 复用、冲突、inactive、duplicate key 竞态和不覆盖语义；不连接真实 MongoDB。

- Controller 名称：`ScalesController`
- 文件路径：`backend\src\modules\scales\controllers\scales.controller.ts`
- 职责边界：公开只读 `GET /scales/available`；显式绑定 Session / Roles Guard 和四个临床工作流角色，只调用 `ScaleCatalogService`。
- 测试覆盖口径：controller spec 覆盖 Guard / Roles metadata 和安全列表传递。

- Service 名称：`PatientsService`
- 文件路径：`backend\src\modules\patients\services\patients.service.ts`
- 职责边界：保留患者 / 受试者基础档案内部读取能力，并承担 A12 患者分页、创建、详情读取和公开响应映射；不直接返回完整 Mongoose document。
- 当前方法：既有 `normalizeSubjectCode()`、`findPatientBySubjectCode()`、`listActivePatients()`；A12 新增 `findPatientById()`、`listPatients()`、`createPatient()`、`toPatientListItemResponse()`、`toPatientDetailResponse()`。
- 上游调用方：`PatientsController`；`AssessmentsService` 通过 `findPatientById()` 确认患者存在、状态和 subjectCode。
- 下游依赖：`Patient` Mongoose Model。
- 规则与异常：subjectCode trim + uppercase；keyword 经 `escapeRegExp()` 转义；分页使用 find + countDocuments；重复编号预检查并捕获 MongoDB 11000，统一抛 409 / `PATIENT_SUBJECT_CODE_CONFLICT`。
- 边界：A12 只创建患者，不更新、删除或归档；公开 mapper 不返回 externalRefs / metadata。
- 测试覆盖口径：service spec 覆盖规范化、ID 查无、分页与过滤、安全 keyword、创建默认值、预检查冲突、duplicate key 竞态和公开 mapper；不连接真实 MongoDB。

- Service 名称：`AssessmentsService`
- 文件路径：`backend\src\modules\assessments\services\assessments.service.ts`
- 职责边界：保留访视、量表实例和题目作答内部读取底座，并承担 A12 患者访视分页、访视创建、安全公开响应映射、A14 联合归属读取和实际进度统计。
- 当前方法：保留既有所有方法；A14 新增 `findScaleInstanceByPatientVisitAndId()`、`findItemResponseByOwnership()`、`countItemResponseProgress()` 与公开内部 mapper 入口，A13 `getVisitExecutionDetail()` 改用实际 ItemResponse 计数而非 ScaleInstance.progress Mixed 快照。
- 上游调用方：`AssessmentVisitsController`；既有内部调用方可继续复用旧方法。
- 下游依赖：`AssessmentVisit`、`ScaleInstance`、`ItemResponse` Mongoose Model 和 `PatientsService`；`AssessmentsModule` 导入 `PatientsModule`、`AuthModule`、`ScalesModule`。
- 规则与异常：先确认患者存在；非 active 返回 409 / `PATIENT_NOT_ACTIVE`；visitCode trim + uppercase；重复编号预检查并捕获 MongoDB 11000，统一为 `VISIT_CODE_CONFLICT`；dateFrom 晚于 dateTo 返回 400 / `INVALID_DATE_RANGE`。
- 创建所有权：patientId 来自路径，subjectCode 来自 Patient，status 固定 draft，operatorSnapshot 由 Controller 认证上下文生成；不接受客户端状态时间、clinicalContext 或 metadata。
- 边界：自身不更新、删除访视或流转状态；A13 初始化与 A14 草稿写入均由独立 Service 编排。访视详情先确认患者，再联合 patientId + visitId 查询；ScaleInstance 公开 mapper 不返回 definition / version ID、metadata、qualityControlSummary 或 Mixed 原始字段；实际进度不持久化回写。
- 测试覆盖口径：service spec 覆盖联合归属、详情、实例查重、排序、安全 mapper，以及实际 total / answered 计数与 A13 进度修正；不连接真实 MongoDB。

- Service 名称：`AssessmentExecutionService`
- 文件路径：`backend\src\modules\assessments\services\assessment-execution.service.ts`
- 职责边界：提供评估执行初始化内部编排底座；基于 MMSE / MoCA seed 构建不写库执行计划，并可内部创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；按 mapper 输出创建摘要，不直接返回完整 Mongoose document。
- 当前方法：`normalizeSubjectCode(subjectCode)`、`normalizeInstanceCode(instanceCode)`、`normalizeScaleCode(scaleCode)`、`buildScaleExecutionPlan(input)`、`createScaleExecutionFromPlan(plan)`、`createScaleExecutionFromSeed(input)`。
- 上游调用方：当前暂无公开 Controller；预期供后续后端评估执行工作流内部调用。
- 下游依赖：`ScaleInstance` 与 `ItemResponse` Mongoose Model、`ScaleSeedDataService`。`AssessmentsModule` 为此最小导入 `ScalesModule`。
- 边界：不注入 Patients / Media / Scoring / CognitiveDomains / Reports / Storage Service；不创建 Patient 或 AssessmentVisit；不创建 MediaEvidence、ScoreResult、CognitiveDomainResult 或 ClinicalReport；不提供公开 API；不实现作答提交、媒体上传、自动计分触发、认知域计算触发、报告生成、AI、认证或权限。
- 写库策略：`createScaleExecutionFromPlan()` 先创建 `ScaleInstance`，再批量创建初始 `ItemResponse`；insertMany 失败时按本次 scaleInstanceId 尝试删除可能已创建的题目和实例，然后重新抛出原始错误。当前不使用 Mongo session / transaction；这是补偿式一致性，不是严格事务原子性。
- 测试覆盖口径：原有执行计划与 mapper 覆盖之外，新增 insertMany 失败时的精确清理、补偿继续尝试和原始错误重抛；不连接真实 MongoDB，不调用外部服务。

- Service 名称：`AssessmentScaleWorkflowService`
- 文件路径：`backend\src\modules\assessments\services\assessment-scale-workflow.service.ts`
- 职责边界：编排 A13 初始化，依次校验患者、访视联合归属 / 状态、可用 scale / version、同访视同量表唯一性，调用目录按需物化与 `AssessmentExecutionService`，最后返回安全响应。
- 服务端所有权：subjectCode、definition / version 引用、instanceCode、instanceNo=1、status、operatorSnapshot、版本追溯均由服务端来源生成；不接受客户端伪造。
- 并发语义：初始化前查重；只把明确命中 ScaleInstance 唯一键的 Mongo duplicate key 映射为 `SCALE_INSTANCE_ALREADY_EXISTS`，其他内部失败映射为 `SCALE_EXECUTION_INITIALIZATION_FAILED`。
- 边界：不改变访视状态，不启动计时，不保存作答，不创建媒体 / 计分 / 认知域 / 报告结果。
- 测试覆盖口径：workflow spec 覆盖患者 active、访视归属 / 状态、scale 错误、查重、稳定 instanceCode、operatorSnapshot、并发 duplicate key 和安全内部错误。

- Service 名称：`AssessmentExecutionDetailService`
- 文件路径：`backend\src\modules\assessments\services\assessment-execution-detail.service.ts`
- 职责边界：只读编排 patient / visit / scaleInstance 归属、已物化 ScaleDefinition / ScaleVersion、groups、ItemResponse 列表与实际进度，组装 `ScaleInstanceExecutionDetailResponse`。
- 下游依赖：`PatientsService`、`AssessmentsService`、`ScalesService`；不直接操作 Model，不写数据库。
- 安全边界：允许读取所有实例状态和 inactive / archived 患者历史；配置引用不可用统一 409；公开输出通过显式 mapper，不返回完整量表或题目规则。
- 测试覆盖口径：detail service spec 覆盖历史读取、逐级归属错误、配置缺失 / 引用不匹配、分组排序与实际进度传递；不连接真实 MongoDB。

- Service 名称：`ItemResponseDraftService`
- 文件路径：`backend\src\modules\assessments\services\item-response-draft.service.ts`
- 职责边界：依次校验 Patient / Visit / ScaleInstance / ItemResponse 归属与可编辑状态，校验并克隆草稿 JSON，精确合并既有 step / prompt 槽位，处理 missing / timing / answered 语义，并以单条 `findOneAndUpdate` 原子保存 ItemResponse。
- 下游依赖：`PatientsService`、`AssessmentsService`、`ItemResponse` Model；不依赖 Scoring / Media / Reports / Storage。
- 写库边界：只写允许的 ItemResponse 草稿字段与 status；不修改 score、expectedValue、正确性、counts 标记、Visit / ScaleInstance 状态或 startedAt，不使用 transaction，不实现 revision / If-Match / 多操作者冲突控制。
- 测试覆盖口径：draft service spec 覆盖空 PATCH、完整归属、状态、JSON、missing、markAsAnswered、step / prompt 精确合并、timing、原子更新与安全保存失败；Model / Service 均为 mock，不连接真实 MongoDB。

- 纯函数：`validateAndCloneDraftJsonValue()` / `validateAndCloneStructuredDraft()`
- 文件路径：`backend\src\modules\assessments\lib\item-response-draft-json.ts`
- 职责边界：递归验证 JSON 类型、普通对象原型、危险 key、深度 / 长度 / 字节限制并生成新对象引用；不读取数据库或环境，不记录原始作答。

- Mapper：`toItemResponseExecutionResponse()`
- 文件路径：`backend\src\modules\assessments\services\item-response-execution.mapper.ts`
- 职责边界：从内部 ItemResponse summary 和 itemConfigSnapshot 中逐字段提取允许的执行配置与草稿；invalid legacy Mixed 草稿回退 null；不透传 scoringRule、expectedValue、评分结果、metadata 或媒体对象标识。

- Controller 名称：`AssessmentExecutionController`
- 文件路径：`backend\src\modules\assessments\controllers\assessment-execution.controller.ts`
- 公开接口：A14 单实例 GET 与单题 PATCH。
- 职责边界：绑定路径 / body DTO、`SessionAuthGuard`、`RolesGuard` 和四个临床工作流角色，只调用 detail / draft Service，不操作 Model、不递归校验 JSON、不计算进度。

- Service 名称：`MediaEvidenceService`
- 文件路径：`backend\src\modules\media\services\media-evidence.service.ts`
- 职责边界：提供媒体证据内部读取和 A15 完整归属数据访问；规范化 `evidenceCode`；按 mapper 输出 `MediaEvidenceSummary`，不直接返回完整 Mongoose document。
- 当前方法：既有 code / item / instance / visit / patient 读取方法，以及 `findEvidenceByOwnership()`、`listEvidenceByItemOwnership()`、`findActiveEvidenceByItemAndType()`、`createEvidence()`、`markEvidenceVoided()`、`deleteEvidenceForCompensation()`。
- 上游调用方：`MediaEvidenceWorkflowService`，以及后续计分、报告或科研导出等内部能力。
- 下游依赖：`MediaEvidence` Mongoose Model。
- 边界：只在内部执行 A15 所需创建 / 条件作废 / 补偿删除；没有公开物理删除方法，不直接调用 Storage，不处理 HTTP，不实现图片压缩、OCR、图像识别、自动计分、报告或 AI。
- 测试覆盖口径：`media-evidence.service.spec.ts` 覆盖既有读取、完整归属、当前有效证据、创建、条件作废与按 ID 补偿删除；Model 为 mock，不连接真实 MongoDB。

- Service 名称：`ScoringService`
- 文件路径：`backend\src\modules\scoring\services\scoring.service.ts`
- 职责边界：提供计分结果快照的内部读取底座；规范化 `scoreResultCode`；按 mapper 输出 `ScoreResultSummary`，不直接返回完整 Mongoose document；提供 `summarizeItemScores()` 通用计分汇总纯函数。
- 当前方法：`normalizeScoreResultCode(scoreResultCode)`、`findScoreResultByCode(scoreResultCode)`、`findLatestScoreResultByScaleInstanceId(scaleInstanceId)`、`listScoreResultsByScaleInstanceId(scaleInstanceId)`、`listScoreResultsByVisitId(assessmentVisitId)`、`listScoreResultsByPatientId(patientId)`、`summarizeItemScores(items)`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估、计分任务、报告或科研导出等后端业务模块内部读取计分结果摘要或复用通用汇总。
- 下游依赖：`ScoreResult` Mongoose Model；`summarizeItemScores()` 不依赖数据库。
- A17 扩展：新增按实例 + runNo 查询和明确输入的 ScoreResult create；`summarizeItemScores(items, { provisional: true })` 只统计计分项并在不完整时抑制 percentage。
- A18 扩展：新增完整 ownership + runNo=1 读取、`reviewScoreItemIfUnmodified()` 与 `confirmScoreResultIfUnmodified()`；两个更新都用 expected updatedAt 条件和单次 `findOneAndUpdate`，runValidators=true。人工复核原子写 item / group / total / status / source / review / quality / metadata；确认原子写确认状态 / 时间、实时 total / groups、review / quality / metadata，不写 itemScores / scoringSource / lockedAt。仍无 lock / void / delete，不修改 ItemResponse。
- 测试覆盖口径：`backend\src\modules\scoring\services\scoring.service.spec.ts`，覆盖 score result code 规范化、查无返回 `null`、mapper 输出、按量表实例最新读取、按量表实例 / 访视 / 患者列表读取、schema collection、索引、内嵌子文档 `_id: false`、关键字段显式类型，以及 `summarizeItemScores()` 对计入 / 不计入总分、缺失、未评分、需复核、非有限数字、逐步计分和 group score 汇总的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为脱敏人工样例。

- Service 名称：`CognitiveDomainsService`
- 文件路径：`backend\src\modules\cognitive-domains\services\cognitive-domains.service.ts`
- 职责边界：提供认知域结果快照的内部读取底座；规范化 `domainResultCode` 与 `domainCode`；按 mapper 输出 `CognitiveDomainResultSummary`，不直接返回完整 Mongoose document；提供 `summarizeDomainScores()` 通用认知域汇总纯函数。
- 当前方法：保留既有 code / latest / 实例 / ScoreResult / 访视 / 患者读取与 `summarizeDomainScores(items)`；A19 新增 `findDomainResultByScaleInstanceAndRunNo()` 与 `createRunOneDomainResult()`。
- 上游调用方：`CognitiveDomainComputationWorkflowService`，以及后续报告或科研导出等内部能力。
- 下游依赖：`CognitiveDomainResult` Mongoose Model；`summarizeDomainScores()` 不依赖数据库。
- 边界：只创建最终 computed runNo=1 文档，不提供 update / confirm / lock / void / delete / rerun；不修改 `ScoreResult` 或 `ItemResponse`，不实现诊断、报告或 AI。
- 汇总：新增 minScore / non-zero min 与完整 percentage；excluded 不进 score / min / max，included 未评分 percentage=null；保留旧输入未提供 min 的兼容语义，domain / contribution 稳定排序。
- 测试覆盖口径：service spec 覆盖既有 A6 语义、timestamps、runNo 查询 / create、min / non-zero min、excluded、完整 percentage 与 stable sort；Model 为 mock，不连接真实 MongoDB。

- Service 名称：`ReportsService`
- 文件路径：`backend\src\modules\reports\services\reports.service.ts`
- 职责边界：提供临床报告摘要的内部读取底座；规范化 `reportCode`；按 mapper 输出 `ClinicalReportSummary`，不直接返回完整 Mongoose document；提供报告状态转换校验纯函数。
- 当前方法：保留全部规范化、code / latest / visit / patient / status / confirmed 列表读取和状态转换方法；A20 新增 `findReportByVisitTypeVersion()`、`createClinicalReport()` / `createVersionOneCognitiveAssessmentReport()` 与 `isDuplicateKeyError()`。
- 上游调用方：`ClinicalReportGenerationWorkflowService`；既有内部调用方可继续读取报告摘要或复用状态校验口径。
- 下游依赖：`ClinicalReport` Mongoose Model；状态转换校验纯函数不依赖数据库。
- A20 写入边界：ObjectId 转换由 Service 完成，一次 `create()` 写入完整 version 1 draft；不创建临时记录、不更新报告、不写状态流转、不跨集合写入。返回显式 `ClinicalReportSummary`（含安全 timestamps），不返回 Mongoose document；duplicate key 判断不泄露 Mongo 细节。
- 边界：除 A20 首次 draft create 外，不更新或删除报告；不实现医生确认、锁定、归档、更正、作废、重生成、version 2、PDF / Word / 打印、AI、AuditLog 或 AiAnalysisResult；不修改任何来源数据。
- 测试覆盖口径：既有 schema / 读取 / 状态转换覆盖之外，A20 增加 visit + type + version 查询、单文档 create、ObjectId 转换、timestamps 与 duplicate key；Model 为 mock，不连接真实 MongoDB。

- Service 名称：`UsersService`
- 文件路径：`backend\src\modules\users\services\users.service.ts`
- 职责边界：提供系统账号内部读取、账号编码规范化和安全 mapper 输出；普通 mapper 不返回 `passwordHash`，凭证查询只返回认证必要字段。
- 当前方法：`normalizeAccountName(accountName)`、`normalizeEmail(email)`、`normalizeStaffCode(staffCode)`、`findUserById(userId)`、`findUserByAccountName(accountName)`、`findUserCredentialByAccountName(accountName)`、`listActiveUsers()`。
- 上游调用方：`AuthService` 当前调用 `findUserCredentialByAccountName()` 执行账号密码认证，调用 `findUserById()` 创建 / 校验 session 对应用户。
- 下游依赖：`User` Mongoose Model。
- 边界：不创建、更新、删除用户；不实现密码重置、账号禁用、角色矩阵管理、公开用户管理 API、短信验证码、OAuth / SSO、JWT 主登录态或前端认证。
- 测试覆盖口径：`backend\src\modules\users\services\users.service.spec.ts`，覆盖 `User` schema collection、索引、`passwordHash select: false`、枚举 / Date / Number / Mixed 显式类型，覆盖账号 / 邮箱 / 工号规范化、查无返回 `null`、mapper 输出不含 `passwordHash`、凭证查询显式 select `+passwordHash` 且只返回认证必要字段、active 用户列表读取；不连接真实 MongoDB，测试数据为脱敏人工样例。

- Service 名称：`AuthService`
- 文件路径：`backend\src\modules\auth\services\auth.service.ts`
- 职责边界：提供内部密码哈希 / 校验、账号密码认证编排、session token 生成 / hash、session 创建、session 校验、session 撤销、认证上下文构建和公开认证响应 mapper 能力。
- 当前方法：`hashPassword(plainPassword)`、`verifyPassword(plainPassword, storedPasswordHash)`、`generateSessionToken()`、`hashSessionToken(rawToken)`、`authenticateWithPassword(input)`、`createSessionForUser(input)`、`validateSessionToken(rawToken)`、`revokeSessionByToken(rawToken)`、`buildPublicAuthUser(user, sessionId?)`、`toAuthUserResponse(user)`。
- 上游调用方：`AuthController.login()` 调用 `authenticateWithPassword()`；`AuthController.logout()` 调用 `revokeSessionByToken()`；`AuthController.getMe()` 调用 `toAuthUserResponse()`；`SessionAuthGuard` 调用 `validateSessionToken()`。
- 下游依赖：`Session` Mongoose Model、`UsersService`、Node.js 内置 `crypto`。
- 边界：不设置 Cookie，不清除 Cookie，不实现公开用户管理 API、短信验证码、OAuth / SSO、JWT 主登录态、max active session 回收、前端认证或权限页面。
- 测试覆盖口径：`backend\src\modules\auth\services\auth.service.spec.ts`，覆盖 `Session` schema collection、索引、`sessionTokenHash select: false`、TTL 索引、ObjectId / Date / Mixed 显式类型，覆盖密码 hash / verify、损坏 hash、session token 随机性、token hash 稳定性、账号密码认证成功创建 session、账号不存在 / 密码错误 / 用户非 active 返回 `null`、session 创建写入 token hash 而非 raw token、session 不存在 / revoked / expired / 用户不存在 / 用户非 active 返回 `null`、正常返回 `AuthenticatedUserContext` 且不含 passwordHash、raw token 或 token hash；不连接真实 MongoDB，不调用 OSS / Storage / SMS / LLM。

- Controller 名称：`PatientsController`
- 文件路径：`backend\src\modules\patients\controllers\patients.controller.ts`
- 职责边界：绑定患者列表 / 创建 / 详情路由、DTO、`SessionAuthGuard`、`RolesGuard` 和患者工作流角色；只调用 `PatientsService`，不直接操作 Model。
- 公开接口：`GET /patients`、`POST /patients`、`GET /patients/:patientId`。
- 权限：仅 `admin`、`doctor`、`nurse`、`research_assistant`；未认证 401，角色不足 403；没有注册全局 Guard。
- 测试覆盖口径：controller spec 覆盖 Guards / Roles metadata、Service 参数传递、创建 / 详情响应和患者不存在；DTO spec 覆盖分页默认值 / 边界、枚举、MongoId、转换和非白名单字段。

- Controller 名称：`AssessmentVisitsController`
- 文件路径：`backend\src\modules\assessments\controllers\assessment-visits.controller.ts`
- 职责边界：绑定患者访视列表 / 创建路由、DTO、Guard 和角色；从 `@CurrentUser()` 构建 operatorSnapshot 后调用 `AssessmentsService`。
- 公开接口：`GET /patients/:patientId/visits`、`POST /patients/:patientId/visits`、`GET /patients/:patientId/visits/:visitId`、`POST /patients/:patientId/visits/:visitId/scale-instances`。
- operatorRole 优先级：doctor > nurse > research_assistant > admin > unknown；客户端不能传入或覆盖 operatorSnapshot。
- 权限：仅 `admin`、`doctor`、`nurse`、`research_assistant`；未认证 401，角色不足 403；没有注册全局 Guard。
- 测试覆盖口径：controller spec 覆盖 Guards / Roles metadata、四个路由参数、当前用户映射和角色优先级；DTO spec 覆盖双 MongoId、scale code / version 转换、施测模式和全部服务器字段白名单拒绝。

- Controller 名称：`AuthController`
- 文件路径：`backend\src\modules\auth\auth.controller.ts`
- 职责边界：定义公开认证 HTTP API 边界；`POST /auth/login` 调用 `AuthService.authenticateWithPassword()` 并设置 HttpOnly `cogmemory_ad_session` Cookie；`POST /auth/logout` 从 Cookie 读取 session token、内部撤销 session 并清除 Cookie；`GET /auth/me` 使用 `SessionAuthGuard` 显式保护并返回当前用户公开信息。
- 上游调用方：HTTP 客户端 / 后续前端 BFF。
- 下游依赖：`AuthService`、`SessionAuthGuard`、session cookie util。
- 边界：不直接操作 Mongoose Model，不实现用户管理、注册、密码重置、短信验证码、OAuth / SSO、JWT 主登录态、前端登录页或权限菜单；响应体不返回 passwordHash、raw session token、session token hash、secret 或 credential。
- 测试覆盖口径：`backend\src\modules\auth\auth.controller.spec.ts`，覆盖登录成功设置 HttpOnly Cookie、登录失败统一 Unauthorized 且不设置 Cookie、登出撤销 / 清理 Cookie、无 Cookie 登出稳定成功、me 返回公开用户信息且不含敏感字段。

- Guard 名称：`SessionAuthGuard`
- 文件路径：`backend\src\modules\auth\guards\session-auth.guard.ts`
- 职责边界：支持 `@Public()` 路由直通；从 cookie-parser cookies 或原始 `cookie` header 读取 `cogmemory_ad_session`；调用 `AuthService.validateSessionToken()`；校验成功后挂载 `req.user`，失败抛 `UnauthorizedException`。
- 上游调用方：`AuthController.getMe()`、`PatientsController`、`AssessmentVisitsController` 显式启用；未注册为全局 Guard。
- 下游依赖：`Reflector`、`AuthService`。
- 边界：不下发 Cookie，不清除 Cookie，不改变 `GET /health` 权限。
- 测试覆盖口径：`backend\src\modules\auth\guards\session-auth.guard.spec.ts`，覆盖 public 路由直通、缺少 Cookie 抛 `UnauthorizedException`、`cogmemory_ad_session` cookie-parser cookies 读取、原始 cookie header 解析、校验成功挂载 `req.user`、校验失败抛 `UnauthorizedException`。

- Guard 名称：`RolesGuard`
- 文件路径：`backend\src\modules\auth\guards\roles.guard.ts`
- 职责边界：读取 `@Roles()` 元数据；无角色要求时直通；有角色要求时基于 `req.user.roles` 校验，角色不足或缺少 `req.user` 时抛 `ForbiddenException`。
- 上游调用方：`PatientsController`、`AssessmentVisitsController` 与 `@Roles()` 配合显式启用；未注册为全局 Guard。
- 下游依赖：`Reflector`。
- 边界：不实现完整权限矩阵，不实现权限管理接口，不改变 `GET /health` 权限。
- 测试覆盖口径：`backend\src\modules\auth\guards\roles.guard.spec.ts`，覆盖无角色要求直通、包含要求角色通过、角色不足抛 `ForbiddenException`、没有 `req.user` 抛 `ForbiddenException`。

- Controller 名称：`MediaEvidenceController`
- 文件路径：`backend\src\modules\media\controllers\media-evidence.controller.ts`
- 职责边界：绑定 A15 四个题目级媒体路由、路径 / body / query DTO、`SessionAuthGuard`、`RolesGuard`、临床角色和 multipart 内存文件接收；Controller 不直接操作 Model 或 Storage。
- 文件接收：`FileFieldsInterceptor` 仅接收 file / trajectory，各最多 1；总文件数 2、单文件 Multer 上限 10 MiB、文本字段最多 30。media 局部 interceptor 将 Multer / Nest 的超限异常稳定映射为 413 `MEDIA_FILE_TOO_LARGE`，不修改全局 filter。

- Service 名称：`MediaEvidenceWorkflowService`
- 文件路径：`backend\src\modules\media\services\media-evidence-workflow.service.ts`
- 当前方法：`listEvidence()`、`uploadEvidence()`、`createAccessUrl()`、`voidEvidence()`。
- 下游依赖：`PatientsService`、`AssessmentsService`、`MediaEvidenceService`、`STORAGE_SERVICE`、`StorageConfigService`。
- 归属 / 状态：统一验证 Patient -> Visit -> ScaleInstance -> ItemResponse -> MediaEvidence 完整链；只读允许历史状态，上传 / 作废要求 Patient active、Visit / ScaleInstance draft 或 in_progress、ItemResponse not_started / in_progress / answered。
- 上传编排：校验证据要求、captureMode、主文件和可选轨迹；生成不含患者隐私与原始文件名的 UUID objectKey；依次上传 Storage、创建 MediaEvidence、条件绑定 evidenceRef。绑定仅允许同 evidenceType、mediaEvidenceId 空且状态 pending / missing 的数组元素，形成并发边界。
- 补偿边界：轨迹上传失败删除主对象；创建失败删除本次对象；绑定异常 / 冲突删除本次 MediaEvidence 与对象。补偿只使用本次 ID / key，不使用 transaction，不修改或删除其他业务数据；补偿日志仅记录固定类型、evidenceCode、driver 和成功标记。
- 访问 / 作废：签名访问固定使用 `DEFAULT_SIGNED_URL_EXPIRES_SECONDS`；作废先清除 evidenceRef，再标记 MediaEvidence voided，失败尝试恢复引用。正常作废不调用 deleteObject。
- 边界：不改变 ItemResponse / ScaleInstance / AssessmentVisit status，不评分，不实现前端采集、物理删除、原子替换、批量 / 分片 / 客户端直传、OCR / AI、报告或最终提交。

- Service 名称：`MediaEvidenceService`（A15 扩展）
- 文件路径：`backend\src\modules\media\services\media-evidence.service.ts`
- 新增方法：`findEvidenceByOwnership()`、`listEvidenceByItemOwnership()`、`findActiveEvidenceByItemAndType()`、`createEvidence()`、`markEvidenceVoided()`、`deleteEvidenceForCompensation()`。
- 职责边界：只负责完整归属数据访问与内部 Summary mapper；列表排除 deleted；作废仅条件更新 attached；补偿删除只按调用方传入的本次 evidence ID。内部 storage / metadata Summary 不直接作为 HTTP 响应。

- Mapper / 纯函数：`toMediaEvidenceResponse()`、`validatePrimaryMediaFile()`、`validateHandwritingTrajectoryJson()`
- 文件路径：`backend\src\modules\media\services\media-evidence-public.mapper.ts`、`backend\src\modules\media\lib\media-file-validation.ts`、`handwriting-trajectory-json.ts`
- 职责边界：public mapper 显式逐字段白名单映射并把非有限数归一化为 null；图片校验负责大小 / MIME / 魔数 / 元数据 / SHA-256；轨迹校验负责 application/json、2 MiB、结构限额、危险 key、深克隆、规范化 Buffer 与 SHA-256。纯函数不依赖 Nest DI、数据库或 Storage。

- Service 名称：`AssessmentsService`（A15 证据引用扩展）
- 新增方法：`attachItemEvidenceReference()`、`clearItemEvidenceReference()`、`restoreItemEvidenceReference()`。
- 职责边界：使用既有 ItemResponse Model 和完整 patient / visit / instance / item 条件原子更新匹配 evidenceRefs 元素；绑定 / 清除同时限制可编辑 ItemResponse 状态，恢复仅在空 pending 引用上执行。方法不修改 ItemResponse status、作答、评分、step、prompt、timing、operatorNote、Visit 或 ScaleInstance。

### A16 submission 编排

- 名称：`ScaleInstanceSubmissionController`
- 职责：绑定两个嵌套资源路径、复用路径 DTO、接收 Submit DTO / `@CurrentUser()`，显式 Session / Roles Guard；不注入 Model，不解析 Mixed，不计算 readiness。

- 名称：`ScaleInstanceSubmissionService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`。
- 职责：依次读取 Patient / Visit / ScaleInstance，校验 definition / version 与 ItemResponse 归属和追溯；编排 readiness、首次提交状态、二次实时读取、操作者优先级、startedAt / duration、原子完成、幂等与并发 miss 重读；组装安全公开响应。
- 边界：不依赖 `MediaModule`，媒体事实只读 ItemResponse.evidenceRefs；不修改 Visit / ItemResponse，不评分，不生成报告或 AI 内容。

- 名称：`evaluateScaleInstanceSubmissionReadiness()`
- 类型：无 DI、无数据库访问的纯函数。
- 职责：按 ScaleVersion.items + ItemResponse + 安全 snapshot 白名单计算 item set、有效作答、missing、step、timing、media、operatorNote、稳定 issue 排序、summary、earliest timing start、ready / canSubmitNow。
- 复用：A14 与 A16 共享 `hasMeaningfulItemResponseAnswer()`，false / 0 有效，空字符串 / 数组 / 对象无效，避免两套完成语义。

- 名称：`AssessmentsService`（A16 扩展）
- 职责：`completeScaleInstanceIfEditable()` 用完整 ownership + editable status 单条 `findOneAndUpdate`，设置 completed / timing / progress 和受控 metadata 点路径；`readScaleInstanceSubmissionAudit()` 只解析允许字段。
- 一致性：提交前两次读取 ItemResponse，再原子迁移单个 ScaleInstance；不使用 Mongo transaction、跨集合锁或分布式锁，因此不是跨集合严格线性化事务。
- 配置：`ScalesService` 仅作为只读 definition / version 依赖；不修改 scales 或 media 模块。

### A17 阶段性评分编排

- 名称：`ScoringController`
- 职责：绑定 compute / latest 两条嵌套路由、复用路径 DTO、接收 Compute DTO，显式 Session / Roles Guard；不注入 Model、不读取 Mixed 规则、不计算分数或处理 duplicate key。

- 名称：`ProvisionalScoringWorkflowService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`ScoreResultPublicMapper` 与纯评分引擎。
- 职责：完整 ownership / definition / version / item set 校验；既有结果状态解析；首次计算 Patient / Visit / completed Instance 状态校验；调用纯引擎与既有汇总器；创建 runNo=1；duplicate key 重读；组装安全响应。
- 边界：不接收当前用户或人工评分，不修改 Patient / Visit / ScaleInstance / ItemResponse / step / prompt / media，不确认或锁定结果，不创建认知域结果 / 报告，不调用 AI。

- 名称：`evaluateProvisionalItems()` / `finalizeProvisionalScoring()`
- 类型：无 DI、无数据库访问的量表通用纯函数。
- 职责：按 scoringRule.mode / steps / aggregationRule / scoreRange / countsTowardTotal 分类。只识别严格 number / boolean `multi_step_manual`；MMSE 直接步骤求和，MoCA 只识别真实 correct-step-count 数组结构；其他模式保守复核。输出 item snapshots、provisional total / groups、状态 / 来源 / review / quality 和受控 warning。
- 安全：不按 scaleCode / itemCode 分支，不做字符串匹配 / 类型转换，不使用 eval / Function，不修改输入。

- 名称：`ScoreResultPublicMapper`
- 职责：从内部 ScoreResult summary 与实例绑定版本配置逐字段生成公开 scoreResult / reviewQueue；派生 group 计数和 stable sort；未知 reason 回退通用人工复核，warning 仅白名单输出。
- 安全：不透传 Mixed、作答、规则、正确性、ItemResponse.score、metadata、qualityHints 或 reviewer。

- 模块依赖：`ScoringModule` 单向导入 AuthModule、PatientsModule、AssessmentsModule、ScalesModule；AssessmentsModule 不导入 ScoringModule，无循环、forwardRef 或重复 Schema 注册。

### A18 人工复核与确认编排

- 名称：`ScoreReviewWorkflowService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`ScoreResultPublicMapper`。
- 职责：完整 Patient → Visit → ScaleInstance → ScoreResult ownership / runNo=1 / definition / version 绑定；manual-review 额外验证 ItemResponse ownership 与 itemCode；解析认证 actor 角色优先级；编排 range / step、受控审计、重新汇总、状态派生、expectedUpdatedAt 原子更新、冲突重读、确认 readiness 与 confirmed / locked 幂等。
- 边界：不访问媒体文件、不从 ItemResponse 重新判分、不调用 A17 provisional engine、不修改 Patient / Visit / Instance / ItemResponse，不依赖 CognitiveDomains / Reports，不调用 AI。

- 名称：`prepareManualScoreReview()` / `finalizeManualScoreReview()` / `evaluateScoreConfirmationReadiness()` / `prepareScoreConfirmation()`
- 类型：scoring 模块内无 DI、无数据库访问的纯函数。
- 职责：验证可复核 item、ScaleVersion range / step、0 分；克隆 itemScores / metadata、追加 UUID 事件、500 上限；基于 `summarizeItemScores()` 输出补齐总分范围 / group title / 排序 / percentage，派生 scoringSource / result / review / quality；确认前比较实时汇总与持久化快照并阻断 A17 warning；生成受控 confirmation metadata。
- metadata：写入时 null 视为空对象，普通对象保留所有顶层 key，非法结构拒绝且不覆盖；公开读取 parser 仅返回合法受控字段。previousScoreValue 只存在内部人工审计。

- 名称：`ScoreResultPublicMapper`（A18 扩展）
- 职责：公开 updatedAt；按 itemResponseId 选择最后一条合法人工事件映射 manualReview；confirmed / locked 映射 confirmation，历史无 namespace 时使用 confirmedAt + review 安全 fallback。
- 安全：非法 / 未知 metadata 安全忽略且从不透传；manual_scored 不继续暴露旧 reviewReason；不公开事件列表、previousScoreValue、内部命名空间或 Session。

- 一致性：A18 的一致性边界是单个 ScoreResult 文档的条件原子更新；不使用 Mongo transaction、跨集合写入、分布式锁或自动重试。confirmed 不是 locked，qualityStatus=passed 不是疾病结论。

### A19 确认评分驱动的认知域编排

- 名称：`CognitiveDomainResultsController`
- 职责：绑定 compute / latest 两条嵌套路由，复用 `ScaleInstanceExecutionParamDto`，接收 Compute DTO；类级显式 Session / Roles Guard 与四个临床角色。compute 通过 `@CurrentUser()` 传入内部 computedBy；Controller 不操作 Model、不解析 ScoreResult、不构造 mapping rules 或处理 duplicate key。

- 名称：`CognitiveDomainComputationWorkflowService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`CognitiveDomainsService`、`CognitiveDomainResultPublicMapper`。
- 职责：完整 Patient → Visit → ScaleInstance → Definition / Version 归属；既有 result 幂等；首次状态和 source ScoreResult 最终性；调用纯映射与 `summarizeDomainScores()`；构造受控 runNo=1 result；duplicate-key 恢复；安全响应组装。
- 幂等边界：既有有效结果不重读或重新验证 ScoreResult，也不重新要求首次 Patient / Visit / Instance 状态；只返回既有安全结果。latest 只读并允许历史状态 / voided result。
- 写入边界：只调用 CognitiveDomainsService 创建一条 computed 结果；不修改 Patient、Visit、ScaleInstance、ItemResponse、MediaEvidence 或 ScoreResult，不创建 ClinicalReport，不使用 transaction、分布式锁或 runNo=2。

- 名称：`mapConfirmedScoreToDomainInputs()`
- 类型：无 Nest DI、无数据库访问的纯函数。
- 职责：验证 ScoreResult item set / duplicate itemCode、countsTowardTotal、finite min/max、itemResponseId、cognitiveDomainCodes 与 ScaleVersion 绑定；domain trim + lowercase + 单 item 去重；生成 weight=1 的 included / excluded mapping input、排序 domainCodes、受控 mappingSnapshot / policy。
- 安全：只读取已确认 itemScores 安全字段，不读取作答、图片、手写、expectedValue、scoringRule、isCorrect 或 AI；不修改输入，不按 scaleCode / itemCode 分支，不硬编码 domain title。

- 名称：`CognitiveDomainResultPublicMapper`
- 职责：显式逐字段输出 domain score、contribution、固定 mapping policy / interpretation、computation / review / version / timestamps；finite / null 归一化并稳定排序复制数组。
- 安全：不透传 subjectCode、数据库关系大包、metadata、qualityHints、computedBy、原始 Mixed mappingRules、内部 notes、评分 / 确认意见、作答、媒体、阈值或诊断内容。

- 模块依赖：`CognitiveDomainsModule` 单向导入 AuthModule、PatientsModule、AssessmentsModule、ScalesModule、ScoringModule；ScoringModule 不导入 CognitiveDomainsModule，无循环、forwardRef 或其他模块 Schema 重复注册。

### A20 访视级规则化报告编排

- 名称：`ClinicalReportsController`
- 职责：绑定 visit 级 generate / latest、Path / Body DTO、显式 Session / Roles Guard 与四个临床角色。generate 使用 `@CurrentUser()`；latest 不使用。Controller 不注入 Model、不读来源、不构造快照 / narrative、不解析 metadata 或处理 duplicate key。

- 名称：`ClinicalReportGenerationWorkflowService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`CognitiveDomainsService`、`MediaEvidenceService`、`ReportsService`、`ClinicalReportPublicMapper`。
- 职责：确认 + scope 规范化；Patient / Visit 联合归属；既有 version 1 报告幂等 / scope / voided / incomplete；首次状态；所选 ScaleInstance / 历史配置；最终 ScoreResult；确定性 CognitiveDomainResult；媒体筛选 / 质量；actor 角色优先级；纯 builder；单文档 create；duplicate key 恢复；latest 历史读取和安全响应。
- 幂等：既有同 scope 报告不重读 ScoreResult / CognitiveDomainResult / media，也不重新构建或修改；不同 scope 冲突。duplicate key 后按同一 visit / type / version 重读并复用相同规则；仍无记录返回生成冲突。
- 写入边界：只调用 ReportsService 创建一条完整 ClinicalReport；不调用 A17-A19 compute / review / confirm，不修改 Patient / Visit / ScaleInstance / ItemResponse / ScoreResult / CognitiveDomainResult / MediaEvidence，不使用 transaction / 分布式锁。

- 名称：`buildClinicalReportCode()` / `buildClinicalReportDraft()`
- 类型：reports 模块内无 Nest DI、无数据库 / Storage / 网络访问的纯函数。
- 职责：SHA-256 确定性 reportCode、稳定 scope / score / domain / evidence 顺序、白名单 patient / visit / scale / score / domain / evidence snapshots、固定五段非 AI narrative、aiDraft not_requested、quality 派生和 a20Generation metadata。scoreDetails 固定 null、visit clinicalContext 固定 null、domain 不编造 minScore；不读取原始作答 / 自由文本 / 媒体 Buffer，不评分、不计算认知域、不生成诊断 / 建议。

- 名称：`ClinicalReportPublicMapper`
- 职责：逐字段输出安全 patient / visit / scale / score / domain / evidence / narrative / generation / confirmation / timestamps，finite / null 归一化、数组复制 / 稳定排序和 isFinal 派生；非法 generation metadata 返回 null。
- 安全：不透传内部 Summary、Mixed、clinicalContext、metadata、qualityHints、source ID 数组、scoreResultId / scoreDetails、domain result ID、media / item ID、storageObjectKey、AI provider / model / draftText、signatureText 或 correction / audit 内部字段。

- 模块依赖：`ReportsModule` 单向导入 Auth、Patients、Assessments、Scales、Scoring、CognitiveDomains、Media；来源模块均不导入 ReportsModule。无循环依赖、forwardRef 或来源 Schema 重复注册；一致性边界为单 ClinicalReport 文档 create + 既有 reportCode unique 索引。

## 4. 后续同步规则

- Service 事实以实际代码、模块边界和测试为准。
- 不得将未确认业务流程写成已实现 Service 能力。
- 跨模块调用、事务和一致性要求应在实现后及时补充。

### A21 ClinicalReport review workflow

- `ClinicalReportReviewWorkflowService` 依赖 `PatientsService`、`AssessmentsService`、`ReportsService`、`ClinicalReportPublicMapper`；负责 ownership、Patient / Visit 写状态、认证 actor、状态 / readiness、并发 miss、幂等与安全响应。不依赖 Scoring、CognitiveDomains、Media、Storage、LLM。
- `clinical-report-review.ts` 是无数据库纯函数：规范化 clinician text，保留 A20 五段 narrative，计算 changedFields / no-change，严格验证并保留 metadata 顶层 namespace，追加最多 200 条 `a21Edits`，构建 submission / confirmation audit，评估 readiness；不修改输入。
- `ReportsService.findReportByOwnership()` 只按 report + patient + visit + cognitive_assessment version 1 读取；三个 `*IfUnmodified()` 方法使用单次 `findOneAndUpdate`，filter 含 ownership、type、version、当前允许 status、updatedAt，并启用 `new=true / runValidators=true`。
- edit 原子 `$set` 仅 narrative、source=mixed、metadata；submit 仅 status + metadata；confirm 仅 status + Schema confirmation + qualityStatus + metadata。没有 snapshot / scope / reportCode / version / aiDraft / lockedAt 写入。
- `ClinicalReportPublicMapper` 容错解析 A21 metadata：公开 doctorOpinion / recommendationText、最后编辑摘要、submission 摘要和 confirmationId；非法 metadata 安全忽略，不返回 metadata、事件数组、previous / next、signatureText。
- 与 A20 边界：Generation Workflow 仍负责一次性创建规则化 system_draft 和历史来源快照；Review Workflow 只把当前 ClinicalReport 文档作为确认对象，不调用 A17-A20 来源读取 / 重算，不重生成 narrative。
- 一致性边界是单 ClinicalReport 文档原子更新；没有 Mongo transaction、分布式锁、跨集合补偿、AuditLog 集合或循环依赖 / forwardRef。

### A22 ClinicalReport lock workflow

- `ClinicalReportLockWorkflowService` 只依赖 `PatientsService`、`AssessmentsService`、`ReportsService`、`ClinicalReportPublicMapper`；负责 ownership、认证 doctor/admin actor、已锁定幂等、首次 Patient / Visit 状态、strict expectedUpdatedAt、readiness、原子 miss 恢复与安全响应。
- Workflow 不依赖 Scoring、CognitiveDomains、Media、Storage、LLM/AI，也不读取来源 Model；已锁定分支只验证资源归属和锁定事实，不重新执行首次锁定状态 / updatedAt 检查。
- `clinical-report-lock.ts` 是无数据库纯函数，复用 A21 导出的 plain object、A20 generation、A21 submission / confirmation 与基础报告完整性规则；评估首次锁定 readiness，构建一次性 a22Lock，保留 metadata namespace，解析完整审计 / 历史 fallback，且不修改输入或 status。
- `ReportsService.lockReportIfUnmodified()` 只负责 ObjectId 转换、完整条件 filter 和单文档 `findOneAndUpdate()`；update 只含 lockedAt、lockedBy、metadata，Mongoose timestamps 更新 updatedAt。没有 save、自动重试、transaction、分布式锁或来源更新。
- `ClinicalReportPublicMapper` 无数据库访问，安全解析 a22Lock 为 `lock`；缺 namespace 且 Schema 锁定字段完整时返回受控 fallback，非法 / 不一致审计返回 lock=null；继续保留 top-level lockedAt，不返回 metadata 或原始 lockedBy。
- 与 A20/A21 边界：A20 负责生成历史快照，A21 负责 clinician edit / submission / confirmation，A22 只锁定已经 confirmed 的当前 ClinicalReport 文档。A22 不修改 A20/A21 metadata、confirmation、narrative、快照、source / quality / status，不实现 unlock / archive / correct / void。

### A23 ClinicalReport source freeze workflow

- `ClinicalReportSourceFreezeWorkflowService` 依赖 Patients、Assessments、Scoring、CognitiveDomains、Media 的导出 Service，以及 ReportsService / public mapper；负责 ownership、doctor/admin actor、首次 readiness、精确 scope、固定顺序批量冻结、全量重读验证、恢复、completed 幂等和安全回执。
- `clinical-report-source-freeze.ts` 是无 DI / 数据库的纯函数：验证已锁报告与 A20-A22 metadata，规范化、去重和稳定排序 scope，构建 counts、in_progress / completed audit，保留其他 metadata namespace，并严格解析既有审计与 scope 一致性。
- `ReportsService.startSourceFreezeIfUnmodified()` 以 ownership + report prerequisite + expectedUpdatedAt + 无既有 A23 审计原子写入 in_progress；`completeSourceFreezeIfMatching()` 只按 ownership + freezeId + in_progress 原子写 completed，不修改正文、快照、confirmation、锁字段或 status。
- `AssessmentsService` 提供 exact ScaleInstance / ItemResponse 查询和批量冻结；`ScoringService` 冻结 confirmed ScoreResult；`CognitiveDomainsService` 只为 computed/confirmed 域结果补 lockedAt；`MediaEvidenceService` 冻结 attached 证据。所有方法限定 patient / visit / 精确 ID，并返回受控批次计数。
- ReportsModule 保持单向依赖来源模块；不重复注册来源 Schema、不直接注入跨模块 Model、不使用 forwardRef。跨集合操作无 Mongo transaction，in_progress 是恢复锚点；部分失败不回滚或解冻，completed 仅在重读验证全部来源后写入。
- public mapper 只解析安全 summary，不公开 metadata / scope IDs；A20-A22 metadata 更新继续使用顶层 namespace 合并并保留 a23SourceFreeze。
