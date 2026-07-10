# CogMemory AD / 智忆评 前端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 前端当前事实快照，帮助后续交接时快速判断前端工程、页面、路由、组件和验证能力的真实状态。

## 2. 当前工程状态

- `frontend\` 根目录公共骨架配置与 `frontend\app` / `frontend\src` 公共底座已初始化。
- 前端 B1 已落地登录页、认证状态 Hook、Auth API Client 和受保护工作台入口；前端 B2 已落地患者档案与评估访视最小页面闭环。
- 当前首页仍为公共占位，只增加登录页与工作台入口，不调用后端。
- `/login` 提供账号密码登录，并在登录前通过 `GET /auth/me` 检查已有会话。
- `/dashboard` 通过 `GET /auth/me` 验证会话、展示当前用户公开信息、提供患者档案入口和登出入口。
- `/patients/**` 通过轻量认证工作区复用 `useAuth()`；当前新增患者列表 / 创建、患者详情 / 访视列表、访视创建页面。
- Patients API Client 真实调用 A12 五个患者 / 访视 API，支持分页、过滤、GET 请求取消、稳定错误映射和安全请求字段白名单。
- 当前视觉遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信口径，不继承 ReviewX 视觉风格。
- 当前没有患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 详情 / 状态流转、MMSE / MoCA 作答、媒体上传、计分、认知域结果、报告、AI、用户管理或权限菜单页面。

## 3. 当前已确认前端事实

- 项目名称为 CogMemory AD / 智忆评，前端默认本地端口为 `3002`。
- `frontendEnv.apiBaseUrl` 读取既有 `NEXT_PUBLIC_API_BASE_URL`，安全默认值为 `http://localhost:5002`。
- 当前路由为 `/`、`/login`、`/dashboard`、`/patients`、`/patients/new`、`/patients/[patientId]`、`/patients/[patientId]/visits/new` 与 `not-found` 兜底页面。
- 当前公共 UI 组件为 `Button`、`Card`、`Badge`；B1 未新增 Input 组件或第三方 UI 库。
- 当前 auth feature 包含：
  - `types/auth.ts`：认证公开类型与状态类型。
  - `api/auth-api.ts`：仅对接三个公开认证 API。
  - `hooks/use-auth.ts`：提供 loading / authenticated / unauthenticated / error 状态，以及 `refresh()`、`signOut()`。
  - `components/LoginForm.tsx`：登录表单、统一错误映射和成功跳转。
  - `components/AuthDashboard.tsx`：认证状态展示、公开用户信息、患者档案真实入口、登出与静态后续能力占位。
- 当前 patients feature 包含：
  - `types/patient.ts`：按 JSON 传输事实定义患者 / 访视公开类型与请求类型，Date 响应使用 string。
  - `api/patients-api.ts`：对接 A12 五个 API，统一 credentials / no-store、GET AbortSignal 和业务错误码映射。
  - `lib/patient-display.ts`：集中维护中文枚举、日期展示 / 转换与标签解析纯函数。
  - `components/PatientsWorkspaceShell.tsx`：复用 `useAuth()` 的 `/patients/**` 认证工作区。
  - `components/PatientsListPage.tsx`：患者分页、keyword / status / sourceType 过滤及列表状态。
  - `components/PatientCreateForm.tsx`：患者白名单字段创建、前端校验、冲突提示与成功跳转。
  - `components/PatientDetailPage.tsx`：患者公开详情、访视分页和 status / visitType / 日期范围过滤。
  - `components/AssessmentVisitCreateForm.tsx`：先读取患者，再按白名单创建访视；不提交 operatorSnapshot。
  - `PaginationControls`、`PatientStatusBadge`：patients feature 内局部复用组件。
- Auth API Client 仅调用：
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/me`
- 所有认证请求使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'` 和 `cache: 'no-store'`。
- 所有患者 / 访视请求同样使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'` 和 `cache: 'no-store'`；GET 请求在筛选变化或卸载时取消旧请求。
- Patients API Client 映射 401、403、普通 400 及 `PATIENT_NOT_FOUND`、`PATIENT_SUBJECT_CODE_CONFLICT`、`PATIENT_NOT_ACTIVE`、`VISIT_CODE_CONFLICT`、`INVALID_DATE_RANGE`。
- `getMe()` 对 `401` 返回 `null`；其他非成功状态映射为稳定认证服务错误。
- 登录 `401` 在 UI 统一显示“账号或密码错误，或账号不可用。”，不区分具体安全失败原因。
- 主登录态使用后端 Session + HttpOnly Cookie；前端不读取 Cookie，不使用 JWT，不保存 raw token、token hash、`passwordHash` 或其他认证凭证。
- 密码仅在表单提交瞬间作为登录请求体使用，不进入 React state、URL、日志或持久化存储。
- 当前未实现前端权限矩阵；公开响应中的 roles 只用于 `/dashboard` 展示摘要，不驱动权限菜单或页面权限控制。
- 本阶段未新增 Next middleware、全局状态管理库或 BFF 代理。
- 患者创建请求不含 status、externalRefs、metadata 或时间戳；访视创建请求不含 operatorSnapshot、clinicalContext、metadata、状态或状态时间。
- 页面不展示 externalRefs、metadata 或 clinicalContext；所有患者 / 访视错误使用稳定中文 UI 文案，不直接展示后端 message。

## 4. 当前文件清单

- `frontend\app\layout.tsx`
- `frontend\app\page.tsx`
- `frontend\app\login\page.tsx`
- `frontend\app\dashboard\page.tsx`
- `frontend\app\patients\layout.tsx`
- `frontend\app\patients\page.tsx`
- `frontend\app\patients\new\page.tsx`
- `frontend\app\patients\[patientId]\page.tsx`
- `frontend\app\patients\[patientId]\visits\new\page.tsx`
- `frontend\app\not-found.tsx`
- `frontend\src\styles\globals.css`
- `frontend\src\lib\env.ts`
- `frontend\src\lib\class-names.ts`
- `frontend\src\components\ui\Button.tsx`
- `frontend\src\components\ui\Card.tsx`
- `frontend\src\components\ui\Badge.tsx`
- `frontend\src\features\auth\types\auth.ts`
- `frontend\src\features\auth\api\auth-api.ts`
- `frontend\src\features\auth\hooks\use-auth.ts`
- `frontend\src\features\auth\components\LoginForm.tsx`
- `frontend\src\features\auth\components\AuthDashboard.tsx`
- `frontend\src\features\patients\types\patient.ts`
- `frontend\src\features\patients\api\patients-api.ts`
- `frontend\src\features\patients\lib\patient-display.ts`
- `frontend\src\features\patients\components\PatientsWorkspaceShell.tsx`
- `frontend\src\features\patients\components\PatientsListPage.tsx`
- `frontend\src\features\patients\components\PatientCreateForm.tsx`
- `frontend\src\features\patients\components\PatientDetailPage.tsx`
- `frontend\src\features\patients\components\AssessmentVisitCreateForm.tsx`
- `frontend\src\features\patients\components\PaginationControls.tsx`
- `frontend\src\features\patients\components\PatientStatusBadge.tsx`
- `frontend\README.md`

## 5. 当前验证状态

- B2 未新增测试代码或测试依赖；当前前端没有既有测试框架，本阶段按任务边界使用静态验证与构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 route types 生成成功。
- `npm run build`：通过，构建包含四条 patients 路由；两个动态路由按 `params: Promise<{ patientId: string }>` 契约编译通过。
- E2E 与浏览器自动化未执行；本阶段不新增 E2E。
- 浏览器手工联调未执行，真实 Cookie / CORS、五个业务 API 和页面交互仍待开发者本地验证。
- 后端命令未执行。
- 以上结果覆盖前端认证与患者 / 访视页面的静态检查和生产构建，不代表完整患者管理或完整评估工作流完成。

## 6. 当前未实现前端事实

- `/dashboard` 已有患者档案入口，但不是完整医生工作台。
- 患者编辑 / 删除 / 归档 / 合并尚未实现。
- 访视编辑 / 删除 / 详情 / 状态流转尚未实现。
- MMSE / MoCA 评估执行、作答提交、媒体上传、自动计分和认知域结果尚未实现。
- 报告生成、医生确认、AI、用户管理、角色权限管理和权限菜单尚未实现。
- 当前没有 A12 五个患者 / 访视 API 之外的其他业务 API 调用。
- 当前不包含路由级服务端认证中间件。

## 7. 后续同步规则

- 后续新增页面、路由、组件、API Client 方法或测试命令后，应同步更新对应 handoff 文档。
- 新增页面、组件、布局、样式和关键交互前，应先检查 `handoff-frontend-design-baseline.md`。
- 本文档只记录已确认事实，不承载未确认推测。
