# CogMemory AD / 智忆评 前端 API 对接地图

## 1. 文档定位

本文档是 frontend API Client integration map，唯一完整维护 client function、source、Backend method/path、主要 caller、frontend request/response type、URL 编码、credentials/cache/cancellation/retry、frontend error kind/classification、成功响应的调用方投影与 client-side privacy boundary。

- Backend endpoint、权限、HTTP status、业务错误与服务端 side effect：见 [Backend API Map](./handoff-backend-api-map.md)。
- Backend DTO/response 字段、validation、nested shape 与 safe exposure：见 [Backend DTO Cheatsheet](./handoff-backend-dto-cheatsheet.md)。
- Backend Service 的 CAS/屏障、一致性、恢复与 ASR claim/finalize 算法：见 [Backend Service Map](./handoff-backend-service-map.md) 和 current code。
- Patient Administration 的 detailed same/cross、逐题、媒体、ASR、takeover/redo/technical replay 与 F2/F3 合同：见 [Patient Administration Contract](./handoff-patient-administration-contract.md)。
- Route/Component workflow、autosave/reconciliation 与 UI ownership：见 [Frontend Route Map](./handoff-frontend-route-map.md)、[Frontend Component Map](./handoff-frontend-component-map.md) 和 current pure contracts。
- 测试/evidence 与工作包状态分别见 [Frontend Testing Playbook](./handoff-frontend-testing-playbook.md) 和 [Roadmap](./handoff-roadmap.md)。

本文档不重新定义 Backend DTO、服务端业务状态机、CAS/屏障算法、Component workflow 或测试事实。

## 2. Client architecture 与共同 transport

- current source inventory：9 个 `frontend/src/features/**/api/*-api.ts` 文件，63 个网络 client function；另有 2 个导出的 request construction helper。
- 所有 client 以 `frontendEnv.apiBaseUrl`（`NEXT_PUBLIC_API_BASE_URL`，安全默认 `http://localhost:5002`）拼接公开 Backend path；当前无 BFF、Next Route Handler 代理或本地 token 层。
- fetch 统一使用 `credentials: 'include'` 与 `cache: 'no-store'`；浏览器管理 HttpOnly Cookie，Client 不读取 Cookie、不保存 token。
- 动态 path segment 使用 `encodeURIComponent()`；有本地 MongoId shape gate 的 family 会先拒绝无效 ID，但 Backend validation/ownership 仍是最终边界。
- 表中“Signal”表示函数接收/透传 `AbortSignal`；取消不当作服务错误。API Client 自身均不自动 retry；调用方的显式刷新或轮询属于 Component/Hook workflow，不改变 Client retry 语义。
- 写请求均逐字段构造已知 frontend request type；不透传任意对象。写结果未知时不自动 replay 有副作用请求。
- 成功后只消费公开 frontend type；Date JSON 建模为 `string/string | null`。Backend 完整字段合同只在 DTO Cheatsheet 维护。

## 3. Client function inventory

### 3.1 Auth — `frontend/src/features/auth/api/auth-api.ts`（3）

| Client / caller | Backend | Frontend request → response | Cancel/retry | Success projection / privacy |
|---|---|---|---|---|
| `login()` — `LoginForm` | `POST /auth/login` | `LoginRequest → LoginResponse` | no Signal; no retry | 使用公开 user 后导航；password 只存在于即时 body，不进入 URL/storage/log。 |
| `logout()` — `useAuth().signOut()` | `POST /auth/logout` | no body → `LogoutResponse` | no Signal; no retry | 清理本地公开 auth state；服务端 Cookie/Session 清理由 Backend 负责。 |
| `getMe()` — `useAuth` | `GET /auth/me` | no body → `MeResponse \| null` | no Signal; no retry | 401 投影为 `null`；其他错误保持可重试 auth state。 |

### 3.2 Patients — `frontend/src/features/patients/api/patients-api.ts`（5）

