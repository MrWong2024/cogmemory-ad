# CogMemory AD / 智忆评 前端路由地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端路由、页面职责、访问边界和数据来源，供后续开发、测试和交接使用。

## 2. 当前状态

- 当前包含公共首页、登录页、轻量工作台、B2 四条患者 / 访视路由、B3 访视详情路由、B4 / B5 量表实例施测执行与媒体证据共用路由，以及 not-found 兜底；B5 未新增路由。
- `/dashboard` 已提供患者档案入口，但仍不是完整医生工作台。
- 当前不包含患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 状态流转、整份量表最终提交、评分、认知域、报告、AI、用户管理或权限菜单路由。
- 当前不包含 Next middleware 或路由级服务端认证中间件。

## 3. 当前路由清单

### 3.1 `/`

- 页面名称：公共首页占位
- 页面职责：展示 CogMemory AD / 智忆评认证接入底座状态，并提供 `/login` 与 `/dashboard` 入口
- 访问边界：公开
- 数据来源：静态内容，无 API 调用
- 加载态 / 错误态：不适用
- 关联组件：`Badge`、`Card`、Next `Link`
- 备注：仍非完整产品门户或业务工作台

### 3.2 `/login`

- 页面名称：机构账号登录
- 页面职责：提供账号密码登录；已有有效会话时进入 `/dashboard`
- 访问边界：公开
- 数据来源：`GET /auth/me`、提交时 `POST /auth/login`
- 加载态：确认已有会话时显示“正在确认登录状态...”；提交时按钮禁用并显示“正在登录...”
- 错误态：登录认证失败显示统一文案；服务异常显示稳定连接错误，不展示后端细节
- 成功态：`router.replace('/dashboard')`
- 关联组件：`Badge`、`Card`、`LoginForm`、`useAuth`
- 备注：不提供注册、密码重置、短信验证码、OAuth / SSO 或测试账号

### 3.3 `/dashboard`

- 页面名称：轻量工作台
- 页面职责：通过认证探针恢复状态，展示当前用户公开信息与角色摘要，提供患者档案真实入口和登出入口
- 访问边界：需要有效会话；当前由 Client Component 调用 `GET /auth/me` 判断，不使用 middleware
- 数据来源：`GET /auth/me`；登出时调用 `POST /auth/logout`
- 加载态：显示正在验证认证状态
- 未认证态：显示会话失效提示并 `router.replace('/login')`
- 错误态：显示稳定认证服务错误，提供重新检查与返回登录页入口
- 已认证态：显示 `displayName`、`accountName`、`roles`、可选 `userType`
- 关联组件：`Badge`、`Button`、`Card`、`AuthDashboard`、`useAuth`
- 备注：Dashboard 自身不调用患者 API；患者档案卡片链接到 `/patients`，MMSE / MoCA、历史结果深化、报告确认与科研导出仍标注“后续建设”

### 3.4 `/patients`

- 页面名称：患者档案列表
- 页面职责：分页查看患者公开档案，按 keyword / status / sourceType 筛选，并进入患者详情或新建患者
- 访问边界：`PatientsWorkspaceShell` 使用 `useAuth()`；loading 显示认证检查，unauthenticated 返回 `/login`，认证服务 error 提供重试；后端 Guard 仍是最终权限边界
- 数据来源：`GET /patients`
- 状态：首次 / 列表加载、无记录、筛选无结果、网络错误、401 跳转、403 无权限、上一页 / 下一页
- 关联组件：`PatientsListPage`、`PaginationControls`、`PatientStatusBadge`
- 当前非目标：不在前端重新搜索，不提供编辑、删除、归档或合并

### 3.5 `/patients/new`

- 页面名称：新建患者
- 页面职责：按 `CreatePatientDto` 白名单创建患者，成功后跳转患者详情
- 访问边界：复用 `/patients/**` 认证工作区；API 401 返回登录，403 显示无权限
- 数据来源：`POST /patients`
- 状态：表单校验、提交中、患者编号冲突、网络错误与稳定成功跳转
- 关联组件：`PatientCreateForm`
- 当前非目标：不提交 status、externalRefs、metadata 或 timestamps；不提供编辑、草稿或本地持久化

