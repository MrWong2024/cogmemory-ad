import type { AssessmentOperatorRole } from '../schemas/assessment-visit.schema';
import type { ScaleInstanceListItemResponse } from './assessment-execution-response.types';

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

export type ScaleSubmissionIssueResponse = {
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

export type ScaleSubmissionReadinessSummaryResponse = {
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
  scaleInstance: ScaleInstanceListItemResponse;
  checkedAt: Date;
  ready: boolean;
  canSubmitNow: boolean;
  submissionState: ScaleSubmissionState;
  stateReason?: string;
  summary: ScaleSubmissionReadinessSummaryResponse;
  blockingIssues: ScaleSubmissionIssueResponse[];
  warnings: ScaleSubmissionIssueResponse[];
};

export type ScaleInstanceSubmissionOperatorResponse = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type ScaleInstanceSubmissionAuditResponse = {
  submissionId: string | null;
  submittedAt: Date;
  submittedBy: ScaleInstanceSubmissionOperatorResponse | null;
  alreadySubmitted: boolean;
  durationSource:
    | 'existing_instance_start'
    | 'earliest_item_timing'
    | 'unavailable';
};

export type SubmitScaleInstanceResponse = {
  scaleInstance: ScaleInstanceListItemResponse;
  submission: ScaleInstanceSubmissionAuditResponse;
  readiness: ScaleSubmissionReadinessResponse;
};
