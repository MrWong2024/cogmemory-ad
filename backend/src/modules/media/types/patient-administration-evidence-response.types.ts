import type { PatientAdministrationEvidenceType } from '../../assessments/patient-administration.constants';

export type PatientAdministrationEvidenceResponse = {
  mediaEvidenceId: string;
  evidenceType: PatientAdministrationEvidenceType;
  revision: number;
  uploadedAt: Date;
};