### 3.6 `/patients/[patientId]`

- 页面名称：患者详情与评估访视列表
- 页面职责：展示患者公开档案，在同页分页查看访视并按 status / visitType / dateFrom / dateTo 筛选；每条访视提供“打开访视”入口
- 动态参数：Server Component 按 Next 16 `params: Promise<{ patientId: string }>` 等待参数后传入 Client Component
- 访问边界：复用 `/patients/**` 认证工作区；400 显示链接无效，404 显示患者不存在，401 返回登录，403 显示无权限
- 数据来源：`GET /patients/:patientId`、`GET /patients/:patientId/visits`
- 状态：患者与访视独立 loading / error；访视失败保留患者详情；空访视、筛选无结果、分页、日期范围前端校验
- 关联组件：`PatientDetailPage`、`PaginationControls`、`PatientStatusBadge`
- 当前非目标：不展示 externalRefs、metadata、clinicalContext；不在列表页直接初始化量表，不提供“开始评估”、访视编辑 / 删除 / 状态流转入口

### 3.7 `/patients/[patientId]/visits/new`

- 页面名称：新建评估访视
- 页面职责：先读取患者公开信息并确认 active 状态，再按 `CreateAssessmentVisitDto` 白名单创建访视，成功后返回患者详情
- 动态参数：Server Component 按 Next 16 `params: Promise<{ patientId: string }>` 契约实现
- 访问边界：复用 `/patients/**` 认证工作区；患者不存在 / 非 active、401、403、校验和冲突均有独立状态
- 数据来源：`GET /patients/:patientId`、`POST /patients/:patientId/visits`
- 关联组件：`AssessmentVisitCreateForm`、`PatientStatusBadge`
- 当前非目标：不提交 operatorSnapshot、clinicalContext、metadata、状态或状态时间；不自动创建量表实例，不启动计分或报告

### 3.8 `/patients/[patientId]/visits/[visitId]`

- 页面名称：访视详情与量表初始化
- 页面职责：展示访视公开详情、已有量表实例安全摘要、MMSE / MoCA 可用目录，并为尚未存在的量表初始化实例
- 动态参数：Server Component 按 Next 16 `params: Promise<{ patientId: string; visitId: string }>` 等待参数后传给 `AssessmentVisitExecutionPage`
- 访问边界：复用 `/patients/**` 的 `PatientsWorkspaceShell`；不新增 middleware / Provider，不读取 Cookie；后端 Guard 是最终安全边界
- 数据来源：`GET /patients/:patientId/visits/:visitId`、`GET /scales/available`、`POST /patients/:patientId/visits/:visitId/scale-instances`
- loading：认证检查由工作区承担；访视详情和量表目录各自独立 loading、AbortController、错误与重试；目录失败仍保留访视和既有实例
- 链接无效：任一动态参数不符合 24 位 MongoId 时不发送 A13 请求，显示“访视链接无效”并提供返回入口
- 401 / 403 / 404：401 返回 `/login`；403 显示无权限及工作台 / 退出登录入口；患者不存在与访视不存在或归属不符使用不同稳定文案
- 初始化能力：仅 `draft` / `in_progress` 可操作；选择三种已确认施测方式之一，只提交 scaleCode / scaleVersion / administrationMode；已初始化 scaleCode 禁用按钮；重复冲突刷新详情
- 成功：以服务端返回的 ScaleInstance 更新列表并展示 `createdItemResponseCount` 题目记录骨架数量，不展示 ItemResponse 全量
- 安全边界：目录不展示完整 groups / items、指导语、答案、scoringRule、expectedValue 或内部 ObjectId；能力标识不表示媒体、手写或计时已实现
- 当前非目标：不在访视详情内读取或保存题目，不提供整份提交、开始 / 暂停 / 结束、访视状态流转、媒体、计分、认知域、报告或 AI 操作
- 关联组件：`AssessmentVisitExecutionPage`、`ScaleInstanceList`、`ScaleInitializationPanel`

### 3.9 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]`

