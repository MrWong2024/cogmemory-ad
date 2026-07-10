# CogMemory AD / 智忆评 前端组件地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端稳定复用组件、feature 组件、Hook 与 API Client 的路径、职责、输入输出、使用页面和边界。

## 2. 当前状态

- `frontend\src\components\ui` 提供 `Button`、`Card`、`Badge` 三个无业务语义公共组件。
- `frontend\src\features\auth` 提供 B1 最小认证接入能力。
- `frontend\src\features\patients` 提供 B2 患者档案与评估访视最小业务闭环。
- `frontend\src\features\assessments` 提供 B3 访视详情、量表安全目录与量表实例初始化能力。
- 当前组件遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信视觉基线。
- B2 / B3 未新增公共 Input 组件、第三方 UI 库、状态管理库、数据请求库或权限菜单组件。

## 3. 公共 UI 组件

### 3.1 `Button`

- 路径：`frontend\src\components\ui\Button.tsx`
- 职责：低干扰、高可读的基础按钮
- 输入：原生 `button` 属性；`variant` 支持 `primary`、`secondary`、`ghost`；`size` 支持 `sm`、`md`、`lg`
- 使用页面 / 组件：`LoginForm`、`AuthDashboard`、patients feature 表单与分页组件
- 边界：不包含登录、权限或评估业务语义

### 3.2 `Card`

- 路径：`frontend\src\components\ui\Card.tsx`
- 职责：基础信息容器及标题、描述、内容组合结构
- 导出：`Card`、`CardHeader`、`CardTitle`、`CardDescription`、`CardContent`
- 使用页面 / 组件：公共首页、not-found、`/login`、`AuthDashboard` 与 patients feature 页面组件
- 边界：不内置患者、评估或报告数据模型

### 3.3 `Badge`

- 路径：`frontend\src\components\ui\Badge.tsx`
- 职责：低饱和状态标签
- 输入：基础 `span` 属性；`tone` 支持 `neutral`、`info`、`success`、`warning`
- 使用页面 / 组件：公共首页、not-found、`/login`、`/dashboard`、`AuthDashboard` 与 patients feature 状态展示
- 边界：仅用于状态摘要，不驱动权限逻辑

## 4. Auth feature

### 4.1 `LoginForm`

- 路径：`frontend\src\features\auth\components\LoginForm.tsx`
- 职责：检查已有会话、提交账号密码、映射统一错误文案并在成功后进入 `/dashboard`
- 输入：无 props
- 输出：账号密码表单或认证状态提示
- 使用页面：`/login`
- 状态：已有会话 loading、已认证跳转、登录提交中、统一认证失败、服务不可用
- 安全边界：密码不进入 React state，不写入 URL、日志或持久化存储；不展示测试账号、注册或找回密码入口

### 4.2 `AuthDashboard`

- 路径：`frontend\src\features\auth\components\AuthDashboard.tsx`
- 职责：承载 `/dashboard` 的客户端会话校验、公开用户信息展示、患者档案真实入口、登出和静态后续能力占位
- 输入：无 props
- 输出：loading / authenticated / unauthenticated / error 对应界面
- 使用页面：`/dashboard`
- 边界：不是完整医生业务工作台；Dashboard 自身不调用患者 API，不实现权限菜单

### 4.3 `useAuth`

- 路径：`frontend\src\features\auth\hooks\use-auth.ts`
- 职责：组件挂载时调用 `getMe()`，维护认证状态，并提供 `refresh()` 与 `signOut()`
- 输出：`status`、公开 `user`、稳定 `error`、`refresh()`、`signOut()`
- 状态：`loading`、`authenticated`、`unauthenticated`、`error`
- 使用组件：`LoginForm`、`AuthDashboard`、`PatientsWorkspaceShell`
- 边界：轻量局部 Hook，不是全局权限系统；不使用 localStorage / sessionStorage

### 4.4 Auth API Client

