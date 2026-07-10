# CogMemory AD / 智忆评 后端 API 地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 API 清单与对接摘要，供后续前后端协作、测试和交接使用。

## 2. 当前状态

- 当前公开 API 为 `GET /health`、三个认证 API、A12 五个患者 / 访视 API、A13 三个评估初始化前置 API，以及 A14 的单实例执行详情 GET 与单题草稿 PATCH。
- `AuthModule` 当前新增 `AuthController`，仅暴露最小公开认证 API 底座；主登录态仍为服务端 Session + HttpOnly Cookie，不采用 JWT 主登录态。
- AuthModule 内部 session cookie 名称已统一为 `cogmemory_ad_session`，登录成功下发 HttpOnly Cookie，`SameSite=Lax`，`Path=/`，production 环境启用 `Secure`。
- 当前没有 users controller，没有公开用户管理 API，没有注册、密码重置、角色权限管理、短信验证码、OAuth / SSO 或 JWT 登录 API。
- A12 已新增 `PatientsController` 与 `AssessmentVisitsController`，形成第一组受保护临床业务 API；所有五个接口均显式绑定 `SessionAuthGuard`、`RolesGuard` 和 `@Roles('admin', 'doctor', 'nurse', 'research_assistant')`。
- 当前已有量表安全目录、访视执行详情、量表实例初始化、单实例执行详情和单题草稿保存接口；仍没有整份量表最终提交、批量或自动保存、媒体、计分、认知域、报告、SMS、AI / LLM 或业务上传公开接口。
- 当前 API 事实以实际 Controller、DTO、response type 和对应单元 / E2E 测试为准。

## 3. 当前 API 清单

- 接口名称：健康检查
- Method：`GET`
- Path：`/health`
- 权限：公开
- 请求 DTO：无
- 响应摘要：`{ status: 'ok', service: 'cogmemory-ad-backend' }`
- 错误语义：无专用业务错误码
- 敏感字段：不涉及
- 备注：仅健康检查，不代表业务 API 已实现。

- 接口名称：账号密码登录
- Method：`POST`
- Path：`/auth/login`
- 权限：公开，使用 `@Public()`；不依赖全局 Guard
- 请求 DTO：`LoginDto`
- 请求摘要：`accountName: string`、`password: string`
- 响应摘要：登录成功返回 `{ authenticated: true, user }`，其中 `user` 为 `AuthUserResponse`
- Cookie 语义：登录成功创建服务端 Session，只把 raw session token 写入 HttpOnly `cogmemory_ad_session` Cookie；响应体不返回 raw token
- 错误语义：账号不存在、密码错误、用户非 active 或 session 创建失败统一返回 `401 Unauthorized`，不泄露具体失败原因
- 敏感字段：不返回 `password`、`passwordHash`、raw session token、session token hash、reset token、secret 或 credential

- 接口名称：患者分页列表
- Method：`GET`
- Path：`/patients`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：无
- Query DTO：`ListPatientsQueryDto`；`page` 默认 1、`pageSize` 默认 20 且最大 100；可选 `keyword`、`status`、`sourceType`
- Body DTO：无
- 响应：`PatientListResponse`，结构为 `{ items, page, pageSize, total }`；items 为 `PatientListItemResponse[]`
- 排序：`subjectCode` 升序；不接受客户端自定义排序
- 错误状态：DTO 校验失败 400；未认证 401；角色不足 403
- 错误 code：DTO 校验使用统一 ValidationPipe 语义，无专用业务 code
- 敏感字段边界：不返回 `externalRefs`、`metadata`、数据库内部字段或认证敏感字段；keyword 使用转义后的正则表达式

- 接口名称：创建患者
- Method：`POST`
- Path：`/patients`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：无
- Query DTO：无
- Body DTO：`CreatePatientDto`；允许 `subjectCode`、`displayName`、`sourceType`、`sex`、`birthDate`、`educationYears`、`handedness`、`tags`、`notes`
- 禁止字段：`id`、`_id`、`status`、`externalRefs`、`metadata`、`createdAt`、`updatedAt` 等非白名单字段由全局 ValidationPipe 拒绝
- 响应：201，`PatientDetailResponse`
- 错误状态与 code：DTO 校验失败 400；重复 subjectCode 为 409 / `PATIENT_SUBJECT_CODE_CONFLICT`；未认证 401；角色不足 403
- 敏感字段边界：status 由服务端固定为 `active`；响应不返回 `externalRefs`、`metadata` 或数据库内部字段

