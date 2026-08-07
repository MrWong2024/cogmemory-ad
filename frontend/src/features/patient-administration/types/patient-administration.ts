export type PatientAdministrationStatus =
  | 'prepared'
  | 'active'
  | 'paused'
  | 'completed'
  | 'terminated'
  | 'expired';

export type PatientAdministrationResponseMode =
  | 'speech'
  | 'writing'
  | 'drawing'
  | 'staff_observation';

export type PatientAdministrationAdvanceBy = 'patient' | 'staff';

export type PatientAdministrationAssetKind = 'audio' | 'image';

export type PatientAdministrationEvidenceType =
  | 'audio'
  | 'photo'
  | 'handwriting';

export type PatientAdministrationImpactFactorCode =
  | 'sensory'
  | 'upper_limb'
  | 'language_culture_education'
  | 'instruction_comprehension'
  | 'fatigue_emotion_refusal'
  | 'environment'
  | 'device_network'
  | 'other';

export type PatientAdministrationOperator = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: 'doctor' | 'nurse' | 'research_assistant' | 'admin';
};

export type PatientAdministrationSessionSummary = {
  id: string;
  status: PatientAdministrationStatus;
  currentStepKey: string;
  revision: number;
  expiresAt: string;
  entryCodeExpiresAt: string | null;
  hasPatientCredential: boolean;
  preparationConfirmedAt: string | null;
  preparationConfirmedBy: PatientAdministrationOperator | null;
  impactFactorCodes: PatientAdministrationImpactFactorCode[];
  impactFactorNote?: string;
  createdBy: PatientAdministrationOperator;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  terminatedAt: string | null;
  expiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatientAdministrationEntryCodeResponse =
  PatientAdministrationSessionSummary & {
    entryCode: string;
    entryCodeExpiresAt: string;
  };

export type PatientAdministrationCredentialResponse = {
  status: PatientAdministrationStatus;
  revision: number;
  expiresAt: string;
};

export type PatientAdministrationCurrentStep = {
  stepKey: string;
  order: number;
  patientText?: string;
  responseMode: PatientAdministrationResponseMode;
  advanceBy: PatientAdministrationAdvanceBy;
  assets: Array<{
    assetKey: string;
    kind: PatientAdministrationAssetKind;
    role: 'guidance' | 'stimulus' | null;
    mimeType: string;
    technicalReplayAuthorized: boolean;
  }>;
};

export type PatientAdministrationCurrentResponse = {
  status: PatientAdministrationStatus;
  revision: number;
  expiresAt: string;
  currentStep: PatientAdministrationCurrentStep | null;
};

export type PatientAdministrationRouteIds = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
};

export type PatientAdministrationPreparationInput = {
  expectedRevision: number;
  impactFactorCodes: PatientAdministrationImpactFactorCode[];
  impactFactorNote?: string;
};

export type PatientAdministrationControlInput = {
  expectedRevision: number;
  reason?: string;
};

export type PatientAdministrationRequiredReasonInput = {
  expectedRevision: number;
  reason: string;
};

export type PatientAdministrationStaffCompleteInput = {
  expectedRevision: number;
  staffObservation: string;
};

export type PatientAdministrationTakeoverInput = {
  expectedRevision: number;
  reason: string;
  staffObservation: string;
};

export type PatientAdministrationEvidenceUploadInput = {
  file: Blob;
  expectedRevision: number;
  evidenceType: PatientAdministrationEvidenceType;
  capturedAt?: string;
  durationMs?: number;
};

export type PatientAdministrationEvidenceUploadResponse = {
  mediaEvidenceId: string;
  evidenceType: PatientAdministrationEvidenceType;
  revision: number;
  uploadedAt: string;
};

export type PatientAdministrationBinaryAsset = {
  blob: Blob;
  mimeType: string;
};

export type PatientAdministrationPlayedAudio = PatientAdministrationBinaryAsset & {
  revision: number;
};
