# CogMemory AD / 智忆评 前端组件地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端稳定复用组件、feature 组件、Hook 与 API Client 的路径、职责、输入输出、使用页面和边界。

## 2. 当前状态

- `frontend\src\components\ui` 提供 `Button`、`Card`、`Badge` 三个无业务语义公共组件。
- `frontend\src\features\auth` 提供 B1 最小认证接入能力。
- `frontend\src\features\patients` 提供 B2 患者档案与评估访视最小业务闭环。
- `frontend\src\features\assessments` 在 B3-B7 既有能力上新增 B8 单题人工评分、乐观并发、显式确认与最终只读展示。
- 当前组件遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信视觉基线。
- B2-B8 未新增公共 Input 组件、第三方 UI 库、状态管理库、数据请求库或权限菜单组件。

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

## 7. 后续同步规则

- 组件事实以实际前端代码和页面使用情况为准。
- 临时页面内结构可不进入本文档，除非形成稳定复用边界。
- 不得在组件、Hook 或 API Client 未实现前写成已存在能力。
- 新增稳定组件后，应同步检查其视觉、交互、可读性与安全边界是否符合前端设计基线。
