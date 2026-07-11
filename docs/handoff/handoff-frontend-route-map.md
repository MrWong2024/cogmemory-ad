# CogMemory AD / 智忆评 前端路由地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端路由、页面职责、访问边界和数据来源，供后续开发、测试和交接使用。

## 2. 当前状态

- 当前包含既有公共、认证、患者 / 访视路由与 B4-B8 共用量表实例路由；B8 未新增路由。
- `/dashboard` 已提供患者档案入口，但仍不是完整医生工作台。
- 当前不包含患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 状态流转、独立评分、评分锁定、认知域、报告、AI、用户管理或权限菜单路由。
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

- 页面名称：量表实例施测执行、媒体证据、正式提交、阶段性评分、人工复核与评分确认
- 页面职责：在既有 A14-A17 能力上接入 A18 单题人工评分与 ScoreResult 显式确认；不新增独立评分路由。
- 动态参数：Server Component 按 Next 16 `params: Promise<{ patientId: string; visitId: string; scaleInstanceId: string }>` 等待参数后传给 `ScaleInstanceExecutionPage`；route 不 fetch、不保存表单状态
- 访问边界：继续复用 `/patients/**` 的 `PatientsWorkspaceShell`；不新增 middleware、BFF 或 Provider，不读取 Cookie；后端 Guard 是最终权限边界
- 数据来源：既有 A14-A17 请求，以及 A18 manual-review PATCH / confirm POST；评分只读刷新仍只使用 latest GET。
- loading / 取消：执行详情 GET 使用 AbortController；重试和卸载取消旧请求，被取消请求不显示服务错误；任一动态 ID 无效时不发请求
- 401 / 403 / 404 / 409：401 返回 `/login`；403 展示无权限与返回 / 退出入口；患者、访视、实例不存在分别使用稳定状态；配置不可用不渲染空白题目页
- 分组：groups 按 order、题目按 itemOrder 排序，使用 groupCode 动态归组；无匹配分组题目进入“其他项目”；button 导航显示每组完成数并支持键盘 focus
- 草稿状态：作答以 itemResponseId 为 key、媒体以 `${itemResponseId}:${evidenceType}` 为 key 存于父级组件内存，切换分组不丢失；顶部区分未保存作答与未上传证据，任一非零时注册 beforeunload，不写 localStorage / sessionStorage
- 作答：支持 boolean、number、text、single / multi choice 原始转录、分步实际回答、提示后表现、媒体类文字说明、缺失原因、计时草稿和操作者备注；不生成选项、答案或评分
- 保存：每题提供保存草稿与保存并标记本题完成；只 PATCH 变化白名单，无变化不请求；成功以服务端 itemResponse 覆盖当前题并用 progress 更新页面，不重新加载整页
- 媒体：photo 支持本地选择和移动端 capture 提示，源图经 Canvas 重新编码为 JPEG；handwriting 支持响应式 1200 × 800 逻辑画布、Pointer Events、最终 PNG 和默认 strokes JSON；证据列表保留 attached / locked / voided 历史，按点击获取短期 URL，attached 可内联确认后作废并重传
- 只读：completed / locked / voided 访视或实例全页只读；scored / locked / voided 题目只读；保留历史安全草稿、证据列表和 attached / locked 预览，但禁用媒体采集、上传和作废
- 隔离：媒体操作不触发 A14 PATCH，不改变作答 dirty、progress、题目完成状态或访视 / 实例 / 题目状态；后端 Guard 与状态校验仍是最终边界
- readiness：执行详情成功后独立加载；失败只在提交区域显示并可重试。A14 保存、A15 上传 / 作废成功后标记 stale；重新检查取消旧 GET，不自动轮询或重试
- 本地阻断：未保存作答、未上传媒体、题目保存中或媒体写入中均阻止确认和 POST；服务器 readiness 仍可查看，且明确不包含本地内容
- 问题定位：带 itemResponseId 的 issue 在当前内存中切换分组、滚动并聚焦题目容器，不修改 URL 或路由参数，不清除其他分组草稿；scale_instance scope issue 不提供定位按钮
- 提交：只有最新 readiness 的 ready / canSubmitNow 为 true、无 blocking 且无本地阻断时展开内联 checkbox；POST 只发送 confirm=true，不自动重试。warning 可展开查看但不阻断
- 成功 / 历史：提交响应或 readiness 服务端状态驱动 completed 只读；不模拟状态，不修改 Visit / ItemResponse。`alreadySubmitted=true` 作为成功处理；completed 初始加载不自动 POST，也不以施测 operatorSnapshot 冒充历史提交操作者
- 阶段性评分查询：仅 completed / locked / voided 实例自动查询一次 latest；draft / in_progress 不请求。查询状态独立于执行详情，失败保留题目、提交回执与媒体历史，支持手工重新加载但不轮询或自动重试
- 阶段性评分计算：仅 completed、Visit 为 draft / in_progress / completed 且 latest 无结果时提供入口；本地 dirty、媒体草稿、题目 / 媒体写请求或 submit 阻断。用户必须展开说明并勾选 checkbox，compute 只发送 confirm=true；页面不自动计算、不自动重试、不支持重算
- 结果展示：直接展示服务端阶段性总分、分组得分、题目分值、结果 / 来源 / review / quality 状态、版本、计算 warning 和 reviewQueue；不重新求和、聚合、补算比例或构造队列。所有结果明确未确认，不输出临床解释
- 原题定位：reviewQueue 仅在 itemResponseId 能匹配当前安全题目时提供“查看原题”，复用 B6 分组切换、滚动与键盘 focus，不修改 URL、不清理其他分组草稿；null / 无法匹配不虚假跳转
- 人工评分：needs_review 与确认前 manual_scored 计分项可打开单一活动表单；0 合法，前端校验 finite number 与服务端 min / max，step 不公开且不猜测。reviewNote trim 后 3–2000；auto_scored、not_scored、过程项、空 itemResponseId 与只读结果无入口。
- 修订与安全摘要：manual_scored 表单一致预填最新服务端人工分值与公开 reviewNote；只展示最新 manualReview 摘要，不展示原始作答、previousScoreValue、metadata 或完整历史。查看作答只能通过“查看原题”定位。
- 乐观并发：表单展开冻结 ScoreResult.updatedAt；latest 或其他完整响应导致版本变化时草稿 stale 并禁止提交。冲突保留输入、自动刷新一次 latest，但不自动重试 PATCH；用户明确“基于最新结果继续”后才更新基线。
- 草稿：人工评分与确认意见只保存在 React 内存；页面刷新丢失。顶部与 beforeunload 独立区分作答、媒体、人工评分和确认意见，不把评分草稿计入题目或媒体数量。
- 确认：仅 computed、isFinal=false、无 pending / queue / warning、total complete、实例 / 访视状态允许且无任何本地草稿或写请求时显示“准备确认评分结果”。第二步要求 3–2000 字确认意见与 checkbox，POST 只发送 confirm=true、reviewNote、expectedUpdatedAt。
- 确认并发：确认区展开冻结 updatedAt；版本变化时保留意见、清除 checkbox、标记 stale。confirmation conflict 刷新 latest 且不重发；warning 不能忽略；alreadyConfirmed=true 按成功处理。
- 最终只读：confirmed / locked 不显示人工评分输入或确认按钮；按服务端 isFinal / totalScore.isFinal 显示确认得分、确认分组得分与确认项目分值，并展示 confirmation 安全摘要。confirmed 不称为 locked，qualityStatus=passed 只称评分复核流程已通过。
- 评分隔离：compute / latest 只允许同步服务端 scaleInstance 摘要，不覆盖 Visit、ItemResponse、作答 / 媒体草稿或 submission readiness，不触发 A14 / A15 写操作
- 只读：completed / locked / voided 实例仍可查看 readiness、作答和历史证据；submit 期间题目保存、图片 / 手写采集、上传与作废临时真实禁用
- 当前非目标：不提供批量评分、lock、void、撤销确认、reopen、rerun、runNo=2、完整评分历史、认知域、报告、诊断、OCR 或 AI；媒体与既有执行非目标不变。
- 关联组件：既有执行与评分组件，以及 `ManualScoreReviewForm`、`ScoreResultConfirmationPanel`。

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
