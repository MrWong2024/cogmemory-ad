# CogMemory AD / 智忆评 前端组件地图

## 1. 文档定位

本文档维护当前 frontend 稳定组件、Hook、Client 与关键纯模块的职责投影：名称 / 位置、输入输出、local state ownership、调用 / 组合关系、必要生命周期和边界引用。

- 产品范围、工作包状态和当前主线见 [Roadmap](./handoff-roadmap.md)。
- 路由职责见 [Route Map](./handoff-frontend-route-map.md)；API method、请求 / 响应和错误映射见 [Frontend API Map](./handoff-frontend-api-map.md)。
- 受监督患者施测的 detailed same/cross、准备、逐题、媒体、ASR、Evidence、控制与正式复核合同见 [Patient Administration Contract](./handoff-patient-administration-contract.md)。
- current / historical 测试证据与 current executable inventory 见 [Frontend Testing Playbook](./handoff-frontend-testing-playbook.md)。
- 视觉、布局和长期 UX 原则见 [Design Baseline](./handoff-frontend-design-baseline.md)。

本地图不维护工作包流水、DTO 字段、完整业务状态机、算法副本或测试 ledger；易变化的实现细节以 current code 为准。

## 2. 当前组件结构

- frontend/src/components/ui：无业务语义公共 UI。
- frontend/src/features/auth：登录、会话与轻量工作台。
- frontend/src/features/patients：患者、访视、历史与趋势。
- frontend/src/features/assessments：访视执行、量表实例、正式作答、媒体、提交、评分、认知域与临床报告。
- frontend/src/features/patient-administration：受监督患者施测的 staff / patient 两侧组件与安全展示辅助。
- 页面状态以局部 React state / Hook 为主；当前没有通用全局业务 store 或数据请求框架。

## 3. 公共 UI 组件

| 名称 / 位置 | 职责与输入输出 | 边界 |
|---|---|---|
| Button — frontend/src/components/ui/Button.tsx | 封装原生 button，提供受控 variant / size | 不包含权限或临床语义 |
| Card 及子组件 — frontend/src/components/ui/Card.tsx | 提供信息容器、标题、描述和内容组合 | 不绑定患者或评估模型 |
| Badge — frontend/src/components/ui/Badge.tsx | 提供低饱和状态标签 | 只呈现状态，不驱动业务 gate |

## 4. Auth feature

### 4.1 组件与 Hook

| 名称 / 位置 | 职责 | local state / 组合关系 |
|---|---|---|
| LoginForm — features/auth/components/LoginForm.tsx | 检查已有会话、提交登录、呈现稳定反馈并导航 | 使用 Auth Client；敏感输入不进入持久化状态 |
| AuthDashboard — features/auth/components/AuthDashboard.tsx | 展示公开用户摘要、患者入口、能力概览和登出 | 组合 useAuth；不是完整临床工作台 |
| useAuth — features/auth/hooks/use-auth.ts | 读取会话并提供 refresh / signOut | 维护 loading / authenticated / unauthenticated / error；被 LoginForm、AuthDashboard、PatientsWorkspaceShell 使用 |

### 4.2 Client 与类型

- features/auth/api/auth-api.ts：封装认证相关 fetch 与统一错误；具体 method / endpoint 见 Frontend API Map。
- features/auth/types/auth.ts：维护 frontend 使用的安全认证公开类型，不包含 token、secret 或后端凭据。

## 5. Patients feature

### 5.1 工作区与核心页面

