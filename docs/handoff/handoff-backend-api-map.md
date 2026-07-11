# CogMemory AD / 智忆评 后端 API 地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 API 清单与对接摘要，供后续前后端协作、测试和交接使用。

## 2. 当前状态

- 当前公开 API 在 A17 清单上新增 A18 的单题 manual-review PATCH 与 ScoreResult confirm POST。
- `AuthModule` 当前新增 `AuthController`，仅暴露最小公开认证 API 底座；主登录态仍为服务端 Session + HttpOnly Cookie，不采用 JWT 主登录态。
- AuthModule 内部 session cookie 名称已统一为 `cogmemory_ad_session`，登录成功下发 HttpOnly Cookie，`SameSite=Lax`，`Path=/`，production 环境启用 `Secure`。
- 当前没有 users controller，没有公开用户管理 API，没有注册、密码重置、角色权限管理、短信验证码、OAuth / SSO 或 JWT 登录 API。
- A12 已新增 `PatientsController` 与 `AssessmentVisitsController`，形成第一组受保护临床业务 API；所有五个接口均显式绑定 `SessionAuthGuard`、`RolesGuard` 和 `@Roles('admin', 'doctor', 'nurse', 'research_assistant')`。
- 当前已有实例 submission readiness / submit 与评分 compute / latest / manual-review / confirm 最小闭环；仍没有撤销 / reopen / lock / void / rerun、批量 / 分片 / 客户端直传、认知域、报告、SMS 或 AI / LLM 公开接口。
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

### A15 媒体证据 API

