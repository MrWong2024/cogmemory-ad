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
  limitations?: string;
};

export type ClinicalReportConfirmationResponse = {
  confirmedAt: Date | null;
  confirmedByName?: string;
  confirmedByRole?: ReportConfirmationRole;
  confirmationNote?: string;
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
  confirmation: ClinicalReportConfirmationResponse | null;
  lockedAt: Date | null;
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
