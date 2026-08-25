# CogMemory AD / 智忆评 后端 Service 职责地图

## 1. 文档定位与权威来源

本文档是 Backend Service / Workflow / 关键 Provider / 纯编排原语的职责、调用关系、内部一致性与恢复边界 owner。它按 current module/service architecture 组织，不维护工作包阶段、公开 HTTP 合同、DTO 字段、稳定患者施测业务流程、测试 evidence 或静态配置矩阵。

- endpoint、Controller、Guard/Roles、HTTP status 与公开业务错误见 [Backend API Map](./handoff-backend-api-map.md)。
- request DTO、public response type、字段、validation 与安全省略见 [Backend DTO Cheatsheet](./handoff-backend-dto-cheatsheet.md)。
- 受监督患者施测的 same/cross、逐题、媒体、医生复核与 F2/F3 稳定业务合同见 [Patient Administration Contract](./handoff-patient-administration-contract.md)。
- 测试治理和 current / historical evidence 见 [Backend Testing Playbook](./handoff-backend-testing-playbook.md)；具体 spec 与实现演进由 current test source / Git 追溯。
- 环境变量、默认值、静态校验和数据库用途映射见 [Backend Config Matrix](./handoff-backend-config-matrix.md)。
- 模块级 current capability 与真实缺口见 [Backend Snapshot](./handoff-backend-snapshot.md)；工作包状态见 [Roadmap](./handoff-roadmap.md)。

Service current 事实以 `backend/src` 为准。本文保留理解长期内部架构所需的调用图、CAS、补偿、barrier、恢复、幂等、隐私 fail-closed 与 module dependency 边界，不复制其它 owner 的完整事实。

## 2. Current service architecture

当前主要内部能力分布于 Common / Storage、Scales、Patients / Assessments、Media / Patient Administration、Scoring、Cognitive Domains、Reports、Clinical History 与 Users / Auth。Controller 仅在需要说明 Service 上游调用方时出现，不作为独立 inventory。

### 2.1 Common / Storage

#### `AppService`

- 文件：`backend/src/app.service.ts`
- 上游：`AppController`；下游：无。
- 职责：提供最小应用健康状态；不承担业务编排、配置解析或异常协议定义。

#### `StorageConfigService`、`FakeStorageService`、`OssStorageService` 与 `STORAGE_SERVICE`

- 文件：`backend/src/modules/storage/storage-config.service.ts`、`fake-storage.service.ts`、`oss-storage.service.ts`、`storage.constants.ts`
- `StorageConfigService` 读取并规范化 Storage / OSS 配置；必需配置缺失时 fail closed。静态配置值由 Backend Config Matrix 维护。
- `STORAGE_SERVICE` 是调用方使用的 driver token；`StorageModule` 根据配置提供 fake 或 OSS 实现。`FakeStorageService` 提供同一内部接口的本地实现，`OssStorageService` 负责 object put/delete 与短期 signed URL。
- `OssStorageService` 固定使用安全连接，并在返回 signed URL 前验证 HTTPS；put、delete 与 signed URL provider failure 均以安全的 `ServiceUnavailableException` 向调用层暴露，不吞掉 delete failure，也不得泄漏凭据、完整对象定位或 provider 原始响应。需要 best-effort compensation 的 Media workflow 在自身补偿边界 catch 并记录受控失败。
- 上游：Media 相关 workflow；下游：`StorageConfigService` 与 OSS client。Storage driver 不判断 Patient、Visit、ItemResponse 或 Evidence 业务资格。

### 2.2 Scales

#### `ScalesService`

- 文件：`backend/src/modules/scales/services/scales.service.ts`
- 职责：规范化 scale code，读取 `ScaleDefinition` / `ScaleVersion`，并通过安全 mapper 提供内部摘要；只读，不创建、更新或删除量表配置。
- 上游：Assessment execution/submission、Scoring、Cognitive Domains、Reports 等 workflow；下游：两个量表 Mongoose Model。
- 边界：不执行作答、评分、报告、认证或权限逻辑；患者呈现和评分配置不以原始 Mongoose 子文档跨模块传播。

#### `ScaleSeedDataService`

- 文件：`backend/src/modules/scales/seeds/scale-seed-data.service.ts`
- 职责：提供 current MMSE / MoCA seed 的只读查询与通用 `validateScaleSeeds()` 校验；不访问数据库、Storage 或 manifest，不提供 import/upsert runner。
- 上游：`ScaleCatalogService`、`AssessmentExecutionService`；下游：current seed 常量。
- 边界：只维护 seed 读取与通用结构验证。详细量表题目、患者施测和复核业务合同由 Patient Administration Contract 及 current seed/code 维护，不在本 Service Map 展开。

#### `ScaleCatalogService`

- 文件：`backend/src/modules/scales/services/scale-catalog.service.ts`
- 职责：基于已校验 seed 提供可用目录、解析 scale/version，并在初始化时幂等物化 `ScaleDefinition` / `ScaleVersion`。
- 上游：`ScalesController`、`AssessmentScaleWorkflowService`；下游：`ScaleSeedDataService` 与量表 Models。
- 一致性：新物化使用 insert-once 语义；已存配置与 current seed 一致时零额外写。必需配置缺失、部分缺失或发生 drift 时 fail closed，不自动覆盖或迁移；并发唯一键竞争通过重读同一权威记录收敛。

