import type {
  ClinicalReportMetadata,
  ReportOperatorRole,
} from '../schemas/clinical-report.schema';
import type { ReportNarrativeSummary } from '../services/reports.service';

export const CLINICAL_REPORT_EDITABLE_FIELDS = [
  'doctorOpinion',
  'recommendationText',
] as const;
export type ClinicalReportEditableField =
  (typeof CLINICAL_REPORT_EDITABLE_FIELDS)[number];

export type ClinicalReportWorkflowActor = {
  operatorId: string;
  operatorName: string;
  operatorRole: ReportOperatorRole;
};

export type ClinicalReportEditValues = Partial<
  Record<ClinicalReportEditableField, string | null>
>;

export type ClinicalReportEditAuditEvent = {
  eventId: string;
  editedAt: Date;
  editedBy: string;
  editedByName: string;
  editedByRole: ReportOperatorRole;
  changedFields: ClinicalReportEditableField[];
  previousValues: ClinicalReportEditValues;
  nextValues: ClinicalReportEditValues;
  editNote: string;
};

export type ClinicalReportEditsMetadata = {
  version: 1;
  events: ClinicalReportEditAuditEvent[];
  lastEditedAt: Date;
  lastEditedBy: string;
};

export type ClinicalReportSubmissionMetadata = {
  version: 1;
  submissionId: string;
  submittedAt: Date;
  submittedBy: string;
  submittedByName: string;
  submittedByRole: ReportOperatorRole;
  submissionNote: string;
};

export type ClinicalReportConfirmationMetadata = {
  version: 1;
  confirmationId: string;
  confirmedAt: Date;
  confirmedBy: string;
  confirmedByName: string;
  confirmedByRole: Extract<ReportOperatorRole, 'doctor' | 'admin'>;
  confirmationNote: string;
};

export type ClinicalReportDraftEditUpdate = {
  narrative: ReportNarrativeSummary;
  metadata: Exclude<ClinicalReportMetadata, null>;
  event: ClinicalReportEditAuditEvent;
};
