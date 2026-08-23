# CogMemory AD / 智忆评 后端 DTO 与响应速查

## 1. 文档定位

本文档是 Backend request DTO、public response type、公开 nested shape、validation/transform/whitelist 与 field-level safe exposure 的 authoritative owner。

- endpoint、HTTP status、Guard/Roles、业务错误与 endpoint-specific side effect：见 [Backend API Map](./handoff-backend-api-map.md)。
- Service 调用顺序、CAS/屏障、恢复与一致性算法：见 [Backend Service Map](./handoff-backend-service-map.md) 和 current code。
- 受监督患者施测的业务、安全、媒体、逐题与 F2/F3 稳定合同：见 [Patient Administration Contract](./handoff-patient-administration-contract.md)。
- 测试/evidence 与工作包状态分别见 [Backend Testing Playbook](./handoff-backend-testing-playbook.md) 和 [Roadmap](./handoff-roadmap.md)。

本文档不维护 Controller 权限、HTTP error matrix、Service 状态推进/写入顺序、测试通过事实或工作包流水。

## 2. 当前 DTO surface

- current Controller inventory 引用 54 个唯一 request DTO（Param/Query/Body）与 45 个唯一命名 response type；两条患者资产 endpoint 另返回 framework `StreamableFile`，一个 DELETE 返回无 body。
- 主要 family：Auth；Patients/Visits/Scales；Assessment Execution/A14；Media/A15；Submission/A16；Scoring/A17-A18；Cognitive Domains/A19；Clinical Reports/A20-A27；History/Trend/A27-A28；Patient Administration。
- 当前没有用户管理、注册、密码重置、患者通用更新/合并、撤销提交/reopen、评分重跑/lock/void、认知域人工修改/确认/锁定、报告退回/签名/PDF/AI 等请求 DTO family。
- 全局 `ValidationPipe` 使用 whitelist 与 `forbidNonWhitelisted`；只允许 DTO 显式声明字段。各节的“安全省略”定义 public response 不得暴露的字段。
- TypeScript response 中的 `Date` 经 Nest/JSON 序列化为 ISO string；本表仍按 Backend TypeScript type 记录 `Date`。

## 3. System、Auth 与公共 shape

### 3.1 `AppHealthResponse`

- Source：`backend/src/app.service.ts`。
- Shape：`{ status: 'ok'; service: 'cogmemory-ad-backend' }`。

### 3.2 `LoginDto` 与认证响应

- Source：`backend/src/modules/auth/dto/login.dto.ts`。
- `LoginDto`：`accountName: string`、`password: string` 均 required、string、非空；最大长度分别为 120、256。
- Source：`backend/src/modules/auth/types/auth-response.types.ts`。
- `AuthUserResponse`：`id`、`accountName`、`displayName`、`roles`、`permissions`、`userType`。
- `LoginResponse`：`{ authenticated: true; user: AuthUserResponse }`。
- `MeResponse`：`{ authenticated: true; user: AuthUserResponse }`。
- `LogoutResponse`：`{ authenticated: false; ok: true }`。
- 安全省略：`password/passwordHash`、raw session token、token hash、session credential、reset token 与 secret。

### 3.3 公共分页

- Source：`backend/src/common/dto/pagination-query.dto.ts`。
- `PaginationQueryDto`：`page=1`，integer ≥1；`pageSize=100`，integer 1–1000。
- `ListFilterQueryDto`：`keyword?: string`、`isActive?: boolean`。
- `PaginatedResponse<T>`：`items: T[]`、`page`、`pageSize`、`total`。
- 业务 API 可以用更窄的 pageSize 默认值/范围；以对应 DTO 小节为准。

## 4. Patients、Visits、Scales 与 Assessment Execution

### 4.1 Patients request DTO

- Sources：`backend/src/modules/patients/dto/*.ts`。
- `PatientIdParamDto`：`patientId: string`，required，`@IsMongoId()`。
- `ListPatientsQueryDto`：
  - `page=1`；`pageSize=20`，integer 1–100。
  - `keyword?` trim、最大 100。
  - `status?`：`active | inactive | archived`。
  - `sourceType?`：`clinical | research`。
- `CreatePatientDto`：
  - required `subjectCode: string`：trim、非空、最大 80。
  - optional `displayName`（最大 120）、`sourceType: clinical | research`、`sex: male | female | other | unknown`、`birthDate`（transform Date）、`educationYears`（integer 0–40）、`handedness: right | left | ambidextrous | unknown`、`tags`（最多 20 项，逐项 trim/最大 50并移除空项）、`notes`（最大 2000）。
  - whitelist 不声明 `id/_id/status/externalRefs/metadata/operator/createdAt/updatedAt`。

### 4.2 Patient response types

- Source：`backend/src/modules/patients/types/patient-response.types.ts`。
- `PatientListItemResponse`：`id`、`subjectCode`、`displayName`、`sourceType`、`sex`、`birthDate`、`educationYears`、`handedness`、`status`、`tags`。
- `PatientDetailResponse`：列表项字段 + `notes`。
- `PatientListResponse`：`{ items: PatientListItemResponse[]; page; pageSize; total }`。
- 安全省略：`externalRefs`、`metadata`、`__v`、Mongoose document 方法与认证字段。