| Client / caller | Backend | Frontend request → response | Cancel/retry | Success projection |
|---|---|---|---|---|
| `listPatients()` — `PatientsListPage` | `GET /patients` | `ListPatientsQuery → PatientListResponse` | Signal; no retry | `URLSearchParams` 省略空值；响应进入分页列表。 |
| `createPatient()` — `PatientCreateForm` | `POST /patients` | `CreatePatientRequest → PatientDetail` | no Signal; no retry | 成功使用服务端 id 导航；不提交 server-owned 字段。 |
| `getPatient()` — patient detail/create visit callers | `GET /patients/:patientId` | no body → `PatientDetail` | Signal; no retry | 安全详情进入页面 state。 |
| `listPatientVisits()` — `PatientDetailPage` | `GET /patients/:patientId/visits` | `ListAssessmentVisitsQuery → AssessmentVisitListResponse` | Signal; no retry | query 用 `URLSearchParams`；响应保持后端排序。 |
| `createPatientVisit()` — `AssessmentVisitCreateForm` | `POST /patients/:patientId/visits` | `CreateAssessmentVisitRequest → AssessmentVisit` | no Signal; no retry | 成功返回患者详情；operator/ownership 不由前端提交。 |

### 3.3 Clinical history — `frontend/src/features/patients/api/clinical-history-api.ts`（2）

| Client / caller | Backend | Frontend request → response | Cancel/retry | Success projection |
|---|---|---|---|---|
| `listPatientAssessmentHistory()` — patient history page | `GET /patients/:patientId/assessment-history` | `ListPatientAssessmentHistoryQuery → PatientAssessmentHistoryResponse` | Signal; no retry | query 编码后消费 Visit/scale/score/domain/report 安全投影；不重排或补算。 |
| `getPatientFollowUpTrend()` — follow-up trend page | `GET /patients/:patientId/follow-up-trends` | `GetPatientFollowUpTrendQuery → PatientFollowUpTrendResponse` | Signal; no retry | 保留全部 point/dataStatus/comparison；不跨缺失点、不重算 delta/percent、不解释诊断。 |

### 3.4 Assessment execution — `frontend/src/features/assessments/api/assessment-execution-api.ts`（10）

| Client / caller | Backend | Frontend request → response | Cancel/retry | Success projection |
|---|---|---|---|---|
| `listAvailableScales()` — `AssessmentVisitExecutionPage` | `GET /scales/available` | no body → `AvailableScaleListResponse` | Signal; no retry | 目录安全摘要进入初始化面板。 |
| `getAssessmentVisitExecutionDetail()` — visit execution page | `GET /patients/:patientId/visits/:visitId` | no body → `AssessmentVisitExecutionDetailResponse` | Signal; no retry | 建立 Visit/实例/maintenance 服务端基线。 |
| `updateAssessmentVisit()` — visit maintenance UI | `PATCH /patients/:patientId/visits/:visitId` | `UpdateAssessmentVisitRequest → AssessmentVisitExecutionDetailResponse` | no Signal; no retry | 完整采用新详情；workflow 见 Component Map。 |
| `deleteAssessmentVisit()` — visit maintenance UI | `DELETE /patients/:patientId/visits/:visitId` | no body → `void` | no Signal; no retry | 调用方移除/导航；不推断级联。 |
| `voidAssessmentVisit()` — visit maintenance UI | `POST /patients/:patientId/visits/:visitId/void` | `VoidAssessmentVisitRequest → AssessmentVisitExecutionDetailResponse` | no Signal; no retry | 完整采用 void 后详情。 |
| `initializeScaleInstance()` — `ScaleInitializationPanel` | `POST /patients/:patientId/visits/:visitId/scale-instances` | `InitializeScaleInstanceRequest → InitializeScaleInstanceResponse` | no Signal; no retry | 合并服务端实例摘要；不乐观构造 ItemResponse。 |
| `getScaleInstanceExecutionDetail()` — `ScaleInstanceExecutionPage` | `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId` | no body → `ScaleInstanceExecutionDetailResponse` | Signal; no retry | 建立逐题 server baseline；字段合同见 Backend DTO owner。 |
| `getScaleInstanceSubmissionReadiness()` — submission panel | `GET .../:scaleInstanceId/submission-readiness` | no body → `ScaleSubmissionReadinessResponse` | Signal; no retry | 只更新 readiness/安全 scale instance 投影。 |
| `submitScaleInstance()` — submission panel | `POST .../:scaleInstanceId/submit` | `SubmitScaleInstanceRequest → SubmitScaleInstanceResponse` | no Signal; no retry | 采用服务端 instance/submission/readiness；`alreadySubmitted` 仍为成功。 |
| `saveItemResponseDraft()` — `useItemResponseAutosaveCoordinator` | `PATCH .../:scaleInstanceId/item-responses/:itemResponseId` | `UpdateItemResponseDraftRequest → UpdateItemResponseDraftResponse` | no Signal; no automatic retry | 请求使用当前 `expectedRevision`；响应 item/progress 成为新 server baseline。conflict/uncertain 的恢复算法由 coordinator/current pure contract 拥有。 |

