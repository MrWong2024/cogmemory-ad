# CogMemory AD / 智忆评 后端 Service 职责地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 Service 职责边界、调用关系、事务要求和测试覆盖口径。

## 2. 当前状态

- 当前存在公共底座 Service / Provider、A12-A28 与 WP-10 业务能力；B1/B2 在 AssessmentsModule 内完成患者会话、权威步骤与受控资产，C1 由 MediaModule 单一患者 evidence 编排 Service 复用该会话 Service、既有 MediaEvidence 与 Storage，C2 在同一模块增加具体 ASR client、显式转写编排与最新会话只读 review；不改变 Auth、ItemResponse、Storage interface / driver、Scoring 或 presentation asset 服务实现。经明确授权，Reports 仅增加一个 report-local fail-closed captureMode 适配，不扩大其既有图片 / 手写来源范围。
- 当前没有独立医生、SMS 或 LLM Service；A21 不调用来源计分 / 认知域 / 媒体 Service、Storage、PDF 或 AI 能力。

## 3. 当前 Service / Provider 清单

- Service 名称：`AppService`
- 文件路径：`backend\src\app.service.ts`
- 职责边界：返回 health 响应 `{ status: 'ok', service: 'cogmemory-ad-backend' }`。
- 上游调用方：`AppController.getHealth()`。
- 下游依赖：无。
- 测试覆盖口径：`backend\src\app.controller.spec.ts`。

- Provider 名称：`AllExceptionsFilter`
- 文件路径：`backend\src\common\filters\all-exceptions.filter.ts`
- 职责边界：统一 HTTP 异常与未知异常响应结构。
- 上游调用方：`configureApp()` 全局注册。
- 下游依赖：`HttpAdapterHost`。
- 测试覆盖口径：当前未单独添加 filter spec。

- Service 名称：`StorageConfigService`
- 文件路径：`backend\src\modules\storage\storage-config.service.ts`
- 职责边界：读取 Storage driver 与 OSS 配置，缺少 OSS 必需配置时抛出明确异常。
- 上游调用方：`StorageModule`、`FakeStorageService`、`OssStorageService`。
- 下游依赖：环境变量。
- 测试覆盖口径：`backend\src\modules\storage\storage.service.spec.ts`。

- Service 名称：`FakeStorageService`
- 文件路径：`backend\src\modules\storage\fake-storage.service.ts`
- 职责边界：提供不依赖真实 OSS 的 fake driver。
- 上游调用方：`STORAGE_SERVICE` token。
- 下游依赖：`StorageConfigService`。
- 测试覆盖口径：`backend\src\modules\storage\storage.service.spec.ts`。

- Service 名称：`OssStorageService`
- 文件路径：`backend\src\modules\storage\oss-storage.service.ts`
- 职责边界：提供 Alibaba Cloud OSS 底层适配，包括 put、delete 和 signed URL；所有 ali-oss client 固定 `secure: true`，签名 URL 返回前只接受合法 HTTPS，否则 fail closed。
- 上游调用方：`STORAGE_SERVICE` token。
- 下游依赖：`StorageConfigService`、`ali-oss`。
- 接口与配置边界：`StorageService` 接口和现有 OSS 配置合同未变化。
- 测试覆盖口径：`backend\src\modules\storage\storage.service.spec.ts` 使用 ali-oss mock 覆盖 secure client、HTTPS 接受、非 HTTPS / 无效 URL 拒绝和错误隐私，不调用真实 OSS。

- Provider token：`STORAGE_SERVICE`
- 文件路径：`backend\src\modules\storage\storage.constants.ts`
- 职责边界：根据 `STORAGE_DRIVER` 选择 fake 或 OSS driver。

- Service 名称：`ScalesService`
- 文件路径：`backend\src\modules\scales\services\scales.service.ts`
- 职责边界：提供量表定义与量表版本配置的内部读取底座；规范化 scale code；按 mapper 输出 `ScaleDefinitionSummary` / `ScaleVersionSummary`，其中患者呈现步骤显式白名单映射并深拷贝，不返回 Mongoose 子文档或 `_id`。
- 当前方法：`normalizeScaleCode(code)`、`findDefinitionByCode(code)`、`findVersionByScaleCodeAndVersion(scaleCode, version)`、`listActiveDefinitions()`。
- 上游调用方：当前由 `AssessmentExecutionDetailService`、`ScaleInstanceSubmissionService`、`ProvisionalScoringWorkflowService`、`ScoreReviewWorkflowService`、`CognitiveDomainComputationWorkflowService` 与 `ClinicalReportGenerationWorkflowService` 直接调用；没有直接公开 Controller。
- 下游依赖：`ScaleDefinition` 与 `ScaleVersion` Mongoose Model。
- 边界：不创建、更新、删除量表配置；不导入种子数据；不实现评估执行、作答、计分、报告、AI、认证或权限。
- 测试覆盖口径：`backend\src\modules\scales\services\scales.service.spec.ts`，覆盖 code 规范化、查无返回 `null`、安全 mapper、呈现步骤深拷贝与子文档字段剥离、schema collection、索引和关键字段显式类型；不连接真实 MongoDB。

- Service 名称：`ScaleSeedDataService`
- 文件路径：`backend\src\modules\scales\seeds\scale-seed-data.service.ts`
- 职责边界：提供 MMSE / MoCA 初始配置 seed 的内部只读读取能力，并提供不做 manifest IO 的 `validateScaleSeeds()` 种子数据校验纯函数；MMSE 1.0 含 packageKey 和 19 步，其中 reading-command 以空 assetKeys 保持纯视觉题目呈现并复用既有 speech 患者短录音链，MoCA 当前保持无呈现配置。
- 当前方法：`normalizeScaleCode(code)`、`getAllScaleSeeds()`、`getScaleSeedByCode(scaleCode)`、`getScaleVersionSeed(scaleCode, version)`、`listSeedScaleDefinitions()`、`listSeedScaleVersions()`、`validateScaleSeeds(seeds?)`。
- 上游调用方：当前由 `ScaleCatalogService`、`AssessmentExecutionService` 与只读 `presentation-assets:verify` CLI 直接调用；没有直接公开 Controller。全量导入脚本或 seed runner 属于未来边界。
- 下游依赖：MMSE / MoCA seed 常量；不依赖 Mongoose Model，不依赖 `ScalesService`，不依赖数据库、Storage、SMS 或 LLM。
- 边界：不创建、更新、删除数据库记录；不提供 import / upsert / seed runner；不执行写库；不读取 manifest；不暴露公开 MMSE / MoCA 配置查询 API；不实现评估执行、作答提交、媒体上传、自动计分触发、报告、AI、认证或权限。
- 测试覆盖口径：`backend\src\modules\scales\seeds\scale-seed-data.service.spec.ts`，覆盖 MMSE / MoCA seed 读取、code 规范化、版本读取、definition / version 列表、内置 seed 校验、总分范围、PDF / CRF 编号修正规则、MMSE reading-command 的纯视觉呈现、speech 录音响应和正式一分人工观察合同、MoCA 即刻记忆和延迟回忆记录规则、连续减 7 分步规则、图片 / 手写 / 用时证据要求、item code 唯一、groupCode 引用和校验错误分支；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为配置样例或脱敏人工样例。

- Service 名称：`ScaleCatalogService`
- 文件路径：`backend\src\modules\scales\services\scale-catalog.service.ts`
- 职责边界：提供经校验 seed 的安全目录摘要、可用 scale / version 解析，以及初始化时 `ScaleDefinition` / `ScaleVersion` 按需幂等物化。
- 当前方法：`listAvailableScaleOptions()`、`getAvailableScaleOption(scaleCode, version?)`、`ensureSeedScaleVersionMaterialized(scaleCode, version?)`。
- 上游调用方：`ScalesController` 调用只读目录；`AssessmentScaleWorkflowService` 调用解析与按需物化。
- 下游依赖：`ScaleSeedDataService`、`ScaleDefinition` / `ScaleVersion` Model。
- 写库与冲突边界：GET 目录不写库；MMSE current seed 新插入随 `$setOnInsert` 写完整 presentation config；已物化配置与 current seed 一致时零额外 presentation 写；required config 缺失、部分缺失或 stored drift 均返回稳定 conflict，不覆盖、不自动迁移。MoCA 不写 presentation config；currentVersionId 仅空值时设置。
- 错误语义：`SCALE_NOT_AVAILABLE`、`SCALE_VERSION_NOT_AVAILABLE`、`SCALE_NOT_ACTIVE`、`SCALE_VERSION_NOT_ACTIVE`、`SCALE_CATALOG_INVALID`、`SCALE_CATALOG_VERSION_CONFLICT`。
- 测试覆盖口径：`scale-catalog.service.spec.ts` 覆盖摘要、seed 校验失败、current insert、一致配置零额外 presentation 写、required config 缺失 / 部分缺失 / stored drift 的通用 fail-closed、MoCA 零呈现写入、inactive、duplicate key 竞态和不覆盖语义；不连接真实 MongoDB。

- Service 名称：`PresentationAssetsService`
- 文件路径：`backend\src\modules\scales\services\presentation-assets.service.ts`
- 职责边界：内部只读解析精确 packageKey，从 backend 工作目录按 `process.cwd()/../.local/presentation-assets` 定位唯一 package；验证 released manifest、整包审核字段、package / scale / version 身份、相对路径 containment、assetKey / file 唯一、MIME / 扩展名、文件存在与 SHA-256；提供整包校验和单资产只读流。
- 输入 / 输出：输入 packageKey，或 packageKey + assetKey；输出经校验的 manifest / 资产元数据，或只读 `ReadStream`。稳定错误仅为 `PRESENTATION_ASSET_PACKAGE_INVALID` 与 `PRESENTATION_ASSET_NOT_FOUND`。
- 上游调用方：当前由 `presentation-assets:verify` CLI 使用，并由 `ScalesModule` 导出供后续 WP-10-B 内部编排复用；没有 Controller、公开 route、静态挂载或永久 URL。
- 非职责：不扫描“最新” package，不读取 PDF，不裁图、生成 / 转码音频、调用 TTS、访问 OSS、写入 / 修复 manifest、缓存到数据库或在应用启动时阻断后端。
- 测试覆盖口径：`presentation-assets.service.spec.ts` 使用临时目录 fixture，覆盖 released 正常包、draft、审核字段、identity、路径越界、未知 assetKey、缺文件、hash 与 MIME 合同；不触碰真实 package，不连接数据库。

- Controller 名称：`ScalesController`
- 文件路径：`backend\src\modules\scales\controllers\scales.controller.ts`
- 职责边界：公开只读 `GET /scales/available`；显式绑定 Session / Roles Guard 和四个临床工作流角色，只调用 `ScaleCatalogService`。
- 测试覆盖口径：controller spec 覆盖 Guard / Roles metadata 和安全列表传递。

- Service 名称：`PatientsService`
- 文件路径：`backend\src\modules\patients\services\patients.service.ts`
- 职责边界：保留患者 / 受试者基础档案内部读取能力，并承担 A12 患者分页、创建、详情读取和公开响应映射；不直接返回完整 Mongoose document。
- 当前方法：既有 `normalizeSubjectCode()`、`findPatientBySubjectCode()`、`listActivePatients()`；A12 新增 `findPatientById()`、`listPatients()`、`createPatient()`、`toPatientListItemResponse()`、`toPatientDetailResponse()`。
- 上游调用方：`PatientsController`；`AssessmentsService` 通过 `findPatientById()` 确认患者存在、状态和 subjectCode。
- 下游依赖：`Patient` Mongoose Model。
- 规则与异常：subjectCode trim + uppercase；keyword 经 `escapeRegExp()` 转义；分页使用 find + countDocuments；重复编号预检查并捕获 MongoDB 11000，统一抛 409 / `PATIENT_SUBJECT_CODE_CONFLICT`。
- 边界：A12 只创建患者，不更新、删除或归档；公开 mapper 不返回 externalRefs / metadata。
- 测试覆盖口径：service spec 覆盖规范化、ID 查无、分页与过滤、安全 keyword、创建默认值、预检查冲突、duplicate key 竞态和公开 mapper；不连接真实 MongoDB。