### 4.3 Visit request DTO

- Sources：`backend/src/modules/assessments/dto/patient-visits-param.dto.ts`、`patient-visit-param.dto.ts`、`list-assessment-visits-query.dto.ts`、`create-assessment-visit.dto.ts`、`update-assessment-visit.dto.ts`、`void-assessment-visit.dto.ts`、`initialize-scale-instance.dto.ts`。
- `PatientVisitsParamDto`：`patientId @IsMongoId()`。
- `PatientVisitParamDto`：`patientId`、`visitId` 均 `@IsMongoId()`。
- `ListAssessmentVisitsQueryDto`：`page=1`、`pageSize=20`（1–100）；optional `status`、`visitType`、`dateFrom`、`dateTo`；日期 transform 为有效 Date。
- `CreateAssessmentVisitDto`：
  - required `visitCode`（trim、非空、最大 80）、`assessmentDate`（Date transform）。
  - optional `visitType: baseline | follow_up | screening | unscheduled | other`、`notes`（trim、最大 2000）。
- `UpdateAssessmentVisitDto`：optional `visitCode`、`visitType`、`assessmentDate`、`notes`；validation 与创建一致，`notes: ''` 合法；是否为空 patch 属于 endpoint 业务检查。
- `VoidAssessmentVisitDto`：`confirm` 必须为 boolean true；`reason` required、trim、长度 3–500。
- 上述 whitelist 不声明 ownership、status、operatorSnapshot、生命周期时间、clinicalContext、metadata 或 timestamps。
- `InitializeScaleInstanceDto`：
  - `scaleCode` required，trim + lowercase、非空、最大 50。
  - `scaleVersion?` trim、非空、最大 40。
  - `administrationMode?`：`clinician_administered | supervised_patient_input | paper_import`，默认 `clinician_administered`。
  - 不声明路径 ownership、definition/version ID、instance identity/status、operator/progress/metadata/ItemResponse/score/report 字段。

### 4.4 Visit、Scale 与初始化 response

- Source：`backend/src/modules/assessments/types/assessment-visit-response.types.ts`。
- `AssessmentVisitListItemResponse`：`id`、`patientId`、`subjectCode`、`visitCode`、`visitType`、`status`、`assessmentDate`、`startedAt`、`completedAt`、`lockedAt`、`voidedAt`、`operatorSnapshot`、`notes`、安全 `voidedBy`/`voidReason`。
- `AssessmentVisitDetailResponse`：当前与安全详情 mapper 对齐的 Visit 字段。
- `AssessmentVisitListResponse`：`{ items; page; pageSize; total }`。
- 安全省略：`clinicalContext`、`metadata`、`__v` 与 Mongoose internals。
- Source：`backend/src/modules/scales/types/scale-catalog-response.types.ts`。
- `ScaleScoreRangeResponse`：`min`、`max`、`step`。
- `ScaleCapabilityResponse`：photo/handwriting/timer/raw text/operator-note 能力布尔值。
- `AvailableScaleOptionResponse`：code/name/shortName/description/category、version trace、total score range、group/item count、capabilities。
- `AvailableScaleListResponse`：`{ items: AvailableScaleOptionResponse[] }`。
- 安全省略：完整 groups/items、prompt/instruction、scoring/quality/report/research rules、expected answer、ObjectId 与 metadata。
- Source：`backend/src/modules/assessments/types/assessment-execution-response.types.ts`。
- `ScaleInstanceVersionTraceResponse`：公开版本追溯字段；`ScaleInstanceOperatorResponse`：安全 operator；`ScaleInstanceProgressResponse`：`totalItemCount`、`answeredItemCount`。
- `ScaleInstanceListItemResponse`：公开 instance identity、subject/scale/instance snapshot、status、administrationMode、versionTrace、生命周期时间、duration、operator、progress。
- `AssessmentVisitExecutionDetailResponse`：`{ visit: AssessmentVisitDetailResponse; scaleInstances: ScaleInstanceListItemResponse[]; visitMaintenance: { canEdit; canDelete; canVoid; initializedScaleCount } }`。
- `InitializeScaleInstanceResponse`：`{ scale: { code; name; shortName?; version; displayVersion? }; scaleInstance: ScaleInstanceListItemResponse; createdItemResponseCount: number }`。
- 安全省略：definition/version ObjectId、metadata、qualityControlSummary、完整 ItemResponse/Mixed config。

## 5. A14 ItemResponse DTO 与 public execution shape

### 5.1 Path DTO

- `ScaleInstanceExecutionParamDto` — `backend/src/modules/assessments/dto/scale-instance-execution-param.dto.ts`：`patientId`、`visitId`、`scaleInstanceId` 均 `@IsMongoId()`。
- `ItemResponseDraftParamDto` — `backend/src/modules/assessments/dto/item-response-draft-param.dto.ts`：上述三个 ID + `itemResponseId`，全部 `@IsMongoId()`。

### 5.2 `UpdateItemResponseDraftDto`

