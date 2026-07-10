# CogMemory AD / 智忆评 前端 API 对接地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端对接后端 API 的调用方、请求、响应、错误处理和 UI 映射。

## 2. 当前状态与边界

- 前端 B1 已新增 `frontend\src\features\auth\api\auth-api.ts`；B2 已新增 `frontend\src\features\patients\api\patients-api.ts`。
- 当前对接后端 A11 三个认证 API 与 A12 五个患者 / 访视 API，不调用其他业务 API。
- API Client 使用 `frontendEnv.apiBaseUrl` 作为后端基础地址。
- 所有请求统一使用 `credentials: 'include'`，由浏览器携带或接收 HttpOnly Cookie。
- 所有认证、患者和访视请求使用 `cache: 'no-store'`。
- 前端不读取 Cookie，不保存 token，不使用 JWT，也不记录密码或认证响应体。
- 当前没有 BFF 代理；B1 / B2 按明确任务口径由浏览器直接请求既有公开 API base URL。

## 3. 环境变量读取

- 调用方：`frontend\src\lib\env.ts`
- 读取项：既有 `NEXT_PUBLIC_API_BASE_URL`
- 安全默认值：`http://localhost:5002`
- 导出对象：`frontendEnv.apiBaseUrl`
- B1 / B2 未新增、删除或修改环境变量与环境变量文件。

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
- 安全边界：仅展示公开访视字段，不展示 clinicalContext、metadata，不提供不存在的访视详情或量表执行调用。

### 4.8 `createPatientVisit()` -> `POST /patients/:patientId/visits`

- Client：`frontend\src\features\patients\api\patients-api.ts`
- 调用方：`AssessmentVisitCreateForm`
- 请求：`CreateAssessmentVisitRequest`，仅包含 `visitCode`、可选 `visitType`、`assessmentDate`、可选 `notes`；`assessmentDate` 由 `datetime-local` 值转换为 ISO 时间点。
- 响应：`AssessmentVisit`；成功后返回患者详情页。
- 凭证 / 缓存：`credentials: 'include'`、`cache: 'no-store'`、JSON POST；创建请求不自动重试。
- loading / 错误：提交时禁用按钮；401 返回登录页；403 显示无权限；其他 400 映射表单校验提示；404 + `PATIENT_NOT_FOUND` 显示患者不存在；409 + `VISIT_CODE_CONFLICT` 映射访视编号冲突；409 + `PATIENT_NOT_ACTIVE` 映射患者非活动状态；Client 仍保留 `INVALID_DATE_RANGE` 稳定映射。
- 安全边界：不提交 patientId、subjectCode、status、operatorSnapshot、状态时间、clinicalContext、metadata 或 timestamps；操作者由后端认证上下文生成。

## 5. 当前认证公开类型

- `AuthUserResponse`：`id`、`accountName`、`displayName`、`roles`、`permissions`、可选 `userType`。
- `LoginResponse`：`authenticated: true` 与公开用户信息。
- `MeResponse`：`authenticated: true` 与公开用户信息。
- `LogoutResponse`：`ok: true` 与 `authenticated: false`。
- 所有前端认证类型均不包含 token、token hash、`passwordHash`、secret 或 credential 字段。

## 6. 当前 Patients 公开类型与错误映射

- 患者响应 Date 字段、访视响应时间字段均按 JSON 传输事实建模为 `string` 或 `string | null`，不建模为浏览器收到的 `Date` 对象。
- `PatientsApiError.kind` 覆盖 `unauthenticated`、`forbidden`、`validation`、`patient_not_found`、`patient_code_conflict`、`patient_not_active`、`visit_code_conflict`、`invalid_date_range`、`service_unavailable`、`unknown`。
- 业务 code 映射：`PATIENT_NOT_FOUND`、`PATIENT_SUBJECT_CODE_CONFLICT`、`PATIENT_NOT_ACTIVE`、`VISIT_CODE_CONFLICT`、`INVALID_DATE_RANGE`。
- 后端英文 message、path、堆栈和内部错误对象不作为 UI 主文案或页面输出。

## 7. 当前未对接 API

- 当前没有 A12 五个接口之外的患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 详情 / 状态流转调用。
- 当前没有量表实例、作答、媒体、计分、认知域、报告、AI、用户管理、角色权限管理或科研导出 API 调用。
- 不得在后端 API 未确认并进入明确任务范围前编造前端对接事实。

## 8. 后续同步规则

- 前端 API 对接事实以后端 API 文档、前端调用代码和验证结果为准。
- 后端接口变化时，应同步检查本文件是否需要更新。
- 新增业务 API Client 前，应由单独任务明确接口与页面边界。
