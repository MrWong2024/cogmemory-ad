# CogMemory AD / 智忆评 前端事实快照

## 1. 文档定位

本文档记录当前前端工程、路由、feature、API 和状态边界，供后续接续时快速判断代码已经实现什么。

- 项目业务阶段与剩余工作包以 `handoff-roadmap.md` 为准。
- 当前静态门禁、Browser 策略、批次状态、验证数字、cleanup 和 evidence commit 以 `handoff-frontend-testing-playbook.md` 为准。
- endpoint、组件和路由细节分别以 frontend API map、component map、route map 与实际代码为准。
- 本文不维护逐阶段 lint/typecheck/build 流水、Browser 操作日志、临时验收环境过程或完整源码文件清单。

## 2. 当前前端技术栈和目录

- `frontend/package.json` 当前使用 Next.js 16.2.9、React 19.2.7、TypeScript 5.9.3、Tailwind CSS 4.3.0、Playwright Test 1.62.0 与 `@axe-core/playwright` 4.12.1。
- `frontend/app` 使用 App Router，负责页面、layout 和 `not-found`；动态路由参数按 Next 16 的 Promise 形式读取。
- `frontend/src/components/ui` 提供 `Button`、`Card`、`Badge` 三个低业务语义公共组件。
- `frontend/src/features/auth`、`patients`、`assessments` 分别承载认证、患者/访视/历史趋势、量表执行与报告工作流；`patient-administration` 承载 WP-10-F1/F2 独立患者 Shell、安全进入与本地设备准备、MMSE 医护控制、19 步正式患者呈现及多媒体证据采集。
- `frontend/src/lib/env.ts` 只读取 `NEXT_PUBLIC_API_BASE_URL` 并导出 `frontendEnv.apiBaseUrl`。
- `frontend/test/browser-acceptance` 是通用 Browser acceptance 目录：`support` 提供环境、独立 Chromium BrowserContext、Network、真实键盘、viewport、Axe、ARIA tree、可选 live-region helper、runtime、beforeunload 与安全输出能力；`infrastructure` 使用进程内临时 localhost 页面验证跑道；`live` 只在显式 localhost origins 下验证 production frontend + Browser test backend 拓扑。WP-10-F2 已使用该跑道完成正常 MMSE 19 步正式患者主链；live-region helper 仍只是可选技术能力，Axe 与 ARIA tree 自动检查不等同于屏幕阅读器或真实设备专项验收。
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
| `/patient-administration/enter` | F1/F2 患者六位一次性进入码入口；独立 Shell，不调用 `/auth/me` |
| `/patient-administration` | F1/F2 患者当前短期会话页；active 时呈现服务端权威 MMSE 当前步骤、资产与作答控件，非 active 时安全等待或结束 |
| `not-found` | 未匹配地址的静态 404 兜底 |

`frontend/app/patients/layout.tsx` 统一挂载 `PatientsWorkspaceShell`；该 Shell 使用 `useAuth()` 处理认证状态，并通过轻量 Context 向后代复用已取得的公开用户，不产生第二次 `/auth/me`。

公共首页、`AuthDashboard`、患者详情尾注、量表执行页提示和 `not-found` 的产品文案已与 B4–B17 当前能力同步。Dashboard 仍是轻量入口，公共首页仍是静态无 API 页面，量表执行页不提供报告操作；科研脱敏导出、认知域人工确认和 AI 临床解释仍未实现。

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
- 量表实例页支持按服务端分组逐题自动保存与显式立即保存、step/prompt/timing 草稿、切组 flush、题目定位和 beforeunload。
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

### 4.5 WP-10-F1/F2 patient administration

