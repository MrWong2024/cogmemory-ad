# CogMemory AD / 智忆评 后端 API 地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 API 清单与对接摘要，供后续前后端协作、测试和交接使用。

## 2. 当前状态

- 当前报告公开 API 已扩展为既有九个生命周期接口，加 A27 报告版本列表与指定历史详情共十一个；`ClinicalHistoryController` 另提供患者 `assessment-history` 与 A28 `follow-up-trends` 两个只读接口。WP-04 后端范围已完成。
- `AuthModule` 当前新增 `AuthController`，仅暴露最小公开认证 API 底座；主登录态仍为服务端 Session + HttpOnly Cookie，不采用 JWT 主登录态。
- AuthModule 内部 session cookie 名称已统一为 `cogmemory_ad_session`，登录成功下发 HttpOnly Cookie，`SameSite=Lax`，`Path=/`，production 环境启用 `Secure`。
- 当前没有 users controller，没有公开用户管理 API，没有注册、密码重置、角色权限管理、短信验证码、OAuth / SSO 或 JWT 登录 API。
- A12 已新增 `PatientsController` 与 `AssessmentVisitsController`，形成第一组受保护临床业务 API；所有五个接口均显式绑定 `SessionAuthGuard`、`RolesGuard` 和 `@Roles('admin', 'doctor', 'nurse', 'research_assistant')`。
- 当前已有实例 submission、评分、认知域与报告 generate / latest / edit / submit / confirm / lock / freeze-sources / archive 最小闭环；仍没有认知域人工修改 / 确认 / 锁定 / 重算、报告退回 / 签名 / unlock / unfreeze / unarchive / 更正 / 作废 / PDF、SMS 或 AI / LLM 公开接口。
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

### A19 认知域结果 API

- 接口名称：计算认知域结果
- Method / Path：`POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/cognitive-domain-results/compute`
- Controller / Guard / Roles：`CognitiveDomainResultsController`；显式 `SessionAuthGuard` + `RolesGuard`；`admin`、`doctor`、`nurse`、`research_assistant`；通过 `@CurrentUser()` 取得内部 computedBy
- Param / Body DTO：复用 `ScaleInstanceExecutionParamDto`；`ComputeCognitiveDomainResultDto { confirm }`，只接受 boolean，业务层要求严格 true；客户端 score / domain code / weight / mappingRules / metadata / force / rerun / override 和路径 ID 均由 whitelist 拒绝
- 首次状态：active Patient；Visit 为 draft / in_progress / completed；ScaleInstance completed。来源必须是当前实例 runNo=1、confirmed / locked、confirmedAt 完整、qualityStatus=passed、reviewed、total 完整且 warningCount=0 的 ScoreResult
- 输入绑定：ScoreResult 与 Patient / Visit / Instance / Definition / Version 完整归属；itemCode 集合、countsTowardTotal、min/max 和规范化 cognitiveDomainCodes 与实例绑定 ScaleVersion 完全一致；不读取或重新判定原始作答、图片、手写、expectedValue、scoringRule 或 isCorrect
- mapping：固定 mappingSource=scale_config、mappingMode=item_domain_codes、mappingVersion=`a19-item-domain-codes-1.0`、weight=1；同 item 同 domain 去重，多 domain 采用完整 score / max 重叠归因，不拆分、不平均；domainScores 不可跨 domain 求和解释为量表总分
- 响应：200，`ComputeCognitiveDomainResultResponse { scale, scaleInstance, sourceScoreResult, cognitiveDomainResult, alreadyComputed }`。新建结果 runNo=1、status=computed、reviewStatus=not_required、qualityStatus=unchecked、isFinal=false；computed 不等于 confirmed / locked
- 幂等 / 并发：computed / needs_review / confirmed / locked 返回 alreadyComputed=true，且不重读 ScoreResult 或重算；draft / voided 拒绝。依赖 `{ scaleInstanceId, runNo }` 唯一索引，duplicate key 后重读；不使用 transaction、分布式锁、临时 draft、重算或 runNo=2
- 错误：400 `COGNITIVE_DOMAIN_COMPUTATION_CONFIRMATION_REQUIRED`；401 / 403；404 `PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` / `SCALE_INSTANCE_NOT_FOUND` / `SCORE_RESULT_NOT_FOUND`；409 `PATIENT_NOT_ACTIVE` / `VISIT_NOT_EDITABLE` / `COGNITIVE_DOMAIN_INSTANCE_NOT_COMPUTABLE` / `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE` / `COGNITIVE_DOMAIN_SOURCE_SCORE_NOT_FINAL` / `COGNITIVE_DOMAIN_SOURCE_SCORE_INVALID` / `COGNITIVE_DOMAIN_MAPPING_UNAVAILABLE` / `COGNITIVE_DOMAIN_INPUT_INVALID` / `COGNITIVE_DOMAIN_RESULT_INCOMPLETE` / `COGNITIVE_DOMAIN_RESULT_VOIDED` / `COGNITIVE_DOMAIN_COMPUTATION_CONFLICT`；500 `COGNITIVE_DOMAIN_COMPUTATION_FAILED`
- 安全与非诊断：公开结果不含 subjectCode、作答、评分 / 确认意见、metadata、qualityHints、computedBy、原始 Mixed mappingRules、媒体地址、阈值、正常 / 异常分类或诊断；scorePercent 不是疾病概率