#### `PresentationAssetsService`

- 文件：`backend/src/modules/scales/services/presentation-assets.service.ts`
- 职责：按精确 package identity 只读解析 released manifest，验证路径 containment、文件存在、MIME 与 hash，并提供单资产只读流。
- 上游：`PatientAdministrationSessionService` 和只读资产核验入口；下游：私有 presentation package 文件。
- 边界：不扫描“最新”包、不生成或转码资产、不修改 manifest、不访问数据库/OSS，也不建立公开静态 URL。资产包的稳定患者业务语义见 Patient Administration Contract。

### 2.3 Patients / Assessments

#### `PatientsService`

- 文件：`backend/src/modules/patients/services/patients.service.ts`
- 职责：患者内部读取、分页/创建、subject code 规范化与安全摘要映射。
- 上游：`PatientsController`、Assessments、Patient Administration、Reports/History workflow；下游：`Patient` Model。
- 一致性与边界：重复 subject code 通过预检查与数据库唯一键竞争统一收敛；不直接返回完整 document 或敏感内部字段，不承担患者合并、归档或认证。

#### `AssessmentsService`

- 文件：`backend/src/modules/assessments/services/assessments.service.ts`
- 职责：`AssessmentVisit`、`ScaleInstance`、`ItemResponse` 与必要 Patient Administration session identity 的共享数据访问层；提供联合 ownership 读取、进度摘要、访视维护、首次开始、submission scope、Evidence ref 条件写、来源冻结和 History 批量读取原语。
- 上游：Assessment controllers，以及 execution、draft、submission、Patient Administration、Media、Scoring、Cognitive Domains、Reports/History workflow；下游：相关 Mongoose Models 与 `PatientsService`。
- 生命周期：仅初始化的 Visit/Instance 保持 draft；第一次已持久化的真实子活动以同一服务端事实时间条件启动所属 Instance 与 Visit，后续写不得覆盖首次 `startedAt` 或终态字段。
- 访视维护：物理删除适用于无执行事实的初始化集合，或经正式 incomplete ScaleInstance cleanup 后成为无 ScaleInstance、无 ItemResponse 子事实空壳的 started Visit；前者按目标 Visit 精确移除初始化子记录，后者保留真实 started 历史直到用户显式删除。其他已有执行事实 Visit 只写首次 void 审计，保留实例、作答、患者会话、媒体、评分、报告和历史。
- 未完成实例删除原语：对完整 Patient→Visit→ScaleInstance ownership 执行 supervised/draft-or-in-progress/终态字段/submission barrier/Session eligibility 判定；`in_progress` 无 terminated/expired 失败 Session 时 fail closed。导出的精确删除原语只删除计划中的 terminated/expired Session、owned ItemResponse，并以完整 ownership/lifecycle filter 最后删除 ScaleInstance；不删除或重置 Visit。
- 条件写：Evidence attach/clear、submission scope 与 freeze 方法均带完整 ownership、状态和 barrier 条件；恢复方法只用于已知补偿窗口，不开放通用旁路。跨集合流程由调用 workflow 负责恢复，不在本 Service 内假装事务原子性。

#### `AssessmentExecutionService`

- 文件：`backend/src/modules/assessments/services/assessment-execution.service.ts`
- 职责：由 seed 构建内部执行计划，并创建 `ScaleInstance` 与初始 `ItemResponse` skeleton。
- 上游：`AssessmentScaleWorkflowService`；下游：`ScaleSeedDataService`、Instance/ItemResponse Models。
- 一致性：先创建父实例、再批量创建题目；批量失败时只按本次 instance identity 尝试删除本次子记录和父记录，然后重抛原始错误。该策略是精确补偿，不是 Mongo transaction。
- 边界：不创建 Patient/Visit、媒体、评分、认知域或报告，也不启动作答生命周期。

#### `AssessmentScaleWorkflowService`

- 文件：`backend/src/modules/assessments/services/assessment-scale-workflow.service.ts`
- 职责：编排 Patient/Visit ownership、可用 scale/version、同 Visit 同量表唯一性、catalog 物化和 execution 创建。
- 上游：`AssessmentVisitsController`；下游：`PatientsService`、`AssessmentsService`、`ScaleCatalogService`、`AssessmentExecutionService`。
- 一致性：实例 identity、版本引用和 operator snapshot 来自服务端；明确的唯一键竞争重读/分类为同一实例冲突，其他内部失败保持 fail closed。初始化不改变 Visit 状态或启动计时。

#### `AssessmentExecutionDetailService`

- 文件：`backend/src/modules/assessments/services/assessment-execution-detail.service.ts`
- 职责：只读组合 Patient/Visit/Instance ownership、已物化量表配置、ItemResponse 与实际进度。
- 上游：`AssessmentExecutionController`；下游：`PatientsService`、`AssessmentsService`、`ScalesService`。
- 边界：不写数据库；配置引用损坏时 fail closed，输出经 mapper 白名单，不传播完整量表规则。

#### `ItemResponseDraftService` 与草稿纯原语

