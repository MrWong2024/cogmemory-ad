# CogMemory AD / 智忆评 后端 Service 职责地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 Service 职责边界、调用关系、事务要求和测试覆盖口径。

## 2. 当前状态

- 当前存在公共底座 Service / Provider，以及 `scales`、`patients`、`assessments`、`media`、`scoring`、`cognitive-domains`、`reports`、`users`、`auth` 内部读取或认证底座 Service；`scales` 还包含 MMSE / MoCA 初始配置 seed 只读 Service，`assessments` 还包含评估执行初始化内部编排 Service，`auth` 还包含 session 认证 Guard 和角色 Guard 底座。
- 当前没有医生、SMS 或 LLM Service；`ScalesService`、`ScaleSeedDataService`、`PatientsService`、`AssessmentsService`、`AssessmentExecutionService`、`MediaEvidenceService`、`ScoringService`、`CognitiveDomainsService`、`ReportsService`、`UsersService`、`AuthService` 仅为内部模型读取 / seed 读取 / 初始化编排 / 汇总 / 状态校验 / 认证会话底座。

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
- 职责边界：提供患者 / 受试者基础档案的内部读取底座；规范化 `subjectCode`；按 mapper 输出 `PatientSummary`，不直接返回完整 Mongoose document。
- 当前方法：`normalizeSubjectCode(subjectCode)`、`findPatientBySubjectCode(subjectCode)`、`listActivePatients()`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估、报告或科研导出等后端业务模块内部读取患者基础档案。
- 下游依赖：`Patient` Mongoose Model。
- 边界：不创建、更新、删除患者档案；不实现真实患者建档流程；不实现脱敏流程、权限、认证或公开患者管理 API。
- 测试覆盖口径：`backend\src\modules\patients\services\patients.service.spec.ts`，覆盖 `subjectCode` 规范化、查无返回 `null`、mapper 输出、active patient 列表读取、schema collection、索引和关键字段显式类型；不连接真实 MongoDB，测试数据为脱敏人工样例。

- Service 名称：`AssessmentsService`
- 文件路径：`backend\src\modules\assessments\services\assessments.service.ts`
- 职责边界：提供访视、量表实例运行时数据与题目作答数据的内部读取底座；规范化 `visitCode` / `instanceCode` / `itemCode`；按 mapper 输出 `AssessmentVisitSummary` / `ScaleInstanceSummary` / `ItemResponseSummary`，不直接返回完整 Mongoose document。
- 当前方法：`normalizeVisitCode(visitCode)`、`normalizeInstanceCode(instanceCode)`、`normalizeItemCode(itemCode)`、`findVisitByCode(visitCode)`、`listVisitsByPatientId(patientId)`、`findScaleInstanceByCode(instanceCode)`、`listScaleInstancesByVisitId(assessmentVisitId)`、`findItemResponseByScaleInstanceAndItemCode(scaleInstanceId, itemCode)`、`listItemResponsesByScaleInstanceId(scaleInstanceId)`、`listScoredItemResponsesByScaleInstanceId(scaleInstanceId)`、`listItemResponsesByVisitId(assessmentVisitId)`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估执行、计分、报告或科研导出等后端业务模块内部读取访视、量表实例和题目作答。
- 下游依赖：`AssessmentVisit`、`ScaleInstance` 与 `ItemResponse` Mongoose Model。
- 边界：不创建、更新、删除访视、量表实例或题目作答；不实现状态流转、作答提交、媒体证据读写流程、计分、报告、AI、认证、权限或公开评估 API。
- 测试覆盖口径：`backend\src\modules\assessments\services\assessments.service.spec.ts`，覆盖 code 规范化、访视 / 量表实例 / 题目作答查无返回 `null`、mapper 输出、列表读取、schema collection、索引、内嵌子文档 `_id: false` 和关键字段显式类型；不连接真实 MongoDB，测试数据为脱敏人工样例。

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
- 上游调用方：当前暂无公开 Controller；`AuthService` 当前调用 `findUserById()` 校验 session 对应用户。
- 下游依赖：`User` Mongoose Model。
- 边界：不创建、更新、删除用户；不实现密码重置、账号禁用、角色矩阵管理、公开用户管理 API、登录接口、登出接口、认证探针、短信验证码、OAuth / SSO、JWT 主登录态或前端认证。
- 测试覆盖口径：`backend\src\modules\users\services\users.service.spec.ts`，覆盖 `User` schema collection、索引、`passwordHash select: false`、枚举 / Date / Number / Mixed 显式类型，覆盖账号 / 邮箱 / 工号规范化、查无返回 `null`、mapper 输出不含 `passwordHash`、凭证查询显式 select `+passwordHash` 且只返回认证必要字段、active 用户列表读取；不连接真实 MongoDB，测试数据为脱敏人工样例。

