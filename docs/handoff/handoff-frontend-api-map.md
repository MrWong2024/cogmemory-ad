# CogMemory AD / 智忆评 前端 API 对接地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端对接后端 API 的调用方、请求、响应、错误处理和 UI 映射。

## 2. 当前状态与边界

- 前端 B1 已新增 `frontend\src\features\auth\api\auth-api.ts`。
- 当前只对接后端 A11 已存在的公开认证 API，不调用其他业务 API。
- API Client 使用 `frontendEnv.apiBaseUrl` 作为后端基础地址。
- 所有请求统一使用 `credentials: 'include'`，由浏览器携带或接收 HttpOnly Cookie。
- 所有认证请求使用 `cache: 'no-store'`。
- 前端不读取 Cookie，不保存 token，不使用 JWT，也不记录密码或认证响应体。
- 当前没有 BFF 代理；B1 按明确任务口径由浏览器直接请求既有公开 API base URL。

## 3. 环境变量读取

- 调用方：`frontend\src\lib\env.ts`
- 读取项：既有 `NEXT_PUBLIC_API_BASE_URL`
- 安全默认值：`http://localhost:5002`
- 导出对象：`frontendEnv.apiBaseUrl`
- B1 未新增、删除或修改环境变量与环境变量文件。

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
- 调用方：`useAuth().signOut()`，由 `AuthDashboard` 触发
- 请求：无业务请求体。
- 响应：`{ ok: true, authenticated: false }`
- 凭证策略：`credentials: 'include'`
- 错误处理：非 2xx、网络错误或无效 JSON 映射为稳定的认证服务不可用错误。
- UI 映射：无论服务端请求是否成功，`signOut()` 都清理本地公开认证状态；页面随后返回 `/login`。服务端 Session 与 Cookie 清理由后端负责。

### 4.3 `getMe()` -> `GET /auth/me`

- Client：`frontend\src\features\auth\api\auth-api.ts`
- 调用方：`useAuth()`；当前用于 `LoginForm` 和 `AuthDashboard`
- 请求：无请求体。
- 响应：成功时为 `{ authenticated: true, user: AuthUserResponse }`；`401` 时 Client 返回 `null`。
- 凭证策略：`credentials: 'include'`
- 错误处理：`401` 映射为 unauthenticated；其他非 2xx、网络错误或无效 JSON 映射为 error。
- UI 映射：登录页已认证时进入 `/dashboard`；工作台未认证时返回 `/login`；服务异常时展示重试入口。

## 5. 当前认证公开类型

- `AuthUserResponse`：`id`、`accountName`、`displayName`、`roles`、`permissions`、可选 `userType`。
- `LoginResponse`：`authenticated: true` 与公开用户信息。
- `MeResponse`：`authenticated: true` 与公开用户信息。
- `LogoutResponse`：`ok: true` 与 `authenticated: false`。
- 所有前端认证类型均不包含 token、token hash、`passwordHash`、secret 或 credential 字段。

## 6. 当前未对接 API

- 当前没有患者、访视、量表、评估、作答、媒体、计分、认知域、报告、AI、用户管理、角色权限管理或科研导出 API 调用。
- 不得在后端 API 未确认并进入明确任务范围前编造前端对接事实。

## 7. 后续同步规则

- 前端 API 对接事实以后端 API 文档、前端调用代码和验证结果为准。
- 后端接口变化时，应同步检查本文件是否需要更新。
- 新增业务 API Client 前，应由单独任务明确接口与页面边界。