- Service 名称：`AssessmentsService`
- 文件路径：`backend\src\modules\assessments\services\assessments.service.ts`
- 职责边界：保留访视、量表实例和题目作答内部读取底座，并承担 A12 患者访视分页 / 创建、安全公开响应映射、A14 联合归属读取和实际进度统计；本次提前承担 WP-12 访视 edit / physical delete / void 的服务端权威资格判断。A30 内部 summary 携带原始 submission barrier 供 workflow fail-closed 判断，但公开 mapper 不透传。
- 当前方法：`getVisitExecutionDetail()` 返回实际 ItemResponse 进度与 `visitMaintenance`；`ensureVisitAndScaleStarted()` 以完整 patient / visit / scale ownership 条件统一闭合父级首次开始；另有 `updateVisitForPatient()`、`deleteVisitForPatient()`、`voidVisitForPatient()`。A14 / A15 / A30 既有联合读取和 barrier 条件写方法保持不变。
- 上游调用方：`AssessmentVisitsController`；既有内部调用方可继续复用旧方法。
- 下游依赖：`AssessmentVisit`、`ScaleInstance`、`ItemResponse`、既已注册的 `PatientAdministrationSession` Mongoose Model 和 `PatientsService`；没有新增 module 依赖。
- 规则与异常：先确认患者与 Visit 联合归属；visitCode trim + uppercase，重复编号统一为 `VISIT_CODE_CONFLICT`。维护资格不依赖 progress 或 Visit status 单点推断：Visit / 全部实例 / 全部题目都必须满足纯初始化字段矩阵，且任一实例 ID 下 PatientAdministrationSession 必须为 0；任意 session 状态都算历史执行事实。
- 创建所有权：patientId 来自路径，subjectCode 来自 Patient，status 固定 draft，operatorSnapshot 由 Controller 认证上下文生成；不接受客户端状态时间、clinicalContext 或 metadata。
- 开始生命周期：创建 AssessmentVisit 与仅初始化 ScaleInstance 均保持 `draft / startedAt=null`。第一次真实子活动才以同一个服务端事实时间把当前 ScaleInstance 与所属 Visit 的 draft 推进为 in_progress，并仅在 startedAt 为 null / missing 时写入；条件更新同时排除 completed / locked / voided 及其终态时间，后续量表、草稿、复核、暂停 / 恢复或提交均不能覆盖首次 startedAt。多量表 Visit 只保留第一个真实活动时间，每个 ScaleInstance 独立保留自己的首次活动时间。
- 维护写边界：纯 pre-assessment Visit 可编辑 / 物理删除且不可作废；删除仅顺序移除当前 Visit 的 ItemResponse skeleton、ScaleInstance 与 AssessmentVisit。存在真实执行事实且未 voided 时只可首次作废；作废仅写 Visit 审计，不修改或删除实例、作答、患者会话、Evidence、评分、报告或历史；重复作废不覆盖原审计。
- 测试覆盖口径：service spec 以当前 seed prompt / evidence note 验证 pristine classifier，并覆盖答案、计时、评分、step note、Evidence 与任意 Session 代表矩阵；目标 HTTP E2E 覆盖空 / initialized-only 编辑删除、级联范围、真实草稿与 open / terminal Session 阻断、首次 / 幂等作废和事实保留。

- Service 名称：`PatientAdministrationSessionService`
- 文件路径：`backend\src\modules\assessments\services\patient-administration-session.service.ts`
- 职责边界：集中编排创建 / 查询并持久化不可变 same-device / cross-device 方式、同设备签发、跨设备一次性进入码签发 / 兑换、准备确认、暂停 / 恢复、换设备重签、终止、患者凭证校验、当前步骤最小响应、patient / staff 完成、paused staff 接管、直接前一步重做、当前图片流、顺序音频播放、技术重播授权、C1 evidence prepare / attach CAS 与完成媒体门禁、惰性过期；C2 只增加按 createdAt、_id 倒序读取最新会话的安全 review facts 方法。自身不提供设备方式切换，不上传对象、不创建 MediaEvidence，也不写 `ItemResponse`、评分或报告；仅在首次 prepared → active 成功后委派 `AssessmentsService` 闭合 Visit / ScaleInstance 开始生命周期。
- 下游依赖：`PatientAdministrationSession` 与只读 `ScaleInstance` identity Model、`PatientsService`、`AssessmentsService`、`ScalesService`、`PresentationAssetsService`、`AuthService`。只复用现有 submission barrier 规范化函数和 Auth token 生成 / SHA-256，不复制平行认证或屏障逻辑。
- 状态与并发：开放状态 prepared / active / paused；设备方式在创建时确定且不可修改。`createSession()` 在业务继续资格通过后先用 existence 查询检查该 `ScaleInstance` 的完整历史是否存在 status=completed，命中即使用既有 session conflict 拒绝，并且发生在过期开放会话写入和开放会话检查之前；因此 latest 即使是 terminated / expired 也不能绕过成功终点。无 completed 历史时，terminated / expired 仍允许重新创建，prepared / active / paused 继续由既有开放会话门禁拒绝。same-device create 不调用进入码生成 / hash 分支，准备确认要求无患者凭证并保持 prepared，随后 handoff 签发凭证并转 active；cross-device create 才签发六位码，必须先兑换产生凭证，再确认准备并转 active。prepared 会话、same-device 准备确认与进入码创建 / 重发 / 兑换均不算评估开始；same-device 首次 handoff 和 cross-device 确认准备的 prepared → active 才使用 Session.startedAt 的同一个时间启动当前 ScaleInstance 与 Visit。startedAt 只在首次转 active 时写入，pause / resume 与 paused credential replacement 均不重置三者时间；同设备正常 revision 为 0→1→2 且事件依次为 preparation_confirmed、same_device_handoff，跨设备为 create 0→enter 1→confirm 2。顺序推进最后一步产生 completed 并清除全部凭证。全部 credential / control / capture / playback 写共享单一 revision CAS，每次恰加一；patient 写额外匹配 sessionTokenHash 和 currentStepKey。并发完成或播放同 revision 最多一个成功；音频流在 CAS 前打开，失败立即 destroy，不返回未获授权二进制。同实例 partial unique 索引封住并发开放会话创建，cross-device 进入码 unique collision 有限重试，公开兑换按 client key 固定窗口限流。
- 过期与失效：各入口惰性检查绝对两小时有效期，以状态 + revision 原子写 expired、清空全部凭证并追加一次事件；患者 Guard / current 遇到底层不可继续时 fail closed、原子终止开放会话并不泄露原因。无 TTL、cron、queue、transaction、retry loop 或物理删除。
- 步骤事实：`stepCaptures`、`playbackFacts` 与 C1 `stepEvidenceRefs` 均为 `PatientAdministrationSession` 内嵌 `_id:false` 数组，不增加 collection / index。evidence ref 只保存 stepKey、stepRun、audio / photo / handwriting type、MediaEvidence ObjectId 与 uploadedAt；redo 保留旧 run 引用，但完成门禁只匹配当前 run。
- 业务检查：active Patient、可编辑 ownership Visit / ScaleInstance、无 lock / void、submission barrier open、`supervised_patient_input`、精确 ScaleVersion / currentStep、released package，以及当前步骤 assetKey / stepKey / kind / role / mimeType 一致性。同设备 handoff 的只读 validation 在 Controller 撤销 staff Session 前额外要求 deviceMode 精确为 same_device，并确认准备时间 / 操作者、prepared 无患者凭证及 paused 既有凭证合同；reissue 只允许 cross_device，兑换查询 / CAS 也精确过滤 cross_device，匿名失败继续使用统一 entry invalid。preparation 依据 deviceMode 检查凭证形态，legacy 缺失 mode 不做推断并 fail closed；terminate 不依赖 mode，仍允许关闭 legacy open session。`prepareCurrentEvidenceUpload()` 重新读取会话并返回最小权威上下文，拒绝 responseMode/type 不匹配和当前 run 重复；`attachCurrentStepEvidence()` 以 token、active、currentStepKey、revision、expiry 和无等价 ref 组成单条 CAS，成功 revision+1。普通完成除播放前置外，speech 要求当前 run audio，writing / drawing 要求 photo 或 handwriting，staff_observation 无媒体要求；paused staff takeover 保留人工降级绕过。
- 资产与响应：staff mapper 不返回 hash / Token / controlEvents；summary 将新会话 deviceMode 返回为非空，legacy 缺失字段返回 null。patient current 只返回单一当前步骤及 assetKey / kind / role / mimeType 白名单。图片流在打开后执行最终只读授权复核；音频流与 playback CAS 绑定。same-device create 不返回六位码，六位码只在 cross-device create / reissue 响应出现；32 字节 patient Token 只进入 Path=`/patient-administration` 的 HttpOnly Cookie。
- 测试覆盖口径：service spec 覆盖 schema deviceMode enum / required 与三索引守恒、same/cross create、完整历史 completed 成功终点及优先顺序、terminated / expired 合法重建、既有开放会话门禁、legacy summary / terminate、模式专属 handoff / reissue / redeem / preparation fail-closed、配置失败、碰撞重试、失败限流、startedAt / revision / event 守恒、步骤归属、完成前置、捕获、接管、redo / stepRun、顺序播放、重播授权、图片复核、CAS 流关闭、安全暂停与惰性过期；Guard / Cookie 独立 unit 覆盖双身份拒绝、最小 request context、失效清理和精确 Cookie 选项；standard_test E2E 以 AppModule 和只读内存资产 stub 覆盖 create DTO / 持久化、completed 历史 409 且记录不增加、terminated 后重建并保留旧记录、同设备 / 跨设备模式门禁、跨设备兑换、paused HTTP 闭环、19 步流程、binary、Mongo CAS 与完成清理。

- Guard 名称：`PatientAdministrationSessionGuard`
- 文件路径：`backend\src\modules\assessments\guards\patient-administration-session.guard.ts`
- 职责边界：只读患者 Cookie，拒绝有效 staff + patient 双身份，委派 Service 验证 hash / 生命周期 / 底层继续资格，只挂载 sessionId、sessionTokenHash、revision；失败清患者 Cookie。它不复用 staff `SessionAuthGuard`，也不把患者身份映射为系统 User。

- Controller：`PatientAdministrationStaffController` / `PatientAdministrationController`
- 文件路径：`backend\src\modules\assessments\controllers\patient-administration-*.controller.ts`
- 职责边界：staff Controller 绑定四个既有临床角色、DTO 和服务端 actor；handoff 严格执行只读核验 → revoke staff token → clear staff Cookie → patient CAS → set patient Cookie，并公开 staff complete / takeover / redo / replay-authorize。patient Controller 处理 staff Cookie 冲突 / 陈旧清理、client key、完成态 Cookie 清理和安全二进制 headers，并公开 patient complete / image GET / audio POST；两者均不复制状态机或业务资格。

- Service 名称：`PatientAdministrationEvidenceService`
- 文件路径：`backend\src\modules\media\services\patient-administration-evidence.service.ts`
- 职责边界：接收 Guard context、C1 DTO 与单个内存文件；调用 SessionService prepare，使用 `AssessmentsService.findItemResponseByScaleInstanceAndItemCode()` 只读解析并复核 ownership / answerSource / lock / void / barrier；按 responseMode 选择 audio 或既有图片纯校验；写私有 Storage、创建权威 `MediaEvidence`、再调用 SessionService attach CAS，最后只返回四字段安全响应。
- 权威映射：speech audio → `browser_audio_recording`，writing / drawing handwriting → `tablet_handwriting`，photo → `photo_upload`；`patientAdministrationContext` 保存 sessionId / stepKey / stepRun，audioMetadata 只保存可选 durationMs。患者原始文件名、Token、IP、User-Agent、客户端 captureMode 与任意 metadata 均不持久化。
- 补偿与非职责：Storage 成功后 MediaEvidence 创建失败删除精确 objectKey；MediaEvidence 成功后 Session CAS 失败删除精确 Evidence ID 与 objectKey。不得调用 ItemResponse evidenceRef attach / clear / restore，不修改 ItemResponse / ScaleInstance，不完成步骤、不实现替换 / void / delete API，也不自行执行 ASR / 转写、评分、报告、队列或 worker；C2 转写由独立编排 Service 读取其产物。
- 下游依赖：`PatientAdministrationSessionService`、`AssessmentsService` 只读查询、`MediaEvidenceService`、`STORAGE_SERVICE`、`StorageConfigService`；没有 Repository、第二患者媒体 Service 或反向模块依赖。
- 测试覆盖口径：纯 audio validator unit、患者 evidence 编排 unit、会话 gate / CAS unit、MediaEvidence nullable mapper unit，以及 AppModule + standard_test + 可追踪 fake Storage 的 C1 E2E；真实 OSS、Browser 和真实设备不在 C1 自动化范围。