- 导出 helper `serializeItemResponseDraftRequest()` 只逐字段重建 `UpdateItemResponseDraftRequest`，不定义 Backend DTO；字段合同引用 Backend DTO Cheatsheet。
- A14 client family 的 baseline/readiness GET 接受 `AbortSignal`；current `saveItemResponseDraft()` PATCH 本身没有 Signal 参数，因此只记录为 no Signal、no automatic retry，不虚构可取消写请求。

### 3.5 Media evidence — `frontend/src/features/assessments/api/media-evidence-api.ts`（7）

| Client / caller | Backend | Frontend request → response | Cancel/retry | Success projection / privacy |
|---|---|---|---|---|
| `listItemMediaEvidences()` — `MediaEvidencePanel` | `GET .../item-responses/:itemResponseId/media-evidences` | no body → `MediaEvidenceListResponse` | Signal; no retry | 更新当前题目媒体历史。 |
| `uploadItemMediaEvidence()` — `MediaEvidencePanel` | `POST .../media-evidences` | `UploadMediaEvidenceInput → UploadMediaEvidenceResponse` | no Signal; no retry | Browser 生成 multipart boundary；固定安全 filename，不传源文件名；合并 media + requirement。服务端字段/validation 见 DTO owner。 |
| `getMediaEvidenceAccessUrl()` — preview/review viewers | `GET .../media-evidences/:mediaEvidenceId/access-url` | `MediaEvidenceAccessAsset → MediaEvidenceAccessUrlResponse` | Signal; no retry | URL/Blob 仅存当前 React 内存并按到期清理；不持久化或记录。 |
| `transcribeItemMediaEvidence()` — patient review UI | `POST .../:mediaEvidenceId/transcribe` | empty object → `MediaEvidenceTranscriptionActionResponse` | no Signal; no retry | 只更新辅助 transcription 投影；不调用 A14。 |
| `adoptPatientAdministrationEvidence()` — patient review UI | `POST .../:mediaEvidenceId/adopt` | no body → `UploadMediaEvidenceResponse` | no Signal; no retry | 合并原 Evidence 与正式 requirement；不上传/复制/改答案。 |
| `revokePatientAdministrationEvidenceAdoption()` — patient review UI | `POST .../:mediaEvidenceId/revoke-adoption` | no body → `UploadMediaEvidenceResponse` | no Signal; no retry | 清正式 requirement 投影；原 patient Evidence 保留。 |
| `voidItemMediaEvidence()` — `MediaEvidencePanel` | `POST .../:mediaEvidenceId/void` | `VoidMediaEvidenceRequest → VoidMediaEvidenceResponse` | no Signal; no retry | 合并 void 记录与新 requirement；不视为物理删除。 |

### 3.6 Scoring — `frontend/src/features/assessments/api/provisional-scoring-api.ts`（4）