- 接口名称：患者详情
- Method：`GET`
- Path：`/patients/:patientId`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：`PatientIdParamDto`，patientId 使用 `@IsMongoId()`
- Query DTO：无
- Body DTO：无
- 响应：200，`PatientDetailResponse`
- 错误状态与 code：patientId 格式无效为 400；患者不存在为 404 / `PATIENT_NOT_FOUND`；未认证 401；角色不足 403
- 敏感字段边界：不返回 `externalRefs`、`metadata`、数据库内部字段或认证敏感字段

- 接口名称：患者访视分页列表
- Method：`GET`
- Path：`/patients/:patientId/visits`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：`PatientVisitsParamDto`，patientId 使用 `@IsMongoId()`
- Query DTO：`ListAssessmentVisitsQueryDto`；`page` 默认 1、`pageSize` 默认 20 且最大 100；可选 `status`、`visitType`、`dateFrom`、`dateTo`
- Body DTO：无
- 响应：`AssessmentVisitListResponse`，结构为 `{ items, page, pageSize, total }`；items 为 `AssessmentVisitListItemResponse[]`
- 排序：`assessmentDate` 倒序、同日期 `_id` 倒序；不接受客户端自定义排序
- 错误状态与 code：DTO / patientId 校验失败 400；日期倒置为 400 / `INVALID_DATE_RANGE`；患者不存在为 404 / `PATIENT_NOT_FOUND`；未认证 401；角色不足 403
- 敏感字段边界：不返回 `clinicalContext`、`metadata`、数据库内部字段或认证敏感字段

- 接口名称：创建患者访视
- Method：`POST`
- Path：`/patients/:patientId/visits`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：`PatientVisitsParamDto`
- Query DTO：无
- Body DTO：`CreateAssessmentVisitDto`；只允许 `visitCode`、`visitType`、`assessmentDate`、`notes`
- 禁止字段：`patientId`、`subjectCode`、`status`、`operatorSnapshot`、`startedAt`、`completedAt`、`lockedAt`、`voidedAt`、`clinicalContext`、`metadata`、`createdAt`、`updatedAt`
- 响应：201，`AssessmentVisitDetailResponse`
- 服务端所有权：patientId 来自路径，subjectCode 来自 Patient，status 固定 `draft`，operatorSnapshot 从当前认证用户生成；operatorRole 优先级为 doctor > nurse > research_assistant > admin > unknown
- 错误状态与 code：DTO / patientId 校验失败 400；患者不存在 404 / `PATIENT_NOT_FOUND`；患者非 active 409 / `PATIENT_NOT_ACTIVE`；重复 visitCode 409 / `VISIT_CODE_CONFLICT`；未认证 401；角色不足 403
- 敏感字段边界：不返回 `clinicalContext`、`metadata`、数据库内部字段、Cookie 或认证凭证

- 接口名称：登出
- Method：`POST`
- Path：`/auth/logout`
- 权限：公开，使用 `@Public()`；允许无效 / 过期 / 缺失 Cookie 也进入清理逻辑
- 请求 DTO：无；从 `cogmemory_ad_session` Cookie 读取 session token
- 响应摘要：固定返回 `{ ok: true, authenticated: false }`
- Cookie 语义：如 Cookie 中存在 raw session token，则内部调用 `AuthService.revokeSessionByToken()`；无论 token 是否存在，都会清除 HttpOnly `cogmemory_ad_session` Cookie
- 错误语义：不泄露 session 是否存在、是否过期或是否已撤销；正常清理语义稳定成功
- 敏感字段：不返回 raw session token、session token hash、secret 或 credential

- 接口名称：当前认证用户
- Method：`GET`
- Path：`/auth/me`
- 权限：使用 `SessionAuthGuard` 显式保护；不注册全局 Guard
- 请求 DTO：无；从 `cogmemory_ad_session` Cookie 校验服务端 Session
- 响应摘要：认证成功返回 `{ authenticated: true, user }`，其中 `user` 为 `AuthUserResponse`
- 错误语义：未登录、session 缺失、session 无效、session 过期、session 撤销、用户不存在或用户非 active 统一返回 `401 Unauthorized`
- 敏感字段：不返回 `password`、`passwordHash`、raw session token、session token hash、reset token、secret 或 credential