- 接口名称：查询最新认知域结果
- Method / Path：`GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/cognitive-domain-results/latest`
- Controller / Guard / Roles / Param DTO：同 compute；无 Query / Body，不使用 `@CurrentUser()`
- 读取状态：允许 inactive / archived Patient 与 completed / locked / voided Visit / ScaleInstance 历史读取；按完整路径归属和实例绑定版本返回 runNo=1 结果；无结果 404 `COGNITIVE_DOMAIN_RESULT_NOT_FOUND`，draft 409 `COGNITIVE_DOMAIN_RESULT_INCOMPLETE`，voided 允许安全展示
- 响应：200，`CognitiveDomainResultDetailResponse { scale, scaleInstance, sourceScoreResult, cognitiveDomainResult }`；只读不写数据库，不提供重算或历史列表
- mapping / 安全 / 非诊断：与 compute 相同；domainScores 和 itemContributions 稳定排序，mapping policy 明确 overlappingDomains=true 与 domainScoresAreScaleTotalPartition=false

### A20 访视级规则化临床报告 API

- 接口名称：生成规则化临床报告草稿
- Method / Path：`POST /patients/:patientId/visits/:visitId/clinical-reports/generate`
- Controller / Guard / Roles：`ClinicalReportsController`；显式 `SessionAuthGuard` + `RolesGuard`；`admin`、`doctor`、`nurse`、`research_assistant`；通过 `@CurrentUser()` 取得 generation actor
- Param / Body DTO：`ClinicalReportVisitParamDto` 的 patientId / visitId 均 `@IsMongoId()`；`GenerateClinicalReportDto { confirm, primaryScaleInstanceIds }`。confirm 必须严格 true；scope 必须为 1-10 个 trim + lowercase 后唯一 MongoId。客户端 snapshot、source result、narrative、status、report code / version、quality、AI、metadata、force / regenerate / PDF 字段由 whitelist 拒绝
- 首次状态与来源：Patient active；Visit draft / in_progress / completed；所选同访视 ScaleInstance completed / locked 且绑定 definition / version 一致。每个实例必须有 runNo=1 confirmed / locked、confirmedAt 完整、passed / reviewed、全部计分项目最终且无 warning 的 ScoreResult，以及 runNo=1 computed / confirmed / locked、scale_config + item_domain_codes、有效无 warning的 CognitiveDomainResult；不自动 compute / review / confirm
- 媒体：只纳入 selected instance 下 attached / locked、stored、未删除的 photo / handwriting。needs_review 派生报告 needs_review；unusable、所有权 / item / objectKey 缺失或有效证据存储异常返回 `CLINICAL_REPORT_SOURCE_MEDIA_INVALID`。只保存索引快照，不读媒体内容，不做 OCR / 识别 / AI
- 生成结果：HTTP 200，`GenerateClinicalReportResponse { report, alreadyGenerated }`。新建固定 cognitive_assessment / version 1 / draft / system_draft / isFinal=false；reportCode 为确定性 `RPT-{HASH24}`。患者 / 访视 / 历史 scale / confirmed score / domain / evidence 使用受控快照，scoreDetails=null、visit clinicalContext=null；narrative 只有 chief / score / domain / evidence / limitations，明确未医生确认、认知域未独立确认、重叠归因、非诊断、非 AI
- 幂等 / 并发：同 Visit + type + version 只有一个结果；同 scope 返回 alreadyGenerated=true，不重读来源、不修改报告；不同 scope 409 `CLINICAL_REPORT_SCOPE_CONFLICT`；voided 409 `CLINICAL_REPORT_VOIDED`；不完整历史报告 409 `CLINICAL_REPORT_INCOMPLETE`。reportCode unique 处理并发，duplicate key 后重读；仍无结果为 `CLINICAL_REPORT_GENERATION_CONFLICT`。不使用 transaction / 分布式锁，不覆盖、不重生成、不生成 version 2
- 错误：400 `CLINICAL_REPORT_GENERATION_CONFIRMATION_REQUIRED` / `CLINICAL_REPORT_SCOPE_INVALID`；401 / 403；404 `PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` / `SCALE_INSTANCE_NOT_FOUND`；409 patient / visit / configuration / source score / domain / media / existing / scope 错误；500 `CLINICAL_REPORT_GENERATION_FAILED`
- 公开隐私边界：显式 mapper 不返回 patientId / visitId、原始 scope、scoreResultIds、cognitiveDomainResultIds、mediaEvidenceIds、score / domain source ID、mediaEvidenceId / itemResponseId、storageObjectKey、scoreDetails、clinicalContext、metadata、qualityHints、原始作答 / 评分意见、AI provider / model / draftText 或签名

