# CogMemory AD / 智忆评 后端 API 地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 API 清单与对接摘要，供后续前后端协作、测试和交接使用。

## 2. 当前状态

- 当前公开 API 为 `GET /health`、`POST /auth/login`、`POST /auth/logout`、`GET /auth/me`。
- `AuthModule` 当前新增 `AuthController`，仅暴露最小公开认证 API 底座；主登录态仍为服务端 Session + HttpOnly Cookie，不采用 JWT 主登录态。
- AuthModule 内部 session cookie 名称已统一为 `cogmemory_ad_session`，登录成功下发 HttpOnly Cookie，`SameSite=Lax`，`Path=/`，production 环境启用 `Secure`。
- 当前没有 users controller，没有公开用户管理 API，没有注册、密码重置、角色权限管理、短信验证码、OAuth / SSO 或 JWT 登录 API。
- 当前没有医生、患者、量表、评估、媒体、计分、认知域、报告、SMS、AI / LLM 或业务上传公开接口。
- 本次新增的 `ScalesModule`、`PatientsModule`、`AssessmentsModule`、`MediaModule`、`ScoringModule`、`CognitiveDomainsModule`、`ReportsModule`、`UsersModule` 仍不新增 Controller，不暴露公开业务 API。
- 当前 API 事实以 `backend\src\app.controller.ts`、`backend\src\modules\auth\auth.controller.ts` 和对应测试为准。

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

## 4. 当前未暴露接口说明

- `backend\src\modules\users` 当前没有 Controller。
- `UsersService` 仅供后端认证或后续业务模块内部读取系统账号摘要或认证必要字段；当前不暴露用户创建、更新、禁用、重置密码或公开用户管理 API。
- `backend\src\modules\auth` 当前仅有 `AuthController` 的登录、登出和 auth me 三个公开认证 API；不暴露 users me、注册、密码重置、短信验证码、OAuth / SSO、JWT 登录态、角色权限管理或权限矩阵 API。
- `AuthService`、`SessionAuthGuard` 与 `RolesGuard` 仍为认证链路内部底座；`SessionAuthGuard` 与 `RolesGuard` 未注册为全局 Guard，不影响 `GET /health`。
- `backend\src\modules\scales` 当前没有 Controller；`ScalesService` 与 `ScaleSeedDataService` 仅供后续后端业务模块内部读取量表定义、版本配置和 MMSE / MoCA 初始 seed，不暴露公开 MMSE / MoCA 配置查询 API，不提供 seed 执行接口，不写数据库。
- `backend\src\modules\patients` 当前没有 Controller；`PatientsService` 仅供后续后端业务模块内部读取患者 / 受试者基础档案。
- `backend\src\modules\assessments` 当前没有 Controller；`AssessmentsService` 与 `AssessmentExecutionService` 仅供后续后端业务模块内部读取访视、量表实例、题目作答和构建评估执行初始化计划，不暴露评估创建、量表实例初始化、作答提交或媒体上传公开接口。
- `backend\src\modules\media` 当前没有 Controller；`MediaEvidenceService` 仅供后续后端业务模块内部读取媒体证据元数据摘要。
- `backend\src\modules\scoring` 当前没有 Controller；`ScoringService` 仅供后续后端业务模块内部读取计分结果摘要和复用通用计分汇总纯函数。
- `backend\src\modules\cognitive-domains` 当前没有 Controller；`CognitiveDomainsService` 仅供后续后端业务模块内部读取认知域结果摘要和复用通用认知域汇总纯函数。
- `backend\src\modules\reports` 当前没有 Controller；`ReportsService` 仅供后续后端业务模块内部读取临床报告摘要和复用报告状态转换校验纯函数。
- 当前不定义患者、访视、量表、评估、作答、媒体、计分、认知域、报告、SMS、AI / LLM 或业务上传的前端调用契约。

## 5. 后续同步规则

- API 事实以实际 Controller、路由配置、DTO 和测试为准。
- 未实现或未确认的接口不得提前写入为已存在。
- 后续 API 变更影响前端时，应按对应任务边界同步前端 API 对接文档。