- `ScaleInstanceExecutionPage` 只在 MMSE 1.0、`supervised_patient_input` 实例上组合 `PatientAdministrationStaffPanel`；既有作答、媒体、提交、评分和认知域职责不迁移。
- 医护面板以 5 秒 GET 轮询最新会话，使用 AbortController、single-flight 和同一 Session ID 内的 revision 屏障防旧响应覆盖；不同 Session 的权威响应可替换旧终态。服务端已唯一确定时，刷新后从 prepared / preparation / credential 事实恢复 same-device 或 cross-device，本地 flowChoice 仍不写后端或 Storage；已有患者 credential 时禁止切回 same-device。
- `PatientAdministrationPreparation` 的七项确认、WebAudio 测试音、最长 10 秒的本地 MediaRecorder 回放、Canvas Pointer 练习和八类影响因素都只服务准备阶段；Blob 与 object URL 在 React 内存中形成并精确撤销。麦克风异步 run 在 reset、重启或卸载后失效，迟到的 MediaStream 会立即停止且不创建 recorder 或写状态；练习不写正式作答或证据。
- `/patient-administration/**` 使用独立 `PatientAdministrationShell`，不挂载 staff shell、`useAuth()` 或 `/auth/me`。进入码仅在 React / 表单即时内存中存在，不写 URL、storage 或日志；患者 current GET 以 3 秒间隔串行轮询。
- `PatientAdministrationPage` 的读取 cleanup 对称 abort 并释放 controller / in-flight 引用；active 时把服务端 currentStep 交给 `PatientAdministrationCurrentStep`，prepared / paused 显示安全等待，terminated / expired / completed 显示最小安全结束状态。
- F2 按服务端权威 currentStep 逐步呈现 MMSE 19 步一步一屏。当前步骤只读取获准 private image，按顺序播放 frozen MP3；guidance 可受控重播，stimulus 只在服务端当前 run 明确 `technicalReplayAuthorized=true` 时允许一次技术重播。
- speech 步骤通过 `MediaRecorder` 形成短录音并上传 audio evidence；writing / drawing 支持屏幕 Canvas 生成 handwriting 或纸笔完成后选择 photo。上传成功只形成 `MediaEvidence` 与当前 run 引用，随后由患者显式完成步骤。
- MMSE 19 步当前均由患者正常推进；`mmse-naming` 仍为 speech 并先上传 audio evidence，`mmse-reading-command` 与 `mmse-three-step-command` 仍为 staff_observation，界面提示医护会在后续复核记录观察结果。`PatientAdministrationStaffStepControls` 显示“由患者推进”，active 时不再呈现医护 complete；paused 异常控制仍支持 takeover、直接前一步 redo 与技术重播授权，既有 pause / resume / terminate 保持。患者最后一步完成后进入 completed 安全交还，不调用 F3 review / ASR / submit / scoring / report。

## 5. 当前 API 与状态管理

### 5.1 API Client 范围

- Auth：login、logout、me。
- Patients：A12 患者/访视列表、创建与详情。
- Assessment execution：A13 量表目录/初始化、B18-A 对 A14 revision / 完整 timing / 逐题自动保存与恢复合同的消费、A15 媒体 generation 协调、A16 readiness/submit。
- Media evidence：A15 list/upload/access-url/void。
- Provisional scoring：A17 latest/compute、A18 manual-review/confirm。
- Cognitive domain：A19 latest/compute。
- Clinical report：A20 latest/generate、A21 edit/submit/confirm、A22 lock、A23 freeze-sources、A24 archive、A25 corrections，以及 A27 report versions/historical detail。
- Clinical history：A27 assessment history 与 A28 follow-up trends。
- Patient administration F1/F2：医护侧会话读取 / 创建 / 准备 / 交接 / 暂停 / 恢复 / 重签 / 终止，以及 staff complete / takeover / redo / replay authorize；患者侧 enter / current、current asset / audio / evidence 与 patient complete。
- A26 没有 replacement 专用 endpoint；安全 V2+ 复用 A21–A24。

所有实际 `fetch` 均位于上述 API Client。它们使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'` 和 `cache: 'no-store'`；GET 按调用场景接收 `AbortSignal`。前端没有 BFF、Authorization/JWT 注入、本地 token 存储或完整响应日志。

A21–A25 写请求从当前服务端 `report.updatedAt` 取得 `expectedUpdatedAt`，逐字段重建 Body 白名单，不自动 retry。受控冲突最多读取一次 latest，不自动重发原写请求、串联下一阶段或修补 lineage。

### 5.2 页面状态