- 页面名称：量表实例施测执行、逐题草稿与媒体证据
- 页面职责：展示患者 / 受试者编号、访视、量表身份与版本、实例、实时进度、服务端动态分组和安全题目；按题手工编辑并保存 A14 白名单草稿，并为含 photo / handwriting 要求的题目提供 A15 证据采集、历史、预览和作废
- 动态参数：Server Component 按 Next 16 `params: Promise<{ patientId: string; visitId: string; scaleInstanceId: string }>` 等待参数后传给 `ScaleInstanceExecutionPage`；route 不 fetch、不保存表单状态
- 访问边界：继续复用 `/patients/**` 的 `PatientsWorkspaceShell`；不新增 middleware、BFF 或 Provider，不读取 Cookie；后端 Guard 是最终权限边界
- 数据来源：A14 执行详情 GET 与单题草稿 PATCH，以及 A15 题目媒体列表、multipart 上传、primary / trajectory 临时访问地址和作废四个接口
- loading / 取消：执行详情 GET 使用 AbortController；重试和卸载取消旧请求，被取消请求不显示服务错误；任一动态 ID 无效时不发请求
- 401 / 403 / 404 / 409：401 返回 `/login`；403 展示无权限与返回 / 退出入口；患者、访视、实例不存在分别使用稳定状态；配置不可用不渲染空白题目页
- 分组：groups 按 order、题目按 itemOrder 排序，使用 groupCode 动态归组；无匹配分组题目进入“其他项目”；button 导航显示每组完成数并支持键盘 focus
- 草稿状态：作答以 itemResponseId 为 key、媒体以 `${itemResponseId}:${evidenceType}` 为 key 存于父级组件内存，切换分组不丢失；顶部区分未保存作答与未上传证据，任一非零时注册 beforeunload，不写 localStorage / sessionStorage
- 作答：支持 boolean、number、text、single / multi choice 原始转录、分步实际回答、提示后表现、媒体类文字说明、缺失原因、计时草稿和操作者备注；不生成选项、答案或评分
- 保存：每题提供保存草稿与保存并标记本题完成；只 PATCH 变化白名单，无变化不请求；成功以服务端 itemResponse 覆盖当前题并用 progress 更新页面，不重新加载整页
- 媒体：photo 支持本地选择和移动端 capture 提示，源图经 Canvas 重新编码为 JPEG；handwriting 支持响应式 1200 × 800 逻辑画布、Pointer Events、最终 PNG 和默认 strokes JSON；证据列表保留 attached / locked / voided 历史，按点击获取短期 URL，attached 可内联确认后作废并重传
- 只读：completed / locked / voided 访视或实例全页只读；scored / locked / voided 题目只读；保留历史安全草稿、证据列表和 attached / locked 预览，但禁用媒体采集、上传和作废
- 隔离：媒体操作不触发 A14 PATCH，不改变作答 dirty、progress、题目完成状态或访视 / 实例 / 题目状态；后端 Guard 与状态校验仍是最终边界
- 当前非目标：不提供整份量表最终提交、批量或自动保存、实时计时器、自动或手工评分、认知域、报告、OCR 或 AI；不提供实时摄像头、音频 / 视频 / PDF / SVG、批量 / 分片 / 客户端直传、物理删除或直接替换
- 关联组件：`ScaleInstanceExecutionPage`、`ScaleExecutionGroupNavigation`、`ItemResponseEditor`、step / prompt / timing 子组件，以及 `ItemEvidenceRequirements`、`MediaEvidencePanel`、`MediaEvidenceList`、`MediaEvidencePreview`、`PhotoEvidenceCapture`、`HandwritingEvidenceCanvas`

### 3.10 `not-found`

- 页面名称：404 兜底页
- 页面职责：处理未匹配地址并提供返回首页入口
- 访问边界：公开
- 数据来源：静态内容
- 错误态：页面自身即为兜底展示
- 关联组件：`Badge`、`Card`
- 备注：不调用后端

## 4. 后续同步规则

- 路由事实以实际前端代码、路由文件和业务文档为准。
- 不得在页面未实现前写成已存在路由。
- 路由涉及接口调用时，应同步更新 `docs\handoff\handoff-frontend-api-map.md`。
- `/dashboard` 仍是轻量入口；只有更多医生业务能力真实落地后才能更新为完整医生业务工作台。
