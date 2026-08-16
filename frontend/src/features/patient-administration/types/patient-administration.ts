export type PatientAdministrationStatus =
  | 'prepared'
  | 'active'
  | 'paused'
  | 'completed'
  | 'terminated'
  | 'expired';

export type PatientAdministrationDeviceMode =
  | 'same_device'
  | 'cross_device';

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
  deviceMode: PatientAdministrationDeviceMode | null;
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

export type PatientAdministrationCreateInput = {
  deviceMode: PatientAdministrationDeviceMode;
};

export type PatientAdministrationSessionCreateResponse =
  PatientAdministrationSessionSummary & {
    entryCode: string | null;
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

export type PatientAdministrationControlEventAction =
  | 'entry_redeemed'
  | 'same_device_handoff'
  | 'preparation_confirmed'
  | 'paused'
  | 'resumed'
  | 'device_reissued'
  | 'terminated'
  | 'expired'
  | 'staff_takeover'
  | 'step_redo';

export type PatientAdministrationReviewTranscription = {
  status: 'not_requested' | 'processing' | 'succeeded' | 'failed';
  text?: string;
  errorCode?:
    | 'duration_unsupported'
    | 'storage_unavailable'
    | 'timeout'
    | 'provider_unavailable'
    | 'provider_rejected'
    | 'invalid_response';
  provider?: 'stub' | 'bailian';
  model?: string;
  requestedAt: string | null;
  completedAt: string | null;
  requestedBy: {
    operatorId: string | null;
    operatorName?: string;
    operatorRole?:
      | 'doctor'
      | 'nurse'
      | 'research_assistant'
      | 'admin'
      | 'unknown';
  } | null;
};

export type PatientAdministrationReviewEvidence = {
  mediaEvidenceId: string;
  evidenceType: PatientAdministrationEvidenceType;
  captureMode:
    | 'photo_upload'
    | 'tablet_handwriting'
    | 'paper_scan'
    | 'browser_audio_recording'
    | 'system_generated'
    | 'imported'
    | 'other';
  status: 'pending' | 'attached' | 'locked' | 'voided' | 'deleted';
  storageStatus: 'pending' | 'stored' | 'missing' | 'deleted';
  uploadedAt: string;
  audioMetadata: { durationMs: number | null } | null;
  transcription: PatientAdministrationReviewTranscription | null;
};

export type PatientAdministrationReviewCapture = {
  capturedBy: 'patient' | 'staff';
  staffObservation?: string;
  capturedAt: string;
  invalidatedAt: string | null;
  invalidatedReason?: string;
  operatorSnapshot: PatientAdministrationOperator | null;
};

export type PatientAdministrationReviewRun = {
  stepRun: number;
  capture: PatientAdministrationReviewCapture | null;
  evidence: PatientAdministrationReviewEvidence[];
};

export type PatientAdministrationReviewStep = {
  stepKey: string;
  order: number;
  responseMode: PatientAdministrationResponseMode;
  advanceBy: PatientAdministrationAdvanceBy;
  runs: PatientAdministrationReviewRun[];
};

export type PatientAdministrationReviewItem = {
  itemResponseId: string;
  itemCode: string;
  itemTitle: string;
  status:
    | 'not_started'
    | 'in_progress'
    | 'answered'
    | 'scored'
    | 'locked'
    | 'voided';
  draftRevision: number;
  steps: PatientAdministrationReviewStep[];
};

export type PatientAdministrationReviewResponse = {
  session: {
    status: PatientAdministrationStatus;
    preparationConfirmedAt: string | null;
    impactFactorCodes: PatientAdministrationImpactFactorCode[];
    impactFactorNote?: string;
    startedAt: string | null;
    completedAt: string | null;
    terminatedAt: string | null;
    expiredAt: string | null;
  };
  reviewEvents: Array<{
    action: PatientAdministrationControlEventAction;
    occurredAt: string;
    reason?: string;
    operatorSnapshot: PatientAdministrationOperator | null;
  }>;
  items: PatientAdministrationReviewItem[];
};