- Controller 名称：`PatientAdministrationEvidenceController`
- 文件路径：`backend\src\modules\media\controllers\patient-administration-evidence.controller.ts`
- 职责边界：仅绑定 `POST /patient-administration/current/evidence`、患者 Guard、multipart 单一 `file`、10 MiB / 四个字段上限、DTO 与现有上传异常拦截器；不推导 item、不生成 objectKey、不操作 Storage / Model / Session。

- Service 名称：`MediaEvidenceService`（WP-10-C2 扩展）
- 文件路径：`backend\src\modules\media\services\media-evidence.service.ts`
- 职责边界：在既有统一 MediaEvidence 创建 / 查询 / 映射底座上增加 transcription 安全映射、legacy 患者 audio 的 `not_requested` 兼容，以及 claim / complete / fail 三类条件写。它不调用外部 ASR、不生成签名 URL，也不读取或修改 `ItemResponse`、会话生命周期、评分或报告。
- 并发边界：claim 匹配完整 ownership、attached / stored / 未锁定 / 未作废 / 未删除患者 audio，并允许 not_requested / failed 或超时 processing；finalize 额外匹配本次 requestedAt token 与 processing。旧 provider 完成、submit / lock / void 竞争或 stale reclaim 后均不能覆盖新事实。Schema 的可选 `_id:false` transcription 子文档只含 status、text、errorCode、provider、model、requestedAt、completedAt、requestedBy，不增加索引。

- Service 名称：`PatientAudioAsrClientService`
- 文件路径：`backend\src\modules\media\services\patient-audio-asr-client.service.ts`
- 职责边界：具体配置驱动 client，不提供 registry / factory / 多供应商动态路由。disabled 直接不可用；test 强制 stub，返回固定候选且不访问 Storage / network；bailian 使用内建 fetch + AbortController 单次同步 POST，不重试。
- 百炼合同：只接受 webm / ogg / m4a / mp3 与已生成的短期 URL；请求固定 `Authorization: Bearer ...`、`Content-Type: application/json`、`X-DashScope-SSE: disable`，model 为 `qwen-audio-3.0-asr-flash`，input 只含 `messages[].content[].input_audio`，parameters 只含权威 format 与 `language_hints: ['zh']`。只解析 trim 后非空且不超过 20000 字符的顶层 `output.text`，向上只抛有限技术错误，不记录 key、URL 或原始响应。

- Service 名称：`MediaEvidenceTranscriptionService`
- 文件路径：`backend\src\modules\media\services\media-evidence-transcription.service.ts`
- 职责边界：staff 显式转写的唯一业务编排；先检查 provider，再验证 Patient -> Visit -> ScaleInstance -> ItemResponse -> MediaEvidence ownership、角色、active / editable、lock / void / submission barrier 与患者 audio 资格。claim 成功后仅 bailian 调用 Storage 十分钟签名 URL，再调用具体 client 并 CAS finalize；技术失败写有限 failed 状态后返回 200。
- 非职责与安全：不删除或改写录音 / 会话 / `ItemResponse` / `ScaleInstance`，不自动形成正式答案，不调用 Scoring / Reports，不做队列、worker、流式字幕、重试或采样率推断。disabled / 配置错误为 503，资格与并发分别使用两个稳定 409 code。

- Service 名称：`PatientAdministrationReviewService`
- 文件路径：`backend\src\modules\media\services\patient-administration-review.service.ts`
- 职责边界：组合 `PatientAdministrationSessionService.getLatestReviewFacts()`、权威 ScaleVersion 步骤、完整 ItemResponse 集合与会话引用的 MediaEvidence，按 item / step / run 输出安全只读复核投影；保留 invalidated capture 与 evidence-only run。review-only placement 使用 `patient-administration-review-structured-bindings.ts` 中仅维护 `mmse@1.0` 的 exact scaleCode + version + stepKey registry，不使用后缀、顺序、文本或 label 推断。
- placement 校验：registry 只提供候选 codes；Service 必须用当前 stored ScaleVersion 对应 Item 的 `scoringRule` 经 `parseStructuredManualFields()` 解析正式字段，验证 mapped code 全部属于本 Item、不同 step 不重复占用字段，且 mapped union 精确覆盖全部字段。无显式 binding 正常返回空数组；任一无效、额外、重复或覆盖不完整时整 Item 的所有 step 都 fail-safe 退化为 `structuredFieldCodes=[]`，不返回部分映射，也不阻断整份 review。
- 完整性与非职责：逐项验证 version identity、唯一步骤顺序、ItemResponse ownership / 集合 / version，以及 evidence 的 patient / visit / instance / item / session / step / run / type；任何损坏统一 fail closed。它不写会话或答案、不生成签名 URL、不返回资产 / patientText / playback / hash / Storage / scoring / 完整 controlEvents，也不引入 collection、缓存或投影队列。
- catalog 边界：placement registry 是版本绑定的 review projection 文件，不修改 released MMSE 1.0 ScaleVersion schema、seed、scoringRule、version、fingerprint 或 catalog materialization。

- Controller 名称：`PatientAdministrationReviewController`
- 文件路径：`backend\src\modules\media\controllers\patient-administration-review.controller.ts`
- 职责边界：仅绑定最新会话 review GET、既有 staff Session / Roles Guard 与三个 ownership 路径参数；不复制组合、完整性检查或 mapper 逻辑。既有 `MediaEvidenceController` 另绑定空 Body 的显式 transcribe POST 和无 Body 的 adoption POST；transcribe 把 current user 交给转写 Service，adoption 交给既有媒体 Workflow。

- Service 名称：`AssessmentExecutionService`
- 文件路径：`backend\src\modules\assessments\services\assessment-execution.service.ts`
- 职责边界：提供评估执行初始化内部编排底座；基于 MMSE / MoCA seed 构建不写库执行计划，并可内部创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；按 mapper 输出创建摘要，不直接返回完整 Mongoose document。
- 当前方法：`normalizeSubjectCode(subjectCode)`、`normalizeInstanceCode(instanceCode)`、`normalizeScaleCode(scaleCode)`、`buildScaleExecutionPlan(input)`、`createScaleExecutionFromPlan(plan)`、`createScaleExecutionFromSeed(input)`。
- 上游调用方：当前由 `AssessmentScaleWorkflowService` 直接调用，并经 `AssessmentVisitsController` 的量表实例初始化入口间接使用；没有 Controller 直接调用本 Service。
- 下游依赖：`ScaleInstance` 与 `ItemResponse` Mongoose Model、`ScaleSeedDataService`。`AssessmentsModule` 为此最小导入 `ScalesModule`。
- 边界：不注入 Patients / Media / Scoring / CognitiveDomains / Reports / Storage Service；不创建 Patient 或 AssessmentVisit；不创建 MediaEvidence、ScoreResult、CognitiveDomainResult 或 ClinicalReport；不提供公开 API；不实现作答提交、媒体上传、自动计分触发、认知域计算触发、报告生成、AI、认证或权限。
- 写库策略：`createScaleExecutionFromPlan()` 先创建 `ScaleInstance`，再批量创建初始 `ItemResponse`；insertMany 失败时按本次 scaleInstanceId 尝试删除可能已创建的题目和实例，然后重新抛出原始错误。当前不使用 Mongo session / transaction；这是补偿式一致性，不是严格事务原子性。
- 测试覆盖口径：原有执行计划与 mapper 覆盖之外，新增 insertMany 失败时的精确清理、补偿继续尝试和原始错误重抛；不连接真实 MongoDB，不调用外部服务。

- Service 名称：`AssessmentScaleWorkflowService`
- 文件路径：`backend\src\modules\assessments\services\assessment-scale-workflow.service.ts`
- 职责边界：编排 A13 初始化，依次校验患者、访视联合归属 / 状态、可用 scale / version、同访视同量表唯一性，调用目录按需物化与 `AssessmentExecutionService`，最后返回安全响应。
- 服务端所有权：subjectCode、definition / version 引用、instanceCode、instanceNo=1、status、operatorSnapshot、版本追溯均由服务端来源生成；不接受客户端伪造。
- 并发语义：初始化前查重；只把明确命中 ScaleInstance 唯一键的 Mongo duplicate key 映射为 `SCALE_INSTANCE_ALREADY_EXISTS`，其他内部失败映射为 `SCALE_EXECUTION_INITIALIZATION_FAILED`。
- 边界：不改变访视状态，不启动计时，不保存作答，不创建媒体 / 计分 / 认知域 / 报告结果。
- 测试覆盖口径：workflow spec 覆盖患者 active、访视归属 / 状态、scale 错误、查重、稳定 instanceCode、operatorSnapshot、并发 duplicate key 和安全内部错误。

- Service 名称：`AssessmentExecutionDetailService`
- 文件路径：`backend\src\modules\assessments\services\assessment-execution-detail.service.ts`
- 职责边界：只读编排 patient / visit / scaleInstance 归属、已物化 ScaleDefinition / ScaleVersion、groups、ItemResponse 列表与实际进度，组装 `ScaleInstanceExecutionDetailResponse`。
- 下游依赖：`PatientsService`、`AssessmentsService`、`ScalesService`；不直接操作 Model，不写数据库。
- 安全边界：允许读取所有实例状态和 inactive / archived 患者历史；配置引用不可用统一 409；公开输出通过显式 mapper，不返回完整量表或题目规则。
- 测试覆盖口径：detail service spec 覆盖历史读取、逐级归属错误、配置缺失 / 引用不匹配、分组排序与实际进度传递；不连接真实 MongoDB。

- Service 名称：`ItemResponseDraftService`
- 文件路径：`backend\src\modules\assessments\services\item-response-draft.service.ts`
- 职责边界：依次校验 Patient / Visit / ScaleInstance / ItemResponse 归属、可编辑状态与父 / 子 submission barrier open，校验 expectedRevision、草稿 JSON、structured_manual 服务端字段白名单、binary manual 精确 shape、完整 timing 快照与状态转换，精确合并既有 step / prompt 槽位，处理 missing / answered 语义，并以单条 `findOneAndUpdate` CAS 原子保存 ItemResponse。structured 草稿可部分保存；非 missing 标记 answered 时必须全部 configured field 具有非空 responseText 与 boolean isCorrect。binary eligible item 可保存 null partial，但标记 answered 时必须同时具备既有有效原始作答与 boolean decision；MMSE 1.0 reading-command overlay 仍允许 responseText / rawResponse 任意 partial，主动提交 rawResponse 时仅接受 null / boolean，标记 answered 时要求非空阅读观察、boolean 闭眼动作与 boolean decision。decision 本身不构成 answer content，missing item 不要求这些字段。
- 下游依赖：`PatientsService`、`AssessmentsService`、`ItemResponse` Model；不依赖 Scoring / Media / Reports / Storage。
- 写库与并发边界：CAS filter 同时包含完整 ownership、可编辑 status、`lockedAt: null`、父 / 子 barrier null / missing 与 expected revision；expectedRevision=0 兼容字段缺失或 0。成功更新同写字段级草稿、`$inc draftRevision: 1` 与服务端 `draftSavedAt`，随后才以该次已持久化的 `draftSavedAt` 委派 `AssessmentsService` 启动当前 ScaleInstance 与 Visit；初始 stale、无效 payload、普通竞争 miss 或保存失败均不产生父级生命周期副作用。后续复核草稿自然命中 startedAt 条件 no-op。原子 miss 后重读优先把生命周期变化或合法 / 损坏屏障分类为 `SCALE_INSTANCE_NOT_EDITABLE`，其他数据库失败为 `ITEM_RESPONSE_SAVE_FAILED`。
- 隔离边界：不覆盖 evidenceRefs，不修改 score、expectedValue、step / prompt 正确性或 counts 标记；父级写仅限首次 startedAt 与 draft → in_progress，不触碰其 completedAt、lockedAt、voidedAt、duration、metadata、operatorSnapshot 或 submission barrier。structuredResponse 中的 isCorrect 只作为医护确认事实保存，不自动语义判断或生成客户端 scoreValue；`rawResponse=false` 继续是有效原始事实，ASR / Evidence 不自动写 decision；不使用 transaction。A15 媒体点更新不推进草稿版本，因此不使同版本 A14 保存失效。
- 测试覆盖口径：draft service spec 覆盖空 PATCH、完整归属、状态、JSON、missing、markAsAnswered、step / prompt 精确合并、timing、不变量 / 转换、legacy revision、初始 stale、CAS miss、原子 filter / update、冲突零写入与安全保存失败；Model / Service 均为 mock，不连接真实 MongoDB。