- Service 名称：`AuthService`
- 文件路径：`backend\src\modules\auth\services\auth.service.ts`
- 职责边界：提供内部密码哈希 / 校验、session token 生成 / hash、session 创建、session 校验、session 撤销和公开认证上下文构建能力。
- 当前方法：`hashPassword(plainPassword)`、`verifyPassword(plainPassword, storedPasswordHash)`、`generateSessionToken()`、`hashSessionToken(rawToken)`、`createSessionForUser(input)`、`validateSessionToken(rawToken)`、`revokeSessionByToken(rawToken)`、`buildPublicAuthUser(user, sessionId?)`。
- 上游调用方：当前暂无公开 Controller；`SessionAuthGuard` 调用 `validateSessionToken()`。
- 下游依赖：`Session` Mongoose Model、`UsersService`、Node.js 内置 `crypto`。
- 边界：不设置 Cookie，不清除 Cookie，不实现登录接口、登出接口、认证探针、公开用户管理 API、短信验证码、OAuth / SSO、JWT 主登录态、max active session 回收、前端认证或权限页面。
- 测试覆盖口径：`backend\src\modules\auth\services\auth.service.spec.ts`，覆盖 `Session` schema collection、索引、`sessionTokenHash select: false`、TTL 索引、ObjectId / Date / Mixed 显式类型，覆盖密码 hash / verify、损坏 hash、session token 随机性、token hash 稳定性、session 创建写入 token hash 而非 raw token、session 不存在 / revoked / expired / 用户不存在 / 用户非 active 返回 `null`、正常返回 `AuthenticatedUserContext` 且不含 passwordHash、raw token 或 token hash；不连接真实 MongoDB，不调用 OSS / Storage / SMS / LLM。

- Guard 名称：`SessionAuthGuard`
- 文件路径：`backend\src\modules\auth\guards\session-auth.guard.ts`
- 职责边界：支持 `@Public()` 路由直通；从 cookie-parser cookies 或原始 `cookie` header 读取 `_session`；调用 `AuthService.validateSessionToken()`；校验成功后挂载 `req.user`，失败抛 `UnauthorizedException`。
- 上游调用方：当前未注册为全局 Guard，未来由具体 Controller 或模块按需启用。
- 下游依赖：`Reflector`、`AuthService`。
- 边界：不下发 Cookie，不清除 Cookie，不改变 `GET /health` 权限，不实现登录 / 登出 / auth me。
- 测试覆盖口径：`backend\src\modules\auth\guards\session-auth.guard.spec.ts`，覆盖 public 路由直通、缺少 Cookie 抛 `UnauthorizedException`、cookie-parser cookies 读取、原始 cookie header 解析、校验成功挂载 `req.user`、校验失败抛 `UnauthorizedException`。

- Guard 名称：`RolesGuard`
- 文件路径：`backend\src\modules\auth\guards\roles.guard.ts`
- 职责边界：读取 `@Roles()` 元数据；无角色要求时直通；有角色要求时基于 `req.user.roles` 校验，角色不足或缺少 `req.user` 时抛 `ForbiddenException`。
- 上游调用方：当前未注册为全局 Guard，未来由具体 Controller 或模块按需启用。
- 下游依赖：`Reflector`。
- 边界：不实现完整权限矩阵，不实现权限管理接口，不改变 `GET /health` 权限。
- 测试覆盖口径：`backend\src\modules\auth\guards\roles.guard.spec.ts`，覆盖无角色要求直通、包含要求角色通过、角色不足抛 `ForbiddenException`、没有 `req.user` 抛 `ForbiddenException`。

## 4. 后续同步规则

- Service 事实以实际代码、模块边界和测试为准。
- 不得将未确认业务流程写成已实现 Service 能力。
- 跨模块调用、事务和一致性要求应在实现后及时补充。
