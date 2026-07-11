# CogMemory AD / 智忆评 前端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 前端 handoff 文档入口，用于索引前端事实快照、设计基线、路由、API 对接、组件和验证手册。

当前内容记录前端公共底座、B1-B9 既有闭环，以及 B10 访视级规则化报告草稿生成与安全展示。当前仍未实现患者完整管理、评分锁定、认知域人工确认、报告编辑 / 医生确认 / 签名 / PDF、AI、用户管理或权限菜单。

## 3. 当前状态

- `frontend\` 根目录公共骨架配置与 `frontend\app` / `frontend\src` 公共底座已初始化。
- 前端已推进到 B10，当前闭环为“逐题记录 → 媒体证据 → readiness → 实例提交 → 阶段性评分 → 人工评分 → 评分确认 → 认知域计算与展示 → 访视级规则化报告草稿生成与展示”。
- 当前路由包含 `/login`、`/dashboard`、`/patients`、`/patients/new`、`/patients/[patientId]`、`/patients/[patientId]/visits/new`、`/patients/[patientId]/visits/[visitId]` 与 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]`。
- 当前已新增 Auth 类型、Auth API Client、`useAuth()` 认证状态 Hook、`LoginForm` 和 `AuthDashboard`。
- 当前已新增 patients feature：患者 / 访视公开类型、Patients API Client、展示与日期纯函数、认证工作区、患者列表 / 创建 / 详情及访视列表 / 创建组件。
- 当前 assessments feature 已包含 A13-A20 安全公开类型、评估 / 媒体 / 评分 / 认知域 / 报告 API Client、展示纯函数与独立状态 Hook，以及逐题记录、媒体证据、正式提交、评分确认、认知域展示和访视级报告组件。
- 当前前端在既有访视详情页接入 A20 latest / generate；scope 由用户从同访视 completed / locked 实例中选择 1-10 项并二次确认，候选状态不替代后端评分、认知域与媒体校验。页面不自动生成、不重试 POST、不修改来源数据。
- Auth、Patients 与 Assessment Execution API Client 均使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'` 和 `cache: 'no-store'`。
- 主登录态由后端 Session + HttpOnly Cookie 维护；前端不读取 Cookie，不保存 raw token、token hash 或 `passwordHash`，也不使用 localStorage / sessionStorage 保存认证凭证。
- `/dashboard` 已提供真实患者档案入口，但仍是轻量工作区入口，不是完整医生工作台。
- `/patients/**` 使用现有 `useAuth()` 处理认证 loading、会话失效与认证服务错误；患者 API 的 401 返回登录页，403 显示无权限，最终权限边界仍由后端 Guard 提供。
- 患者详情访视列表已提供“打开访视”入口；访视详情页可展示安全访视与量表实例摘要，并为 `draft` / `in_progress` 访视初始化尚未存在的 MMSE / MoCA 实例。
- 每个量表实例都有“打开量表”或“查看量表”入口；B4 执行页按服务端分组和题目顺序展示安全配置，支持普通、分步、提示后、缺失、计时与备注草稿的逐题手工保存。
- B5 在同一执行页按题懒加载媒体历史，支持 photo 文件选择 / 移动端 capture 提示、Canvas JPEG 重编码、1200 × 800 手写画布、最终 PNG / 默认 strokes JSON、临时预览、作废与重传；媒体草稿与短期 URL 只存在于当前 React 内存。
- 可用量表目录只展示名称、版本、总分范围、题目 / 分组数量和配置能力摘要，不展示完整题目、评分规则、expectedValue 或内部 ObjectId；进入实例后，只有真实 photo / handwriting requirement 才开放 B5 采集，计时标识仍不代表实时计时器已实现。
- 当前不包含 Next middleware、完整前端权限矩阵、角色权限管理页面或权限菜单。
- 当前首页仍为公共占位，只增加 `/login` 与 `/dashboard` 入口，不调用后端。
- 页面继续遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信设计基线，不继承 ReviewX 视觉风格。
- B5-B10 未新增测试代码、测试框架或第三方依赖；lint、typecheck 与 build 结果记录在事实快照和验证手册，真实浏览器联调仍待执行。
- B6 在既有执行页接入 A16 两个接口，支持独立 readiness 错误 / 重试、统计、阻断问题、警告、题目定位、readiness stale、本地 dirty / 写请求阻断、内联二次确认、提交写锁、completed 只读和当前会话幂等回执；形成“逐题记录 → 媒体证据 → 完整性检查 → 实例提交”闭环。
- B7 在同一执行页接入 A17 两个接口，形成“逐题记录 → 媒体证据 → readiness → 实例提交 → 阶段性评分 → 待人工复核展示”闭环；completed 无结果时由用户明确确认后计算，页面不自动 compute、不重算，分数和 reviewQueue 均直接使用服务端事实，并支持复核项目定位原题。
- B8 在同一执行页接入 A18 两个接口，形成“逐题记录 → 媒体证据 → readiness → 实例提交 → 阶段性评分 → 人工评分 → 显式评分确认”闭环；冲突刷新 latest 且不自动重试，confirmed 后评分区域只读。
- B9 在同一执行页接入 A19 latest / compute；评分确认后自动查询一次已有认知域结果，无结果时必须由用户明确确认才首次计算。页面展示 domainScores、itemContributions、mapping / computation，支持贡献定位原题，并固定说明重叠归因、跨域不可求和和非诊断边界。
- B10 在访视详情页安全展示 report patient / visit / scale / score / domain / evidence 快照、五段规则化 narrative、generation 与历史 confirmation；system_draft 不等于 AI 或医生结论，draft 尚未经医生确认。
- 当前仍未实现患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 状态流转、批量或自动保存、评分锁定、认知域人工修改 / 确认 / 锁定 / 作废 / 重算、报告编辑 / 确认 / 签名 / 锁定 / 归档 / 更正 / 作废 / 重生成 / version 2 / PDF、AI、用户管理或权限菜单。

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