- 纯函数：`validateAndCloneDraftJsonValue()` / `validateAndCloneStructuredDraft()`
- 文件路径：`backend\src\modules\assessments\lib\item-response-draft-json.ts`
- 职责边界：递归验证 JSON 类型、普通对象原型、危险 key、深度 / 长度 / 字节限制并生成新对象引用；不读取数据库或环境，不记录原始作答。

- 纯函数：`parseStructuredManualFields()` / structured response validators / aggregator
- 文件路径：`backend\src\modules\assessments\lib\structured-manual-response.ts`
- 职责边界：仅对 `mode=structured_manual` 按配置把合法 subItems 或 words 归一为 `{ code, label, maxScore, referenceAnswer? }`；全量配置解析失败即返回无可执行 fields。共享严格 partial shape、complete shape 与只按医护 isCorrect 汇总的合同；不按 scale / item code 分支，不比较回答语义，不访问数据库、网络或环境。

- 纯函数：binary manual eligibility / validator / deterministic score helpers
- 文件路径：`backend\src\modules\assessments\lib\binary-manual-decision.ts`
- 职责边界：只在 server-owned mode 属于 `manual_exact_match` / `manual_observation` / `manual_drawing_review` 且 scoreRange 精确为 0..1 step=1 时启用；严格接受 `{ binaryManualDecision: { isCorrect: boolean | null } }`，完整 boolean 才提供确定性 0 / 1。无 scaleCode / itemCode allowlist，不访问数据库、网络或环境；不纳入 structured_manual、multi_step_manual 或非 0/1 manual item。

- 纯函数：`resolveManualObservationRecordConfig()`
- 文件路径：`backend\src\modules\assessments\lib\manual-observation-record.ts`
- 职责边界：只以 exact itemCode=`mmse.language.reading_command`、`versionTrace.scaleVersion=1.0` 和 ItemResponse snapshot 的 boolean / manual_observation / 0..1 step=1 三重配置解析安全 observation labels / required flags；这是 released 1.0 compatibility overlay，不按 title、prompt、order 或模糊字符串推断，不修改 seed、catalog 或 schema。

- 纯函数：`normalizeItemResponseTiming()` / `validateItemResponseTimingUpdate()`
- 文件路径：`backend\src\modules\assessments\lib\item-response-timing.ts`
- 职责边界：规范化 legacy timing、校验 idle / running / paused / completed 完整快照与允许转换；不依赖 Nest、Mongoose、网络、数据库或时钟，GET 规范化不回写。

- Mapper：`toItemResponseExecutionResponse()`
- 文件路径：`backend\src\modules\assessments\services\item-response-execution.mapper.ts`
- 职责边界：从内部 ItemResponse summary 和 itemConfigSnapshot 中逐字段提取允许的执行配置与草稿；对可执行 structured_manual 安全投影 `structuredManualFields`，对 binary eligible item 仅投影 `binaryManualDecision { incorrectScore: 0, correctScore: 1 }`，对 exact reading-command overlay 仅投影 `manualObservationRecord` labels / required flags，不透传完整 scoringRule、registry key 或 allowlist；安全规范化 `draftRevision` / `draftSavedAt` 与 legacy timing，invalid legacy Mixed 草稿回退 null；不透传评分结果、metadata、`__v` 或媒体对象标识。

- Controller 名称：`AssessmentExecutionController`
- 文件路径：`backend\src\modules\assessments\controllers\assessment-execution.controller.ts`
- 公开接口：A14 单实例 GET 与单题 PATCH。
- 职责边界：绑定路径 / body DTO、`SessionAuthGuard`、`RolesGuard` 和四个临床工作流角色，只调用 detail / draft Service，不操作 Model、不递归校验 JSON、不计算进度。

- Service 名称：`MediaEvidenceService`
- 文件路径：`backend\src\modules\media\services\media-evidence.service.ts`
- 职责边界：提供媒体证据内部读取和 A15 完整归属数据访问；规范化 `evidenceCode`；按 mapper 输出 `MediaEvidenceSummary`，不直接返回完整 Mongoose document。
- 当前方法：既有 code / item / instance / visit / patient 读取方法，以及 `findEvidenceByOwnership()`、`listEvidenceByItemOwnership()`、`findActiveEvidenceByItemAndType()`、`createEvidence()`、`markEvidenceVoided()`、`deleteEvidenceForCompensation()`。
- 上游调用方：`MediaEvidenceWorkflowService`，以及后续计分、报告或科研导出等内部能力。
- 下游依赖：`MediaEvidence` Mongoose Model。
- 边界：只在内部执行 A15 所需创建 / 条件作废 / 补偿删除；没有公开物理删除方法，不直接调用 Storage，不处理 HTTP，不实现图片压缩、OCR、图像识别、自动计分、报告或 AI。
- 测试覆盖口径：`media-evidence.service.spec.ts` 覆盖既有读取、完整归属、当前有效证据、创建、条件作废与按 ID 补偿删除；Model 为 mock，不连接真实 MongoDB。

- Service 名称：`ScoringService`
- 文件路径：`backend\src\modules\scoring\services\scoring.service.ts`
- 职责边界：提供计分结果快照的内部读取底座；规范化 `scoreResultCode`；按 mapper 输出 `ScoreResultSummary`，不直接返回完整 Mongoose document；提供 `summarizeItemScores()` 通用计分汇总纯函数。
- 当前方法：`normalizeScoreResultCode(scoreResultCode)`、`findScoreResultByCode(scoreResultCode)`、`findLatestScoreResultByScaleInstanceId(scaleInstanceId)`、`listScoreResultsByScaleInstanceId(scaleInstanceId)`、`listScoreResultsByVisitId(assessmentVisitId)`、`listScoreResultsByPatientId(patientId)`、`summarizeItemScores(items)`。
- 上游调用方：当前由 `ProvisionalScoringWorkflowService`、`ScoreReviewWorkflowService`、`CognitiveDomainComputationWorkflowService`、`ClinicalReportGenerationWorkflowService`、`ClinicalReportSourceFreezeWorkflowService` 与 `ClinicalHistoryQueryService` 直接调用；没有 Controller 直接调用本 Service。科研导出尚未实现，属于未来边界。
- 下游依赖：`ScoreResult` Mongoose Model；`summarizeItemScores()` 不依赖数据库。
- A17 扩展：新增按实例 + runNo 查询和明确输入的 ScoreResult create；`summarizeItemScores(items, { provisional: true })` 只统计计分项并在不完整时抑制 percentage。
- A18 扩展：新增完整 ownership + runNo=1 读取、`reviewScoreItemIfUnmodified()` 与 `confirmScoreResultIfUnmodified()`；两个更新都用 expected updatedAt 条件和单次 `findOneAndUpdate`，runValidators=true。人工复核原子写 item / group / total / status / source / review / quality / metadata；确认原子写确认状态 / 时间、实时 total / groups、review / quality / metadata，不写 itemScores / scoringSource / lockedAt。仍无 lock / void / delete，不修改 ItemResponse。
- 测试覆盖口径：`backend\src\modules\scoring\services\scoring.service.spec.ts`，覆盖 score result code 规范化、查无返回 `null`、mapper 输出、按量表实例最新读取、按量表实例 / 访视 / 患者列表读取、schema collection、索引、内嵌子文档 `_id: false`、关键字段显式类型，以及 `summarizeItemScores()` 对计入 / 不计入总分、缺失、未评分、需复核、非有限数字、逐步计分和 group score 汇总的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为脱敏人工样例。

- Service 名称：`CognitiveDomainsService`
- 文件路径：`backend\src\modules\cognitive-domains\services\cognitive-domains.service.ts`
- 职责边界：提供认知域结果快照的内部读取底座；规范化 `domainResultCode` 与 `domainCode`；按 mapper 输出 `CognitiveDomainResultSummary`，不直接返回完整 Mongoose document；提供 `summarizeDomainScores()` 通用认知域汇总纯函数。
- 当前方法：保留既有 code / latest / 实例 / ScoreResult / 访视 / 患者读取与 `summarizeDomainScores(items)`；A19 新增 `findDomainResultByScaleInstanceAndRunNo()` 与 `createRunOneDomainResult()`。
- 上游调用方：`CognitiveDomainComputationWorkflowService`，以及后续报告或科研导出等内部能力。
- 下游依赖：`CognitiveDomainResult` Mongoose Model；`summarizeDomainScores()` 不依赖数据库。
- 边界：只创建最终 computed runNo=1 文档，不提供 update / confirm / lock / void / delete / rerun；不修改 `ScoreResult` 或 `ItemResponse`，不实现诊断、报告或 AI。
- 汇总：新增 minScore / non-zero min 与完整 percentage；excluded 不进 score / min / max，included 未评分 percentage=null；保留旧输入未提供 min 的兼容语义，domain / contribution 稳定排序。
- 测试覆盖口径：service spec 覆盖既有 A6 语义、timestamps、runNo 查询 / create、min / non-zero min、excluded、完整 percentage 与 stable sort；Model 为 mock，不连接真实 MongoDB。

- Service 名称：`ReportsService`
- 文件路径：`backend\src\modules\reports\services\reports.service.ts`
- 职责边界：负责 ClinicalReport 的持久化读取、批量读取与带完整条件的单文档写入；规范化 `reportCode`，按 mapper 输出 `ClinicalReportSummary`，不直接返回完整 Mongoose document，并提供报告状态转换校验纯函数。
- 当前方法：除 draft create 外，已承担 edit、submit、confirm、lock、source-freeze start/complete、archive、correction/replacement 编排所需的条件更新，以及 latest、ownership、history/version 等单条或批量读取；所有生命周期写入都使用服务端真实 `reportVersion` 与状态、审计、ownership、expectedUpdatedAt 等精确条件。
- 上游调用方：`ClinicalReportGenerationWorkflowService`、`ClinicalReportReviewWorkflowService`、`ClinicalReportLockWorkflowService`、`ClinicalReportSourceFreezeWorkflowService`、`ClinicalReportArchiveWorkflowService`、`ClinicalReportCorrectionWorkflowService`、`ClinicalReportHistoryQueryService` 与 `ClinicalHistoryQueryService`。
- 下游依赖：`ClinicalReport` Mongoose Model；状态转换校验纯函数不依赖数据库。
- 持久化边界：Service 负责 ObjectId 转换、精确 filter、`create()` / `findOneAndUpdate()` 和结果 mapper；跨集合来源冻结由 workflow 编排并调用各来源 Service。Service 不独立决定完整临床生命周期资格、lineage、幂等恢复或业务步骤顺序，这些由对应 workflow 与纯规则函数负责。
- 非目标边界：不物理删除报告，不实现作废、重生成、PDF / Word / 打印、AI、AuditLog 或 AiAnalysisResult；不凭自身读取后自动修改任何来源数据。
- 测试覆盖口径：以当前 `ReportsService` spec 与各 lifecycle workflow spec 为准；本 map 不重复枚举测试终态。Service spec 使用 Model mock，不连接真实 MongoDB。