- 路径：`frontend\src\features\auth\api\auth-api.ts`
- 职责：提供 `login()`、`logout()`、`getMe()` 与稳定 `AuthApiError`
- 输入 / 输出：使用 `frontend\src\features\auth\types\auth.ts` 中的认证公开类型
- 调用范围：只调用 `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`
- 边界：所有请求使用 `frontendEnv.apiBaseUrl` 与 `credentials: 'include'`；不记录敏感响应，不泛化为完整业务 SDK

### 4.5 Auth 类型

- 路径：`frontend\src\features\auth\types\auth.ts`
- 职责：定义 `AuthUserResponse`、`AuthUser`、`LoginRequest`、`LoginResponse`、`MeResponse`、`LogoutResponse`、`AuthState`
- 边界：不包含 token、token hash、`passwordHash`、secret 或 credential 字段；不使用 `any`

## 5. Patients feature

### 5.1 `PatientsWorkspaceShell`

- 路径：`frontend\src\features\patients\components\PatientsWorkspaceShell.tsx`
- 职责：为 `/patients/**` 提供 `useAuth()` 认证 loading / unauthenticated / error / authenticated 工作区，展示工作台、患者档案、当前用户和登出入口
- 输入：`children`
- 边界：不读取 Cookie，不新增 Provider / middleware，不基于前端角色构造权限菜单；后端 Guard 是最终安全边界

### 5.2 `PatientsListPage`

- 路径：`frontend\src\features\patients\components\PatientsListPage.tsx`
- 职责：管理患者列表 URL 筛选、GET 请求取消、分页、空态、401 / 403 与重试
- 数据：调用 `listPatients()`，展示患者公开列表字段
- 边界：keyword 仅传后端，不展示 notes、externalRefs、metadata 或内部字段

### 5.3 `PatientCreateForm`

- 路径：`frontend\src\features\patients\components\PatientCreateForm.tsx`
- 职责：校验并提交患者创建白名单字段，处理编号冲突、校验 / 权限 / 网络错误和成功跳转
- 边界：不实现编辑 / 草稿 / 本地持久化，不提交 status、externalRefs、metadata 或 timestamps

### 5.4 `PatientDetailPage`

- 路径：`frontend\src\features\patients\components\PatientDetailPage.tsx`
- 职责：独立加载患者详情与访视列表，管理访视 URL 筛选、整日日期转换、分页、空态与分区错误；访视行提供“打开访视”链接
- 边界：访视加载失败保留患者详情；不展示 Mixed 内部字段，不在列表页初始化量表或提供“开始评估”入口

### 5.5 `AssessmentVisitCreateForm`

- 路径：`frontend\src\features\patients\components\AssessmentVisitCreateForm.tsx`
- 职责：先读取并确认患者，再校验 visitCode / visitType / assessmentDate / notes，处理访视编号冲突、患者非 active 和成功跳转
- 边界：不提交 patientId、subjectCode、status、operatorSnapshot、状态时间、clinicalContext、metadata 或 timestamps；不创建量表实例

### 5.6 Patients API Client

- 路径：`frontend\src\features\patients\api\patients-api.ts`
- 职责：提供 `listPatients()`、`createPatient()`、`getPatient()`、`listPatientVisits()`、`createPatientVisit()` 与稳定 `PatientsApiError`
- 边界：只调用 A12 五个 API；统一 `frontendEnv.apiBaseUrl`、credentials、no-store，GET 支持 AbortSignal；不记录患者请求 / 响应，不泛化为完整 SDK

### 5.7 患者 / 访视类型

- 路径：`frontend\src\features\patients\types\patient.ts`
- 职责：定义患者 / 访视枚举、公开响应、分页 Query 和创建请求白名单类型
- 边界：JSON Date 为 string；创建类型不包含内部字段或 `operatorSnapshot`

### 5.8 展示 / 日期纯函数

- 路径：`frontend\src\features\patients\lib\patient-display.ts`
- 职责：集中维护中文枚举映射、日期 / 时间格式化、出生日期与访视时间 ISO 转换、访视筛选整日转换、标签解析
- 边界：纯函数与展示字典，不是权限矩阵

### 5.9 patients 局部复用组件

