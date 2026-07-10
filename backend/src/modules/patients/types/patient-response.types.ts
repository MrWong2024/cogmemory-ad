import type {
  PatientHandedness,
  PatientSex,
  PatientSourceType,
  PatientStatus,
} from '../schemas/patient.schema';

export type PatientListItemResponse = {
  id: string;
  subjectCode: string;
  displayName?: string;
  sourceType: PatientSourceType;
  sex: PatientSex;
  birthDate: Date | null;
  educationYears: number | null;
  handedness: PatientHandedness;
  status: PatientStatus;
  tags: string[];
};

export type PatientDetailResponse = PatientListItemResponse & {
  notes?: string;
};

export type PatientListResponse = {
  items: PatientListItemResponse[];
  page: number;
  pageSize: number;
  total: number;
};
