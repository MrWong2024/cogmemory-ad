# CogMemory AD / 智忆评 前端路由地图

## 1. 文档定位

本文档维护当前 frontend route 投影：页面职责、访问边界、主要数据来源、主要状态 / 高层交互、关联组件与必要非目标。

- route 是否存在以 frontend/app current code 为准。
- 产品阶段和工作包状态见 [Roadmap](./handoff-roadmap.md)。
- 请求 / 响应、DTO、错误映射与写协议见 [Frontend API Map](./handoff-frontend-api-map.md)。
- 组件 / Hook / Client 内部职责见 [Frontend Component Map](./handoff-frontend-component-map.md)。
- 受监督患者施测的逐题、媒体、播放、same/cross、安全和 F2/F3 合同见 [Patient Administration Contract](./handoff-patient-administration-contract.md)。

Route Map 只保留理解页面所需的高层投影，不作为 API、算法、业务合同或测试 evidence 的第二 owner。

## 2. 当前路由结构

- frontend/app/layout.tsx 提供全局根布局。
- frontend/app/patients/layout.tsx 为 /patients/** 挂载认证后的临床工作区 Shell。
- frontend/app/patient-administration/layout.tsx 为 /patient-administration/** 挂载独立患者 Shell。
- 当前路由覆盖公共 / 认证、患者 / 访视 / 历史趋势、量表执行、患者施测终端、临床报告历史详情与 not-found。
- 页面统一通过 feature API Client 访问后端；具体对接见 Frontend API Map。

## 3. 当前路由

### 3.1 /

- 页面名称：公共首页。
- 页面职责：说明产品定位并提供登录、工作台和患者档案入口。
- 访问边界：公开。
- 主要数据来源：静态内容，不调用业务 API。
- 主要交互：导航到 /login、/dashboard 或 /patients。
- 非目标：不展示真实患者数据、工作包状态或后台统计。

### 3.2 /login

- 页面名称：机构账号登录。
- 页面职责：检查已有会话、提交登录并在成功后进入工作台。
- 访问边界：公开；已认证会话直接进入 /dashboard。
- 主要数据来源：Auth API Client 的 getMe() 与 login()。
- 关联组件：LoginForm、Button、Card。
- 非目标：不提供注册、找回密码、患者入口或测试账号说明。

### 3.3 /dashboard

- 页面名称：认证后轻量工作台。
- 页面职责：展示公开用户摘要、患者档案入口、临床能力概览和登出。
- 访问边界：认证后；后端会话是最终边界。
- 主要数据来源：useAuth() / Auth API Client。
- 关联组件：AuthDashboard。
- 非目标：不是完整临床运营 Dashboard、权限菜单或统计中心。

### 3.4 /patients

- 页面名称：患者列表。
- 页面职责：分页、关键词 / 状态筛选，并提供患者详情与创建入口。
- 访问边界：认证后的 patients workspace；后端 Guard 最终裁决。
- 主要数据来源：Patients API Client 的 listPatients()。
- 关联组件：PatientsWorkspaceShell、PatientsListPage、PaginationControls、PatientStatusBadge。
- 高层边界：只展示安全列表字段，不承载患者编辑或批量运营。

### 3.5 /patients/new

- 页面名称：创建患者。
- 页面职责：采集必要患者信息、客户端基础校验、提交和成功跳转。
- 访问边界：认证后的 patients workspace；实际创建资格由后端裁决。
- 主要数据来源：Patients API Client 的 createPatient()。
- 关联组件：PatientCreateForm。
- 非目标：不提供编辑、草稿、批量导入或内部字段维护；具体请求 / 错误见 Frontend API Map。

### 3.6 /patients/[patientId]

- 页面名称：患者详情与访视列表。
- 页面职责：展示患者安全摘要、访视筛选 / 分页，并提供新建访视、评估历史和随访趋势入口。
- 访问边界：认证后的 patients workspace；路径 ID 与权限由页面 / 后端校验。
- 主要数据来源：getPatient() 与 listPatientVisits()。
- 关联组件：PatientDetailPage、PaginationControls、PatientStatusBadge。
- 高层边界：患者详情与访视列表独立失败；本页不执行量表初始化或报告写入。

### 3.7 /patients/[patientId]/visits/new

- 页面名称：创建评估访视。
- 页面职责：核对患者后创建访视并跳转至访视详情。
- 访问边界：认证后的 patients workspace；患者状态和创建资格由后端裁决。
- 主要数据来源：getPatient() 与 createPatientVisit()。
- 关联组件：AssessmentVisitCreateForm。
- 非目标：不在同一请求初始化量表，也不维护 DTO 白名单或错误矩阵；具体合同见 Frontend API Map。

### 3.8 /patients/[patientId]/visits/[visitId]

- 页面名称：访视执行详情。
- 页面职责：展示访视与量表实例，组合有限 Visit maintenance、量表初始化、current clinical report workflow 和报告版本列表。
- 访问边界：认证后的 patients workspace；后端 Guard 与返回的能力摘要是最终写边界。
- 主要数据来源：访视执行详情、量表目录、初始化 / maintenance Client、Clinical Report Client 与报告版本 Client；具体调用见 Frontend API Map。
- 主要状态：访视读取、目录与实例、各区域独立错误，以及页面级互斥写入状态。
- 关联组件：AssessmentVisitExecutionPage、AssessmentVisitMaintenancePanel、ScaleInstanceList、ScaleInitializationPanel、ClinicalReportPanel、ClinicalReportVersionPanel。
- 非目标：不在路由文档维护 Visit DTO、report lifecycle 状态机、并发算法或写请求细节；不把 current report 与历史报告详情合并为同一路由。

### 3.9 /patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]

- 页面名称：量表实例执行与结果工作页。
- 页面职责：承载正式 ItemResponse、媒体证据、submission、评分、认知域，以及受监督 patient administration 的医护控制与 completed 后复核组合。
- 访问边界：认证后的临床工作区；实例可读 / 可写状态和业务资格由后端裁决。
- 主要数据来源：量表执行详情、ItemResponse、Media Evidence、submission readiness、评分、认知域与 Patient Administration Clients；具体调用见 Frontend API Map。
- 主要状态 / 交互：动态分组、正式作答保存、媒体操作、整体提交、评分复核和认知域展示；患者施测未完成时按服务端事实保持相应页面投影。
- Patient Administration 投影：医护控制面板挂载于本 route；患者施测 completed 后 F3 继续在本 route 复用既有正式作答与提交链，不新增独立 review route。
- 关联组件：ScaleInstanceExecutionPage、ScaleExecutionGroupNavigation、ItemResponseEditor、MediaEvidencePanel、ScaleInstanceSubmissionPanel、ProvisionalScoringPanel、CognitiveDomainResultPanel、PatientAdministrationStaffPanel、PatientAdministrationReviewPanel。
- 非目标：不在此复制逐题 responseMode、媒体 / 播放规则、异常控制、revision / CAS、评分或报告业务协议；患者施测详细合同见 [Patient Administration Contract](./handoff-patient-administration-contract.md)。

### 3.10 /patient-administration/enter

- 页面名称：患者安全进入。
- 页面职责：接收患者主动提交的短期进入凭据，成功后替换导航到当前患者会话页。
- 访问边界：公开患者 Shell；不挂载 patients staff workspace，不调用 /auth/me，患者 Cookie / Guard 是最终边界。
- 主要数据来源：Patient Administration Client 的 enter 调用。
- 主要状态：输入、提交中、可理解的失败反馈和成功导航。
- 关联组件：PatientAdministrationShell、PatientAdministrationEnterPage。
- 安全边界：不在页面显示患者、访视、量表、staff 或凭据技术信息；详细进入码与会话合同见 Patient Administration Contract，API 形状见 Frontend API Map。

### 3.11 /patient-administration

- 页面名称：患者当前施测会话。
- 页面职责：读取当前患者会话；active 时一步一屏呈现服务端权威当前步骤，其他状态显示安全等待、处理或结束。
- 访问边界：独立患者 Shell；不读取 staff Session、/auth/me 或 patients workspace Context。
- 主要数据来源：Patient Administration Client 的 current、当前资产、音频播放、Evidence 上传与步骤完成调用。
- 主要状态 / 交互：当前步骤呈现、必要媒体 / 作答控件、医护求助和最小安全结束状态。
- 关联组件：PatientAdministrationShell、PatientAdministrationPage、PatientAdministrationCurrentStep、PatientAdministrationSpeechResponse、PatientAdministrationWrittenResponse。
- 安全边界：只显示完成当前步骤所需的最少信息，不展示评分、报告、诊断或其他患者 / staff 数据。
- 合同边界：逐题 responseMode、录音 / 媒体、播放 / 重播、轮询实现和异常控制不由 Route Map 维护，统一见 [Patient Administration Contract](./handoff-patient-administration-contract.md)、[Frontend API Map](./handoff-frontend-api-map.md) 与 current code。

### 3.12 not-found

- 页面名称：404 兜底页。
- 页面职责：处理未匹配地址并提供返回首页入口。
- 访问边界：公开。
- 主要数据来源：静态内容。
- 关联组件：Badge、Card。
- 非目标：不调用后端，也不把地址不存在解释为权限不足。

### 3.13 /patients/[patientId]/history

- 页面名称：患者评估历史。
- 页面职责：展示患者摘要、可分享筛选、分页历史、结果可用性和报告摘要。
- 访问边界：认证后的 patients workspace；后端 Guard 最终裁决。
- 主要数据来源：getPatient() 与 listPatientAssessmentHistory()。
- 主要状态 / 交互：URL 筛选、分页、空结果、打开 Visit 或历史报告。
- 关联组件：PatientAssessmentHistoryPage、AssessmentHistoryFilters、AssessmentHistoryList。
- 非目标：不重排后端历史，不在本页编辑报告或推导临床结论。

### 3.14 /patients/[patientId]/trends

- 页面名称：患者随访趋势。
- 页面职责：在明确选择量表后展示服务端提供的基础趋势、图表和完整表格。
- 访问边界：认证后的 patients workspace；后端 Guard 最终裁决。
- 主要数据来源：getPatient()、listAvailableScales() 与 getPatientFollowUpTrend()。
- 主要状态 / 交互：URL 条件、量表选择、日期范围、图表和表格。
- 关联组件：PatientFollowUpTrendPage、FollowUpTrendControls、FollowUpTrendChart、FollowUpTrendTable。
- 非目标：不自行补算、跨缺失点连接或输出诊断、风险、改善 / 恶化结论。

### 3.15 /patients/[patientId]/visits/[visitId]/clinical-reports/[reportId]

- 页面名称：历史报告只读详情。
- 页面职责：读取并展示指定历史报告的安全快照、正文和公开版本摘要。
- 访问边界：认证后的 patients workspace；路径 ID、资源归属和角色由页面 / 后端校验。
- 主要数据来源：getHistoricalClinicalReport()。
- 主要状态 / 交互：独立 loading / error / retry，以及返回 Visit、患者历史和患者详情的导航。
- 关联组件：HistoricalClinicalReportDetailPage、ClinicalReportReadOnlyContent。
- 非目标：不挂载 current report Hook 或写工作流，不提供编辑、提交、确认、锁定、冻结、归档或更正动作。

## 4. 后续同步规则

- 新增、删除或改变 route、页面职责、访问边界、主要数据来源或组件组合时更新本文件。
- DTO、endpoint、错误、Client 请求 / 响应变化只更新 Frontend API Map；组件内部状态和算法只更新 Component Map / current code。
- 患者施测逐题与安全业务合同只更新 Patient Administration Contract；测试 evidence 只更新 testing playbook。
- 遵循 reference, don't restate；“同步相关文档”只在本 route projection 确实变化时更新，没有 route 职责变化则保持 zero diff。
- 不得在页面未实现前写成 current route，也不得把 Route Map 扩展成 API 规格、业务合同或 release notes。
