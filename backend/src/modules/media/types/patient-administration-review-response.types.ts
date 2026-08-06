import type {
  PatientAdministrationAdvanceBy,
  PatientAdministrationResponseMode,
} from '../../scales/schemas/scale-version.schema';
import type {
  PatientAdministrationCapturedBy,
  PatientAdministrationControlEventAction,
  PatientAdministrationEvidenceType,
  PatientAdministrationImpactFactorCode,
  PatientAdministrationStatus,
} from '../../assessments/patient-administration.constants';
import type { ItemResponseStatus } from '../../assessments/schemas/item-response.schema';
import type { PatientAdministrationOperatorResponse } from '../../assessments/types/patient-administration-response.types';
import type {
  MediaCaptureMode,
  MediaEvidenceStatus,
  MediaStorageStatus,
} from '../schemas/media-evidence.schema';
import type {
  MediaEvidenceAudioMetadataResponse,
  MediaEvidenceTranscriptionResponse,
} from './media-evidence-response.types';

export type PatientAdministrationReviewSessionResponse = {
  status: PatientAdministrationStatus;
  preparationConfirmedAt: Date | null;
  impactFactorCodes: PatientAdministrationImpactFactorCode[];
  impactFactorNote?: string;
  startedAt: Date | null;
  completedAt: Date | null;
  terminatedAt: Date | null;
  expiredAt: Date | null;
};

export type PatientAdministrationReviewEventResponse = {
  action: PatientAdministrationControlEventAction;
  occurredAt: Date;
  reason?: string;
  operatorSnapshot: PatientAdministrationOperatorResponse | null;
};

export type PatientAdministrationReviewCaptureResponse = {
  capturedBy: PatientAdministrationCapturedBy;
  staffObservation?: string;
  capturedAt: Date;
  invalidatedAt: Date | null;
  invalidatedReason?: string;
  operatorSnapshot: PatientAdministrationOperatorResponse | null;
};

export type PatientAdministrationReviewEvidenceResponse = {
  mediaEvidenceId: string;
  evidenceType: PatientAdministrationEvidenceType;
  captureMode: MediaCaptureMode;
  status: MediaEvidenceStatus;
  storageStatus: MediaStorageStatus;
  uploadedAt: Date;
  audioMetadata: MediaEvidenceAudioMetadataResponse | null;
  transcription: MediaEvidenceTranscriptionResponse | null;
};

export type PatientAdministrationReviewRunResponse = {
  stepRun: number;
  capture: PatientAdministrationReviewCaptureResponse | null;
  evidence: PatientAdministrationReviewEvidenceResponse[];
};

export type PatientAdministrationReviewStepResponse = {
  stepKey: string;
  order: number;
  responseMode: PatientAdministrationResponseMode;
  advanceBy: PatientAdministrationAdvanceBy;
  runs: PatientAdministrationReviewRunResponse[];
};

export type PatientAdministrationReviewItemResponse = {
  itemResponseId: string;
  itemCode: string;
  itemTitle: string;
  status: ItemResponseStatus;
  draftRevision: number;
  steps: PatientAdministrationReviewStepResponse[];
};

export type PatientAdministrationReviewResponse = {
  session: PatientAdministrationReviewSessionResponse;
  reviewEvents: PatientAdministrationReviewEventResponse[];
  items: PatientAdministrationReviewItemResponse[];
};