- 文件：`backend/src/modules/assessments/services/item-response-draft.service.ts`
- 职责：校验 Patient→Visit→Instance→ItemResponse ownership、可编辑状态、父/子 submission barrier、服务端题目配置和草稿语义，并以单条条件更新保存正式医护草稿。
- 上游：`AssessmentExecutionController`；下游：`PatientsService`、`AssessmentsService`、`ItemResponse` Model。
- 并发：CAS filter 包含完整 ownership、可编辑状态、lock/barrier 与 expected draft revision；成功同写新 revision 和服务端保存时间。竞争 miss 后重读权威状态，优先区分生命周期/barrier 变化与普通 stale，且不自动 retry。
- 父级启动：只有草稿 CAS 成功后，才以本次持久化时间委派 `AssessmentsService` 条件启动 Instance/Visit；无效 payload、stale、竞争 miss 或保存失败均不产生父级副作用。
- 隔离：不覆盖 Evidence refs、评分或受保护题目配置，不触发 submission/scoring/report。受监督患者输入只读取 completed session 作为高层服务门禁；稳定患者业务合同由 Patient Administration Contract 维护。
- 纯函数目录：`backend/src/modules/assessments/lib`；执行 mapper：`backend/src/modules/assessments/services/item-response-execution.mapper.ts`。
- `item-response-draft-json.ts`、`structured-manual-response.ts`、`binary-manual-decision.ts`、`item-response-timing.ts` 分别负责受限 JSON 克隆、结构化人工字段解析、二元人工判定和 timing 状态纯校验；均无数据库/网络副作用。
- `manual-observation-record.ts` 是版本绑定的兼容解析原语；`item-response-answer-content.ts` 统一判断有效原始作答。具体题目合同不在本文重复。
- `item-response-execution.mapper.ts` 只把内部摘要投影为安全执行视图，不透传完整 scoring rule、Storage identity、评分结果或 metadata。

#### `ScaleInstanceSubmissionService`、`ScaleInstanceSubmissionBarrierService` 与 readiness

