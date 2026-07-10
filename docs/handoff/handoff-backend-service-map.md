# CogMemory AD / 智忆评 后端 Service 职责地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 Service 职责边界、调用关系、事务要求和测试覆盖口径。

## 2. 当前状态

- 当前存在公共底座 Service / Provider，以及各业务模块内部读取或认证底座 Service；A12 已扩展 `PatientsService` 与 `AssessmentsService`，并新增 `PatientsController`、`AssessmentVisitsController` 作为五个受保护公开 API 的 HTTP 边界。
- 当前没有医生、SMS 或 LLM Service；`AssessmentExecutionService`、媒体、计分、认知域和报告能力仍为内部底座，A12 不调用量表初始化、作答、媒体、计分、报告或 AI 能力。

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
- 职责边界：保留访视、量表实例和题目作答内部读取底座，并承担 A12 患者访视分页、访视创建和安全公开响应映射。
- 当前方法：保留既有所有方法；A12 新增 `findVisitById()`、`listVisitsByPatientIdPaginated()`、`createVisitForPatient()`、`toAssessmentVisitListItemResponse()`、`toAssessmentVisitDetailResponse()`。
- 上游调用方：`AssessmentVisitsController`；既有内部调用方可继续复用旧方法。
- 下游依赖：`AssessmentVisit`、`ScaleInstance`、`ItemResponse` Mongoose Model 和 `PatientsService`；`AssessmentsModule` 导入 `PatientsModule`、`AuthModule`、`ScalesModule`。
- 规则与异常：先确认患者存在；非 active 返回 409 / `PATIENT_NOT_ACTIVE`；visitCode trim + uppercase；重复编号预检查并捕获 MongoDB 11000，统一为 `VISIT_CODE_CONFLICT`；dateFrom 晚于 dateTo 返回 400 / `INVALID_DATE_RANGE`。
- 创建所有权：patientId 来自路径，subjectCode 来自 Patient，status 固定 draft，operatorSnapshot 由 Controller 认证上下文生成；不接受客户端状态时间、clinicalContext 或 metadata。
- 边界：不更新、删除访视或流转状态；不调用 `AssessmentExecutionService`，不创建量表实例或题目作答，不触发媒体、计分、认知域、报告或 AI；公开 mapper 不返回 clinicalContext / metadata。
- 测试覆盖口径：service spec 覆盖分页过滤、日期范围、患者不存在 / 非 active、规范化、冲突预检查 / duplicate key、服务端字段所有权和公开 mapper；不连接真实 MongoDB。

- Service 名称：`AssessmentExecutionService`
- 文件路径：`backend\src\modules\assessments\services\assessment-execution.service.ts`
- 职责边界：提供评估执行初始化内部编排底座；基于 MMSE / MoCA seed 构建不写库执行计划，并可内部创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；按 mapper 输出创建摘要，不直接返回完整 Mongoose document。
- 当前方法：`normalizeSubjectCode(subjectCode)`、`normalizeInstanceCode(instanceCode)`、`normalizeScaleCode(scaleCode)`、`buildScaleExecutionPlan(input)`、`createScaleExecutionFromPlan(plan)`、`createScaleExecutionFromSeed(input)`。
- 上游调用方：当前暂无公开 Controller；预期供后续后端评估执行工作流内部调用。
- 下游依赖：`ScaleInstance` 与 `ItemResponse` Mongoose Model、`ScaleSeedDataService`。`AssessmentsModule` 为此最小导入 `ScalesModule`。
- 边界：不注入 Patients / Media / Scoring / CognitiveDomains / Reports / Storage Service；不创建 Patient 或 AssessmentVisit；不创建 MediaEvidence、ScoreResult、CognitiveDomainResult 或 ClinicalReport；不提供公开 API；不实现作答提交、媒体上传、自动计分触发、认知域计算触发、报告生成、AI、认证或权限。
- 写库策略：`createScaleExecutionFromPlan()` 当前先创建 `ScaleInstance`，再批量创建初始 `ItemResponse`；本阶段不使用 Mongo session / transaction，不实现幂等、并发控制或补偿删除。后续公开业务 API 如需要原子性，应引入 transaction 或补偿策略。
- 测试覆盖口径：`backend\src\modules\assessments\services\assessment-execution.service.spec.ts`，覆盖 MMSE / MoCA 执行计划、MMSE 修正 CRF、MoCA 即刻记忆不计分、MoCA 延迟回忆提示记录、MMSE / MoCA 连续减 7 stepResults、绘图 / 连线图片与手写证据占位、计时占位、score 初始占位、normalize 方法、seed 不存在、seed 校验失败、非法输入、写库调用顺序和 mapper 输出；不连接真实 MongoDB，不调用 OSS / Storage / SMS / LLM，测试数据为配置样例或脱敏人工样例。

