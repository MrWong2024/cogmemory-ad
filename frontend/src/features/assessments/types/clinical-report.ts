export type ClinicalReportType =
  | 'cognitive_assessment'
  | 'follow_up'
  | 'research_summary'
  | 'other';

export type ClinicalReportStatus =
  | 'draft'
  | 'pending_confirmation'
  | 'confirmed'
  | 'archived'
  | 'corrected'
  | 'voided';

export type ClinicalReportSource =
  | 'manual'
  | 'system_draft'
  | 'ai_draft'
  | 'imported'
  | 'mixed';

export type ClinicalReportQualityStatus =
  | 'unchecked'
  | 'passed'
  | 'needs_review'
  | 'failed';

export type ClinicalReportPatientSex =
  | 'male'
  | 'female'
  | 'other'
  | 'unknown';

export type ClinicalReportVisitType =
  | 'baseline'
  | 'follow_up'
  | 'screening'
  | 'unscheduled'
  | 'other';

export type ClinicalReportOperatorRole =
  | 'doctor'
  | 'nurse'
  | 'research_assistant'
  | 'admin'
  | 'unknown';

export type ClinicalReportConfirmationRole = 'doctor' | 'admin' | 'unknown';

export type ClinicalReportEvidenceType =
  | 'photo'
  | 'handwriting'
  | 'document_scan'
  | 'audio'
  | 'raw_text_snapshot'
  | 'duration'
  | 'operator_note'
  | 'other';

export type ClinicalReportCaptureMode =
  | 'photo_upload'
  | 'tablet_handwriting'
  | 'paper_scan'
  | 'system_generated'
  | 'imported'
  | 'other';

export type ClinicalReportScoreStatus =
  | 'draft'
  | 'computed'
  | 'not_scored'
  | 'auto_scored'
  | 'manual_scored'
  | 'needs_review'
  | 'confirmed'
  | 'locked'
  | 'voided';

export type ClinicalReportGenerationActor = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: ClinicalReportOperatorRole;
};

export type ClinicalReportGeneration = {
  generationId: string | null;
  generatedAt: string | null;
  generatedBy: ClinicalReportGenerationActor | null;
  engineVersion?: string;
  reportScope?: string;
  includedScaleInstanceCount: number;
  scoreResultCount: number;
  cognitiveDomainResultCount: number;
  mediaEvidenceCount: number;
  aiUsed: boolean;
};

export type ClinicalReportPatientSnapshot = {
  subjectCode?: string;
  displayName?: string;
  sex?: ClinicalReportPatientSex;
  birthDate: string | null;
  educationYears: number | null;
};

export type ClinicalReportVisitSnapshot = {
  visitCode?: string;
  visitType?: ClinicalReportVisitType;
  assessmentDate: string | null;
  operatorName?: string;
  operatorRole?: ClinicalReportOperatorRole;
};

export type ClinicalReportScaleTrace = {
  scaleInstanceId: string | null;
  scaleCode: string;
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  domainMappingVersion?: string;
  sourceDocument?: string;
};

export type ClinicalReportScoreSnapshot = {
  scaleCode: string;
  scaleName?: string;
  scaleVersion?: string;
  totalScoreValue: number | null;
  totalMaxScore: number | null;
  totalMinScore: number | null;
  scorePercent: number | null;
  scoreStatus?: ClinicalReportScoreStatus;
  qualityStatus?: ClinicalReportQualityStatus;
  summary?: string;
};

export type ClinicalReportDomainSnapshot = {
  scaleCode?: string;
  domainCode: string;
  domainTitle?: string;
  scoreValue: number | null;
  maxScore: number | null;
  scorePercent: number | null;
  weightedScore: number | null;
  weightedMaxScore: number | null;
  itemCount: number | null;
  needsReviewItemCount: number | null;
  summary?: string;
};

export type ClinicalReportEvidenceSnapshot = {
  scaleCode?: string;
  itemCode?: string;
  itemTitle?: string;
  evidenceType?: ClinicalReportEvidenceType;
  captureMode?: ClinicalReportCaptureMode;
  qualityStatus?: ClinicalReportQualityStatus;
  summary?: string;
};

