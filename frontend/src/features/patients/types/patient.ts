export type PatientSourceType = 'clinical' | 'research';

export type PatientSex = 'male' | 'female' | 'other' | 'unknown';

export type PatientHandedness =
  | 'right'
  | 'left'
  | 'ambidextrous'
  | 'unknown';

export type PatientStatus = 'active' | 'inactive' | 'archived';

export type PatientListItem = {
  id: string;
  subjectCode: string;
  displayName?: string;
  sourceType: PatientSourceType;
  sex: PatientSex;
  birthDate: string | null;
  educationYears: number | null;
  handedness: PatientHandedness;
  status: PatientStatus;
  tags: string[];
};

export type PatientDetail = PatientListItem & {
  notes?: string;
};

export type PatientListResponse = {
  items: PatientListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type ListPatientsQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: PatientStatus;
  sourceType?: PatientSourceType;
};

export type CreatePatientRequest = {
  subjectCode: string;
  displayName?: string;
  sourceType?: PatientSourceType;
  sex?: PatientSex;
  birthDate?: string;
  educationYears?: number;
  handedness?: PatientHandedness;
  tags?: string[];
  notes?: string;
};

export type AssessmentVisitType =
  | 'baseline'
  | 'follow_up'
  | 'screening'
  | 'unscheduled'
  | 'other';

export type AssessmentVisitStatus =
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'locked'
  | 'voided';

export type AssessmentOperatorRole =
  | 'doctor'
  | 'nurse'
  | 'research_assistant'
  | 'admin'
  | 'unknown';

export type AssessmentVisitOperator = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type AssessmentVisit = {
  id: string;
  patientId: string;
  subjectCode: string;
  visitCode: string;
  visitType: AssessmentVisitType;
  status: AssessmentVisitStatus;
  assessmentDate: string;
  startedAt: string | null;
  completedAt: string | null;
  lockedAt: string | null;
  voidedAt: string | null;
  operatorSnapshot: AssessmentVisitOperator | null;
  notes?: string;
};

export type AssessmentVisitListResponse = {
  items: AssessmentVisit[];
  page: number;
  pageSize: number;
  total: number;
};

export type ListAssessmentVisitsQuery = {
  page?: number;
  pageSize?: number;
  status?: AssessmentVisitStatus;
  visitType?: AssessmentVisitType;
  dateFrom?: string;
  dateTo?: string;
};

export type CreateAssessmentVisitRequest = {
  visitCode: string;
  visitType?: AssessmentVisitType;
  assessmentDate: string;
  notes?: string;
};
