import type {
  ClinicalReportSource,
  ClinicalReportStatus,
  ClinicalReportType,
  ReportQualityStatus,
} from '../schemas/clinical-report.schema';

export type ClinicalReportVersionRelationshipResponse = {
  reportCode: string;
  reportVersion: number;
};

export type ClinicalReportVersionListItemResponse = {
  id: string;
  reportCode: string;
  reportVersion: number;
  reportType: ClinicalReportType;
  status: ClinicalReportStatus;
  source: ClinicalReportSource;
  qualityStatus: ReportQualityStatus;
  isFinal: boolean;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  lockedAt: Date | null;
  sourceFreezeStatus: 'none' | 'in_progress' | 'completed';
  sourceFreezeCompletedAt: Date | null;
  archivedAt: Date | null;
  correctedAt: Date | null;
  voidedAt: Date | null;
  correctionNo: number | null;
  correctionReason: string | null;
  changeSummary: string | null;
  previous: ClinicalReportVersionRelationshipResponse | null;
  replacement: ClinicalReportVersionRelationshipResponse | null;
  isLatestVersion: boolean;
};

export type ClinicalReportVersionListResponse = {
  items: ClinicalReportVersionListItemResponse[];
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
