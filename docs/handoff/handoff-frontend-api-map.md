# CogMemory AD / 智忆评 前端 API 对接地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端对接后端 API 的调用方、请求、响应、错误处理和 UI 映射。

## 2. 当前状态与边界

- B15 继续扩展独立 `clinical-report-api.ts`，在既有访视详情页接入 A25 corrections POST；保留 A20–A24 既有调用。
- A21–A25 写请求均只使用服务端 `report.updatedAt` 作为 `expectedUpdatedAt`，逐字段重建 Body 白名单且不自动重试；更正受控冲突或结果不完整最多自动 latest 一次，不重发原请求或自动恢复。
- B9 新增独立 `frontend\src\features\assessments\api\cognitive-domain-api.ts`，在既有量表实例页接入 A19 latest / compute。
- 认知域仍只调用 A19 latest / compute；报告当前调用 A20 latest / generate、A21 edit / submit / confirm 与 A22 lock，不调用其他认知域或报告未来 API，也不调用 AI API。
- API Client 使用 `frontendEnv.apiBaseUrl` 作为后端基础地址。
- 所有请求统一使用 `credentials: 'include'`，由浏览器携带或接收 HttpOnly Cookie。
- 所有认证、患者和访视请求使用 `cache: 'no-store'`。
- 前端不读取 Cookie，不保存 token，不使用 JWT，也不记录密码或认证响应体。
- 当前没有 BFF 代理；B1-B11 按明确任务口径由浏览器直接请求既有公开 API base URL。

## 3. 环境变量读取

- 调用方：`frontend\src\lib\env.ts`
- 读取项：既有 `NEXT_PUBLIC_API_BASE_URL`
- 安全默认值：`http://localhost:5002`
- 导出对象：`frontendEnv.apiBaseUrl`
- B1-B8 未新增、删除或修改环境变量与环境变量文件。

## 4. 当前 API 对接清单

### 4.1 `login()` -> `POST /auth/login`

- Client：`frontend\src\features\auth\api\auth-api.ts`
- 调用方：`LoginForm`
- 请求：`{ accountName: string, password: string }`，`Content-Type: application/json`
- 响应：`{ authenticated: true, user: AuthUserResponse }`
- 凭证策略：`credentials: 'include'`
- 错误处理：`401` 映射为 `invalid_credentials`；其他非 2xx、网络错误或无效 JSON 映射为稳定的认证服务不可用错误。
- UI 映射：`401` 统一显示“账号或密码错误，或账号不可用。”；其他错误显示“暂时无法连接认证服务，请稍后再试。”。
- 成功行为：`router.replace('/dashboard')`。
- 安全边界：密码只存在于即时请求体，不进入 React state、URL、日志、localStorage 或 sessionStorage。

### 4.2 `logout()` -> `POST /auth/logout`

- Client：`frontend\src\features\auth\api\auth-api.ts`
- 调用方：`useAuth().signOut()`，由 `AuthDashboard`、`PatientsWorkspaceShell` 触发
- 请求：无业务请求体。
- 响应：`{ ok: true, authenticated: false }`
- 凭证策略：`credentials: 'include'`
- 错误处理：非 2xx、网络错误或无效 JSON 映射为稳定的认证服务不可用错误。
- UI 映射：无论服务端请求是否成功，`signOut()` 都清理本地公开认证状态；页面随后返回 `/login`。服务端 Session 与 Cookie 清理由后端负责。

### 4.3 `getMe()` -> `GET /auth/me`

- Client：`frontend\src\features\auth\api\auth-api.ts`
- 调用方：`useAuth()`；当前用于 `LoginForm`、`AuthDashboard` 和 `PatientsWorkspaceShell`
- 请求：无请求体。
- 响应：成功时为 `{ authenticated: true, user: AuthUserResponse }`；`401` 时 Client 返回 `null`。
- 凭证策略：`credentials: 'include'`
- 错误处理：`401` 映射为 unauthenticated；其他非 2xx、网络错误或无效 JSON 映射为 error。
- UI 映射：登录页已认证时进入 `/dashboard`；工作台未认证时返回 `/login`；服务异常时展示重试入口。

### 4.4 `listPatients()` -> `GET /patients`

- Client：`frontend\src\features\patients\api\patients-api.ts`
- 调用方：`PatientsListPage`
- Query：可选 `page`、`pageSize`、`keyword`、`status`、`sourceType`，使用 `URLSearchParams` 构建，不写入空值。
- 响应：`PatientListResponse`，包含公开 `items`、`page`、`pageSize`、`total`。
- 凭证 / 缓存：`credentials: 'include'`、`cache: 'no-store'`；GET 支持 `AbortSignal`，筛选变化与卸载会取消旧请求。
- loading / 空态：首次与列表更新均有文字状态；区分无档案与筛选无结果；分页总页数最少按 1 处理。
- 错误：401 返回 `/login`；403 显示“当前账号没有访问患者档案的权限”；其他 400 显示筛选条件无效；网络错误和未知错误显示稳定重试状态。
- 安全边界：列表只展示公开字段，不包含 externalRefs、metadata、notes 全文或数据库内部字段。

### 4.5 `createPatient()` -> `POST /patients`

- Client：`frontend\src\features\patients\api\patients-api.ts`
- 调用方：`PatientCreateForm`
- 请求：`CreatePatientRequest`，仅包含 `subjectCode`、可选 `displayName`、`sourceType`、`sex`、`birthDate`、`educationYears`、`handedness`、`tags`、`notes`。
- 响应：`PatientDetail`；成功后 `router.replace('/patients/' + id)`。
- 凭证 / 缓存：`credentials: 'include'`、`cache: 'no-store'`、JSON POST；创建请求不自动重试。
- loading / 错误：提交时禁用按钮；401 返回登录页；403 显示无权限；普通 400 映射表单校验提示；409 + `PATIENT_SUBJECT_CODE_CONFLICT` 映射“该患者编号已存在，请更换后重试”；网络错误显示服务暂不可用。
- 安全边界：不提交 id、status、externalRefs、metadata 或 timestamps，不记录请求体 / 响应体。

### 4.6 `getPatient()` -> `GET /patients/:patientId`

- Client：`frontend\src\features\patients\api\patients-api.ts`
- 调用方：`PatientDetailPage`、`AssessmentVisitCreateForm`
- Path：`patientId` 使用 `encodeURIComponent()`；GET 支持 `AbortSignal`。
- 响应：`PatientDetail`，包含列表公开字段及可选 notes。
- 凭证 / 缓存：`credentials: 'include'`、`cache: 'no-store'`。
- loading / 错误：显示患者加载态；401 返回登录页；403 显示无权限；400 映射“患者链接无效”；404 + `PATIENT_NOT_FOUND` 映射“未找到该患者档案”；网络错误提供重试。
- 安全边界：不展示 externalRefs、metadata 或数据库内部字段；访视创建页必须先成功读取患者并确认 active 状态。

### 4.7 `listPatientVisits()` -> `GET /patients/:patientId/visits`

- Client：`frontend\src\features\patients\api\patients-api.ts`
- 调用方：`PatientDetailPage`
- Query：可选 `page`、`pageSize`、`status`、`visitType`、`dateFrom`、`dateTo`；页面 URL 保留日期值，请求时将起始 / 截止日期转为本地整日起止 ISO 时间。
- 响应：`AssessmentVisitListResponse`。
- 凭证 / 缓存：`credentials: 'include'`、`cache: 'no-store'`；GET 支持 `AbortSignal` 与旧请求取消。
- loading / 空态：访视区域独立 loading / error，不抹掉已加载患者详情；区分暂无访视与筛选无结果，支持简单上一页 / 下一页。
- 错误：401 返回登录页；403 显示无权限；400 + `INVALID_DATE_RANGE` 及其他 400 映射稳定筛选提示；404 + `PATIENT_NOT_FOUND` 映射患者不存在；网络错误提供访视区域重试。
- 安全边界：仅展示公开访视字段，不展示 clinicalContext、metadata；访视行只生成 B3 详情路由链接，不在列表页发起初始化调用。

### 4.8 `createPatientVisit()` -> `POST /patients/:patientId/visits`

- Client：`frontend\src\features\patients\api\patients-api.ts`
- 调用方：`AssessmentVisitCreateForm`
- 请求：`CreateAssessmentVisitRequest`，仅包含 `visitCode`、可选 `visitType`、`assessmentDate`、可选 `notes`；`assessmentDate` 由 `datetime-local` 值转换为 ISO 时间点。
- 响应：`AssessmentVisit`；成功后返回患者详情页。
- 凭证 / 缓存：`credentials: 'include'`、`cache: 'no-store'`、JSON POST；创建请求不自动重试。
- loading / 错误：提交时禁用按钮；401 返回登录页；403 显示无权限；其他 400 映射表单校验提示；404 + `PATIENT_NOT_FOUND` 显示患者不存在；409 + `VISIT_CODE_CONFLICT` 映射访视编号冲突；409 + `PATIENT_NOT_ACTIVE` 映射患者非活动状态；Client 仍保留 `INVALID_DATE_RANGE` 稳定映射。
- 安全边界：不提交 patientId、subjectCode、status、operatorSnapshot、状态时间、clinicalContext、metadata 或 timestamps；操作者由后端认证上下文生成。

### 4.9 `listAvailableScales()` -> `GET /scales/available`