- Source：`backend/src/modules/assessments/dto/update-item-response-draft.dto.ts`。
- required control field：`expectedRevision: number`，integer、0–`Number.MAX_SAFE_INTEGER`，不接受字符串隐式转换。
- optional business fields：
  - `rawResponse?: unknown`，runtime 只接受 `JsonValue`；`structuredResponse?: Record<string, unknown> | null`，runtime 只接受 JSON object/null。
  - `responseText?: string | null`，最大 10000。
  - `isMissing?: boolean`、`missingReason?: string | null`（最大 1000）。
  - `stepResponses?: UpdateItemStepDraftDto[]`。
  - `promptResponses?: UpdatePromptResponseDraftDto[]`。
  - `timing?: UpdateItemTimingDraftDto | null`。
  - `operatorNote?: string | null`，最大 4000。
  - `markAsAnswered?: boolean`。
- `stepResponses` 与 `promptResponses` 均为最多 100 项的 nested DTO array。
- `UpdateItemStepDraftDto`：`stepCode` required、trim + lowercase、最大 200；`actualValue?: unknown`（runtime `JsonValue`）、`note?: string | null`（最大 2000）。不允许 expectedValue/isCorrect/score/counts 字段。
- `UpdatePromptResponseDraftDto`：`promptType` required，enum 为 `none | repeat_instruction | semantic_category | multiple_choice | operator_clarification | other`；`order` 正整数；`responseAfterPrompt?: unknown`（runtime `JsonValue`）、`note?: string | null`（最大 2000）。不允许 promptText/isCorrect/counts。
- `UpdateItemTimingDraftDto`：非 null 时必须显式包含 `timerState: idle | running | paused | completed`、nullable ISO `startedAt/lastResumedAt/completedAt`、nullable non-negative integer `durationMs`、`timerSource: system | manual | imported | none`；`timing=null` 表示显式复位。状态间允许关系由 DTO/pure validator 校验。
- `ItemResponseDraftJsonValue`：null/string/finite number/boolean/递归 array/plain object；最大深度 5、array 100、object keys 100、string 4000、raw/structured serialized 32768 bytes；拒绝危险 key 与非 JSON value。

### 5.3 Structured shapes 与 whitelist

- executable `structured_manual`：

  `{ subItems: { [fieldCode]: { responseText?: string; isCorrect?: boolean | null } } }`

  partial draft 可缺字段、文本或判断；nested object 只允许 `responseText`/`isCorrect`，不允许 maxScore/scoreValue/referenceAnswer/expected/title/label 等服务端或评分字段。
- eligible binary manual：

  `{ binaryManualDecision: { isCorrect: boolean | null } }`

  root/nested shape 必须精确；不允许 scoreValue/correctScore/maxScore/note/actor/time。
- exact MMSE 1.0 reading-command overlay：`responseText` 记录患者实际阅读，`rawResponse: null | boolean` 记录闭眼动作，`structuredResponse.binaryManualDecision.isCorrect` 记录人工最终判断。三者是独立 payload facts。
- 顶层 whitelist 不声明 item/config/version/status/answerSource/score/evidence/metadata/lock/void/ownership/timestamps 或 submission barrier 字段。

### 5.4 A14 response types

- Source：`backend/src/modules/assessments/types/item-response-execution-response.types.ts`。
- `ScaleExecutionIdentityResponse`：安全 scale identity/version trace；`ScaleExecutionGroupResponse`：group identity/title/order。
- `ItemExecutionConfigResponse`：公开 prompt/instruction/scoreRange/evidence type/timer/photo/handwriting/operator-note flags；可选：
  - `structuredManualFields: { code; label; maxScore; referenceAnswer?: string | number | boolean }[]`。
  - `binaryManualDecision: { incorrectScore: 0; correctScore: 1 }`。
  - `manualObservationRecord: { booleanLabel; trueLabel; falseLabel; responseTextLabel; responseTextHelp; requireBooleanResponse; requireResponseText }`。
- `ItemEvidenceRequirementResponse`：`{ evidenceType; status; attached; mediaEvidenceId }`。
- `ItemResponseExecutionResponse`：安全 item identity/config/version、status、`draftRevision`、`draftSavedAt`、raw/structured/text/missing 草稿、step/prompt slots、timing、evidence requirements、operatorNote。
- `ScaleInstanceExecutionDetailResponse`：`{ visit; scale; scaleInstance; groups; itemResponses }`。
- `UpdateItemResponseDraftResponse`：`{ itemResponse: ItemResponseExecutionResponse; progress: ScaleInstanceProgressResponse }`。
- 安全省略：完整 itemConfigSnapshot/scoringRule/expectedValue、score/scoreValue、qualityControlHints、metadata、内部 definition/version IDs、Storage object/bucket/checksum/signed URL、submission barrier。

## 6. A15 Media 与 Patient Administration evidence DTO/type

### 6.1 Staff media path/body DTO