| Client / caller | Backend | Frontend request → response | Cancel/retry | Success projection |
|---|---|---|---|---|
| `getLatestProvisionalScoreResult()` — scoring panel | `GET .../:scaleInstanceId/score-results/latest` | no body → `ScoreResultDetailResponse` | Signal; no retry | 完整采用服务端 score/reviewQueue；前端不重算分数。 |
| `computeProvisionalScoreResult()` — scoring panel | `POST .../score-results/compute` | `ComputeScoreResultRequest → ComputeScoreResultResponse` | no Signal; no retry | 采用 detail；`alreadyComputed` 为成功，不自动重算。 |
| `reviewScoreItemManually()` — manual review UI | `PATCH .../:scoreResultId/item-scores/:itemResponseId/manual-review` | `ReviewScoreItemRequest → ReviewScoreItemResponse` | no Signal; no retry | 完整替换 score detail/reviewQueue 并保留 receipt；不本地汇总。 |
| `confirmScoreResult()` — confirmation panel | `POST .../:scoreResultId/confirm` | `ConfirmScoreResultRequest → ConfirmScoreResultResponse` | no Signal; no retry | 完整替换 score detail；`alreadyConfirmed` 为成功。 |

### 3.7 Cognitive domains — `frontend/src/features/assessments/api/cognitive-domain-api.ts`（2）

| Client / caller | Backend | Frontend request → response | Cancel/retry | Success projection |
|---|---|---|---|---|
| `getLatestCognitiveDomainResult()` — `useCognitiveDomainResult` | `GET .../:scaleInstanceId/cognitive-domain-results/latest` | no body → `CognitiveDomainResultDetailResponse` | Signal; no retry | 采用服务端 domain/mapping/comparison-safe result；不重算或诊断。 |
| `computeCognitiveDomainResult()` — same hook/panel | `POST .../cognitive-domain-results/compute` | `ComputeCognitiveDomainResultRequest → ComputeCognitiveDomainResultResponse` | no Signal; no retry | 采用 detail；`alreadyComputed` 为成功，不触发评分/报告调用。 |

### 3.8 Clinical reports — `frontend/src/features/assessments/api/clinical-report-api.ts`（11）

| Client / caller | Backend | Frontend request → response | Cancel/retry | Success projection |
|---|---|---|---|---|
| `listClinicalReportVersions()` — report versions page/panel | `GET /patients/:patientId/visits/:visitId/clinical-reports` | `ListClinicalReportVersionsQuery → ClinicalReportVersionListResponse` | Signal; no retry | 保持服务端版本顺序/lineage 投影。 |
| `getHistoricalClinicalReport()` — historical report page | `GET .../clinical-reports/:reportId` | no body → `ClinicalReportDetailResponse` | Signal; no retry | 只读展示，不进入 workflow hooks。 |
| `getLatestClinicalReport()` — `useClinicalReport` | `GET .../clinical-reports/latest` | no body → `ClinicalReportDetailResponse` | Signal; no retry | 建立唯一 latest baseline。 |
| `generateClinicalReport()` — report panel/hook | `POST .../clinical-reports/generate` | `GenerateClinicalReportRequest → GenerateClinicalReportResponse` | no Signal; no retry | 采用 report；`alreadyGenerated` 为成功。 |
| `updateClinicalReportDraft()` — `useClinicalReportEditAction` | `PATCH .../:reportId/draft` | `UpdateClinicalReportDraftRequest → UpdateClinicalReportDraftResponse` | no Signal; no retry | 完整替换 report，receipt 仅当前内存。 |
| `submitClinicalReportForConfirmation()` — `useClinicalReportSubmissionAction` | `POST .../:reportId/submit-confirmation` | `SubmitClinicalReportForConfirmationRequest → SubmitClinicalReportForConfirmationResponse` | no Signal; no retry | 完整替换 report；幂等 receipt 为成功。 |
| `confirmClinicalReport()` — `useClinicalReportConfirmationAction` | `POST .../:reportId/confirm` | `ConfirmClinicalReportRequest → ConfirmClinicalReportResponse` | no Signal; no retry | 完整替换 report；不本地模拟 lock。 |
| `lockClinicalReport()` — `useClinicalReportLockAction` | `POST .../:reportId/lock` | `LockClinicalReportRequest → LockClinicalReportResponse` | no Signal; no retry | 完整采用 report/receipt；不修改其他资源。 |
| `freezeClinicalReportSources()` — `useClinicalReportSourceFreezeAction` | `POST .../:reportId/freeze-sources` | `FreezeClinicalReportSourcesRequest → FreezeClinicalReportSourcesResponse` | no Signal; no retry | 完整采用 report/receipt；Client 不读取/统计来源。 |
| `archiveClinicalReport()` — `useClinicalReportArchiveAction` | `POST .../:reportId/archive` | `ArchiveClinicalReportRequest → ArchiveClinicalReportResponse` | no Signal; no retry | 完整采用 report/receipt；不本地推断状态。 |
| `createClinicalReportCorrection()` — `useClinicalReportCorrectionAction` | `POST .../:reportId/corrections` | `CreateClinicalReportCorrectionRequest → CreateClinicalReportCorrectionResponse` | no Signal; no retry | replacement 成为 latest projection；source/receipt 只留当前内存。 |