- Client：`frontend\src\features\assessments\api\assessment-execution-api.ts`
- 调用方：`AssessmentVisitExecutionPage`，展示由 `ScaleInitializationPanel` 承担。
- 参数 / 请求体：无；GET 支持 `AbortSignal`，与访视详情使用独立 AbortController。
- 响应：`AvailableScaleListResponse`，包含 `AvailableScaleOption[]` 安全摘要。
- 凭证 / 缓存：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`。
- loading：目录区域独立显示加载状态；目录失败不移除已成功加载的访视详情与既有实例；支持单独重试。
- 错误：401 返回 `/login`；403 显示量表目录无权限；500 + `SCALE_CATALOG_INVALID` 映射“量表目录暂时不可用”；网络错误映射评估服务暂不可用；其他错误使用稳定目录加载失败文案。
- 安全字段边界：只读取 code、name、shortName、description、category、version 追溯、totalScoreRange、groupCount、itemCount、capabilities；前端类型不定义完整 groups / items、prompt / instruction、答案、scoringRule、expectedValue、researchExportMappings 或 ObjectId。
- UI 口径：图片、手写、计时等 capabilities 只写成“量表配置包含此类项目”，不表示当前前端已实现对应采集能力。

### 4.10 `getAssessmentVisitExecutionDetail()` -> `GET /patients/:patientId/visits/:visitId`

- Client：`frontend\src\features\assessments\api\assessment-execution-api.ts`
- 调用方：`AssessmentVisitExecutionPage`，实例安全摘要由 `ScaleInstanceList` 展示。
- Path：patientId、visitId 均来自当前动态路由并使用 `encodeURIComponent()`；两个值不符合 24 位 MongoId 时前端不发送请求。
- 请求体：无；GET 支持 `AbortSignal`，重试与组件卸载会取消旧请求。
- 响应：`AssessmentVisitExecutionDetailResponse`，结构为 `{ visit, scaleInstances }`；Date JSON 字段在前端统一建模为 `string | null`。
- 凭证 / 缓存：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`。
- loading：访视详情有独立首次加载和刷新状态；详情失败时不展示量表初始化表单，也不允许发送 POST。
- 400：映射“访视链接无效”；本地 MongoId 校验失败直接显示该状态。
- 401：`router.replace('/login')`，不无限重试。
- 403：显示“当前账号没有访问评估访视的权限”，提供工作台与退出登录入口。
- 404：`PATIENT_NOT_FOUND` 映射患者不存在；`VISIT_NOT_FOUND` 映射访视不存在或不属于当前患者。
- 409 / 500：该 GET 契约未定义业务 409；未知 500 使用稳定加载失败文案，不展示后端 message。
- 网络错误：显示评估服务暂不可用并提供重试。
- 安全字段边界：实例仅读取公开 id、归属摘要、scale / instance 编号、状态、施测方式、版本追溯、状态时间、用时、操作者与 progress；不读取或显示 scaleDefinitionId、scaleVersionId、metadata、qualityControlSummary、ItemResponse、scoringRule 或 expectedValue。

### 4.11 `initializeScaleInstance()` -> `POST /patients/:patientId/visits/:visitId/scale-instances`

- Client：`frontend\src\features\assessments\api\assessment-execution-api.ts`
- 调用方：`AssessmentVisitExecutionPage`，交互由 `ScaleInitializationPanel` 提供。
- Path：patientId、visitId 来自当前动态路由并使用 `encodeURIComponent()`；不进入请求 body。
- 请求体：按白名单重新构造 `{ scaleCode, scaleVersion?, administrationMode? }`；实际页面固定提交目录返回的 code / version 和用户选择的 `clinician_administered`、`supervised_patient_input` 或 `paper_import`。
- 响应：`InitializeScaleInstanceResponse`，结构为 `{ scale, scaleInstance, createdItemResponseCount }`；成功后用服务端 `scaleInstance` 更新并按 scaleCode / instanceNo 排序，展示创建的题目记录骨架数量。
- 凭证 / 缓存：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`、JSON POST；POST 不自动重试、不做乐观创建。
- loading：全页同一时间只允许一个初始化请求；提交中禁用所有目录卡片的 select 和按钮，组件卸载后不 setState。
- 400：`validation` 映射初始化参数无效。
- 401：返回 `/login`；403：切换为访视无权限状态。
- 404：`PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` 切换为对应详情错误；`SCALE_NOT_AVAILABLE` / `SCALE_VERSION_NOT_AVAILABLE` 映射量表或版本不可用并刷新目录。
- 409：`PATIENT_NOT_ACTIVE`、`VISIT_NOT_INITIALIZABLE`、`SCALE_NOT_ACTIVE`、`SCALE_VERSION_NOT_ACTIVE`、`SCALE_CATALOG_VERSION_CONFLICT` 分别映射稳定中文状态；`SCALE_INSTANCE_ALREADY_EXISTS` 显示“当前访视已初始化该量表”并刷新访视详情。
- 500：`SCALE_CATALOG_INVALID` 映射目录暂不可用；`SCALE_EXECUTION_INITIALIZATION_FAILED` 映射初始化失败且不暗示半成品数据；网络错误映射评估服务暂不可用。
- 安全字段边界：请求不包含 patientId、assessmentVisitId、subjectCode、scaleDefinitionId、scaleVersionId、instanceCode、instanceNo、status、operatorSnapshot、状态时间、durationMs、progress、metadata 或 itemResponses；响应不展示 ItemResponse 全量数据、完整 seed、scoringRule、expectedValue、数据库内部错误或认证信息。
- 行为边界：不自动修改访视状态，不跳转题目页面，不开始计时，不保存作答，不触发媒体、计分、认知域、报告或 AI。

### 4.12 `getScaleInstanceExecutionDetail()` -> `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId`

- Client：`frontend\src\features\assessments\api\assessment-execution-api.ts`
- 调用方：`ScaleInstanceExecutionPage`。
- Path：patientId、visitId、scaleInstanceId 均来自 Next 16 动态路由并使用 `encodeURIComponent()`；任一值不符合 24 位 MongoId 时页面不发送 GET。
- 请求体：无；支持 `AbortSignal`，重试或组件卸载时取消旧请求；取消请求不展示服务错误。
- 响应：`ScaleInstanceExecutionDetailResponse`，结构为 `{ visit, scale, scaleInstance, groups, itemResponses }`；Date JSON 字段在前端统一建模为 `string | null`。
- 凭证 / 缓存：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`。
- loading / 401 / 403：loading 使用文字状态；401 返回 `/login`；403 显示无权限，并提供返回访视、患者列表、工作台与退出登录入口。
- 400 / 404 / 409：400 映射量表实例链接无效；`PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND` 分别显示稳定资源不存在状态；409 + `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE` 显示版本配置不可用，不渲染空白题目页。
- 网络 / 500：网络错误显示评估服务暂时不可用并提供手工重试；未知错误不展示后端 message、path、堆栈或数据库信息。
- 安全字段边界：只读取 A14 安全身份、分组、题目配置、草稿、槽位、计时、证据要求和进度；前端类型不定义 itemConfigSnapshot、scoringRule、expectedValue、score、isCorrect、scoreValue、metadata 或 qualityControlHints。

### 4.13 `saveItemResponseDraft()` -> `PATCH /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId`

- Client：`frontend\src\features\assessments\api\assessment-execution-api.ts`
- 调用方：`ScaleInstanceExecutionPage`；单题交互由 `ItemResponseEditor` 及其 step / prompt / timing 子组件提供。
- Path：patientId、visitId、scaleInstanceId、itemResponseId 全部使用 `encodeURIComponent()`，不进入请求体。
- 请求白名单：只允许 `rawResponse`、`structuredResponse`、`responseText`、`isMissing`、`missingReason`、`stepResponses`、`promptResponses`、`timing`、`operatorNote`、`markAsAnswered`。API Client 再次逐字段重建 body，不提交 undefined，不透传 React 状态或完整 ItemResponse。
- 结构化草稿边界：B4 UI 不提供任意 JSON 编辑器；服务端已有非空 structuredResponse 时只显示存在性提示，普通保存不提交该字段并保留服务端值。
- step / prompt：step 仅重建 stepCode、变化的 actualValue / note；prompt 仅重建 promptType、order、变化的 responseAfterPrompt / note；不提交 expectedValue、isCorrect、scoreValue、counts 标识或服务器字段。
- timing：仅重建变化的 startedAt、completedAt、durationMs、timerSource；UI 用秒编辑 duration，提交前转换为非负整数毫秒并校验完成时间不早于开始时间。
- 凭证 / 缓存 / 重试：JSON PATCH，使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`；PATCH 不自动重试，不乐观更新，不批量保存。同一题保存中不并发发送第二个 PATCH。
- 成功响应：`UpdateItemResponseDraftResponse`，结构为 `{ itemResponse, progress }`；页面使用服务端 itemResponse 覆盖当前题、清除 dirty，并用 progress 更新顶部和实例摘要，不重新加载整页或修改 Visit / ScaleInstance 状态。
- 400：普通 DTO 校验映射 validation；A14 业务 code 映射 `ITEM_RESPONSE_EMPTY_PATCH`、`ITEM_RESPONSE_PAYLOAD_INVALID`、`ITEM_RESPONSE_MISSING_REASON_REQUIRED`、`ITEM_RESPONSE_STEP_NOT_FOUND`、`ITEM_RESPONSE_DUPLICATE_STEP`、`ITEM_RESPONSE_PROMPT_NOT_FOUND`、`ITEM_RESPONSE_DUPLICATE_PROMPT`、`ITEM_RESPONSE_TIMING_NOT_ALLOWED`、`ITEM_RESPONSE_INVALID_TIMING`。
- 401 / 403：401 返回 `/login`；403 显示稳定无权限保存提示，后端 Guard 仍是最终权限边界。
- 404：`PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND`、`ITEM_RESPONSE_NOT_FOUND` 使用稳定资源不存在 / 重新加载提示，不泄露跨归属资源存在性。
- 409：映射 `PATIENT_NOT_ACTIVE`、`VISIT_NOT_EDITABLE`、`SCALE_INSTANCE_NOT_EDITABLE`、`ITEM_RESPONSE_NOT_EDITABLE`、`ITEM_RESPONSE_CANNOT_MARK_ANSWERED`。
- 500 / 网络：`ITEM_RESPONSE_SAVE_FAILED` 映射稳定保存失败文案；网络错误映射 service_unavailable；PATCH 不自动重试。
- 保存语义：保存草稿只发送变化字段；无变化不发 PATCH 并显示“没有需要保存的更改”。标记完成仅增加 `markAsAnswered: true`，不提交 status；answered 后可继续修改且不会回退。本接口不触发最终提交、评分、媒体、认知域、报告或 AI。
- A14 资源 / 状态 code UI：`PATIENT_NOT_FOUND` -> 患者不存在；`PATIENT_NOT_ACTIVE` -> 当前患者不是活动状态；`VISIT_NOT_FOUND` -> 访视不存在或不属于患者；`VISIT_NOT_EDITABLE` -> 当前访视状态不允许修改；`SCALE_INSTANCE_NOT_FOUND` -> 实例不存在或不属于当前访视；`SCALE_INSTANCE_NOT_EDITABLE` -> 实例状态不允许修改；`SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE` -> 版本配置暂时不可用；`ITEM_RESPONSE_NOT_FOUND` -> 题目记录不存在并提示重新加载；`ITEM_RESPONSE_NOT_EDITABLE` -> 当前题目不可修改。
- A14 草稿 code UI：`ITEM_RESPONSE_EMPTY_PATCH` -> 没有需要保存的修改；`ITEM_RESPONSE_PAYLOAD_INVALID` -> 作答格式无效；`ITEM_RESPONSE_MISSING_REASON_REQUIRED` -> 缺失原因必填；`ITEM_RESPONSE_CANNOT_MARK_ANSWERED` -> 先记录有效作答或缺失原因；`ITEM_RESPONSE_STEP_NOT_FOUND` / `ITEM_RESPONSE_PROMPT_NOT_FOUND` -> 槽位已变化并提示重新加载；`ITEM_RESPONSE_DUPLICATE_STEP` / `ITEM_RESPONSE_DUPLICATE_PROMPT` -> 槽位重复并提示检查；`ITEM_RESPONSE_TIMING_NOT_ALLOWED` -> 本题不允许计时草稿；`ITEM_RESPONSE_INVALID_TIMING` -> 检查开始、完成时间与用时；`ITEM_RESPONSE_SAVE_FAILED` -> 保存失败稍后重试。

### 4.14 `listItemMediaEvidences()` -> `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences`

- Client：`frontend\src\features\assessments\api\media-evidence-api.ts`
- 调用方：`MediaEvidencePanel`；仅当当前实际渲染题目包含 photo / handwriting requirement 时按需调用，不在页面初次加载时批量请求全部题目。
- Path：patientId、visitId、scaleInstanceId、itemResponseId 全部逐段 `encodeURIComponent()`；无 Query / Body。
- 响应：`MediaEvidenceListResponse { items }`，Date JSON 字段按 `string | null` 建模；UI 展示 attached / locked / voided 历史和 A15 安全摘要。
- 凭证 / 缓存 / 取消：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`；支持 AbortSignal，切换分组或卸载取消旧请求，取消不显示服务错误；失败提供手工重试，不自动重试。
- 错误：400 -> 请求参数无效；401 -> `/login`；403 -> 当前账号无媒体权限且不伪装为空列表；404 的 `PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND`、`ITEM_RESPONSE_NOT_FOUND` -> 对应资源不存在并提示重新加载；网络错误 -> 媒体服务暂不可用。
- 隐私边界：公开类型与 UI 不定义或展示内部归属、对象定位、Storage 驱动凭据、原始文件名、校验和、内部 metadata / qualityHints 或删除时间。

