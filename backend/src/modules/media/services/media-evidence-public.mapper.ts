import type { MediaEvidenceSummary } from './media-evidence.service';
import type {
  MediaEvidenceCaptureContextResponse,
  MediaEvidenceFileResponse,
  MediaEvidenceHandwritingTraceResponse,
  MediaEvidenceImageMetadataResponse,
  MediaEvidenceOperatorResponse,
  MediaEvidenceResponse,
} from '../types/media-evidence-response.types';

function finiteNumberOrNull(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapFile(
  evidence: MediaEvidenceSummary,
): MediaEvidenceFileResponse | null {
  if (!evidence.storage) {
    return null;
  }

  return {
    mimeType: evidence.storage.mimeType,
    fileExtension: evidence.storage.fileExtension,
    sizeBytes: finiteNumberOrNull(evidence.storage.sizeBytes),
    storedAt: evidence.storage.storedAt,
  };
}

function mapImageMetadata(
  evidence: MediaEvidenceSummary,
): MediaEvidenceImageMetadataResponse | null {
  if (!evidence.imageMetadata) {
    return null;
  }

  return {
    width: finiteNumberOrNull(evidence.imageMetadata.width),
    height: finiteNumberOrNull(evidence.imageMetadata.height),
    orientation: evidence.imageMetadata.orientation,
    pageNo: finiteNumberOrNull(evidence.imageMetadata.pageNo),
    isColor:
      typeof evidence.imageMetadata.isColor === 'boolean'
        ? evidence.imageMetadata.isColor
        : null,
    capturedAt: evidence.imageMetadata.capturedAt,
  };
}

function mapHandwritingTrace(
  evidence: MediaEvidenceSummary,
): MediaEvidenceHandwritingTraceResponse | null {
  if (!evidence.handwritingTrace) {
    return null;
  }

  return {
    hasTrajectory: evidence.handwritingTrace.hasTrajectory === true,
    trajectoryFormat: evidence.handwritingTrace.trajectoryFormat,
    strokeCount: finiteNumberOrNull(evidence.handwritingTrace.strokeCount),
    durationMs: finiteNumberOrNull(evidence.handwritingTrace.durationMs),
    canvasWidth: finiteNumberOrNull(evidence.handwritingTrace.canvasWidth),
    canvasHeight: finiteNumberOrNull(evidence.handwritingTrace.canvasHeight),
    deviceType: evidence.handwritingTrace.deviceType,
    inputTool: evidence.handwritingTrace.inputTool,
  };
}

function mapCaptureContext(
  evidence: MediaEvidenceSummary,
): MediaEvidenceCaptureContextResponse | null {
  if (!evidence.captureContext) {
    return null;
  }

  return {
    capturedAt: evidence.captureContext.capturedAt,
    uploadedAt: evidence.captureContext.uploadedAt,
    sourceDevice: evidence.captureContext.sourceDevice,
    sourceApp: evidence.captureContext.sourceApp,
    captureNote: evidence.captureContext.captureNote,
  };
}

function mapOperator(
  evidence: MediaEvidenceSummary,
): MediaEvidenceOperatorResponse | null {
  if (!evidence.operatorSnapshot) {
    return null;
  }

  return {
    operatorId: evidence.operatorSnapshot.operatorId,
    operatorName: evidence.operatorSnapshot.operatorName,
    operatorRole: evidence.operatorSnapshot.operatorRole,
  };
}

export function toMediaEvidenceResponse(
  evidence: MediaEvidenceSummary,
): MediaEvidenceResponse {
  return {
    id: evidence.id,
    evidenceCode: evidence.evidenceCode,
    evidenceType: evidence.evidenceType,
    captureMode: evidence.captureMode,
    status: evidence.status,
    storageStatus: evidence.storageStatus,
    itemCode: evidence.itemCode,
    crfCode: evidence.crfCode,
    itemTitle: evidence.itemTitle,
    responseType: evidence.responseType,
    file: mapFile(evidence),
    imageMetadata: mapImageMetadata(evidence),
    handwritingTrace: mapHandwritingTrace(evidence),
    captureContext: mapCaptureContext(evidence),
    operatorSnapshot: mapOperator(evidence),
    qualityStatus: evidence.qualityStatus,
    operatorNote: evidence.operatorNote,
    description: evidence.description,
    lockedAt: evidence.lockedAt,
    voidedAt: evidence.voidedAt,
    createdAt: evidence.createdAt,
    updatedAt: evidence.updatedAt,
  };
}
