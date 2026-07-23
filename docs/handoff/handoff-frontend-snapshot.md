# CogMemory AD / 智忆评 前端事实快照

## 1. 文档定位

本文档记录当前前端工程、路由、feature、API 和状态边界，供后续接续时快速判断代码已经实现什么。

- 项目业务阶段与剩余工作包以 `handoff-roadmap.md` 为准。
- 当前静态门禁、Browser 策略、批次状态、验证数字、cleanup 和 evidence commit 以 `handoff-frontend-testing-playbook.md` 为准。
- endpoint、组件和路由细节分别以 frontend API map、component map、route map 与实际代码为准。
- 本文不维护逐阶段 lint/typecheck/build 流水、Browser 操作日志、临时验收环境过程或完整源码文件清单。

## 2. 当前前端技术栈和目录

- `frontend/package.json` 当前使用 Next.js 16.2.9、React 19.2.7、TypeScript 5.9.3 与 Tailwind CSS 4.3.0。
- `frontend/app` 使用 App Router，负责页面、layout 和 `not-found`；动态路由参数按 Next 16 的 Promise 形式读取。
- `frontend/src/components/ui` 提供 `Button`、`Card`、`Badge` 三个低业务语义公共组件。
- `frontend/src/features/auth`、`patients`、`assessments` 分别承载认证、患者/访视/历史趋势、量表执行与报告工作流。
- `frontend/src/lib/env.ts` 只读取 `NEXT_PUBLIC_API_BASE_URL` 并导出 `frontendEnv.apiBaseUrl`。
- 当前没有 BFF、Next Route Handler 代理、middleware、全局业务 Provider、Redux/Zustand/SWR/React Query 或第三方图表库。
- 页面继续采用医疗系统、临床评估、低干扰、高可读性和冷静可信的视觉基线。

## 3. 当前路由

| 路由 | 当前职责 |
|---|---|
| `/` | 公共静态首页，提供登录与工作台入口，不调用 API |
| `/login` | 会话探针与机构账号登录 |
| `/dashboard` | 认证后的轻量入口、公开用户摘要、患者档案入口与登出 |
| `/patients` | 患者分页、筛选与详情/创建入口 |
| `/patients/new` | 创建患者 |
| `/patients/[patientId]` | 患者详情、访视分页/筛选，以及 history/trends 导航 |
| `/patients/[patientId]/history` | B17 患者评估历史、URL 筛选和分页 |
| `/patients/[patientId]/trends` | B17 单量表基础随访趋势 |
| `/patients/[patientId]/visits/new` | 创建评估访视 |
| `/patients/[patientId]/visits/[visitId]` | 访视详情、量表初始化、current report workflow 与报告版本面板 |
| `/patients/[patientId]/visits/[visitId]/clinical-reports/[reportId]` | B17 指定历史报告只读详情 |
| `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]` | 量表执行、媒体、提交、评分与认知域 |
| `not-found` | 未匹配地址的静态 404 兜底 |

`frontend/app/patients/layout.tsx` 统一挂载 `PatientsWorkspaceShell`；该 Shell 使用 `useAuth()` 处理认证状态，并通过轻量 Context 向后代复用已取得的公开用户，不产生第二次 `/auth/me`。

公共首页、`AuthDashboard`、患者详情尾注、量表执行页提示和 `not-found` 中仍有部分早期“后续建设/尚未实现”产品文案。MMSE/MoCA 执行、历史结果、报告确认等相关文案已落后于 B4–B17 代码；这些是产品文案问题，不是当前能力事实，本任务不修改产品代码。

## 4. 当前 feature 与主要组件

### 4.1 Auth

- `auth-api.ts` 提供 login、logout、getMe；`useAuth()` 维护 loading/authenticated/unauthenticated/error。
- `LoginForm` 提交账号密码并映射稳定错误；密码不进入 React state、URL、日志或持久化存储。
- `AuthDashboard` 展示公开用户信息、患者档案入口与登出；它仍是轻量入口，不是完整医生工作台或权限菜单。

### 4.2 Patients