- `MediaEvidenceItemParamDto` — `backend/src/modules/media/dto/media-evidence-item-param.dto.ts`：`patientId`、`visitId`、`scaleInstanceId`、`itemResponseId` 均 `@IsMongoId()`。
- `MediaEvidenceParamDto` — `backend/src/modules/media/dto/media-evidence-param.dto.ts`：继承上述字段并增加 `mediaEvidenceId @IsMongoId()`。
- `MediaEvidenceAccessQueryDto` — `backend/src/modules/media/dto/media-evidence-access-query.dto.ts`：`asset?: primary | trajectory`，默认 `primary`；不允许客户端控制有效期。
- `VoidMediaEvidenceDto` — `backend/src/modules/media/dto/void-media-evidence.dto.ts`：`reason` required、trim、3–1000。
- `TranscribeMediaEvidenceDto` — `backend/src/modules/media/dto/transcribe-media-evidence.dto.ts`：空白名单 DTO；不接受 provider/model/language/format/URL/objectKey/text/status。

### 6.2 `UploadMediaEvidenceDto`

- Source：`backend/src/modules/media/dto/upload-media-evidence.dto.ts`。
- required：`evidenceType: photo | handwriting`；`captureMode: photo_upload | paper_scan | tablet_handwriting`。
- optional common fields：`capturedAt`、`sourceDevice`、`sourceApp`、`captureNote`、`description`、`operatorNote`。
- optional image fields：`imageWidth`、`imageHeight`、`orientation`、`pageNo`、`isColor`。
- optional handwriting fields：`trajectoryFormat: json | strokes`、`strokeCount`、`trajectoryDurationMs`、`canvasWidth`、`canvasHeight`、`deviceType`、`inputTool`。
- transform/validation：空字符串 → undefined；数字字符串只显式转换为有限 number 后做 integer/range 校验；boolean 字符串仅 `true/false` 转换；evidence/capture cross-field matrix 受校验。
- multipart files：`file` required；`trajectory` optional 且仅 handwriting。主文件最大 10 MiB，JPEG/PNG/WebP；trajectory 最大 2 MiB、`application/json`、json/strokes；验证非空、MIME/signature 与嵌入 metadata。
- whitelist 不声明 ownership/business code/status/storage/checksum/operatorSnapshot/itemSnapshot/versionTrace/quality/metadata/timestamps；不保存原始文件名为 public contract。

### 6.3 `UploadPatientAdministrationEvidenceDto`

- Source：`backend/src/modules/media/dto/upload-patient-administration-evidence.dto.ts`。
- required：`expectedRevision`（multipart number transform，integer 0–`Number.MAX_SAFE_INTEGER`）、`evidenceType: audio | photo | handwriting`。
- optional：strict ISO `capturedAt`；audio-only `durationMs` integer 1–600000；photo/handwriting `imageWidth/imageHeight`；handwriting `strokeCount/trajectoryDurationMs/canvasWidth/canvasHeight/inputTool`，均按 source range/enum 校验。
- multipart：单一 `file`，最大 10 MiB；不接受 trajectory。audio MIME 为 normalized WebM/Ogg/MP4(M4A)/MPEG(MP3)，photo/handwriting 使用图片白名单并校验签名。
- whitelist 不声明 captureMode、stepKey/stepRun、任何 ownership ID、itemCode/sessionId、objectKey/originalFilename、source/metadata/operator/status/responseMode。

### 6.4 Media public response types

- Source：`backend/src/modules/media/types/media-evidence-response.types.ts`。
- `MediaEvidenceFileResponse`：`mimeType`、`fileExtension`、`sizeBytes`、`storedAt`。
- `MediaEvidenceImageMetadataResponse`：公开尺寸/orientation/page/color；`MediaEvidenceHandwritingTraceResponse`：公开格式、stroke/duration/canvas/device/input 摘要，不含 trajectory object key。
- `MediaEvidenceCaptureContextResponse`、`MediaEvidenceOperatorResponse`：安全采集/操作者投影。
- `MediaEvidenceAudioMetadataResponse`：`durationMs`。
- `MediaEvidenceTranscriptionResponse`：有限 `status`、optional `text/errorCode/provider/model/requestedAt/completedAt/requestedBy`。
- `MediaEvidenceResponse`：安全 evidence identity/code/type/capture/status/storageStatus、file/image/handwriting/audio/transcription、operator/times/void summary 与 derived `patientAdministrationOrigin`。
- `MediaEvidenceListResponse`：`{ items: MediaEvidenceResponse[] }`。
- `EvidenceRequirementStateResponse`：`{ evidenceType; status; attached; mediaEvidenceId }`。
- `UploadMediaEvidenceResponse`：`{ mediaEvidence; evidenceRequirement }`。
- `VoidMediaEvidenceResponse`：`{ mediaEvidence; evidenceRequirement }`。
- `MediaEvidenceAccessUrlResponse`：`{ asset: primary | trajectory; url; expiresAt }`。
- `MediaEvidenceTranscriptionActionResponse`：`{ mediaEvidenceId; transcription }`。
- 安全省略：ownership IDs/subjectCode、definition/version IDs、itemSnapshot/versionTrace、storage driver/bucket/objectKey/objectPrefix/originalFilename/checksum/publicUrl、trajectoryObjectKey、metadata/qualityHints、credential。

### 6.5 Patient evidence/review response

