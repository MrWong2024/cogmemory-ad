import type {
  ClinicalReportQualityStatus,
  ClinicalReportSource,
  ClinicalReportStatus,
  ClinicalReportType,
} from '@/src/features/assessments/types/clinical-report';

export type ListClinicalReportVersionsQuery = {
  page?: number;
  pageSize?: number;
};

export type ClinicalReportVersionRelationship = {
  reportCode: string;
  reportVersion: number;
};

export type ClinicalReportVersionListItem = {
  id: string;
  reportCode: string;
  reportVersion: number;
  reportType: ClinicalReportType;
  status: ClinicalReportStatus;
  source: ClinicalReportSource;
  qualityStatus: ClinicalReportQualityStatus;
  isFinal: boolean;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  lockedAt: string | null;
  sourceFreezeStatus: 'none' | 'in_progress' | 'completed';
  sourceFreezeCompletedAt: string | null;
  archivedAt: string | null;
  correctedAt: string | null;
  voidedAt: string | null;
  correctionNo: number | null;
  correctionReason: string | null;
  changeSummary: string | null;
  previous: ClinicalReportVersionRelationship | null;
  replacement: ClinicalReportVersionRelationship | null;
  isLatestVersion: boolean;
};

export type ClinicalReportVersionListResponse = {
  items: ClinicalReportVersionListItem[];
  page: number;
  pageSize: number;
  total: number;
  lineage: {
    status: 'valid';
    firstVersion: number;
    latestVersion: number;
    totalVersions: number;
  };
};
