import type { ScaleInstanceListItem } from '@/src/features/assessments/types/assessment-execution';
import type { AssessmentOperatorRole } from '@/src/features/patients/types/patient';

export type ScaleSubmissionIssueSeverity = 'blocking' | 'warning';

export type ScaleSubmissionIssueScope = 'scale_instance' | 'item';

export type ScaleSubmissionIssueCode =
  | 'SCALE_INSTANCE_ITEM_SET_MISMATCH'
  | 'SCALE_INSTANCE_DURATION_UNAVAILABLE'
  | 'SCALE_INSTANCE_START_TIME_INVALID'
  | 'ITEM_NOT_COMPLETED'
  | 'ITEM_ANSWER_CONTENT_MISSING'
  | 'ITEM_MISSING_REASON_REQUIRED'
  | 'ITEM_STALE_MISSING_REASON'
  | 'ITEM_REQUIRED_STEP_MISSING'
  | 'ITEM_REQUIRED_TIMING_MISSING'
  | 'ITEM_INVALID_TIMING'
  | 'ITEM_TIMING_POINTS_INCOMPLETE'
  | 'ITEM_REQUIRED_MEDIA_MISSING'
  | 'ITEM_EVIDENCE_REFERENCE_INCONSISTENT'
  | 'ITEM_EVIDENCE_REQUIREMENT_CONFIGURATION_MISMATCH'
  | 'ITEM_REQUIRED_OPERATOR_NOTE_MISSING';

export type ScaleSubmissionIssue = {
  code: ScaleSubmissionIssueCode;
  severity: ScaleSubmissionIssueSeverity;
  scope: ScaleSubmissionIssueScope;
  itemResponseId?: string;
  itemCode?: string;
  crfCode?: string;
  itemTitle?: string;
  itemOrder?: number;
  groupCode?: string;
  missingItemCodes?: string[];
  unexpectedItemCodes?: string[];
  missingStepCodes?: string[];
  requiredEvidenceMode?: 'one_of' | 'all';
  requiredEvidenceTypes?: Array<'photo' | 'handwriting'>;
  message: string;
};

export type ScaleSubmissionReadinessSummary = {
  expectedItemCount: number;
  actualItemCount: number;
  completedItemCount: number;
  incompleteItemCount: number;
  missingItemCount: number;
  requiredMediaItemCount: number;
  satisfiedMediaItemCount: number;
  blockingIssueCount: number;
  warningCount: number;
};

export type ScaleSubmissionState =
  | 'editable'
  | 'incomplete'
  | 'ready'
  | 'completed'
  | 'locked'
  | 'voided'
  | 'patient_inactive'
  | 'visit_not_editable';

export type ScaleSubmissionReadinessResponse = {
  scaleInstance: ScaleInstanceListItem;
  checkedAt: string;
  ready: boolean;
  canSubmitNow: boolean;
  submissionState: ScaleSubmissionState;
  stateReason?: string;
  summary: ScaleSubmissionReadinessSummary;
  blockingIssues: ScaleSubmissionIssue[];
  warnings: ScaleSubmissionIssue[];
};

export type ScaleInstanceSubmissionOperator = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type ScaleInstanceSubmissionDurationSource =
  | 'existing_instance_start'
  | 'earliest_item_timing'
  | 'unavailable';

export type ScaleInstanceSubmissionAudit = {
  submissionId: string | null;
  submittedAt: string;
  submittedBy: ScaleInstanceSubmissionOperator | null;
  alreadySubmitted: boolean;
  durationSource: ScaleInstanceSubmissionDurationSource;
};

export type SubmitScaleInstanceRequest = {
  confirm: true;
};

export type SubmitScaleInstanceResponse = {
  scaleInstance: ScaleInstanceListItem;
  submission: ScaleInstanceSubmissionAudit;
  readiness: ScaleSubmissionReadinessResponse;
};
