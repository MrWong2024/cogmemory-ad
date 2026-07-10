# CogMemory AD / 智忆评 前端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 前端当前事实快照，帮助后续交接时快速判断前端工程、页面、路由、组件和验证能力的真实状态。

## 2. 当前工程状态

- `frontend\` 根目录公共骨架配置与 `frontend\app` / `frontend\src` 公共底座已初始化。
- 前端 B1 已落地登录页、认证状态 Hook、Auth API Client 和受保护工作台入口；前端 B2 已落地患者档案与评估访视最小页面闭环；前端 B3 已落地访视详情与量表实例初始化；前端 B4 已落地量表施测执行页与逐题手工作答草稿保存；前端 B5 已在同一执行页落地 photo / handwriting 媒体证据采集、预览与作废闭环。
- 当前首页仍为公共占位，只增加登录页与工作台入口，不调用后端。
- `/login` 提供账号密码登录，并在登录前通过 `GET /auth/me` 检查已有会话。
- `/dashboard` 通过 `GET /auth/me` 验证会话、展示当前用户公开信息、提供患者档案入口和登出入口。
- `/patients/**` 通过轻量认证工作区复用 `useAuth()`；当前包含患者列表 / 创建、患者详情 / 访视列表、访视创建、访视详情 / 量表实例初始化，以及量表实例施测执行页面。
- Patients API Client 真实调用 A12 五个患者 / 访视 API，支持分页、过滤、GET 请求取消、稳定错误映射和安全请求字段白名单。
- Assessment Execution API Client 真实调用 A13 三个 API 与 A14 两个 API；执行详情 GET 使用 AbortController，初始化 POST 与单题 PATCH 均不自动重试，写请求均重新构造白名单字段。
- 当前视觉遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信口径，不继承 ReviewX 视觉风格。
- 当前没有患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 状态流转、整份量表最终提交、批量或自动保存、自动或手工计分、认知域结果、报告、AI、用户管理或权限菜单页面。

## 3. 当前已确认前端事实

- 项目名称为 CogMemory AD / 智忆评，前端默认本地端口为 `3002`。
- `frontendEnv.apiBaseUrl` 读取既有 `NEXT_PUBLIC_API_BASE_URL`，安全默认值为 `http://localhost:5002`。
- 当前路由为 `/`、`/login`、`/dashboard`、`/patients`、`/patients/new`、`/patients/[patientId]`、`/patients/[patientId]/visits/new`、`/patients/[patientId]/visits/[visitId]`、`/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]` 与 `not-found` 兜底页面。
- 当前公共 UI 组件为 `Button`、`Card`、`Badge`；B1 未新增 Input 组件或第三方 UI 库。
- 当前 auth feature 包含：
  - `types/auth.ts`：认证公开类型与状态类型。
  - `api/auth-api.ts`：仅对接三个公开认证 API。
  - `hooks/use-auth.ts`：提供 loading / authenticated / unauthenticated / error 状态，以及 `refresh()`、`signOut()`。
  - `components/LoginForm.tsx`：登录表单、统一错误映射和成功跳转。
  - `components/AuthDashboard.tsx`：认证状态展示、公开用户信息、患者档案真实入口、登出与静态后续能力占位。
- 当前 patients feature 包含：
  - `types/patient.ts`：按 JSON 传输事实定义患者 / 访视公开类型与请求类型，Date 响应使用 string。
  - `api/patients-api.ts`：对接 A12 五个 API，统一 credentials / no-store、GET AbortSignal 和业务错误码映射。
  - `lib/patient-display.ts`：集中维护中文枚举、日期展示 / 转换与标签解析纯函数。
  - `components/PatientsWorkspaceShell.tsx`：复用 `useAuth()` 的 `/patients/**` 认证工作区。
  - `components/PatientsListPage.tsx`：患者分页、keyword / status / sourceType 过滤及列表状态。
  - `components/PatientCreateForm.tsx`：患者白名单字段创建、前端校验、冲突提示与成功跳转。
  - `components/PatientDetailPage.tsx`：患者公开详情、访视分页和 status / visitType / 日期范围过滤；访视行提供“打开访视”入口。
  - `components/AssessmentVisitCreateForm.tsx`：先读取患者，再按白名单创建访视；不提交 operatorSnapshot。
  - `PaginationControls`、`PatientStatusBadge`：patients feature 内局部复用组件。
- 当前 assessments feature 包含：
  - `types/assessment-execution.ts`：按 JSON 传输事实定义安全量表目录、访视执行详情、量表实例摘要和初始化白名单类型。
  - `api/assessment-execution-api.ts`：只对接 A13 三个 API 与 A14 两个 API，统一 credentials / no-store、GET AbortSignal、POST / PATCH 白名单和业务错误码映射。
  - `lib/assessment-execution-display.ts`：集中维护施测方式、实例状态、操作者角色、能力摘要、用时和访视初始化状态纯函数。
  - `components/AssessmentVisitExecutionPage.tsx`：独立管理访视详情与目录加载、401 / 403 / not-found、初始化与重复冲突刷新。
  - `components/ScaleInstanceList.tsx`：展示实例进度、操作者、状态时间与版本追溯安全摘要，不展示 ItemResponse。
  - `components/ScaleInitializationPanel.tsx`：展示安全量表目录、施测方式选择、禁用规则和初始化反馈。
  - `types/item-response-execution.ts`：严格对齐 A14 安全执行详情、单题 PATCH 白名单与 JSON 传输日期口径，不定义答案或评分字段。
  - `lib/item-response-draft.ts`：负责服务端题目到本地草稿、字段级 dirty、数值 / 时间转换、有效作答判断与差异 PATCH 构建。
  - `components/ScaleInstanceExecutionPage.tsx`：管理 A14 GET、分组切换、本地草稿、beforeunload、逐题 PATCH、服务端响应覆盖与进度更新。
  - `types/media-evidence.ts`、`types/handwriting-evidence.ts`、`types/media-evidence-draft.ts`：严格对齐 A15 安全响应、上传白名单、固定 strokes 结构与页面内存草稿；JSON Date 字段仍使用 string / null。
  - `api/media-evidence-api.ts`：真实接入 A15 的 list / upload / access-url / void 四个接口；multipart 逐字段构建 FormData，固定安全文件名，不手工设置 multipart Content-Type，GET 支持 AbortSignal，POST 不重试。
  - `lib/media-evidence-image.ts`：浏览器解码源图，在白色 Canvas 上按最长边 2560、有界质量 / 尺寸策略重编码为不超过 10 MiB 的 JPEG；不保留源 File、源文件名或原图元数据。
  - `lib/handwriting-evidence.ts`：维护 1200 × 800 逻辑坐标、Pointer 坐标归一化、8000 点限制、输入工具 / 时长推导、PNG 与不超过 2 MiB 的 strokes JSON。
  - `components/ScaleExecutionGroupNavigation.tsx`、`ItemResponseEditor.tsx` 及 step / prompt / timing / evidence 子组件：动态展示和编辑安全题目；媒体子组件负责列表、photo、handwriting、短期预览和作废，不生成选项、答案或评分。
- Auth API Client 仅调用：
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/me`
- Assessment Execution API Client 仅调用：
  - `GET /scales/available`
  - `GET /patients/:patientId/visits/:visitId`
  - `POST /patients/:patientId/visits/:visitId/scale-instances`
  - `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId`
  - `PATCH /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId`
- Media Evidence API Client 仅调用：
  - `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences`
  - `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences`
  - `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences/:mediaEvidenceId/access-url`
  - `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences/:mediaEvidenceId/void`
- 所有认证请求使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'` 和 `cache: 'no-store'`。
- 所有患者 / 访视请求同样使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'` 和 `cache: 'no-store'`；GET 请求在筛选变化或卸载时取消旧请求。
- A13 三个请求同样使用 `frontendEnv.apiBaseUrl`、`credentials: 'include'` 和 `cache: 'no-store'`；访视详情与目录 GET 独立取消旧请求，初始化 POST 不自动重试，组件卸载后不更新状态。
- Patients API Client 映射 401、403、普通 400 及 `PATIENT_NOT_FOUND`、`PATIENT_SUBJECT_CODE_CONFLICT`、`PATIENT_NOT_ACTIVE`、`VISIT_CODE_CONFLICT`、`INVALID_DATE_RANGE`。
- Assessment Execution API Client 映射 401、403、400，以及 `PATIENT_NOT_FOUND`、`VISIT_NOT_FOUND`、`PATIENT_NOT_ACTIVE`、`VISIT_NOT_INITIALIZABLE`、`SCALE_NOT_AVAILABLE`、`SCALE_VERSION_NOT_AVAILABLE`、`SCALE_NOT_ACTIVE`、`SCALE_VERSION_NOT_ACTIVE`、`SCALE_CATALOG_INVALID`、`SCALE_CATALOG_VERSION_CONFLICT`、`SCALE_INSTANCE_ALREADY_EXISTS`、`SCALE_EXECUTION_INITIALIZATION_FAILED`。
- `getMe()` 对 `401` 返回 `null`；其他非成功状态映射为稳定认证服务错误。
- 登录 `401` 在 UI 统一显示“账号或密码错误，或账号不可用。”，不区分具体安全失败原因。
- 主登录态使用后端 Session + HttpOnly Cookie；前端不读取 Cookie，不使用 JWT，不保存 raw token、token hash、`passwordHash` 或其他认证凭证。
- 密码仅在表单提交瞬间作为登录请求体使用，不进入 React state、URL、日志或持久化存储。
- 当前未实现前端权限矩阵；公开响应中的 roles 只用于 `/dashboard` 展示摘要，不驱动权限菜单或页面权限控制。
- 本阶段未新增 Next middleware、全局 Provider、全局状态管理库或 BFF 代理。
- 患者创建请求不含 status、externalRefs、metadata 或时间戳；访视创建请求不含 operatorSnapshot、clinicalContext、metadata、状态或状态时间。
- 页面不展示 externalRefs、metadata 或 clinicalContext；所有患者 / 访视错误使用稳定中文 UI 文案，不直接展示后端 message。
- B3 量表目录不定义或展示完整 groups / items、指导语、答案、scoringRule、expectedValue 或 ObjectId；能力摘要只描述配置。B5 仅在实例执行页对真实 photo / handwriting requirement 开放采集，计时能力仍不表示实时计时器。前端不读取 Cookie、不保存 token，也不使用 localStorage / sessionStorage 保存访视、目录、实例或表单状态。
- B4 执行页只使用 A14 安全 groups / itemResponses；按 itemResponseId 保存内存草稿，切换分组不丢失，未保存时使用浏览器 beforeunload 基础提示，不写 localStorage / sessionStorage。页面不定义或展示 scoringRule、expectedValue、正确答案、score、isCorrect、scoreValue，不提供任意 JSON 编辑器。
- B5 媒体草稿由 `ScaleInstanceExecutionPage` 以 `${itemResponseId}:${evidenceType}` 保存在 React 内存；跨分组保留、详情重载和页面刷新时清除。顶部独立显示未保存作答题目数与未上传证据题目数，任一非零时注册 beforeunload。
- photo 源 File 只在一次异步 Canvas 处理调用中短暂存在，处理后 input value 重置；React 状态只保留受控 JPEG Blob 与安全元数据。本地预览使用会及时 revoke 的 object URL，不读取 EXIF / XMP，不上传 Base64 或原始 File。
- handwriting 画布支持 stylus / finger / mouse、pointer capture、`touch-action: none`、撤销和清空；最终上传为 PNG，可选轨迹默认开启并使用相对毫秒、有限坐标 / 压力的固定 strokes JSON，不含患者、访视、实例或题目标识。
- 证据列表展示 A15 安全字段与 attached / locked / voided 历史；点击时才获取 primary / trajectory 短期 URL，按 expiresAt 与 30 秒余量判断复用。URL 只存在组件内存，不写存储、路由参数或日志。
- 上传和作废成功只使用 A15 响应更新对应 evidence requirement 与媒体列表，不触发 A14 PATCH，不改变作答 dirty、progress、ItemResponse / ScaleInstance / Visit 状态或评分。作废保留历史并允许重传，不实现覆盖或物理删除。
- 前端媒体公开类型没有定义 Storage 对象定位、校验和、原始文件名、内部患者关联或删除时间字段；页面也不显示这些字段。

## 4. 当前文件清单

- `frontend\app\layout.tsx`
- `frontend\app\page.tsx`
- `frontend\app\login\page.tsx`
- `frontend\app\dashboard\page.tsx`
- `frontend\app\patients\layout.tsx`
- `frontend\app\patients\page.tsx`
- `frontend\app\patients\new\page.tsx`
- `frontend\app\patients\[patientId]\page.tsx`
- `frontend\app\patients\[patientId]\visits\new\page.tsx`
- `frontend\app\patients\[patientId]\visits\[visitId]\page.tsx`
- `frontend\app\patients\[patientId]\visits\[visitId]\scale-instances\[scaleInstanceId]\page.tsx`
- `frontend\app\not-found.tsx`
- `frontend\src\styles\globals.css`
- `frontend\src\lib\env.ts`
- `frontend\src\lib\class-names.ts`
- `frontend\src\components\ui\Button.tsx`
- `frontend\src\components\ui\Card.tsx`
- `frontend\src\components\ui\Badge.tsx`
- `frontend\src\features\auth\types\auth.ts`
- `frontend\src\features\auth\api\auth-api.ts`
- `frontend\src\features\auth\hooks\use-auth.ts`
- `frontend\src\features\auth\components\LoginForm.tsx`
- `frontend\src\features\auth\components\AuthDashboard.tsx`
- `frontend\src\features\patients\types\patient.ts`
- `frontend\src\features\patients\api\patients-api.ts`
- `frontend\src\features\patients\lib\patient-display.ts`
- `frontend\src\features\patients\components\PatientsWorkspaceShell.tsx`
- `frontend\src\features\patients\components\PatientsListPage.tsx`
- `frontend\src\features\patients\components\PatientCreateForm.tsx`
- `frontend\src\features\patients\components\PatientDetailPage.tsx`
- `frontend\src\features\patients\components\AssessmentVisitCreateForm.tsx`
- `frontend\src\features\patients\components\PaginationControls.tsx`
- `frontend\src\features\patients\components\PatientStatusBadge.tsx`
- `frontend\src\features\assessments\types\assessment-execution.ts`
- `frontend\src\features\assessments\types\item-response-execution.ts`
- `frontend\src\features\assessments\types\media-evidence.ts`
- `frontend\src\features\assessments\types\handwriting-evidence.ts`
- `frontend\src\features\assessments\types\media-evidence-draft.ts`
- `frontend\src\features\assessments\api\assessment-execution-api.ts`
- `frontend\src\features\assessments\api\media-evidence-api.ts`
- `frontend\src\features\assessments\lib\assessment-execution-display.ts`
- `frontend\src\features\assessments\lib\item-response-draft.ts`
- `frontend\src\features\assessments\lib\media-evidence-image.ts`
- `frontend\src\features\assessments\lib\media-evidence-display.ts`
- `frontend\src\features\assessments\lib\handwriting-evidence.ts`
- `frontend\src\features\assessments\components\AssessmentVisitExecutionPage.tsx`
- `frontend\src\features\assessments\components\ScaleInstanceList.tsx`
- `frontend\src\features\assessments\components\ScaleInitializationPanel.tsx`
- `frontend\src\features\assessments\components\ScaleInstanceExecutionPage.tsx`
- `frontend\src\features\assessments\components\ScaleExecutionGroupNavigation.tsx`
- `frontend\src\features\assessments\components\ItemResponseEditor.tsx`
- `frontend\src\features\assessments\components\ItemStepEditor.tsx`
- `frontend\src\features\assessments\components\ItemPromptEditor.tsx`
- `frontend\src\features\assessments\components\ItemTimingEditor.tsx`
- `frontend\src\features\assessments\components\ItemEvidenceRequirements.tsx`
- `frontend\src\features\assessments\components\MediaEvidencePanel.tsx`
- `frontend\src\features\assessments\components\MediaEvidenceList.tsx`
- `frontend\src\features\assessments\components\MediaEvidencePreview.tsx`
- `frontend\src\features\assessments\components\PhotoEvidenceCapture.tsx`
- `frontend\src\features\assessments\components\HandwritingEvidenceCanvas.tsx`
- `frontend\README.md`

## 5. 当前验证状态

- B2 未新增测试代码或测试依赖；当前前端没有既有测试框架，本阶段按任务边界使用静态验证与构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 route types 生成成功。
- `npm run build`：通过，构建包含四条 patients 路由；两个动态路由按 `params: Promise<{ patientId: string }>` 契约编译通过。
- E2E 与浏览器自动化未执行；本阶段不新增 E2E。
- 浏览器手工联调未执行，真实 Cookie / CORS、五个业务 API 和页面交互仍待开发者本地验证。
- 后端命令未执行。
- 以上结果覆盖前端认证与患者 / 访视页面的静态检查和生产构建，不代表完整患者管理或完整评估工作流完成。

本次 B3 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 访视详情动态路由类型生成成功。
- `npm run build`：通过，生产构建包含 `/patients/[patientId]/visits/[visitId]`。
- 未新增自动测试或测试框架；E2E、浏览器自动化和手工浏览器联调未执行，B3 真实 Cookie / CORS 与 A13 三个 API 页面交互仍待开发者本地验证。
- 后端命令未执行。

本次 B4 验证结果：

- 未新增自动测试或测试框架。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例动态路由类型生成成功。
- `npm run build`：通过，生产构建包含 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]`。
- E2E 与浏览器自动化未执行；本阶段明确不执行浏览器 E2E。
- 浏览器手工联调未执行，真实 Cookie / CORS、A14 GET / PATCH、分组切换、逐题保存与只读状态仍待开发者本地验证。
- 后端命令未执行。

本次 B5 验证结果：

- 未新增自动测试或测试框架；继续使用既有 lint、typecheck 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例动态路由类型生成成功。
- `npm run build`：通过，生产构建包含既有 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]` 动态路由，B5 未新增路由。
- E2E 与浏览器自动化未执行；本阶段明确不执行浏览器 E2E。
- 浏览器手工联调未执行，A15 四个接口、移动端 capture、Canvas 重编码、触屏 / 触控笔、临时 URL、作废和 beforeunload 仍待开发者本地验证。
- 后端命令未执行。

## 6. 当前未实现前端事实

- `/dashboard` 已有患者档案入口，但不是完整医生工作台。
- 患者编辑 / 删除 / 归档 / 合并尚未实现。
- 访视编辑 / 删除 / 状态流转尚未实现；访视详情支持查看、初始化量表实例和进入 B4 执行页。
- B4 / B5 已支持安全 MMSE / MoCA 题目查看、逐题手工草稿保存与 photo / handwriting 题目证据闭环，但整份量表最终提交、批量或自动保存、自动或手工计分和认知域结果尚未实现。
- 报告生成、医生确认、AI、用户管理、角色权限管理和权限菜单尚未实现。
- 当前除 A12 五个患者 / 访视 API、A13 三个评估初始化前置 API、A14 两个评估执行草稿 API 与 A15 四个题目媒体证据 API 外，没有其他业务 API 调用。
- 当前不包含路由级服务端认证中间件。

## 7. 后续同步规则

- 后续新增页面、路由、组件、API Client 方法或测试命令后，应同步更新对应 handoff 文档。
- 新增页面、组件、布局、样式和关键交互前，应先检查 `handoff-frontend-design-baseline.md`。
- 本文档只记录已确认事实，不承载未确认推测。
