import type { ClinicalReportSummary } from '../services/reports.service';

export type ClinicalReportLockActor = {
  operatorId: string;
  operatorName: string;
  operatorRole: 'doctor' | 'admin';
};

export type ClinicalReportLockMetadata = {
  version: 1;
  lockId: string;
  lockedAt: Date;
  lockedBy: string;
  lockedByName: string;
  lockedByRole: 'doctor' | 'admin';
  lockNote: string;
};

export type ClinicalReportLockContext = {
  report: ClinicalReportSummary;
  expectedUpdatedAt: Date;
};

export type ClinicalReportLockMutation = {
  lockedAt: Date;
  lockedBy: string;
  metadata: Record<string, unknown>;
  audit: ClinicalReportLockMetadata;
};

export type LockClinicalReportInput = {
  reportId: string;
  patientId: string;
  assessmentVisitId: string;
  reportVersion: number;
  expectedUpdatedAt: Date;
  lockedAt: Date;
  lockedBy: string;
  metadata: Record<string, unknown>;
};

export type ExistingClinicalReportLockResolution = {
  lockId: string | null;
  lockedAt: Date;
  lockedBy: {
    operatorId: string;
    operatorName?: string;
    operatorRole: 'doctor' | 'admin' | 'unknown';
  };
  lockNote?: string;
};
