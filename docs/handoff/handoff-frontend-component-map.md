# CogMemory AD / 智忆评 前端组件地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端稳定复用组件、feature 组件、Hook 与 API Client 的路径、职责、输入输出、使用页面和边界。

## 2. 当前状态

- `frontend\src\components\ui` 提供 `Button`、`Card`、`Badge` 三个无业务语义公共组件。
- `frontend\src\features\auth` 提供 B1 最小认证接入能力。
- `frontend\src\features\patients` 提供患者档案、评估访视与 B17 患者历史/基础趋势。
- `frontend\src\features\assessments` 已推进至 B17；在既有报告 workflow 外新增独立版本面板、历史报告只读详情与共享安全只读内容。
- 当前组件遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信视觉基线。
- B2-B17 未新增公共 Input 组件、第三方 UI 库、状态管理库、数据请求库或权限菜单组件。

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
- B11：在 authenticated 分支用 `PatientsWorkspaceUserProvider` 提供已经由 `useAuth()` 取得的安全 AuthUser；不产生第二次 `/auth/me`。
- 边界：不读取 Cookie，不新增 middleware，不构造完整权限菜单；Context 只供现有工作区后代复用安全用户，后端 Guard 是最终安全边界

### 5.1.1 `PatientsWorkspaceContext`