### 4.15 `uploadItemMediaEvidence()` -> `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences`

- Client / 调用方：`media-evidence-api.ts`，由 `MediaEvidencePanel` 调用；photo 输入来自 `PhotoEvidenceCapture` 的重编码 JPEG，handwriting 输入来自 `HandwritingEvidenceCanvas` 的最终 PNG 与可选 strokes JSON。
- Path：四个 ID 全部编码且不进入 multipart 文本字段。
- multipart：必填 `file`；handwriting 默认附加 `trajectory`；不手工设置 `Content-Type`，由浏览器生成 boundary。
- FormData 白名单：`evidenceType`、`captureMode`、`capturedAt`、`sourceDevice`、`sourceApp`、`captureNote`、`description`、`operatorNote`、`imageWidth`、`imageHeight`、`orientation`、`pageNo`、`isColor`、`trajectoryFormat`、`strokeCount`、`trajectoryDurationMs`、`canvasWidth`、`canvasHeight`、`deviceType`、`inputTool`、`file`、`trajectory`；数字使用十进制字符串、boolean 使用 `true` / `false`，undefined 和空可选文本不附加。
- 固定文件名：photo 为 `photo-evidence.jpg`，handwriting 为 `handwriting-evidence.png`，trajectory 为 `handwriting-trajectory.json`；不读取或传递源文件名。
- 响应：201 `UploadMediaEvidenceResponse { mediaEvidence, evidenceRequirement }`；以服务端媒体记录合并列表，以 evidenceRequirement 更新同 itemResponseId + evidenceType，清除对应内存媒体草稿；不重新加载整份实例。
- 凭证 / 缓存 / 重试：`credentials: 'include'`、`cache: 'no-store'`；POST 不自动重试、不做覆盖或乐观 attached。同一 itemResponseId + evidenceType 的父级内存写锁阻止分组切换期间的并发写。
- 400 code UI：`MEDIA_PRIMARY_FILE_REQUIRED` -> 请选择 / 生成图片；`MEDIA_FILE_EMPTY` -> 图片为空；`MEDIA_FILE_TYPE_NOT_ALLOWED` -> 格式不支持；`MEDIA_FILE_SIGNATURE_INVALID` -> 内容与格式不一致；`MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED` -> 隐私元数据检查失败；`MEDIA_TRAJECTORY_INVALID` -> 轨迹无效或超限；`MEDIA_CAPTURE_MODE_INVALID` -> 类型与采集方式不匹配；普通 400 -> 参数无效。
- 401 / 403 / 404：401 返回登录；403 显示无媒体权限；`PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND`、`ITEM_RESPONSE_NOT_FOUND` 映射安全资源提示。
- 409 code UI：`PATIENT_NOT_ACTIVE`、`VISIT_NOT_EDITABLE`、`SCALE_INSTANCE_NOT_EDITABLE`、`ITEM_RESPONSE_NOT_EDITABLE` 显示稳定只读原因；`ITEM_EVIDENCE_TYPE_NOT_REQUIRED` 提示要求已变化；`MEDIA_EVIDENCE_ALREADY_ATTACHED` 提示先作废，并重新加载媒体列表、按 attached / locked 事实更新 requirement，不自动重复上传。
- 413 / 500 / 503：`MEDIA_FILE_TOO_LARGE` -> 处理后仍超限；`MEDIA_EVIDENCE_CREATE_FAILED` / `MEDIA_EVIDENCE_ATTACH_FAILED` -> 创建 / 关联失败；`MEDIA_STORAGE_UNAVAILABLE` -> 存储暂不可用并保留本地 Blob / strokes；网络错误 -> 手工稍后重试。
- 隔离边界：上传不触发 A14 PATCH，不修改 answer dirty、progress、题目完成状态、ItemResponse / ScaleInstance / Visit 状态或评分。

### 4.16 `getMediaEvidenceAccessUrl()` -> `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences/:mediaEvidenceId/access-url`

- 调用方：`MediaEvidencePanel` / `MediaEvidencePreview`；仅用户点击预览或轨迹入口时调用，不在列表加载后批量签名。
- Path / Query：五个 ID 全部编码；asset 白名单为 `primary` / `trajectory`，不提交客户端有效期。
- 响应：`MediaEvidenceAccessUrlResponse { asset, url, expiresAt }`；URL 以 evidenceId + asset 缓存在当前组件内存，按 expiresAt 与 30 秒安全余量判断是否复用，解析失败或临近过期时重新请求。
- 凭证 / 缓存 / 取消：`credentials: 'include'`、`cache: 'no-store'`、GET AbortSignal；卸载取消。图片内联使用普通 img 以避免永久远程域名配置，图片和外部链接使用 no-referrer / noreferrer / noopener。
- 错误：401 返回登录；403 显示无权限；404 资源归属、`MEDIA_EVIDENCE_NOT_FOUND`、`MEDIA_TRAJECTORY_NOT_FOUND` 使用稳定提示；409 `MEDIA_EVIDENCE_NOT_ACCESSIBLE` 提示证据状态 / 存储不可访问；503 `MEDIA_STORAGE_UNAVAILABLE` 与网络错误提供手工重试。
- 安全边界：不渲染轨迹 JSON；短期 URL 不写 localStorage、sessionStorage、路由参数、日志或 handoff，不当作永久公开链接，也不返回任何 Storage 内部字段。

### 4.17 `voidItemMediaEvidence()` -> `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences/:mediaEvidenceId/void`

- 调用方：`MediaEvidencePanel`，内联确认 UI 由 `MediaEvidenceList` 提供。
- Path / Body：五个 ID 全部编码；JSON body 只构造 `{ reason }`，trim 后必须 3–1000 字符，不接受空原因或服务端字段。
- 操作边界：仅 attached 且当前页面可编辑时显示；locked / voided / deleted 不允许。POST 不自动重试，同类型父级写锁同时禁用上传与其他作废操作。
- 响应：200 `VoidMediaEvidenceResponse { mediaEvidence, evidenceRequirement }`；以服务端 voided 记录更新列表，将对应 requirement 更新为 pending / false，清除该 evidence 的内存访问 URL，并重新开放上传。历史记录仍保留，语义是作废而非删除。
- 错误：401 返回登录；403 显示无权限；404 归属 / `MEDIA_EVIDENCE_NOT_FOUND` 提示重新加载；409 的患者 / 访视 / 实例 / 题目只读 code 显示稳定原因，`MEDIA_EVIDENCE_NOT_VOIDABLE` 提示刷新列表；500 `MEDIA_EVIDENCE_VOID_FAILED` 显示作废失败；网络错误不自动重试。
- 隔离边界：作废不调用物理删除或替换接口，不触发 A14 PATCH、progress、题目状态、访视 / 实例状态或评分变化。

### 4.18 `getScaleInstanceSubmissionReadiness()` -> `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/submission-readiness`