- Source：`backend/src/modules/media/types/patient-administration-evidence-response.types.ts`。
- `PatientAdministrationEvidenceResponse`：`{ mediaEvidenceId; evidenceType; revision; uploadedAt }`；不含 ownership、step/run、Storage、filename、URL、checksum、token。
- Source：`backend/src/modules/media/types/patient-administration-review-response.types.ts`。
- `PatientAdministrationReviewResponse`：`{ session; reviewEvents; items }`。
- session 只含安全 status/preparation/impact/lifecycle；review event 只含受控 action/time/reason/safe actor。
- item 含 `itemResponseId`、`itemCode`、`itemTitle`、`status`、`draftRevision` 与 step/run；run 含 capture/evidence。
- evidence 只含安全 identity/type/capture/status/storageStatus/uploadedAt、nullable file/image/handwriting/audio/transcription 投影。
- 安全省略：Storage 定位/credential、完整 control events、patientText/assets/playback、正式答案 payload、评分与 metadata。

## 7. A16 Submission DTO/type

- `SubmitScaleInstanceDto` — `backend/src/modules/assessments/dto/submit-scale-instance.dto.ts`：唯一字段 `confirm: boolean`；endpoint 要求严格 true；不声明 force/ignore/status/operator/metadata。
- Path 复用 `ScaleInstanceExecutionParamDto`。
- Source：`backend/src/modules/assessments/types/scale-instance-submission-response.types.ts`。
- `ScaleSubmissionIssueResponse`：`code`、`severity: blocking | warning`、`scope: scale_instance | item`、optional safe item identity/order/group、missing/unexpected item codes、missing step codes、`requiredEvidenceMode`、`requiredEvidenceTypes`、`message`。
- `ScaleSubmissionIssueCode`：
  - scale：`SCALE_INSTANCE_ITEM_SET_MISMATCH`、`SCALE_INSTANCE_PATIENT_ADMINISTRATION_INCOMPLETE`、`SCALE_INSTANCE_DURATION_UNAVAILABLE`、`SCALE_INSTANCE_START_TIME_INVALID`。
  - item：`ITEM_NOT_COMPLETED`、`ITEM_ANSWER_CONTENT_MISSING`、`ITEM_STRUCTURED_SUBITEMS_INCOMPLETE`、`ITEM_MANUAL_OBSERVATION_INCOMPLETE`、`ITEM_BINARY_MANUAL_DECISION_INCOMPLETE`、`ITEM_MISSING_REASON_REQUIRED`、`ITEM_STALE_MISSING_REASON`、`ITEM_REQUIRED_STEP_MISSING`、`ITEM_REQUIRED_TIMING_MISSING`、`ITEM_INVALID_TIMING`、`ITEM_TIMING_POINTS_INCOMPLETE`、`ITEM_REQUIRED_MEDIA_MISSING`、`ITEM_EVIDENCE_REFERENCE_INCONSISTENT`、`ITEM_EVIDENCE_REQUIREMENT_CONFIGURATION_MISMATCH`、`ITEM_REQUIRED_OPERATOR_NOTE_MISSING`。
- `ScaleSubmissionReadinessSummaryResponse`：expected/actual/completed/incomplete/missing item counts、required/satisfied media item counts、blocking/warning counts。
- `ScaleSubmissionReadinessResponse`：`scaleInstance`、`checkedAt`、`ready`、`canSubmitNow`、`submissionState: editable | incomplete | ready | completed | locked | voided | patient_inactive | visit_not_editable`、optional `stateReason`、`summary`、`blockingIssues`、`warnings`。
- `ScaleInstanceSubmissionAuditResponse`：`submissionId`、`submittedAt`、safe `submittedBy`、`alreadySubmitted`、`durationSource`。
- `SubmitScaleInstanceResponse`：`{ scaleInstance; submission; readiness }`。
- 安全省略：原始作答、scoring/expected value、mediaEvidenceId、内部 item scope/barrier/state/token 与 metadata。

## 8. A17-A19 Scoring 与 Cognitive Domain DTO/type

### 8.1 Scoring request DTO

- `ComputeScoreResultDto` — `backend/src/modules/scoring/dto/compute-score-result.dto.ts`：唯一 `confirm: boolean`；不声明 run/status/score/rule/review/metadata/force。
- `ScoreResultParamDto` — `backend/src/modules/scoring/dto/score-result-param.dto.ts`：`patientId`、`visitId`、`scaleInstanceId`、`scoreResultId` 均 `@IsMongoId()`。
- `ScoreItemReviewParamDto` — `backend/src/modules/scoring/dto/score-item-review-param.dto.ts`：上述字段 + `itemResponseId @IsMongoId()`。
- `ReviewScoreItemDto` — `backend/src/modules/scoring/dto/review-score-item.dto.ts`：required finite number `scoreValue`；`reviewNote` trim 3–2000；strict ISO `expectedUpdatedAt`；不转换字符串分数。
- `ConfirmScoreResultDto` — `backend/src/modules/scoring/dto/confirm-score-result.dto.ts`：`confirm: boolean`、required `reviewNote` trim 后允许空且最大 2000、strict ISO `expectedUpdatedAt`。
- 两个写 DTO 均不声明 actor/time/status/score collections/rules/metadata/force/override。

### 8.2 Scoring public response

