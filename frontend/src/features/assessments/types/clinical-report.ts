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
  limitations?: string;
};

export type ClinicalReportConfirmation = {
  confirmedAt: string | null;
  confirmedByName?: string;
  confirmedByRole?: ClinicalReportConfirmationRole;
  confirmationNote?: string;
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
  confirmation: ClinicalReportConfirmation | null;
  lockedAt: string | null;
  archivedAt: string | null;
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