- 接口名称：查询访视最新临床报告
- Method / Path：`GET /patients/:patientId/visits/:visitId/clinical-reports/latest`
- Controller / Guard / Roles：同一 `ClinicalReportsController`、显式 Session / Roles Guard 和四个临床角色；不使用 `@CurrentUser()`
- Param / Body：`ClinicalReportVisitParamDto`；无 Query / Body
- 读取：先确认 Patient 存在，再联合确认 Visit 归属；按 reportVersion、createdAt 倒序读取。允许 active / inactive / archived Patient 和 draft / in_progress / completed / locked / voided Visit 历史读取；允许安全返回 draft / pending_confirmation / confirmed / archived / corrected / voided
- 响应：HTTP 200，`ClinicalReportDetailResponse { report }`；与 generate 使用同一完整安全 mapper；只读不写库。无结果 404 `CLINICAL_REPORT_NOT_FOUND`，关键快照 / timestamps 不可安全读取为 409 `CLINICAL_REPORT_INCOMPLETE`
- 非目标：无 reportId 查询、列表、编辑、pending_confirmation 写流转、医生确认、签名、锁定、归档、更正、作废、重生成、PDF、Storage 文件、AI、诊断阈值 / 结论或治疗建议

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
- `backend\src\modules\cognitive-domains` 当前通过 `CognitiveDomainResultsController` 暴露 A19 compute / latest；没有人工修改、确认、锁定、作废、重算、历史列表、患者 / 访视级列表或报告 API。
- `backend\src\modules\reports` 当前通过 `ClinicalReportsController` 暴露 A20-A25 的 generate / latest / edit / submit / confirm / lock / freeze-sources / archive / corrections；没有更正列表、cancel、branch、replacement archive、PDF 或 AI API。
- 当前已定义 A12-A20 对应公开 DTO 和响应类型；仍不定义评分 lock / void / 重跑、认知域人工修改 / 确认 / 锁定 / 重算、报告编辑 / 确认 / PDF、SMS、AI / LLM 或批量 / 分片 / 客户端直传契约；A20 未更新 frontend handoff。

## 5. 后续同步规则

- API 事实以实际 Controller、路由配置、DTO 和测试为准。
- 未实现或未确认的接口不得提前写入为已存在。
- 后续 API 变更影响前端时，应按对应任务边界同步前端 API 对接文档。

## A21 ClinicalReport review workflow

### PATCH `/patients/:patientId/visits/:visitId/clinical-reports/:reportId/draft`

- Guard / roles：`SessionAuthGuard` + `RolesGuard`；类级 `admin / doctor / nurse / research_assistant`；使用 `@CurrentUser()`，未认证 401、角色不足 403。
- Params / body：`ClinicalReportResourceParamDto`；`UpdateClinicalReportDraftDto` 只接收必填 doctorOpinion（trim 3-4000）、可选 recommendationText（空串清除，非空 3-4000）、editNote（3-1000）和严格 ISO `expectedUpdatedAt`。
- 状态 / 并发：只允许完整、未锁定 / 归档 / 作废 / 确认的 version 1 cognitive_assessment draft，source 为 system_draft / mixed；原子 filter 包含完整 ownership、type、version、draft 与 updatedAt。
- 响应 / audit：HTTP 200 `UpdateClinicalReportDraftResponse`，含安全完整 report 与 editReceipt。成功后 source=mixed，向 `metadata.a21Edits` 追加 UUID 事件；200 条上限。A20 五段 narrative、scope、快照和来源数据不修改。
- 错误：`PATIENT_NOT_FOUND`、`PATIENT_NOT_ACTIVE`、`VISIT_NOT_FOUND`、`VISIT_NOT_EDITABLE`、`CLINICAL_REPORT_NOT_FOUND / NOT_EDITABLE / INCOMPLETE / VOIDED / METADATA_UNSUPPORTED / EDIT_NO_CHANGES / EDIT_AUDIT_LIMIT_REACHED / EDIT_CONFLICT / EDIT_FAILED`。
- 隐私：不返回 metadata、edit history、previousValues / nextValues、editNote 历史、signatureText；不记录正文或意见。

### POST `/patients/:patientId/visits/:visitId/clinical-reports/:reportId/submit-confirmation`

