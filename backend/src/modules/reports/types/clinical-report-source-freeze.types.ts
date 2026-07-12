import type { ClinicalReportSummary } from '../services/reports.service';

export type ClinicalReportSourceFreezeState = 'in_progress' | 'completed';

export type ClinicalReportSourceFreezeActor = {
  operatorId: string;
  operatorName: string;
  operatorRole: 'doctor' | 'admin';
};

export type ClinicalReportSourceFreezeScope = {
  scaleInstanceIds: string[];
  itemResponseIds: string[];
  scoreResultIds: string[];
  cognitiveDomainResultIds: string[];
  mediaEvidenceIds: string[];
};

export type ClinicalReportSourceFreezeResourceCounts = {
  scaleInstanceCount: number;
  itemResponseCount: number;
  scoreResultCount: number;
  cognitiveDomainResultCount: number;
  mediaEvidenceCount: number;
  totalSourceCount: number;
};

export type ClinicalReportSourceFreezeMetadata = {
  version: 1;
  state: ClinicalReportSourceFreezeState;
  freezeId: string;
  startedAt: Date;
  sourceLockedAt: Date;
  startedBy: string;
  startedByName: string;
  startedByRole: 'doctor' | 'admin';
  freezeNote: string;
  scope: ClinicalReportSourceFreezeScope;
  expectedCounts: ClinicalReportSourceFreezeResourceCounts;
  completedCounts?: ClinicalReportSourceFreezeResourceCounts;
  newlyFrozenCounts?: ClinicalReportSourceFreezeResourceCounts;
  previouslyFrozenCounts: ClinicalReportSourceFreezeResourceCounts;
  completedAt?: Date;
  completedBy?: string;
  completedByName?: string;
  completedByRole?: 'doctor' | 'admin';
};

export type ClinicalReportSourceFreezeContext = {
  report: ClinicalReportSummary;
  expectedUpdatedAt: Date;
};

export type SourceFreezeResourceState = {
  id: string;
  status: string;
  lockedAt: Date | null;
};

export type SourceFreezeBatchResult<
  TItem extends SourceFreezeResourceState = SourceFreezeResourceState,
> = {
  requestedCount: number;
  matchedCount: number;
  newlyFrozenCount: number;
  previouslyFrozenCount: number;
  invalidCount: number;
  items: TItem[];
};

export type FreezeClinicalReportSourcesInput = {
  reportId: string;
  patientId: string;
  assessmentVisitId: string;
  expectedUpdatedAt: Date;
  metadata: Record<string, unknown>;
};

export type ExistingSourceFreezeResolution = {
  audit: ClinicalReportSourceFreezeMetadata;
  alreadyFrozen: boolean;
  resumedExisting: boolean;
};