- Patients API 与公开类型支持患者列表/创建/详情、访视列表/创建。
- `PatientsListPage`、`PatientCreateForm`、`PatientDetailPage`、`AssessmentVisitCreateForm` 分别承载列表、创建、详情和访视创建。
- B17 新增 `PatientAssessmentHistoryPage`、`AssessmentHistoryFilters/List`、`PatientFollowUpTrendPage`、`FollowUpTrendControls/Chart/Table`。
- history/trends 使用 URL 保存可分享的筛选状态；结果列表保持后端顺序，趋势图/表直接使用服务端 dataStatus、comparison、reason、delta 和 domain 事实。

### 4.3 Assessments

- 访视详情支持安全量表目录、MMSE/MoCA 实例初始化、实例列表与报告区域。
- 量表实例页支持按服务端分组逐题手工保存、step/prompt/timing 草稿、题目定位和 beforeunload。
- A15 媒体链路支持 photo 文件处理、handwriting Canvas、题目级列表、上传、短期预览、逻辑作废和重传；Blob、strokes 与短期 URL 仅在 React 内存。
- A16 提交面板支持 readiness、阻断/警告、stale、本地 dirty 阻断、显式确认、幂等回执和 completed 只读。
- A17/A18 支持阶段性评分、人工单题复核、乐观并发和显式确认；前端不重新计算总分、分组、比例或队列。
- A19 通过独立 Hook/Panel 支持 latest、显式首次 compute、认知域列表、贡献定位、mapping/computation 与非诊断边界。

### 4.4 Clinical report

- `useClinicalReport` 负责 A20 latest/generate、访视级 scope 和 current report 完整替换。
- `useClinicalReportWorkflow` 是唯一公开 façade，组合 edit、submit、confirm、lock、source_freeze、archive、correction 七类 Action。
- coordinator/reducer 统一维护一个 activeMode、一个 writingAction、一个 writingRef、一个 mountedRef、一个 latest 恢复入口与一个报告更新入口；`useClinicalReportBeforeUnload` 是报告工作流唯一 unload 注册点。
- `ClinicalReportPanel` 组合 current report 只读内容与 A21–A25 写 Panel；不同状态的草稿、错误、回执和写资格保持隔离。
- `ClinicalReportReadOnlyContent` 由 current report 和历史报告详情共同复用，只承载安全快照与正文。
- `ClinicalReportVersionPanel` 是访视详情的独立 sibling；版本加载失败不阻断 current report workflow。
- `HistoricalClinicalReportDetailPage` 不挂载 `useClinicalReport` 或 `useClinicalReportWorkflow`，没有 A21–A25 写入口。

## 5. 当前 API 与状态管理

### 5.1 API Client 范围

- Auth：login、logout、me。
- Patients：A12 患者/访视列表、创建与详情。
- Assessment execution：A13 量表目录/初始化、A14 实例详情/逐题草稿、A16 readiness/submit。
- Media evidence：A15 list/upload/access-url/void。
- Provisional scoring：A17 latest/compute、A18 manual-review/confirm。
- Cognitive domain：A19 latest/compute。
- Clinical report：A20 latest/generate、A21 edit/submit/confirm、A22 lock、A23 freeze-sources、A24 archive、A25 corrections，以及 A27 report versions/historical detail。
- Clinical history：A27 assessment history 与 A28 follow-up trends。
- A26 没有 replacement 专用 endpoint；安全 V2+ 复用 A21–A24。

所有实际 `fetch` 均位于上述 API Client。它们使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'` 和 `cache: 'no-store'`；GET 按调用场景接收 `AbortSignal`。前端没有 BFF、Authorization/JWT 注入、本地 token 存储或完整响应日志。

A21–A25 写请求从当前服务端 `report.updatedAt` 取得 `expectedUpdatedAt`，逐字段重建 Body 白名单，不自动 retry。受控冲突最多读取一次 latest，不自动重发原写请求、串联下一阶段或修补 lineage。

### 5.2 页面状态

- 认证、页面数据、工作流草稿、媒体 Blob/strokes、短期 URL、updatedAt 基线和当前会话 receipt 保存在 React 内存。
- history/trends 的筛选保存在 URL 查询参数；浏览器前进/后退恢复 URL 状态。
- 页面不把业务状态写入 localStorage、sessionStorage、IndexedDB、Cookie 或 URL。
- 后端 Session + HttpOnly Cookie 是主登录态；前端不读取 Cookie，不使用 JWT。
- 401 返回登录流程，403 保留可安全读取的页面事实并显示权限状态；后端 Guard 始终是最终权限边界。

## 6. B16 / B17 当前实现事实