- Service 名称：`MediaEvidenceService`
- 文件路径：`backend\src\modules\media\services\media-evidence.service.ts`
- 职责边界：提供媒体证据元数据的内部读取底座；规范化 `evidenceCode`；按 mapper 输出 `MediaEvidenceSummary`，不直接返回完整 Mongoose document。
- 当前方法：`normalizeEvidenceCode(evidenceCode)`、`findEvidenceByCode(evidenceCode)`、`listEvidenceByItemResponseId(itemResponseId)`、`listEvidenceByScaleInstanceId(scaleInstanceId)`、`listEvidenceByVisitId(assessmentVisitId)`、`listEvidenceByPatientId(patientId)`、`listAttachedEvidenceByItemResponseId(itemResponseId)`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估执行、计分、报告或科研导出等后端业务模块内部读取媒体证据元数据。
- 下游依赖：`MediaEvidence` Mongoose Model。
- 边界：不创建、更新、删除媒体证据；不实现媒体上传、下载、签名 URL、Storage 调用、文件删除、状态流转、图片压缩、OCR、图像识别、手写轨迹解析、自动计分、报告、AI、认证、权限或公开媒体 API。
- 测试覆盖口径：`backend\src\modules\media\services\media-evidence.service.spec.ts`，覆盖 evidence code 规范化、查无返回 `null`、mapper 输出、按题目作答 / 量表实例 / 访视 / 患者读取、attached / locked 过滤读取、schema collection、索引、内嵌子文档 `_id: false` 和关键字段显式类型；不连接真实 MongoDB，不调用 Storage / OSS，测试数据为脱敏人工样例。

- Service 名称：`ScoringService`
- 文件路径：`backend\src\modules\scoring\services\scoring.service.ts`
- 职责边界：提供计分结果快照的内部读取底座；规范化 `scoreResultCode`；按 mapper 输出 `ScoreResultSummary`，不直接返回完整 Mongoose document；提供 `summarizeItemScores()` 通用计分汇总纯函数。
- 当前方法：`normalizeScoreResultCode(scoreResultCode)`、`findScoreResultByCode(scoreResultCode)`、`findLatestScoreResultByScaleInstanceId(scaleInstanceId)`、`listScoreResultsByScaleInstanceId(scaleInstanceId)`、`listScoreResultsByVisitId(assessmentVisitId)`、`listScoreResultsByPatientId(patientId)`、`summarizeItemScores(items)`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估、计分任务、报告或科研导出等后端业务模块内部读取计分结果摘要或复用通用汇总。
- 下游依赖：`ScoreResult` Mongoose Model；`summarizeItemScores()` 不依赖数据库。
- 边界：不创建、更新、删除计分结果；不实现确认、锁定、作废、状态流转、作答提交后自动计分触发、MMSE / MoCA 专用计分规则、认知域结果、报告、AI、认证、权限或公开计分 API；不修改 `ItemResponse`。
- 测试覆盖口径：`backend\src\modules\scoring\services\scoring.service.spec.ts`，覆盖 score result code 规范化、查无返回 `null`、mapper 输出、按量表实例最新读取、按量表实例 / 访视 / 患者列表读取、schema collection、索引、内嵌子文档 `_id: false`、关键字段显式类型，以及 `summarizeItemScores()` 对计入 / 不计入总分、缺失、未评分、需复核、非有限数字、逐步计分和 group score 汇总的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为脱敏人工样例。