| 名称 / 位置 | 职责 | local state / 组合关系 |
|---|---|---|
| PatientsWorkspaceShell — features/patients/components/PatientsWorkspaceShell.tsx | 为 /patients/** 提供认证状态、工作区框架与登出 | 组合 useAuth 和 PatientsWorkspaceUserProvider |
| PatientsWorkspaceContext — features/patients/components/PatientsWorkspaceContext.tsx | 向工作区后代复用 Shell 已取得的安全用户摘要 | 不发起认证请求，不替代后端授权 |
| PatientsListPage — features/patients/components/PatientsListPage.tsx | 管理患者筛选、分页、加载 / 空态 / 错误 | 调用 Patients Client；筛选保存在 URL / page state |
| PatientCreateForm — features/patients/components/PatientCreateForm.tsx | 采集、校验并提交患者创建 | 表单状态只在当前 React 会话；成功后导航 |
| PatientDetailPage — features/patients/components/PatientDetailPage.tsx | 独立加载患者与访视列表并提供 history / trends 导航 | 患者与访视错误分区，不把列表失败扩大为全页失败 |
| AssessmentVisitCreateForm — features/patients/components/AssessmentVisitCreateForm.tsx | 核对患者并创建访视 | 组合患者读取与访视创建；不初始化量表 |
| PaginationControls / PatientStatusBadge | patients feature 的局部分页和状态展示 | 不扩展为通用业务框架或权限 gate |

### 5.2 历史与趋势组件

| 名称 | 职责与组合关系 |
|---|---|
| PatientAssessmentHistoryPage | 编排患者摘要、历史请求、筛选与列表 |
| AssessmentHistoryFilters | 维护可分享的 URL 筛选 |
| AssessmentHistoryList | 按后端顺序展示分页 Visit / Scale / report 摘要和安全导航 |
| PatientFollowUpTrendPage | 独立加载患者、量表目录与所选量表趋势 |
| FollowUpTrendControls | 维护量表、日期和点数等 URL 状态 |
| FollowUpTrendChart | 使用 SVG 展示服务端趋势投影与可访问 marker |
| FollowUpTrendTable | 展示完整服务端点位、可比性和 Domain 明细，不自行生成临床解释 |

以上组件位于 frontend/src/features/patients/components。Patients Client 与 Clinical History Client 分别位于 features/patients/api；具体调用见 Frontend API Map。

## 6. Assessments feature：访视与量表执行

### 6.1 访视详情组合

| 名称 / 位置 | 职责 | local state / 组合关系 |
|---|---|---|
| AssessmentVisitExecutionPage — components/AssessmentVisitExecutionPage.tsx | 编排访视详情、目录、实例、有限 maintenance、current report 与版本面板 | 持有页面级加载与写入互斥；子区域保持各自状态 |
| AssessmentVisitMaintenancePanel — components/AssessmentVisitMaintenancePanel.tsx | 按服务端能力摘要呈现有限 edit / delete / void | 输入为访视事实和回调；不自行决定服务端资格 |
| ScaleInstanceList — components/ScaleInstanceList.tsx | 展示实例摘要并链接实例工作页 | 输入为实例与目录摘要；不读取正式作答 |
| ScaleInitializationPanel — components/ScaleInitializationPanel.tsx | 展示可用量表和施测方式并发起初始化 | 只持有选择 / 提交反馈；业务资格由父页与服务端决定 |

### 6.2 量表实例页面与导航

- ScaleInstanceExecutionPage — components/ScaleInstanceExecutionPage.tsx：量表实例工作页总编排器；加载执行详情，组合正式作答、媒体、submission、评分、认知域和受监督患者施测 staff / review 投影。页面持有分组选择、作答 snapshot、媒体草稿、未收口提示和子工作流组合状态；各写入仍经对应 Hook / Client。页面同时拥有 eligible `supervised_patient_input` 未完成实例的显式不可逆删除 UI：仅在患者会话首次读取后保守展示，资格最终以后端为准，成功后返回当前 Visit。
- ScaleExecutionGroupNavigation — components/ScaleExecutionGroupNavigation.tsx：按服务端分组展示进度并回传当前分组选择，不清理其他分组的合法内存草稿。
- assessment-execution-display.ts：集中维护安全展示标签和页面级展示判断；它是纯展示辅助，不是权限或业务状态机。

### 6.3 正式作答组件

| 名称 | 职责与输入输出 |
|---|---|
| ItemResponseEditor | 接收服务端题目投影与本地 draft，组合类型化编辑、missing、备注、保存 / 完成动作和 Evidence 区域 |
| StructuredManualResponseEditor | 按服务端公开配置呈现结构化人工输入，不自行定义题目算法 |
| ItemStepEditor | 编辑服务端已有 step 槽位并回传 draft 变化 |
| ItemPromptEditor | 编辑服务端已有 prompt 槽位并回传 draft 变化 |
| ItemTimingEditor | 呈现计时动作并把完整 timing intent 交给统一保存协调 |
| ItemResponseSaveStatus | 展示保存、离线、核对、冲突或只读状态，并承载必要的用户选择 |

组件均位于 features/assessments/components。正式答案、评分和 readiness 合同不由这些组件重新定义；具体 API 见 Frontend API Map。

### 6.4 媒体组件

| 名称 | 职责 | 生命周期 / 边界 |
|---|---|---|
| ItemEvidenceRequirements | 展示正式题目 Evidence requirement 并按类型组合媒体区 | 不把媒体动作混入 ItemResponse draft |
| MediaEvidencePanel | 读取当前题目媒体、组合上传 / 查看 / 合法动作并向父页回传权威结果 | 持有局部 loading、错误、写锁和短期访问状态 |
| MediaEvidenceList / MediaEvidencePreview | 展示父级筛选后的正式媒体并按需预览 | 短期 URL 仅驻留内存，卸载时清理 |
| PhotoEvidenceCapture | 处理已有图片选择、重编码预览和上传草稿 | 源文件与预览只在当前组件会话 |
| HandwritingEvidenceCanvas | 提供响应式 Pointer 书写、撤销 / 清空和导出 intent | Canvas / strokes 在内存；不承担识别或评分 |

媒体图像、手写和展示纯函数位于 features/assessments/lib；Client 位于 features/assessments/api/media-evidence-api.ts。文件、请求和错误细节见 Frontend API Map。

### 6.5 Submission、评分与认知域

| 名称 | 职责与组合关系 |
|---|---|
| ScaleInstanceSubmissionPanel | 展示 readiness、高层阻断 / 警告、本地未收口状态、确认和提交回执 |
| ScaleSubmissionIssueList | 把服务端 issue 安全呈现并在允许时回调题目定位 |
| ProvisionalScoringPanel | 组合评分读取 / 生成、人工评分和最终确认 |
| ProvisionalScoreSummary / GroupList / ItemList | 分别展示总览、分组与逐题服务端评分投影，不自行聚合 |
| ScoreReviewQueue | 展示待人工评分入口并回调原题定位 |
| ManualScoreReviewForm | 管理单题人工评分草稿和保存反馈 |
| ScoreResultConfirmationPanel | 管理最终确认草稿与显式确认交互 |
| useCognitiveDomainResult | 独立管理认知域 latest / compute 的请求状态与写锁 |
| CognitiveDomainResultPanel | 组合认知域结果、生成入口、非诊断声明和子列表 |
| CognitiveDomainScoreList / ContributionList / MappingSummary | 分别展示域得分、题目贡献与折叠技术摘要 |

评分与认知域组件只展示或提交对应用户 intent，不在 frontend 重新计算服务端结果。相关 types、display helpers 与 Clients 位于 features/assessments 对应目录；API 细节见 Frontend API Map。

## 7. Autosave 与 timing 组件架构

- features/assessments/lib/item-response-autosave.ts：逐题纯协调器，负责调度、单题写入序列、冲突 / 网络结果分类、服务端成功后的草稿重基线和可清理状态。精确常量、状态转换与 reconciliation 算法以 current code / pure contracts 为准，本地图不复制。
- features/assessments/hooks/useItemResponseAutosaveCoordinator.ts：把纯协调器接入页面、Assessment Execution Client、网络事件和计时 checkpoint；负责注册与清理 timer、listener 和只读核对资源。
- ItemResponseSaveStatus：把协调器状态转成低干扰、可访问的保存反馈和显式冲突选择。
- features/assessments/lib/item-response-timer.ts：维护计时 intent、快照校验与安全 elapsed 计算；不负责页面渲染或临床判定。
- ScaleInstanceExecutionPage：持有页面级 draft snapshot、媒体 generation 与 beforeunload 汇总，并把具体保存动作交给协调器。

## 8. Clinical Report 组件架构

### 8.1 核心 Hook 与 façade

| 名称 / 位置 | 职责 |
|---|---|
| useClinicalReport — hooks/useClinicalReport.ts | 管理访视级 report latest / generate、scope 和 current report 完整替换 |
| useClinicalReportWorkflow — hooks/useClinicalReportWorkflow.ts | 唯一公开 workflow façade，组合 edit、submit、confirm、lock、source freeze、archive、correction |
| useClinicalReportWorkflowCoordinator — hooks/clinical-report-workflow | 统一活动模式、单一写入、身份变化和 report 更新编排 |
| clinical-report-workflow.state.ts / .types.ts | 定义 reducer 状态、Action 与公开 typed contract |
| clinical-report-workflow-recovery.ts | 提供受控恢复分类和 latest helper |
| useClinicalReportBeforeUnload | 汇总报告草稿的页面离开保护 |
| 七个 useClinicalReport*Action | 各自封装对应动作的资格、草稿、Client 调用、错误与回执，并共享 coordinator |

组件只消费公开 façade，不直接 import workflow 内部模块；精确并发和恢复算法以 current code 为准。

### 8.2 Report 页面与只读内容

| 名称 | 职责与组合关系 |
|---|---|
| ClinicalReportPanel | current report 主组合区；组合只读内容、workflow actions、状态与反馈 |
| ClinicalReportScopeSelector | 管理访视内 report scope 选择并回传用户 intent |
| ClinicalReportReadOnlyContent | current / historical 共同复用的安全快照与正文展示 |
| ClinicalReportSnapshotSummary | 展示报告形成时的患者 / 访视安全快照 |
| ClinicalReportScoreList / DomainList / EvidenceList | 展示服务端报告中的评分、认知域和 Evidence 摘要 |
| ClinicalReportNarrative | 分区展示系统正文与 clinician-owned 文本，不自行生成或改写 |
| ClinicalReportTechnicalSummary | 折叠展示必要的版本和生命周期技术摘要 |
| ClinicalReportWorkflowSummary | 汇总当前报告持久 lifecycle 事实与当前会话回执 |

### 8.3 Workflow 输入与摘要组件

| 名称 | 职责 |
|---|---|
| ClinicalReportDraftEditor | 编辑 clinician-owned draft 文本并回传保存 intent |
| ClinicalReportSubmissionPanel | 提供提交确认的内联交互 |
| ClinicalReportConfirmationPanel | 提供临床确认的内联交互 |
| ClinicalReportLockPanel | 呈现不可逆锁定动作；持久 lock 摘要由 WorkflowSummary / TechnicalSummary 展示 |
| ClinicalReportSourceFreezePanel / SourceFreezeSummary | 呈现来源冻结动作 / 恢复入口与持久摘要 |
| ClinicalReportArchivePanel / ArchiveSummary | 呈现归档动作与持久摘要 |
| ClinicalReportCorrectionPanel / CorrectionSummary | 呈现更正 / replacement 动作与 lineage 摘要 |

这些组件位于 features/assessments/components，仅管理各自表单和展示，不维护完整 backend lifecycle 或 API Body；相关 Client 对接见 Frontend API Map。

### 8.4 版本与历史详情

- ClinicalReportVersionPanel：作为访视页独立区域读取版本列表；其状态不阻断 current report workflow。
- HistoricalClinicalReportDetailPage：加载指定历史报告并组合 ClinicalReportReadOnlyContent，不挂载写 façade。
- clinical-report-history.ts：维护 frontend 使用的公开历史关系投影，不把内部 lineage 细节扩散到组件。

## 9. Patient Administration 组件架构

本节只维护组件职责和组合关系。same/cross、准备、逐题 response / media、播放、technical replay、takeover / redo、ASR、Evidence adoption、正式复核及安全退出的详细业务规则统一见 [Patient Administration Contract](./handoff-patient-administration-contract.md)。

### 9.1 医护侧

- PatientAdministrationStaffPanel — features/patient-administration/components/PatientAdministrationStaffPanel.tsx：ScaleInstance 页面上的医护患者施测控制面板；负责读取 / 创建 / 控制最新 PatientAdministrationSession。创建前设备模式是 local UI choice，创建后以 server session 为权威；组合 Preparation 与 StaffStepControls，并向父页面回传必要 session 状态。same-device active Session 可由医护显式重新安全 handoff；该 intent 使用当前 server revision 复用既有 handoff Client，成功后切换回患者 shell，Session 与 current step 继续由 server 权威维护。
- PatientAdministrationPreparation — components/PatientAdministrationPreparation.tsx：管理当前页面的设备准备与可选练习 UI，将本地准备结果和影响因素 intent 交给 StaffPanel；测试媒体、stream 和 object URL 在组件替换 / 卸载时清理，不形成正式 Evidence。
- PatientAdministrationStaffStepControls — components/PatientAdministrationStaffStepControls.tsx：按最新 server session 呈现医护可用的当前步骤 / 异常控制动作并回传用户 intent；不自行生成业务进度、正式答案或服务端并发事实。

### 9.2 患者 Shell 与页面

- PatientAdministrationShell — components/PatientAdministrationShell.tsx：为 /patient-administration/** 提供独立、低负担患者视觉和最少导航；不组合 staff workspace 或 useAuth。
- PatientAdministrationEnterPage — components/PatientAdministrationEnterPage.tsx：管理患者主动进入表单、提交反馈和成功替换导航；不展示 staff 或临床技术信息。
- PatientAdministrationPage — components/PatientAdministrationPage.tsx：读取当前患者会话，按 server status 组合准备 / active / 等待 / 结束投影；active 时只把 current step 交给 PatientAdministrationCurrentStep。负责清理自身读取资源，不调用临床复核、正式作答、评分或报告工作流。

### 9.3 当前步骤与患者输入

- PatientAdministrationCurrentStep — components/PatientAdministrationCurrentStep.tsx：对单一 server current step 编排获准资产、播放以及 Evidence / completion 的 server mutation 与 revision；换步 / 卸载时清理 audio、object URL、AbortController 与旧 run 资源。
- PatientAdministrationSpeechResponse — components/PatientAdministrationSpeechResponse.tsx：管理单步骤短录音、本地回放和 MediaStream / timer / object URL cleanup；patient-advance Evidence 步骤承载“必要时先上传，再请求完成”的单一患者提交 intent，staff-advance 保持 save-only；不自动转写或形成正式答案。
- PatientAdministrationWrittenResponse — components/PatientAdministrationWrittenResponse.tsx：管理当前步骤的 Canvas 或照片输入、预览与 Blob 生命周期；patient-advance Evidence 步骤承载“必要时先上传，再请求完成”的单一患者提交 intent，staff-advance 保持 save-only；不写正式答案。

逐题 responseMode、哪些步骤需要音频 / 观察 / 书写、播放与 Evidence gate 不由 Component Map 维护，统一见 Patient Administration Contract。

### 9.4 Patient Administration review projection

- PatientAdministrationReviewPanel — components/PatientAdministrationReviewPanel.tsx：在符合 server completed 投影时读取患者施测 review reference，按 formal ItemResponse 组织患者原始事实并把展示 slot 交给既有 ItemResponseEditor；管理 review、按需媒体访问、显式辅助操作和 viewer local state。
- patient-review-reference-routing.ts：把 backend review placement 与 formal editor slot 做纯路由；运行时不匹配时安全退化，不维护逐题业务矩阵。
- 正式 ItemResponse 保存、readiness 和整体提交仍由 ScaleInstanceExecutionPage、ItemResponseEditor、autosave coordinator 与 SubmissionPanel 负责；ReviewPanel 不建立第二套正式写链。
- Evidence / ASR / adoption 的详细安全语义和正式复核业务边界见 [Patient Administration Contract](./handoff-patient-administration-contract.md)；具体 calls 见 [Frontend API Map](./handoff-frontend-api-map.md)。

### 9.5 Client、类型与展示辅助

- features/patient-administration/api/patient-administration-api.ts：patient administration 唯一 fetch Client；方法与请求 / 响应由 Frontend API Map 维护。
- types/patient-administration.ts：维护 staff / patient 组件消费的公开类型，不暴露内部 token、Storage 定位或评分事实。
- patient-administration-display.ts 与 patient-administration-review-display.ts：把公开状态转为安全 UI 文案。
- mmse-patient-administration.ts：只提供 current UI 组合需要的最小展示摘要；逐题稳定业务合同仍由 Patient Administration Contract 拥有。

## 10. 后续同步规则

- 只有稳定组件、Hook、Client 职责、输入输出、组合关系或 local state ownership 变化时更新本地图。
- API method、DTO、错误和请求 / 响应由 Frontend API Map 维护；精确算法与常量由 current code / pure contracts 维护。
- 患者施测详细业务合同由 Patient Administration Contract 维护；测试通过、失败、数量、fixture 与 executable inventory 由 testing playbook 维护；工作包状态由 Roadmap 维护。
- 遵循 reference, don't restate；“同步相关文档”只在本组件投影确实变化时更新，没有职责变化则保持 zero diff。
- 不得把 Component Map 扩展为 release notes、测试 ledger、API 规格或患者业务合同。