- 路径：`frontend\src\features\patients\components\PatientsWorkspaceContext.tsx`
- 职责：轻量提供 / 读取 Shell 已取得的 AuthUser，字段仅为 id、accountName、displayName、roles、permissions、可选 userType。
- B11 用法：`AssessmentVisitExecutionPage` 只读取 roles 判断 doctor / admin 确认入口可见性；不根据 displayName、permissions 或报告确认记录猜角色。
- 边界：不请求 Auth API，不读取 Cookie，不持久化用户，不替代后端 RolesGuard。

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
- B4 入口：每个实例链接到 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]`；draft / in_progress 显示“打开量表”，completed / locked / voided 显示“查看量表”
- 边界：目录不可用时只用 scaleCode 大写兜底；列表自身不读取 ItemResponse、不发送 PATCH，不展示 metadata、qualityControlSummary、scoringRule 或 expectedValue，不提供最终提交

### 6.3 `ScaleInitializationPanel`

- 路径：`frontend\src\features\assessments\components\ScaleInitializationPanel.tsx`
- 职责：展示真实 MMSE / MoCA 安全目录、每张卡片的施测方式选择、已初始化 / 访视状态禁用、提交中与 success / conflict / error 状态
- 输入：目录 loading / error / retry、既有 scaleCode、当前初始化 code、反馈、访视状态与初始化回调
- 可访问性：select 有可见 label；错误使用 alert，成功使用 polite live region；按钮禁用时保留明确文字
- 边界：用户不能输入 scaleCode / version；只提供三种确认施测方式；能力摘要明确当前可进入 B4 记录文字说明与计时草稿，但不表示媒体上传、手写轨迹或实时计时器已实现

### 6.4 Assessment Execution API Client

- 路径：`frontend\src\features\assessments\api\assessment-execution-api.ts`
- 职责：提供 `listAvailableScales()`、`getAssessmentVisitExecutionDetail()`、`initializeScaleInstance()`、`getScaleInstanceExecutionDetail()`、`saveItemResponseDraft()`、`getScaleInstanceSubmissionReadiness()`、`submitScaleInstance()` 与稳定 `AssessmentExecutionApiError`
- 边界：只调用 A13 三个、A14 两个与 A16 两个 API；统一 `frontendEnv.apiBaseUrl`、credentials、no-store，GET 支持 AbortSignal，POST / PATCH 重建白名单且不自动重试；submit 严格只接受 `{ confirm: true }`，不记录请求 / 响应或泛化为完整 SDK

### 6.5 Assessment Execution 类型

- 路径：`frontend\src\features\assessments\types\assessment-execution.ts`
- 职责：定义安全目录、施测方式、ScaleInstance 安全摘要、访视执行详情和初始化请求 / 响应类型
- 边界：Date JSON 字段使用 string / null；目录类型不包含完整 groups / items、规则、答案或 ObjectId；初始化请求类型不包含任何服务器控制字段

### 6.6 Assessment Execution 展示纯函数

- 路径：`frontend\src\features\assessments\lib\assessment-execution-display.ts`
- 职责：集中维护施测方式、实例 / 题目 / responseType / prompt / timer / evidence 中文摘要、动态分组、只读原因、保存错误文案、用时格式化和访视可初始化状态判断
- 边界：纯展示与状态辅助函数，不是权限矩阵；`draft` / `in_progress` 前端判断不替代后端最终校验

### 6.7 `ScaleInstanceExecutionPage`

- 路径：`frontend\src\features\assessments\components\ScaleInstanceExecutionPage.tsx`
- 职责：接收 patientId / visitId / scaleInstanceId，加载 A14 安全执行详情，管理 invalid / loading / 401 / 403 / not-found / configuration-unavailable / retry、动态分组、itemResponseId 作答草稿、`${itemResponseId}:${evidenceType}` 媒体草稿、两类待处理计数、beforeunload、逐题 PATCH、实时 progress，以及 B6 独立 readiness / stale / error、题目定位、本地阻断、提交确认、submit 写锁和当前会话 receipt
- 保存：同一题保存期间禁止并发；成功后以响应 itemResponse 覆盖当前题、清除 dirty，并用响应 progress 更新实例摘要，不重新加载整个页面
- 媒体父级职责：分组切换不清除 JPEG Blob / strokes；持有跨分组媒体写锁；只合并 A15 返回的同题同类型 requirement，不改作答 draft / dirty / progress；上传成功或主动清除后减少未上传证据题目数
- B6 合并边界：readiness 成功只替换 ScaleInstance；submit 成功只替换 ScaleInstance、readiness 与 receipt，不修改 Visit、itemResponses 或 drafts。completed 由服务端响应驱动；历史操作者不从 operatorSnapshot 推断
- B7 评分职责：仅在 completed / locked / voided 自动查询 latest；管理独立 AbortController、no_result / forbidden / error、compute 确认 / 写锁 / 幂等回执和稳定错误。submit 成功只触发 latest，不自动 compute
- B7 合并边界：latest / compute 成功使用服务端 ScoreResult 并只同步 ScaleInstance；不修改 Visit、ItemResponse、answer / media drafts、progress 或 readiness，不调用 A14 / A15 写接口
- B9 有限编排：向独立 `useCognitiveDomainResult` 传递来源 ScoreResult、实例 / 访视状态、全部 dirty / writing 阻断、401 回调与评分 latest 刷新回调；在评分面板之后渲染认知域面板。
- B9 合并边界：认知域 Hook 保存完整 A19 detail 与 alreadyComputed 回执；主页面不覆盖 Visit、ItemResponse、ScoreResult、作答 / 媒体 / 人工评分 / 确认草稿，不调用 A14-A18 写接口。
- 通用题目定位：B6 submission issue 与 B7 reviewQueue 共用 itemResponseId -> 分组切换 -> `scrollIntoView()` -> focus 流程；不改 URL 或清理其他分组内存草稿
- 边界：GET 使用独立 AbortController，PATCH 与媒体 / submit POST 不重试；组件卸载后不 setState；不使用 SWR、React Query、Redux、Zustand、localStorage 或 sessionStorage

### 6.8 `ScaleExecutionGroupNavigation`

- 路径：`frontend\src\features\assessments\components\ScaleExecutionGroupNavigation.tsx`
- 职责：用 button 展示服务端动态分组及每组已完成 / 总题数，支持键盘 focus 与文字状态
- 边界：不写死 MMSE / MoCA 分组；无匹配 groupCode 的题目由展示纯函数放入“其他项目”；切换只改变当前可见分组，不清理草稿

### 6.9 `ItemResponseEditor`

- 路径：`frontend\src\features\assessments\components\ItemResponseEditor.tsx`
- 职责：展示题目标题、CRF、指导语、操作说明、认知域编码、计入总分标识、状态、证据要求与已有草稿；提供类型对应编辑、missing、operatorNote、保存草稿和标记本题完成
- 普通类型：boolean 保存 null / boolean；number 保存有限 number；text 与 single / multi choice 保存 responseText；single / multi choice 只提供原始回答转录，不生成选项或判分
- 媒体类型：继续保留 drawing / photo_upload / handwriting 的原始文字说明；另将归属 ID、只读状态、媒体草稿、写锁和回调传给 `ItemEvidenceRequirements`，媒体操作不触发 `onChange(draft)` 或 A14 保存
- 安全边界：不显示 scoringRule、expectedValue、正确答案、score、isCorrect、scoreValue；已有 structuredResponse 仅显示存在性提示，不提供 JSON 编辑器

### 6.10 `ItemStepEditor`

- 路径：`frontend\src\features\assessments\components\ItemStepEditor.tsx`
- 职责：只渲染服务端已有 stepResponses 槽位，只编辑 actualValue 与 note；number / multi_step_calculation 的非空 actualValue 转有限 number，其他类型保存 string
- 边界：不新增槽位，不显示 expectedValue、isCorrect、scoreValue，不判断连续减 7 等步骤是否正确

### 6.11 `ItemPromptEditor`

- 路径：`frontend\src\features\assessments\components\ItemPromptEditor.tsx`
- 职责：展示 promptText、提示类型中文名和服务端 countsTowardScore 标识，只编辑 responseAfterPrompt 与 note
- 边界：不新增服务端未返回槽位，不推断或显示 isCorrect

### 6.12 `ItemTimingEditor`

- 路径：`frontend\src\features\assessments\components\ItemTimingEditor.tsx`
- 职责：为 timed_task、requiresTimer 或 duration evidence 题目编辑 startedAt、completedAt、秒口径 duration 和 timerSource 草稿
- 边界：不是实时计时器，不提供开始 / 暂停 / 继续 / 结束；提交前由纯函数转非负整数毫秒并校验时间先后

### 6.13 `ItemEvidenceRequirements`

- 路径：`frontend\src\features\assessments\components\ItemEvidenceRequirements.tsx`
- 职责：保留服务端全部 evidenceRequirements 的类型、状态与 attached 安全文字展示；对 photo / handwriting requirement 挂载真实 `MediaEvidencePanel`，audio 与其他类型仍仅展示状态
- 边界：不修改作答草稿，不为 duration / raw_text / operator_note / audio / other 编造媒体接口；明确上传不代表题目完成或评分

### 6.14 A14 类型与草稿纯函数

- 类型路径：`frontend\src\features\assessments\types\item-response-execution.ts`
- 类型职责：严格定义 A14 安全执行响应、JsonValue、response / status / prompt / timer / evidence 枚举和 PATCH 白名单；Date JSON 使用 string / null
- 纯函数路径：`frontend\src\features\assessments\lib\item-response-draft.ts`
- 纯函数职责：服务端 ItemResponse 到本地 draft、missing 清空、字段级和递归值 dirty 比较、数值 / datetime-local / duration 转换、基础有效作答判断、step / prompt / timing 差异与 PATCH 构建
- 边界：不修改原响应对象，不使用 any，不以整对象 JSON.stringify 作为 dirty 策略，不定义评分规则、答案或任意 JSON 编辑能力

### 6.15 `MediaEvidencePanel`

- 路径：`frontend\src\features\assessments\components\MediaEvidencePanel.tsx`
- 职责：识别 photo / handwriting requirement，组件实际渲染时按题加载 A15 列表，管理 loading / error / retry、上传 / 作废调用、临时 URL 内存缓存和稳定错误文案
- 写入：调用父级同题同类型写锁；成功以服务端 mediaEvidence 合并列表、以 evidenceRequirement 通知父级并清除对应媒体草稿；重复 attached 冲突刷新列表且不自动重传
- 读取：access-url 按 evidenceId + asset 缓存，按 expiresAt 与 30 秒余量复用；组件卸载取消 GET 并清理内存状态，不取消已到达后端的 POST
- 边界：不触发 A14 PATCH，不保存 token、文件 URL 或后端大对象到持久化存储，不泛化为全站上传框架

### 6.16 `MediaEvidenceList` / `MediaEvidencePreview`

- 路径：`frontend\src\features\assessments\components\MediaEvidenceList.tsx`、`MediaEvidencePreview.tsx`
- 列表职责：展示 evidenceCode、类型、采集方式、状态、存储状态、MIME、大小、图片 / 轨迹摘要、时间、操作者、质量、说明与备注；保留 attached / locked / voided 历史
- 预览职责：点击后请求 primary 或 trajectory；primary 可内联预览和新窗口打开，trajectory 只提供安全外链，不渲染 JSON；链接与图片使用 no-referrer / noreferrer / noopener
- 作废：仅 attached 且可编辑时显示内联确认，原因必须 3–1000 字符；作废文案明确历史保留，不写成删除
- 隐私边界：不展示内部归属、Storage 对象定位、原始文件名、校验和、任意 metadata / qualityHints、凭据或删除时间

### 6.17 `PhotoEvidenceCapture`

- 路径：`frontend\src\features\assessments\components\PhotoEvidenceCapture.tsx`
- 职责：提供已有图片选择与 `capture="environment"` 纸笔结果提示；源 File 只进入一次异步处理，input value 立即重置，成功后父级仅保存 JPEG Blob 和安全元数据
- 预览 / 表单：展示重编码本地预览、尺寸、大小、captureMode、paper_scan 页码、isColor、采集说明、描述与媒体操作者备注
- 边界：不调用实时摄像头，不保留或显示源文件名，不上传原始 File / Base64，不读取 EXIF / XMP，不提供裁剪、旋转、滤镜或图像诊断

### 6.18 `HandwritingEvidenceCanvas`

- 路径：`frontend\src\features\assessments\components\HandwritingEvidenceCanvas.tsx`
- 职责：1200 × 800 固定逻辑 Canvas 响应式显示，支持 Pointer Events、pointer capture、stylus / finger / mouse、撤销、清空、笔数 / 点数 / 工具文字状态和明确上传
- 上传：至少一笔；从当前 Canvas 生成不超过 10 MiB 的 PNG；默认生成不超过 2 MiB 的 strokes JSON，可关闭轨迹；上传 metadata 按当前笔迹推导输入工具、笔数、相对时长和画布尺寸
- 边界：`touch-action: none`；最多 8000 点；轨迹不含业务 ID、绝对时间或 userAgent；不输出 SVG，不实现颜色、图层、橡皮擦、套索、识别或任意二进制轨迹

### 6.19 B5 类型、API 与纯函数

- `types/media-evidence.ts`：A15 安全公开响应、access、requirement 与 multipart 白名单类型；JSON Date 使用 string / null，不定义 Storage 或内部归属字段
- `types/handwriting-evidence.ts` / `types/media-evidence-draft.ts`：固定 trajectory 结构与 photo / handwriting React 内存草稿；不保存源 File 名称或 signed URL
- `api/media-evidence-api.ts`：四个 A15 方法、credentials / no-store、GET AbortSignal、FormData 白名单、固定安全文件名和稳定业务错误映射；POST 不重试
- `lib/media-evidence-image.ts`：白色 Canvas JPEG 重编码、2560 最长边、0.9 初始质量、有界压缩与 10 MiB 限制
- `lib/handwriting-evidence.ts`：坐标 / 压力归一化、工具 / 时长推导、轨迹验证、Canvas 重绘和 PNG 生成
- `lib/media-evidence-display.ts`：安全展示字典、文件大小、排序、active / access 有效性和中文错误映射

### 6.20 `ScaleInstanceSubmissionPanel`

- 路径：`frontend\src\features\assessments\components\ScaleInstanceSubmissionPanel.tsx`
- 职责：展示 submissionState、ready / canSubmitNow、checkedAt、九项 summary、独立 loading / error / retry、readiness stale、本地未保存 / 写请求计数、阻断问题、可展开 warning、内联二次确认、提交中状态与当前会话回执
- 确认：readiness / dirty / 写请求 / 页面状态 / submitting 变化时重置 checkbox；只有最新服务器条件和本地条件同时满足才允许确认按钮，warning 数量明确显示但不阻断
- 历史边界：completed 无当前会话回执时只展示 ScaleInstance.completedAt，并说明只读 API 未提供历史提交操作者；不自动调用 submit POST 获取审计

### 6.21 `ScaleSubmissionIssueList`

- 路径：`frontend\src\features\assessments\components\ScaleSubmissionIssueList.tsx`
- 职责：语义化展示 blocking / warning 列表，按受控 code 使用稳定中文标题和说明，仅附加允许的安全字段
- 定位：只为 item scope 且含 itemResponseId 的 issue 提供 button；scale_instance scope 不提供虚假跳转
- 安全边界：不把后端 message 当主文案，不展示或推断作答、正确答案、expectedValue 或评分

### 6.22 A16 类型与 submission 展示纯函数

- 类型路径：`frontend\src\features\assessments\types\scale-instance-submission.ts`
- 类型职责：严格定义 15 个 issue code、severity / scope、summary、8 个 submissionState、安全 operator / audit、严格 `{ confirm: true }` 和两个 A16 响应；Date JSON 使用 string
- 纯函数路径：`frontend\src\features\assessments\lib\scale-instance-submission-display.ts`
- 纯函数职责：issue、severity、submissionState、durationSource、required evidence 和提交 API 错误的稳定中文映射，以及安全 issue 辅助详情构建
- 边界：不定义或读取作答原文、评分、expectedValue、mediaEvidenceId 或 metadata，不将 warning 降级 / 升级为其他 severity

### 6.23 B6 媒体写成功回调链

- `ItemResponseEditor` -> `ItemEvidenceRequirements` -> `MediaEvidencePanel` 最小新增 `onEvidencePersisted` 回调，只在 A15 上传或作废成功后通知父级标记 readiness stale
- 媒体列表 GET、access URL GET 和 requirement 只读对齐不会触发该回调；A14 / A15 请求体、媒体草稿、写锁和既有保存语义不变

### 6.24 `ProvisionalScoringPanel`

- 路径：`frontend\src\features\assessments\components\ProvisionalScoringPanel.tsx`
- 职责：展示查询 / 首次计算状态，并组合 B8 人工评分表单、回执、显式确认与 final / provisional 子组件。
- 状态边界：draft / in_progress 只提示先提交；completed 无结果且 Visit / 本地状态允许时才可计算；有结果后严格按服务端状态开放人工复核 / 确认；locked / voided 只读。没有自动 compute、轮询或重算。
- 可访问性：错误使用 alert，查询 / 计算 / 成功使用 polite live region；checkbox 有可见 label，按钮 disabled 不只依赖颜色

### 6.25 `ProvisionalScoreSummary`

- 路径：`frontend\src\features\assessments\components\ProvisionalScoreSummary.tsx`
- 职责：直接展示后端 totalScore 的 provisionalScoreValue、范围、scorePercent、五项计数、isComplete 与 isFinal
- 边界：不求和、不补算比例；部分得分只写“当前已可靠计算”，null 不显示为 0，结果始终保留未确认声明

### 6.26 `ProvisionalScoreGroupList`

- 路径：`frontend\src\features\assessments\components\ProvisionalScoreGroupList.tsx`
- 职责：按 order（缺失末尾）/ groupCode 排序副本，展示服务端 groupScores 的标题、编码、分值范围、四项计数和完整性
- 边界：不重新聚合、不写死 MMSE / MoCA 分组、不称为认知域结果、不输出临床解释

### 6.27 `ProvisionalScoreItemList`

- 路径：`frontend\src\features\assessments\components\ProvisionalScoreItemList.tsx`
- 职责：展示服务端 itemScores 的安全题目标识、配置标识、阶段性分值、范围、状态、来源、缺失、认知域编码和受控复核原因
- 边界：null 不显示为 0，needs_review 不渲染为系统错误，countsTowardTotal=false 显示过程记录；不显示正确 / 错误、作答或评分依据

### 6.28 `ScoreReviewQueue`

- 路径：`frontend\src\features\assessments\components\ScoreReviewQueue.tsx`
- 职责：按后端原顺序展示 reviewQueue 安全题目标识与 reason code 中文映射；仅对可匹配 itemResponseId 提供“查看原题”
- 边界：不从 itemScores 构造队列；null / 无法匹配不提供虚假定位；不展示作答、图片 / 轨迹、媒体地址、expectedValue、正确答案、评分规则或内部依据，不提供人工评分输入

### 6.29 B7 类型

- 路径：`frontend\src\features\assessments\types\provisional-scoring.ts`
- 职责：严格定义 A17 真实 result / source / mode / item / review / quality 枚举、12 个 reason code、2 个 warning、scale / version / total / group / item / computation / reviewQueue 和请求 / 响应
- 边界：Date JSON 使用 string / null；不定义作答、expectedValue、scoringRule、metadata、qualityHints、reviewer 或媒体内部字段

### 6.30 Provisional Scoring API Client

- 路径：`frontend\src\features\assessments\api\provisional-scoring-api.ts`
- 职责：提供 `getLatestProvisionalScoreResult()`、`computeProvisionalScoreResult()` 与稳定 `ProvisionalScoringApiError`
- 边界：只调用 A17 latest / compute；credentials / no-store，GET 支持 AbortSignal，POST 只重建 `{ confirm: true }` 且不重试；不记录请求 / 响应或泛化为评分 SDK

### 6.31 B7 展示纯函数

- 路径：`frontend\src\features\assessments\lib\provisional-scoring-display.ts`
- 职责：集中维护结果、来源、模式、题目、review、quality、reason、warning、错误和 number / percent / Date 安全展示
- 边界：未知枚举 / code 使用稳定兜底且不输出内部字符串；不计算分数 / 比例、不构造 reviewQueue、不推断诊断

### 6.32 `ManualScoreReviewForm`

- 路径：`frontend\src\features\assessments\components\ManualScoreReviewForm.tsx`
- 职责：展示安全题目标识、状态 / 来源、min / max、当前 manualReview、复核原因、冻结的 updatedAt 基线，以及人工分值与 reviewNote 输入；提供保存、放弃、查看原题和 stale 后“基于最新结果继续”。
- 校验：0 合法；空值、非 finite、超出 min / max 与 note 非 3–2000 字符阻止提交。input 使用 `step="any"`，不猜测服务端未公开的 step。
- 边界：同一时刻由父级只允许一个活动表单；不展示原始作答、正确答案、expectedValue、scoringRule、metadata、previousScoreValue 或完整审计历史。

### 6.33 `ScoreResultConfirmationPanel`

- 路径：`frontend\src\features\assessments\components\ScoreResultConfirmationPanel.tsx`
- 职责：提供“准备确认 → 确认意见 + checkbox → 确认评分结果”两步内联交互，展示 stale、warning / eligibility 阻断、confirmation 安全摘要和当前会话 confirmationReceipt。
- 最终展示：confirmed / locked 只读；显示确认时间、操作者、角色、意见与弱化 confirmationId。confirmation 缺失时不以施测或 review 操作者冒充。
- 边界：不 force confirm、不忽略 warning、不自动完成访视、不生成认知域、报告或诊断。

### 6.34 B8 评分草稿纯函数

- 路径：`frontend\src\features\assessments\lib\score-review-draft.ts`
- 职责：定义人工评分 / 确认 React 内存草稿，处理 dirty、finite number、min / max、reviewNote、expectedUpdatedAt 请求构建与确认资格判断。
- 修订口径：一致预填当前服务端公开人工分值与最新 reviewNote，便于小修；初始预填本身不计 dirty，用户修改后才计入 beforeunload。
- 边界：不推导 score step，不计算题目、分组、总分、百分比或 reviewQueue，不修改后端响应，不使用浏览器持久化存储。

### 6.35 B8 `ScoreReviewQueue` / `ProvisionalScoreItemList`

- `ScoreReviewQueue`：在后端原队列上为可关联、状态允许的项目提供“人工评分”，继续提供统一“查看原题”；找不到 itemScore 或 itemResponseId 时显示安全异常，不猜测范围。
- `ProvisionalScoreItemList`：展示最新 manualReview 摘要；manual_scored 在确认前提供修订，auto_scored 明确不可人工覆盖，not_scored 明确为过程记录；final 时显示确认项目分值。
- 两者均不直接调用 API，不自行修改队列或汇总。

### 6.36 B8 `ProvisionalScoringPanel`

- 职责：组合人工评分表单、人工回执、确认面板、确认回执与 provisional / final 文案；final 时主标题切换为已确认评分结果。
- 边界：底层 fetch 和写状态仍由 `ScaleInstanceExecutionPage` 管理；面板不在 JSX 中求和或构造汇总。

### 6.37 B8 `ScaleInstanceExecutionPage`

- 状态职责：管理单活动人工评分草稿、确认草稿、baseUpdatedAt、dirty / stale、统一评分写锁、reviewUpdate / confirmationReceipt、fatal 审计阻断与 beforeunload 扩展。
- 结果合并：latest、compute、manual-review、confirm 均通过统一等价路径替换 ScoreResult detail 并只同步 ScaleInstance 摘要；不覆盖 Visit / ItemResponse，不清理作答或媒体草稿。
- 并发：manual / confirm conflict 不自动重试，保留相应输入并刷新 latest；版本变化只标记 stale，用户明确操作后才更新基线。
- 定位：B6 issue、B7/B8 reviewQueue 与人工评分继续共用 itemResponseId -> 分组切换 -> scrollIntoView -> focus；不修改 URL。

### 6.38 B8 Provisional Scoring API Client

- 新增：`reviewScoreItemManually()` 与 `confirmScoreResult()`。
- 边界：五个 / 四个 Path ID 分别编码；credentials / no-store；PATCH / POST 请求体逐字段白名单构建且不重试；完整 A18 错误 code 使用稳定中文映射，不记录临床数据到 console。

### 6.39 `useCognitiveDomainResult`

- 路径：`frontend\src\features\assessments\hooks\useCognitiveDomainResult.ts`
- 职责：独立管理 A19 idle / waiting_for_score / loading / not_found / loaded / forbidden / error、latest AbortController、source ScoreResult 依赖、首次 compute 二次确认、checkbox、写锁、alreadyComputed、稳定错误与手工 reload。
- 自动 latest：实例 completed / locked / voided 且来源评分 confirmed / locked / voided 时查询；来源 ID / 状态 / isFinal 或路由实例变化时重置并按条件重新进入流程。B8 confirm 成功只触发 GET，不触发 POST。
- compute：只在来源 confirmed / locked 且 isFinal、实例 completed、Visit 状态允许、latest not_found 且外部 localBlockReason 为空时开放；只调用 `{ confirm: true }`。冲突 / voided 自动 GET 一次但不重发 POST。
- 边界：不渲染 JSX、不格式化标签、不定位题目、不计算分数 / 百分比 / 贡献，不修改来源 ScoreResult、Visit 或 ItemResponse；无轮询、无 compute 自动重试。

### 6.40 `CognitiveDomainResultPanel`

- 路径：`frontend\src\features\assessments\components\CognitiveDomainResultPanel.tsx`
- 职责：组合来源评分依赖、latest 状态、not_found、forbidden / error、首次计算说明 / checkbox、compute 写入 / 幂等回执、result status / isFinal、非诊断声明和三个结果子组件。
- 安全说明：固定展示完整分值重叠归因、各域不可相加解释量表总分、scorePercent 非疾病概率、结果不能单独形成诊断；已有结果只提供重新加载 GET。
- 可访问性：error 使用 alert，loading / success 使用 polite live region，checkbox 有可见 label，disabled 有文字状态；不使用雷达图或诊断式颜色。

### 6.41 `CognitiveDomainScoreList`

- 路径：`frontend\src\features\assessments\components\CognitiveDomainScoreList.tsx`
- 职责：按 domainCode 排序响应副本，展示安全标题、domainCode、scoreValue、min / max、服务端 scorePercent、weighted 技术值和 item / scored / unscored / missing / review / excluded 全部计数。
- 边界：null 不显示为 0；不求和、平均、排名、归一化、补算比例或生成风险等级。domainTitle 优先后端，再使用集中 domain code 标签，最后原 code。

### 6.42 `CognitiveDomainContributionList`

- 路径：`frontend\src\features\assessments\components\CognitiveDomainContributionList.tsx`
- 职责：按 itemOrder / itemCode / domainCode 排序响应副本，展示 item / CRF / group / domain、weight、countsTowardDomain、score / max、weighted、score status / source、isMissing 和原题核对。
- 定位：仅非空 itemResponseId 可匹配安全题目时回调父级统一定位；null / 无法匹配显示稳定说明，不按 itemCode 猜测。
- 边界：保留同题多 domain 多条合法记录，不合并后计算；排除项明确不计入，scoreValue null 不显示为 0；不显示正确 / 错误，不定义 contribution minScore。

### 6.43 `CognitiveDomainMappingSummary`

- 路径：`frontend\src\features\assessments\components\CognitiveDomainMappingSummary.tsx`
- 职责：展示 mappingVersion / source / mode / domainCodes、严格 policy、四项 interpretation、computation、warning、versionTrace、来源 ScoreResult 安全摘要和弱化结果技术编号。
- 异常：interpretation 不符合 A19 安全字面值时显示 alert，继续展示技术性结果但不扩展临床解释；warning 仅作为内部计算提示，不渲染为患者风险。
- 边界：不编辑 mapping / weight / domainCodes，不模拟 weighted mapping，不重新计算 count / policy / isFinal，不显示原始 Mixed mappingRules。

### 6.44 B9 类型、API 与 display 纯函数

- `types/cognitive-domain-result.ts`：严格对齐 A19 JSON response 与真实 enum；Date 为 string / null，不含原始作答、评分意见、expectedValue、scoringRule、metadata、qualityHints、computedBy 或 contribution minScore。
- `api/cognitive-domain-api.ts`：仅提供 `getLatestCognitiveDomainResult()` 与 `computeCognitiveDomainResult()`；credentials / no-store、Path 编码、GET AbortSignal、完整错误映射、POST `{ confirm: true }` 白名单且不重试。
- `lib/cognitive-domain-display.ts`：集中维护 7 个真实 seed domain code 标签、result / mapping / item / review / quality / score source / warning / error 文案、日期 / 有限数值格式与 interpretation 安全检查。
- 边界：display 不按 scaleCode / itemCode 推断 domain，不计算分数、比例、贡献或诊断，不直接输出未知内部 code。

### 6.45 `useClinicalReport`

- 路径：`frontend\src\features\assessments\hooks\useClinicalReport.ts`
- 职责：独立管理 A20 idle / loading / not_found / loaded / forbidden / error、latest AbortController、访视级内存 scope、1-10 / 唯一性 / 当前实例校验、内联二次确认、generate 写锁、alreadyGenerated、错误与 conflict 后单次 latest；B11 新增统一 `applyClinicalReport(report)` 供 generate / latest / edit / submit / confirm 完整替换报告。
- 自动行为：访视详情成功后只自动 GET latest；没有轮询、GET 自动重试、自动 generate、POST 重试或 A17-A19 readiness 扇出。路由身份 / enabled 变化重置；实例变化只修剪失效 scope 并要求重新核对。
- 边界：Hook 不渲染 JSX、不计算评分 / 比例 / 认知域、不读取原始作答、不生成 narrative、不修改 Visit / ScaleInstance 或其他来源数据，也不持久化 scope。

### 6.46 `ClinicalReportPanel` 与 `ClinicalReportScopeSelector`

- `ClinicalReportPanel`：组合 latest 独立状态、not_found、scope、二次确认、generate loading / error / 幂等回执、loaded 报告、草稿 / 非 AI / 非诊断声明和所有只读展示组件；403 只影响报告区域。
- `ClinicalReportScopeSelector`：稳定排序展示当前访视全部实例；completed / locked 候选和其他状态原因均有文字，checkbox 有可见 label，提供用户触发的前 10 项全选、清空、量表链接和 version 1 scope 固定说明。候选不标记为已满足全部报告条件。
- `AssessmentVisitExecutionPage`：仅承担访视数据到 Hook / Panel 的有限编排；报告区域位于实例列表之后、初始化目录之前。报告生成期间向 `ScaleInitializationPanel` 传递外部写锁，不改变初始化 API。

### 6.47 ClinicalReport 快照、正文与技术组件

- `ClinicalReportSnapshotSummary`：只展示报告生成时 patient / visit 安全快照，null 明确缺失且不从当前档案补齐；组合 score / domain / evidence 子列表。
- `ClinicalReportScoreList`：展示服务端分值 / 范围 / percent / status / quality / summary；null 不写成 0，不补算 percent，不解释阈值或患者状态。
- `ClinicalReportDomainList`：复用 B9 `getCognitiveDomainTitle()`，展示 score / max / percent / weighted / count / review / summary，并固定说明重叠归因、跨域不可求和、结果未独立确认与 percent 非诊断概率。
- `ClinicalReportEvidenceList`：只展示证据类型、采集方式、quality 和安全摘要；不显示图片 / 手写、预览 / 下载、内部 ID 或对象键，不调用媒体 API。
- `ClinicalReportNarrative`：以普通文本只读展示 chief / score / domain / evidence / limitations 五段；另设 clinician-owned 分区按状态只读展示 doctorOpinion / recommendationText。系统五段不可编辑，不使用 HTML 注入，不自行生成、改写或解释临床人员文本。
- `ClinicalReportTechnicalSummary`：展示 generation 审计、历史 confirmation 和原生 details 技术摘要 / scaleTraces；合法 scaleInstanceId 才链接既有单量表路由，不重点展示内部报告 id 或操作者 id。

### 6.48 B10 类型、API 与 display 纯函数

- `types/clinical-report.ts`：现严格覆盖 A20 / A21 公开 enum / response、clinician-owned narrative、editorial / submission / confirmationId 与三类回执；Date JSON 为 string / null，不定义内部来源 ID 数组、对象键、scoreDetails、clinicalContext、metadata、AI draft、signature 或原始作答。
- `api/clinical-report-api.ts`：提供 latest / generate 与 B11 update draft / submit / confirm；credentials / no-store、Path 编码、GET AbortSignal、完整 A20 / A21 错误映射；所有写请求重建白名单且不重试。
- `lib/clinical-report-display.ts`：集中维护 type / status / source / quality / patient / visit / operator / confirmation / score / evidence / capture / error 中文标签，日期 / 有限数值 / 百分比安全格式、status / isFinal 一致性和报告边界说明；mixed 明确非 AI，passed 不解释为患者正常；不计算任何报告事实或诊断解释。

### 6.49 `useClinicalReportWorkflow`

- 路径：`frontend\src\features\assessments\hooks\useClinicalReportWorkflow.ts`
- 职责：管理 activeMode idle / edit / submit / confirm、单一 writingAction、三类 React 内存草稿、dirty / stale、action error、三类当前会话 receipt、liveMessage、角色 gate 与 open / cancel / update / save 方法。
- 并发：表单打开时冻结 reportId / updatedAt；报告版本变化或受控 conflict 保留输入、清除提交 / 确认 checkbox、标记 stale、自动 latest 一次且不重发。用户明确基于最新报告继续后才更新 baseUpdatedAt。
- 生命周期：edit 变化或任一 note 非空时注册 beforeunload；路由 patientId / visitId 改变时清理内存草稿与回执。刷新页面后未保存内容消失是预期行为。
- 权限：roles 精确包含 doctor / admin 才开放确认入口；unknown、nurse、research_assistant 不开放。403 保留报告与本地草稿，后端 Guard 仍是最终边界。
- 边界：不渲染 JSX，不读取 Cookie，不持久化状态，不自动保存 / 提交 / 确认，不自动重试写请求，不分析或生成临床文本。

### 6.50 ClinicalReport workflow draft 纯函数

- 路径：`frontend\src\features\assessments\lib\clinical-report-workflow-draft.ts`
- 职责：创建 edit / submission / confirmation 草稿，trim 规范化、长度校验、实际正文变化 / dirty 判断、安全 ID 判断、严格请求对象构造与 beforeunload 条件。
- 校验：doctorOpinion 3-4000；recommendationText 空或 3-4000；editNote 3-1000；submissionNote / confirmationNote 3-2000。recommendationText 空字符串保留用于清除。
- 边界：不修改服务端对象，不生成 doctorOpinion / recommendationText，不计算诊断，不使用 Date 对象作为 JSON，不写浏览器持久化存储。

### 6.51 `ClinicalReportDraftEditor`

- 路径：`frontend\src\features\assessments\components\ClinicalReportDraftEditor.tsx`
- 职责：只编辑 doctorOpinion、recommendationText、editNote；展示可见 label、字符计数、updatedAt 基线、stale 说明、最新服务端 clinician 文本、保存 / 放弃 / 基于最新报告继续。
- 保存：校验失败、无正文变化、stale、版本不匹配、写入中或报告不再可编辑时 disabled。成功使用完整 report，保存 editReceipt、清空本次表单，不调用 latest。
- 边界：不渲染系统五段 textarea，不编辑快照 / scope / 编号 / 状态，不自动生成或改写文本。

### 6.52 `ClinicalReportSubmissionPanel`

- 路径：`frontend\src\features\assessments\components\ClinicalReportSubmissionPanel.tsx`
- 职责：mixed draft readiness、当前 clinician 文本复核、submissionNote、可见 checkbox 与两步内联提交；明确提交后 pending_confirmation、不可继续编辑、提交不等于确认 / 锁定 / PDF / AI。
- 幂等 / 并发：alreadySubmitted 正常成功；冲突保留 note、清 checkbox、stale、latest 一次且不重发。pending 不显示重复提交入口。

### 6.53 `ClinicalReportConfirmationPanel`

- 路径：`frontend\src\features\assessments\components\ClinicalReportConfirmationPanel.tsx`
- 职责：pending_confirmation 下 doctor / admin 两步内联确认；展示 clinician 文本和 submission 摘要，要求 confirmationNote 与 checkbox。其他角色只读显示等待说明。
- 成功：使用服务端 status / qualityStatus / isFinal，保存 confirmationReceipt 并进入只读；alreadyConfirmed 正常成功。confirmed 不等于 locked，不生成签名 / PDF / AI。

### 6.54 `ClinicalReportWorkflowSummary`

- 路径：`frontend\src\features\assessments\components\ClinicalReportWorkflowSummary.tsx`
- 职责：展示 editorial 最新编辑摘要、submission、confirmationId / 确认摘要，以及当前会话 edit / submission / confirmation receipts。
- 安全边界：operatorId 不作为主业务字段；不显示完整事件、历史 editNote、previous / next、metadata 或 signatureText；技术追溯号弱化显示。

### 6.55 B11 `ClinicalReportPanel` / `AssessmentVisitExecutionPage`

- `ClinicalReportPanel`：在既有 A20 展示后组合 WorkflowSummary、DraftEditor、SubmissionPanel 与 ConfirmationPanel；显示 action live / alert、pending / confirmed 文字边界，系统摘要与 clinician-owned 内容职责分离。
- `AssessmentVisitExecutionPage`：从 PatientsWorkspaceContext 读取 roles，组合 `useClinicalReport` 与 `useClinicalReportWorkflow`；报告写入与量表初始化互斥，但不承载表单细节。
- 无新路由、Provider 层级之外的全局状态、BFF、middleware 或第二次认证请求。

### 6.56 B12 ClinicalReport 类型、API 与锁定草稿

- `types/clinical-report.ts`：新增 `ClinicalReportLockSummary`、`LockClinicalReportRequest`、`LockClinicalReportReceipt`、`LockClinicalReportResponse`，并为 report 增加 `lock`；Date JSON 为 string / null。ClinicalReportStatus 保持六个既有状态，没有 locked。
- `api/clinical-report-api.ts`：新增 `lockClinicalReport()`，路径 ID 编码、reportId MongoId 防御、credentials / no-store；Body 只重建 confirm、trim lockNote、expectedUpdatedAt，POST 不自动重试。新增五个 A22 错误 code 映射，不输出临床数据。
- `lib/clinical-report-workflow-draft.ts`：新增 `ClinicalReportLockDraft` 与创建、校验、dirty、request、基于 latest 继续纯函数。锁定说明 3–2000 字，checkbox 必须为 true，stale 禁止提交；不生成文本、不使用浏览器时间、不持久化。
- `lib/clinical-report-display.ts`：新增锁定生命周期、主事实判断、一致性警告、不可逆说明与锁定专用错误文案。status、lockedAt、lock、isFinal 独立表达，不计算或修改服务端事实。

### 6.57 B12 `useClinicalReportWorkflow`

- activeMode / writingAction 扩展 lock，继续复用同一 report、roles、onUnauthorized、onReportUpdated、refreshLatest 与 reportWriteBlocked；没有第二套 latest、认证或 report 合并逻辑。
- 管理 lockDraft、lockError、lockReceipt、roleCanLock、canLock、dirty / version / stale、基于 latest 继续和 confirmLock。edit / submit / confirm / lock 同一时间只能有一个模式和一个写请求；lockNote dirty 纳入 beforeunload。
- eligibility 先复用统一 lifecycle target：V1 保留 confirmed、mixed、passed、isFinal、完整 doctor / admin confirmation、lockedAt / lock / archivedAt / voidedAt 为空、服务端 updatedAt 与 Visit draft / in_progress / completed；安全 replacement V2+ 保留当前报告条件但不因历史 Patient inactive、Visit locked / voided 阻断。前端公开摘要判断不替代后端 A26。
- LOCK_CONFLICT / NOT_LOCKABLE 保留 lockNote、清 checkbox、标记 stale、最多自动 latest 一次且不重发 POST；用户明确基于最新报告继续后才更新 baseUpdatedAt。latest 已锁定时保留本地说明到明确关闭。
- 成功完整应用 response.report、保存当前会话 receipt、清草稿并回 idle；alreadyLocked true / false 均是成功。lockedAt 非空后所有 B11 / B12 写入口关闭。

### 6.58 `ClinicalReportLockPanel`

- 路径：`frontend\src\features\assessments\components\ClinicalReportLockPanel.tsx`
- 职责：doctor / admin 的“准备锁定报告 → lockNote + 不可逆说明 + checkbox → 确认不可逆锁定”两步内联交互；展示当前真实 status、isFinal、confirmation、updatedAt、字符计数、stale 与写入状态。
- 角色：nurse / research_assistant / unknown 不显示可用按钮，仅显示需医生或管理员并保留只读摘要。后端 RolesGuard 是最终边界。
- 可访问性：textarea / checkbox 有可见 label，错误 / stale 使用 alert，写入 / 成功由页面 polite live region 展示，按钮真实 disabled，小屏幕纵向排列。
- 边界：不用 window.confirm 或弹窗库；不自动生成 / 预填 / 分析 lockNote；该 A22 组件不执行来源冻结，B13 由独立 SourceFreezePanel 承担；不实现 unlock、签名、归档、更正、作废、PDF / 下载或 AI。

### 6.59 B12 报告展示组件与访视编排

- `ClinicalReportWorkflowSummary`：新增持久 lock 摘要与当前 lockReceipt，展示弱化 lockId、锁定时间、锁定人 / 角色与“锁定流程说明”；不展示 operatorId、metadata、Schema 原始 lockedBy 或完整事件。
- `ClinicalReportTechnicalSummary`：真实显示 `status=confirmed`、独立 lockedAt、服务端 isFinal 与锁定生命周期；锁定字段不一致时警告且不自行选择时间。
- `ClinicalReportPanel`：组合 LockPanel，主状态额外显示“已锁定”；已锁定报告只读并明确锁定仅作用于 ClinicalReport，不等于归档 / 签名 / PDF。
- `AssessmentVisitExecutionPage`：仅最小传入 Visit status；继续从 PatientsWorkspaceContext 复用 roles，并通过现有 writingAction 使报告 lock 与量表初始化互斥。未修改 useClinicalReport、认证 Context 或 B10 / B11 请求契约。

### 6.60 B13 ClinicalReport 类型、API 与来源冻结纯函数

- `types/clinical-report.ts`：新增 `ClinicalReportSourceFreezeState`（仅 in_progress / completed）、五类 + total `ClinicalReportSourceFreezeResourceCounts`、持久 `ClinicalReportSourceFreezeSummary` 与 freeze request / receipt / response；Date JSON 为 string / null，不定义内部 scope、来源 ID、metadata、a23SourceFreeze 原始结构、Session 或 currentUser。
- `api/clinical-report-api.ts`：新增 `freezeClinicalReportSources()`；三个 Path ID 编码、reportId MongoId 防御、credentials / no-store，Body 只重建 confirm、trim freezeNote、expectedUpdatedAt。映射 A23 八个业务错误，不自动重试，不记录说明、updatedAt、请求或响应。
- `lib/clinical-report-source-freeze-draft.ts`：独立管理 start / resume 草稿、reportId / baseUpdatedAt、服务端 freezeId、说明、checkbox、stale 与 usesPersistedNote。首次说明可编辑且 3–2000 字；恢复说明来自服务端且只读。提供请求构建、dirty / version、基于 latest 继续、首次 / 恢复资格和安全摘要一致性纯函数。
- 一致性：所有计数必须为非负安全整数，total 等于五类之和；in_progress 完成字段必须为空；completed 要求完成计数 / 时间 / actor 完整、expected=completed、newly+previously=expected。异常只用于警告和阻断写操作，不修正服务端事实、不计算进度。

### 6.61 B13 `useClinicalReportWorkflow`

- activeMode / writingAction 新增 source_freeze，继续复用同一 report、roles、onUnauthorized、onReportUpdated、refreshLatest 与 reportWriteBlocked。edit / submit / confirm / lock / source_freeze 同一时间只有一个活动模式和一个写请求；没有第二套 latest、Auth 或 report 合并路径。
- 管理 sourceFreezeDraft / error / receipt、roleCanFreezeSources、首次 / 恢复 eligibility、dirty / stale / version、consistency warning、block reason、显式转入恢复和 confirmSourceFreeze。首次 note dirty 纳入 beforeunload；恢复只读服务端 note 不计文本 dirty。
- 首次要求统一 lifecycle target、confirmed / mixed / passed / isFinal、当前报告完整一致的锁、sourceFreeze=null、doctor / admin 且无其他草稿 / 写入；V1 继续要求 Visit draft / in_progress / completed，安全 replacement V2+ 不因 Patient inactive 或 Visit locked / voided 阻断。恢复要求安全 target、当前报告 lock、in_progress、原 freezeId / note 与当前 updatedAt。
- conflict / not source freezable / incomplete / failed / voided / not found 最多 latest 一次，保留本地首次 note、清 checkbox、标记 stale且不重发 POST。latest 变为 in_progress 时不自动进入恢复；用户必须明确放弃本地说明并转入服务端原说明。网络不确定结果只提供手工 latest。
- 成功完整应用 response.report、保存内存 receipt、清草稿并回 idle；首次、resumedExisting 与 alreadyFrozen 使用不同稳定文案。receipt 刷新后消失，持久事实来自 report.sourceFreeze。

### 6.62 `ClinicalReportSourceFreezePanel`

- 路径：`frontend\src\features\assessments\components\ClinicalReportSourceFreezePanel.tsx`
- 职责：sourceFreeze=null 时提供“准备冻结报告来源 → 用户 freezeNote + 边界说明 + checkbox → 确认冻结”的两步内联交互；in_progress 时提供原 freezeId / 原说明只读与独立恢复 checkbox；completed 只读且无再次入口。
- 并发：展示 report.status、report.lockedAt、report.updatedAt / baseUpdatedAt；stale 保留首次说明并清 checkbox。latest 发现 in_progress 时提供“关闭并放弃本地说明”与“放弃本地说明并转入恢复现有流程”两个显式操作，不静默替换文本。
- 可访问性：textarea / checkbox 有可见 label，错误 / stale 使用 alert，写入使用 polite live region，按钮真实 disabled，小屏幕纵向排列。POST 期间明确不显示百分比或虚假实时进度。
- 边界：不用 window.confirm 或弹窗库；不自动生成 / 预填 / 分析说明，不自动轮询、重试或恢复，不实现 unfreeze / rollback / PDF / 下载 / AI。

### 6.63 `ClinicalReportSourceFreezeSummary` 与报告展示集成

- 路径：`frontend\src\features\assessments\components\ClinicalReportSourceFreezeSummary.tsx`
- 职责：持久展示 state、freezeId、startedAt、sourceLockedAt、startedBy、completedAt、completedBy、首次说明，以及量表实例 / 题目记录 / 评分结果 / 认知域结果 / 媒体证据 / 合计的 expected / completed / newly / previously 计数；in_progress 的完成列显示“待完成”，不计算百分比。
- 回执：同组件展示当前会话 freeze receipt、alreadyFrozen / resumedExisting 与全部安全计数；不持久化回执，不以 receipt 替代 report.sourceFreeze。
- B16 对 previouslyFrozenCounts 增加说明：共享来源已在前序报告完成不可逆冻结，当前版本只做兼容性验证；不表示再次冻结、遗漏或覆盖原冻结事实。
- `ClinicalReportPanel`：在 LockPanel 后组合 SourceFreezePanel / Summary，新增“来源未冻结 / 冻结未完成 / 来源已冻结”Badge 和一致性 alert；报告正文与快照仍可阅读。
- `ClinicalReportWorkflowSummary`：新增持久来源冻结摘要与当前会话回执；`ClinicalReportTechnicalSummary` 分开显示 report.status、isFinal、report.lockedAt、sourceFreeze.state、sourceLockedAt、startedAt、completedAt、expected / completed total。
- 安全边界：不显示 operatorId 作为主要字段，不显示来源 ID、内部 scope、metadata 或对象明细；不重新读取 A14–A19 或重新统计计数。明确 A23 非 Mongo transaction、可能部分完成、无自动回滚，Patient / Visit / Storage 未冻结，CognitiveDomainResult 冻结不等于确认。

### 6.64 B14 ClinicalReport 类型、API、display 与归档纯函数

- `types/clinical-report.ts`：新增 `ClinicalReportArchiveSummary`、`ArchiveClinicalReportRequest / Receipt / Response`，并为 report 增加 nullable archive。Date JSON 全部为 string / null；不定义 metadata、a24Archive、Schema 原始 archivedBy、来源 ID、correctionRecords、Session 或 currentUser。
- `api/clinical-report-api.ts`：新增 `archiveClinicalReport()`，三个 Path ID 编码、reportId MongoId 防御、credentials / no-store；Body 只重建 confirm、trim archiveNote、expectedUpdatedAt。映射 A24 五个业务错误，不自动重试，不记录说明、updatedAt、请求或响应。
- `lib/clinical-report-display.ts`：新增归档边界说明和稳定错误文案；明确 status=archived、归档不等于删除 / 作废 / 更正 / PDF，不提供 unarchive 且不调用 AI。
- `lib/clinical-report-archive-draft.ts`：独立管理 reportId / baseUpdatedAt、confirmed / locked / sourceFreeze completed 冻结上下文、archiveNote、checkbox、dirty / stale、请求构造和基于 latest 继续。archiveNote trim 后 3–2000 字；不自动生成 / 预填 / 分析，不使用浏览器时间或持久化存储。
- 一致性纯函数：`getClinicalReportArchiveConsistencyWarning()`、`isClinicalReportArchived()`、`isSafeClinicalReportArchive()`、`isClinicalReportArchivable()` 分开处理未归档、完整 A24、历史 fallback、status / archivedAt / archive 与 sourceFreeze anchor 异常。只用于展示与阻断，不修改 report、不补时间 / ID / actor / 锚点。

### 6.65 B14 `useClinicalReportWorkflow`

- activeMode / writingAction 新增 archive，继续复用同一 report、roles、onUnauthorized、onReportUpdated、refreshLatest 与 reportWriteBlocked。edit / submit / confirm / lock / source_freeze / archive 同一时间只有一个模式和一个写请求；没有第二套 latest、Auth 或 archive Hook。
- 管理 archiveDraft / error / receipt、roleCanArchive、canArchive、dirty / stale / version、consistency warning、block reason、基于 latest 继续、手工不确定结果核对与 confirmArchive。archiveNote 非空纳入 beforeunload；路由变化或成功后清除草稿，receipt 仅保存在当前 React 页面内存。
- 首次资格要求统一 lifecycle target、confirmed / mixed / passed / isFinal、完整 doctor / admin confirmation、安全非 fallback lock、completed 且一致的当前报告 sourceFreeze、archivedAt / archive / voidedAt 为空、服务端 updatedAt、doctor / admin、无其他草稿 / 写入 / 一致性警告。V1 原口径不变；安全 replacement V2+ 不因 Patient inactive 或 Visit locked / voided 阻断。
- conflict / not archivable / failed / voided / not found 保留 archiveNote、清 checkbox、标记 stale、最多 latest 一次且不重发 POST。latest 仍可归档时需明确基于最新继续；latest 已 archived 时保留本地说明到明确关闭。audit unavailable / metadata unsupported 禁止继续安全写入；网络错误只提供手工 latest。
- 成功完整应用 response.report、保存 archiveReceipt、清草稿并回 idle；alreadyArchived false / true 均是成功。Hook 由 B13 的 1375 行增至 1651 行；未做大规模重构，归档规则与一致性算法已最小提取到独立纯函数，统一公开 API 与单写锁不变。

### 6.66 `ClinicalReportArchivePanel`

- 路径：`frontend\src\features\assessments\components\ClinicalReportArchivePanel.tsx`
- 职责：提供“准备归档报告 → archiveNote + 不可撤销说明 + checkbox → 确认归档报告”的两步内联交互；展示 status、lockedAt、sourceFreeze.completedAt、report.updatedAt / baseUpdatedAt、字符计数、stale 与写入状态。
- 角色 / 并发：doctor / admin 显示可用入口；nurse / research_assistant / unknown 只读。冲突保留说明并清 checkbox；latest 已 archived 时明确说明本地 note 未写入，只有用户关闭才清除。POST 期间 textarea 与六类报告写操作真实 disabled，报告内容仍可阅读。
- 可访问性：textarea / checkbox 有可见 label，错误与 stale 使用 alert，写入 / 成功使用页面 polite live region，按钮真实 disabled，小屏幕纵向排列。
- 边界：不用 window.confirm 或弹窗库；不自动归档，不生成 / 预填 / 分析 archiveNote，不实现 unarchive / restore confirmed / correct / void / delete / unlock / unfreeze / PDF / Word / 下载或 AI。

### 6.67 `ClinicalReportArchiveSummary` 与报告展示集成

- 路径：`frontend\src\features\assessments\components\ClinicalReportArchiveSummary.tsx`
- 职责：持久展示 archiveId（“归档追溯号”）、archivedAt、actor / role、archiveNote（“归档流程说明”）、sourceFreezeId（“来源冻结锚点”）与 sourceFreezeCompletedAt；另展示当前会话 receipt 和 alreadyArchived。operatorId 不作为主要业务字段。
- fallback：archiveId / sourceFreeze anchor 为空且 actor unknown / 缺姓名时显示“历史归档记录”和缺失字段说明，不猜测 actor、note 或锚点；status / archivedAt / archive 或锚点不一致时 alert 且不开放写入。
- `ClinicalReportPanel`：在 SourceFreezePanel / Summary 后组合 ArchivePanel / Summary，新增“尚未归档 / 报告已归档”Badge 和归档一致性 alert。archived / corrected / voided 保持报告只读，正文、快照、报告锁定与来源冻结摘要继续可阅读。
- `ClinicalReportWorkflowSummary`：新增持久 archive 与当前会话 receipt；`ClinicalReportTechnicalSummary` 分开显示 report.status、isFinal、lockedAt、sourceFreeze.state、archivedAt、archiveId 与 archive sourceFreeze anchor。
- 安全边界：不显示 metadata、Schema 原始 archivedBy、来源 ID 或 correctionRecords；不查询 / 修改来源，不修改 Patient / Visit、lock、sourceFreeze、confirmation、narrative / snapshots / scope，不把归档写成删除、作废、更正或 PDF。

### 6.68 B14.1 ClinicalReport 工作流内部结构

- 公开 façade：`hooks/useClinicalReportWorkflow.ts` 只组合 coordinator、六类 Action 和单一 beforeunload，继续导出原公开 Hook、mode / writing action、显式 options / result 与兼容的 `UseClinicalReportWorkflowValue`。组件只允许 import 此 façade。
- 公共契约：`hooks/clinical-report-workflow/clinical-report-workflow.types.ts` 显式定义 9 字段 options、99 字段 result、七个 mode、中央 state/action 与 coordinator typed contract；不使用 any、index signature 或双重断言。
- 中央状态：`clinical-report-workflow.state.ts` 是纯 reducer，统一管理 activeMode、writingAction、六类 draft / error / receipt、liveMessage、writeProhibited、OPEN / CANCEL / RESET / COMPLETE、clearActionErrors 与 clearAllDrafts。
- 协调器：`useClinicalReportWorkflowCoordinator.ts` 唯一持有 mountedRef / writingRef 和 reducer dispatch，统一 begin / finish write、路由报告身份重置、activate / cancel、401、onReportUpdated、latest 恢复与每次只允许一个写请求。
- 公共恢复 / unload：`clinical-report-workflow-recovery.ts` 固定原 latest error 集合、写阻断分类与最多一次 refresh helper；`useClinicalReportBeforeUnload.ts` 是报告工作流唯一 beforeunload 注册点。
- 六类 Action：`useClinicalReportEditAction.ts`、`useClinicalReportSubmissionAction.ts`、`useClinicalReportConfirmationAction.ts`、`useClinicalReportLockAction.ts`、`useClinicalReportSourceFreezeAction.ts`、`useClinicalReportArchiveAction.ts` 分别独占各自资格、草稿、校验、dirty / stale、block reason、API、错误、成功消息和回执，不互相 import 或修改对方 slice。
- 消费边界：全部 ClinicalReport 组件继续只接收 façade 的扁平结果；内部模块不得被组件直接 import。B15 在此结构上新增第七类 Action，没有把 API 堆回 façade。

### 6.69 B15 correction 类型、纯函数与 Action

- `types/clinical-report.ts`：公开 correction summary、replacement lineage、request / receipt / response；日期保持 string / null，不公开 metadata、原始 correctionRecords、内部审计或五类来源 ID。
- `lib/clinical-report-correction-draft.ts`：管理 start / resume 草稿、3–2000 / 3–4000 校验、dirty / stale、请求白名单、latest 继续、correction 一致性与 replacement lineage 安全判断；不生成 ID、版本、code 或时间。
- `hooks/clinical-report-workflow/useClinicalReportCorrectionAction.ts`：唯一调用 A25 API，管理 roleCanCorrect、首次 / 恢复资格、错误、source / receipt 会话状态与成功切换 replacement。central state 增加 correction slice；activeMode / writingAction 增加 correction，仍只有一个 writingRef / mountedRef / latest / beforeunload。
- 并发：受控错误最多 latest 一次，保留首次 reason / summary、清 checkbox、标 stale 且不重发。latest 出现 in_progress 时只能明确放弃本地输入后转服务端只读恢复；网络不确定只提供手工 latest。

### 6.70 `ClinicalReportCorrectionPanel` / `ClinicalReportCorrectionSummary`

- `ClinicalReportCorrectionPanel.tsx`：内联两步确认，首次文本可编辑，resume 文本来自服务端且只读；显示字符计数、checkbox、stale、401 / 403 / 冲突 / 网络语义。POST 期间共享写锁禁用报告写操作。
- `ClinicalReportCorrectionSummary.tsx`：展示 source correction 编排、replacementOf lineage、版本关系、actor / 时间、reason / summary、archive / sourceFreeze 锚点；replacementReportId / previousReportId 仅作技术追溯，不伪造链接。
- 成功后 `ClinicalReportPanel` 原地展示 replacement，并可在当前会话额外展示 sourceReport 与 receipt；刷新后仅依赖 replacementOf。组件不直接调用 API，不使用持久化存储或诊断式推断。

### 6.71 replacement A21 与生命周期边界

- edit / submit / confirm Action 继续使用 A21 编辑阶段的安全 replacement 判断；合法 replacement 仅 doctor/admin，状态分别为 draft 可编辑、mixed draft 可提交、pending_confirmation 可确认。仍只编辑 doctorOpinion / recommendationText。
- 合法 replacement 不受 Patient inactive、Visit locked / voided 阻断，但仍受 reportWriteBlocked、central writingAction、writeProhibited、updatedAt、状态和 lineage 一致性约束。普通 V1 既有角色与资格不放宽。
- B16 后 A22–A24 不直接复用 A21 的 `isSafeCorrectionReplacement`，因为其要求 lock / sourceFreeze / archive 为空，只适用于编辑阶段；不可逆阶段改用独立 lifecycle target。

### 6.72 B16 replacement 不可逆生命周期

- `lib/clinical-report-lifecycle-target.ts` 集中识别普通 cognitive_assessment V1 与任意安全整数 V2+ replacement。replacement 必须具有完整公开 lineage、相邻版本、当前 reportCode / reportVersion 反向一致及安全 actor / 时间 / 锚点；NaN、Infinity、小数、负数、字符串版本、缺字段或不连续摘要均失败。该守卫只形成 UI 结构门槛，完整双向 lineage 由 A26 后端判定。
- `ClinicalReportPanel` 对安全 V1 / replacement 复用同一套 LockPanel、SourceFreezePanel / Summary、ArchivePanel / Summary；不创建 replacement 专用页面、路由、Hook 或组件。结构不安全时隐藏三类操作控件并显示安全提示；报告正文、质量摘要和 correction summary 保持。
- 三个 Panel 动态显示当前 reportCode / Vn；`ClinicalReportWorkflowSummary` 显示当前 replacement 版本及 A21–A24 服务端事实，不再声称后续生命周期关闭。doctor / admin 可操作，nurse / research_assistant 只读，后端 RolesGuard 仍是最终边界。
- `clinical-report-workflow.state.ts` 的 `COMPLETE_CORRECTION` 在采用 replacement 后清空旧版本 edit / submit / confirmation / lock / sourceFreeze / archive draft、error、receipt 与 writeProhibited，保留本次 correction receipt / sourceReport；因此 V1 的 A21–A24 会话回执不会显示在新 Vn 下。
- `clinical-report-workflow-recovery.ts` 将 replacement lineage 409 独立归类为最多 latest 一次和 writeProhibited；各 Action 不自动重放 POST。单一 activeMode、writingAction、writingRef、mountedRef、beforeunload、latest 与 report 更新入口保持。
- B16 浏览器验收确认安全 archived Vn 可继续形成 V(n+1)，A25 Resume、unsafe replacement summary 写门禁与 lineage 隐私边界均已通过；报告工作流草稿只保留在当前 React 内存，不持久化到 localStorage、sessionStorage 或 IndexedDB。

### 6.73 B17 patients 历史与趋势组件

- `PatientAssessmentHistoryPage` 编排患者摘要与独立历史请求；`AssessmentHistoryFilters` 负责 URL 可分享筛选，`AssessmentHistoryList` 保持后端 Visit/Scale 顺序并展示 score/domain availability、reportSummary、分页和安全历史详情入口。
- `PatientFollowUpTrendPage` 独立加载患者、量表目录和趋势；`FollowUpTrendControls` 负责 scale/date/maxPoints 与 URL 状态，未选择 scale 不请求趋势。
- `FollowUpTrendChart` 使用纯 SVG 和 0–100 percent 轴，所有 Visit 均有 X 位置；marker 可聚焦且 aria-label 不含内部 ID。只有后端 comparison 可比的相邻点才连线，missing/not_comparable 不连，也不跨 missing。
- `FollowUpTrendTable` 展示后端总分、percent、delta、comparison、reason 原顺序和可折叠 Domain 明细；null 显示 `—`，不生成排名、方向、诊断、风险或概率解释。
- patients history/trend 状态保持在页面 React state 与 URL；未新增 Context、Provider、全局 store 或浏览器持久化。

### 6.74 B17 报告版本面板与历史只读详情

- `ClinicalReportVersionPanel` 作为 `AssessmentVisitExecutionPage` 的独立 sibling 区域加载版本列表、分页和公开 lineage 摘要；其 loading/error/retry 不阻断现有 `ClinicalReportPanel` 或 B16 workflow。lineage invalid/incomplete 均不展示部分链。
- `HistoricalClinicalReportDetailPage` 校验 patient/visit/report 三个路径 ID，加载指定历史报告并提供返回 Visit、历史、Patient 和工作台导航；没有编辑、提交、确认、锁定、冻结、归档或更正入口，也不挂载 `useClinicalReportWorkflow`。
- `ClinicalReportReadOnlyContent` 从既有 current panel 抽出安全快照与正文展示基础；`ClinicalReportPanel` 与历史详情共同复用，但 current workflow Action 顺序和状态入口不变。
- `clinical-report-history.ts` 只建模公开 reportCode/version/relationship，不在 UI type 中暴露 previousReportId、replacementReportId 或其他内部 lineage 标识。

### 6.75 B17 加载、错误与验证事实

- history、trend、version list、historical detail 各自维护 loading/error/AbortController；只有可重试服务错误显示手工重载，没有自动 retry 或 polling。
- 实际浏览器已覆盖四角色 history、URL 筛选回退、单 V1、V1→V2、lineage invalid 409、只读详情、source_missing/source_incomplete marker、1280×720 与 390px 布局。多 Visit/V3/完整 trend comparison 与 domain mapping 矩阵因夹具缺失未执行，WP-04 仍进行中。

## 7. 后续同步规则

- 组件事实以实际前端代码和页面使用情况为准。
- 临时页面内结构可不进入本文档，除非形成稳定复用边界。
- 不得在组件、Hook 或 API Client 未实现前写成已存在能力。
- 新增稳定组件后，应同步检查其视觉、交互、可读性与安全边界是否符合前端设计基线。
