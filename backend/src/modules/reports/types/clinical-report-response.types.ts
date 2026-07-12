import type {
  ClinicalReportSource,
  ClinicalReportStatus,
  ClinicalReportType,
  ReportCaptureMode,
  ReportConfirmationRole,
  ReportEvidenceType,
  ReportOperatorRole,
  ReportPatientSex,
  ReportQualityStatus,
  ReportScoreStatus,
  ReportVisitType,
} from '../schemas/clinical-report.schema';

export type ClinicalReportGenerationActorResponse = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: ReportOperatorRole;
};

export type ClinicalReportGenerationResponse = {
  generationId: string | null;
  generatedAt: Date | null;
  generatedBy: ClinicalReportGenerationActorResponse | null;
  engineVersion?: string;
  reportScope?: string;
  includedScaleInstanceCount: number;
  scoreResultCount: number;
  cognitiveDomainResultCount: number;
  mediaEvidenceCount: number;
  aiUsed: boolean;
};

export type ClinicalReportPatientSnapshotResponse = {
  subjectCode?: string;
  displayName?: string;
  sex?: ReportPatientSex;
  birthDate: Date | null;
  educationYears: number | null;
};

export type ClinicalReportVisitSnapshotResponse = {
  visitCode?: string;
  visitType?: ReportVisitType;
  assessmentDate: Date | null;
  operatorName?: string;
  operatorRole?: ReportOperatorRole;
};

export type ClinicalReportScaleTraceResponse = {
  scaleInstanceId: string | null;
  scaleCode: string;
  scaleVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  domainMappingVersion?: string;
  sourceDocument?: string;
};

export type ClinicalReportScoreSnapshotResponse = {
  scaleCode: string;
  scaleName?: string;
  scaleVersion?: string;
  totalScoreValue: number | null;
  totalMaxScore: number | null;
  totalMinScore: number | null;
  scorePercent: number | null;
  scoreStatus?: ReportScoreStatus;
  qualityStatus?: ReportQualityStatus;
  summary?: string;
};

export type ClinicalReportDomainSnapshotResponse = {
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

export type ClinicalReportEvidenceSnapshotResponse = {
  scaleCode?: string;
  itemCode?: string;
  itemTitle?: string;
  evidenceType?: ReportEvidenceType;
  captureMode?: ReportCaptureMode;
  qualityStatus?: ReportQualityStatus;
  summary?: string;
};

export type ClinicalReportNarrativeResponse = {
  chiefSummary?: string;
  scoreSummary?: string;
  domainSummary?: string;
  evidenceSummary?: string;
  doctorOpinion?: string;
  recommendationText?: string;
  limitations?: string;
};

export type ClinicalReportWorkflowActorResponse = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: ReportOperatorRole;
};

export type ClinicalReportEditorialSummaryResponse = {
  lastEditedAt: Date | null;
  lastEditedBy: ClinicalReportWorkflowActorResponse | null;
  editCount: number;
  lastChangedFields: Array<'doctorOpinion' | 'recommendationText'>;
};

export type ClinicalReportSubmissionSummaryResponse = {
  submissionId: string | null;
  submittedAt: Date | null;
  submittedBy: ClinicalReportWorkflowActorResponse | null;
  submissionNote?: string;
};

export type ClinicalReportConfirmationResponse = {
  confirmationId: string | null;
  confirmedAt: Date | null;
  confirmedByName?: string;
  confirmedByRole?: ReportConfirmationRole;
  confirmationNote?: string;
};

export type ClinicalReportLockSummaryResponse = {
  lockId: string | null;
  lockedAt: Date | null;
  lockedBy: ClinicalReportWorkflowActorResponse | null;
  lockNote?: string;
};

export type ClinicalReportSourceFreezeStateResponse =
  | 'in_progress'
  | 'completed';

export type ClinicalReportSourceFreezeActorResponse =
  ClinicalReportWorkflowActorResponse;

export type ClinicalReportSourceFreezeResourceCountsResponse = {
  scaleInstanceCount: number;
  itemResponseCount: number;
  scoreResultCount: number;
  cognitiveDomainResultCount: number;
  mediaEvidenceCount: number;
  totalSourceCount: number;
};

export type ClinicalReportSourceFreezeSummaryResponse = {
  freezeId: string;
  state: ClinicalReportSourceFreezeStateResponse;
  startedAt: Date;
  sourceLockedAt: Date;
  startedBy: ClinicalReportSourceFreezeActorResponse;
  freezeNote: string;
  expectedCounts: ClinicalReportSourceFreezeResourceCountsResponse;
  completedCounts: ClinicalReportSourceFreezeResourceCountsResponse | null;
  newlyFrozenCounts: ClinicalReportSourceFreezeResourceCountsResponse | null;
  previouslyFrozenCounts: ClinicalReportSourceFreezeResourceCountsResponse;
  completedAt: Date | null;
  completedBy: ClinicalReportSourceFreezeActorResponse | null;
};