- Guard / roles：同类级四个患者工作流角色；使用 `@CurrentUser()`。
- Params / body：`ClinicalReportResourceParamDto`；`SubmitClinicalReportForConfirmationDto` 只接收 `confirm=true`、trim 3-2000 submissionNote 与严格 ISO `expectedUpdatedAt`。
- 状态 / readiness：完整 version 1 mixed draft，doctorOpinion 合法、A20 五段 narrative / snapshots / source ID 数组 / generation metadata 完整、qualityStatus 非 failed；只校验报告自身历史快照，不重读评分、认知域或媒体。
- 响应 / audit / 幂等：HTTP 200 `SubmitClinicalReportForConfirmationResponse`；首次进入 pending_confirmation 并写 `a21Submission` UUID 回执。pending 重复请求返回 `alreadySubmitted=true` 且不重写 ID / 时间 / actor / note；confirmed / archived / corrected 在 confirmation 可读时安全幂等；不自动确认。
- 错误：`CLINICAL_REPORT_SUBMISSION_CONFIRMATION_REQUIRED / NOT_READY_FOR_SUBMISSION / SUBMISSION_CONFLICT / SUBMISSION_AUDIT_UNAVAILABLE / SUBMISSION_FAILED`，以及通用 ownership、patient / visit、voided、metadata 错误。
- 边界：不修改 narrative、scope、快照、qualityStatus、confirmation 或 lockedAt；不返回 metadata。

### POST `/patients/:patientId/visits/:visitId/clinical-reports/:reportId/confirm`

- Guard / roles：`SessionAuthGuard` + `RolesGuard`；方法级显式 `@Roles('doctor', 'admin')` 覆盖类级角色；nurse / research_assistant / system 为 403；使用 `@CurrentUser()`。
- Params / body：`ClinicalReportResourceParamDto`；`ConfirmClinicalReportDto` 只接收 `confirm=true`、trim 3-2000 confirmationNote 与严格 ISO `expectedUpdatedAt`，不接收签名、锁定、正文、状态或 metadata。
- 状态 / readiness：首次仅允许完整 pending_confirmation、source=mixed、合法 submission audit / doctorOpinion、qualityStatus 非 failed、confirmation / lockedAt / archivedAt / voidedAt 为空；原子 filter 包含完整 ownership、type、version、pending_confirmation 与 updatedAt。
- 响应 / audit / 幂等：HTTP 200 `ConfirmClinicalReportResponse`；首次写 Schema confirmation 与 `metadata.a21Confirmation` UUID，status=confirmed、qualityStatus=passed、isFinal=true、`alreadyConfirmed=false`。confirmed / archived / corrected 重复确认不写库；历史缺 A21 audit 时 confirmationId=null 并使用安全 Schema fallback。
- 错误：`CLINICAL_REPORT_CONFIRMATION_REQUIRED / NOT_READY_FOR_CONFIRMATION / CONFIRMATION_CONFLICT / CONFIRMATION_AUDIT_UNAVAILABLE / CONFIRMATION_FAILED`，以及通用 ownership、patient / visit、voided、metadata 错误。
- 边界：confirmed 不等于 locked；不设置 signatureText / lockedAt，不修改 narrative、快照或任何来源集合，不生成 PDF / AI。

## A22 ClinicalReport irreversible lock

### POST `/patients/:patientId/visits/:visitId/clinical-reports/:reportId/lock`