- 接口名称：题目媒体证据列表
- Method / Path：`GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences`
- Controller：`MediaEvidenceController`
- Guard / Roles：`SessionAuthGuard` + `RolesGuard`；`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：`MediaEvidenceItemParamDto`，四个路径 ID 均使用 `@IsMongoId()`；无 Query / Body
- 响应：200，`MediaEvidenceListResponse { items }`；按 createdAt、_id 升序返回当前题目下 attached / locked / voided 且未 deleted 的安全摘要
- 读取边界：完整验证 Patient -> Visit -> ScaleInstance -> ItemResponse 归属；允许 inactive / archived 患者和 completed / locked / voided 历史访视 / 实例 / 题目只读
- 错误：400 路径校验；401 / 403；404 `PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND`、`ITEM_RESPONSE_NOT_FOUND`
- 敏感字段边界：不返回 patient / visit / instance / item 关联 ID、subjectCode、definition / version ID、itemSnapshot、versionTrace、qualityHints、metadata、objectKey、bucket、objectPrefix、originalFilename、checksum、trajectoryObjectKey、deletedAt 或 Storage 凭据

- 接口名称：上传题目媒体证据
- Method / Path：`POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences`
- Content-Type：`multipart/form-data`；文件字段 `file` 必填、`trajectory` 可选且仅 handwriting；最多 2 个文件、30 个文本字段
- Guard / Roles：`SessionAuthGuard` + `RolesGuard`；`admin`、`doctor`、`nurse`、`research_assistant`
- Param / Body DTO：`MediaEvidenceItemParamDto`；`UploadMediaEvidenceDto`
- Body 摘要：evidenceType 仅 photo / handwriting；captureMode 矩阵为 photo -> photo_upload / paper_scan、handwriting -> tablet_handwriting；允许受控采集、图片和手写轨迹元数据字段，multipart 数字 / boolean 显式安全转换
- 文件限制：主图最大 10 MiB且仅 JPEG / PNG / WebP；trajectory 最大 2 MiB、MIME application/json、trajectoryFormat json / strokes。校验非空、魔数、MIME / 签名一致、JPEG EXIF / XMP、PNG eXIf / tEXt / zTXt / iTXt、WebP EXIF / XMP；不接受 SVG / PDF / HEIC / HEIF
- 状态约束：Patient active；Visit / ScaleInstance draft 或 in_progress；ItemResponse not_started / in_progress / answered；evidenceRefs 必须存在同类型 pending / missing 要求且无当前 attached / locked 证据
- 响应：201，`UploadMediaEvidenceResponse { mediaEvidence, evidenceRequirement }`；绑定后 requirement 为 attached / true，不修改 ItemResponse / ScaleInstance / Visit status，不评分
- 一致性：Storage -> MediaEvidence -> evidenceRef 条件原子绑定；失败只补偿本次 MediaEvidence 和对象，不使用 transaction
- 错误：400 `MEDIA_PRIMARY_FILE_REQUIRED`、`MEDIA_FILE_EMPTY`、`MEDIA_FILE_TYPE_NOT_ALLOWED`、`MEDIA_FILE_SIGNATURE_INVALID`、`MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED`、`MEDIA_TRAJECTORY_INVALID`、`MEDIA_CAPTURE_MODE_INVALID`；413 `MEDIA_FILE_TOO_LARGE`；404 完整归属错误；409 `PATIENT_NOT_ACTIVE`、`VISIT_NOT_EDITABLE`、`SCALE_INSTANCE_NOT_EDITABLE`、`ITEM_RESPONSE_NOT_EDITABLE`、`ITEM_EVIDENCE_TYPE_NOT_REQUIRED`、`MEDIA_EVIDENCE_ALREADY_ATTACHED`；500 `MEDIA_EVIDENCE_CREATE_FAILED` / `MEDIA_EVIDENCE_ATTACH_FAILED`；503 `MEDIA_STORAGE_UNAVAILABLE`
- 服务端所有权与隐私：关联字段、evidenceCode、status、storage、checksum、operatorSnapshot、itemSnapshot、versionTrace 和 metadata 均由服务端生成；不保存或响应原始文件名，objectKey 不包含患者姓名 / 编号 / 病历号 / 联系方式 / 备注

- 接口名称：媒体证据临时访问地址
- Method / Path：`GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences/:mediaEvidenceId/access-url`
- Guard / Roles：`SessionAuthGuard` + `RolesGuard`；`admin`、`doctor`、`nurse`、`research_assistant`
- Param / Query DTO：`MediaEvidenceParamDto`；`MediaEvidenceAccessQueryDto`，asset 仅 primary / trajectory，默认 primary，不接受客户端有效期
- 响应：200，`MediaEvidenceAccessUrlResponse { asset, url, expiresAt }`；调用 `StorageService.getSignedUrl()` 并固定使用 `DEFAULT_SIGNED_URL_EXPIRES_SECONDS`
- 访问边界：完整归属；只允许 attached / locked 且 storageStatus=stored；trajectory 还要求 hasTrajectory 与内部轨迹 key
- 错误：404 完整归属或 `MEDIA_EVIDENCE_NOT_FOUND` / `MEDIA_TRAJECTORY_NOT_FOUND`；409 `MEDIA_EVIDENCE_NOT_ACCESSIBLE`；503 `MEDIA_STORAGE_UNAVAILABLE`
- 敏感字段边界：不返回 objectKey、trajectoryObjectKey、bucket、Storage endpoint 或凭据，返回值不是永久公开 URL

- 接口名称：作废媒体证据
- Method / Path：`POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences/:mediaEvidenceId/void`
- Guard / Roles：`SessionAuthGuard` + `RolesGuard`；`admin`、`doctor`、`nurse`、`research_assistant`
- Param / Body DTO：`MediaEvidenceParamDto`；`VoidMediaEvidenceDto { reason }`，reason trim 后 3-1000；不接受 status、voidedAt、metadata、operatorId、objectKey 或 deleteObject
- 状态与一致性：同上传可编辑状态；仅 attached 且仍由当前 evidenceRef 引用的证据可作废。先条件清除 evidenceRef 为 pending / null，再标记 MediaEvidence voided；后者失败尝试恢复 attached 引用
- 响应：200，`VoidMediaEvidenceResponse { mediaEvidence, evidenceRequirement }`；metadata 仅写 voidReason / voidedBy / voidedAt
- 错误：404 完整归属或 `MEDIA_EVIDENCE_NOT_FOUND`；409 可编辑错误 / `MEDIA_EVIDENCE_NOT_VOIDABLE`；500 `MEDIA_EVIDENCE_VOID_FAILED`
- 删除边界：正常作废不调用 Storage.deleteObject、不物理删除对象；作废记录保留在列表中且不可签名访问，随后允许重新上传；没有原子替换接口

### A16 量表实例提交 API

- 接口名称：量表实例提交完整性检查
- Method / Path：`GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/submission-readiness`
- Controller：`ScaleInstanceSubmissionController`
- Guard / Roles：显式 `SessionAuthGuard` + `RolesGuard`；`admin`、`doctor`、`nurse`、`research_assistant`
- Param DTO：复用 `ScaleInstanceExecutionParamDto`，三个路径字段均 `@IsMongoId()`；无 Query / Body
- 响应：200，`ScaleSubmissionReadinessResponse`；包含安全 `scaleInstance`、checkedAt、ready、canSubmitNow、submissionState / stateReason、summary、blockingIssues、warnings
- 检查：Patient -> Visit -> ScaleInstance 完整归属；definition / version 四项绑定；期望 / 实际 itemCode 集合；全部题目含 countsTowardTotal=false 项的完成状态；有效作答、missing reason、必填 step、计时、photo / handwriting、operatorNote 与 evidenceRef 一致性
- 状态：GET 允许 Patient active / inactive / archived、Visit / Instance 所有历史状态；ready 只表示无 blocking issue，canSubmitNow 还要求 active Patient 与可编辑 Visit / Instance
- issue：稳定返回 `SCALE_INSTANCE_ITEM_SET_MISMATCH`、`ITEM_NOT_COMPLETED`、`ITEM_ANSWER_CONTENT_MISSING`、missing / step / timing / media / note 等受控 code；scale scope 在前、item 按 order / code 排序
- 媒体：同时要求 photo / handwriting 时按 one_of，单一类型按 all；只读 ItemResponse.evidenceRefs，不查询 MediaEvidence，不返回 mediaEvidenceId
- 错误：400 路径；401 / 403；404 `PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND`；409 `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE`
- 隐私与副作用：不写数据库；不返回 ItemResponse 全量、作答、missingReason / operatorNote 原文、step / prompt 实际值、expectedValue、scoringRule、分数、mediaEvidenceId、objectKey 或 metadata

- 接口名称：正式提交量表实例
- Method / Path：`POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/submit`
- Controller / Guard / Roles：同 readiness；HTTP 200
- Param / Body DTO：`ScaleInstanceExecutionParamDto`；`SubmitScaleInstanceDto { confirm }`，只接受 boolean，业务层要求严格 `confirm === true`；其他字段由 whitelist + forbidNonWhitelisted 拒绝
- 首次提交：要求 active Patient、draft / in_progress Visit、draft / in_progress ScaleInstance 与无 blocking issue；执行两次实时 readiness 后，以单条条件 `findOneAndUpdate` 完成 ScaleInstance
- 写入：status=completed、服务端 completedAt、受控 startedAt / durationMs、最终 progress、点路径 `metadata.submission`；保留 operatorSnapshot 与其他 metadata，不设置 lockedAt，不修改 Visit / ItemResponse，不执行评分
- 响应：`SubmitScaleInstanceResponse { scaleInstance, submission, readiness }`；submission 包含 submissionId、submittedAt、安全 submittedBy、alreadySubmitted、durationSource，不直接返回 metadata
- 幂等 / 并发：completed 重复提交返回 alreadySubmitted=true，不重写 submissionId / completedAt / durationMs；历史 completed 无 A16 metadata 时使用 completedAt 且 submittedBy=null；原子 miss 重读状态。不使用 Mongo transaction 或分布式锁
- 错误：400 `SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED`；404 归属错误；409 `PATIENT_NOT_ACTIVE`、`VISIT_NOT_EDITABLE`、`SCALE_INSTANCE_NOT_SUBMITTABLE`、`SCALE_INSTANCE_NOT_READY`、`SCALE_INSTANCE_START_TIME_INVALID`、`SCALE_INSTANCE_SUBMISSION_CONFLICT`、`SCALE_INSTANCE_SUBMISSION_AUDIT_UNAVAILABLE`；500 `SCALE_INSTANCE_SUBMISSION_FAILED`
- 非目标：无撤销、reopen、lock、force / ignore issues、访视完成、评分、认知域、报告或 AI

### A17 阶段性评分 API

- 接口名称：计算阶段性评分结果
- Method / Path：`POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/compute`
- Controller：`ScoringController`
- Guard / Roles：显式 `SessionAuthGuard` + `RolesGuard`；`admin`、`doctor`、`nurse`、`research_assistant`
- Param / Body DTO：复用 `ScaleInstanceExecutionParamDto`；`ComputeScoreResultDto { confirm }`，仅接受 boolean 且业务层要求严格 true；客户端分数、itemScores、runNo、状态、规则、force / rerun / override、metadata 等由 whitelist 拒绝
- 首次状态：active Patient；Visit 允许 draft / in_progress / completed，禁止 locked / voided；ScaleInstance 必须 completed。definition / version 四项绑定、ItemResponse 完整 ownership、itemCode 集合和计分项 answered / scored 必须一致
- 评分语义：仅严格 `multi_step_manual` 可自动评分；number / boolean 严格同类型比较，不做字符串匹配或转换。MMSE 步骤分值求和，MoCA 使用真实 correct-step-count aggregationRule。人工 / 未知模式、missing、既有题分进入 reviewQueue；非计分过程项排除
- 响应：200，`ComputeScoreResultResponse { scale, scaleInstance, scoreResult, reviewQueue, alreadyComputed }`。total / group / item 均为 provisional；存在待复核时 scorePercent=null、isComplete=false；A17 新建结果 isFinal=false
- 幂等 / 并发：runNo 固定 1；computed / needs_review / confirmed / locked 返回原结果且 `alreadyComputed=true`；draft 为 409 `SCORE_RESULT_INCOMPLETE`，voided 为 409 `SCORE_RESULT_VOIDED`。duplicate key 后重读恢复；不使用 transaction / 分布式锁，不支持重跑
- 错误：400 `SCORE_COMPUTATION_CONFIRMATION_REQUIRED`；404 `PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` / `SCALE_INSTANCE_NOT_FOUND`；409 `PATIENT_NOT_ACTIVE` / `VISIT_NOT_EDITABLE` / `SCORE_INSTANCE_NOT_COMPUTABLE` / `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE` / `SCORE_INPUT_INVALID` / `SCORE_RESULT_INCOMPLETE` / `SCORE_RESULT_VOIDED` / `SCORE_COMPUTATION_CONFLICT`；500 `SCORE_COMPUTATION_FAILED`
- 安全边界：不返回作答、expectedValue、scoringRule、正确答案 / isCorrect、ItemResponse.score、媒体地址、metadata / qualityHints 或 reviewer；不修改 Patient / Visit / Instance / ItemResponse，不创建认知域结果或报告

- 接口名称：查询最新阶段性评分结果
- Method / Path：`GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/latest`
- Controller / Guard / Roles / Param DTO：同 compute；无 Query / Body
- 读取状态：允许 inactive / archived Patient 及 completed / locked / voided Visit、ScaleInstance 历史读取；无结果 404 `SCORE_RESULT_NOT_FOUND`，draft 409 `SCORE_RESULT_INCOMPLETE`，computed / needs_review / confirmed / locked 返回安全结果，voided 允许安全展示
- 响应：200，`ScoreResultDetailResponse { scale, scaleInstance, scoreResult, reviewQueue }`；只读不写数据库，不提供重跑或多 run 查询
- 隐私边界：与 compute 相同；reviewQueue 仅含安全题目标识和受控原因，按 itemOrder / itemCode 稳定排序

### A18 人工复核与评分确认 API

- 接口名称：人工复核单题得分
- Method / Path：`PATCH /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/:scoreResultId/item-scores/:itemResponseId/manual-review`
- Controller / Guard / Roles：既有 `ScoringController`；显式 `SessionAuthGuard` + `RolesGuard`；`admin`、`doctor`、`nurse`、`research_assistant`；通过 `@CurrentUser()` 取得审计操作者
- Param / Body DTO：`ScoreItemReviewParamDto` 的五个 ID 均 `@IsMongoId()`；`ReviewScoreItemDto { scoreValue, reviewNote, expectedUpdatedAt }`。scoreValue 为 finite number，note trim 后 3-2000，时间为 strict ISO；其他字段由 whitelist 拒绝
- 状态与目标：active Patient；Visit 为 draft / in_progress / completed；ScaleInstance completed；ScoreResult runNo=1 且 status 为 needs_review / computed；仅 countsTowardTotal=true 且 scoreStatus 为 needs_review / manual_scored、itemResponseId 和 ItemResponse / ScaleVersion itemCode 完整匹配的项目可写。auto_scored、not_scored 与过程项返回 `SCORE_ITEM_NOT_REVIEWABLE`
- 分值：事实源为当前绑定 ScaleVersion item scoreRange；验证有限 min / max / 正 step、边界和浮点容差内 step 对齐；0 合法，不转换字符串，不 clamp。错误为 409 `SCORE_MANUAL_VALUE_OUT_OF_RANGE` / `SCORE_MANUAL_VALUE_STEP_INVALID` / `SCORE_INPUT_INVALID`
- 汇总与响应：更新为 manual_scored / operator / includedInTotal=true，保留原 reason；调用 `summarizeItemScores()` 重新派生 total / group / scorePercent、status、scoringSource、review、qualityStatus 与 reviewQueue。返回 200 `ReviewScoreItemResponse`，包含原 detail 与安全 `reviewUpdate { eventId, itemResponseId, reviewedAt, reviewer, pendingItemCount }`
- 审计：向 `metadata.a18ManualReview.events` 追加 randomUUID 事件并保留其他 metadata；每个结果最多 500，达到上限为 409 `SCORE_REVIEW_AUDIT_LIMIT_REACHED`。不接受客户端 metadata，不公开事件数组或 previousScoreValue；非法内部 metadata 写入时为 `SCORE_RESULT_METADATA_UNSUPPORTED`
- 并发：请求 expectedUpdatedAt 对应公开 scoreResult.updatedAt；完整 ownership + runNo=1 + editable status + updatedAt 进入同一次 findOneAndUpdate。原子 miss 且结果仍可编辑为 409 `SCORE_RESULT_REVIEW_CONFLICT`；不自动重试或覆盖，不使用 transaction
- 其他错误：404 `PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` / `SCALE_INSTANCE_NOT_FOUND` / `SCORE_RESULT_NOT_FOUND` / `SCORE_ITEM_NOT_FOUND` / `SCORE_ITEM_REVIEW_TARGET_UNAVAILABLE`；409 状态错误；500 `SCORE_RESULT_REVIEW_FAILED`
- 安全边界：不修改 Patient / Visit / ScaleInstance / ItemResponse / ItemResponse.score / status / step / prompt / evidence / MediaEvidence；不记录分值、意见、作答或患者隐私；响应不含作答、expectedValue、scoringRule、metadata、完整审计或 previousScoreValue

- 接口名称：确认评分结果
- Method / Path：`POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/:scoreResultId/confirm`
- Controller / Guard / Roles：同一 `ScoringController`、显式 Session / Roles Guard、四个临床角色与 `@CurrentUser()`
- Param / Body DTO：`ScoreResultParamDto`；`ConfirmScoreResultDto { confirm, reviewNote, expectedUpdatedAt }`。业务要求 confirm 严格 true，否则 400 `SCORE_RESULT_CONFIRMATION_REQUIRED`；note trim 后 3-2000，expectedUpdatedAt strict ISO，force / ignoreWarnings / totals / metadata 等由 whitelist 拒绝
- 首次确认 readiness：Patient active；Visit draft / in_progress / completed；Instance completed；ScoreResult status=computed、runNo=1、无 needs_review / not_scored 计分项；每项 finite 且 range / step / status-source 合理；实时 `summarizeItemScores()` 与持久化 total / groups / scorePercent 完全一致；A17 computation warning 为空。未就绪为 409 `SCORE_RESULT_NOT_READY_FOR_CONFIRMATION`，warning 为 409 `SCORE_RESULT_CONFIRMATION_WARNINGS_PRESENT`
- 成功与响应：同一 findOneAndUpdate 写 status=confirmed、confirmedAt、reviewed reviewer / final note、qualityStatus=passed、实时 total / group 和 `metadata.a18Confirmation` randomUUID 审计；不改 itemScores、scoringSource / mode、computation / versionTrace，不设置 lockedAt。返回 200 `ConfirmScoreResultResponse` 与安全 confirmationReceipt；qualityStatus=passed 不是诊断结论
- 幂等：confirmed / locked 返回 200、alreadyConfirmed=true，不生成新 confirmationId、不改时间 / 操作者 / 意见。优先读 a18Confirmation，历史无 namespace 时以 confirmedAt + review 安全回退且 confirmationId=null；缺 confirmedAt 为 409 `SCORE_RESULT_CONFIRMATION_AUDIT_UNAVAILABLE`
- 并发：首次确认的完整 ownership + runNo=1 + status=computed + updatedAt 原子过滤不命中且仍可确认时为 409 `SCORE_RESULT_CONFIRMATION_CONFLICT`；不自动覆盖，不使用 transaction
- 其他错误：404 完整归属；409 `SCORE_RESULT_VOIDED` / patient / visit / instance 状态 / metadata 错误；500 `SCORE_RESULT_CONFIRMATION_FAILED`
- 安全与非目标：confirmed 的 isFinal=true 但不 locked；不实现 lock、void、撤销、reopen、重跑、runNo=2、认知域、报告、诊断或 AI

## 4. 当前未暴露接口说明

- `backend\src\modules\users` 当前没有 Controller。
- `UsersService` 仅供后端认证或后续业务模块内部读取系统账号摘要或认证必要字段；当前不暴露用户创建、更新、禁用、重置密码或公开用户管理 API。
- `backend\src\modules\auth` 当前仅有 `AuthController` 的登录、登出和 auth me 三个公开认证 API；不暴露 users me、注册、密码重置、短信验证码、OAuth / SSO、JWT 登录态、角色权限管理或权限矩阵 API。
- `AuthService`、`SessionAuthGuard` 与 `RolesGuard` 仍为认证链路内部底座；`SessionAuthGuard` 与 `RolesGuard` 未注册为全局 Guard，不影响 `GET /health`。
- `backend\src\modules\scales` 当前仅有公开只读 `ScalesController` 的 `GET /scales/available`；不提供完整题目配置、seed 执行、量表管理或版本编辑 API。
- `backend\src\modules\patients` 当前仅通过 `PatientsController` 暴露 A12 三个患者接口；未暴露 PATCH、DELETE 或归档接口。
- `backend\src\modules\assessments` 还通过 `ScaleInstanceSubmissionController` 暴露 A16 两个接口；`AssessmentExecutionService` 仍为内部初始化能力，不暴露批量保存或计分接口。
- `backend\src\modules\media` 当前仅通过 `MediaEvidenceController` 暴露上述四个题目级媒体接口；没有全患者 / 访视 / 实例媒体列表、直接对象 key 下载、永久 URL、物理删除、替换、批量、分片、客户端直传、OCR 或 AI 接口。
- `backend\src\modules\scoring` 当前通过同一 `ScoringController` 暴露 A17 compute / latest 与 A18 manual-review / confirm；没有 lock、void、撤销确认、reopen、重跑、列表、患者级或访视级评分 API。
- `backend\src\modules\cognitive-domains` 当前没有 Controller；`CognitiveDomainsService` 仅供后续后端业务模块内部读取认知域结果摘要和复用通用认知域汇总纯函数。
- `backend\src\modules\reports` 当前没有 Controller；`ReportsService` 仅供后续后端业务模块内部读取临床报告摘要和复用报告状态转换校验纯函数。
- 当前已定义 A12-A18 对应公开 DTO 和响应类型；仍不定义评分 lock / void / 重跑、认知域、报告、SMS、AI / LLM 或批量 / 分片 / 客户端直传契约；本次未更新 frontend handoff。

## 5. 后续同步规则

- API 事实以实际 Controller、路由配置、DTO 和测试为准。
- 未实现或未确认的接口不得提前写入为已存在。
- 后续 API 变更影响前端时，应按对应任务边界同步前端 API 对接文档。