- `PaginationControls`：显示总数、当前页 / 总页数与上一页 / 下一页，不扩展为高级分页控件。
- `PatientStatusBadge`：集中复用患者状态文字和低饱和 Badge tone，不驱动权限判断。

## 6. Assessments feature

### 6.1 `AssessmentVisitExecutionPage`

- 路径：`frontend\src\features\assessments\components\AssessmentVisitExecutionPage.tsx`
- 职责：接收路由 patientId / visitId，独立加载访视执行详情与量表目录，管理无效链接、401 / 403 / 404、GET 取消 / 重试、实例初始化和服务端冲突刷新
- 输出：访视公开字段、实例列表、目录与初始化状态；成功时展示服务端返回的 ScaleInstance 和题目记录骨架数量
- 边界：详情失败不展示初始化表单；POST 不自动重试或乐观创建；不修改访视状态、不跳转题目页面；组件卸载后不更新初始化状态

### 6.2 `ScaleInstanceList`

- 路径：`frontend\src\features\assessments\components\ScaleInstanceList.tsx`
- 职责：按 scaleCode / instanceNo 排序并展示量表名称、版本、实例编号、状态、施测方式、progress、操作者、状态时间、用时和 versionTrace
- 输入：`instances`、可选目录摘要、访视能否初始化
- 空态：未初始化时根据访视状态引导选择目录或说明不可新增
- 边界：目录不可用时只用 scaleCode 大写兜底；不展示数据库内部 ID、ItemResponse、metadata、qualityControlSummary、scoringRule 或 expectedValue；不提供题目入口

### 6.3 `ScaleInitializationPanel`

- 路径：`frontend\src\features\assessments\components\ScaleInitializationPanel.tsx`
- 职责：展示真实 MMSE / MoCA 安全目录、每张卡片的施测方式选择、已初始化 / 访视状态禁用、提交中与 success / conflict / error 状态
- 输入：目录 loading / error / retry、既有 scaleCode、当前初始化 code、反馈、访视状态与初始化回调
- 可访问性：select 有可见 label；错误使用 alert，成功使用 polite live region；按钮禁用时保留明确文字
- 边界：用户不能输入 scaleCode / version；只提供三种确认施测方式；能力摘要明确是配置要求，不表示上传、手写、计时或作答已实现

### 6.4 Assessment Execution API Client

- 路径：`frontend\src\features\assessments\api\assessment-execution-api.ts`
- 职责：提供 `listAvailableScales()`、`getAssessmentVisitExecutionDetail()`、`initializeScaleInstance()` 与稳定 `AssessmentExecutionApiError`
- 边界：只调用 A13 三个 API；统一 `frontendEnv.apiBaseUrl`、credentials、no-store，GET 支持 AbortSignal，POST 重建三个字段白名单且不自动重试；不记录请求 / 响应或泛化为完整 SDK

### 6.5 Assessment Execution 类型

- 路径：`frontend\src\features\assessments\types\assessment-execution.ts`
- 职责：定义安全目录、施测方式、ScaleInstance 安全摘要、访视执行详情和初始化请求 / 响应类型
- 边界：Date JSON 字段使用 string / null；目录类型不包含完整 groups / items、规则、答案或 ObjectId；初始化请求类型不包含任何服务器控制字段

### 6.6 Assessment Execution 展示纯函数

- 路径：`frontend\src\features\assessments\lib\assessment-execution-display.ts`
- 职责：集中维护施测方式、实例状态、操作者角色、配置能力中文摘要、用时格式化和访视可初始化状态判断
- 边界：纯展示与状态辅助函数，不是权限矩阵；`draft` / `in_progress` 前端判断不替代后端最终校验

## 7. 后续同步规则

- 组件事实以实际前端代码和页面使用情况为准。
- 临时页面内结构可不进入本文档，除非形成稳定复用边界。
- 不得在组件、Hook 或 API Client 未实现前写成已存在能力。
- 新增稳定组件后，应同步检查其视觉、交互、可读性与安全边界是否符合前端设计基线。