- 导出 helper `normalizeClinicalReportScopeIds()` 只对 frontend scope IDs 做 trim/lowercase/shape/unique 防御，不定义 Backend scope 合同。
- 所有 report write 使用服务端 `report.updatedAt` 形成 frontend request；Client 不自动恢复、覆盖或重放。reconciliation/workflow 属于 Action Hook/Component owner。

### 3.9 Patient Administration — `frontend/src/features/patient-administration/api/patient-administration-api.ts`（19）

Staff root 的三个 ID 均编码；staff Client 的主要 caller 为 `PatientAdministrationStaffPanel`/review panel，patient Client 的主要 caller 为独立 enter/current 页面。详细 workflow 统一引用 Patient Contract 与 Component Map。

| Client | Backend | Frontend request → response | Cancel/retry | Success projection / privacy |
|---|---|---|---|---|
| `getPatientAdministrationSession()` | `GET .../patient-administration` | `PatientAdministrationRouteIds → PatientAdministrationSessionSummary` | Signal; no retry | 更新 staff session summary。 |
| `getPatientAdministrationReview()` | `GET .../patient-administration/review` | route IDs → `PatientAdministrationReviewResponse` | Signal; no retry | 更新安全 review 投影；不形成正式答案。 |
| `createPatientAdministrationSession()` | `POST .../patient-administration` | `PatientAdministrationCreateInput → PatientAdministrationSessionCreateResponse` | no Signal; no retry | 采用 session；raw entry code 仅保存在 staff React memory。 |
| `confirmPatientAdministrationPreparation()` | `POST .../preparation/confirm` | `PatientAdministrationPreparationInput → PatientAdministrationSessionSummary` | no Signal; no retry | 采用新 session summary。 |
| `handoffPatientAdministration()` | `POST .../handoff` | `expectedRevision → PatientAdministrationSessionSummary` | no Signal; no retry | 采用服务端 session；身份/导航 workflow 不在本表展开。 |
| `pausePatientAdministration()` | `POST .../pause` | `PatientAdministrationControlInput → PatientAdministrationSessionSummary` | no Signal; no retry | 采用服务端 state/revision。 |
| `resumePatientAdministration()` | `POST .../resume` | `PatientAdministrationControlInput → PatientAdministrationSessionSummary` | no Signal; no retry | 同上。 |
| `reissuePatientAdministrationEntryCode()` | `POST .../entry-code/reissue` | `PatientAdministrationRequiredReasonInput → PatientAdministrationEntryCodeResponse` | no Signal; no retry | raw code 仅留 staff memory，不进 URL/storage/log。 |
| `terminatePatientAdministration()` | `POST .../terminate` | `PatientAdministrationRequiredReasonInput → PatientAdministrationSessionSummary` | no Signal; no retry | 采用 terminated summary。 |
| `completePatientAdministrationStaffStep()` | `POST .../current/complete` | `PatientAdministrationStaffCompleteInput → PatientAdministrationSessionSummary` | no Signal; no retry | 采用服务端 current step/revision。 |
| `takeOverPatientAdministrationCurrentStep()` | `POST .../current/takeover` | `PatientAdministrationTakeoverInput → PatientAdministrationSessionSummary` | no Signal; no retry | 采用服务端 summary；接管规则由 Patient Contract 拥有。 |
| `redoLastPatientAdministrationStep()` | `POST .../redo-last` | `PatientAdministrationRequiredReasonInput → PatientAdministrationSessionSummary` | no Signal; no retry | 采用服务端 summary；run 算法不在 Client map。 |
| `authorizePatientAdministrationStimulusReplay()` | `POST .../current/audio/:assetKey/replay-authorize` | reason input → `PatientAdministrationSessionSummary` | no Signal; no retry | 采用服务端 summary；授权事实不由前端推断。 |
| `enterPatientAdministration()` | `POST /patient-administration/enter` | six-digit code → `PatientAdministrationCredentialResponse` | no Signal; no retry | 只采用最小响应与 HttpOnly Cookie；不保存/回显 code。 |
| `getCurrentPatientAdministration()` | `GET /patient-administration/current` | no body → `PatientAdministrationCurrentResponse` | Signal; no retry | 更新最小 current step；Client 不推导完整量表或控制历史。 |
| `completeCurrentPatientAdministrationStep()` | `POST /patient-administration/current/complete` | expectedRevision → `PatientAdministrationCurrentResponse` | no Signal; no retry | 采用新 current response；不直接写正式 ItemResponse。 |
| `getCurrentPatientAdministrationAsset()` | `GET /patient-administration/current/assets/:assetKey` | assetKey → `PatientAdministrationBinaryAsset` | Signal; no retry | Blob/object URL 仅内存，换步/卸载清理。 |
| `playCurrentPatientAdministrationAudio()` | `POST /patient-administration/current/audio/:assetKey/play` | assetKey + expectedRevision → `PatientAdministrationPlayedAudio` | no Signal; no retry | 消费 Blob 与 response revision；不持久化资产 URL。 |
| `uploadCurrentPatientAdministrationEvidence()` | `POST /patient-administration/current/evidence` | `PatientAdministrationEvidenceUploadInput → PatientAdministrationEvidenceUploadResponse` | no Signal; no retry | Browser 生成 multipart boundary；只采用 evidence ID/type/revision/time，不提交 step/run/ownership/源文件名。 |