### 6.1 B16 replacement V2+ 生命周期

- `clinical-report-lifecycle-target.ts` 区分普通 V1 与具备完整公开 replacementOf 摘要的任意安全整数 V2+；前端只做结构门槛，完整双向 lineage 由后端 A26 裁决。
- 安全 replacement 的 draft/mixed/pending_confirmation 复用 A21，confirmed/locked/frozen 阶段按用户显式操作复用 A22–A24；没有专用页面、Hook、API 或状态仓库。
- V1 原有 Visit 资格不放宽；合法 V2+ 不因 Patient inactive 或 Visit locked/voided 被前端阻断。
- correction 成功采用 replacement 时，中央状态清除旧版本 edit/submit/confirm/lock/freeze/archive 草稿、错误、回执和写禁止状态，只保留本次 correction source/receipt。
- `CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID` 进入安全写禁止，最多 latest 一次，不自动重放 POST。

### 6.2 B17 history、versions、detail、trends

- 患者侧提供 assessment history filters/list 与 follow-up trend controls/chart/table；未选择量表时不请求趋势。
- 趋势保留所有 Visit 点，不删除 missing/not-comparable 点，不跨缺失点连线，不重算 percent/delta/comparison，不生成诊断、风险、改善/恶化或治疗结论。
- Assessments 侧提供报告版本面板和指定历史报告详情；版本关系只展示公开 reportCode/version。
- 历史报告详情是只读路由，不调用 latest 或 A21–A25；current report 与 historical report 只共用安全只读内容组件。
- WP-04 的前端 B17 与后端 A27/A28 均已实施并验收。

## 7. 已完成验证摘要

- WP-02 / B16：已完成。
- WP-04 / B17：已完成。
- Batch A / B1–B3：已完成。
- Batch B / B4–B6：桌面范围已完成。
- Batch C / B7–B10：尚未启动。
- Batch D / B11–B15 差距补验：尚未启动。
- Batch E：保留 8 个真实设备、辅助技术或人工验收项目。

当前验证矩阵、统计、权限/错误、响应式、键盘、Network、Runtime Storage、post-browser verify、cleanup 和 evidence commit 统一见 `handoff-frontend-testing-playbook.md`。本 snapshot 不复制这些数字或过程，也不把 B16/B17、Batch A/B 的证据外推为 Batch C/D 已完成。

## 8. 当前未实现边界

- 患者：编辑、删除、归档、合并。
- 访视：编辑、删除、完整状态流转。
- 施测：批量或自动保存、完整实时计时动作。
- 评分：独立锁定、作废、撤销确认、reopen、rerun、批量人工评分和独立历史列表。
- 认知域：人工修改、确认、锁定、作废、重算和跨量表合并。
- 报告：reject、reopen、withdraw、签名、unlock、unfreeze、unarchive、作废、重生成、PDF、打印、下载。
- AI：临床解释、诊断概率、自动结论或 LLM 调用。
- 管理：用户管理、角色管理、权限菜单和完整权限矩阵。
- 当前没有患者编辑等对应路由，也没有独立评分/认知域/current report 详情路由；历史报告详情保持只读。

## 9. 后续同步规则

- 新增或调整页面/路由时更新 route map；API Client、method、请求/响应或错误映射变化时更新 API map。
- 稳定组件、Hook、状态协调或职责边界变化时更新 component map；snapshot 只同步模块级当前事实。
- 验证策略、批次状态、数字、cleanup 或 evidence commit 只更新 frontend testing playbook。
- 业务工作包状态只由 roadmap 维护；文档治理不得改变 roadmap 状态。
- 不得把产品占位文案、阶段性历史记录或尚未启动的验收批次写成当前实现事实。

## 10. 历史追溯

- B16 replacement 生命周期实现可从 `eabb9b3` 及缺陷修复 `066ee87` 追溯。
- B17 产品实现可从 `4ba9106` 追溯；WP-04 最终收口可从 `db825a9` 及 frontend testing playbook 的 evidence 索引追溯。
- Batch A/B 最终证据与 testing playbook 减肥前历史基线由 frontend testing playbook 统一索引。
- 本轮治理基线为 `ac92107fb586ff732465dec392228c89a3cc862b`。旧逐阶段命令、首轮 Browser 缺口、fixture/端口/账号过程和完整源码清单通过 Git 历史追溯，不再保留在 active snapshot。