- Source：`backend/src/modules/scoring/types/score-result-response.types.ts`。
- `ProvisionalScoreTotalResponse`：provisional value/min/max/percent、item count totals、`isComplete`、`isFinal`。
- `ProvisionalScoreGroupResponse`：group identity/order、provisional range/value、scored/unscored/review/missing counts、`isComplete`。
- `ProvisionalScoreItemResponse`：安全 item identity/order/type/domain、counts/included flags、provisional value/range、score status/source、missing/review/reason、optional latest `manualReview`。
- `ProvisionalScoreComputationResponse`：computedAt、engine/rule version、counts、受控 warnings；`ProvisionalScoreReviewResponse`：status/pending count。
- `ProvisionalScoreResultResponse`：id/code/run/status/source/mode/versionTrace、total/groups/items/computation/review/quality、`updatedAt`、optional confirmation、`isFinal`。
- `ScoreReviewQueueItemResponse`：安全 item identity/order/type/counts + reason。
- `ScoreResultDetailResponse`：`{ scale; scaleInstance; scoreResult; reviewQueue }`。
- `ComputeScoreResultResponse`：detail + `alreadyComputed`。
- `ManualScoreReviewReceiptResponse` 与 `ReviewScoreItemResponse`：detail + `reviewUpdate { eventId; itemResponseId; reviewedAt; reviewer; pendingItemCount }`。
- `ScoreResultConfirmationReceiptResponse` 与 `ConfirmScoreResultResponse`：detail + `confirmationReceipt { confirmationId; confirmedAt; confirmedBy; reviewNote; alreadyConfirmed }`。
- 安全省略：作答、expectedValue/scoringRule/isCorrect、media URL、metadata/完整审计/previous score、Session/token。

### 8.3 Cognitive Domain request/response

- `ComputeCognitiveDomainResultDto` — `backend/src/modules/cognitive-domains/dto/compute-cognitive-domain-result.dto.ts`：唯一 `confirm: boolean`；不声明 source score/domain/status/mapping/weights/metadata/force。
- Path 复用 `ScaleInstanceExecutionParamDto`。
- Source：`backend/src/modules/cognitive-domains/types/cognitive-domain-result-response.types.ts`。
- `CognitiveDomainScaleResponse`、`CognitiveDomainScaleInstanceResponse`、`CognitiveDomainSourceScoreResultResponse`：安全量表/实例/来源评分 identity/status/time。
- `CognitiveDomainScoreResponse`：domain identity/title、score/min/max/percent、weighted score/max、item/scored/unscored/missing/review/excluded counts。
- `CognitiveDomainItemContributionResponse`：安全 item/domain identity、weight/count flag、score/max/weighted values、score status/source、missing；不编造未持久化 min fields。
- `CognitiveDomainMappingPolicyResponse`：`{ strategy: 'full_item_score_per_domain'; weight: 1; deduplicatePerItem: true; overlappingDomains: true }`；mapping response 另含非诊断 interpretation。
- `CognitiveDomainComputationResponse`、`CognitiveDomainReviewResponse`、`CognitiveDomainResultResponse`：computation/review/result status、versionTrace、domain scores、contributions、mapping、quality/final/time。
- `CognitiveDomainResultDetailResponse`：`{ scale; scaleInstance; sourceScoreResult; cognitiveDomainResult }`。
- `ComputeCognitiveDomainResultResponse`：detail + `alreadyComputed`。
- 安全省略：Patient identity、原始作答、评分/确认意见、expected/scoring rule、原始 mapping rules、metadata/quality hints、媒体与诊断结论。

## 9. Clinical Report DTO/type

### 9.1 Path/query DTO

- Sources：`backend/src/modules/reports/dto/*.ts`。
- `ClinicalReportVisitParamDto`：`patientId`、`visitId` 均 `@IsMongoId()`。
- `ClinicalReportResourceParamDto`：上述字段 + `reportId @IsMongoId()`。
- `ClinicalReportHistoryParamDto`：`patientId`、`visitId`、`reportId` 均 `@IsMongoId()`。
- `ListClinicalReportVersionsQueryDto`：`page=1`、`pageSize=20`（integer 1–100）；不接受 sort/status/type/lineage。

### 9.2 Report write DTO

- `GenerateClinicalReportDto`：`confirm?: boolean`；`primaryScaleInstanceIds: string[]` required，逐项 trim + lowercase、1–10、unique、每项 MongoId。
- `UpdateClinicalReportDraftDto`：`doctorOpinion` required trim 3–4000；`recommendationText?` trim，空串表示清除，非空 3–4000；`editNote` required 3–1000；`expectedUpdatedAt` strict ISO。
- `SubmitClinicalReportForConfirmationDto`：`confirm?: boolean`；`submissionNote` required trim 3–2000；`expectedUpdatedAt` strict ISO。
- `ConfirmClinicalReportDto`：`confirm?: boolean`；`confirmationNote` required trim 3–2000；`expectedUpdatedAt` strict ISO。
- `LockClinicalReportDto`：`confirm: boolean`；`lockNote` required trim 3–2000；`expectedUpdatedAt` strict ISO。
- `FreezeClinicalReportSourcesDto`：`confirm: boolean`；`freezeNote` required trim 3–2000；`expectedUpdatedAt` strict ISO。
- `ArchiveClinicalReportDto`：`confirm: boolean`；`archiveNote` required trim 3–2000；`expectedUpdatedAt` strict ISO。
- `CreateClinicalReportCorrectionDto`：`confirm: boolean`；`correctionReason` trim 3–2000；`changeSummary` trim 3–4000；`expectedUpdatedAt` strict ISO。
- 所有 write DTO 均不声明 path IDs、status/source/quality/version/code、actor/audit IDs/times、narrative/snapshots/source IDs、metadata、force/override/retry/unlock/unfreeze/unarchive/PDF/AI。