export type ClinicalReportNarrative = {
  chiefSummary?: string;
  scoreSummary?: string;
  domainSummary?: string;
  evidenceSummary?: string;
  doctorOpinion?: string;
  recommendationText?: string;
  limitations?: string;
};

export type ClinicalReportWorkflowActor = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: ClinicalReportOperatorRole;
};

export type ClinicalReportChangedField =
  | 'doctorOpinion'
  | 'recommendationText';

export type ClinicalReportEditorialSummary = {
  lastEditedAt: string | null;
  lastEditedBy: ClinicalReportWorkflowActor | null;
  editCount: number;
  lastChangedFields: ClinicalReportChangedField[];
};

export type ClinicalReportSubmissionSummary = {
  submissionId: string | null;
  submittedAt: string | null;
  submittedBy: ClinicalReportWorkflowActor | null;
  submissionNote?: string;
};

export type ClinicalReportConfirmation = {
  confirmationId: string | null;
  confirmedAt: string | null;
  confirmedByName?: string;
  confirmedByRole?: ClinicalReportConfirmationRole;
  confirmationNote?: string;
};

export type ClinicalReportLockSummary = {
  lockId: string | null;
  lockedAt: string | null;
  lockedBy: ClinicalReportWorkflowActor | null;
  lockNote?: string;
};

export type ClinicalReportArchiveSummary = {
  archiveId: string | null;
  archivedAt: string;
  archivedBy: ClinicalReportWorkflowActor;
  archiveNote?: string;
  sourceFreezeId: string | null;
  sourceFreezeCompletedAt: string | null;
};

export type ClinicalReportSourceFreezeState = 'in_progress' | 'completed';

export type ClinicalReportSourceFreezeResourceCounts = {
  scaleInstanceCount: number;
  itemResponseCount: number;
  scoreResultCount: number;
  cognitiveDomainResultCount: number;
  mediaEvidenceCount: number;
  totalSourceCount: number;
};

export type ClinicalReportSourceFreezeSummary = {
  freezeId: string;
  state: ClinicalReportSourceFreezeState;
  startedAt: string;
  sourceLockedAt: string;
  startedBy: ClinicalReportWorkflowActor;
  freezeNote: string;
  expectedCounts: ClinicalReportSourceFreezeResourceCounts;
  completedCounts: ClinicalReportSourceFreezeResourceCounts | null;
  newlyFrozenCounts: ClinicalReportSourceFreezeResourceCounts | null;
  previouslyFrozenCounts: ClinicalReportSourceFreezeResourceCounts;
  completedAt: string | null;
  completedBy: ClinicalReportWorkflowActor | null;
};

export type ClinicalReport = {
  id: string;
  reportCode: string;
  reportNo?: string;
  reportType: ClinicalReportType;
  status: ClinicalReportStatus;
  reportVersion: number;
  source: ClinicalReportSource;
  qualityStatus: ClinicalReportQualityStatus;
  patientSnapshot: ClinicalReportPatientSnapshot | null;
  visitSnapshot: ClinicalReportVisitSnapshot | null;
  scaleTraces: ClinicalReportScaleTrace[];
  scoreSnapshots: ClinicalReportScoreSnapshot[];
  domainSnapshots: ClinicalReportDomainSnapshot[];
  evidenceSnapshots: ClinicalReportEvidenceSnapshot[];
  narrative: ClinicalReportNarrative | null;
  generation: ClinicalReportGeneration | null;
  editorial: ClinicalReportEditorialSummary | null;
  submission: ClinicalReportSubmissionSummary | null;
  confirmation: ClinicalReportConfirmation | null;
  lockedAt: string | null;
  lock: ClinicalReportLockSummary | null;
  sourceFreeze: ClinicalReportSourceFreezeSummary | null;
  archivedAt: string | null;
  archive: ClinicalReportArchiveSummary | null;
  voidedAt: string | null;
  voidReason?: string;
  createdAt: string | null;
  updatedAt: string | null;
  isFinal: boolean;
};

