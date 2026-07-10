import type {
  AssessmentOperatorRole,
  AssessmentVisit,
  AssessmentVisitStatus,
} from '@/src/features/patients/types/patient';

export type ScaleScoreRange = {
  min: number;
  max: number;
  step?: number;
};

export type ScaleCapabilities = {
  supportsPhotoUpload: boolean;
  supportsHandwriting: boolean;
  requiresTimer: boolean;
  supportsRawText: boolean;
  supportsOperatorNote: boolean;
};

export type AvailableScaleOption = {
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  category: string;
  version: string;
  displayVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
  totalScoreRange: ScaleScoreRange;
  groupCount: number;
  itemCount: number;
  capabilities: ScaleCapabilities;
};

export type AvailableScaleListResponse = {
  items: AvailableScaleOption[];
};

export type ScaleAdministrationMode =
  | 'clinician_administered'
  | 'supervised_patient_input'
  | 'paper_import';

export type ScaleInstanceVersionTrace = {
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ScaleInstanceOperator = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type ScaleInstanceProgress = {
  totalItemCount: number;
  answeredItemCount: number;
};

export type ScaleInstanceListItem = {
  id: string;
  assessmentVisitId: string;
  patientId: string;
  subjectCode: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  instanceNo: number;
  status: AssessmentVisitStatus;
  administrationMode: ScaleAdministrationMode;
  versionTrace: ScaleInstanceVersionTrace | null;
  startedAt: string | null;
  completedAt: string | null;
  lockedAt: string | null;
  voidedAt: string | null;
  durationMs: number | null;
  operatorSnapshot: ScaleInstanceOperator | null;
  progress: ScaleInstanceProgress;
};

export type AssessmentVisitExecutionDetailResponse = {
  visit: AssessmentVisit;
  scaleInstances: ScaleInstanceListItem[];
};

export type InitializeScaleInstanceRequest = {
  scaleCode: string;
  scaleVersion?: string;
  administrationMode?: ScaleAdministrationMode;
};

export type InitializeScaleInstanceResponse = {
  scale: {
    code: string;
    name: string;
    shortName?: string;
    version: string;
    displayVersion?: string;
  };
  scaleInstance: ScaleInstanceListItem;
  createdItemResponseCount: number;
};