## 4. Frontend error classification owner

### 4.1 Common rules

- JSON clinical clients 将 HTTP 401/403 分别分类为 `unauthenticated`/`forbidden`；DTO 400 通常为 `validation`；network/fetch 或不可解析响应按 family 归为 `service_unavailable`/`unknown`。
- Backend business code 的完整 HTTP contract 只在 Backend API Map 维护；本节只维护 Client 输出的 frontend kind。
- `saveItemResponseDraft()` 将 `ITEM_RESPONSE_DRAFT_CONFLICT` 映射为 `item_response_draft_conflict`；网络或 HTTP 5xx 的写结果不确定映射为 `request_outcome_uncertain`。Client 不自动重放 PATCH。
- Patient Administration 中标记为 uncertain write 的网络/5xx 映射 `request_outcome_uncertain`；其他 Client 不把普通确定性 4xx 归入 uncertain。
- UI 中文文案与具体恢复 workflow 由 Component Map/current hooks 拥有；Client error 不直接展示 Backend message/stack/path/body。

### 4.2 Error class 与 current kind

- `AuthApiError.code`：`invalid_credentials`、`service_unavailable`。
- `PatientsApiError.kind`：common + `patient_not_found`、`patient_code_conflict`、`patient_not_active`、`visit_code_conflict`、`invalid_date_range`。
- `ClinicalHistoryApiError.kind`：common + `invalid_date_range`、`patient_not_found`、`scale_not_available`、`follow_up_trend_range_too_large`、`follow_up_trend_data_invalid`。
- `AssessmentExecutionApiError.kind`：common + `patient_not_found`、`patient_not_active`、`patient_administration_not_completed`、`visit_not_found`、`visit_not_initializable`、`visit_not_editable`、`visit_not_deletable`、`visit_not_voidable`、`visit_update_empty_patch`、`visit_code_conflict`、`scale_not_available`、`scale_version_not_available`、`scale_not_active`、`scale_version_not_active`、`scale_catalog_invalid`、`scale_catalog_version_conflict`、`scale_instance_already_exists`、`scale_instance_not_found`、`scale_instance_not_editable`、`scale_instance_configuration_unavailable`、`scale_instance_not_submittable`、`scale_instance_not_ready`、`scale_instance_start_time_invalid`、`scale_instance_submission_confirmation_required`、`scale_instance_submission_conflict`、`scale_instance_submission_audit_unavailable`、`scale_instance_submission_failed`、`item_response_not_found`、`item_response_not_editable`、`item_response_draft_conflict`、`item_response_empty_patch`、`item_response_payload_invalid`、`item_response_missing_reason_required`、`item_response_cannot_mark_answered`、`item_response_step_not_found`、`item_response_duplicate_step`、`item_response_prompt_not_found`、`item_response_duplicate_prompt`、`item_response_timing_not_allowed`、`item_response_invalid_timing`、`item_response_save_failed`、`request_outcome_uncertain`、`scale_execution_initialization_failed`。
- `MediaEvidenceApiError.kind`：common + patient/visit/instance/item not-found/editable kinds、`item_evidence_type_not_required`、`media_primary_file_required`、`media_file_empty`、`media_file_too_large`、`media_file_type_not_allowed`、`media_file_signature_invalid`、`media_file_embedded_metadata_not_allowed`、`media_trajectory_invalid`、`media_capture_mode_invalid`、`media_evidence_already_attached`、`media_evidence_not_adoptable`、`media_evidence_not_found`、`media_evidence_not_accessible`、`media_evidence_not_voidable`、`media_evidence_adoption_not_revocable`、`media_evidence_patient_origin_requires_adoption_revoke`、`handwriting_recapture_not_allowed`、`media_trajectory_not_found`、`media_storage_unavailable`、`media_evidence_create_failed`、`media_evidence_attach_failed`、`media_evidence_void_failed`、`media_evidence_adoption_revoke_failed`、`media_transcription_unavailable`、`media_transcription_not_allowed`、`media_transcription_conflict`。
- `ProvisionalScoringApiError.kind`：common + patient/visit/instance/config kinds、`score_computation_confirmation_required`、`score_instance_not_computable`、`score_input_invalid`、`score_result_not_found`、`score_result_incomplete`、`score_result_voided`、`score_result_not_reviewable`、`score_item_not_found`、`score_item_not_reviewable`、`score_item_review_target_unavailable`、`score_manual_value_out_of_range`、`score_manual_value_step_invalid`、`score_result_metadata_unsupported`、`score_review_audit_limit_reached`、`score_result_review_conflict`、`score_result_review_failed`、`score_result_confirmation_required`、`score_result_not_ready_for_confirmation`、`score_result_confirmation_warnings_present`、`score_result_confirmation_conflict`、`score_result_confirmation_audit_unavailable`、`score_result_confirmation_failed`、`score_computation_conflict`、`score_computation_failed`。
- `CognitiveDomainApiError.kind`：common + patient/visit/instance/config/score-result kinds、`cognitive_domain_computation_confirmation_required`、`cognitive_domain_instance_not_computable`、`cognitive_domain_source_score_not_final`、`cognitive_domain_source_score_invalid`、`cognitive_domain_mapping_unavailable`、`cognitive_domain_input_invalid`、`cognitive_domain_result_not_found`、`cognitive_domain_result_incomplete`、`cognitive_domain_result_voided`、`cognitive_domain_computation_conflict`、`cognitive_domain_computation_failed`。
- `ClinicalReportApiError.kind`：common + patient/visit/instance/config kinds、`clinical_report_generation_confirmation_required`、`clinical_report_scope_invalid`、`clinical_report_source_scale_not_ready`、`clinical_report_source_score_not_final`、`clinical_report_source_domain_result_required`、`clinical_report_source_domain_result_invalid`、`clinical_report_source_media_invalid`、`clinical_report_input_invalid`、`clinical_report_not_found`、`clinical_report_incomplete`、`clinical_report_history_lineage_invalid`、`clinical_report_voided`、`clinical_report_scope_conflict`、`clinical_report_generation_conflict`、`clinical_report_generation_failed`、`clinical_report_metadata_unsupported`、`clinical_report_not_editable`、`clinical_report_edit_no_changes`、`clinical_report_edit_audit_limit_reached`、`clinical_report_edit_conflict`、`clinical_report_edit_failed`、`clinical_report_submission_confirmation_required`、`clinical_report_not_ready_for_submission`、`clinical_report_submission_conflict`、`clinical_report_submission_audit_unavailable`、`clinical_report_submission_failed`、`clinical_report_confirmation_required`、`clinical_report_not_ready_for_confirmation`、`clinical_report_confirmation_conflict`、`clinical_report_confirmation_audit_unavailable`、`clinical_report_confirmation_failed`、`clinical_report_lock_confirmation_required`、`clinical_report_not_lockable`、`clinical_report_lock_conflict`、`clinical_report_lock_audit_unavailable`、`clinical_report_lock_failed`、`clinical_report_source_freeze_confirmation_required`、`clinical_report_not_source_freezable`、`clinical_report_source_freeze_scope_invalid`、`clinical_report_source_freeze_input_invalid`、`clinical_report_source_freeze_conflict`、`clinical_report_source_freeze_audit_unavailable`、`clinical_report_source_freeze_incomplete`、`clinical_report_source_freeze_failed`、`clinical_report_archive_confirmation_required`、`clinical_report_not_archivable`、`clinical_report_archive_conflict`、`clinical_report_archive_audit_unavailable`、`clinical_report_archive_failed`、`clinical_report_replacement_lineage_invalid`、`clinical_report_correction_confirmation_required`、`clinical_report_not_correctable`、`clinical_report_correction_not_latest`、`clinical_report_correction_conflict`、`clinical_report_correction_audit_unavailable`、`clinical_report_correction_replacement_conflict`、`clinical_report_correction_incomplete`、`clinical_report_correction_failed`、`clinical_report_correction_workflow_forbidden`。
- `PatientAdministrationApiError.kind`：`unauthenticated`、`forbidden`、`validation`、`session_not_found`、`session_conflict`、`entry_invalid`、`rate_limited`、`step_invalid`、`asset_not_allowed`、`evidence_not_allowed`、`media_invalid`、`request_outcome_uncertain`、`service_unavailable`、`invalid_response`、`unknown`。