- 接口名称：可用量表目录
- Method：`GET`
- Path：`/scales/available`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param / Query / Body DTO：无
- 响应：`AvailableScaleListResponse`，结构为 `{ items }`；当前 items 为经 `validateScaleSeeds()` 校验的 MMSE / MoCA 摘要，包含 code、name、shortName、description、category、version 追溯、totalScoreRange、groupCount、itemCount、capabilities
- 排序：definition sortOrder 升序，相同 sortOrder 时 code 升序
- 写库边界：只读取内存 seed，不查询或写入 `ScaleDefinition` / `ScaleVersion`
- 错误状态与 code：DTO 不涉及；未认证 401；角色不足 403；内置 seed 非法 500 / `SCALE_CATALOG_INVALID`
- 敏感字段边界：不返回完整 groups / items、prompt / instruction、scoringRule、qualityControlRule、reportingRule、researchExportMappings、正确答案 / expectedValue、ObjectId、metadata、Mongoose document 或 `__v`

- 接口名称：患者访视执行详情
- Method：`GET`
- Path：`/patients/:patientId/visits/:visitId`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：`PatientVisitParamDto`；patientId / visitId 均使用 `@IsMongoId()`
- Query / Body DTO：无
- 响应：`AssessmentVisitExecutionDetailResponse`，结构为 `{ visit, scaleInstances }`；visit 对齐 A12 `AssessmentVisitDetailResponse`，scaleInstances 为 `ScaleInstanceListItemResponse[]`
- 归属与排序：先确认患者存在，再以 patientId + visitId 联合查询；跨患者访问同样返回 `VISIT_NOT_FOUND`；实例按 scaleCode、instanceNo 排序
- 错误状态与 code：路径无效 400；未认证 401；角色不足 403；患者不存在 404 / `PATIENT_NOT_FOUND`；访视不存在或不属于患者 404 / `VISIT_NOT_FOUND`
- 敏感字段边界：实例不返回 scaleDefinitionId、scaleVersionId、metadata、qualityControlSummary、ItemResponse 全量数据、Mixed 原始字段、scoringRule、externalRefs、clinicalContext 或 `__v`；progress 由实际 ItemResponse 数量与 answered / scored 状态实时派生，仅输出安全整数 totalItemCount / answeredItemCount，不回写 ScaleInstance.progress

- 接口名称：初始化访视量表实例
- Method：`POST`
- Path：`/patients/:patientId/visits/:visitId/scale-instances`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：`PatientVisitParamDto`
- Body DTO：`InitializeScaleInstanceDto`；只允许 scaleCode、可选 scaleVersion、可选 administrationMode（clinician_administered / supervised_patient_input / paper_import）
- 服务端所有权：patientId / visitId 来自路径，subjectCode 来自 Patient；definition / version 引用由 `ScaleCatalogService` 解析或按需物化；instanceCode 固定为 `INST-{VISIT_ID_UPPERCASE}-{SCALE_CODE_UPPERCASE}-1`，instanceNo 固定 1，status 固定 draft，operatorSnapshot 来自当前认证用户
- 响应：201，`InitializeScaleInstanceResponse`，结构为 `{ scale, scaleInstance, createdItemResponseCount }`；不返回 ItemResponse 全量骨架
- 错误状态与 code：DTO / 路径无效 400；未认证 401；角色不足 403；患者 / 访视 / scale / version 不存在分别为 404 / `PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_NOT_AVAILABLE`、`SCALE_VERSION_NOT_AVAILABLE`；患者非 active、访视不可初始化、目录记录非 active / 冲突、实例重复为 409 / `PATIENT_NOT_ACTIVE`、`VISIT_NOT_INITIALIZABLE`、`SCALE_NOT_ACTIVE`、`SCALE_VERSION_NOT_ACTIVE`、`SCALE_CATALOG_VERSION_CONFLICT`、`SCALE_INSTANCE_ALREADY_EXISTS`；seed 非法或内部初始化失败为 500 / `SCALE_CATALOG_INVALID`、`SCALE_EXECUTION_INITIALIZATION_FAILED`
- 副作用边界：初始化创建 `ScaleInstance` 与对应 seed items 的初始 `ItemResponse` 骨架；不修改访视状态，不设置 startedAt，不启动计时，不保存作答，不创建媒体 / 计分 / 认知域 / 报告结果
- 敏感字段边界：客户端不能提交服务器所有字段；响应不返回完整 seed、scoringRule、expectedValue、metadata、qualityControlSummary、Cookie、token、passwordHash 或数据库内部错误

