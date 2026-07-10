import { frontendEnv } from '@/src/lib/env';

import type {
  MediaEvidenceAccessAsset,
  MediaEvidenceAccessUrlResponse,
  MediaEvidenceListResponse,
  UploadMediaEvidenceInput,
  UploadMediaEvidenceResponse,
  VoidMediaEvidenceRequest,
  VoidMediaEvidenceResponse,
} from '@/src/features/assessments/types/media-evidence';

export type MediaEvidenceApiErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'patient_not_found'
  | 'patient_not_active'
  | 'visit_not_found'
  | 'visit_not_editable'
  | 'scale_instance_not_found'
  | 'scale_instance_not_editable'
  | 'item_response_not_found'
  | 'item_response_not_editable'
  | 'item_evidence_type_not_required'
  | 'media_primary_file_required'
  | 'media_file_empty'
  | 'media_file_too_large'
  | 'media_file_type_not_allowed'
  | 'media_file_signature_invalid'
  | 'media_file_embedded_metadata_not_allowed'
  | 'media_trajectory_invalid'
  | 'media_capture_mode_invalid'
  | 'media_evidence_already_attached'
  | 'media_evidence_not_found'
  | 'media_evidence_not_accessible'
  | 'media_evidence_not_voidable'
  | 'media_trajectory_not_found'
  | 'media_storage_unavailable'
  | 'media_evidence_create_failed'
  | 'media_evidence_attach_failed'
  | 'media_evidence_void_failed'
  | 'service_unavailable'
  | 'unknown';

export class MediaEvidenceApiError extends Error {
  constructor(
    readonly kind: MediaEvidenceApiErrorKind,
    readonly status?: number,
    readonly backendCode?: string,
  ) {
    super(`Media evidence API request failed: ${kind}`);
    this.name = 'MediaEvidenceApiError';
  }
}

type RequestOptions = {
  signal?: AbortSignal;
};

type BackendErrorBody = {
  code?: unknown;
};

const PHOTO_FILENAME = 'photo-evidence.jpg';
const HANDWRITING_FILENAME = 'handwriting-evidence.png';
const TRAJECTORY_FILENAME = 'handwriting-trajectory.json';

function buildApiUrl(path: string): string {
  return `${frontendEnv.apiBaseUrl.replace(/\/+$/, '')}${path}`;
}

async function readBackendCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as BackendErrorBody;
    return typeof body.code === 'string' ? body.code : undefined;
  } catch {
    return undefined;
  }
}

function mapHttpError(
  status: number,
  backendCode?: string,
): MediaEvidenceApiError {
  if (status === 401) {
    return new MediaEvidenceApiError('unauthenticated', status, backendCode);
  }

  if (status === 403) {
    return new MediaEvidenceApiError('forbidden', status, backendCode);
  }

  const businessKinds: Record<string, MediaEvidenceApiErrorKind> = {
    PATIENT_NOT_FOUND: 'patient_not_found',
    PATIENT_NOT_ACTIVE: 'patient_not_active',
    VISIT_NOT_FOUND: 'visit_not_found',
    VISIT_NOT_EDITABLE: 'visit_not_editable',
    SCALE_INSTANCE_NOT_FOUND: 'scale_instance_not_found',
    SCALE_INSTANCE_NOT_EDITABLE: 'scale_instance_not_editable',
    ITEM_RESPONSE_NOT_FOUND: 'item_response_not_found',
    ITEM_RESPONSE_NOT_EDITABLE: 'item_response_not_editable',
    ITEM_EVIDENCE_TYPE_NOT_REQUIRED: 'item_evidence_type_not_required',
    MEDIA_PRIMARY_FILE_REQUIRED: 'media_primary_file_required',
    MEDIA_FILE_EMPTY: 'media_file_empty',
    MEDIA_FILE_TOO_LARGE: 'media_file_too_large',
    MEDIA_FILE_TYPE_NOT_ALLOWED: 'media_file_type_not_allowed',
    MEDIA_FILE_SIGNATURE_INVALID: 'media_file_signature_invalid',
    MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED:
      'media_file_embedded_metadata_not_allowed',
    MEDIA_TRAJECTORY_INVALID: 'media_trajectory_invalid',
    MEDIA_CAPTURE_MODE_INVALID: 'media_capture_mode_invalid',
    MEDIA_EVIDENCE_ALREADY_ATTACHED: 'media_evidence_already_attached',
    MEDIA_EVIDENCE_NOT_FOUND: 'media_evidence_not_found',
    MEDIA_EVIDENCE_NOT_ACCESSIBLE: 'media_evidence_not_accessible',
    MEDIA_EVIDENCE_NOT_VOIDABLE: 'media_evidence_not_voidable',
    MEDIA_TRAJECTORY_NOT_FOUND: 'media_trajectory_not_found',
    MEDIA_STORAGE_UNAVAILABLE: 'media_storage_unavailable',
    MEDIA_EVIDENCE_CREATE_FAILED: 'media_evidence_create_failed',
    MEDIA_EVIDENCE_ATTACH_FAILED: 'media_evidence_attach_failed',
    MEDIA_EVIDENCE_VOID_FAILED: 'media_evidence_void_failed',
  };

  if (backendCode && businessKinds[backendCode]) {
    return new MediaEvidenceApiError(
      businessKinds[backendCode],
      status,
      backendCode,
    );
  }

  if (status === 400) {
    return new MediaEvidenceApiError('validation', status, backendCode);
  }

  if (status === 413) {
    return new MediaEvidenceApiError(
      'media_file_too_large',
      status,
      backendCode,
    );
  }

  if (status === 503) {
    return new MediaEvidenceApiError(
      'media_storage_unavailable',
      status,
      backendCode,
    );
  }

  return new MediaEvidenceApiError('unknown', status, backendCode);
}