- Client / 调用方：`assessment-execution-api.ts`，由 `ScaleInstanceExecutionPage` 调用，展示由 `ScaleInstanceSubmissionPanel` 与 `ScaleSubmissionIssueList` 承担。
- Path / 请求：patientId、visitId、scaleInstanceId 全部 `encodeURIComponent()`；无 Query / Body。执行详情成功后独立自动读取；“重新检查”和“检查并准备提交”每次重新读取服务器状态。
- 响应：`ScaleSubmissionReadinessResponse`，包含安全 `scaleInstance`、string `checkedAt`、ready、canSubmitNow、submissionState / 可选 stateReason、summary、blockingIssues 与 warnings；成功只合并 `detail.scaleInstance`，不覆盖 itemResponses、drafts 或 mediaDrafts。
- 凭证 / 缓存 / 取消：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`、AbortSignal。readiness 使用独立 AbortController；新请求取消旧请求，卸载取消，Abort 不显示错误；GET 不自动重试。
- 错误：400 validation；401 返回 `/login`；403 明确显示无检查 / 提交权限且不伪装为空结果；404 `PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND`；409 `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE`；网络 / 未知错误保留题目、作答草稿与媒体区域并提供提交面板手工重试。
- issue UI：前端按全部 15 个受控 code 映射稳定中文主文案；只展示 itemCode、crfCode、itemTitle、itemOrder、groupCode、missingItemCodes、unexpectedItemCodes、missingStepCodes、requiredEvidenceMode、requiredEvidenceTypes 等安全辅助字段。后端 message 仅保留在类型契约中，不作为主要或唯一文案。
- stale / 隔离：A14 PATCH、A15 上传或作废成功后旧结果标记过期；本地输入、媒体列表 GET 和访问 URL GET 不自动读取 readiness。GET 不写数据库，不返回作答原文、正确答案、expectedValue、评分、mediaEvidenceId 或 metadata。

### 4.19 `submitScaleInstance()` -> `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/submit`

- Client / 调用方：`assessment-execution-api.ts` / `ScaleInstanceExecutionPage`；仅在用户完成最新 readiness、满足服务器和本地条件并勾选内联确认后调用。页面加载、readiness 刷新或 completed 历史查看不会调用 POST。
- Path / Body：三个路径 ID 全部编码；`SubmitScaleInstanceRequest` 严格为 `{ confirm: true }`，API Client 再次构造同一白名单，不接受或透传 status、时间、操作者、progress、metadata、score、force、ignoreIssues、itemResponses、evidence、Visit 状态等字段。
- 响应：`SubmitScaleInstanceResponse { scaleInstance, submission, readiness }`；submission 包含 string submittedAt、安全 submittedBy、alreadySubmitted、durationSource 与弱化的 submissionId。成功只替换当前 detail.scaleInstance、readiness 和页面内存 receipt，不修改 detail.visit、itemResponses 或本地草稿，不重新加载或跳转。
- 凭证 / 缓存 / 重试：`credentials: 'include'`、`cache: 'no-store'`、JSON POST。POST 不自动重试；提交期间使用单一写锁禁用题目保存、媒体采集、上传和作废，并在卸载后停止 setState。
- 业务 code：`SCALE_INSTANCE_NOT_SUBMITTABLE`、`SCALE_INSTANCE_NOT_READY`、`SCALE_INSTANCE_START_TIME_INVALID`、`SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED`、`SCALE_INSTANCE_SUBMISSION_CONFLICT`、`SCALE_INSTANCE_SUBMISSION_AUDIT_UNAVAILABLE`、`SCALE_INSTANCE_SUBMISSION_FAILED` 全部映射稳定中文；继续复用 `PATIENT_NOT_ACTIVE`、`VISIT_NOT_EDITABLE`、资源不存在、validation、401 / 403、service_unavailable。
- 错误行为：NOT_READY 自动刷新一次 readiness 但不重提；CONFLICT / NOT_SUBMITTABLE 刷新服务器状态且不重提；START_TIME_INVALID 关闭确认；AUDIT_UNAVAILABLE 显示审计不完整并刷新只读状态，不猜测操作者或时间；SUBMISSION_FAILED / 网络未知保留页面并将 readiness 标记过期，要求手工重新检查。
- 幂等 / 历史：`alreadySubmitted=true` 作为成功处理并切换只读，不重复 POST。completed 初始页面只显示 completedAt；当前会话没有 receipt 时明确只读 API 未提供历史提交操作者，不以 `operatorSnapshot` 冒充。
- 安全边界：没有 force / ignore / override；blocking 不能绕过，warning 不阻断；不修改 Visit 或 ItemResponse，不执行评分、认知域、报告或 AI。

### 4.20 `getLatestProvisionalScoreResult()` -> `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/latest`

- Client / 调用方：`provisional-scoring-api.ts` / `ScaleInstanceExecutionPage`，展示由 `ProvisionalScoringPanel` 及其子组件承担；只在实例为 completed / locked / voided 时自动读取一次，draft / in_progress 不调用。
- Path / 请求：patientId、visitId、scaleInstanceId 全部 `encodeURIComponent()`；无 Query / Body。使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'` 和独立 AbortSignal；新请求取消旧请求，卸载取消，Abort 不显示错误。
- 响应：`ScoreResultDetailResponse { scale, scaleInstance, scoreResult, reviewQueue }`；Date JSON 字段使用 string / null。成功使用响应 ScoreResult 作为事实源并只同步 `detail.scaleInstance`，不覆盖 visit、itemResponses、作答草稿或媒体草稿。
- 状态：loading / no_result / loaded / forbidden / error 独立于执行详情；失败不移除题目、submission 回执或媒体历史。提供手工重试 / 重新加载，不轮询、不自动重试。
- 错误：401 返回 `/login`；403 明确显示无评分权限；400 validation；404 `PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND`、`SCORE_RESULT_NOT_FOUND`；409 `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE`、`SCORE_INPUT_INVALID`、`SCORE_RESULT_INCOMPLETE`。`SCORE_RESULT_NOT_FOUND` 映射正常“尚未计算”状态，`SCORE_RESULT_INCOMPLETE` 显示联系管理员且不自动修复；500 / 网络错误提供评分区域手工重试。
- 历史：computed / needs_review / confirmed / locked / voided 均按服务端事实只读展示；GET 不写数据库，不通过 POST 查询历史，不提供多 run、重算或规则刷新。
- 安全边界：响应类型和 UI 不包含或展示作答、expectedValue、正确答案、scoringRule、ItemResponse.score、媒体地址、metadata / qualityHints 或 reviewer；前端不重新计算 total / group / item / scorePercent / reviewQueue / status / source / quality。

### 4.21 `computeProvisionalScoreResult()` -> `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/compute`

- Client / 调用方：`provisional-scoring-api.ts` / `ScaleInstanceExecutionPage`；仅 completed 实例、Visit 为 draft / in_progress / completed、latest 为 no_result、无本地未保存作答 / 未上传媒体 / 题目保存 / 媒体写入 / B6 submit 时提供首次计算入口。
- 交互：页面加载、latest、readiness 和 B6 submit 均不会自动调用 compute。用户先展开内联说明，再勾选可见 checkbox；只有确认后才发送 POST。当前不支持重算。
- Path / Body：三个路径 ID 全部编码且不进入 body；`ComputeScoreResultRequest` 严格为 `{ confirm: true }`，API Client 再次重建白名单，不接受或透传 runNo、status、scoreResultCode、itemScores、groupScores、totalScore、scoringSource、scoringMode、review、qualityStatus、force / rerun / override、确认 / 锁定字段、score、expectedValue、scoringRule 或 metadata。
- 凭证 / 缓存 / 重试：`credentials: 'include'`、`cache: 'no-store'`、JSON POST。单一 compute 写锁禁用重复操作；POST 不自动重试，组件卸载后不 setState。
- 响应：`ComputeScoreResultResponse { scale, scaleInstance, scoreResult, reviewQueue, alreadyComputed }`。成功直接使用响应结果、只同步 `detail.scaleInstance`，关闭确认，不重载页面、不跳转；不覆盖 Visit / ItemResponse / drafts / mediaDrafts，不调用 A14 PATCH、A15 写接口或 readiness。
- 幂等：`alreadyComputed=false` 显示“阶段性评分计算完成，结果仍未最终确认”；`alreadyComputed=true` 显示此前已有结果且本次未重复计算，作为正常成功处理，不再次 POST。
- 错误状态 / code：400 validation / `SCORE_COMPUTATION_CONFIRMATION_REQUIRED`；401 返回登录；403 显示无权限；404 `PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` / `SCALE_INSTANCE_NOT_FOUND`；409 `PATIENT_NOT_ACTIVE`、`VISIT_NOT_EDITABLE`、`SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE`、`SCORE_INSTANCE_NOT_COMPUTABLE`、`SCORE_INPUT_INVALID`、`SCORE_RESULT_NOT_FOUND`、`SCORE_RESULT_INCOMPLETE`、`SCORE_RESULT_VOIDED`、`SCORE_COMPUTATION_CONFLICT`；500 `SCORE_COMPUTATION_FAILED`；网络 / 其他 500 映射 service_unavailable。
- 错误行为：CONFLICT 与 VOIDED 自动读取一次 latest 但绝不重发 POST；INCOMPLETE 显示管理员处理提示；FAILED 保留页面并只允许用户手工重新加载 latest；后端英文 message 不作为 UI 文案。
- 安全边界：不提交客户端分数、状态或规则，不修改 Visit / ItemResponse / submission readiness，不生成认知域、报告或诊断，不输出请求 / 响应或临床数据到 console。

### 4.22 `reviewScoreItemManually()` -> `PATCH .../score-results/:scoreResultId/item-scores/:itemResponseId/manual-review`