- Service 名称：`UsersService`
- 文件路径：`backend\src\modules\users\services\users.service.ts`
- 职责边界：提供系统账号内部读取、账号编码规范化和安全 mapper 输出；普通 mapper 不返回 `passwordHash`，凭证查询只返回认证必要字段。
- 当前方法：`normalizeAccountName(accountName)`、`normalizeEmail(email)`、`normalizeStaffCode(staffCode)`、`findUserById(userId)`、`findUserByAccountName(accountName)`、`findUserCredentialByAccountName(accountName)`、`listActiveUsers()`。
- 上游调用方：`AuthService` 当前调用 `findUserCredentialByAccountName()` 执行账号密码认证，调用 `findUserById()` 创建 / 校验 session 对应用户。
- 下游依赖：`User` Mongoose Model。
- 边界：不创建、更新、删除用户；不实现密码重置、账号禁用、角色矩阵管理、公开用户管理 API、短信验证码、OAuth / SSO、JWT 主登录态或前端认证。
- 测试覆盖口径：`backend\src\modules\users\services\users.service.spec.ts`，覆盖 `User` schema collection、索引、`passwordHash select: false`、枚举 / Date / Number / Mixed 显式类型，覆盖账号 / 邮箱 / 工号规范化、查无返回 `null`、mapper 输出不含 `passwordHash`、凭证查询显式 select `+passwordHash` 且只返回认证必要字段、active 用户列表读取；不连接真实 MongoDB，测试数据为脱敏人工样例。

- Service 名称：`AuthService`
- 文件路径：`backend\src\modules\auth\services\auth.service.ts`
- 职责边界：提供内部密码哈希 / 校验、账号密码认证编排、session token 生成 / hash、session 创建、session 校验、session 撤销、认证上下文构建和公开认证响应 mapper 能力。
- 当前方法：`hashPassword(plainPassword)`、`verifyPassword(plainPassword, storedPasswordHash)`、`generateSessionToken()`、`hashSessionToken(rawToken)`、`authenticateWithPassword(input)`、`createSessionForUser(input)`、`validateSessionToken(rawToken)`、`revokeSessionByToken(rawToken)`、`buildPublicAuthUser(user, sessionId?)`、`toAuthUserResponse(user)`。
- 上游调用方：`AuthController.login()` 调用 `authenticateWithPassword()`；`AuthController.logout()` 调用 `revokeSessionByToken()`；`AuthController.getMe()` 调用 `toAuthUserResponse()`；`SessionAuthGuard` 调用 `validateSessionToken()`。
- 下游依赖：`Session` Mongoose Model、`UsersService`、Node.js 内置 `crypto`。
- 边界：不设置 Cookie，不清除 Cookie，不实现公开用户管理 API、短信验证码、OAuth / SSO、JWT 主登录态、max active session 回收、前端认证或权限页面。
- 测试覆盖口径：`backend\src\modules\auth\services\auth.service.spec.ts`，覆盖 `Session` schema collection、索引、`sessionTokenHash select: false`、TTL 索引、ObjectId / Date / Mixed 显式类型，覆盖密码 hash / verify、损坏 hash、session token 随机性、token hash 稳定性、账号密码认证成功创建 session、账号不存在 / 密码错误 / 用户非 active 返回 `null`、session 创建写入 token hash 而非 raw token、session 不存在 / revoked / expired / 用户不存在 / 用户非 active 返回 `null`、正常返回 `AuthenticatedUserContext` 且不含 passwordHash、raw token 或 token hash；不连接真实 MongoDB，不调用 OSS / Storage / SMS / LLM。

- Controller 名称：`PatientsController`
- 文件路径：`backend\src\modules\patients\controllers\patients.controller.ts`
- 职责边界：绑定患者列表 / 创建 / 详情路由、DTO、`SessionAuthGuard`、`RolesGuard` 和患者工作流角色；只调用 `PatientsService`，不直接操作 Model。
- 公开接口：`GET /patients`、`POST /patients`、`GET /patients/:patientId`。
- 权限：仅 `admin`、`doctor`、`nurse`、`research_assistant`；未认证 401，角色不足 403；没有注册全局 Guard。
- 测试覆盖口径：controller spec 覆盖 Guards / Roles metadata、Service 参数传递、创建 / 详情响应和患者不存在；DTO spec 覆盖分页默认值 / 边界、枚举、MongoId、转换和非白名单字段。

- Controller 名称：`AssessmentVisitsController`
- 文件路径：`backend\src\modules\assessments\controllers\assessment-visits.controller.ts`
- 职责边界：绑定患者访视列表 / 创建 / 详情 / 编辑 / 删除 / 作废与量表初始化路由、DTO、Guard 和角色；创建与作废从 `@CurrentUser()` 构建 operatorSnapshot 后调用 `AssessmentsService`。
- 公开接口：`GET /patients/:patientId/visits`、`POST /patients/:patientId/visits`、`GET|PATCH|DELETE /patients/:patientId/visits/:visitId`、`POST /patients/:patientId/visits/:visitId/void`、`POST /patients/:patientId/visits/:visitId/scale-instances`。
- operatorRole 优先级：doctor > nurse > research_assistant > admin > unknown；客户端不能传入或覆盖 operatorSnapshot。
- 权限：仅 `admin`、`doctor`、`nurse`、`research_assistant`；未认证 401，角色不足 403；没有注册全局 Guard。
- 测试覆盖口径：controller spec 覆盖 Guards / Roles metadata、维护路由 delegation、作废当前用户映射和角色优先级；DTO spec 覆盖双 MongoId、更新字段转换 / 清空备注、作废确认 / 原因及全部服务器字段白名单拒绝。

- Controller 名称：`AuthController`
- 文件路径：`backend\src\modules\auth\auth.controller.ts`
- 职责边界：定义公开认证 HTTP API 边界；`POST /auth/login` 调用 `AuthService.authenticateWithPassword()` 并设置 HttpOnly `cogmemory_ad_session` Cookie；`POST /auth/logout` 从 Cookie 读取 session token、内部撤销 session 并清除 Cookie；`GET /auth/me` 使用 `SessionAuthGuard` 显式保护并返回当前用户公开信息。
- 上游调用方：HTTP 客户端 / 后续前端 BFF。
- 下游依赖：`AuthService`、`SessionAuthGuard`、session cookie util。
- 边界：不直接操作 Mongoose Model，不实现用户管理、注册、密码重置、短信验证码、OAuth / SSO、JWT 主登录态、前端登录页或权限菜单；响应体不返回 passwordHash、raw session token、session token hash、secret 或 credential。
- 测试覆盖口径：`backend\src\modules\auth\auth.controller.spec.ts`，覆盖登录成功设置 HttpOnly Cookie、登录失败统一 Unauthorized 且不设置 Cookie、登出撤销 / 清理 Cookie、无 Cookie 登出稳定成功、me 返回公开用户信息且不含敏感字段。

- Guard 名称：`SessionAuthGuard`
- 文件路径：`backend\src\modules\auth\guards\session-auth.guard.ts`
- 职责边界：支持 `@Public()` 路由直通；从 cookie-parser cookies 或原始 `cookie` header 读取 `cogmemory_ad_session`；调用 `AuthService.validateSessionToken()`；校验成功后挂载 `req.user`，失败抛 `UnauthorizedException`。
- 上游调用方：`AuthController.getMe()`，以及 `ScalesController`、`PatientsController`、`AssessmentVisitsController`、`AssessmentExecutionController`、`ScaleInstanceSubmissionController`、`MediaEvidenceController`、`ScoringController`、`CognitiveDomainResultsController`、`ClinicalReportsController`、`ClinicalHistoryController` 显式启用；未注册为全局 Guard。
- 下游依赖：`Reflector`、`AuthService`。
- 边界：不下发 Cookie，不清除 Cookie，不改变 `GET /health` 权限。
- 测试覆盖口径：`backend\src\modules\auth\guards\session-auth.guard.spec.ts`，覆盖 public 路由直通、缺少 Cookie 抛 `UnauthorizedException`、`cogmemory_ad_session` cookie-parser cookies 读取、原始 cookie header 解析、校验成功挂载 `req.user`、校验失败抛 `UnauthorizedException`。

- Guard 名称：`RolesGuard`
- 文件路径：`backend\src\modules\auth\guards\roles.guard.ts`
- 职责边界：读取 `@Roles()` 元数据；无角色要求时直通；有角色要求时基于 `req.user.roles` 校验，角色不足或缺少 `req.user` 时抛 `ForbiddenException`。
- 上游调用方：`ScalesController`、`PatientsController`、`AssessmentVisitsController`、`AssessmentExecutionController`、`ScaleInstanceSubmissionController`、`MediaEvidenceController`、`ScoringController`、`CognitiveDomainResultsController`、`ClinicalReportsController`、`ClinicalHistoryController` 与 `@Roles()` 配合显式启用；未注册为全局 Guard。
- 下游依赖：`Reflector`。
- 边界：不实现完整权限矩阵，不实现权限管理接口，不改变 `GET /health` 权限。
- 测试覆盖口径：`backend\src\modules\auth\guards\roles.guard.spec.ts`，覆盖无角色要求直通、包含要求角色通过、角色不足抛 `ForbiddenException`、没有 `req.user` 抛 `ForbiddenException`。

- Controller 名称：`MediaEvidenceController`
- 文件路径：`backend\src\modules\media\controllers\media-evidence.controller.ts`
- 职责边界：绑定 A15 六个题目级媒体路由（list / upload / adopt / access-url / transcribe / void）、路径 / body / query DTO、`SessionAuthGuard`、`RolesGuard`、临床角色和 multipart 内存文件接收；adopt 复用 `MediaEvidenceParamDto` 且无 Body，Controller 不直接操作 Model 或 Storage。
- 文件接收：`FileFieldsInterceptor` 仅接收 file / trajectory，各最多 1；总文件数 2、单文件 Multer 上限 10 MiB、文本字段最多 30。media 局部 interceptor 将 Multer / Nest 的超限异常稳定映射为 413 `MEDIA_FILE_TOO_LARGE`，不修改全局 filter。

- Service 名称：`MediaEvidenceWorkflowService`
- 文件路径：`backend\src\modules\media\services\media-evidence-workflow.service.ts`
- 当前方法：`listEvidence()`、`uploadEvidence()`、`adoptPatientAdministrationEvidence()`、`createAccessUrl()`、`voidEvidence()`。
- 下游依赖：`PatientsService`、`AssessmentsService`、`MediaEvidenceService`、`PatientAdministrationReviewService`、`STORAGE_SERVICE`、`StorageConfigService`。
- 归属 / 状态：统一验证 Patient -> Visit -> ScaleInstance -> ItemResponse -> MediaEvidence 完整链；只读允许历史状态，上传 / 作废要求 Patient active、Visit / ScaleInstance draft 或 in_progress、ItemResponse not_started / in_progress / answered，并要求父 / 子 submission barrier open。
- 上传编排：校验证据要求、captureMode、主文件和可选轨迹；生成不含患者隐私与原始文件名的 UUID objectKey；依次上传 Storage、创建 MediaEvidence、条件绑定 evidenceRef。绑定仅允许父 / 子 barrier open、同 evidenceType、mediaEvidenceId 空且状态 pending / missing 的数组元素，形成并发边界；miss 后重读屏障并精确归类。
- 采用既有患者证据：复用 `PatientAdministrationReviewService.getReview()` 的最新 Session、步骤、ItemResponse ownership、step / run、evidence type、invalidated 与 evidence-only 完整性；只允许 completed Session 中唯一、已有有效 capture 的 photo / handwriting，再复用 `AssessmentsService.attachItemEvidenceReference()` 绑定同一个既有 Evidence ID。它不调用 Storage、不创建 / 复制 Evidence，也不自动形成或确认答案。
- 补偿边界：上传时轨迹上传失败删除主对象；创建失败删除本次对象；绑定异常 / 冲突先删除本次新建 MediaEvidence 与对象再抛稳定错误。adoption 不创建任何对象，CAS 失败不执行删除、void 或 Storage 补偿。补偿只使用本次上传 ID / key，不使用 transaction，不修改或删除其他业务数据；补偿日志仅记录固定类型、evidenceCode、driver 和成功标记。
- 访问 / 作废：签名访问固定使用 `DEFAULT_SIGNED_URL_EXPIRES_SECONDS`；作废 clear CAS 要求父 / 子 barrier open，miss 后精确重读分类；再标记 MediaEvidence voided，失败尝试恢复引用。restore 仅针对本次 clear 留下的空 pending 引用，是受控补偿例外，不受普通 barrier 门禁开放；正常作废不调用 deleteObject。
- 边界：除受控 adoption 写入既有 evidenceRef 外，不改变 ItemResponse / ScaleInstance / AssessmentVisit status、答案、operatorNote、draft revision 或 score；不自动 `markAsAnswered`，不实现前端采集、物理删除、原子替换、批量 / 分片 / 客户端直传、OCR / AI、报告或最终提交。