## 5. Client-side privacy boundaries

- Password、entry code、signed URL、Blob/object URL、patient asset 与 request/response body 不进入 console、route、localStorage 或 sessionStorage；raw entry code 只在需要时短暂存在 staff React memory。
- 前端 type 不声明 Backend secret/internal ownership、Storage object key/bucket/checksum、metadata、raw scoring/expected answer、submission barrier 或 internal lineage IDs。
- Patient client 不调用 `/auth/me` 或 staff patients/visits/instance API；只消费 patient-session endpoint 的最小投影。
- response 如何进入复杂 component state、autosave/reconciliation、single-flight、debounce、checkpoint、stale recovery、报告 workflow 与 UI 文案不在本 Client map 维护，统一引用 Component Map/current hooks/pure contracts。

## 6. Coverage boundary

- 9 个 Client 文件的 63 个网络函数均在 `3` 覆盖；`serializeItemResponseDraftRequest()` 与 `normalizeClinicalReportScopeIds()` 两个导出 helper 作为 request construction projection 单独记录。
- Backend 的 64 个公开 endpoint 中 `GET /health` 没有业务 frontend Client；其余 endpoint 均有对应 client function。
- 新增/删除 Client 时只更新本文件的 integration projection；不得把 Backend DTO 字段或服务端算法横向复制到本文件。