- Client / 调用方：`provisional-scoring-api.ts` / `ScaleInstanceExecutionPage`；交互由 `ManualScoreReviewForm`、`ScoreReviewQueue` 与 `ProvisionalScoreItemList` 承担。
- Path：patientId、visitId、scaleInstanceId、scoreResultId、itemResponseId 全部使用 `encodeURIComponent()`，路径 ID 不进入 body。
- Body 白名单：API Client 重新构造 `{ scoreValue: number, reviewNote: input.reviewNote.trim(), expectedUpdatedAt: string }`；不透传组件草稿、操作者、状态、分数集合、metadata、eventId、force 或 override。
- expectedUpdatedAt：直接来自表单展开时当前 ScoreResult.updatedAt；不使用浏览器时间、computedAt 或 confirmedAt。版本变化后草稿 stale，用户明确基于最新结果继续前不替换基线。
- 凭证 / 缓存 / 重试：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`、JSON PATCH；不自动重试、不自动覆盖、不在冲突后重发。
- 响应：`ReviewScoreItemResponse`，包含完整 `ScoreResultDetailResponse` 与 `reviewUpdate`。页面完整使用 scaleInstance、scoreResult、total / group / item、review、reviewQueue、updatedAt，并把回执保存在当前内存；不自行计算或减少队列。
- 400：DTO / 非白名单字段与 `SCORE_INPUT_INVALID` 映射稳定输入提示；401 返回 `/login`；403 保留已有安全查询与本地输入并显示无权限。
- 404：`PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND`、`SCORE_RESULT_NOT_FOUND`、`SCORE_ITEM_NOT_FOUND`、`SCORE_ITEM_REVIEW_TARGET_UNAVAILABLE`；相关项目错误会刷新一次 latest，不重发 PATCH。
- 409：`PATIENT_NOT_ACTIVE`、`VISIT_NOT_EDITABLE`、`SCORE_INSTANCE_NOT_COMPUTABLE`、`SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE`、`SCORE_RESULT_VOIDED`、`SCORE_RESULT_NOT_REVIEWABLE`、`SCORE_ITEM_NOT_REVIEWABLE`、`SCORE_MANUAL_VALUE_OUT_OF_RANGE`、`SCORE_MANUAL_VALUE_STEP_INVALID`、`SCORE_RESULT_METADATA_UNSUPPORTED`、`SCORE_REVIEW_AUDIT_LIMIT_REACHED`、`SCORE_RESULT_REVIEW_CONFLICT`。冲突 / 状态 / 目标变化刷新 latest；范围、step、审计和 metadata 错误保留本地输入。
- 500 / 网络：`SCORE_RESULT_REVIEW_FAILED`、service_unavailable 与 unknown 均保留输入，只允许手工后续操作。
- 审计与展示边界：公开类型只含 manualReview 最新摘要与当前会话 reviewUpdate；不含原始作答、expectedValue、scoringRule、正确答案、metadata、previousScoreValue 或完整事件历史。

### 4.23 `confirmScoreResult()` -> `POST .../score-results/:scoreResultId/confirm`

- Client / 调用方：`provisional-scoring-api.ts` / `ScaleInstanceExecutionPage`；两步内联交互由 `ScoreResultConfirmationPanel` 承担。
- Path：patientId、visitId、scaleInstanceId、scoreResultId 全部编码，不进入 body。
- Body 白名单：API Client 重新构造 `{ confirm: true, reviewNote: input.reviewNote.trim(), expectedUpdatedAt: string }`；没有 force、ignoreWarnings、lockAfterConfirm、分数、状态、审计或 ownership 字段。
- expectedUpdatedAt：确认区展开时冻结当前 ScoreResult.updatedAt；结果变化会标记 stale、清除 checkbox 并禁止 POST，用户明确重新准备前不替换基线。
- 凭证 / 缓存 / 重试：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`、JSON POST；不自动重试、不 force confirm。
- 响应：`ConfirmScoreResultResponse`，页面完整替换 ScoreResult detail 与 scaleInstance 摘要，保存 confirmationReceipt，关闭确认草稿并进入最终只读；不重载整页，不调用 A14 / A15 / A16 / A17 compute。
- 400：validation 与 `SCORE_RESULT_CONFIRMATION_REQUIRED`；401 返回登录；403 保留安全查询和确认意见并显示无权限；404 映射完整 ownership 资源错误。
- 409：`SCORE_RESULT_VOIDED`、患者 / 访视 / 实例 / 配置状态、`SCORE_RESULT_NOT_READY_FOR_CONFIRMATION`、`SCORE_RESULT_CONFIRMATION_WARNINGS_PRESENT`、`SCORE_RESULT_CONFIRMATION_CONFLICT`、`SCORE_RESULT_CONFIRMATION_AUDIT_UNAVAILABLE`、`SCORE_RESULT_METADATA_UNSUPPORTED`。CONFLICT 保留意见并刷新 latest；NOT_READY 关闭草稿并刷新；warning 不提供忽略入口；审计缺失不猜测记录。
- 500 / 网络：`SCORE_RESULT_CONFIRMATION_FAILED`、service_unavailable 与 unknown 不自动重试；保留意见并允许手工 latest。
- 幂等：alreadyConfirmed=true 作为成功处理，不再次 POST；confirmed / locked 的 latest 直接展示 confirmation 安全摘要，confirmation 为空时不冒充其他操作者。
- 审计与临床边界：只显示 confirmationId、confirmedAt、confirmedBy、reviewNote、alreadyConfirmed；不显示 Session、metadata 或内部历史。confirmed 不等于 locked，qualityStatus=passed 不表示患者正常，不创建认知域或报告。

### 4.24 `getLatestCognitiveDomainResult()` -> `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/cognitive-domain-results/latest`

- Client / 调用方：独立 `cognitive-domain-api.ts`，由 `useCognitiveDomainResult` 调用，展示由 `CognitiveDomainResultPanel` 及三个职责组件承担。
- 自动查询条件：页面已成功取得来源 ScoreResult，实例为 completed / locked / voided，来源评分 status 为 confirmed / locked / voided。评分不存在、latest 评分失败、draft / computed / needs_review 时不请求；B8 confirm 成功后只自动 GET 一次，不自动 POST。
- Path / 请求：patientId、visitId、scaleInstanceId 全部 `encodeURIComponent()`；无 Query / Body。使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'` 和独立 AbortSignal；新请求取消旧请求，卸载取消，Abort 不显示错误。
- 响应：`CognitiveDomainResultDetailResponse { scale, scaleInstance, sourceScoreResult, cognitiveDomainResult }`；Date JSON 字段使用 string / null。结果包含 domainScores、itemContributions、mapping policy / interpretation、computation、review、quality、versionTrace 与来源评分安全摘要，不包含原始作答、评分规则、评分 / 确认意见、metadata 或诊断内容。
- 状态：idle / waiting_for_score / loading / not_found / loaded / forbidden / error 独立于执行详情、readiness 和评分面板。GET 不轮询、不自动重试；失败保留题目、媒体、提交和评分历史并提供手工重试。
- 业务错误：400 validation；401 返回 `/login`；403 为独立无权限，不能伪装成无结果；404 `PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`SCALE_INSTANCE_NOT_FOUND`、`SCORE_RESULT_NOT_FOUND`、`COGNITIVE_DOMAIN_RESULT_NOT_FOUND`；409 `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE`、`COGNITIVE_DOMAIN_INPUT_INVALID`、`COGNITIVE_DOMAIN_RESULT_INCOMPLETE`。not found 是正常 not_found；incomplete 显示管理员处理提示。
- 历史：computed / needs_review / confirmed / locked / voided 按真实 status 与 isFinal 只读展示；voided 允许返回。已有结果只提供重新加载 latest，不提供重新计算，也不通过 POST 查询历史。

### 4.25 `computeCognitiveDomainResult()` -> `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/cognitive-domain-results/compute`

- Client / 调用方：`cognitive-domain-api.ts` / `useCognitiveDomainResult`；仅 latest=not_found、来源评分 confirmed / locked 且 isFinal=true、实例 completed、Visit 为 draft / in_progress / completed、无本地 dirty 或任一题目 / 媒体 / submit / 评分写请求时开放入口。
- 交互：用户先选择“准备计算认知域结果”，阅读完整分值重叠归因、跨域不可求和、scorePercent 非疾病概率和非诊断说明，再勾选可见 checkbox。页面加载、评分确认和 latest 均不会自动调用 compute；不支持重算。
- Path / Body：三个 Path ID 全部编码且不进入 body；`ComputeCognitiveDomainResultRequest` 严格为 `{ confirm: true }`，API Client 再次构造白名单。不接受 scoreResultId、domainResultCode、runNo、status、mappingSource / mode、domainScores、itemContributions、domainCodes、weight / weights、mappingRules、thresholds、diagnosis、metadata、force / rerun / override、confirmResult、createReport 或路径 ID。
- 凭证 / 缓存 / 重试：`credentials: 'include'`、`cache: 'no-store'`、JSON POST。独立 compute 写锁禁止重复操作；POST 不自动重试，组件卸载后不 setState。
- 响应：`ComputeCognitiveDomainResultResponse`，包含完整 detail 与 `alreadyComputed`。成功直接保存 scale、scaleInstance、sourceScoreResult、cognitiveDomainResult 和回执；不覆盖主页面 Visit / ItemResponse / ScoreResult / 草稿，不重载或跳转。
- 幂等：`alreadyComputed=false` 显示计算完成且尚未独立确认；`alreadyComputed=true` 作为正常成功，说明此前已有结果且本次未重复计算，不再次 POST。
- 错误：400 `COGNITIVE_DOMAIN_COMPUTATION_CONFIRMATION_REQUIRED`；401 / 403；404 `PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` / `SCALE_INSTANCE_NOT_FOUND` / `SCORE_RESULT_NOT_FOUND`；409 `PATIENT_NOT_ACTIVE` / `VISIT_NOT_EDITABLE` / `COGNITIVE_DOMAIN_INSTANCE_NOT_COMPUTABLE` / `SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE` / `COGNITIVE_DOMAIN_SOURCE_SCORE_NOT_FINAL` / `COGNITIVE_DOMAIN_SOURCE_SCORE_INVALID` / `COGNITIVE_DOMAIN_MAPPING_UNAVAILABLE` / `COGNITIVE_DOMAIN_INPUT_INVALID` / `COGNITIVE_DOMAIN_RESULT_INCOMPLETE` / `COGNITIVE_DOMAIN_RESULT_VOIDED` / `COGNITIVE_DOMAIN_COMPUTATION_CONFLICT`；500 `COGNITIVE_DOMAIN_COMPUTATION_FAILED`；其他网络 / 500 为 service_unavailable。
- 错误行为：CONFLICT / VOIDED 自动 GET latest 一次但不重发 POST；SOURCE_SCORE_NOT_FINAL / INVALID / SCORE_RESULT_NOT_FOUND 可由用户手工刷新现有评分 latest，绝不自动确认评分；MAPPING_UNAVAILABLE 不提供客户端映射编辑；FAILED 保留全页并只允许用户手工查询 latest。
- 数据隔离：不触发 A14 PATCH、A15 写请求、A16 submit、A17 compute 或 A18 manual-review / confirm；不修改 Visit、ScaleInstance 状态、ItemResponse 或 ScoreResult。结果 computed 不等于 confirmed / locked，不生成报告、诊断或 AI。

### 4.26 `getLatestClinicalReport()` -> `GET /patients/:patientId/visits/:visitId/clinical-reports/latest`

- Client / 调用方：独立 `clinical-report-api.ts`，由 `useClinicalReport` 在访视详情成功后自动查询一次；不依赖量表目录，不轮询、不自动重试，支持报告区域手工重新加载。
- Path / 请求：patientId、visitId 均 `encodeURIComponent()`；无 Query / Body。使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'` 与独立 AbortSignal；新请求取消旧请求、卸载取消、Abort 不显示错误。
- 响应：`ClinicalReportDetailResponse { report }`。前端类型覆盖真实 report type / status / source / quality、patient / visit snapshot、scaleTrace、score / domain / evidence snapshot、A20 五段 narrative、A21 doctorOpinion / recommendationText、generation、editorial、submission、confirmationId / confirmation 与 Date JSON string / null；不定义内部来源 ID 数组、对象键、scoreDetails、clinicalContext、metadata、AI draft 或 signature。
- 状态：idle / loading / not_found / loaded / forbidden / error 独立于访视详情和目录。`CLINICAL_REPORT_NOT_FOUND` 是正常 not_found；403 独立显示无权限；其他失败不清除访视详情或实例列表。
- 错误：401 返回 `/login`；400 validation；404 `PATIENT_NOT_FOUND` / `VISIT_NOT_FOUND` / `CLINICAL_REPORT_NOT_FOUND`；409 `CLINICAL_REPORT_INCOMPLETE`；500 / 网络映射稳定 service error。后端英文 message 不进入 UI。