### 9.3 Core report response

- Source：`backend/src/modules/reports/types/clinical-report-response.types.ts`。
- `ClinicalReportPatientSnapshotResponse`：subjectCode、optional displayName/sex/birthDate/educationYears；省略 externalRefs/tags/notes/metadata。
- `ClinicalReportVisitSnapshotResponse`：visitCode/type/date/operator name/role；省略 clinicalContext/notes/metadata。
- `ClinicalReportScaleTraceResponse`：scaleInstanceId、scale code/version 与 CRF/scoring/encoding/domain mapping/source trace。
- `ClinicalReportScoreSnapshotResponse`：scale identity、total/min/max/percent、score/quality status、safe summary。
- `ClinicalReportDomainSnapshotResponse`：scale/domain identity、score/max/percent、weighted pair、item/review counts、safe summary。
- `ClinicalReportEvidenceSnapshotResponse`：scale/item identity、evidenceType/captureMode/quality、safe summary；不含 evidence/item/storage identity。
- `ClinicalReportNarrativeResponse`：chiefSummary、scoreSummary、domainSummary、evidenceSummary、limitations、optional doctorOpinion/recommendationText。
- `ClinicalReportGenerationResponse`：generationId/time/safe actor/engine/scope + included scale/score/domain/media counts + `aiUsed`。
- `ClinicalReportResponse`：id/code/no/type/status/version/source/quality、patient/visit/scale/score/domain/evidence snapshots、narrative、generation、editorial、submission、confirmation、lock、sourceFreeze、archive、correction、replacementOf、locked/archived/voided timestamps/reason、createdAt/updatedAt、`isFinal`。
- `ClinicalReportDetailResponse`：`{ report: ClinicalReportResponse }`。
- `GenerateClinicalReportResponse`：`{ report; alreadyGenerated }`。
- 安全省略：patientId/visitId、raw scope/source ID arrays、score details/item answers、Storage object/URL、clinicalContext、metadata/qualityHints、raw AI draft/provider、signature 与 Mongoose fields。

### 9.4 Review/lifecycle response

- A21：`UpdateClinicalReportDraftResponse { report; editReceipt }`、`SubmitClinicalReportForConfirmationResponse { report; submissionReceipt }`、`ConfirmClinicalReportResponse { report; confirmationReceipt }`。A21 review actors only expose optional name/role；receipts expose current event identity/time/note/already flag，不公开 metadata/history/internal operator ID。
- A22：`LockClinicalReportResponse { report; lockReceipt }`；lock summary/receipt 为 lockId、lockedAt、safe actor、optional note、`alreadyLocked`。
- A23：`FreezeClinicalReportSourcesResponse { report; sourceFreezeReceipt }`；summary/receipt 为 freezeId/state/times/safe actors/note、expected/completed/newly/previously resource counts、`alreadyFrozen`、`resumedExisting`。不公开 source scope/IDs。
- A24：`ArchiveClinicalReportResponse { report; archiveReceipt }`；summary/receipt 为 archiveId/time/safe actor/note、sourceFreeze anchor、`alreadyArchived`。
- A25：`CreateClinicalReportCorrectionResponse { sourceReport; replacementReport; correctionReceipt }`；receipt 含 started/completed facts、safe actors、version relation、reason/summary、`alreadyCreated`、`resumedExisting`。不公开 raw correction records/internal audit/source IDs。

### 9.5 Report history response

- Source：`backend/src/modules/reports/types/clinical-report-history-response.types.ts`。
- `ClinicalReportVersionListResponse`：`{ items; page; pageSize; total; lineage }`；lineage 含 valid/firstVersion/latestVersion/totalVersions。
- item 只含安全 report code/version/status/source/quality/final/time/sourceFreeze status 与 previous/replacement code+version；不含内部 lineage IDs、narrative/snapshots/metadata。

## 10. Clinical History 与 Follow-up Trend DTO/type

- `PatientHistoryParamDto` — `backend/src/modules/clinical-history/dto/patient-history-param.dto.ts`：`patientId @IsMongoId()`。
- `ListPatientAssessmentHistoryQueryDto` — `backend/src/modules/clinical-history/dto/list-patient-assessment-history-query.dto.ts`：
  - `page=1`、`pageSize=20`（1–100）。
  - optional strict ISO `dateFrom/dateTo`、`visitType`、`status`、trim + lowercase non-empty `scaleCode`；不接受 sort。
- `GetPatientFollowUpTrendQueryDto` — `backend/src/modules/clinical-history/dto/get-patient-follow-up-trend-query.dto.ts`：
  - required `scaleCode` trim + lowercase、min 1。
  - optional strict ISO `dateFrom/dateTo`；`maxPoints=50`，integer 2–100；不接受 sort/status/visitType/pagination/version/mapping/diagnosis。
