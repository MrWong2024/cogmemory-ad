import type { MediaEvidenceAccessAsset } from '../dto/media-evidence-access-query.dto';
import type {
  HandwritingInputTool,
  HandwritingTrajectoryFormat,
  MediaCaptureMode,
  MediaEvidenceStatus,
  MediaEvidenceType,
  MediaOperatorRole,
  MediaQualityStatus,
  MediaResponseType,
  MediaStorageStatus,
} from '../schemas/media-evidence.schema';
import type { ItemEvidenceStatus } from '../../assessments/schemas/item-response.schema';

export type MediaEvidenceFileResponse = {
  mimeType?: string;
  fileExtension?: string;
  sizeBytes: number | null;
  storedAt: Date | null;
};

export type MediaEvidenceImageMetadataResponse = {
  width: number | null;
  height: number | null;
  orientation?: string;
  pageNo: number | null;
  isColor: boolean | null;
  capturedAt: Date | null;
};

export type MediaEvidenceHandwritingTraceResponse = {
  hasTrajectory: boolean;
  trajectoryFormat: HandwritingTrajectoryFormat;
  strokeCount: number | null;
  durationMs: number | null;
  canvasWidth: number | null;
  canvasHeight: number | null;
  deviceType?: string;
  inputTool: HandwritingInputTool;
};

export type MediaEvidenceCaptureContextResponse = {
  capturedAt: Date | null;
  uploadedAt: Date | null;
  sourceDevice?: string;
  sourceApp?: string;
  captureNote?: string;
};

export type MediaEvidenceOperatorResponse = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: MediaOperatorRole;
};

export type MediaEvidenceResponse = {
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
  file: MediaEvidenceFileResponse | null;
  imageMetadata: MediaEvidenceImageMetadataResponse | null;
  handwritingTrace: MediaEvidenceHandwritingTraceResponse | null;
  captureContext: MediaEvidenceCaptureContextResponse | null;
  operatorSnapshot: MediaEvidenceOperatorResponse | null;
  qualityStatus: MediaQualityStatus;
  operatorNote?: string;
  description?: string;
  lockedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type MediaEvidenceListResponse = {
  items: MediaEvidenceResponse[];
};

export type EvidenceRequirementStateResponse = {
  evidenceType: Extract<MediaEvidenceType, 'photo' | 'handwriting'>;
  status: ItemEvidenceStatus;
  attached: boolean;
};

export type UploadMediaEvidenceResponse = {
  mediaEvidence: MediaEvidenceResponse;
  evidenceRequirement: EvidenceRequirementStateResponse;
};

export type MediaEvidenceAccessUrlResponse = {
  asset: MediaEvidenceAccessAsset;
  url: string;
  expiresAt: Date;
};

export type VoidMediaEvidenceResponse = {
  mediaEvidence: MediaEvidenceResponse;
  evidenceRequirement: EvidenceRequirementStateResponse;
};