### 4.27 `generateClinicalReport()` -> `POST /patients/:patientId/visits/:visitId/clinical-reports/generate`

- Client / 调用方：`clinical-report-api.ts` / `useClinicalReport` / `ClinicalReportPanel`。仅 latest=not_found、Visit 为 draft / in_progress / completed、用户已选择 1-10 个 completed / locked 候选且无其他访视写请求时开放内联二次确认；页面不自动 generate。
- Scope 防御：ID trim + lowercase、严格 24 位 MongoId、数量 1-10、拒绝重复且不静默去重；最终按 scaleCode / instanceNo / id 稳定顺序发送。前端不为 readiness 扇出 A17 / A19，请求后端最终校验 ScoreResult / CognitiveDomainResult / media / version。
- Path / Body：路径 ID 编码且不进入 body；Client 逐字段重建严格 `{ confirm: true, primaryScaleInstanceIds }`，不发送报告编号、版本、状态、snapshot、narrative、metadata、来源结果 ID、force / regenerate / AI / PDF / diagnosis 等服务器字段。
- 凭证 / 缓存 / 重试：`credentials: 'include'`、`cache: 'no-store'`、JSON POST；独立写锁禁用重复提交、scope 与量表初始化提交。POST 没有自动重试，也不轮询 latest。
- 成功：直接使用 `GenerateClinicalReportResponse { report, alreadyGenerated }`；alreadyGenerated=false 显示新 draft 回执，true 作为相同 scope 幂等成功且不再次 POST。成功清空本地 scope / checkbox，不重载页面、不二次 latest、不修改任何来源数据。
- 错误 code：完整映射 `CLINICAL_REPORT_GENERATION_CONFIRMATION_REQUIRED`、`CLINICAL_REPORT_SCOPE_INVALID`、`PATIENT_NOT_ACTIVE`、`VISIT_NOT_EDITABLE`、`SCALE_INSTANCE_NOT_FOUND`、`SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE`、`CLINICAL_REPORT_SOURCE_SCALE_NOT_READY`、`CLINICAL_REPORT_SOURCE_SCORE_NOT_FINAL`、`CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_REQUIRED`、`CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_INVALID`、`CLINICAL_REPORT_SOURCE_MEDIA_INVALID`、`CLINICAL_REPORT_INPUT_INVALID`、`CLINICAL_REPORT_SCOPE_CONFLICT`、`CLINICAL_REPORT_VOIDED`、`CLINICAL_REPORT_INCOMPLETE`、`CLINICAL_REPORT_GENERATION_CONFLICT`、`CLINICAL_REPORT_GENERATION_FAILED`。
- 错误行为：scope / source 错误保留合法选择并提供量表入口；SCALE_INSTANCE_NOT_FOUND 提供访视重载；scope conflict / voided / generation conflict 只自动 GET latest 一次，绝不覆盖或重发 POST；incomplete 不伪造报告；401 返回登录，403 仅影响报告区域，网络失败保留 scope。
- 展示边界：只读展示公开快照、规则正文与审计摘要；system_draft 不写成 AI 或医生确认，quality 不解释患者状态，null 分值不写成 0，不计算 scorePercent、不跨域求和、不调用媒体 API、不输出阈值 / 风险 / 诊断 / 治疗建议。

### 4.28 `updateClinicalReportDraft()` -> `PATCH /patients/:patientId/visits/:visitId/clinical-reports/:reportId/draft`

- Client / 调用方：`clinical-report-api.ts` / `useClinicalReportWorkflow`；仅完整、未锁定 / 归档 / 作废 / 确认的 cognitive_assessment version 1 draft 且 source 为 system_draft / mixed 时开放。
- Path：patientId、visitId、reportId 均 `encodeURIComponent()`；reportId 先 trim + lowercase 并校验 24 位 MongoId，路径 ID 不进入 Body。
- Body 白名单：只构造 `{ doctorOpinion: input.doctorOpinion.trim(), recommendationText?: input.recommendationText.trim(), editNote: input.editNote.trim(), expectedUpdatedAt }`。只有属性未提供时才省略 recommendationText；空字符串保留用于清除建议。
- 禁止字段：不发送 A20 五段 narrative、status、source、qualityStatus、版本 / 编号、scope、快照、generation、editorial、submission、confirmation、actor、eventId、metadata 或 force。
- 凭证 / 缓存 / 重试：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`、JSON PATCH；不自动保存、不自动重试、不在冲突后覆盖或重发。
- 响应：`UpdateClinicalReportDraftResponse { report, editReceipt }`；成功用完整 report 统一替换当前报告，editReceipt 仅保存在当前页面内存。source=mixed 使用服务端事实；不调用 latest，不修改系统摘要、scope 或快照。
- 错误：映射 metadata unsupported、not editable、no changes、audit limit、edit conflict / failed，以及通用 401 / 403 / ownership / patient / visit / incomplete / voided。UI 使用稳定中文，不展示后端 message。
- 冲突行为：edit conflict、not editable、voided、not found 自动 latest 一次；保留 doctorOpinion、recommendationText、editNote，标记 stale，禁止保存。用户明确“基于最新报告继续”后只更新服务端基线，原本地输入不变。

### 4.29 `submitClinicalReportForConfirmation()` -> `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/submit-confirmation`

- Client / 调用方：`clinical-report-api.ts` / `useClinicalReportWorkflow`；四个患者工作流角色以后端 Guard 为最终边界。前端要求 mixed draft、合法 doctorOpinion、quality 非 failed、无本地编辑草稿 / 写请求 / stale。
- Path / Body：三个路径 ID 编码且不进入 Body；严格只构造 `{ confirm: true, submissionNote: input.submissionNote.trim(), expectedUpdatedAt }`。
- 禁止字段：不发送 doctorOpinion、recommendationText、status、submittedAt / submittedBy / submissionId、metadata、force 或 skipReview。
- 响应：`SubmitClinicalReportForConfirmationResponse { report, submissionReceipt }`；完整替换 report，首次服务端进入 pending_confirmation。`alreadySubmitted=true` 作为成功处理，不再次 POST、不改写既有提交记录。
- 并发 / 错误：submission conflict 与 not ready 自动 latest 一次，不重发 POST；保留 submissionNote、清除 checkbox、标记 stale。audit unavailable 不猜测提交人 / 时间。401 返回登录；action 403 保留已加载报告和草稿。
- 边界：提交不等于确认，不修改 narrative / scope / 快照 / quality / confirmation / lockedAt，不提供退回 draft，也不生成 PDF 或调用 AI。

### 4.30 `confirmClinicalReport()` -> `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/confirm`

- Client / 调用方：`clinical-report-api.ts` / `useClinicalReportWorkflow`；前端仅 roles 包含 doctor / admin 时显示可用入口，后端方法级 RolesGuard 是最终权限边界。nurse / research_assistant 只读等待。
- Path / Body：三个路径 ID 编码且不进入 Body；严格只构造 `{ confirm: true, confirmationNote: input.confirmationNote.trim(), expectedUpdatedAt }`。
- 禁止字段：不发送 status、confirmedAt / confirmedBy / confirmedByName / confirmedByRole / confirmationId、signatureText、qualityStatus、narrative、metadata、lockAfterConfirm 或 force。
- 响应：`ConfirmClinicalReportResponse { report, confirmationReceipt }`；完整替换 report，status / qualityStatus / isFinal 全部使用服务端事实。`alreadyConfirmed=true` 作为成功处理，不再次 POST、不修改既有 confirmationId / 时间 / 意见。
- 并发 / 错误：confirmation conflict / not ready 自动 latest 一次，保留 confirmationNote、清除 checkbox、标记 stale 且不重发。audit unavailable 不猜测确认人、时间或 ID；confirm 403 明确当前账号不具备 doctor / admin 权限并保留报告。
- 边界：confirmed 后前端只读，但 confirmed 不等于 locked；不生成签名，不设置前端模拟 locked，不锁定 Visit、评分、认知域或媒体，不生成 PDF，不调用 AI。

### 4.31 `lockClinicalReport()` -> `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/lock`

- Client / 调用方：`clinical-report-api.ts` / `useClinicalReportWorkflow` / `ClinicalReportLockPanel`；仅 currentUser roles 包含 doctor / admin 且完整前端 eligibility 通过时显示可用入口，后端方法级 RolesGuard 是最终权限边界。nurse / research_assistant 不显示可用按钮但可查看报告和锁定摘要。
- Path：patientId、visitId、reportId 均使用 `encodeURIComponent()`；reportId 先 trim + lowercase 并通过既有 24 位 MongoId 防御。路径 ID 不进入 Body。
- Body 白名单：只构造 `{ confirm: true, lockNote: input.lockNote.trim(), expectedUpdatedAt: input.expectedUpdatedAt }`。不发送 status、source、qualityStatus、lockedAt / lockedBy、lock / lockId、confirmation、正文 / 快照、metadata、force / unlock、archive、PDF、来源 ID 或路径 ID。
- expectedUpdatedAt：只来自锁定区打开时冻结的服务端 `ClinicalReport.updatedAt`，不使用浏览器时间、confirmedAt、lockedAt 或客户端生成时间。lockNote trim 后 3–2000 字且由用户明确填写，不自动生成或改写。
- 凭证 / 缓存 / 重试：使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`、JSON POST；不读取 Cookie、不保存 token、不自动重试、冲突后不重发，也不输出请求、响应或 lockNote 到 console。
- 响应：`LockClinicalReportResponse { report, lockReceipt }`。成功完整采用服务端 report，不手动设置 status / lockedAt / lock；当前会话保存 receipt。status 继续为 confirmed，lockedAt 为主锁定事实，lock 为安全摘要，isFinal 直接使用服务端值。
- 幂等：`alreadyLocked=false` 显示首次不可逆锁定完成；`alreadyLocked=true` 作为正常成功，说明此前已锁定且本次未重复写入，不再次 POST，也不改写既有 lockId、时间、actor 或说明。
- 错误映射：严格新增 `CLINICAL_REPORT_LOCK_CONFIRMATION_REQUIRED`、`CLINICAL_REPORT_NOT_LOCKABLE`、`CLINICAL_REPORT_LOCK_CONFLICT`、`CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE`、`CLINICAL_REPORT_LOCK_FAILED`；继续复用 validation、401 / 403、patient / visit / ownership、incomplete、voided、metadata unsupported、service unavailable。
- 冲突恢复：LOCK_CONFLICT 保留 lockNote、清 checkbox、标记 stale、自动 latest 一次；不自动覆盖或重发。NOT_LOCKABLE 同样最多刷新一次；若 latest 已锁定，进入只读展示并保留本地说明到用户明确关闭；若仍可锁，用户需明确“基于最新报告继续”并重新勾选。
- 401 / 403：401 复用现有 onUnauthorized 返回登录；action 403 保留已加载报告和 lockNote，显示需 doctor / admin 权限，不将整个报告区域变成 forbidden。
- 隐私 / 非目标：公开类型仅建模安全 lock actor，不公开 metadata、a22Lock、Schema 原始 lockedBy、Session / currentUser 或事件。不锁定 Patient、Visit、ScaleInstance、ScoreResult、CognitiveDomainResult、MediaEvidence 或 Storage；没有 unlock、签名、归档、更正、作废、PDF / 下载或 AI。

