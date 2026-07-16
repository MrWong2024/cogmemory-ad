import type { ClinicalReportSummary } from '../services/reports.service';

export type ClinicalReportArchiveActor = {
  operatorId: string;
  operatorName: string;
  operatorRole: 'doctor' | 'admin';
};

export type ClinicalReportArchiveMetadata = {
  version: 1;
  archiveId: string;
  archivedAt: Date;
  archivedBy: string;
  archivedByName: string;
  archivedByRole: 'doctor' | 'admin';
  archiveNote: string;
  sourceFreezeId: string;
  sourceFreezeCompletedAt: Date;
};

export type ClinicalReportArchiveContext = {
  report: ClinicalReportSummary;
  expectedUpdatedAt: Date;
};

export type ClinicalReportArchiveMutation = {
  archivedAt: Date;
  archivedBy: string;
  metadata: Record<string, unknown>;
  audit: ClinicalReportArchiveMetadata;
};

export type ArchiveClinicalReportInput = {
  reportId: string;
  patientId: string;
  assessmentVisitId: string;
  reportVersion: number;
  expectedUpdatedAt: Date;
  archivedAt: Date;
  archivedBy: string;
  metadata: Record<string, unknown>;
};

export type ExistingClinicalReportArchiveResolution = {
  archiveId: string | null;
  archivedAt: Date;
  archivedBy: {
    operatorId: string;
    operatorName?: string;
    operatorRole: 'doctor' | 'admin' | 'unknown';
  };
  archiveNote?: string;
  sourceFreezeId: string | null;
  sourceFreezeCompletedAt: Date | null;
};