- 认证、页面数据、工作流草稿、媒体 Blob/strokes、短期 URL、updatedAt 基线和当前会话 receipt 保存在 React 内存。
- B17 history/trends 可把非敏感筛选、分页与查询上限写入 URL query；浏览器前进/后退恢复这类可分享状态。
- 页面不把临床写工作流草稿、客户端可读凭据、敏感业务对象或不可逆操作的待提交状态写入 URL、localStorage、sessionStorage 或 IndexedDB；这些状态只保存在 React 内存。主登录态仍由服务端 Session + HttpOnly Cookie 维护，前端不读取 Cookie。
- B18-A 的作答、备注、计时、冲突快照、attempt 与媒体 generation 同样只在当前页面内存；不使用 Cache Storage 或其他离线持久化。强制重载会丢失未发送或未确认的内存草稿，`beforeunload` 是本阶段的明确保护边界，页面只从后端恢复已保存事实。
- F1/F2 的患者进入码、同 / 跨设备选择、设备练习与正式录音 / 书写 / 照片 Blob / object URL、准备勾选和影响因素草稿都只在当前 React 会话内存；成功上传后采用服务端最小 evidence 响应，患者页面不保存 staff 认证状态或完整会话响应。
- 后端 Session + HttpOnly Cookie 是主登录态；前端不读取 Cookie，不使用 JWT。
- 401 返回登录流程，403 保留可安全读取的页面事实并显示权限状态；后端 Guard 始终是最终权限边界。

## 6. B16 / B17 与 B18 当前实现

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

### 6.3 B18 对 A29 / A30 的前端消费与桌面闭环

- A14 GET / PATCH 前端类型已声明并消费 `draftRevision`、`draftSavedAt`、`timerState` 与 `lastResumedAt`；每次实际 PATCH 从当前服务端 ItemResponse 基线取得安全 `expectedRevision`，timing 非 null 时发送六字段完整快照，revision 不由客户端生成、预增或猜测。
- 逐题协调器维护 clean / dirty / invalid / queued / saving / waiting_for_network / reconciling / conflict / blocked；有效变更采用 800ms debounce、首次变脏后 5000ms max wait、单题单 active PATCH 和 trailing save。自动保存只保存草稿；立即保存、标记完成、计时动作与 15 秒 checkpoint 共用同一通道。
- 保存成功使用字段级 rebase 保留请求发出后的本地编辑，step / prompt 按稳定业务键处理；A14 attempt 记录媒体 generation，A15 在保存期间形成较新 requirement 时不会被旧 A14 响应回滚。A15 成功不推进 `draftRevision` / `draftSavedAt`。
- `ITEM_RESPONSE_DRAFT_CONFLICT` 会停止自动写、保留本地草稿、读取最新服务器事实，并要求用户明确确认采用服务器版本或以最新 revision 显式重存本地版本；再次冲突仍停止，不自动合并或循环重试。
- 网络异常、AbortError 与 500 / 502 / 503 / 504 进入结果不确定核对：只读 GET 依据 revision 与本次实际发送字段区分未提交、已提交或冲突，不盲目重放。已知离线不发 PATCH；恢复 online 时，无不确定 attempt 的草稿重新排队，有不确定 attempt 的题目先核对。
- 页面级只有一个 1000ms 显示 tick，并按服务器 `lastResumedAt` 计算 running 显示；system 支持开始、暂停、继续、完成、复位，manual / imported 只构造 completed。运行计时每 15 秒按实际 wall-clock 形成完整 checkpoint，切组不会停止其他题组的计时数学。
- 当前自动保存、逐 `ItemResponse` / attempt reconciliation single-flight、显式冲突处理、网络结果核对、切组 flush、媒体 generation、实时计时和失败草稿保全已实现；媒体上传网络中止不会清除当前 React 会话中的文字草稿和已处理图片预览。

## 7. 当前实现结论与验证入口

- WP-10-F1、WP-10-F2、WP-10-F3 已完成：同 / 跨设备发起、准备与安全进入、正常 MMSE 19 步正式患者主链，以及现有 ScaleInstance 页面的正常作答复核闭环均已实现。F2-P2 recovery 与 staff Axe 分类仍保留在 WP-10 最终收口。
- replacement V2+ 生命周期、history / versions / detail / trends、自动保存与媒体协调等既有前端能力已实现；精确当前事实见对应 maps。本 snapshot 不保存已关闭批次的测试数字或 evidence ledger。
- 稳定验证规则和当前仍待验边界见 frontend / backend testing playbook；已关闭阶段的详细执行证据由 Git 历史和当前测试资产追溯。