export type ClinicalReportDetailResponse = {
  report: ClinicalReport;
};

export type GenerateClinicalReportRequest = {
  confirm: true;
  primaryScaleInstanceIds: string[];
};

export type GenerateClinicalReportResponse = {
  report: ClinicalReport;
  alreadyGenerated: boolean;
};

export type UpdateClinicalReportDraftRequest = {
  doctorOpinion: string;
  recommendationText?: string;
  editNote: string;
  expectedUpdatedAt: string;
};

export type SubmitClinicalReportForConfirmationRequest = {
  confirm: true;
  submissionNote: string;
  expectedUpdatedAt: string;
};

export type ConfirmClinicalReportRequest = {
  confirm: true;
  confirmationNote: string;
  expectedUpdatedAt: string;
};

export type LockClinicalReportRequest = {
  confirm: true;
  lockNote: string;
  expectedUpdatedAt: string;
};

export type FreezeClinicalReportSourcesRequest = {
  confirm: true;
  freezeNote: string;
  expectedUpdatedAt: string;
};

export type ArchiveClinicalReportRequest = {
  confirm: true;
  archiveNote: string;
  expectedUpdatedAt: string;
};

export type ClinicalReportEditReceipt = {
  eventId: string;
  editedAt: string;
  editedBy: ClinicalReportWorkflowActor;
  changedFields: ClinicalReportChangedField[];
  editNote: string;
};

export type UpdateClinicalReportDraftResponse = {
  report: ClinicalReport;
  editReceipt: ClinicalReportEditReceipt;
};

export type SubmitClinicalReportReceipt = {
  submissionId: string | null;
  submittedAt: string | null;
  submittedBy: ClinicalReportWorkflowActor | null;
  submissionNote?: string;
  alreadySubmitted: boolean;
};

export type SubmitClinicalReportForConfirmationResponse = {
  report: ClinicalReport;
  submissionReceipt: SubmitClinicalReportReceipt;
};

export type ConfirmClinicalReportReceipt = {
  confirmationId: string | null;
  confirmedAt: string;
  confirmedBy: ClinicalReportWorkflowActor;
  confirmationNote?: string;
  alreadyConfirmed: boolean;
};

export type ConfirmClinicalReportResponse = {
  report: ClinicalReport;
  confirmationReceipt: ConfirmClinicalReportReceipt;
};

export type LockClinicalReportReceipt = {
  lockId: string | null;
  lockedAt: string;
  lockedBy: ClinicalReportWorkflowActor;
  lockNote?: string;
  alreadyLocked: boolean;
};

export type LockClinicalReportResponse = {
  report: ClinicalReport;
  lockReceipt: LockClinicalReportReceipt;
};

export type FreezeClinicalReportSourcesReceipt = {
  freezeId: string;
  state: 'completed';
  startedAt: string;
  sourceLockedAt: string;
  startedBy: ClinicalReportWorkflowActor;
  completedAt: string;
  completedBy: ClinicalReportWorkflowActor;
  freezeNote: string;
  expectedCounts: ClinicalReportSourceFreezeResourceCounts;
  completedCounts: ClinicalReportSourceFreezeResourceCounts;
  newlyFrozenCounts: ClinicalReportSourceFreezeResourceCounts;
  previouslyFrozenCounts: ClinicalReportSourceFreezeResourceCounts;
  alreadyFrozen: boolean;
  resumedExisting: boolean;
};

export type FreezeClinicalReportSourcesResponse = {
  report: ClinicalReport;
  sourceFreezeReceipt: FreezeClinicalReportSourcesReceipt;
};

export type ArchiveClinicalReportReceipt = {
  archiveId: string | null;
  archivedAt: string;
  archivedBy: ClinicalReportWorkflowActor;
  archiveNote?: string;
  sourceFreezeId: string | null;
  sourceFreezeCompletedAt: string | null;
  alreadyArchived: boolean;
};

export type ArchiveClinicalReportResponse = {
  report: ClinicalReport;
  archiveReceipt: ArchiveClinicalReportReceipt;
};