- Guard / Roles / actor：类级显式 `SessionAuthGuard` + `RolesGuard`；方法级 `@Roles('doctor', 'admin')`；通过 `@CurrentUser()` 构建 actor，客户端不得提交 actor、lockId 或时间。未认证 401，system / nurse / research_assistant 403。
- Params / body：复用 `ClinicalReportResourceParamDto`；`LockClinicalReportDto` 只接收 `confirm=true`、trim 3-2000 `lockNote`、strict ISO `expectedUpdatedAt`。status、source、quality、lockedAt / lockedBy、confirmation、narrative、snapshots、metadata、force / unlock / archive / PDF / lockSources 等额外字段由 whitelist 拒绝。
- 首次资源 / readiness：V1 继续要求 Patient active、Visit 为 draft / in_progress / completed。任意 V2+ 只在服务端确认完整 A25 线性 replacement lineage 与 Patient / Visit / report ownership，历史 Patient inactive、Visit locked / voided 不阻断。目标 report 必须 confirmed、mixed、passed，confirmation 与 A20 generation / A21 submission / confirmation audit 完整，快照 / 五段 narrative / doctorOpinion 完整，且锁定 / 归档 / 作废字段为空、无 correctionRecords。只验证 ClinicalReport 历史快照，不读取评分、认知域、媒体或其他来源。
- 原子更新：filter 包含 report / patient / visit ownership、type/version、confirmed/mixed/passed、lockedAt / lockedBy / archivedAt / archivedBy / voidedAt / voidedBy=null、空 correctionRecords、updatedAt=expectedUpdatedAt；单次 `findOneAndUpdate({ new: true, runValidators: true })` 只 `$set` lockedAt、lockedBy、metadata。未命中后重读；仍可锁但 updatedAt 改变返回 409 `CLINICAL_REPORT_LOCK_CONFLICT`。
- 成功 / 状态：HTTP 200。status 继续 confirmed、qualityStatus 继续 passed、isFinal 继续 true；confirmation、reportCode / version、narrative、快照和来源资源不变。锁定是正交不可逆事实，不新增 locked status，也不等于 archive。
- audit / metadata：`metadata.a22Lock` 只写一次，version=1，包含服务端 UUID lockId、lockedAt、认证 actor ID/name/doctor-or-admin role 与 trim lockNote；保留 A20/A21 和未知顶层 namespace，不创建 AuditLog、不记录来源内容。
- 响应：`LockClinicalReportResponse { report, lockReceipt }`。report 保留 top-level lockedAt 并新增安全 `lock` 摘要；receipt 返回 lockId、lockedAt、安全 lockedBy actor、可选 lockNote、alreadyLocked。响应不含 metadata、Schema 原始 lockedBy、Session、currentUser、signatureText 或完整审计历史。
- 幂等 / fallback：已锁定 confirmed / archived / corrected 返回 200、alreadyLocked=true，不写库，不要求 expectedUpdatedAt 匹配，不改变锁定事实。合法 a22Lock 返回原审计；历史只有完整 lockedAt + lockedBy 时 lockId=null、actor role=unknown，不猜 name / note；锁定字段残缺或 a22Lock 非法 / 不一致返回 409 `CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE`。
- 业务错误：400 `CLINICAL_REPORT_LOCK_CONFIRMATION_REQUIRED` / DTO validation；404 `PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` / `CLINICAL_REPORT_NOT_FOUND`；非法或不完整 V2+ 双向 lineage 为 409 `CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID`；其余 409 保留 `PATIENT_NOT_ACTIVE`、`VISIT_NOT_EDITABLE`、`CLINICAL_REPORT_INCOMPLETE`、`CLINICAL_REPORT_VOIDED`、`CLINICAL_REPORT_METADATA_UNSUPPORTED`、`CLINICAL_REPORT_NOT_LOCKABLE`、`CLINICAL_REPORT_LOCK_CONFLICT`、`CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE`；未知持久化失败 500 `CLINICAL_REPORT_LOCK_FAILED`。
- 隐私 / 非目标：日志与错误不含 lockNote、confirmationNote、doctorOpinion、narrative、snapshots、metadata、患者标识、完整 actor、Cookie/token 或 Mongo 细节。没有 unlock / reopen / return / reject / archive / correct / void、transaction、Storage / PDF 或 AI。

## A23 ClinicalReport source freeze

### POST `/patients/:patientId/visits/:visitId/clinical-reports/:reportId/freeze-sources`

- Guard / roles / actor：类级 `SessionAuthGuard` + `RolesGuard`，方法级 `@Roles('doctor', 'admin')`，并使用 `@CurrentUser()`；未认证 401，system / nurse / research_assistant 403。路径复用 `ClinicalReportResourceParamDto`。
- Body / whitelist：`FreezeClinicalReportSourcesDto` 只允许 `confirm=true`、trim 后 3-2000 `freezeNote` 和 strict ISO `expectedUpdatedAt`；source IDs、metadata、actor/time、force、rollback、unfreeze 等额外字段由全局 whitelist 拒绝。缺失或非 true confirmation 返回 `CLINICAL_REPORT_SOURCE_FREEZE_CONFIRMATION_REQUIRED`。
- 首次前置：V1 继续要求 Patient active、Visit 为 draft / in_progress / completed；任意 V2+ 由服务端验证完整双向 A25 lineage 后只要求 Patient / Visit / report ownership，历史 inactive / locked / voided 不阻断。报告必须 confirmed/mixed/passed、已完成自身 A22 锁定且未 archived/voided/corrected，并通过 A20-A22 metadata、快照和 expectedUpdatedAt 校验。
- 精确 scope：只采用报告 primaryScaleInstanceIds、scoreResultIds、cognitiveDomainResultIds、mediaEvidenceIds，并读取这些实例下全部 ItemResponse 后把精确 ID 固化到内部 a23SourceFreeze。不会接受客户端 scope，也不会冻结 scope 外记录。
- 状态 / 恢复：首次原子写 `in_progress` 后依次冻结 ScaleInstance、ItemResponse、ScoreResult、CognitiveDomainResult、MediaEvidence，再重新精确读取验证并原子写 `completed`。已由前序版本冻结且与当前 scope 完整兼容的共享来源只计入 previouslyFrozen / completed，不再次写 status、lockedAt、updatedAt 或首次事实。无 transaction 或 rollback；中断后以原 freezeId / note / startedBy / scope 恢复。completed 重复请求允许旧 expectedUpdatedAt，返回 `alreadyFrozen=true`；恢复完成返回 `resumedExisting=true`。
- Response：HTTP 200 `FreezeClinicalReportSourcesResponse`，包含安全 `report` 与 `sourceFreezeReceipt`；receipt 含 freezeId、状态、时间、actor、原始 note、expected/completed/newly/previously counts、alreadyFrozen、resumedExisting。report.latest 同步返回安全 sourceFreeze summary。
- 隐私 / 边界：公开响应不含 metadata、scope、ItemResponse IDs 或其他来源 ID；不冻结 Patient、Visit、ScaleDefinition/Version、Storage，不生成 PDF / AI，不创建 AuditLog，不提供 unfreeze。
- 错误族：ownership / Patient / Visit / report not found；非法或不完整 V2+ 双向 lineage 为 409 `CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID`；其余保留 `CLINICAL_REPORT_NOT_SOURCE_FREEZABLE`、`CLINICAL_REPORT_SOURCE_FREEZE_INPUT_INVALID`、`..._SCOPE_INVALID`、`..._CONFLICT`、`..._AUDIT_UNAVAILABLE`、`..._INCOMPLETE`、`..._FAILED` 及既有 metadata / voided 错误。
- 冻结后写保护：A14 ItemResponse 草稿更新、A15 media 上传/作废与 evidenceRefs 变更、A16 ScaleInstance submit、A18 ScoreResult manual-review/confirm 的原子 filter 均包含 `lockedAt: null`；A17/A19/A20-A22 的既有幂等读取/计算不会覆盖锁定事实或 a23SourceFreeze。

