import type {
  AssessmentOperatorRole,
  AssessmentStatus,
} from '../schemas/assessment-visit.schema';
import type { ScaleAdministrationMode } from '../schemas/scale-instance.schema';
import type { AssessmentVisitDetailResponse } from './assessment-visit-response.types';

export type ScaleInstanceVersionTraceResponse = {
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ScaleInstanceOperatorResponse = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type ScaleInstanceProgressResponse = {
  totalItemCount: number;
  answeredItemCount: number;
};

export type ScaleInstanceListItemResponse = {
  id: string;
  assessmentVisitId: string;
  patientId: string;
  subjectCode: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  instanceNo: number;
  status: AssessmentStatus;
  administrationMode: ScaleAdministrationMode;
  versionTrace: ScaleInstanceVersionTraceResponse | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  durationMs: number | null;
  operatorSnapshot: ScaleInstanceOperatorResponse | null;
  progress: ScaleInstanceProgressResponse;
};

export type AssessmentVisitExecutionDetailResponse = {
  visit: AssessmentVisitDetailResponse;
  scaleInstances: ScaleInstanceListItemResponse[];
};

export type InitializeScaleInstanceResponse = {
  scale: {
    code: string;
    name: string;
    shortName?: string;
    version: string;
    displayVersion?: string;
  };
  scaleInstance: ScaleInstanceListItemResponse;
  createdItemResponseCount: number;
};