- Service 名称：`MediaEvidenceService`（A15 扩展）
- 文件路径：`backend\src\modules\media\services\media-evidence.service.ts`
- 新增方法：`findEvidenceByOwnership()`、`listEvidenceByItemOwnership()`、`findActiveEvidenceByItemAndType()`、`createEvidence()`、`markEvidenceVoided()`、`deleteEvidenceForCompensation()`。
- 职责边界：只负责完整归属数据访问与内部 Summary mapper；列表排除 deleted；作废仅条件更新 attached；补偿删除只按调用方传入的本次 evidence ID。内部 storage / metadata Summary 不直接作为 HTTP 响应。

- Mapper / 纯函数：`toMediaEvidenceResponse()`、`validatePrimaryMediaFile()`、`validateHandwritingTrajectoryJson()`
- 文件路径：`backend\src\modules\media\services\media-evidence-public.mapper.ts`、`backend\src\modules\media\lib\media-file-validation.ts`、`handwriting-trajectory-json.ts`
- 职责边界：public mapper 显式逐字段白名单映射并把非有限数归一化为 null；图片校验负责大小 / MIME / 魔数 / 元数据 / SHA-256；轨迹校验负责 application/json、2 MiB、结构限额、危险 key、深克隆、规范化 Buffer 与 SHA-256。纯函数不依赖 Nest DI、数据库或 Storage。

- Service 名称：`AssessmentsService`（A15 证据引用扩展）
- 新增方法：`attachItemEvidenceReference()`、`clearItemEvidenceReference()`、`restoreItemEvidenceReference()`。
- 职责边界：使用既有 ScaleInstance / ItemResponse Model 和完整 patient / visit / instance / item 条件原子更新匹配 evidenceRefs 元素；绑定 / 清除同时限制可编辑 ItemResponse 状态与父 / 子 barrier open，恢复仅在空 pending 引用上执行且刻意不增加 barrier 条件。方法不修改 ItemResponse status、作答、评分、step、prompt、timing、operatorNote、Visit 或 ScaleInstance。

### A16 submission 编排

- 名称：`ScaleInstanceSubmissionController`
- 职责：绑定两个嵌套资源路径、复用路径 DTO、接收 Submit DTO / `@CurrentUser()`，显式 Session / Roles Guard；不注入 Model，不解析 Mixed，不计算 readiness。

- 名称：`ScaleInstanceSubmissionService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScaleInstanceSubmissionBarrierService`。
- 职责：依次读取 Patient / Visit / ScaleInstance，校验 definition / version 与 ItemResponse 归属和追溯；编排 readiness、固定 scope、父 / 子屏障 fencing、二次实时读取、fenced completion、失败 release、阶段恢复、操作者优先级、startedAt / duration、幂等与并发 miss 重读；组装安全公开响应。单请求最多执行 12 次有界状态转换，不 polling / sleep。
- 边界：不依赖 `MediaModule`，媒体事实只读 ItemResponse.evidenceRefs；除 A30 private barrier 外不修改 ItemResponse 业务字段，也不修改 Visit、不评分、不生成报告或 AI 内容。

- 名称：`ScaleInstanceSubmissionBarrierService`
- 依赖：`ScaleInstance`、`ItemResponse` Mongoose Model；不依赖 Patients、Scales、Media、Storage、Scoring、Reports 或网络。
- 职责：提供 `createParentBarrierIfOpen()`、`fenceItemResponses()`、`markParentFenced()`、`claimRelease()`、`releaseItemResponses()`、`clearParentBarrier()` 与 `completeScaleInstance()`；每步都精确匹配 ownership、稳定固定 scope、version、barrierId 和允许父状态，写后重读验证实际状态。
- 一致性：子 fencing 可幂等收敛到同 token，遇到其他 token / 损坏子屏障 fail closed；release 只 `$unset` 同 token 子屏障并验证全部 open；completion 只从同 token `fenced` 进入 completed，并保留同 token 子屏障。完成 / release CAS 只有一个方向可胜出，不使用 transaction、mutex、lockedAt、save、后台 job 或自动重试。

- 纯函数：`normalizeScaleInstanceSubmissionWriteBarrier()` / `normalizeItemResponseSubmissionWriteBarrier()` / scope helpers
- 文件路径：`backend\src\modules\assessments\lib\scale-instance-submission-write-barrier.ts`
- 职责：严格解析 version、UUID、阶段时间、首次 actor、稳定唯一 ObjectId scope 与 count；null / missing 才是 open，任何损坏值均 blocks writes。纯函数不访问数据库、网络或时钟。

- 名称：`evaluateScaleInstanceSubmissionReadiness()`
- 类型：无 DI、无数据库访问的纯函数。
- 职责：按 ScaleVersion.items + ItemResponse + 安全 snapshot 白名单计算 item set、有效原始作答、missing、structured_manual 完整性、reading-command 原始观察完整性、binary manual 判断完整性、step、timing、media、operatorNote、稳定 issue 排序、summary、earliest timing start、ready / canSubmitNow；非 missing 的历史 free-text-only answered structured item 以 `ITEM_STRUCTURED_SUBITEMS_INCOMPLETE` fail closed，历史 reading-command 缺少非空 responseText 或 boolean rawResponse 以 `ITEM_MANUAL_OBSERVATION_INCOMPLETE` fail closed，历史 answered binary item 无 boolean decision 以 `ITEM_BINARY_MANUAL_DECISION_INCOMPLETE` fail closed。三层事实不推断、不 backfill，backend 保留全部独立 issue，不做展示归并。
- 复用：A14 与 A16 共享 `hasMeaningfulItemResponseAnswer()`，false / 0 有效，空字符串 / 数组 / 对象无效；binary eligible 调用明确忽略 `binaryManualDecision` root，使评分判断不能冒充原始 answer content。

- 名称：`AssessmentsService`（A16 扩展）
- 职责：提供 A16 精确 ownership / scope 读取与 `readScaleInstanceSubmissionAudit()` 安全解析；原先无屏障的 `completeScaleInstanceIfEditable()` 已移除，最终迁移只由 barrier Service 完成。
- 一致性：首次 readiness 后固化 scope，父 `fencing` → 子同 token → 父 `fenced` → 二次 readiness → 父 completed；失败走 `releasing` → token-only 子清理 → 父 open。跨集合不使用 Mongo transaction，但持久化 barrier 使暂停的 A14 / A15 写在释放后仍不能越过 completed。
- 配置：`ScalesService` 仅作为只读 definition / version 依赖；不修改 scales 或 media 模块。

### A17 阶段性评分编排

- 名称：`ScoringController`
- 职责：绑定 compute / latest 两条嵌套路由、复用路径 DTO、接收 Compute DTO，显式 Session / Roles Guard；不注入 Model、不读取 Mixed 规则、不计算分数或处理 duplicate key。

- 名称：`ProvisionalScoringWorkflowService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`ScoreResultPublicMapper` 与纯评分引擎。
- 职责：完整 ownership / definition / version / item set 校验；既有结果状态解析；首次计算 Patient / Visit / completed Instance 状态校验；调用纯引擎与既有汇总器；创建 runNo=1；duplicate key 重读；组装安全响应。
- 边界：不接收当前用户或人工评分，不修改 Patient / Visit / ScaleInstance / ItemResponse / step / prompt / media，不确认或锁定结果，不创建认知域结果 / 报告，不调用 AI。

- 名称：`evaluateProvisionalItems()` / `finalizeProvisionalScoring()`
- 类型：无 DI、无数据库访问的量表通用纯函数。
- 职责：按 scoringRule.mode / steps / aggregationRule / scoreRange / countsTowardTotal 分类。严格 number / boolean `multi_step_manual` 保持原行为；可执行 `structured_manual` 只汇总医护逐项确认的 boolean isCorrect 对应 maxScore；binary eligible item 只把完整医护 decision 确定性映射为 false→0 / true→1。二者均统一做 range / step 校验并在有效时输出 auto_scored / auto_rule；系统不比较原始回答，也不根据 rawResponse、Evidence、ASR 或 AI 形成 decision。binary legacy / 无 decision 保持 `MANUAL_SCORING_REQUIRED`；structured 非法 / 不完整 stored response 为 `STRUCTURED_RESPONSE_INVALID`，无法解析字段定义仍为 `MANUAL_SCORING_REQUIRED`；其他模式保守复核。输出 item snapshots、provisional total / groups、状态 / 来源 / review / quality 和受控 warning。
- 安全：不按 scaleCode / itemCode 分支，不做字符串匹配 / 类型转换，不使用 eval / Function，不修改输入。

- 名称：`ScoreResultPublicMapper`
- 职责：从内部 ScoreResult summary 与实例绑定版本配置逐字段生成公开 scoreResult / reviewQueue；派生 group 计数和 stable sort；未知 reason 回退通用人工复核，warning 仅白名单输出。
- 安全：不透传 Mixed、作答、规则、正确性、ItemResponse.score、metadata、qualityHints 或 reviewer。

- 模块依赖：`ScoringModule` 单向导入 AuthModule、PatientsModule、AssessmentsModule、ScalesModule；AssessmentsModule 不导入 ScoringModule，无循环、forwardRef 或重复 Schema 注册。

### A18 人工复核与确认编排

- 名称：`ScoreReviewWorkflowService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`ScoreResultPublicMapper`。
- 职责：完整 Patient → Visit → ScaleInstance → ScoreResult ownership / runNo=1 / definition / version 绑定；manual-review 额外验证 ItemResponse ownership 与 itemCode；解析认证 actor 角色优先级；编排 range / step、受控审计、重新汇总、状态派生、expectedUpdatedAt 原子更新、冲突重读、确认 readiness 与 confirmed / locked 幂等。
- 边界：不访问媒体文件、不从 ItemResponse 重新判分、不调用 A17 provisional engine、不修改 Patient / Visit / Instance / ItemResponse，不依赖 CognitiveDomains / Reports，不调用 AI。

- 名称：`prepareManualScoreReview()` / `finalizeManualScoreReview()` / `evaluateScoreConfirmationReadiness()` / `prepareScoreConfirmation()`
- 类型：scoring 模块内无 DI、无数据库访问的纯函数。
- 职责：验证可复核 item、ScaleVersion range / step、0 分；克隆 itemScores / metadata、追加 UUID 事件、500 上限；基于 `summarizeItemScores()` 输出补齐总分范围 / group title / 排序 / percentage，派生 scoringSource / result / review / quality；确认前比较实时汇总与持久化快照并阻断 A17 warning；生成受控 confirmation metadata。
- metadata：写入时 null 视为空对象，普通对象保留所有顶层 key，非法结构拒绝且不覆盖；公开读取 parser 仅返回合法受控字段。previousScoreValue 只存在内部人工审计。

