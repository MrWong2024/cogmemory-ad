# CogMemory AD / 智忆评 前端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 前端 handoff 文档入口，用于索引前端事实快照、设计基线、路由、API 对接、组件和验证手册。

当前内容记录前端公共底座、B1 认证接入、B2 患者档案与评估访视最小页面闭环，以及 B3 访视详情与量表实例初始化接入。当前仍未实现患者完整管理、真实量表题目作答、媒体、计分、报告、AI、用户管理或权限菜单。

## 3. 当前状态

- `frontend\` 根目录公共骨架配置与 `frontend\app` / `frontend\src` 公共底座已初始化。
- 前端已从 B1 认证接入底座、B2 患者 / 访视最小业务闭环推进到 B3 访视详情与量表实例初始化阶段。
- 当前路由包含 `/login`、`/dashboard`、`/patients`、`/patients/new`、`/patients/[patientId]`、`/patients/[patientId]/visits/new` 与 `/patients/[patientId]/visits/[visitId]`。
- 当前已新增 Auth 类型、Auth API Client、`useAuth()` 认证状态 Hook、`LoginForm` 和 `AuthDashboard`。
- 当前已新增 patients feature：患者 / 访视公开类型、Patients API Client、展示与日期纯函数、认证工作区、患者列表 / 创建 / 详情及访视列表 / 创建组件。
- 当前已新增 assessments feature：评估执行公开类型、A13 API Client、中文展示纯函数、访视执行详情、实例列表与量表初始化组件。
- 当前前端对接三个 Auth API、A12 五个业务 API，以及 B3 的 `GET /scales/available`、`GET /patients/:patientId/visits/:visitId`、`POST /patients/:patientId/visits/:visitId/scale-instances`。
- Auth、Patients 与 Assessment Execution API Client 均使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'` 和 `cache: 'no-store'`。
- 主登录态由后端 Session + HttpOnly Cookie 维护；前端不读取 Cookie，不保存 raw token、token hash 或 `passwordHash`，也不使用 localStorage / sessionStorage 保存认证凭证。
- `/dashboard` 已提供真实患者档案入口，但仍是轻量工作区入口，不是完整医生工作台。
- `/patients/**` 使用现有 `useAuth()` 处理认证 loading、会话失效与认证服务错误；患者 API 的 401 返回登录页，403 显示无权限，最终权限边界仍由后端 Guard 提供。
- 患者详情访视列表已提供“打开访视”入口；访视详情页可展示安全访视与量表实例摘要，并为 `draft` / `in_progress` 访视初始化尚未存在的 MMSE / MoCA 实例。
- 可用量表目录只展示名称、版本、总分范围、题目 / 分组数量和配置能力摘要，不展示完整题目、评分规则、expectedValue 或内部 ObjectId；图片、手写、计时标识不代表对应前端能力已实现。
- 当前不包含 Next middleware、完整前端权限矩阵、角色权限管理页面或权限菜单。
- 当前首页仍为公共占位，只增加 `/login` 与 `/dashboard` 入口，不调用后端。
- 页面继续遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信设计基线，不继承 ReviewX 视觉风格。
- B3 未新增测试代码、测试框架或第三方依赖；现有 lint、typecheck、build 已通过，真实浏览器联调仍待执行。
- 当前仍未实现患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 状态流转、ItemResponse 查询 / 保存 / 提交、MMSE / MoCA 题目作答、媒体、计分、报告、AI、用户管理或权限菜单。

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
- 登录、工作台与 patients 页面继续使用浅色背景、低饱和蓝绿、清晰分区、大字号和少装饰的医疗系统视觉。
- 后续迁移前端结构时，只继承 ReviewX 的工程结构、配置经验和组件治理方法，不继承其视觉风格、颜色体系、页面布局、业务文案或管理后台气质。
- 当前设计基线已用于公共底座、认证接入和 patients 页面，但不代表完整设计系统或完整业务 MVP 已实现。

## 7. 后续同步规则

- 后续调整前端 `src` / `app` 时，应同步更新事实快照、路由地图、组件地图、API 对接地图和验证手册。
- 新增或调整页面、路由、API 对接、复用组件、测试脚本或关键交互时，应同步更新对应 handoff 文档。
- 新增或调整页面、组件、布局、样式和关键交互时，应同步检查 `handoff-frontend-design-baseline.md`。
- 后续业务页面应以当前认证和 patients feature 边界为基线，不得把认证状态 Hook 扩写成未经确认的完整权限系统。
- 未在业务文档和实际代码中确认的内容，只能标记为“待确认”或“待后续业务文档确定”。
- 不得在 handoff 中提前写入未实现的前端能力。