- 文件：`backend/src/modules/assessments/services/scale-instance-submission.service.ts`、`scale-instance-submission-barrier.service.ts`
- `ScaleInstanceSubmissionService` 负责编排 ownership、量表/题目追溯、固定 ItemResponse scope、两次实时 readiness、操作者事实、屏障推进、完成/释放恢复和幂等重读；不评分、不生成报告、不修改 Visit。
- 上游：`ScaleInstanceSubmissionController`；下游：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScaleInstanceSubmissionBarrierService`。
- `ScaleInstanceSubmissionBarrierService` 只依赖 Instance/ItemResponse Models，提供 parent barrier 创建、child fencing、parent fenced、release claim、child release、parent clear 与最终 completion 的条件写原语。
- 一致性阶段：parent `fencing` → 固定 scope children 同 token fenced → parent `fenced` → 二次 readiness → completed。失败路径为 parent `releasing` → 仅同 token children 清理 → parent open。
- 所有步骤精确匹配 ownership、scope、barrier version/token 和允许父状态；同 token 可幂等恢复，其他 token 或损坏 barrier fail closed。completion 与 release 竞争只能有一个方向获胜。
- 跨父子集合不使用 transaction、mutex、后台 job、sleep/polling 或自动重试；持久化 barrier 是进程中断后的恢复锚点。completed 保留 fenced child barrier，阻止旧写越过终态。
- `backend/src/modules/assessments/lib/scale-instance-submission-write-barrier.ts` 纯解析 barrier/scope；`scale-instance-submission-readiness.ts` 纯评估题目集合、作答、人工结构、timing、media 与 operator note 的完成性。它们不访问数据库，也不从缺失事实推断或 backfill。

### 2.4 Media / Patient Administration

本节只维护 Service composition、持久化边界和恢复算法。same/cross、准备、逐题推进、媒体、重做/接管与医生复核的稳定业务合同统一引用 Patient Administration Contract。

#### `PatientAdministrationSessionService`

- 文件：`backend/src/modules/assessments/services/patient-administration-session.service.ts`
- 职责：集中持久化患者施测 session 生命周期、设备模式、患者凭证、当前步骤、capture/playback/evidence references、staff/patient 控制动作、完成与惰性过期；提供 staff/patient controllers、患者 Guard、Media evidence/review workflow 所需的最小内部方法。
- 下游：`PatientAdministrationSession` 与只读 `ScaleInstance` identity Model、`PatientsService`、`AssessmentsService`、`ScalesService`、`PresentationAssetsService`、`AuthService`。
- 并发：credential、control、capture、playback 与 evidence attach 共享单一 revision CAS；患者写额外匹配 token hash 与 current step。并发同 revision 至多一个成功，失败不自动 replay；流在 CAS/最终授权失败时立即关闭。
- 唯一性与恢复：同实例 partial unique index 阻止多个开放 session；凭证碰撞仅有限重试。各入口惰性检查绝对有效期，以状态+revision 原子失效并清凭证；不存在 TTL、cron、queue、transaction 或物理删除。
- 持久化边界：session 内嵌 capture/playback/evidence facts，redo 保留旧 run 事实但 current completion 只读取当前 run。首次进入真实 active 状态后才委派 `AssessmentsService` 条件启动 Instance/Visit。
- 非职责：不创建 Storage object 或 MediaEvidence，不把患者原始事实/ASR 候选直接写入正式 `ItemResponse`，不评分或生成报告。

#### `PatientAdministrationEvidenceService`

- 文件：`backend/src/modules/media/services/patient-administration-evidence.service.ts`
- 职责：从 Guard context 取得权威 session，读取 ItemResponse 仅用于 ownership/状态复核，校验患者媒体后按“私有 Storage object → MediaEvidence → session evidence CAS”持久化。
- 下游：`PatientAdministrationSessionService`、`AssessmentsService`、`MediaEvidenceService`、`STORAGE_SERVICE`、`StorageConfigService`。
- 补偿：Storage 成功而 Evidence create 失败时删除本次 object；Evidence 成功而 session CAS 失败时删除本次 Evidence 与 object。补偿只使用本次 identity，不触碰其它记录。
- 边界：只写患者 session 的原始 evidence facts，不 attach 正式 ItemResponse evidenceRef，不完成步骤、不执行 ASR、评分或报告；患者原始文件名和凭据不持久化。

#### `MediaEvidenceService`

- 文件：`backend/src/modules/media/services/media-evidence.service.ts`
- 职责：MediaEvidence 的 ownership-scoped 读取、创建、条件作废、补偿删除、安全摘要，以及 transcription claim/finalize/fail 条件写。
- 上游：`MediaEvidenceWorkflowService`、`PatientAdministrationEvidenceService`、`MediaEvidenceTranscriptionService`、Reports/History read workflows；下游：`MediaEvidence` Model。
- 并发：transcription claim 匹配完整 ownership、当前媒体/存储/lock 状态与允许旧状态；finalize 继续匹配本次 request token。stale provider、reclaim 或相邻生命周期变化不能覆盖新事实。
- 边界：不调用 Storage/ASR，不修改 Session、ItemResponse、评分或报告；内部 Storage/metadata 摘要不直接作为公开响应。
- 未完成实例清理：按完整 Patient/Visit/ScaleInstance ownership 列出目标 Evidence，只投影行 ID、lock/processing 判定和 Evidence 明确持有的 `storage.objectKey` / `handwritingTrace.trajectoryObjectKey`；不使用 `objectPrefix`。Storage 成功后才按同一 ownership 与计划 ID 精确物理删除 Evidence rows。

#### `PatientAudioAsrClientService`

- 文件：`backend/src/modules/media/services/patient-audio-asr-client.service.ts`
- 职责：根据 Backend Config Matrix 选择 disabled/stub/provider 行为；provider 模式使用内建 fetch、AbortController 和单次请求，无自动重试。
- 上游：`MediaEvidenceTranscriptionService`；下游：外部 ASR endpoint。
- 安全：只接受已授权的短期媒体 URL 和受控格式，严格解析有限候选文本；不记录 API key、签名 URL 或 provider 原始响应。provider 参数与静态校验由 Config Matrix/current config source 维护。

#### `MediaEvidenceTranscriptionService`

- 文件：`backend/src/modules/media/services/media-evidence-transcription.service.ts`
- 职责：staff 显式转写的唯一编排；验证完整 Patient→Visit→Instance→ItemResponse→Evidence ownership、可编辑/barrier 和患者 audio 资格，claim 后生成短期签名 URL，调用 ASR client，再 CAS finalize 或记录受控失败。
- 下游：Patients/Assessments、`MediaEvidenceService`、`STORAGE_SERVICE`、`PatientAudioAsrClientService`。
- 一致性：claim/finalize 由持久 token 锚定；技术失败只写有限状态，不覆盖录音或相邻生命周期。候选文本不自动进入正式答案，Service 不调用评分/报告，也不建设 queue/worker/retry。

#### `PatientAdministrationReviewService`

- 文件：`backend/src/modules/media/services/patient-administration-review.service.ts`
- 职责：只读组合最新 session facts、权威 ScaleVersion、完整 ItemResponse 集合与 session 引用的 Evidence，按 item/step/run 形成安全 review projection。
- 下游：`PatientAdministrationSessionService`、`ScalesService`、`AssessmentsService`、`MediaEvidenceService`。
- 完整性：逐层验证 version、ownership、item/step/run/type 与绑定 registry；无绑定返回空投影，损坏或覆盖不完整时 fail safe，不返回部分结构化映射。
- 边界：不写 session/答案、不生成签名 URL、不返回 Storage identity、凭据或完整控制事件。version-bound binding registry 只负责 review placement，不修改 seed/catalog/scoring rule。

#### `MediaEvidenceWorkflowService`

- 文件：`backend/src/modules/media/services/media-evidence-workflow.service.ts`
- 职责：编排 staff media list/upload/access/void，以及将既有患者 Evidence adopt 到正式 ItemResponse 或撤销该 formal reference。
- 下游：`PatientsService`、`AssessmentsService`、`MediaEvidenceService`、`PatientAdministrationReviewService`、`STORAGE_SERVICE`、`StorageConfigService`。
- 上传一致性：先验证 ownership、可编辑/barrier 与服务端 evidence requirement，再写 Storage、创建 Evidence、条件绑定 ItemResponse ref。任何后续失败只补偿本次 Evidence/object；不使用 transaction。
- adoption：复用 review 的权威 session/step/run/evidence facts，把同一既有 Evidence ID 条件绑定到正式 ref；不复制 object、不新建 Evidence、不自动形成答案。CAS 失败不删除患者原始事实。
- revoke：只清除精确 formal ref，保留患者原始 Evidence 与 Storage object，允许后续 review/再次 adoption。
- generic void：只处理 direct formal Evidence；清 ref 后条件作废 MediaEvidence，后者失败时只恢复本次空 pending ref。正常 void 不物理删除对象。
- 边界：不改变作答、draft revision、Instance/Visit 状态或评分，不自动 mark answered，不执行 OCR/AI/报告。

#### Media mapper / validator 纯边界

- 文件目录：`backend/src/modules/media/services`、`backend/src/modules/media/lib`
- `media-evidence-public.mapper.ts` 只做 field-level safe projection；Storage identity、内部 patient context 与原始 metadata 不外泄。
- `media-file-validation.ts`、`handwriting-trajectory-json.ts`、`patient-audio-file-validation.ts` 负责媒体内容/结构的纯校验、规范化、深克隆与 hash；具体字段限制由 DTO/validator code owner 维护。
- `patient-administration-review-structured-bindings.ts` 是 version-bound review placement registry，不推导患者业务流程。

`MediaModule` 单向依赖 `AssessmentsModule`、`StorageModule`、`ScalesModule` 等；`AssessmentsModule` 不反向导入 Media，Patient Administration session 通过导出 Service 被 Media 复用，避免 circular dependency、`forwardRef` 与重复 Schema registration。

#### `ScaleInstanceDeletionService`

- 文件：`backend/src/modules/scale-instance-deletion/services/scale-instance-deletion.service.ts`
- 上游：`ScaleInstanceDeletionController`；下游：Assessments、Media、Storage 及 Scoring/Cognitive Domains/Reports 的现有只读 Service。
- 职责：作为叶子 orchestration owner，先完成 ownership/eligibility、正式 Score/Domain/Report existence、Media lock/transcription processing 判定，再去重并严格删除 Evidence 明确持有的 object keys。
- 删除顺序固定为 Storage objects → MediaEvidence rows → terminated/expired PatientAdministrationSession → ItemResponse → ScaleInstance；任一 Storage failure 返回 `MEDIA_STORAGE_UNAVAILABLE` 且不进入 DB 删除，非预期 DB 删除失败返回 `SCALE_INSTANCE_DELETE_FAILED`，ScaleInstance 始终最后删除。
- 模块边界：`ScaleInstanceDeletionModule` 单向导入现有 owner modules；来源模块不反向依赖它。没有 `forwardRef`、重复 Schema registration、transaction、queue、后台 GC 或自动 retry/replay。

### 2.5 Scoring

#### `ScoringService`

- 文件：`backend/src/modules/scoring/services/scoring.service.ts`
- 职责：ScoreResult ownership-scoped 读取、创建和条件更新原语，以及通用 item/group/total 汇总。
- 上游：`ProvisionalScoringWorkflowService`、`ScoreReviewWorkflowService`、Cognitive Domains、Reports/History workflows；下游：`ScoreResult` Model。
- 一致性：人工复核与确认均使用服务端读取的 run/version、允许状态和 expected updatedAt 单文档 CAS；不修改 ItemResponse，不独立决定完整 workflow readiness。

#### `ProvisionalScoringWorkflowService` 与纯评分引擎

- 文件：`backend/src/modules/scoring/services/provisional-scoring-workflow.service.ts`、`backend/src/modules/scoring/lib/provisional-scoring-engine.ts`
- 职责：验证 Patient/Visit/Instance/ScaleVersion/ItemResponse ownership 和 item set，调用纯评分引擎与 `ScoringService` 汇总，创建唯一 run，并在唯一键竞争后重读同一结果收敛。
- 上游：`ScoringController`；下游：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`ScoreResultPublicMapper` 与纯评分引擎。
- 纯引擎按 server-owned scoring configuration 分类和汇总；只使用正式医护确认事实，不从原始文本、Evidence、ASR 或 AI 推断正确性，不按具体 scale/item 硬编码。
- 边界：只创建 provisional ScoreResult，不修改来源实体，不确认/锁定结果，不创建认知域或报告。

#### `ScoreReviewWorkflowService` 与人工复核纯函数

- 文件：`backend/src/modules/scoring/services/score-review-workflow.service.ts`、`backend/src/modules/scoring/lib/manual-score-review.ts`
- 职责：验证完整 ownership/run/version，解析 actor，编排人工 score review、重新汇总、确认 readiness、expected updatedAt CAS、冲突重读与 confirmed 幂等。
- 上游：`ScoringController`；下游：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`ScoreResultPublicMapper` 与人工复核纯函数。
- 纯函数克隆 item scores/metadata、追加受控审计、验证 range/step 并派生汇总/quality；不修改输入。
- 一致性边界是单 ScoreResult 文档条件更新；不跨集合写入、不自动重试，不把 confirmed/quality 解释为诊断。

#### `ScoreResultPublicMapper`

- 文件：`backend/src/modules/scoring/services/score-result-public.mapper.ts`
- 职责：将内部结果、review 与 confirmation 事实投影为安全摘要并稳定排序；非法 metadata 安全忽略。
- 边界：不透传原始作答、规则、内部事件、previous value 或 reviewer identity。

`ScoringModule` 单向依赖 Patients、Assessments、Scales；这些来源模块不反向依赖 Scoring，无 `forwardRef` 或重复来源 Schema。

### 2.6 Cognitive Domains

#### `CognitiveDomainsService`

- 文件：`backend/src/modules/cognitive-domains/services/cognitive-domains.service.ts`
- 职责：CognitiveDomainResult ownership-scoped 读取、唯一 run 创建与通用 domain 汇总。
- 上游：`CognitiveDomainComputationWorkflowService`、Reports/History；下游：`CognitiveDomainResult` Model。
- 边界：不修改 ScoreResult/ItemResponse，不提供人工确认、重跑、诊断或报告写入。

#### `CognitiveDomainComputationWorkflowService`

- 文件：`backend/src/modules/cognitive-domains/services/cognitive-domain-computation-workflow.service.ts`
- 职责：验证 Patient→Visit→Instance→ScaleVersion 和 confirmed ScoreResult，调用纯 mapping/汇总，创建唯一 domain result；唯一键竞争后重读同一结果。
- 上游：`CognitiveDomainResultsController`；下游：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`CognitiveDomainsService`、`CognitiveDomainResultPublicMapper`。
- 幂等：既有有效结果直接安全返回，不重新计算或要求来源处于首次创建状态；latest 读取允许历史状态。
- 写入边界：只创建一条 domain result，不修改来源集合，不使用 transaction、锁或第二 run。

#### Domain mapping 与 mapper

- 文件：`backend/src/modules/cognitive-domains/lib/confirmed-score-domain-mapping.ts`、`backend/src/modules/cognitive-domains/services/cognitive-domain-result-public.mapper.ts`
- `confirmed-score-domain-mapping.ts` 纯验证 confirmed item set、ownership trace、domain codes 与量表配置，生成稳定 included/excluded mapping input；不读取作答、媒体、AI 或诊断阈值。
- `CognitiveDomainResultPublicMapper` 只投影安全 domain score、mapping/version/quality facts，并规范化数值与排序；不透传内部 metadata、actor 或原始 mapping rules。

`CognitiveDomainsModule` 单向依赖 Scoring 及其来源模块；Scoring 不反向导入 Cognitive Domains。

### 2.7 Reports

#### `ReportsService`

- 文件：`backend/src/modules/reports/services/reports.service.ts`
- 职责：ClinicalReport 的 ownership/latest/history 读取、初始/替代报告 create，以及 review、lock、source-freeze、archive、correction/replacement 所需的完整条件单文档写原语。
- 上游：所有 ClinicalReport workflow、`ClinicalReportHistoryQueryService`、`ClinicalHistoryQueryService`；下游：`ClinicalReport` Model。
- 边界：负责 ObjectId、精确 filter、create/findOneAndUpdate 与结果映射；不独立决定完整生命周期资格、lineage、跨集合顺序或恢复，这些由 workflow/纯函数负责。不物理删除报告，不生成 PDF/AI。

#### `ClinicalReportGenerationWorkflowService`

- 文件：`backend/src/modules/reports/services/clinical-report-generation-workflow.service.ts`
- 职责：验证 Patient/Visit、scope 与最终 Score/Domain/Media 来源，调用纯 builder 创建确定性的规则化初始报告；latest-first 判断已有报告的 scope/idempotency。
- 上游：`ClinicalReportsController`；下游：Patients、Assessments、Scales、Scoring、Cognitive Domains、Media 导出 Service，以及 `ReportsService`、`ClinicalReportPublicMapper`。
- 一致性：首次 create 只写一个 ClinicalReport；唯一 report code 竞争后重读同一 ownership/version 并验证 scope。既有同 scope 报告不重算来源，不同 scope fail closed。
- 边界：不调用 scoring/domain compute，不修改任何来源记录，不使用 transaction 或分布式锁。

#### `ClinicalReportReviewWorkflowService`

- 文件：`backend/src/modules/reports/services/clinical-report-review-workflow.service.ts`
- 职责：验证 ownership、actor、状态/readiness，编排 clinician edit、submit、confirm 与幂等/冲突重读。
- 下游：`PatientsService`、`AssessmentsService`、`ReportsService`、`ClinicalReportPublicMapper` 与 review 纯函数；不重读 Scoring/Domain/Media 来源。
- 一致性：`ReportsService` 条件写锚定 ownership、真实 report version、允许 status 与 expected updatedAt；各动作只写本报告允许字段和审计 metadata。边界是单文档 CAS，不重算 generation sources。

#### `ClinicalReportLockWorkflowService`

- 文件：`backend/src/modules/reports/services/clinical-report-lock-workflow.service.ts`
- 职责：验证 ownership、actor、confirmation/readiness、replacement lineage 与 expected updatedAt，执行首次 lock；已锁定时只验证归属和锁事实后幂等返回。
- 下游：`PatientsService`、`AssessmentsService`、`ReportsService`、`ClinicalReportPublicMapper` 与 lock/lineage 纯函数。
- 一致性：单报告条件更新只写 lock facts/metadata；原子 miss 后重读并验证同一事实。不更新来源、不实现 unlock。

#### `ClinicalReportSourceFreezeWorkflowService`

- 文件：`backend/src/modules/reports/services/clinical-report-source-freeze-workflow.service.ts`
- 职责：从当前报告快照建立稳定去重 scope，原子记录 in-progress freeze receipt，按固定顺序调用 Assessments/Scoring/CognitiveDomains/Media 批量冻结，再全量重读验证并完成 receipt。
- 恢复：跨集合无 Mongo transaction；部分失败不回滚或解冻，持久化 in-progress receipt 是恢复锚点。重复调用复用同一 freeze identity/scope/actor；只有全部来源验证成功才转 completed。
- replacement：已经由前序报告冻结且与当前 snapshot 完整兼容的共享来源只验证并计入 previously frozen，不重复更新；当前报告仍形成独立 receipt。
- 模块边界：只调用来源模块导出的 Service，不直接注入其 Models，不反向依赖或重复注册 Schema。

#### `ClinicalReportArchiveWorkflowService`

- 文件：`backend/src/modules/reports/services/clinical-report-archive-workflow.service.ts`
- 职责：验证 ownership、lock、completed source freeze、replacement lineage、readiness 与 expected updatedAt，执行首次 archive；既有 archive/corrected 通过历史事实幂等返回。
- 下游：`PatientsService`、`AssessmentsService`、`ReportsService`、`ClinicalReportPublicMapper` 与 archive/lineage 纯函数；不调用来源冻结批量方法。
- 一致性：单报告 CAS 只写 archive facts/metadata，不重新冻结或读取来源集合，不修改 Patient/Visit、正文、snapshot、confirmation 或 lock facts；无 unarchive。

#### `ClinicalReportCorrectionWorkflowService`

- 文件：`backend/src/modules/reports/services/clinical-report-correction-workflow.service.ts`
- 职责：验证 latest archived source，编排 correction start、deterministic replacement create-or-resolve、source record 与 completion，维持线性版本链。
- 下游：`PatientsService`、`AssessmentsService`、`ReportsService`、`ClinicalReportPublicMapper` 与 correction/lineage 纯函数；不读取或写入评分、认知域、媒体来源。
- 一致性：start/record/complete 各为 source 单文档条件更新；replacement 使用确定性 code 与 unique key。竞争时只进行有界重读，并仅收敛到同一 correction identity、replacement ID/code/version 的 in-progress/completed 事实。
- 不使用 transaction、mutex、sleep/polling 或自动 retry；不会为 genuine non-latest、branch 或非确定性 collision 创建分支报告。
- `clinical-report-replacement-lineage.ts` 从 current report 回读到 V1，逐跳验证连续 version、双向 source/replacement relation、唯一 correction record 与 lock/freeze/archive anchors；循环或任一跳不一致 fail closed。Lock/Freeze/Archive workflow 在首次读取和 CAS miss 重读后复用同一校验。

#### `ClinicalReportHistoryQueryService`

- 文件：`backend/src/modules/reports/services/clinical-report-history-query.service.ts`
- 职责：读取 report version 集合和指定历史详情；先对完整轻量集合执行 lineage/readability 评估，再内存分页，避免只看片段而误判链。
- 下游：`ReportsService`、`ClinicalReportPublicMapper` 与 history lineage/readability 纯函数。
- 边界：只读；指定版本和 latest 共用同一 readable 规则，不暴露内部 IDs 或不完整 lineage。

#### Report pure lifecycle 与 mapper

- 文件目录：`backend/src/modules/reports/lib`；公开 mapper：`backend/src/modules/reports/services/clinical-report-public.mapper.ts`
- `clinical-report-draft-builder.ts` 生成确定性 report code、稳定来源 snapshot、规则化 narrative 与 generation metadata；不评分、不计算 domain、不读取原始作答/媒体内容，也不生成诊断。
- `clinical-report-review.ts`、`clinical-report-lock.ts`、`clinical-report-source-freeze.ts`、`clinical-report-archive.ts`、`clinical-report-correction.ts` 分别维护单一 lifecycle transition/readiness/audit 纯规则；均无 DI/数据库副作用并保留其它合法 metadata namespace。
- `clinical-report-history-lineage.ts` 与 `clinical-report-readability.ts` 负责完整版本链和可读性纯判断；`clinical-report-version.mapper.ts` 只输出安全版本投影。
- `ClinicalReportPublicMapper` 逐字段投影安全 report/lifecycle 摘要；非法 metadata/审计安全降级，不透传内部 snapshots IDs、Storage identity、AI draft 或 actor internals。

`ReportsModule` 单向依赖 Patients、Assessments、Scales、Scoring、Cognitive Domains、Media；来源模块不反向导入 Reports。除 source-freeze 与 correction 多阶段恢复外，生命周期写以单 ClinicalReport 文档 CAS 为一致性边界；无 `forwardRef` 或来源 Schema 重复注册。

### 2.8 Clinical History

#### `ClinicalHistoryQueryService`

- 文件：`backend/src/modules/clinical-history/services/clinical-history-query.service.ts`
- 职责：编排 assessment history 与 follow-up trends；验证 Patient/scale/date，批量读取 Visit、ScaleInstance、ScoreResult、CognitiveDomainResult 与 report summary，再交给纯 source evaluator/mapper。
- 下游：`PatientsService`、`AssessmentsService`、`ScalesService`、`ScoringService`、`CognitiveDomainsService`、`ReportsService`。
- 查询边界：Service 不直接注入 Models；Visit/Instance 和各结果按 page/range 批量读取，查询数不随 point 数形成逐 Visit N+1。无 collection、cache、read model 或写入。
- 纯函数目录：`backend/src/modules/clinical-history/lib`
- `clinical-history-source-evaluator.ts` 统一判断 ownership、final/void、quality/time/trace/value/mapping 等来源资格；不重算评分或认知域。
- `assessment-history.mapper.ts` 对可用 Score/Domain 保守投影；Domain 不完整不会抹掉已可用 Score。
- `follow-up-trend-source.ts` 为每个 Visit 选择明确的 available/missing/incomplete/ambiguous 原因，不擅自选择多个实例或结果。
- `follow-up-trend-comparability.ts` 只比较相邻点，基于版本、scoring/encoding/admin mode、range 与 domain mapping 事实判断 exact comparability；不舍入、不跨点。
- `follow-up-trend.mapper.ts` 稳定排序并生成安全趋势投影，不泄漏 ownership/source IDs、metadata、raw/Mixed、media、AI 或诊断字段。

`ClinicalHistoryModule` 只导入来源 modules，不注册来源 Schema/Model，不使用 `forwardRef`；History 是只读编排层。

### 2.9 Users / Auth

#### `UsersService`

- 文件：`backend/src/modules/users/services/users.service.ts`
- 职责：账号 identity 读取、规范化与安全 mapper；凭证查询显式只取认证必需字段。
- 上游：`AuthService`；下游：`User` Model。
- 隐私边界：普通读取不返回 password hash；不创建/更新/删除用户，不实现注册、密码重置、角色管理或第三方登录。

#### `AuthService`

- 文件：`backend/src/modules/auth/services/auth.service.ts`
- 职责：密码 hash/verify、账号密码认证、session token 生成/hash、session create/validate/revoke、认证上下文与安全用户投影。
- 上游：`AuthController` 与 `SessionAuthGuard`；下游：`Session` Model、`UsersService`、Node crypto。
- 安全边界：持久化 token hash 而非 raw token；校验同时检查 session lifecycle 与用户状态；公开上下文不含 password/token hash。Cookie 设置/清除、HTTP 权限 metadata 与完整 API 合同不属于本 Service。
- 非职责：不实现用户管理、短信/OAuth/JWT 主登录、max-session 回收或前端权限。

## 3. 跨模块一致性边界

- **条件写与幂等**：长期默认是服务端读取权威事实后执行精确 ownership/status/version/token CAS；竞争 miss 通过有界重读分类为同一事实幂等、合法 stale 或损坏状态，不自动重放副作用写。
- **Submission barrier**：父 Instance 和固定 ItemResponse scope 通过持久化 fencing/fenced/releasing token 协调；进程中断后按同 token 恢复完成或释放，completed 后旧草稿/媒体写仍被 child barrier 阻断。
- **媒体补偿**：新上传采用 Storage→Evidence→业务 reference 顺序，后续失败只删除本次新对象/记录；adoption 复用既有患者 Evidence，不复制对象，revoke 只撤销 formal reference。
- **未完成实例物理删除**：仅显式清理 eligible supervised failed attempt；先删所有显式 owned Storage keys，再按 owner 边界删 Evidence/failed Session/ItemResponse，最后删 ScaleInstance。Visit、其它实例和正式结果链不级联；正式事实存在时 fail closed。
- **Patient Administration**：session 原始 facts、MediaEvidence 与正式 ItemResponse 是分层事实；session/evidence workflow 不旁路写正式答案，ASR 只产生候选。稳定业务流程由 Patient Administration Contract 拥有。
- **Report lifecycle**：普通 transition 是单报告 CAS；source freeze 和 correction/replacement 使用持久化阶段 receipt、确定性 identity、固定 scope/lineage 与有界重读恢复跨集合/多文档流程，不假装 transaction。
- **Module direction**：依赖方向总体为基础模块 → Assessments/Media → Scoring → Cognitive Domains → Reports → Clinical History；跨模块只使用导出 Service，不通过 `forwardRef`、重复 Schema registration 或内部 HTTP 构造循环。
- **隐私与 fail-closed**：Service/mapper 只传播调用方所需的最小内部摘要；损坏 ownership、barrier、lineage、metadata、Storage URL 或 provider response 均安全拒绝/降级，不用猜测补齐业务事实。

## 4. 后续同步规则

- Service / Workflow / 关键 Provider / pure orchestration、调用图、模块依赖、内部一致性或恢复机制变化时，更新本文档。
- endpoint、Controller/Guard、HTTP status 或公开业务错误变化时更新 Backend API Map；DTO/public shape/validator 变化时更新 Backend DTO Cheatsheet。
- 稳定患者施测业务合同变化时更新 Patient Administration Contract；测试治理/evidence 变化时更新 Backend Testing Playbook 或 current tests；静态配置/mapping 变化时更新 Backend Config Matrix。
- 模块级 current capability 变化时更新 Backend Snapshot；工作包状态变化时更新 Roadmap。
- 若变更不影响 Service Map 自身职责，本文保持 zero diff；同步应引用 authoritative owner，不横向复制完整事实。