- 名称：`ScoreResultPublicMapper`（A18 扩展）
- 职责：公开 updatedAt；按 itemResponseId 选择最后一条合法人工事件映射 manualReview；confirmed / locked 映射 confirmation，历史无 namespace 时使用 confirmedAt + review 安全 fallback。
- 安全：非法 / 未知 metadata 安全忽略且从不透传；manual_scored 不继续暴露旧 reviewReason；不公开事件列表、previousScoreValue、内部命名空间或 Session。

- 一致性：A18 的一致性边界是单个 ScoreResult 文档的条件原子更新；不使用 Mongo transaction、跨集合写入、分布式锁或自动重试。confirmed 不是 locked，qualityStatus=passed 不是疾病结论。

### A19 确认评分驱动的认知域编排

- 名称：`CognitiveDomainResultsController`
- 职责：绑定 compute / latest 两条嵌套路由，复用 `ScaleInstanceExecutionParamDto`，接收 Compute DTO；类级显式 Session / Roles Guard 与四个临床角色。compute 通过 `@CurrentUser()` 传入内部 computedBy；Controller 不操作 Model、不解析 ScoreResult、不构造 mapping rules 或处理 duplicate key。

- 名称：`CognitiveDomainComputationWorkflowService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`CognitiveDomainsService`、`CognitiveDomainResultPublicMapper`。
- 职责：完整 Patient → Visit → ScaleInstance → Definition / Version 归属；既有 result 幂等；首次状态和 source ScoreResult 最终性；调用纯映射与 `summarizeDomainScores()`；构造受控 runNo=1 result；duplicate-key 恢复；安全响应组装。
- 幂等边界：既有有效结果不重读或重新验证 ScoreResult，也不重新要求首次 Patient / Visit / Instance 状态；只返回既有安全结果。latest 只读并允许历史状态 / voided result。
- 写入边界：只调用 CognitiveDomainsService 创建一条 computed 结果；不修改 Patient、Visit、ScaleInstance、ItemResponse、MediaEvidence 或 ScoreResult，不创建 ClinicalReport，不使用 transaction、分布式锁或 runNo=2。

- 名称：`mapConfirmedScoreToDomainInputs()`
- 类型：无 Nest DI、无数据库访问的纯函数。
- 职责：验证 ScoreResult item set / duplicate itemCode、countsTowardTotal、finite min/max、itemResponseId、cognitiveDomainCodes 与 ScaleVersion 绑定；domain trim + lowercase + 单 item 去重；生成 weight=1 的 included / excluded mapping input、排序 domainCodes、受控 mappingSnapshot / policy。
- 安全：只读取已确认 itemScores 安全字段，不读取作答、图片、手写、expectedValue、scoringRule、isCorrect 或 AI；不修改输入，不按 scaleCode / itemCode 分支，不硬编码 domain title。

- 名称：`CognitiveDomainResultPublicMapper`
- 职责：显式逐字段输出 domain score、contribution、固定 mapping policy / interpretation、computation / review / version / timestamps；finite / null 归一化并稳定排序复制数组。
- 安全：不透传 subjectCode、数据库关系大包、metadata、qualityHints、computedBy、原始 Mixed mappingRules、内部 notes、评分 / 确认意见、作答、媒体、阈值或诊断内容。

- 模块依赖：`CognitiveDomainsModule` 单向导入 AuthModule、PatientsModule、AssessmentsModule、ScalesModule、ScoringModule；ScoringModule 不导入 CognitiveDomainsModule，无循环、forwardRef 或其他模块 Schema 重复注册。

### A20 访视级规则化报告编排

- 名称：`ClinicalReportsController`
- 职责：绑定 visit 级 generate / latest、Path / Body DTO、显式 Session / Roles Guard 与四个临床角色。generate 使用 `@CurrentUser()`；latest 不使用。Controller 不注入 Model、不读来源、不构造快照 / narrative、不解析 metadata 或处理 duplicate key。

- 名称：`ClinicalReportGenerationWorkflowService`
- 依赖：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`CognitiveDomainsService`、`MediaEvidenceService`、`ReportsService`、`ClinicalReportPublicMapper`。
- 职责：确认 + scope 规范化；Patient / Visit 联合归属；既有 version 1 报告幂等 / scope / voided / incomplete；首次状态；所选 ScaleInstance / 历史配置；最终 ScoreResult；确定性 CognitiveDomainResult；媒体筛选 / 质量；actor 角色优先级；纯 builder；单文档 create；duplicate key 恢复；latest 历史读取和安全响应。
- 幂等：既有同 scope 报告不重读 ScoreResult / CognitiveDomainResult / media，也不重新构建或修改；不同 scope 冲突。duplicate key 后按同一 visit / type / version 重读并复用相同规则；仍无记录返回生成冲突。
- 写入边界：只调用 ReportsService 创建一条完整 ClinicalReport；不调用 A17-A19 compute / review / confirm，不修改 Patient / Visit / ScaleInstance / ItemResponse / ScoreResult / CognitiveDomainResult / MediaEvidence，不使用 transaction / 分布式锁。

- 名称：`buildClinicalReportCode()` / `buildClinicalReportDraft()`
- 类型：reports 模块内无 Nest DI、无数据库 / Storage / 网络访问的纯函数。
- 职责：SHA-256 确定性 reportCode、稳定 scope / score / domain / evidence 顺序、白名单 patient / visit / scale / score / domain / evidence snapshots、固定五段非 AI narrative、aiDraft not_requested、quality 派生和 a20Generation metadata。scoreDetails 固定 null、visit clinicalContext 固定 null、domain 不编造 minScore；不读取原始作答 / 自由文本 / 媒体 Buffer，不评分、不计算认知域、不生成诊断 / 建议。

- 名称：`ClinicalReportPublicMapper`
- 职责：逐字段输出安全 patient / visit / scale / score / domain / evidence / narrative / generation / confirmation / timestamps，finite / null 归一化、数组复制 / 稳定排序和 isFinal 派生；非法 generation metadata 返回 null。
- 安全：不透传内部 Summary、Mixed、clinicalContext、metadata、qualityHints、source ID 数组、scoreResultId / scoreDetails、domain result ID、media / item ID、storageObjectKey、AI provider / model / draftText、signatureText 或 correction / audit 内部字段。

- 模块依赖：`ReportsModule` 单向导入 Auth、Patients、Assessments、Scales、Scoring、CognitiveDomains、Media；来源模块均不导入 ReportsModule。无循环依赖、forwardRef 或来源 Schema 重复注册；一致性边界为单 ClinicalReport 文档 create + 既有 reportCode unique 索引。

## 4. 后续同步规则

- Service 事实以实际代码、模块边界和测试为准。
- 不得将未确认业务流程写成已实现 Service 能力。
- 跨模块调用、事务和一致性要求应在实现后及时补充。

### A21 ClinicalReport review workflow

- `ClinicalReportReviewWorkflowService` 依赖 `PatientsService`、`AssessmentsService`、`ReportsService`、`ClinicalReportPublicMapper`；负责 ownership、Patient / Visit 写状态、认证 actor、状态 / readiness、并发 miss、幂等与安全响应。不依赖 Scoring、CognitiveDomains、Media、Storage、LLM。
- `clinical-report-review.ts` 是无数据库纯函数：规范化 clinician text，保留 A20 五段 narrative，计算 changedFields / no-change，严格验证并保留 metadata 顶层 namespace，追加最多 200 条 `a21Edits`，构建 submission / confirmation audit，评估 readiness；不修改输入。
- `ReportsService.findReportByOwnership()` 按 report + patient + visit + cognitive_assessment 读取服务端真实版本；三个 `*IfUnmodified()` 方法使用单次 `findOneAndUpdate`，filter 含 ownership、type、精确 version、当前允许 status、updatedAt，并启用 `new=true / runValidators=true`。
- edit 原子 `$set` 仅 narrative、source=mixed、metadata；submit 仅 status + metadata；confirm 仅 status + Schema confirmation + qualityStatus + metadata。没有 snapshot / scope / reportCode / version / aiDraft / lockedAt 写入。
- `ClinicalReportPublicMapper` 容错解析 A21 metadata：公开 doctorOpinion / recommendationText、最后编辑摘要、submission 摘要和 confirmationId；非法 metadata 安全忽略，不返回 metadata、事件数组、previous / next、signatureText。
- 与 A20 边界：Generation Workflow 仍负责一次性创建规则化 system_draft 和历史来源快照；Review Workflow 只把当前 ClinicalReport 文档作为确认对象，不调用 A17-A20 来源读取 / 重算，不重生成 narrative。
- 一致性边界是单 ClinicalReport 文档原子更新；没有 Mongo transaction、分布式锁、跨集合补偿、AuditLog 集合或循环依赖 / forwardRef。

### A22 ClinicalReport lock workflow

- `ClinicalReportLockWorkflowService` 只依赖 `PatientsService`、`AssessmentsService`、`ReportsService`、`ClinicalReportPublicMapper`；负责 ownership、认证 doctor/admin actor、已锁定幂等、首次 Patient / Visit 状态、strict expectedUpdatedAt、readiness、原子 miss 恢复与安全响应。
- Workflow 不依赖 Scoring、CognitiveDomains、Media、Storage、LLM/AI，也不读取来源 Model；已锁定分支只验证资源归属和锁定事实，不重新执行首次锁定状态 / updatedAt 检查。
- `clinical-report-lock.ts` 是无数据库纯函数，复用 A21 导出的 plain object、A20 generation、A21 submission / confirmation 与基础报告完整性规则；评估首次锁定 readiness，构建一次性 a22Lock，保留 metadata namespace，解析完整审计 / 历史 fallback，且不修改输入或 status。
- `ReportsService.lockReportIfUnmodified()` 只负责 ObjectId 转换、完整条件 filter 和单文档 `findOneAndUpdate()`；update 只含 lockedAt、lockedBy、metadata，Mongoose timestamps 更新 updatedAt。没有 save、自动重试、transaction、分布式锁或来源更新。
- `ClinicalReportPublicMapper` 无数据库访问，安全解析 a22Lock 为 `lock`；缺 namespace 且 Schema 锁定字段完整时返回受控 fallback，非法 / 不一致审计返回 lock=null；继续保留 top-level lockedAt，不返回 metadata 或原始 lockedBy。
- 与 A20/A21 边界：A20 负责生成历史快照，A21 负责 clinician edit / submission / confirmation，A22 只锁定已经 confirmed 的当前 ClinicalReport 文档。A22 不修改 A20/A21 metadata、confirmation、narrative、快照、source / quality / status，不实现 unlock / archive / correct / void。

### A23 ClinicalReport source freeze workflow

- `ClinicalReportSourceFreezeWorkflowService` 依赖 Patients、Assessments、Scoring、CognitiveDomains、Media 的导出 Service，以及 ReportsService / public mapper；负责 ownership、doctor/admin actor、首次 readiness、精确 scope、固定顺序批量冻结、全量重读验证、恢复、completed 幂等和安全回执。
- `clinical-report-source-freeze.ts` 是无 DI / 数据库的纯函数：验证已锁报告与 A20-A22 metadata，规范化、去重和稳定排序 scope，构建 counts、in_progress / completed audit，保留其他 metadata namespace，并严格解析既有审计与 scope 一致性。
- `ReportsService.startSourceFreezeIfUnmodified()` 以 ownership + 精确版本 + report prerequisite + expectedUpdatedAt + 无既有 A23 审计原子写入 in_progress；`completeSourceFreezeIfMatching()` 继续锚定精确版本、相同 report prerequisite、start 后 updatedAt、freezeId + in_progress 后原子写 completed，不修改正文、快照、confirmation、锁字段或 status。
- `AssessmentsService` 提供 exact ScaleInstance / ItemResponse 查询和批量冻结；`ScoringService` 冻结 confirmed ScoreResult；`CognitiveDomainsService` 只为 computed/confirmed 域结果补 lockedAt；`MediaEvidenceService` 冻结 attached 证据。所有方法限定 patient / visit / 精确 ID，并返回受控批次计数。
- ReportsModule 保持单向依赖来源模块；不重复注册来源 Schema、不直接注入跨模块 Model、不使用 forwardRef。跨集合操作无 Mongo transaction，in_progress 是恢复锚点；部分失败不回滚或解冻，completed 仅在重读验证全部来源后写入。
- public mapper 只解析安全 summary，不公开 metadata / scope IDs；A20-A22 metadata 更新继续使用顶层 namespace 合并并保留 a23SourceFreeze。

### A24 ClinicalReport archive workflow

- `ClinicalReportArchiveWorkflowService` 只依赖 `PatientsService`、`AssessmentsService`、`ReportsService` 与 `ClinicalReportPublicMapper`；负责 Patient / Visit / report ownership、认证 doctor/admin actor、既有 archive 幂等 / historical fallback、首次 transition / readiness、expectedUpdatedAt 原子写、miss 重读和安全 response。Patient 与 Visit 不参与可编辑状态判断，inactive / locked 不阻断。
- Workflow 不依赖 Scoring、CognitiveDomains、Media、Storage 或 AI，也不读取来源 Model；A23 completed 审计是来源冻结事实锚点。A24 不调用来源冻结批量方法，不重新验证来源集合，不修改 Patient / Visit。
- `clinical-report-archive.ts` 是无 DI / 数据库访问的纯函数，复用 A20/A21 metadata parser、A22 lock resolver 与 A23 source-freeze resolver：校验 confirmed / mixed / passed、confirmation、锁定、completed freeze、归档 / void / correction 边界与乐观并发；构建 actor 和一次性 a24Archive；保留全部既有 / 未知合法 metadata namespace；解析完整 A24 审计和历史 fallback，且不修改输入。
- `ReportsService.archiveReportIfUnmodified()` 只负责 ObjectId 转换、完整原子 filter 和单次 `findOneAndUpdate({ new: true, runValidators: true })`；update 只包含 status=archived、archivedAt、archivedBy、metadata。Mongoose timestamp 更新 updatedAt；没有 save、自动重试、transaction、分布式锁或来源写入。
- `ClinicalReportPublicMapper` 无数据库访问，继续返回 top-level archivedAt，并把完整合法 A24 审计或历史 fallback 映射为安全 `archive`；非法 / 不一致审计只令 archive=null，不透传内部值。archive response receipt 增加 alreadyArchived。
- 与 A22/A23 边界：A22 锁定事实和 A23 completed 审计只读作为首次归档前置，A24 不修改 lockedAt / lockedBy、a22Lock、a23SourceFreeze、confirmation、narrative、快照、scope 或来源对象。重复 archived / corrected 请求允许旧 expectedUpdatedAt 且不写库。
- 与 A20/A21 既有接口边界：A20 generate 对同 scope archived 报告保持幂等；A21 edit / submit 不恢复可写状态、confirm 保持 final-status 幂等；A22 lock 和 A23 completed freeze-sources 保持只读幂等并保留 a24Archive。无循环、forwardRef、新 Schema、transaction、unarchive / correction / void / PDF / AI。

### A25 ClinicalReport correction workflow

- `ClinicalReportCorrectionWorkflowService` 只依赖 PatientsService、AssessmentsService、ReportsService 与 public mapper；负责 ownership、doctor/admin actor、latest/readiness、start/create-or-resolve/record/complete、in_progress 恢复、completed 幂等与稳定错误。不依赖 Scoring、CognitiveDomains、Media、Storage 或 AI。
- `clinical-report-correction.ts` 是无 DI / 数据库访问的纯函数：复用 A20 provenance、A21 confirmation、A22 lock、A23 freeze、A24 archive parser；计算线性版本与确定性 code，构建 source / replacement metadata，深复制固定快照，验证 replacement，构建 correction record / completion，且不修改输入。
- `ReportsService` 增加 startCorrectionIfUnmodified、createCorrectionReplacement、findCorrectionReplacementByCode、listReportsByVisitTypeVersion、recordCorrectionReplacementIfMatching 与 completeCorrectionIfMatching；start / record / complete 各为 source 单文档条件更新，replacement 使用 Model.create + unique reportCode 恢复，不使用 transaction。
- 合法并发收敛：pre-start latest / next-version 竞态先重读 source，并只收敛到其精确 `in_progress` / `completed` A25 事实；start 原子 miss 同样重读后收敛。replacement 采用确定性 code 的 create-or-resolve；replacement record / complete 交界处只在 correctionId、replacement ID、code 与 version 全部严格匹配时继续同一 `in_progress` 或返回同一 `completed`。start owner 与 completion executor 可以不同；genuine non-latest、branch 和非确定性 collision 继续拒绝。
- 编排不使用 Mongo transaction、mutex、自动 retry、sleep 或 polling；持久化 miss 只执行有界重读与精确事实校验，不重放 source start 或创建分支 replacement。
- A20 generation 改为 latest-first；A21 ownership 查询不再固定 V1，三个写 filter 使用已读取 reportVersion。Workflow 验证 a25CorrectionReplacement 后仅 doctor/admin 可写，并只对合法 replacement 豁免 Patient / Visit 后续状态；metadata 保留 lineage。
- public mapper 纯映射 correction / replacementOf，非法 A25 安全返回 null；A26 在不改变此公开映射的前提下泛化 A22-A24。

### A26 replacement irreversible lifecycle

- `clinical-report-replacement-lineage.ts` 是职责单一的纯校验：V1 旁路；V2+ 每一跳复用 A25 replacement / correction parser 与 A22-A24 resolver，验证安全整数连续版本、同 ownership/type、前序 corrected、唯一 correctionRecord，以及 source completed audit 与 current replacement metadata 的全部双向关系和 archive / freeze anchors。
- `ReportsService.hasValidReplacementLifecycleLineage()` 只按当前报告 ownership 逐级读取 `previousReportId` 直到 V1，循环或任一跳不一致返回 false；Workflow 统一映射为 409 `CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID`，不会用跨 ownership 查询探测其他报告。
- Lock / source-freeze / archive Workflow 在初始读取和原子 miss 重读后复用同一 lineage 检查。V1 lock / freeze 保留 active Patient 与 editable Visit；合法 V2+ 只校验 ownership，不受历史 inactive / locked / voided 阻断。archive 延续 ownership-only 资格，且只写当前 replacement。
- `lockReportIfUnmodified()`、source-freeze start / complete、`archiveReportIfUnmodified()` 都接收服务端读取的真实 reportVersion，并在原子 filter 中精确等值匹配；没有 `>=2` 宽匹配。所有既有状态、void / archive / correction、阶段审计和 expectedUpdatedAt 条件保留或补强。
- replacement freeze 继续从当前报告快照和精确 ID 建 scope；来源 Service 的条件更新只处理尚未冻结记录。已经由前序版本冻结且状态 / lockedAt / snapshot 完整兼容的共享来源只验证并计入 previouslyFrozen，不更新来源文档；当前 replacement 仍形成独立 in_progress → completed receipt。恢复完成使用持久化 started actor、freezeId、scope 与 note。
- 未增加 Controller 路由、公开 DTO / response 字段、Schema、collection、依赖、配置、transaction、队列或后台任务；前序 corrected 报告和既有 A22-A25 metadata 均只读。

### A27 WP-04 后端阶段一历史读取

- `ClinicalHistoryModule` 只导入 Auth、Patients、Assessments、Scoring、CognitiveDomains 与 Reports；没有 `MongooseModule.forFeature`、重复 Schema、Model 直连、`forwardRef` 或循环依赖。`ClinicalHistoryController` 只暴露 assessment-history，`ClinicalHistoryQueryService` 负责 Patient 校验、scaleCode 预分页过滤、Visit count/page 与四类批量读取。
- `PatientsService.findPatientHistoryIdentityById()`、`AssessmentsService.findAssessmentHistoryVisitIdentity()` 只投影 ownership identity；Assessments 另提供 scaleCode 唯一 Visit IDs、稳定 Visit page/count 和页内 ScaleInstance 批量读取；Scoring / CognitiveDomains 各提供 ownership-scoped runNo=1 轻量批量读取；Reports 提供固定 cognitive_assessment 的轻量历史集合读取。全部为 lean + explicit projection，不把 Mongoose document 或 Model 暴露给编排层。
- `assessment-history.mapper.ts` 为无 IO 纯安全边界：对 Score / Domain 精确 ownership、final/void、quality/review/time/trace/数值/mapping 资格进行保守判定；不重算总分或认知域，Domain 不完整不抹掉已可用 Score；输出严格白名单。
- `ClinicalReportHistoryQueryService` 负责版本列表和指定历史详情 ownership。版本列表先读取完整轻量集合、调用完整链 evaluator，再内存分页；详情复用 `assertReadableClinicalReport()` 和 `ClinicalReportPublicMapper`，`latest` 也复用同一 readable 规则。
- `clinical-report-history-lineage.ts` 无 IO：集合层验证 ownership/type、唯一连续 V1…Vn、唯一 code、incoming/outgoing、latest/in-progress 边界；相邻 hop 复用 A26 单跳校验。基础或 lifecycle parser 错误分类 incomplete，关系结构/anchor 错误分类 lineage invalid。`clinical-report-version.mapper.ts` 不输出内部 ID。
- A27 不新增 collection、Schema、index、缓存、read model、transaction、队列或写入；不调用内部 HTTP，不加载历史列表不需要的大快照。

### A28 WP-04 后端阶段二基础随访趋势

- `ClinicalHistoryModule` 增加单向 `ScalesModule` 导入；当前 Controller 在共同 `patients/:patientId` 根下暴露 `assessment-history` 与 `follow-up-trends`。模块仍无 Schema / Model、`forwardRef` 或循环依赖，Controller 只做 Guard、DTO 与 QueryService 委派。
- `ClinicalHistoryQueryService.getPatientFollowUpTrend()` 的固定顺序为：日期倒置校验 → Patient ownership identity → 当前 `ScaleCatalogService` 可用量表校验 → 按日期升序读取 `maxPoints+1` 个 Visit → Visit 日期事实校验 → 超限 409 → 空范围直接响应 → 一次 ScaleInstance batch → 一次 ScoreResult batch → 一次 CognitiveDomainResult batch → 每 Visit source 评估 → 纯 mapper 相邻比较。它不调用 ReportsService、内部 HTTP、ItemResponse、评分/认知域计算 workflow 或任何写方法。
- `AssessmentsService.listPatientFollowUpTrendVisits()` 只按 patient/date 过滤，不按 Visit status 或目标量表存在性过滤；显式投影 Visit id/patient/visitCode/type/status/date，按 assessmentDate/_id asc 并 limit max+1。`listPatientFollowUpTrendScaleInstances()` 按 patient + visit IDs + normalized scaleCode 批量读取显式 source 资格字段；二者均 lean。
- `clinical-history-source-evaluator.ts` 是 A27/A28 共用的无 IO 资格原语：有限数/有效日期/非空文本、ownership、Score final/quality/review/time/range/exact trace、Domain final/quality/mapping/warning/trace/数值/weighted pair。A27 mapper 已改为复用它，既有公开语义保持不变。
- `follow-up-trend-source.ts` 按固定优先级评估每个 Visit：Visit voided → multiple instance ambiguous → no instance missing → instance/Score voided → Score missing → instance/Score non-final → ownership/quality/time/value/trace incomplete → available。Domain 缺失/不完整独立记录，不会把 available 总分降级；不擅自选择多个实例或结果。
- `follow-up-trend-comparability.ts` 只比较紧邻点。总分 exact 条件为 scaleCode/scaleVersion/CRF/scoring/encoding/admin mode/min/max 全相等；Domain 先要求 mapping version/source/mode/set 全相等，再逐 domain 检查 range、weightedMax 与 nullable 一致性。delta 为 current-previous 原始运算、无舍入、无跳点；reason 使用固定排序。
- `follow-up-trend.mapper.ts` 只输出闭合 response type 与固定 `wp04-exact-trace-v1` policy，按 date/id asc 再生成 adjacent comparison；不 spread 内部 summary，不暴露 Patient、ownership/source 内部 ID、metadata、raw/Mixed、report、media、AI 或诊断字段。
- A28 不新增 collection、Schema、index、缓存、read model、transaction、dependency、queue/job 或写入；查询数随 point 数保持常数级 batch，不存在逐 Visit / 逐实例 N+1。
