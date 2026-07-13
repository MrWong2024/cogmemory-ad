# CogMemory AD / 智忆评 前端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 前端当前事实快照，帮助后续交接时快速判断前端工程、页面、路由、组件和验证能力的真实状态。

## 2. 当前工程状态

- `frontend\` 根目录公共骨架配置与 `frontend\app` / `frontend\src` 公共底座已初始化。
- 前端 B1-B14 已落地既有闭环；B15 在既有访视详情路由接入 A25 版本化更正发起、恢复、幂等结果、source/replacement 安全摘要及 V2 A21 edit / submit / confirm。
- 当前首页仍为公共占位，只增加登录页与工作台入口，不调用后端。
- `/login` 提供账号密码登录，并在登录前通过 `GET /auth/me` 检查已有会话。
- `/dashboard` 通过 `GET /auth/me` 验证会话、展示当前用户公开信息、提供患者档案入口和登出入口。
- `/patients/**` 通过轻量认证工作区复用 `useAuth()`；当前包含患者列表 / 创建、患者详情 / 访视列表、访视创建、访视详情 / 量表实例初始化，以及量表实例施测执行页面。
- Patients API Client 真实调用 A12 五个患者 / 访视 API，支持分页、过滤、GET 请求取消、稳定错误映射和安全请求字段白名单。
- Assessment Execution API Client 继续调用 A13 / A14 / A16；独立 Provisional Scoring、Cognitive Domain 与 Clinical Report API Client 分别调用 A17 / A18、A19 与 A20 / A21。写请求逐字段重建白名单且不自动重试，latest 使用各自独立 AbortController。
- 当前视觉遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信口径，不继承 ReviewX 视觉风格。
- 当前没有患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 状态流转、批量或自动保存、评分 lock / void / rerun、认知域人工修改 / 确认 / 作废 / 重算、报告退回 / 签名 / unlock / unfreeze / unarchive / void / PDF / 重生成、AI、用户管理或权限菜单页面；B15 不修改 Patient、Visit、来源对象或 Storage，也不形成临床诊断结论。

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
  - `api/assessment-execution-api.ts`：对接 A13 三个、A14 两个和 A16 两个 API，统一 credentials / no-store、GET AbortSignal、POST / PATCH 白名单和业务错误码映射；submit 只重建 `{ confirm: true }` 且不重试。
  - `lib/assessment-execution-display.ts`：集中维护施测方式、实例状态、操作者角色、能力摘要、用时和访视初始化状态纯函数。
  - `components/AssessmentVisitExecutionPage.tsx`：独立管理访视详情与目录加载、401 / 403 / not-found、初始化与重复冲突刷新。
  - `components/ScaleInstanceList.tsx`：展示实例进度、操作者、状态时间与版本追溯安全摘要，不展示 ItemResponse。
  - `components/ScaleInitializationPanel.tsx`：展示安全量表目录、施测方式选择、禁用规则和初始化反馈。
  - `types/item-response-execution.ts`：严格对齐 A14 安全执行详情、单题 PATCH 白名单与 JSON 传输日期口径，不定义答案或评分字段。
  - `lib/item-response-draft.ts`：负责服务端题目到本地草稿、字段级 dirty、数值 / 时间转换、有效作答判断与差异 PATCH 构建。
  - `components/ScaleInstanceExecutionPage.tsx`：管理 A14 GET、分组切换、本地草稿、beforeunload、逐题 PATCH，以及 B6 独立 readiness AbortController、stale、本地阻断、题目定位、二次确认、submit 写锁、成功状态合并与内存回执。
  - `types/provisional-scoring.ts`：在 A17 安全 JSON 上真实扩展 updatedAt、manualReview、confirmation、reviewUpdate 与 confirmationReceipt；所有 Date JSON 使用 string / null，不定义作答、正确答案、评分规则、metadata 或 previousScoreValue。
  - `api/provisional-scoring-api.ts`：独立接入 latest / compute / manual-review / confirm；统一 credentials / no-store、完整 A18 错误映射与严格请求白名单，写请求不自动重试。
  - `lib/score-review-draft.ts`：维护人工评分 / 确认 React 内存草稿、dirty、stale、数值与 reviewNote 校验、expectedUpdatedAt 请求构建和确认资格；不计算任何题目、分组、总分或百分比。
  - `components/ManualScoreReviewForm.tsx`、`ScoreResultConfirmationPanel.tsx` 与评分展示组件：提供单活动人工评分表单、修订时预填最新服务端分值和公开意见、min / max 基础校验、step="any"、确认两步交互、安全审计摘要与 final / provisional 文案切换。
  - `types/cognitive-domain-result.ts`：严格定义 A19 result / mapping / item / review / quality 枚举、domainScores、itemContributions、mapping policy / interpretation、computation、versionTrace 和请求 / 响应；Date JSON 使用 string / null，不定义原始作答、意见、expectedValue、scoringRule、metadata 或 contribution minScore。
  - `api/cognitive-domain-api.ts`：独立接入 A19 latest / compute；统一 credentials / no-store、完整业务错误映射、latest AbortSignal 与严格 `{ confirm: true }` 白名单，POST 不自动重试。
  - `hooks/useCognitiveDomainResult.ts`：独立管理 idle / waiting_for_score / loading / not_found / loaded / forbidden / error、latest 取消、首次计算确认、compute 写锁、幂等回执和稳定错误；不计算分数、不修改来源 ScoreResult。
  - `lib/cognitive-domain-display.ts`：集中维护真实 MMSE / MoCA domain code 安全中文标签、A19 枚举 / warning / error 文案、日期与有限数值格式、interpretation 安全检查和非诊断声明。
  - `CognitiveDomainResultPanel`、`CognitiveDomainScoreList`、`CognitiveDomainContributionList`、`CognitiveDomainMappingSummary`：展示结果状态、domainScores、itemContributions、mapping / computation / warning / versionTrace / 来源评分摘要，并复用统一题目定位。
  - `types/scale-instance-submission.ts`、`lib/scale-instance-submission-display.ts`：严格对齐 A16 安全 readiness / issue / submission JSON 类型和稳定中文展示映射；Date 使用 string，不定义作答原文、评分、expectedValue 或 metadata。
  - `components/ScaleInstanceSubmissionPanel.tsx`、`ScaleSubmissionIssueList.tsx`：展示 submissionState、ready / canSubmitNow、检查时间、九项统计、阻断问题、可展开警告、本地 dirty、readiness stale、内联确认和当前会话回执。
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
  - `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/submission-readiness`
  - `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/submit`
- Provisional Scoring API Client 仅调用：
  - `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/latest`
  - `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/compute`
  - `PATCH /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/:scoreResultId/item-scores/:itemResponseId/manual-review`
  - `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results/:scoreResultId/confirm`
- Cognitive Domain API Client 仅调用：
  - `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/cognitive-domain-results/latest`
  - `POST /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/cognitive-domain-results/compute`
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
- B6 继续映射 `SCALE_INSTANCE_NOT_SUBMITTABLE`、`SCALE_INSTANCE_NOT_READY`、`SCALE_INSTANCE_START_TIME_INVALID`、`SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED`、`SCALE_INSTANCE_SUBMISSION_CONFLICT`、`SCALE_INSTANCE_SUBMISSION_AUDIT_UNAVAILABLE`、`SCALE_INSTANCE_SUBMISSION_FAILED`；UI 不直接展示后端 message。
- `getMe()` 对 `401` 返回 `null`；其他非成功状态映射为稳定认证服务错误。
- 登录 `401` 在 UI 统一显示“账号或密码错误，或账号不可用。”，不区分具体安全失败原因。
- 主登录态使用后端 Session + HttpOnly Cookie；前端不读取 Cookie，不使用 JWT，不保存 raw token、token hash、`passwordHash` 或其他认证凭证。
- 密码仅在表单提交瞬间作为登录请求体使用，不进入 React state、URL、日志或持久化存储。
- 当前未实现完整前端权限矩阵；`PatientsWorkspaceContext` 复用 Shell 已取得的安全 AuthUser，B11 仅使用 roles 控制 doctor / admin 确认入口可见性，不产生第二次 `/auth/me`，后端 RolesGuard 仍是最终权限边界。
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
- B6 在执行详情成功后独立自动读取 readiness；失败只影响提交面板。401 返回登录页，403 显示无提交权限，不将失败渲染成空问题列表。每次手工检查取消旧 GET，被取消请求不显示错误，也不自动重试。
- A14 单题 PATCH 成功、A15 上传成功或作废成功后 readiness 标记过期；纯本地输入、媒体列表 GET 与访问地址 GET 不触发 readiness 请求或 stale。旧结果保留供参考但不能用于正式提交。
- 本地未保存作答、未上传媒体、题目保存请求或媒体写请求任一存在时，页面明确说明服务器检查不包含本地内容，不展开有效确认且不发送 submit POST。
- B6 按 `itemResponseId` 在内存中切换分组、滚动并聚焦稳定题目容器，不改 URL、不重建 drafts 或 mediaDrafts；scale_instance scope issue 不提供虚假定位。
- 正式提交必须先取得最新 readiness，并满足 ready / canSubmitNow / 无 blocking / 无本地阻断；内联 checkbox 后只发送 `{ confirm: true }`。submit 期间题目和媒体写操作真实禁用，成功只替换 `detail.scaleInstance`、readiness 和当前会话 receipt，不修改 visit、itemResponses 或本地草稿。
- `alreadySubmitted=true` 作为成功回执处理；completed / locked / voided 只读且仍可查看 readiness 与历史证据。刷新 completed 页面不调用 submit POST；没有当前会话回执时不将初始 `operatorSnapshot` 冒充提交操作者。
- B7 只对 completed / locked / voided 实例自动查询一次 latest；draft / in_progress 不查询。latest 的 loading / no_result / loaded / forbidden / error 独立于执行详情，新请求取消旧请求，失败不移除题目、提交回执或媒体历史；没有轮询和自动重试。
- completed 且无结果、Visit 为 draft / in_progress / completed、无本地 dirty / 写请求 / submit 时才提供计算确认。用户必须阅读内联说明并勾选 checkbox；compute 只发送 `{ confirm: true }`，使用写锁且不自动重试。`alreadyComputed=true` 为正常幂等成功，不表示支持重算。
- compute 成功只使用响应 ScoreResult 作为事实源，并同步 `detail.scaleInstance`；不覆盖 Visit、ItemResponse、作答草稿或媒体草稿，不调用 A14 PATCH、A15 写接口或 readiness。B6 submit 成功后只触发一次 latest，不自动 compute。
- total / group / item、scorePercent、status、scoringSource、qualityStatus 和 reviewQueue 均直接读取后端响应；前端不求和、不聚合、不补算比例、不从作答或题目编码推断评分。reviewQueue 复用 B6 itemResponseId 分组切换、滚动和 focus 机制；null 或无法匹配时不提供虚假跳转。
- B7 页面只显示安全题目标识、阶段性分值、受控复核原因和计算版本 / warning，不显示作答、expectedValue、正确答案、评分规则、媒体地址、reviewer 或内部 metadata。
- B8 人工评分只允许 needs_review / manual_scored 且计入总分、可关联 ItemResponse 的项目；auto_scored、not_scored 与过程项不可覆盖。表单展开冻结服务端 updatedAt，冲突后保留输入、刷新 latest 并标记 stale，只有用户明确“基于最新结果继续”才更新基线。
- 人工评分分值允许 0，只转换并发送 finite number；前端仅校验公开 min / max。A18 未公开 step，页面固定使用 step="any"，服务端 `SCORE_MANUAL_VALUE_STEP_INVALID` 是最终步长边界。
- 人工评分成功使用完整响应替换 ScoreResult detail 与 ScaleInstance 摘要，不自行减少 reviewQueue，不重新计算 total / group / item / percentage；reviewUpdate 只保存在当前页面内存。修订表单一致预填最新公开人工分值与 reviewNote，不展示完整历史或 previousScoreValue。
- 确认入口仅在 computed、无 pending / queue / warning、total complete、实例 / 访视状态允许且没有本地草稿或写请求时出现；确认只发送 confirm=true、trim 后 reviewNote 与表单基线 updatedAt。confirmed 后显示安全 confirmation 摘要并只读，confirmed 不等于 locked，qualityStatus=passed 显示“评分复核流程已通过”。
- 人工评分与确认草稿只存在 React 内存，不写 localStorage / sessionStorage / URL；人工评分与确认意见 dirty 独立于作答 / 媒体计数，并扩展 beforeunload。latest 刷新不清除本地草稿，版本变化会标记 stale 并取消确认 checkbox。
- B9 仅在实例 completed / locked / voided 且页面已有 confirmed / locked / voided ScoreResult 时自动查询一次认知域 latest；评分未生成、评分查询失败、draft / computed / needs_review 时保持 waiting_for_score，不把评分依赖误显示为认知域 not_found。没有轮询和 GET 自动重试。
- B8 confirm 成功后来源评分变为 confirmed，A19 Hook 自动查询一次 latest 以判断是否已有结果，绝不自动 compute。`COGNITIVE_DOMAIN_RESULT_NOT_FOUND` 是正常 not_found；首次计算还要求来源 confirmed / locked 且 isFinal=true、实例 completed、访视状态允许，并汇总阻断题目 / 媒体 / submission / 评分请求和所有内存草稿。
- 计算采用两步内联确认和可见 checkbox，API Client 只发送 `{ confirm: true }`。compute 写锁防止重复操作且 POST 不自动重试；`alreadyComputed=true` 作为正常成功处理。冲突 / voided 只自动 GET latest 一次，不重发 POST。
- domainScores 按 domainCode、itemContributions 按 itemOrder / itemCode / domainCode 对响应副本稳定排序。页面直接使用 scoreValue、min / max、scorePercent、weighted 字段和全部计数；null 不显示为 0，不跨域求和、不平均拆分、不重新计算任何服务端分值。
- mapping policy 与 interpretation 直接按 A19 口径展示：完整项目分值分别归入每个映射认知域、同题同域由后端去重、多 domain 合法保留；异常 interpretation 显示安全警告且不扩展临床解释。warning 只表述为内部计算提示。
- 贡献记录仅在 itemResponseId 可匹配当前安全题目时提供“查看原题”，复用分组切换、scrollIntoView 和 focus；null / 无法匹配不按 itemCode 猜测。定位不修改 URL，不清除作答、媒体、人工评分或确认草稿。
- 认知域主区域固定说明 scorePercent 只是映射项目得分比例、不是疾病概率，domainScores 不可相加解释量表总分，认知域结果不能脱离量表、临床访谈和其他检查单独形成诊断。页面没有认知域编辑、确认、锁定、作废、重算、报告或 AI。
- B10 latest 在访视详情成功后自动查询一次，拥有 idle / loading / not_found / loaded / forbidden / error 独立状态；量表目录失败不影响报告查询，GET 使用独立 AbortController、无轮询、无自动重试并支持手工重新加载。
- B10 scope 只来自当前访视实例；completed / locked 为前端候选，draft / in_progress / voided 不可选择。初始不自动勾选，数量限制 1-10、拒绝重复 / 非法 ID，并按 scaleCode / instanceNo / id 稳定顺序发送；没有为 readiness 扇出 A17 / A19 请求。
- generate 只发送 `confirm: true` 与 `primaryScaleInstanceIds` 白名单，必须完成内联说明与可见 checkbox；生成期间 scope 与量表初始化提交禁用，POST 不自动重试。alreadyGenerated 作为成功回执；scope conflict / voided / generation conflict 自动 latest 一次但不重发 POST。
- 报告展示覆盖 patient / visit 快照、scaleTraces、score / domain / evidence 快照、五段 narrative、generation 和历史 confirmation。null 不补为 0，不从当前档案补快照，不计算 scorePercent、不跨域求和、不调用媒体预览，不显示内部来源 ID、对象键、scoreDetails、clinicalContext、metadata 或 AI draft。
- 页面明确 reportVersion 1 scope 固定、system_draft 是系统规则化草稿、本次未使用 AI、认知域未独立确认以及无阈值 / 风险 / 自动诊断。B11 只开放 clinician-owned 文本受控编辑、提交与确认；仍不提供签名、锁定、归档、更正、作废、重生成、version 2、PDF 或下载。
- B11 扩展 ClinicalReport 类型以接收 doctorOpinion、recommendationText、editorial、submission、confirmationId 与 edit / submission / confirmation receipts；所有 Date JSON 继续使用 string / null，不公开 metadata、完整事件、previousValues / nextValues 或 signatureText。
- Clinical Report API Client 新增 updateClinicalReportDraft、submitClinicalReportForConfirmation、confirmClinicalReport。PATCH 白名单为 doctorOpinion、可选 recommendationText、editNote、expectedUpdatedAt；两个 POST 分别只发送 confirm、对应 note、expectedUpdatedAt。reportId 校验 MongoId，全部路径 ID 编码，写请求不自动重试。
- `useClinicalReportWorkflow` 管理单活动表单、单一写锁、React 内存 edit / submission / confirmation 草稿、dirty / stale、三类 action error / receipt 与 beforeunload。expectedUpdatedAt 只来自服务端 report.updatedAt；冲突保留输入、自动 latest 一次、标记 stale，不自动覆盖或重发，用户明确基于最新报告继续后才更新基线。
- draft 只编辑 doctorOpinion / recommendationText；recommendation 空字符串可清除，editNote 每次打开为空。A20 五段规则摘要、scope、patient / visit / scale / score / domain / evidence 快照、版本、编号与状态字段不可编辑。
- 提交要求 mixed、合法 doctorOpinion、quality 非 failed、无本地 dirty / 写请求，并使用 submissionNote 与 checkbox 二次确认；成功进入 pending_confirmation。pending 完全只读，显示 submission 摘要。doctor / admin 可用 confirmationNote 与 checkbox 最终确认；nurse / research_assistant 只读等待。
- confirmed、archived、corrected、voided 不显示写入口；confirmed 的 isFinal / qualityStatus 使用服务端事实。qualityStatus=passed 只显示报告确认流程质量标记已通过，不表示患者正常；confirmed 不等于 locked。source=mixed 只表示系统规则内容和临床人员补充并存，不表示 AI。
- B12 扩展 `ClinicalReport` 的 `lock` 安全摘要、lock request / receipt / response；全部 Date JSON 继续使用 string / null。ClinicalReportStatus 仍只有 draft、pending_confirmation、confirmed、archived、corrected、voided，没有新增 locked。
- `lockClinicalReport()` 调用 A22 POST，Body 只重建 `{ confirm: true, lockNote: trim 后文本, expectedUpdatedAt }`；映射 confirmation required、not lockable、lock conflict、audit unavailable、lock failed，并复用 metadata unsupported、patient / visit / ownership 等错误。不自动重试，不记录请求、响应或 lockNote。
- `useClinicalReportWorkflow` 扩展 lock mode、lock writingAction、角色 gate、React 内存 lock draft、dirty / stale、beforeunload、lockReceipt 与统一单写锁。只有 doctor / admin、confirmed / mixed / passed / isFinal、确认摘要完整、未锁定、访视 draft / in_progress / completed、无其他写入或本地草稿且状态一致时开放入口；nurse / research_assistant 只读。
- 锁定区使用必填 3–2000 字 lockNote、字符计数、不可逆边界和可见 checkbox。expectedUpdatedAt 只来自打开锁定区时冻结的服务端 report.updatedAt；冲突保留 lockNote、清 checkbox、自动 latest 一次、标记 stale，不自动重发 POST 或覆盖。用户明确“基于最新报告继续”后才采用最新 updatedAt；若 latest 已锁定，保留本地说明直到用户关闭。
- 锁定成功完整采用服务端 report，并在当前内存保存 lockReceipt；alreadyLocked=false 显示首次锁定成功，alreadyLocked=true 作为既有锁定幂等成功。status 仍为 confirmed，lockedAt 为主锁定事实，lock 为安全审计摘要，isFinal 直接使用服务端值且不作为锁定状态。锁定后 edit / submit / confirm / lock 全部只读。
- `ClinicalReportWorkflowSummary` 展示持久 lock 摘要和当前会话 receipt；`ClinicalReportTechnicalSummary` 分开显示真实 status、lockedAt 与 isFinal。lockedAt 非空但 lock 为空时说明审计摘要不完整；lock 非空但 lockedAt 为空、或两个时间不一致时显示一致性警告并禁止锁定，不猜测字段。
- B13 扩展 `ClinicalReport` 的 sourceFreeze 安全摘要以及 freeze request / receipt / response；状态严格为 in_progress / completed，全部 Date JSON 继续使用 string / null。公开类型不定义内部 scope、任何来源 ID、metadata 或原始来源状态明细。
- `freezeClinicalReportSources()` 调用 doctor / admin 专用 A23 POST；Body 只重建 `{ confirm: true, freezeNote: trim 后文本, expectedUpdatedAt }`，路径 ID 编码且 reportId 使用 MongoId 防御。客户端不自动重试，不输出说明、updatedAt、请求或响应。
- 独立 `clinical-report-source-freeze-draft.ts` 管理首次 / 恢复草稿、3–2000 字说明、服务端 updatedAt 基线、dirty / stale、持久说明只读、白名单请求、资格和安全一致性。计数要求非负安全整数且 total 等于五类之和；in_progress 不得含完成字段；completed 要求完整完成字段、expected=completed 且 newly+previously=expected。
- `useClinicalReportWorkflow` 新增 source_freeze mode 并继续复用同一 writingAction、roles、report、latest、onUnauthorized 与完整 report 应用路径。doctor / admin 才显示操作入口；nurse / research_assistant 只读。首次要求 Visit draft / in_progress / completed；恢复既有 in_progress 不因 Visit 后续 locked / voided 被前端阻断。
- 首次 freezeNote 为 React 内存用户输入，非空纳入 beforeunload；恢复只能使用服务端持久 freezeNote，不可编辑且不产生文本 dirty。冲突、not source freezable、incomplete、failed、voided、not found 最多 latest 一次，保留本地首次说明并清 checkbox；不自动再次 POST 或进入恢复。网络结果不确定时只提供手工 latest。
- `ClinicalReportSourceFreezePanel` 提供首次与恢复的独立内联二次确认；`ClinicalReportSourceFreezeSummary` 展示 freezeId、state、started/sourceLocked/completed 时间、actor、原说明及五类 expected / completed / newly / previously / total 计数。回执仅在当前页面内存，刷新后消失；持久事实来自 report.sourceFreeze。
- 页面明确 A23 不使用 Mongo transaction，in_progress 期间可能已有部分来源被冻结，系统不自动解冻、回滚、轮询或恢复；不冻结 Patient / Visit / Storage，CognitiveDomainResult 冻结不等于确认，不生成 PDF / 下载，不调用 AI。
- B14 扩展 `ClinicalReportArchiveSummary`、archive request / receipt / response；全部 Date JSON 为 string / null，不定义 metadata、Schema 原始 archivedBy、来源 ID、Session、currentUser、correctionRecords 或 PDF artifact。
- `archiveClinicalReport()` 调用 A24 doctor / admin 专用 POST，三个路径 ID 编码且 reportId 使用 MongoId 防御；Body 只重建 `{ confirm: true, archiveNote: trim 后文本, expectedUpdatedAt }`，credentials / no-store，不自动重试且不输出说明、updatedAt、请求或响应。
- 新增 `clinical-report-archive-draft.ts`，集中管理 3–2000 字 archiveNote、reportId / 服务端 updatedAt、锁定与 sourceFreeze completed 冻结上下文、dirty / stale、请求构造、首次资格和归档摘要一致性。完整 A24 摘要校验 UUID、actor、archiveNote、顶层 archivedAt 与 sourceFreeze freezeId / completedAt；历史 fallback 允许 archiveId / 锚点为空和 unknown / 缺姓名 actor，但不猜测缺失信息。
- `useClinicalReportWorkflow` 新增 archive mode，继续复用同一 roles、report、latest、onUnauthorized、完整 report 应用路径与 writingAction。doctor / admin 才显示入口；nurse / research_assistant 只读。首次资格不查询 Patient active，不依赖 Visit status / editable，也不因 Visit locked 阻断。
- archiveNote 为 React 内存输入，非空纳入 beforeunload。冲突、not archivable、failed、voided、not found 保留说明、清 checkbox、最多 latest 一次且不自动 POST；网络结果不确定时仅提供手工 latest。latest 已 archived 时只读展示并保留本地说明到用户明确关闭。
- 归档成功完整应用 response.report，不手动构造 status、archivedAt 或 archive；保存当前页面 archiveReceipt，alreadyArchived true / false 均按成功。`ClinicalReportArchivePanel` 提供内联二次确认，`ClinicalReportArchiveSummary` 分开显示 status、顶层 archivedAt、持久 archive 与会话 receipt；归档后六类报告写操作全部只读。
- `useClinicalReportWorkflow.ts` 由 B13 基线 1375 行增至 B14 的 1651 行；本阶段未做大规模重构，只把归档资格、草稿、冻结上下文、请求构造与一致性算法提取为独立纯函数，保持统一公开 Hook 和单写锁不变。
- B14.1 将 `useClinicalReportWorkflow.ts` 从 1651 行 / 52,771 字节拆为 228 行 / 9,156 字节的组合 façade，并新增 `hooks/clinical-report-workflow/` 内部目录。公开 9 个 options、99 个 result keys、七个 mode 和全部组件消费保持不变，现有组件没有修改。
- 内部中央纯 reducer 管理 activeMode、writingAction、六类 draft / error / receipt、liveMessage 与 writeProhibited；coordinator 唯一持有 mountedRef / writingRef，统一路由报告身份重置、activate / cancel、clearActionErrors / clearAllDrafts、API 执行、401、onReportUpdated 与 latest 恢复。
- edit / submit / confirm / lock / source-freeze / archive 六类 Action 分别保留各自动作资格、校验、dirty / stale、block reason、API、错误分类、成功文案与回执；公共 recovery 保留原错误 latest 集合并保证每个写请求最多调用一次，单一 beforeunload 保留原四类草稿加首次 freezeNote / archiveNote 条件。
- B14.1 仍只有一个 activeMode、writingAction、writingRef、mountedRef、beforeunload、报告成功更新入口和 latest 查询入口；façade 不直接 import API Client，Action 不互相 import，组件不 import 内部模块。A25 correction 未接入。
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
- `frontend\src\features\patients\components\PatientsWorkspaceContext.tsx`
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
- `frontend\src\features\assessments\types\scale-instance-submission.ts`
- `frontend\src\features\assessments\types\provisional-scoring.ts`
- `frontend\src\features\assessments\types\cognitive-domain-result.ts`
- `frontend\src\features\assessments\types\clinical-report.ts`
- `frontend\src\features\assessments\lib\score-review-draft.ts`
- `frontend\src\features\assessments\api\assessment-execution-api.ts`
- `frontend\src\features\assessments\api\media-evidence-api.ts`
- `frontend\src\features\assessments\api\provisional-scoring-api.ts`
- `frontend\src\features\assessments\api\cognitive-domain-api.ts`
- `frontend\src\features\assessments\api\clinical-report-api.ts`
- `frontend\src\features\assessments\lib\assessment-execution-display.ts`
- `frontend\src\features\assessments\lib\item-response-draft.ts`
- `frontend\src\features\assessments\lib\media-evidence-image.ts`
- `frontend\src\features\assessments\lib\media-evidence-display.ts`
- `frontend\src\features\assessments\lib\handwriting-evidence.ts`
- `frontend\src\features\assessments\lib\scale-instance-submission-display.ts`
- `frontend\src\features\assessments\lib\provisional-scoring-display.ts`
- `frontend\src\features\assessments\lib\cognitive-domain-display.ts`
- `frontend\src\features\assessments\lib\clinical-report-display.ts`
- `frontend\src\features\assessments\lib\clinical-report-workflow-draft.ts`
- `frontend\src\features\assessments\lib\clinical-report-source-freeze-draft.ts`
- `frontend\src\features\assessments\lib\clinical-report-archive-draft.ts`
- `frontend\src\features\assessments\hooks\useCognitiveDomainResult.ts`
- `frontend\src\features\assessments\hooks\useClinicalReport.ts`
- `frontend\src\features\assessments\hooks\useClinicalReportWorkflow.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\clinical-report-workflow.types.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\clinical-report-workflow.state.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\clinical-report-workflow-recovery.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\useClinicalReportWorkflowCoordinator.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\useClinicalReportBeforeUnload.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\useClinicalReportEditAction.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\useClinicalReportSubmissionAction.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\useClinicalReportConfirmationAction.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\useClinicalReportLockAction.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\useClinicalReportSourceFreezeAction.ts`
- `frontend\src\features\assessments\hooks\clinical-report-workflow\useClinicalReportArchiveAction.ts`
- `frontend\src\features\assessments\components\AssessmentVisitExecutionPage.tsx`
- `frontend\src\features\assessments\components\ScaleInstanceList.tsx`
- `frontend\src\features\assessments\components\ScaleInitializationPanel.tsx`
- `frontend\src\features\assessments\components\ScaleInstanceExecutionPage.tsx`
- `frontend\src\features\assessments\components\ScaleInstanceSubmissionPanel.tsx`
- `frontend\src\features\assessments\components\ScaleSubmissionIssueList.tsx`
- `frontend\src\features\assessments\components\ProvisionalScoringPanel.tsx`
- `frontend\src\features\assessments\components\ProvisionalScoreSummary.tsx`
- `frontend\src\features\assessments\components\ProvisionalScoreGroupList.tsx`
- `frontend\src\features\assessments\components\ProvisionalScoreItemList.tsx`
- `frontend\src\features\assessments\components\ScoreReviewQueue.tsx`
- `frontend\src\features\assessments\components\ManualScoreReviewForm.tsx`
- `frontend\src\features\assessments\components\ScoreResultConfirmationPanel.tsx`
- `frontend\src\features\assessments\components\CognitiveDomainResultPanel.tsx`
- `frontend\src\features\assessments\components\CognitiveDomainScoreList.tsx`
- `frontend\src\features\assessments\components\CognitiveDomainContributionList.tsx`
- `frontend\src\features\assessments\components\CognitiveDomainMappingSummary.tsx`
- `frontend\src\features\assessments\components\ClinicalReportPanel.tsx`
- `frontend\src\features\assessments\components\ClinicalReportScopeSelector.tsx`
- `frontend\src\features\assessments\components\ClinicalReportSnapshotSummary.tsx`
- `frontend\src\features\assessments\components\ClinicalReportScoreList.tsx`
- `frontend\src\features\assessments\components\ClinicalReportDomainList.tsx`
- `frontend\src\features\assessments\components\ClinicalReportEvidenceList.tsx`
- `frontend\src\features\assessments\components\ClinicalReportNarrative.tsx`
- `frontend\src\features\assessments\components\ClinicalReportTechnicalSummary.tsx`
- `frontend\src\features\assessments\components\ClinicalReportDraftEditor.tsx`
- `frontend\src\features\assessments\components\ClinicalReportSubmissionPanel.tsx`
- `frontend\src\features\assessments\components\ClinicalReportConfirmationPanel.tsx`
- `frontend\src\features\assessments\components\ClinicalReportWorkflowSummary.tsx`
- `frontend\src\features\assessments\components\ClinicalReportLockPanel.tsx`
- `frontend\src\features\assessments\components\ClinicalReportSourceFreezePanel.tsx`
- `frontend\src\features\assessments\components\ClinicalReportSourceFreezeSummary.tsx`
- `frontend\src\features\assessments\components\ClinicalReportArchivePanel.tsx`
- `frontend\src\features\assessments\components\ClinicalReportArchiveSummary.tsx`
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

本次 B6 验证结果：

- 未新增自动测试或测试框架；继续使用既有 lint、typecheck 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例动态路由类型生成成功。
- `npm run build`：通过，生产构建包含既有 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]` 动态路由，B6 未新增路由。
- E2E 与浏览器自动化未执行；本阶段明确不执行浏览器 E2E。
- 浏览器手工联调未执行，A16 readiness / submit、问题定位、并发提交与只读切换均待开发者使用脱敏数据本地验证。
- 后端命令未执行。

本次 B7 验证结果：

- 未新增自动测试或测试框架；继续使用既有 lint、typecheck 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例动态路由类型生成成功。
- `npm run build`：通过，生产构建包含既有 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]` 动态路由，B7 未新增路由。
- E2E 与浏览器自动化未执行；本阶段明确不执行浏览器 E2E。
- 浏览器手工联调未执行，A17 latest / compute、幂等、并发、错误状态、滚动 / focus 和窄屏展示均待开发者使用脱敏数据本地验证。
- 后端命令未执行。

本次 B8 验证结果：

- 未新增自动测试或测试框架；当前前端无既有测试框架，本阶段按边界使用 lint、typecheck 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例动态路由类型生成成功。
- `npm run build`：通过，生产构建包含既有量表实例动态路由，B8 未新增路由。
- E2E 与浏览器自动化未执行；浏览器手工联调未执行，A18 真实 HTTP、并发冲突、手工输入、窄屏与可访问性行为均待开发者使用脱敏数据验证。
- 后端命令未执行。

本次 B9 验证结果：

- 未新增自动测试或测试框架；当前前端无既有测试框架，本阶段按边界使用 lint、typecheck 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有量表实例动态路由类型生成成功。
- `npm run build`：通过，生产构建包含既有量表实例动态路由，B9 未新增路由。
- E2E 与浏览器自动化未执行；浏览器手工联调未执行，A19 真实 HTTP、错误组合、滚动 / focus、窄屏与可访问性行为均待开发者使用脱敏数据验证。
- 后端命令未执行。

本次 B10 验证结果：

- 未新增自动测试或测试框架；当前前端无既有测试框架，本阶段按边界使用 ESLint、TypeScript 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功。
- `npm run build`：通过，生产构建包含既有访视详情动态路由；B10 未新增路由。
- E2E 与浏览器自动化未执行；浏览器手工联调未执行，A20 真实 HTTP、全部错误分支、窄屏、键盘与可访问性行为均待开发者使用脱敏数据验证。
- 后端命令未执行。

本次 B11 验证结果：

- 未新增自动测试或测试框架；当前前端无既有测试框架，本阶段按边界使用 ESLint、TypeScript 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功。
- `npm run build`：通过，生产构建包含既有访视详情动态路由；B11 未新增路由。
- E2E 与浏览器自动化未执行；浏览器手工联调未执行，A21 真实 HTTP、并发冲突、角色入口、窄屏与可访问性行为均待开发者使用脱敏数据验证。
- 后端命令未执行。

本次 B12 验证结果：

- 未新增自动测试或测试框架；继续使用既有 ESLint、TypeScript 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功。
- `npm run build`：通过，生产构建包含既有访视详情动态路由；B12 未新增路由。
- E2E 与浏览器自动化未执行；浏览器手工联调未执行，A22 真实 HTTP、角色入口、并发冲突、幂等、窄屏与可访问性均待开发者使用脱敏数据验证。
- 后端命令未执行。

本次 B13 验证结果：

- 未新增自动测试或测试框架；继续使用既有 ESLint、TypeScript 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有访视详情动态路由；B13 未新增路由。
- E2E 与浏览器自动化未执行；浏览器手工联调未执行，A23 真实 HTTP、角色入口、首次 / 恢复、并发冲突、部分失败、幂等、窄屏与可访问性均待开发者使用脱敏数据验证。
- 后端命令未执行。

本次 B14 验证结果：

- 未新增自动测试或测试框架；继续使用既有 ESLint、TypeScript 与生产构建验证。
- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有访视详情动态路由；B14 未新增路由。
- E2E、浏览器自动化与浏览器手工联调未执行；A24 真实 HTTP、角色入口、并发冲突、幂等、历史 fallback、窄屏与可访问性均待开发者使用脱敏数据验证。
- 后端命令未执行。

本次 B14.1 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 route types 生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建路由集合不变并包含既有访视详情动态路由。
- 公共契约静态核对：拆分前后 options 均为 9 个字段，result 均为 99 个字段，缺失 0、新增 0；七个既有 mode 不变。
- 六类 API 仅由对应 Action 调用；单一 writingRef / mountedRef、单一报告 beforeunload、无组件 diff、无锁定业务文件 diff。
- E2E、浏览器自动化与浏览器手工联调未执行，六类真实 HTTP、并发、beforeunload 与可访问性场景待开发者使用脱敏数据验证。
- 后端命令未执行。

本次 B15 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 route types 生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建路由集合不变并包含既有访视详情动态路由；未新增路由。
- 静态归属：correction API 仅由 Correction Action 调用；façade / 组件不调用 API；central writingAction 增加 correction 但仍为单一写锁；报告 beforeunload 仍只有一个监听器。
- V1 edit / submit / confirm 未放宽；合法 V2 仅 doctor/admin 且 lock / freeze / archive 入口关闭。没有自动 POST、retry、polling 或浏览器持久化草稿。
- E2E、浏览器自动化与浏览器手工联调未执行；A25 真实 HTTP、首次 / 恢复 / 幂等、权限、并发、网络不确定、窄屏与可访问性均待使用脱敏数据验证。
- 后端命令未执行。

## 6. 当前未实现前端事实

- `/dashboard` 已有患者档案入口，但不是完整医生工作台。
- 患者编辑 / 删除 / 归档 / 合并尚未实现。
- 访视编辑 / 删除 / 状态流转尚未实现；访视详情支持查看、初始化量表实例、进入 B4 执行页以及 B10 / B11 访视级报告闭环。
- B4-B15 已支持安全题目记录、证据、提交、评分确认、认知域、V1 报告完整生命周期、版本化更正与 V2 A21 工作流；批量 / 自动保存、评分锁定、认知域人工确认、来源解冻与取消归档仍未实现。
- 报告退回、reject、reopen、withdraw、签名、unlock、unfreeze、unarchive、作废、重生成、V2 lock / freeze / archive、PDF / 下载、AI、用户管理、角色权限管理和权限菜单尚未实现。
- 当前报告 API 为 A20 latest / generate、A21 edit / submit / confirm、A22 lock、A23 freeze-sources、A24 archive 与 A25 corrections；没有报告 unlock / unfreeze / unarchive / void、V2 lock / freeze / archive 或 AI API 调用。
- 当前不包含路由级服务端认证中间件。

## 7. 后续同步规则

- 后续新增页面、路由、组件、API Client 方法或测试命令后，应同步更新对应 handoff 文档。
- 新增页面、组件、布局、样式和关键交互前，应先检查 `handoff-frontend-design-baseline.md`。
- 本文档只记录已确认事实，不承载未确认推测。