## 8. 当前未实现边界

- 受监督患者施测终端：MMSE 的 F1/F2 已实现并完成正常 19 步正式患者主链；F2-P2 的 upload 后 reload recovery、takeover、redo、old-run isolation 与 terminate 尚待 WP-10 最终 Browser 收口。MoCA 患者端多模态编排尚未实现。
- F3 已实现于既有 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]`：信息区后、`ScaleInstanceSubmissionPanel` 前展示 `PatientAdministrationReviewPanel`。它一次读取整份 review、允许手动刷新且不轮询，按需获取 access URL、显式触发 ASR、显式采用合法 patient photo / handwriting，并把用户定位到既有 `ItemResponseEditor`；正式答案由 A14 / `markAsAnswered` 保存，整体提交由既有 readiness / A16 完成。ASR candidate 不自动写 `ItemResponse`，adoption 不复制 Evidence 或形成答案。
- F3 没有新增 `/review` 路由、Review workspace、Anomaly、StaffObservation 或第二套提交状态机；completed 后 review 保持可读，ASR / adoption 写操作进入只读。真实设备、真实麦克风、真实触控笔、真实患者 OSS 和真实 ASR 继续按 roadmap 原有最终验收归属，桌面 Browser 的 stub / fake 证据不得冒充这些边界。
- 非语音步骤仍不默认录音，动作观察不等于视频、摄像头、传感器或自动行为识别。摄像头不是标准患者交互设备的通用前置；未来具体步骤确有拍摄或扫码必要时，须由该步骤合同单独锁定权限、隐私、适配和验收。现有医生侧图片上传、纸笔结果拍照和手写证据能力不因此删除或取消。
- 临床运营与知情者辅助：现有 `AuthDashboard` 仍是轻量入口，尚无 WP-12 的最小临床运营工作区或医护代录知情者辅助信息能力；知情者来源、关系和了解程度与患者作答 / ItemResponse / 量表得分分离呈现也尚未实现。当前缺口不等于一期要求知情者长期账号、家庭门户或短期自助链接。
- F1/F2 已锁定同 / 跨设备安全进入、准备练习、八类影响因素、5 秒 staff / 3 秒 patient 轮询、逐步骤文字 / 语音 / 播放 / 重播和当前 run 证据采集；这不表示二维码、全页面 TTS、强实时协作、特定传输技术、全部固定录音、永久保存全部原始证据、独立应用 / 新角色，或独立 attempt / capture / review 集合和通用投影子系统成为未来实现合同。
- HIS / EMR、计费、保险及其他第三方医院系统集成当前未实现，且不属于一期产品缺口、WP-09 或上线验收门禁。
- 患者：编辑、删除、归档、合并。
- 访视：编辑、删除、完整状态流转。
- 施测：不实现永久离线草稿或批量 PATCH；真实设备与人工候选按 roadmap 和 testing playbook 的当前待验边界治理。
- 评分：独立锁定、作废、撤销确认、reopen、rerun、批量人工评分和独立历史列表。
- 认知域：人工修改、确认、锁定、作废、重算和跨量表合并。
- 报告：reject、reopen、withdraw、签名、unlock、unfreeze、unarchive、作废、重生成、PDF、打印、下载。
- AI：临床解释、诊断概率、自动结论或 LLM 调用。
- 管理：用户管理、角色管理、权限菜单和完整权限矩阵。
- 当前没有患者编辑等对应路由，也没有独立评分/认知域/current report 详情路由；历史报告详情保持只读。

## 9. 后续同步规则

- 新增或调整页面/路由时更新 route map；API Client、method、请求/响应或错误映射变化时更新 API map。
- 稳定组件、Hook、状态协调或职责边界变化时更新 component map；snapshot 只同步模块级当前事实。
- 稳定验证规则、cleanup 合同和当前仍待验边界只更新 frontend testing playbook；已关闭阶段的详细执行证据由 Git 历史和当前测试资产追溯。
- 业务工作包状态只由 roadmap 维护；文档治理不得改变 roadmap 状态。
- 不得把产品占位文案、阶段性历史记录或尚未启动的验收批次写成当前实现事实。
