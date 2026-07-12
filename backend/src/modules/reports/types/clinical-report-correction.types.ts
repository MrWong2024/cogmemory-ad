import type { ClinicalReportSummary } from '../services/reports.service';

export type ClinicalReportCorrectionActor = {
  operatorId: string;
  operatorName: string;
  operatorRole: 'doctor' | 'admin';
};

export type ClinicalReportCorrectionState = 'in_progress' | 'completed';

export type ClinicalReportCorrectionMetadata = {
  version: 1;
  state: ClinicalReportCorrectionState;
  correctionId: string;
  correctionNo: number;
  startedAt: Date;
  startedBy: string;
  startedByName: string;
  startedByRole: 'doctor' | 'admin';
  correctionReason: string;
  changeSummary: string;
  previousReportCode: string;
  previousReportVersion: number;
  replacementReportCode: string;
  replacementReportVersion: number;
  sourceArchiveId: string;
  sourceArchivedAt: Date;
  sourceFreezeId: string;
  sourceFreezeCompletedAt: Date;
  replacementReportId?: string;
  replacementCreatedAt?: Date;
  completedAt?: Date;
  completedBy?: string;
  completedByName?: string;
  completedByRole?: 'doctor' | 'admin';
};

export type ClinicalReportReplacementMetadata = {
  version: 1;
  correctionId: string;
  correctionNo: number;
  previousReportId: string;
  previousReportCode: string;
  previousReportVersion: number;
  replacementReportCode: string;
  replacementReportVersion: number;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  createdByRole: 'doctor' | 'admin';
  correctionReason: string;
  changeSummary: string;
  sourceArchiveId: string;
  sourceArchivedAt: Date;
  sourceFreezeId: string;
  sourceFreezeCompletedAt: Date;
};

export type ClinicalReportCorrectionPlan = {
  correctionId: string;
  correctionNo: number;
  replacementReportCode: string;
  replacementReportVersion: number;
  startedAt: Date;
  actor: ClinicalReportCorrectionActor;
  correctionReason: string;
  changeSummary: string;
  sourceArchiveId: string;
  sourceArchivedAt: Date;
  sourceFreezeId: string;
  sourceFreezeCompletedAt: Date;
};

export type ClinicalReportCorrectionRecordInput = {
  correctionNo: number;
  correctedAt: Date;
  correctedBy: string;
  correctedByName: string;
  reason: string;
  changeSummary: string;
  previousReportCode: string;
  replacementReportCode: string;
  auditLogId: null;
};

export type ClinicalReportCorrectionContext = {
  sourceReport: ClinicalReportSummary;
  latestReport: ClinicalReportSummary;
  expectedUpdatedAt: Date;
};

export type CreateClinicalReportCorrectionInput = {
  correctionReason: string;
  changeSummary: string;
  expectedUpdatedAt: Date;
  actor: ClinicalReportCorrectionActor;
};

export type ExistingClinicalReportCorrectionResolution = {
  audit: ClinicalReportCorrectionMetadata;
  completed: boolean;
};

export type ClinicalReportReplacementValidation = {
  lineage: ClinicalReportReplacementMetadata;
};

export type StartClinicalReportCorrectionInput = {
  reportId: string;
  patientId: string;
  assessmentVisitId: string;
  reportVersion: number;
  reportCode: string;
  expectedUpdatedAt: Date;
  metadata: Record<string, unknown>;
};

export type CompleteClinicalReportCorrectionInput = {
  reportId: string;
  patientId: string;
  assessmentVisitId: string;
  reportVersion: number;
  reportCode: string;
  correctionId: string;
  replacementReportId: string;
  replacementReportCode: string;
  replacementReportVersion: number;
  correctionRecord: ClinicalReportCorrectionRecordInput;
  metadata: Record<string, unknown>;
};

export type RecordClinicalReportCorrectionReplacementInput = {
  reportId: string;
  patientId: string;
  assessmentVisitId: string;
  reportVersion: number;
  reportCode: string;
  correctionId: string;
  replacementReportId: string;
  replacementReportCode: string;
  replacementReportVersion: number;
  metadata: Record<string, unknown>;
};