- 接口名称：量表实例执行详情
- Method：`GET`
- Path：`/patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId`
- Controller：`AssessmentExecutionController`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：`ScaleInstanceExecutionParamDto`；patientId / visitId / scaleInstanceId 均使用 `@IsMongoId()`
- Query / Body DTO：无
- 响应：200，`ScaleInstanceExecutionDetailResponse`，结构为 `{ visit, scale, scaleInstance, groups, itemResponses }`；scaleInstance.progress 为实际派生进度
- 归属与配置：依次确认 Patient、patientId + visitId、patientId + visitId + scaleInstanceId；实例不匹配统一 404，不泄露跨患者 / 跨访视存在性；按实例 scaleCode / scaleVersion 读取已物化 ScaleVersion，缺失或引用不匹配返回 409 / `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE`
- 读取状态：允许 draft / in_progress / completed / locked / voided；只读历史不因患者 inactive / archived 被拒绝
- 题目安全配置：仅返回 itemCode / CRF / title / order / group / responseType / countsTowardTotal / cognitiveDomainCodes、prompt、instruction、scoreRange、evidenceTypes、requiresTimer、photo / handwriting / operator-note flags、草稿、step / prompt 槽位、timing 与 evidenceRequirements
- 错误状态与 code：路径无效 400；未认证 401；角色不足 403；患者不存在 404 / `PATIENT_NOT_FOUND`；访视不存在或不属于患者 404 / `VISIT_NOT_FOUND`；实例不存在或不属于当前链路 404 / `SCALE_INSTANCE_NOT_FOUND`；配置不可用 409 / `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE`
- 敏感字段边界：不返回完整 itemConfigSnapshot、scoringRule、qualityControlRule、reportingRule、researchExportField、expectedValue、正确答案、score、isCorrect、scoreValue、qualityControlHints、metadata、definition / version ObjectId、Mongoose document 或 `__v`

