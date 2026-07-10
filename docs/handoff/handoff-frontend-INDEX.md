# CogMemory AD / 智忆评 前端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 前端 handoff 文档入口，用于索引前端事实快照、设计基线、路由、API 对接、组件和验证手册。

当前内容记录前端公共底座与 B1 登录页、认证状态、Auth API Client 和工作台认证占位能力。当前仍未实现患者、评估、量表执行、媒体、计分、报告、AI、用户管理或权限菜单等业务 MVP 能力。

## 3. 当前状态

- `frontend\` 根目录公共骨架配置与 `frontend\app` / `frontend\src` 公共底座已初始化。
- 前端 B1 已从公共底座推进到“登录页、认证状态与 Auth API 接入底座”阶段。
- 当前已新增公开登录页 `/login` 和最小受保护工作台占位页 `/dashboard`。
- 当前已新增 Auth 类型、Auth API Client、`useAuth()` 认证状态 Hook、`LoginForm` 和 `AuthDashboard`。
- 当前前端只对接 `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`。
- Auth API Client 使用 `frontendEnv.apiBaseUrl`，所有请求均使用 `credentials: 'include'`。
- 主登录态由后端 Session + HttpOnly Cookie 维护；前端不读取 Cookie，不保存 raw token、token hash 或 `passwordHash`，也不使用 localStorage / sessionStorage 保存认证凭证。
- `/dashboard` 只用于验证登录态恢复、公开用户信息展示和登出，不是完整医生工作台。
- 当前不包含 Next middleware、完整前端权限矩阵、角色权限管理页面或权限菜单。
- 当前首页仍为公共占位，只增加 `/login` 与 `/dashboard` 入口，不调用后端。
- 页面继续遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信设计基线，不继承 ReviewX 视觉风格。
- B1 未新增测试代码、测试框架或第三方依赖；现有 lint、typecheck、build 已通过。

## 4. 必读基础文档

- `docs\frontend-architecture.md`
- `docs\auth-baseline.md`
- `docs\codex-rules.md`
- `docs\codex-instruction-spec.md`
- `docs\handoff\handoff-frontend-design-baseline.md`
- `docs\handoff\handoff-backend-api-map.md`
- `docs\handoff\handoff-backend-dto-cheatsheet.md`

## 5. 当前前端 handoff 文档列表

- `docs\handoff\handoff-frontend-snapshot.md`
- `docs\handoff\handoff-frontend-design-baseline.md`
- `docs\handoff\handoff-frontend-route-map.md`
- `docs\handoff\handoff-frontend-api-map.md`
- `docs\handoff\handoff-frontend-component-map.md`
- `docs\handoff\handoff-frontend-testing-playbook.md`

## 6. 设计基线使用规则

- `handoff-frontend-design-baseline.md` 是后续前端 `app` / `src`、页面、组件和样式迁移前必须阅读的基线文档。
- 登录与认证页面继续使用浅色背景、低饱和蓝绿、清晰分区、大字号和少装饰的医疗系统视觉。
- 后续迁移前端结构时，只继承 ReviewX 的工程结构、配置经验和组件治理方法，不继承其视觉风格、颜色体系、页面布局、业务文案或管理后台气质。
- 当前设计基线已用于公共底座和认证接入页面，但不代表完整设计系统或业务页面已经实现。

## 7. 后续同步规则

- 后续调整前端 `src` / `app` 时，应同步更新事实快照、路由地图、组件地图、API 对接地图和验证手册。
- 新增或调整页面、路由、API 对接、复用组件、测试脚本或关键交互时，应同步更新对应 handoff 文档。
- 新增或调整页面、组件、布局、样式和关键交互时，应同步检查 `handoff-frontend-design-baseline.md`。
- 进入业务 MVP 前，应以当前认证接入边界为基线，不得把认证状态 Hook 扩写成未经确认的完整权限系统。
- 未在业务文档和实际代码中确认的内容，只能标记为“待确认”或“待后续业务文档确定”。
- 不得在 handoff 中提前写入未实现的前端能力。
