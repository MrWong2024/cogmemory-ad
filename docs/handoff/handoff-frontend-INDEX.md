# CogMemory AD / 智忆评 前端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 前端 handoff 文档入口，用于索引前端事实快照、设计基线、路由、API 对接、组件和验证手册。

项目整体进度、当前业务阶段、一期剩余工作包与二期候选能力统一由 `handoff-roadmap.md` 作为项目控制面板维护；本入口不承担阶段时间线。

实现细节分别由 snapshot、route map、API map 和 component map 维护；当前静态门禁、Browser 验收策略、批次状态、验证数字和 evidence commit 统一以 `handoff-frontend-testing-playbook.md` 为准，不在本入口重复维护。

## 3. 当前状态

- `frontend/` 使用 Next.js App Router、React、TypeScript 与 Tailwind CSS；公共 UI、Auth、Patients、Assessments 三个业务 feature 已落地。
- B1–B17 当前代码闭环已存在。B16 已让安全线性 replacement V2+ 复用既有 A21–A24；B17 已接入患者评估历史、报告版本、指定历史报告详情与基础随访趋势。WP-02、WP-04 均已完成。
- 当前路由为 `/`、`/login`、`/dashboard`、`/patients`、`/patients/new`、`/patients/[patientId]`、`/patients/[patientId]/history`、`/patients/[patientId]/trends`、`/patients/[patientId]/visits/new`、`/patients/[patientId]/visits/[visitId]`、`/patients/[patientId]/visits/[visitId]/clinical-reports/[reportId]` 与 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]`，另有 `not-found` 兜底。
- Patients / Assessments 已覆盖患者与访视创建/读取、量表初始化与逐题草稿、媒体证据、提交、评分复核与确认、认知域、报告生成与 A21–A25 工作流；A26 不新增平行接口，B16 复用 A22–A24。
- B17 使用 A27/A28 四个只读 GET；历史报告详情不挂载 current report workflow，访视详情中的版本面板与当前报告工作流相互独立。
- 所有前端 API Client 使用 `frontendEnv.apiBaseUrl` 与 `credentials: 'include'`；适用 GET 使用 `cache: 'no-store'`。当前只读取 `NEXT_PUBLIC_API_BASE_URL`，没有 BFF、JWT 主登录态或本地 token 存储。
- 主登录态由后端 Session + HttpOnly Cookie 维护；页面内草稿与当前会话回执只保存在 React 内存。
- `/dashboard` 仍是轻量入口，不是完整医生工作台。`AuthDashboard` 与公共首页仍渲染部分早期“后续建设/尚未实现”占位文案，其中 MMSE/MoCA、历史结果与报告确认描述已落后于 B4–B17 代码；这些是产品文案问题，不是能力未实现的事实。
- 当前验证状态、Batch 状态、Browser/automated 数量、evidence commit、verify 与 cleanup 只见 `handoff-frontend-testing-playbook.md` 的当前状态表；本 INDEX 不重复维护。
- 当前仍未实现：患者编辑/删除/归档/合并；访视编辑/删除和完整状态流转；批量或自动保存；评分独立锁定；认知域人工修改/确认/锁定/作废/重算；报告 reject/reopen/withdraw、签名、unlock/unfreeze/unarchive、作废、重生成、PDF/打印/下载；AI 临床解释；用户管理、角色管理和权限菜单。

## 4. 必读基础文档

- `docs/frontend-architecture.md`
- `docs/auth-baseline.md`
- `docs/codex-rules.md`
- `docs/codex-instruction-spec.md`
- `docs/handoff/handoff-roadmap.md`
- `docs/handoff/handoff-frontend-design-baseline.md`
- `docs/handoff/handoff-backend-api-map.md`
- `docs/handoff/handoff-backend-dto-cheatsheet.md`

## 5. 当前前端 handoff 文档列表

- `docs/handoff/handoff-frontend-snapshot.md`
- `docs/handoff/handoff-frontend-design-baseline.md`
- `docs/handoff/handoff-frontend-route-map.md`
- `docs/handoff/handoff-frontend-api-map.md`
- `docs/handoff/handoff-frontend-component-map.md`
- `docs/handoff/handoff-frontend-testing-playbook.md`

## 6. 设计基线使用规则

- `handoff-frontend-design-baseline.md` 是后续前端 `app` / `src`、页面、组件和样式迁移前必须阅读的基线文档。
- 登录、工作台与 patients 页面继续使用浅色背景、低饱和蓝绿、清晰分区、大字号和少装饰的医疗系统视觉。
- 后续迁移前端结构时，只继承 ReviewX 的工程结构、配置经验和组件治理方法，不继承其视觉风格、颜色体系、页面布局、业务文案或管理后台气质。
- 当前设计基线已用于公共底座与现有业务页面，但不代表完整设计系统或完整医生工作台已实现。

## 7. 后续同步规则

- 后续调整前端 `src` / `app` 时，应按职责同步 snapshot、route map、component map、API map 或 testing playbook，不在 INDEX 累积逐阶段流水。
- 新增或调整页面、组件、布局、样式和关键交互时，应同步检查 `handoff-frontend-design-baseline.md`。
- 当前实现判断以代码、roadmap 与对应 handoff 为准；验证事实以 frontend testing playbook 为准。
- 不得在 handoff 中提前写入未实现的前端能力。