- Source：`backend/src/modules/clinical-history/types/clinical-history.types.ts`。
- `PatientAssessmentHistoryResponse`：`{ items; page; pageSize; total }`；item 为安全 Visit、`scaleSummaries` 与 `reportSummary`；Score/Domain availability 为 `available | source_not_final | source_voided | source_incomplete`，nullable value 保留。
- Source：`backend/src/modules/clinical-history/types/follow-up-trend.types.ts`。
- `PatientFollowUpTrendResponse`：`{ scale; range; comparabilityPolicy; points }`。
- point：安全 Visit、nullable instance、`dataStatus: available | source_missing | source_not_final | source_voided | source_incomplete | source_ambiguous`、nullable score、domains、comparison。
- comparison：`first_point | comparable | not_comparable | unavailable`；score/domain delta nullable；reason code 为 source/version/range/mapping/domain availability 受控 enum。
- privacy：不含 Patient identity、ownership/source IDs、raw answer/reviewer/metadata/report/media/AI/diagnosis；`scorePercent`/delta 不表示概率或诊断。

## 11. Patient Administration DTO/type

### 11.1 Request DTO

- Source：`backend/src/modules/assessments/dto/patient-administration.dto.ts`。
- `CreatePatientAdministrationSessionDto`：`deviceMode: same_device | cross_device` required，无 backend default。
- `EnterPatientAdministrationDto`：`code` trim 后精确六位 ASCII 数字。
- `PatientAdministrationRevisionDto`：`expectedRevision` integer 0–`Number.MAX_SAFE_INTEGER`。
- `PatientAdministrationControlDto`：expectedRevision + optional `reason` trim、最大 500。
- `PatientAdministrationRequiredReasonDto`：expectedRevision + required non-empty `reason` trim、最大 500。
- `ConfirmPatientAdministrationPreparationDto`：expectedRevision；`impactFactorCodes` array、unique、允许空，元素为 `sensory | upper_limb | language_culture_education | instruction_comprehension | fatigue_emotion_refusal | environment | device_network | other`；optional `impactFactorNote` trim、最大 500。
- `CompletePatientAdministrationStepDto`：仅 expectedRevision。
- `CompletePatientAdministrationStaffStepDto`：expectedRevision + required `staffObservation` trim、非空、最大 2000。
- `TakeOverPatientAdministrationStepDto`：expectedRevision + required `reason`（最大 500）+ `staffObservation`（最大 2000）。
- `PatientAdministrationAssetParamDto`：`assetKey` trim、非空、最大 120，只允许 lowercase alphanumeric 的单连字符分段。
- `PatientAdministrationStaffAssetParamDto`：三个 `@IsMongoId()` 路径 ID + 同一 assetKey validation。
- whitelist 不接受客户端 stepKey/stepRun/advanceBy/status/credential/actor/time/asset config/ownership 事实。

### 11.2 Public response

- Source：`backend/src/modules/assessments/types/patient-administration-response.types.ts`。
- `PatientAdministrationSessionSummaryResponse`：`id`、nullable `deviceMode`、`status`、`currentStepKey`、`revision`、`expiresAt`、`entryCodeExpiresAt`、`hasPatientCredential`、`preparationConfirmedAt`、`preparationConfirmedBy`、`impactFactorCodes`、optional `impactFactorNote`、`createdBy`、`startedAt`、`pausedAt`、`completedAt`、`terminatedAt`、`expiredAt`、`createdAt`、`updatedAt`；actor 仅为 safe operator projection。
- `PatientAdministrationSessionCreateResponse`：summary + `entryCode: string | null`。
- `PatientAdministrationEntryCodeResponse`：summary + non-null `entryCode`/`entryCodeExpiresAt`。
- `PatientAdministrationCredentialResponse`：`{ status; revision; expiresAt }`；patient token 仅在 Cookie。
- `PatientAdministrationCurrentResponse`：`{ status; revision; expiresAt; currentStep }`；currentStep nullable，非空时含 stepKey/order/patientText/responseMode/advanceBy/assets；asset 只含 assetKey/kind/role/mimeType/`technicalReplayAuthorized`。
- 二进制 endpoint 使用 `StreamableFile`：image 返回授权 Content-Type/Length 与 private no-store headers；played audio 另用响应 header 提供写后 revision。内部 `PatientAdministrationOpenedAsset`/`PatientAdministrationPlayedAudio` 不是 JSON response DTO。
- `PatientAdministrationRequestContext` 等 Guard/Service internal type 不属于 public DTO inventory。
- 安全省略：raw entry/token/hash、controlEvents、完整步骤/资产配置、file path/manifest/package key、patient/visit/instance identity、answer/score/report。

## 12. Coverage boundary

- 本文完整定位 API Map 当前引用的 54 个 request DTO 与 45 个命名 response type；`StreamableFile` 与 204 void response 已在对应小节说明。
- Service summary、Schema metadata、Storage interface、认证内部 context、seed/plan 与 Mongoose mapper type 不属于 public DTO/response owner，继续由 current code 与 Service Map 维护，不在本文复制。
- endpoint business error/status 不在本文维护；字段 validation、enum、range、transform、nested shape 与 public safe omission 才是本文职责。