async function mediaEvidenceFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  try {
    const response = await fetch(buildApiUrl(path), {
      ...init,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw mapHttpError(response.status, await readBackendCode(response));
    }

    return response;
  } catch (error: unknown) {
    if (error instanceof MediaEvidenceApiError || init.signal?.aborted) {
      throw error;
    }

    throw new MediaEvidenceApiError('service_unavailable');
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new MediaEvidenceApiError('unknown', response.status);
  }
}

function buildItemMediaPath(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  itemResponseId: string,
): string {
  return `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances/${encodeURIComponent(scaleInstanceId)}/item-responses/${encodeURIComponent(itemResponseId)}/media-evidences`;
}

function appendOptionalText(
  formData: FormData,
  name: string,
  value: string | undefined,
) {
  const normalized = value?.trim();

  if (normalized) {
    formData.append(name, normalized);
  }
}

function appendOptionalNumber(
  formData: FormData,
  name: string,
  value: number | undefined,
) {
  if (value === undefined) {
    return;
  }

  if (!Number.isFinite(value)) {
    throw new MediaEvidenceApiError('validation');
  }

  formData.append(name, String(value));
}

function appendOptionalBoolean(
  formData: FormData,
  name: string,
  value: boolean | undefined,
) {
  if (value !== undefined) {
    formData.append(name, value ? 'true' : 'false');
  }
}

function buildUploadFormData(input: UploadMediaEvidenceInput): FormData {
  const formData = new FormData();
  formData.append('evidenceType', input.evidenceType);
  formData.append('captureMode', input.captureMode);
  formData.append(
    'file',
    input.file,
    input.evidenceType === 'photo'
      ? PHOTO_FILENAME
      : HANDWRITING_FILENAME,
  );

  if (input.trajectory) {
    formData.append('trajectory', input.trajectory, TRAJECTORY_FILENAME);
  }

  appendOptionalText(formData, 'capturedAt', input.capturedAt);
  appendOptionalText(formData, 'sourceDevice', input.sourceDevice);
  appendOptionalText(formData, 'sourceApp', input.sourceApp);
  appendOptionalText(formData, 'captureNote', input.captureNote);
  appendOptionalText(formData, 'description', input.description);
  appendOptionalText(formData, 'operatorNote', input.operatorNote);
  appendOptionalNumber(formData, 'imageWidth', input.imageWidth);
  appendOptionalNumber(formData, 'imageHeight', input.imageHeight);
  appendOptionalText(formData, 'orientation', input.orientation);
  appendOptionalNumber(formData, 'pageNo', input.pageNo);
  appendOptionalBoolean(formData, 'isColor', input.isColor);
  appendOptionalText(formData, 'trajectoryFormat', input.trajectoryFormat);
  appendOptionalNumber(formData, 'strokeCount', input.strokeCount);
  appendOptionalNumber(
    formData,
    'trajectoryDurationMs',
    input.trajectoryDurationMs,
  );
  appendOptionalNumber(formData, 'canvasWidth', input.canvasWidth);
  appendOptionalNumber(formData, 'canvasHeight', input.canvasHeight);
  appendOptionalText(formData, 'deviceType', input.deviceType);
  appendOptionalText(formData, 'inputTool', input.inputTool);

  return formData;
}

export async function listItemMediaEvidences(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  itemResponseId: string,
  options: RequestOptions = {},
): Promise<MediaEvidenceListResponse> {
  const response = await mediaEvidenceFetch(
    buildItemMediaPath(patientId, visitId, scaleInstanceId, itemResponseId),
    { method: 'GET', signal: options.signal },
  );

  return readJson<MediaEvidenceListResponse>(response);
}

export async function uploadItemMediaEvidence(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  itemResponseId: string,
  input: UploadMediaEvidenceInput,
): Promise<UploadMediaEvidenceResponse> {
  const response = await mediaEvidenceFetch(
    buildItemMediaPath(patientId, visitId, scaleInstanceId, itemResponseId),
    {
      method: 'POST',
      body: buildUploadFormData(input),
    },
  );

  return readJson<UploadMediaEvidenceResponse>(response);
}

export async function getMediaEvidenceAccessUrl(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  itemResponseId: string,
  mediaEvidenceId: string,
  asset: MediaEvidenceAccessAsset,
  options: RequestOptions = {},
): Promise<MediaEvidenceAccessUrlResponse> {
  const path = buildItemMediaPath(
    patientId,
    visitId,
    scaleInstanceId,
    itemResponseId,
  );
  const response = await mediaEvidenceFetch(
    `${path}/${encodeURIComponent(mediaEvidenceId)}/access-url?asset=${encodeURIComponent(asset)}`,
    { method: 'GET', signal: options.signal },
  );

  return readJson<MediaEvidenceAccessUrlResponse>(response);
}

export async function voidItemMediaEvidence(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  itemResponseId: string,
  mediaEvidenceId: string,
  reason: string,
): Promise<VoidMediaEvidenceResponse> {
  const requestBody: VoidMediaEvidenceRequest = { reason: reason.trim() };
  const path = buildItemMediaPath(
    patientId,
    visitId,
    scaleInstanceId,
    itemResponseId,
  );
  const response = await mediaEvidenceFetch(
    `${path}/${encodeURIComponent(mediaEvidenceId)}/void`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );

  return readJson<VoidMediaEvidenceResponse>(response);
}