- 接口名称：单题作答草稿保存
- Method：`PATCH`
- Path：`/patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId`
- Controller：`AssessmentExecutionController`
- Guard：`SessionAuthGuard` + `RolesGuard`
- Roles：`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：`ItemResponseDraftParamDto`；四个路径 ID 均使用 `@IsMongoId()`
- Body DTO：`UpdateItemResponseDraftDto`；允许 rawResponse、structuredResponse、responseText、isMissing、missingReason、stepResponses、promptResponses、timing、operatorNote、markAsAnswered
- 禁止字段：item / CRF / group / title / order / responseType / counts / domain / config / version / answerSource / status / score / 正确性 / evidence / metadata / 锁定与作废 / 所有权 ID / timestamps 等服务器字段由全局 whitelist + forbidNonWhitelisted 拒绝；step / prompt 也只能提交定位键与草稿值 / note
- 响应：200，`UpdateItemResponseDraftResponse`，结构为 `{ itemResponse, progress }`；itemResponse 使用与 GET 相同安全 mapper，progress 实时派生
- 状态约束：Patient 必须 active；Visit 与 ScaleInstance 必须 draft / in_progress；ItemResponse 必须 not_started / in_progress / answered。有效草稿使 not_started 进入 in_progress；markAsAnswered=true 且存在有效作答后进入 answered；answered 后编辑不回退；不产生 scored
- 规则边界：isMissing=true 必须提供原因并清除实际作答；stepCode 与 promptType + order 必须命中既有且本次唯一槽位；timing 只允许 requiresTimer 或 duration evidence 题目，durationMs 为有限非负整数且 completedAt 不早于 startedAt；JSON 值递归校验并克隆
- 错误 code：`PATIENT_NOT_FOUND`、`PATIENT_NOT_ACTIVE`、`VISIT_NOT_FOUND`、`VISIT_NOT_EDITABLE`、`SCALE_INSTANCE_NOT_FOUND`、`SCALE_INSTANCE_NOT_EDITABLE`、`ITEM_RESPONSE_NOT_FOUND`、`ITEM_RESPONSE_NOT_EDITABLE`、`ITEM_RESPONSE_EMPTY_PATCH`、`ITEM_RESPONSE_PAYLOAD_INVALID`、`ITEM_RESPONSE_MISSING_REASON_REQUIRED`、`ITEM_RESPONSE_CANNOT_MARK_ANSWERED`、`ITEM_RESPONSE_STEP_NOT_FOUND`、`ITEM_RESPONSE_DUPLICATE_STEP`、`ITEM_RESPONSE_PROMPT_NOT_FOUND`、`ITEM_RESPONSE_DUPLICATE_PROMPT`、`ITEM_RESPONSE_TIMING_NOT_ALLOWED`、`ITEM_RESPONSE_INVALID_TIMING`、`ITEM_RESPONSE_SAVE_FAILED`
- 写库与安全边界：使用单条 ItemResponse 原子更新；不修改 Visit / ScaleInstance 状态或 startedAt，不回写 ScaleInstance.progress，不执行评分，不修改 expectedValue / isCorrect / scoreValue / countsTowardItemScore / countsTowardScore，不记录作答内容到日志

## 4. 当前未暴露接口说明

- `backend\src\modules\users` 当前没有 Controller。
- `UsersService` 仅供后端认证或后续业务模块内部读取系统账号摘要或认证必要字段；当前不暴露用户创建、更新、禁用、重置密码或公开用户管理 API。
- `backend\src\modules\auth` 当前仅有 `AuthController` 的登录、登出和 auth me 三个公开认证 API；不暴露 users me、注册、密码重置、短信验证码、OAuth / SSO、JWT 登录态、角色权限管理或权限矩阵 API。
- `AuthService`、`SessionAuthGuard` 与 `RolesGuard` 仍为认证链路内部底座；`SessionAuthGuard` 与 `RolesGuard` 未注册为全局 Guard，不影响 `GET /health`。
- `backend\src\modules\scales` 当前仅有公开只读 `ScalesController` 的 `GET /scales/available`；不提供完整题目配置、seed 执行、量表管理或版本编辑 API。
- `backend\src\modules\patients` 当前仅通过 `PatientsController` 暴露 A12 三个患者接口；未暴露 PATCH、DELETE 或归档接口。
- `backend\src\modules\assessments` 当前通过 `AssessmentVisitsController` 暴露访视列表、创建、详情和量表实例初始化，通过 `AssessmentExecutionController` 暴露 A14 单实例执行详情与单题草稿 PATCH；`AssessmentExecutionService` 仍为内部初始化能力，不暴露最终提交、批量保存、媒体上传或计分接口。
- `backend\src\modules\media` 当前没有 Controller；`MediaEvidenceService` 仅供后续后端业务模块内部读取媒体证据元数据摘要。
- `backend\src\modules\scoring` 当前没有 Controller；`ScoringService` 仅供后续后端业务模块内部读取计分结果摘要和复用通用计分汇总纯函数。
- `backend\src\modules\cognitive-domains` 当前没有 Controller；`CognitiveDomainsService` 仅供后续后端业务模块内部读取认知域结果摘要和复用通用认知域汇总纯函数。
- `backend\src\modules\reports` 当前没有 Controller；`ReportsService` 仅供后续后端业务模块内部读取临床报告摘要和复用报告状态转换校验纯函数。
- 除 A12 患者 / 访视公开 DTO 和响应类型外，当前不定义量表实例、作答、媒体、计分、认知域、报告、SMS、AI / LLM 或业务上传的前端调用契约；本次未更新 frontend handoff。

## 5. 后续同步规则

- API 事实以实际 Controller、路由配置、DTO 和测试为准。
- 未实现或未确认的接口不得提前写入为已存在。
- 后续 API 变更影响前端时，应按对应任务边界同步前端 API 对接文档。