- Service 名称：`CognitiveDomainsService`
- 文件路径：`backend\src\modules\cognitive-domains\services\cognitive-domains.service.ts`
- 职责边界：提供认知域结果快照的内部读取底座；规范化 `domainResultCode` 与 `domainCode`；按 mapper 输出 `CognitiveDomainResultSummary`，不直接返回完整 Mongoose document；提供 `summarizeDomainScores()` 通用认知域汇总纯函数。
- 当前方法：`normalizeDomainResultCode(domainResultCode)`、`normalizeDomainCode(domainCode)`、`findDomainResultByCode(domainResultCode)`、`findLatestDomainResultByScaleInstanceId(scaleInstanceId)`、`listDomainResultsByScaleInstanceId(scaleInstanceId)`、`listDomainResultsByScoreResultId(scoreResultId)`、`listDomainResultsByVisitId(assessmentVisitId)`、`listDomainResultsByPatientId(patientId)`、`summarizeDomainScores(items)`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估、计分任务、报告或科研导出等后端业务模块内部读取认知域结果摘要或复用通用汇总。
- 下游依赖：`CognitiveDomainResult` Mongoose Model；`summarizeDomainScores()` 不依赖数据库。
- 边界：不创建、更新、删除认知域结果；不实现确认、锁定、作废、状态流转、作答提交后自动认知域计算触发、MMSE / MoCA 专用认知域映射规则、疾病诊断、AD 风险等级、报告、AI、认证、权限或公开认知域 API；不修改 `ScoreResult` 或 `ItemResponse`。
- 测试覆盖口径：`backend\src\modules\cognitive-domains\services\cognitive-domains.service.spec.ts`，覆盖 domain result code / domain code 规范化、查无返回 `null`、mapper 输出、按量表实例最新读取、按量表实例 / 计分结果 / 访视 / 患者列表读取、schema collection、索引、内嵌子文档 `_id: false`、关键字段显式类型，以及 `summarizeDomainScores()` 对多认知域映射、默认映射、权重、不计入认知域、缺失、未评分、需复核和非有限数字 warning 的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为脱敏人工样例。

- Service 名称：`ReportsService`
- 文件路径：`backend\src\modules\reports\services\reports.service.ts`
- 职责边界：提供临床报告摘要的内部读取底座；规范化 `reportCode`；按 mapper 输出 `ClinicalReportSummary`，不直接返回完整 Mongoose document；提供报告状态转换校验纯函数。
- 当前方法：`normalizeReportCode(reportCode)`、`findReportByCode(reportCode)`、`findLatestReportByVisitId(assessmentVisitId)`、`listReportsByVisitId(assessmentVisitId)`、`listReportsByPatientId(patientId)`、`listReportsByStatus(status)`、`listConfirmedReportsByPatientId(patientId)`、`canTransitionReportStatus(from, to)`、`getAllowedReportStatusTransitions(from)`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估、报告生成、医生复核或科研导出等后端业务模块内部读取临床报告摘要或复用状态校验口径。
- 下游依赖：`ClinicalReport` Mongoose Model；状态转换校验纯函数不依赖数据库。
- 边界：不创建、更新、删除报告；不实现报告生成、医生确认写库、锁定写库、归档写库、更正写库、作废写库、PDF / Word / 打印导出、AI 报告生成、AuditLog、AiAnalysisResult、认证、权限或公开报告 API；不修改 `ScoreResult`、`CognitiveDomainResult`、`ItemResponse`、`MediaEvidence` 或其他既有模型。
- 测试覆盖口径：`backend\src\modules\reports\services\reports.service.spec.ts`，覆盖 report code 规范化、查无返回 `null`、mapper 输出、按访视最新读取、按访视 / 患者 / 状态读取、按患者读取 confirmed / archived / corrected 报告列表、schema collection、索引、内嵌子文档 `_id: false`、关键字段显式类型，以及 `canTransitionReportStatus()` / `getAllowedReportStatusTransitions()` 对 draft、pending_confirmation、confirmed、archived、corrected、voided 的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为脱敏人工样例。

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
- 公开接口：`GET /patients/:patientId/visits`、`POST /patients/:patientId/visits`。
- operatorRole 优先级：doctor > nurse > research_assistant > admin > unknown；客户端不能传入或覆盖 operatorSnapshot。
- 权限：仅 `admin`、`doctor`、`nurse`、`research_assistant`；未认证 401，角色不足 403；没有注册全局 Guard。
- 测试覆盖口径：controller spec 覆盖 Guards / Roles metadata、列表 / 创建参数和角色优先级；DTO spec 覆盖 MongoId、assessmentDate、枚举、分页、日期参数和非白名单服务端字段。

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

## 4. 后续同步规则

- Service 事实以实际代码、模块边界和测试为准。
- 不得将未确认业务流程写成已实现 Service 能力。
- 跨模块调用、事务和一致性要求应在实现后及时补充。