## A24 ClinicalReport archive

### POST `/patients/:patientId/visits/:visitId/clinical-reports/:reportId/archive`

- Controller / Guard / Roles / actor：既有 `ClinicalReportsController`；类级 `SessionAuthGuard` + `RolesGuard`，方法级 `@Roles('doctor', 'admin')`，通过 `@CurrentUser()` 构建受控 actor。未认证 401，system / nurse / research_assistant 403；路径复用 `ClinicalReportResourceParamDto`。
- Body / whitelist：`ArchiveClinicalReportDto` 只允许 `confirm=true`、trim 3-2000 `archiveNote`、strict ISO `expectedUpdatedAt`。status / source / quality、归档 / 锁定 / 来源冻结 / confirmation / correction / void 字段、actor / archiveId / time、metadata、force / unarchive / correct / void / createPdf 和路径 ID 均由全局 whitelist 拒绝。缺失、false 或字符串 confirmation 返回 400 `CLINICAL_REPORT_ARCHIVE_CONFIRMATION_REQUIRED`。
- ownership / version：必须存在 Patient、Patient 下 Visit 与同 Patient / Visit 的 report；跨 ownership 按 404 `PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` / `CLINICAL_REPORT_NOT_FOUND`。V1 与任意合法 V2+ 都只把 Patient / Visit 用于存在性与 ownership，Patient inactive、Visit locked / voided 不阻断；V2+ 另由服务端验证完整双向 A25 lineage，A24 不更新 Patient、Visit 或前序 corrected 报告。
- 首次 readiness：report 必须为 cognitive_assessment 正安全整数版本、confirmed / mixed / passed、confirmation 完整且 isFinal 可安全派生为 true；lockedAt / lockedBy 与自身合法 A22 audit 一致；`metadata.a23SourceFreeze` 必须是 counts / actor / scope / completed anchor 均完整的自身 completed 审计；archived / voided 字段为空且 correctionRecords 为空。A24 不重新读取或修改五类来源、Storage 或前序报告。
- 状态 / 原子更新：复用既有 `canTransitionReportStatus('confirmed', 'archived')`；没有新增状态或修改转换表。`archiveReportIfUnmodified()` 单次 `findOneAndUpdate({ new: true, runValidators: true })` filter 包含 ownership、type/version、confirmed/mixed/passed、锁定非空、归档 / 作废空值、空 correctionRecords、updatedAt、A23 completed 与 A24 namespace 不存在；`$set` 只有 status=archived、archivedAt、archivedBy、metadata。
- audit：`metadata.a24Archive` version=1，只写一次，包含服务端 randomUUID archiveId、服务端 archivedAt、认证 actor ID/name/doctor-or-admin role、trim archiveNote、sourceFreezeId 与 sourceFreezeCompletedAt。保留 A20-A23 和未来未知合法 metadata namespace，不保存 Patient / Visit、narrative、A23 scope 或来源 ID。
- response：HTTP 200，`ArchiveClinicalReportResponse { report, archiveReceipt }`。report 继续返回兼容顶层 archivedAt，并新增 nullable `archive` 安全摘要；receipt 返回 archiveId、archivedAt、安全 archivedBy、可选 archiveNote、sourceFreezeId、sourceFreezeCompletedAt、alreadyArchived。status=archived、isFinal=true。
- 幂等 / historical fallback：archived / corrected 且归档事实安全时直接返回 alreadyArchived=true，不写库，不要求 expectedUpdatedAt 与当前值一致，不生成新 ID、不改时间 / actor / note / updatedAt。历史无 a24Archive 但 archivedAt + archivedBy 完整时 archiveId / sourceFreeze anchor=null、role=unknown，不补写 metadata。字段、actor、时间、role、anchor 或 A24 审计不一致为 409 `CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE`。
- 并发 / 错误：非法或不完整 V2+ 双向 lineage 为 409 `CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID`；首次 updatedAt 变化且仍可归档为 409 `CLINICAL_REPORT_ARCHIVE_CONFLICT`；状态、锁定或 sourceFreeze 不满足为 409 `CLINICAL_REPORT_NOT_ARCHIVABLE`；voided 为 `CLINICAL_REPORT_VOIDED`；metadata 根结构不安全为 `CLINICAL_REPORT_METADATA_UNSUPPORTED`；未知持久化失败为 500 `CLINICAL_REPORT_ARCHIVE_FAILED`。不自动重试或覆盖。
- 隐私 / 非目标：响应和错误不含 metadata、Schema 原始 archivedBy、source IDs / A23 scope、archiveNote 日志、Patient 隐私、Session / Cookie / token 或 Mongo 细节。没有 unarchive、恢复 confirmed、correction / void、delete、PDF / Word / Storage 文件或 AI。
- 归档后的既有接口：A20 generate 同 scope 只读返回既有 archived 报告；A21 edit / submit 不恢复可写状态，confirm 依既有 final-status 幂等返回；A22 lock 依既有锁定事实幂等；A23 completed freeze-sources 只读幂等。上述路径均不覆盖 archived status 或 a24Archive。