### 4.32 `freezeClinicalReportSources()` -> `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/freeze-sources`

- Client / 调用方：`clinical-report-api.ts` / `useClinicalReportWorkflow` / `ClinicalReportSourceFreezePanel`；仅 currentUser roles 包含 doctor / admin 且首次或恢复 eligibility 通过时显示可用入口。nurse / research_assistant 不显示可用按钮但可查看持久 sourceFreeze 摘要；后端 RolesGuard 是最终权限边界。
- Path：patientId、visitId、reportId 均 `encodeURIComponent()`；reportId 先 trim + lowercase 并通过既有 24 位 MongoId 防御。路径 ID 不进入 Body。
- Body 白名单：只构造 `{ confirm: true, freezeNote: input.freezeNote.trim(), expectedUpdatedAt: input.expectedUpdatedAt }`。不发送来源 ID / counts / scope、freezeId、state、actor、时间、metadata、force、resume、retry、rollback、unfreeze、unlock、报告状态 / 锁或路径 ID。
- 首次说明 / expectedUpdatedAt：freezeNote 由用户明确填写，trim 后 3–2000 字；expectedUpdatedAt 为打开首次表单时冻结的服务端 report.updatedAt。报告版本变化后草稿 stale，原说明保留且不自动 POST。
- 恢复说明 / expectedUpdatedAt：当 report.sourceFreeze.state=in_progress 时仍调用同一 POST；freezeNote 必须使用服务端持久 sourceFreeze.freezeNote，UI 只读且不可替换；expectedUpdatedAt 优先使用打开恢复确认时的当前 report.updatedAt。前端不生成 freezeId，恢复沿用服务端原 freezeId 与 scope。
- 凭证 / 缓存 / 重试：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`、JSON POST；不读取 Cookie、不保存 token、不自动重试、不轮询，不输出 freezeNote、updatedAt、请求或响应到 console。
- Response：`FreezeClinicalReportSourcesResponse { report, sourceFreezeReceipt }`。成功通过既有完整 report 应用路径更新持久 sourceFreeze；receipt 含 freezeId、completed 状态、开始 / 来源锁定 / 完成时间、发起 / 完成人、原说明、expected / completed / newly / previously 计数、alreadyFrozen、resumedExisting，仅保存在当前页面内存。
- 成功语义：alreadyFrozen=false + resumedExisting=false 为首次完成；resumedExisting=true 表示既有流程恢复完成，不是重新冻结；alreadyFrozen=true 表示 completed 幂等且本次未重复写入。成功不再调用 latest，不重载或跳转。
- 错误映射：严格新增 `CLINICAL_REPORT_SOURCE_FREEZE_CONFIRMATION_REQUIRED`、`CLINICAL_REPORT_NOT_SOURCE_FREEZABLE`、`CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID`、`CLINICAL_REPORT_SOURCE_FREEZE_INPUT_INVALID`、`CLINICAL_REPORT_SOURCE_FREEZE_CONFLICT`、`CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE`、`CLINICAL_REPORT_SOURCE_FREEZE_INCOMPLETE`、`CLINICAL_REPORT_SOURCE_FREEZE_FAILED`；继续复用 validation、401 / 403、patient / visit / report ownership、incomplete、voided、metadata unsupported、service unavailable。
- 错误恢复：not source freezable / conflict / incomplete / failed / voided / not found 最多自动 latest 一次，保留首次本地 note、清 checkbox、标记 stale；不自动重发 POST 或进入恢复。latest 若得到 in_progress，必须由用户明确放弃本地说明后才能进入使用服务端 note 的恢复；若得到 completed，本地说明保留到用户明确关闭。scope / input invalid 不展示内部差异或来源 ID；audit unavailable 不猜测 freezeId、actor、时间或状态；metadata unsupported 不展示 metadata。
- 网络不确定结果：保留本地说明，不自动 latest 或 POST，只提供手工“重新加载最新报告”核对；action 403 保留已加载报告和本地说明，401 复用现有 onUnauthorized 返回登录页。
- 隐私与事务边界：公开类型不定义或展示内部来源 ID、scope、metadata 或原始状态明细；前端不调用 A14–A19 查询来源状态，不重新统计计数或计算百分比。A23 不使用 Mongo transaction，completed 前可能部分冻结且无自动回滚；不冻结 Patient、Visit、Storage，不提供 unfreeze，不生成 PDF / 下载，不调用 AI。

### 4.33 `archiveClinicalReport()` -> `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/archive`

- Client / 调用方：`clinical-report-api.ts` / `useClinicalReportWorkflow` / `ClinicalReportArchivePanel`；仅 currentUser roles 包含 doctor / admin 且完整前端资格通过时显示可用入口。nurse / research_assistant 只读查看归档摘要；后端 RolesGuard 是最终权限边界。
- Path：patientId、visitId、reportId 均 `encodeURIComponent()`；reportId 先 trim + lowercase 并通过既有 24 位 MongoId 防御。路径 ID 不进入 Body。
- Body 白名单：只构造 `{ confirm: true, archiveNote: input.archiveNote.trim(), expectedUpdatedAt: input.expectedUpdatedAt }`。不发送 status、archivedAt / archivedBy、archiveId / archive、sourceFreeze / 锚点、lock / confirmation、metadata、actor、force、unarchive / correct / void / createPdf 或路径 ID。
- 首次资格：cognitive_assessment version 1、confirmed / mixed / passed / isFinal、完整 doctor / admin confirmation、安全非 fallback A22 lock、completed 且一致的 A23 sourceFreeze、archivedAt / archive / voidedAt 为空、服务端 updatedAt、无其他报告写请求或本地草稿。Patient active、Visit status / editable 不参与资格，Visit locked 不阻断。
- 说明 / 并发：archiveNote 由用户明确填写，trim 后 3–2000 字且必须勾选不可撤销确认；expectedUpdatedAt 只来自归档区打开时冻结的服务端 report.updatedAt。客户端不使用浏览器时间，不生成 archiveId / archivedAt / actor。
- 凭证 / 缓存 / 重试：`frontendEnv.apiBaseUrl`、`credentials: 'include'`、`cache: 'no-store'`、JSON POST；不读取 Cookie、不保存 token、不自动重试，不输出 archiveNote、updatedAt、请求或响应。
- Response：`ArchiveClinicalReportResponse { report, archiveReceipt }`。成功完整应用 response.report，不手动设置 status / isFinal / archivedAt / archive；当前会话 receipt 含 archiveId、archivedAt、actor、archiveNote、sourceFreezeId / completedAt、alreadyArchived，仅保存在 React 内存。
- 幂等：alreadyArchived=false 表示首次完成；alreadyArchived=true 是正常成功且本次未重复写入，不生成第二个归档事实。刷新后 receipt 消失，持久事实来自 report.status / archivedAt / archive。
- 错误映射：严格新增 `CLINICAL_REPORT_ARCHIVE_CONFIRMATION_REQUIRED`、`CLINICAL_REPORT_NOT_ARCHIVABLE`、`CLINICAL_REPORT_ARCHIVE_CONFLICT`、`CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE`、`CLINICAL_REPORT_ARCHIVE_FAILED`；继续复用 validation、401 / 403、patient / visit / report not found、incomplete、voided、metadata unsupported、service unavailable。
- 恢复：not archivable / conflict / failed / voided / not found 最多自动 latest 一次，保留 archiveNote、清 checkbox、标记 stale，绝不自动重发 POST。latest 仍可归档时必须由用户明确基于最新报告继续；latest 已 archived 时进入只读，说明保留到用户明确关闭且提示未写入。网络结果不确定时仅提供手工 latest。
- 安全摘要 / fallback：完整 A24 archive 校验顶层 archivedAt、UUID、actor、note 与当前 completed sourceFreeze freezeId / completedAt；历史 archived / corrected 可安全显示 archiveId / 锚点为空、actor unknown / 缺姓名的 fallback，不猜测或补写缺失信息且不开放再次归档。archivedAt / archive / status 或锚点不一致时警告并禁止写入。
- 边界：归档不读取或修改来源，不修改 Patient / Visit、lockedAt / lock、sourceFreeze、confirmation、narrative / snapshots / scope。没有 unarchive / restore confirmed / correction / void / delete / unlock / unfreeze / PDF / Word / 下载或 AI。

B14.1 / B15 调用归属更新：

- `updateClinicalReportDraft()` 仅由 `useClinicalReportEditAction.ts` 调用；`submitClinicalReportForConfirmation()` 仅由 `useClinicalReportSubmissionAction.ts` 调用；`confirmClinicalReport()` 仅由 `useClinicalReportConfirmationAction.ts` 调用。
- `lockClinicalReport()` 仅由 `useClinicalReportLockAction.ts` 调用；`freezeClinicalReportSources()` 仅由 `useClinicalReportSourceFreezeAction.ts` 调用；`archiveClinicalReport()` 仅由 `useClinicalReportArchiveAction.ts` 调用。
- `createClinicalReportCorrection()` 仅由 `useClinicalReportCorrectionAction.ts` 调用；公开 façade 与组件不直接 import API Client。七类 Action 共享同一写锁、latest 与报告更新入口。

### 4.34 `createClinicalReportCorrection()` -> `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/corrections`

- 路径 ID 全部 `encodeURIComponent()`；reportId 继续使用既有 MongoId 防御。
- Body 只含 `{ confirm: true, correctionReason: trim 后文本, changeSummary: trim 后文本, expectedUpdatedAt }`；不发送版本、code、correction / replacement 标识、状态、正文、metadata、actor、force、resume、rollback 或 path ID。
- Response 为 `{ sourceReport, replacementReport, correctionReceipt }`；成功以 replacement 更新唯一 latest，source 与 receipt 仅保存在当前页面内存，不再自动 latest、刷新或跳转。
- 首次创建、`in_progress` 恢复与 `completed` 幂等均需用户明确勾选并调用同一 POST；没有自动 POST、retry、polling 或自动恢复。
- 401 复用 `onUnauthorized`；403 保留报告与输入；not correctable / not latest / conflict / incomplete / failed / report not found / voided 最多 latest 一次，保留首次文本、清 checkbox、标 stale 且不重发。
- 安全错误 kind 覆盖 confirmation required、not correctable、not latest、conflict、audit unavailable、replacement conflict、incomplete、failed 与 replacement A21 workflow forbidden；UI 不展示后端英文 message。

## 5. 当前认证公开类型

- `AuthUserResponse`：`id`、`accountName`、`displayName`、`roles`、`permissions`、可选 `userType`。
- `LoginResponse`：`authenticated: true` 与公开用户信息。
- `MeResponse`：`authenticated: true` 与公开用户信息。
- `LogoutResponse`：`ok: true` 与 `authenticated: false`。
- 所有前端认证类型均不包含 token、token hash、`passwordHash`、secret 或 credential 字段。

## 6. 当前 Patients / Assessment Execution 公开类型与错误映射

- 患者响应 Date 字段、访视响应时间字段均按 JSON 传输事实建模为 `string` 或 `string | null`，不建模为浏览器收到的 `Date` 对象。
- `PatientsApiError.kind` 覆盖 `unauthenticated`、`forbidden`、`validation`、`patient_not_found`、`patient_code_conflict`、`patient_not_active`、`visit_code_conflict`、`invalid_date_range`、`service_unavailable`、`unknown`。
- 业务 code 映射：`PATIENT_NOT_FOUND`、`PATIENT_SUBJECT_CODE_CONFLICT`、`PATIENT_NOT_ACTIVE`、`VISIT_CODE_CONFLICT`、`INVALID_DATE_RANGE`。
- 后端英文 message、path、堆栈和内部错误对象不作为 UI 主文案或页面输出。
- `AssessmentExecutionApiError.kind` 覆盖 unauthenticated、forbidden、validation、patient / visit 状态与不存在、scale / version 不可用或停用、catalog 非法或版本冲突、实例重复、初始化失败、网络错误和 unknown。
- B4 扩展错误 kind：`scale_instance_not_found`、`scale_instance_not_editable`、`scale_instance_configuration_unavailable`、`visit_not_editable`、`item_response_not_found`、`item_response_not_editable`、`item_response_empty_patch`、`item_response_payload_invalid`、`item_response_missing_reason_required`、`item_response_cannot_mark_answered`、`item_response_step_not_found`、`item_response_duplicate_step`、`item_response_prompt_not_found`、`item_response_duplicate_prompt`、`item_response_timing_not_allowed`、`item_response_invalid_timing`、`item_response_save_failed`。
- `ScaleInstanceListItem` 的时间字段按 JSON 传输事实定义为 `string | null`；`InitializeScaleInstanceRequest` 只包含三个允许字段，不定义任何服务器控制字段。
- `item-response-execution.ts` 定义 A14 安全响应和 PATCH 白名单类型；所有 Date JSON 字段使用 `string | null`，不定义 scoringRule、expectedValue、score、isCorrect、scoreValue、metadata、qualityControlHints 或内部配置引用。
- `media-evidence.ts` 定义 A15 安全公开响应、access asset、requirement 状态和上传白名单；所有 Date JSON 字段使用 `string` / `string | null`。该类型没有内部患者 / 访视 / 实例 / 题目关联、对象定位、Storage credential、源文件名、校验和、任意 metadata 或删除时间字段。
- `MediaEvidenceApiError.kind` 覆盖 unauthenticated / forbidden / validation、完整资源 / 状态 code、文件 / 轨迹 / captureMode code、重复 / 不可访问 / 不可作废、Storage、创建 / 关联 / 作废内部失败、网络错误和 unknown；UI 不直接显示后端英文 message。
- B6 新增 `scale-instance-submission.ts`：Date JSON 字段均为 string / string | null；类型定义 15 个 issue code、8 个 submissionState、summary、安全提交操作者和严格 `{ confirm: true }`。不定义作答原文、评分、expectedValue、mediaEvidenceId 或 metadata。
- `AssessmentExecutionApiError.kind` 新增 `scale_instance_not_submittable`、`scale_instance_not_ready`、`scale_instance_start_time_invalid`、`scale_instance_submission_confirmation_required`、`scale_instance_submission_conflict`、`scale_instance_submission_audit_unavailable`、`scale_instance_submission_failed`，对应全部 A16 提交业务 code。
- B8 扩展 `provisional-scoring.ts`：新增 updatedAt、manualReview、confirmation、reviewUpdate、confirmationReceipt 与两个写请求白名单；Date JSON 使用 string / null，不定义作答、expectedValue、scoringRule、metadata、previousScoreValue 或完整审计 events。
- `ProvisionalScoringApiError.kind` 覆盖 unauthenticated、forbidden、validation、患者 / 访视 / 实例 / 配置状态和 A17 全部 `SCORE_*` 业务 code、service_unavailable 与 unknown；UI 使用稳定中文映射。
- `cognitive-domain-result.ts` 严格覆盖 result status、mapping source / mode、item score、review / quality、domain score、contribution、mapping、computation、versionTrace 与 A19 请求 / 响应；不定义原始作答、评分意见、expectedValue、scoringRule、metadata 或 contribution minScore。
- `CognitiveDomainApiError.kind` 覆盖 401 / 403 / validation、患者 / 访视 / 实例 / 配置、来源评分和全部 `COGNITIVE_DOMAIN_*` 业务 code、service_unavailable 与 unknown；UI 使用稳定中文映射，不直接显示后端英文 message。
- B12 `clinical-report.ts` 在 B11 类型上新增 `ClinicalReportLockSummary`、`LockClinicalReportRequest`、`LockClinicalReportReceipt` 与 `LockClinicalReportResponse`；Date JSON 使用 string / null，不定义 metadata、a22Lock、Schema 原始 lockedBy、Session、currentUser、signatureText 或来源 ID 数组。
- `ClinicalReportApiError.kind` 严格映射 A21 与 A22 lock 业务 code；UI 使用稳定中文，不直接展示后端英文 message。
- B13 `clinical-report.ts` 新增 `ClinicalReportSourceFreezeState / ResourceCounts / Summary` 与 freeze request / receipt / response；Date JSON 继续为 string / null，不定义内部 scope、来源 ID、metadata、a23SourceFreeze 原始结构、Session 或 currentUser。
- `ClinicalReportApiError.kind` 继续严格映射 A23 八个来源冻结业务 code；UI 使用稳定中文，不直接展示后端英文 message。
- B14 `clinical-report.ts` 新增 `ClinicalReportArchiveSummary`、archive request / receipt / response；Date JSON 继续为 string / null，不定义 metadata、a24Archive、Schema 原始 archivedBy、来源 ID、Session 或 currentUser。
- `ClinicalReportApiError.kind` 严格新增 A24 五个归档业务 code；UI 使用稳定中文，不直接展示后端英文 message。
- B15 `clinical-report.ts` 新增 correction state / summary、replacement lineage、request / receipt / response；Date JSON 继续为 string / null，不定义 metadata、原始 correctionRecords、内部审计对象、五类来源 ID、AuditLog ID 或分支 / 合并类型。
- `ClinicalReportApiError.kind` 新增 A25 九个安全 kind，并继续复用认证、资源、完整性、作废、metadata、服务不可用与 unknown 映射。

## 7. 当前未对接 API

- 当前没有 A12 / A13 / A14 已接接口之外的患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 状态流转调用。
- 当前除 A16–A25 已接调用外，没有撤销提交、reopen、评分 lock / void / rerun / 历史、认知域修改 / 确认 / 作废 / 重算、报告退回 / reject / reopen / withdraw / 签名 / unlock / unfreeze / unarchive / 作废 / 重生成 / V2 lock / freeze / archive / PDF、AI、用户管理、角色权限管理或科研导出 API 调用。
- 不得在后端 API 未确认并进入明确任务范围前编造前端对接事实。

## 8. 后续同步规则

- 前端 API 对接事实以后端 API 文档、前端调用代码和验证结果为准。
- 后端接口变化时，应同步检查本文件是否需要更新。
- 新增业务 API Client 前，应由单独任务明确接口与页面边界。
