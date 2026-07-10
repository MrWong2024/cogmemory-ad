import type {
  AssessmentOperatorRole,
  AssessmentStatus,
  AssessmentVisitType,
} from '../schemas/assessment-visit.schema';

export type AssessmentVisitOperatorResponse = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type AssessmentVisitListItemResponse = {
  id: string;
  patientId: string;
  subjectCode: string;
  visitCode: string;
  visitType: AssessmentVisitType;
  status: AssessmentStatus;
  assessmentDate: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  operatorSnapshot: AssessmentVisitOperatorResponse | null;
  notes?: string;
};

export type AssessmentVisitDetailResponse = AssessmentVisitListItemResponse;

export type AssessmentVisitListResponse = {
  items: AssessmentVisitListItemResponse[];
  page: number;
  pageSize: number;
  total: number;
};