## A25 ClinicalReport versioned correction

### POST `/patients/:patientId/visits/:visitId/clinical-reports/:reportId/corrections`

- roles：doctor / admin；Body 为 `{ confirm: true, correctionReason, changeSummary, expectedUpdatedAt }`，额外字段由 whitelist 拒绝。
- readiness：source 必须是 ownership 匹配的 latest archived cognitive_assessment，正安全整数版本、mixed / passed / final；A21 confirmation、A22 lock、A23 completed counts、A24 archive 与 freeze anchors 必须完整，且不得有 correction / void / A25 namespace。Patient / Visit 只校验存在与归属。
- version plan：`nextVersion=sourceVersion+1`、`correctionNo=nextVersion-1`、code 使用 patientId / visitId / type / nextVersion 的既有确定性 builder；同 source / version 只允许一个 replacement，碰撞或分支为 409 `CLINICAL_REPORT_CORRECTION_REPLACEMENT_CONFLICT`。
- orchestration：source start 单文档原子写 in_progress → create replacement → duplicate 后精确读取与验证 → 记录 replacement anchor → source complete 单文档原子写 corrected / correctionRecords / completed。不是 transaction，不回滚、不删除 replacement；相同 POST 恢复或 completed 幂等。
- response：`{ sourceReport, replacementReport, correctionReceipt }`；source 安全摘要在 `correction`，replacement 关系在 `replacementOf`。metadata、原始 correctionRecords、来源 ID 与 AuditLog ID 不公开。
- A20 / A21 / A26：generate 与 latest 使用当前 latest；合法 replacement 的 edit / submit / confirm / lock / freeze-sources / archive 仅 doctor/admin，Patient inactive / Visit locked / voided 不阻断。V1 的 A21-A23 资格不放宽；公开 endpoint、DTO 与 response 未变化。
- errors：400 confirmation / DTO；401；403；404 ownership；409 not-correctable / not-latest / conflict / audit-unavailable / replacement-conflict / incomplete；未知持久化失败 500。

## A27 WP-04 后端阶段一历史读取

### GET `/patients/:patientId/assessment-history`

- Controller / 权限：`ClinicalHistoryController`；`SessionAuthGuard` + `RolesGuard`；doctor / nurse / research_assistant / admin；不使用 CurrentUser、Body 或写入。
- DTO：`PatientHistoryParamDto`；`ListPatientAssessmentHistoryQueryDto` 支持 page=1、pageSize=20（1–100）、含边界 ISO `dateFrom/dateTo`、visitType、status 与 trim/lowercase 非空 `scaleCode`；未知 sort/query 400，日期倒置 400 `INVALID_DATE_RANGE`。
- 响应 / 排序：`PatientAssessmentHistoryResponse { items,page,pageSize,total }`；Visit 按 assessmentDate desc、`_id` desc 后分页，scale summary 按 scaleCode / instanceNo / `_id` asc。Score / Domain 只公开资格摘要，缺结果为 null，不重新读取作答、评分或计算认知域。
- ownership / 错误：先校验 Patient；不存在 404 `PATIENT_NOT_FOUND`。inactive / archived Patient 和全部 Visit 历史状态可读；超范围页 200 空 items 且保留真实 total。
- 隐私 / 查询：按 Patient + 可选 scaleCode 先筛 Visit，再对当前页各一次批量读取 ScaleInstance、runNo=1 Score、runNo=1 Domain 和 cognitive_assessment report 轻量投影；不读取 ItemResponse、MediaEvidence、报告 narrative/快照或顶层来源 ID 数组，不输出 ownership、raw/Mixed、reviewer、metadata 或来源内部 ID。