export type ClinicalReportResponse = {
  id: string;
  reportCode: string;
  reportNo?: string;
  reportType: ClinicalReportType;
  status: ClinicalReportStatus;
  reportVersion: number;
  source: ClinicalReportSource;
  qualityStatus: ReportQualityStatus;
  patientSnapshot: ClinicalReportPatientSnapshotResponse | null;
  visitSnapshot: ClinicalReportVisitSnapshotResponse | null;
  scaleTraces: ClinicalReportScaleTraceResponse[];
  scoreSnapshots: ClinicalReportScoreSnapshotResponse[];
  domainSnapshots: ClinicalReportDomainSnapshotResponse[];
  evidenceSnapshots: ClinicalReportEvidenceSnapshotResponse[];
  narrative: ClinicalReportNarrativeResponse | null;
  generation: ClinicalReportGenerationResponse | null;
  editorial: ClinicalReportEditorialSummaryResponse | null;
  submission: ClinicalReportSubmissionSummaryResponse | null;
  confirmation: ClinicalReportConfirmationResponse | null;
  lockedAt: Date | null;
  lock: ClinicalReportLockSummaryResponse | null;
  sourceFreeze: ClinicalReportSourceFreezeSummaryResponse | null;
  archivedAt: Date | null;
  voidedAt: Date | null;
  voidReason?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  isFinal: boolean;
};

export type ClinicalReportDetailResponse = {
  report: ClinicalReportResponse;
};

export type GenerateClinicalReportResponse = {
  report: ClinicalReportResponse;
  alreadyGenerated: boolean;
};

export type ClinicalReportEditReceiptResponse = {
  eventId: string;
  editedAt: Date;
  editedBy: ClinicalReportWorkflowActorResponse;
  changedFields: Array<'doctorOpinion' | 'recommendationText'>;
  editNote: string;
};

export type UpdateClinicalReportDraftResponse = {
  report: ClinicalReportResponse;
  editReceipt: ClinicalReportEditReceiptResponse;
};

export type SubmitClinicalReportReceiptResponse = {
  submissionId: string | null;
  submittedAt: Date | null;
  submittedBy: ClinicalReportWorkflowActorResponse | null;
  submissionNote?: string;
  alreadySubmitted: boolean;
};

export type SubmitClinicalReportForConfirmationResponse = {
  report: ClinicalReportResponse;
  submissionReceipt: SubmitClinicalReportReceiptResponse;
};

export type ConfirmClinicalReportReceiptResponse = {
  confirmationId: string | null;
  confirmedAt: Date;
  confirmedBy: ClinicalReportWorkflowActorResponse;
  confirmationNote?: string;
  alreadyConfirmed: boolean;
};

export type ConfirmClinicalReportResponse = {
  report: ClinicalReportResponse;
  confirmationReceipt: ConfirmClinicalReportReceiptResponse;
};

export type LockClinicalReportReceiptResponse = {
  lockId: string | null;
  lockedAt: Date;
  lockedBy: ClinicalReportWorkflowActorResponse;
  lockNote?: string;
  alreadyLocked: boolean;
};

export type LockClinicalReportResponse = {
  report: ClinicalReportResponse;
  lockReceipt: LockClinicalReportReceiptResponse;
};

export type FreezeClinicalReportSourcesReceiptResponse = {
  freezeId: string;
  state: 'completed';
  startedAt: Date;
  sourceLockedAt: Date;
  startedBy: ClinicalReportSourceFreezeActorResponse;
  completedAt: Date;
  completedBy: ClinicalReportSourceFreezeActorResponse;
  freezeNote: string;
  expectedCounts: ClinicalReportSourceFreezeResourceCountsResponse;
  completedCounts: ClinicalReportSourceFreezeResourceCountsResponse;
  newlyFrozenCounts: ClinicalReportSourceFreezeResourceCountsResponse;
  previouslyFrozenCounts: ClinicalReportSourceFreezeResourceCountsResponse;
  alreadyFrozen: boolean;
  resumedExisting: boolean;
};

export type FreezeClinicalReportSourcesResponse = {
  report: ClinicalReportResponse;
  sourceFreezeReceipt: FreezeClinicalReportSourcesReceiptResponse;
};
