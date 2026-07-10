import type { ItemEvidenceStatus } from '@/src/features/assessments/types/item-response-execution';

export type SupportedMediaEvidenceType = 'photo' | 'handwriting';

export type MediaEvidenceType =
  | SupportedMediaEvidenceType
  | 'document_scan'
  | 'audio'
  | 'raw_text_snapshot'
  | 'other';

export type MediaCaptureMode =
  | 'photo_upload'
  | 'tablet_handwriting'
  | 'paper_scan'
  | 'system_generated'
  | 'imported'
  | 'other';

export type UploadMediaCaptureMode =
  | 'photo_upload'
  | 'paper_scan'
  | 'tablet_handwriting';

export type MediaEvidenceStatus =
  | 'pending'
  | 'attached'
  | 'locked'
  | 'voided'
  | 'deleted';

export type MediaStorageStatus =
  | 'pending'
  | 'stored'
  | 'missing'
  | 'deleted';

export type MediaQualityStatus =
  | 'unchecked'
  | 'acceptable'
  | 'needs_review'
  | 'unusable';

export type HandwritingTrajectoryFormat =
  | 'json'
  | 'svg'
  | 'strokes'
  | 'unknown';

export type UploadHandwritingTrajectoryFormat = 'json' | 'strokes';

export type HandwritingInputTool =
  | 'stylus'
  | 'finger'
  | 'mouse'
  | 'unknown';

export type MediaOperatorRole =
  | 'doctor'
  | 'nurse'
  | 'research_assistant'
  | 'admin'
  | 'unknown';

export type MediaResponseType =
  | 'boolean'
  | 'single_choice'
  | 'multi_choice'
  | 'number'
  | 'text'
  | 'drawing'
  | 'photo_upload'
  | 'handwriting'
  | 'timed_task'
  | 'multi_step_calculation';

export type MediaEvidenceFile = {
  mimeType?: string;
  fileExtension?: string;
  sizeBytes: number | null;
  storedAt: string | null;
};

export type MediaEvidenceImageMetadata = {
  width: number | null;
  height: number | null;
  orientation?: string;
  pageNo: number | null;
  isColor: boolean | null;
  capturedAt: string | null;
};

export type MediaEvidenceHandwritingTrace = {
  hasTrajectory: boolean;
  trajectoryFormat: HandwritingTrajectoryFormat;
  strokeCount: number | null;
  durationMs: number | null;
  canvasWidth: number | null;
  canvasHeight: number | null;
  deviceType?: string;
  inputTool: HandwritingInputTool;
};

export type MediaEvidenceCaptureContext = {
  capturedAt: string | null;
  uploadedAt: string | null;
  sourceDevice?: string;
  sourceApp?: string;
  captureNote?: string;
};

export type MediaEvidenceOperator = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: MediaOperatorRole;
};

export type MediaEvidence = {
  id: string;
  evidenceCode: string;
  evidenceType: MediaEvidenceType;
  captureMode: MediaCaptureMode;
  status: MediaEvidenceStatus;
  storageStatus: MediaStorageStatus;
  itemCode: string;
  crfCode?: string;
  itemTitle?: string;
  responseType?: MediaResponseType;
  file: MediaEvidenceFile | null;
  imageMetadata: MediaEvidenceImageMetadata | null;
  handwritingTrace: MediaEvidenceHandwritingTrace | null;
  captureContext: MediaEvidenceCaptureContext | null;
  operatorSnapshot: MediaEvidenceOperator | null;
  qualityStatus: MediaQualityStatus;
  operatorNote?: string;
  description?: string;
  lockedAt: string | null;
  voidedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MediaEvidenceListResponse = {
  items: MediaEvidence[];
};

export type EvidenceRequirementState = {
  evidenceType: SupportedMediaEvidenceType;
  status: ItemEvidenceStatus;
  attached: boolean;
};

export type UploadMediaEvidenceResponse = {
  mediaEvidence: MediaEvidence;
  evidenceRequirement: EvidenceRequirementState;
};

export type MediaEvidenceAccessAsset = 'primary' | 'trajectory';

export type MediaEvidenceAccessUrlResponse = {
  asset: MediaEvidenceAccessAsset;
  url: string;
  expiresAt: string;
};

export type VoidMediaEvidenceRequest = {
  reason: string;
};

export type VoidMediaEvidenceResponse = {
  mediaEvidence: MediaEvidence;
  evidenceRequirement: EvidenceRequirementState;
};

export type UploadMediaEvidenceInput = {
  evidenceType: SupportedMediaEvidenceType;
  captureMode: UploadMediaCaptureMode;
  file: Blob;
  trajectory?: Blob;
  capturedAt?: string;
  sourceDevice?: string;
  sourceApp?: string;
  captureNote?: string;
  description?: string;
  operatorNote?: string;
  imageWidth?: number;
  imageHeight?: number;
  orientation?: string;
  pageNo?: number;
  isColor?: boolean;
  trajectoryFormat?: UploadHandwritingTrajectoryFormat;
  strokeCount?: number;
  trajectoryDurationMs?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  deviceType?: string;
  inputTool?: HandwritingInputTool;
};