### GET `/patients/:patientId/visits/:visitId/clinical-reports`

- DTO / 权限：复用 `ClinicalReportVisitParamDto` + `ListClinicalReportVersionsQueryDto`（page=1、pageSize=20、max=100）；四个患者工作流角色；reportType 服务端固定 cognitive_assessment。
- 响应：`ClinicalReportVersionListResponse`；完整轻量集合先验证 V1…Vn 和 A25/A26 双向关系，再在内存按 reportVersion / createdAt / `_id` desc 分页。空链为 valid 0/0/0；previous/replacement 只含 reportCode/reportVersion。
- 错误：Patient 404 `PATIENT_NOT_FOUND`；Visit 越界 404 `VISIT_NOT_FOUND`；独立基础/lifecycle 不安全 409 `CLINICAL_REPORT_INCOMPLETE`；重复、缺口、跳版、单边、孤儿、branch/merge 或 anchor 错位 409 `CLINICAL_REPORT_HISTORY_LINEAGE_INVALID`。
- 隐私：轻量投影不加载 narrative、evidence/score/domain 大快照、AI draft 或顶层来源 ID 数组；响应不含 metadata、correction/freeze/archive 内部 ID 或 previous/replacement report ID。

### GET `/patients/:patientId/visits/:visitId/clinical-reports/:reportId`

- 路由 / DTO：静态 `latest` 先于动态 `:reportId`；`ClinicalReportHistoryParamDto` 校验三个 MongoId。四角色只读，不改变 existing latest。
- ownership / 状态：按 Patient → Patient 下 Visit → 同 Patient/Visit/type report 校验；跨归属统一 404 `CLINICAL_REPORT_NOT_FOUND`。允许六种报告状态、三种 Patient 状态和全部 Visit 状态。
- 响应 / 完整性：原样复用 `ClinicalReportDetailResponse`、`ClinicalReportPublicMapper` 与现有 readable report 完整性；目标报告不完整为 409 `CLINICAL_REPORT_INCOMPLETE`，不附版本列表或内部 lineage。

## A28 WP-04 后端阶段二基础随访趋势

### GET `/patients/:patientId/follow-up-trends`

- Controller / 权限：`ClinicalHistoryController`；`SessionAuthGuard` + `RolesGuard`；doctor / nurse / research_assistant / admin；不使用 CurrentUser、Body 或任何写入。inactive / archived Patient 与 Visit 全部历史状态可读。
- DTO：复用 `PatientHistoryParamDto`；`GetPatientFollowUpTrendQueryDto` 要求 trim/lowercase 非空 `scaleCode`，支持含边界严格 ISO `dateFrom/dateTo` 与 `maxPoints=50`（integer 2–100）；未知 query、无效日期或倒置日期为 400 `INVALID_DATE_RANGE` / 全局 DTO 错误。
- 响应 / 排序：`PatientFollowUpTrendResponse { scale,range,comparabilityPolicy,points }`；先保留日期范围内每个 Visit，再按 assessmentDate / `_id` asc 输出。空范围 200；超过 `maxPoints` 不截断，409 `FOLLOW_UP_TREND_RANGE_TOO_LARGE`；Patient 404 `PATIENT_NOT_FOUND`，当前 catalog 无可用 scale 为 404 `SCALE_NOT_AVAILABLE`。
- source 语义：每个 Visit 对目标量表 0 个实例为 `source_missing`，多个为 `source_ambiguous`；Visit/instance/Score void、非 final、ownership / quality / time / total / exact trace 不完整分别保守映射为 `source_voided | source_not_final | source_incomplete`。只有唯一且完整的 confirmed/locked Score 为 `available`；Domain 缺失或不完整不会抹掉可用总分。
- 比较语义：只比较当前点与紧邻前一点，不跨越缺失点；方向固定 `current_minus_immediately_previous`，不舍入。总分要求 scale code/version、CRF、scoring rule、field encoding、administration mode 与 min/max exact 一致；Domain 另要求 mapping version/source/mode/set exact，并按 domain range / weightedMax/null 语义给出 comparable、partially_comparable、not_comparable 或 unavailable。reason 顺序稳定，`scorePercent` 明确不是概率。
- 隐私 / 查询：先校验 Patient 与当前 catalog，再一次读取 `maxPoints+1` 个轻量 Visit；非空范围各一次批量读取 ScaleInstance、ScoreResult、CognitiveDomainResult，纯 evaluator/comparability/mapper 组装。响应不含 Patient identity、ownership ID、内部 source / definition / version ID、raw answer、reviewer/opinion、metadata、report/narrative、media/storage、AI 或诊断字段；不读取 ItemResponse 或 ClinicalReport。
