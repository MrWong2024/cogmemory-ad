import { frontendEnv } from '@/src/lib/env';

import type {
  PatientAdministrationControlInput,
  PatientAdministrationCredentialResponse,
  PatientAdministrationCurrentResponse,
  PatientAdministrationBinaryAsset,
  PatientAdministrationEntryCodeResponse,
  PatientAdministrationEvidenceUploadInput,
  PatientAdministrationEvidenceUploadResponse,
  PatientAdministrationPlayedAudio,
  PatientAdministrationPreparationInput,
  PatientAdministrationReviewResponse,
  PatientAdministrationRequiredReasonInput,
  PatientAdministrationRouteIds,
  PatientAdministrationSessionSummary,
  PatientAdministrationStaffCompleteInput,
  PatientAdministrationTakeoverInput,
} from '@/src/features/patient-administration/types/patient-administration';

export type PatientAdministrationApiErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'session_not_found'
  | 'session_conflict'
  | 'entry_invalid'
  | 'rate_limited'
  | 'step_invalid'
  | 'asset_not_allowed'
  | 'evidence_not_allowed'
  | 'media_invalid'
  | 'request_outcome_uncertain'
  | 'service_unavailable'
  | 'invalid_response'
  | 'unknown';

export class PatientAdministrationApiError extends Error {
  constructor(
    readonly kind: PatientAdministrationApiErrorKind,
    readonly status?: number,
    readonly backendCode?: string,
    readonly remainingSeconds?: number,
  ) {
    super(`Patient administration API request failed: ${kind}`);
    this.name = 'PatientAdministrationApiError';
  }
}

type ErrorBody = {
  code?: unknown;
  remainingSeconds?: unknown;
};

function buildApiUrl(path: string): string {
  return `${frontendEnv.apiBaseUrl.replace(/\/+$/, '')}${path}`;
}

function buildStaffRoot(ids: PatientAdministrationRouteIds): string {
  return `/patients/${encodeURIComponent(ids.patientId)}/visits/${encodeURIComponent(ids.visitId)}/scale-instances/${encodeURIComponent(ids.scaleInstanceId)}/patient-administration`;
}

async function readErrorBody(response: Response): Promise<ErrorBody> {
  try {
    const body = (await response.json()) as ErrorBody;
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

function mapError(response: Response, body: ErrorBody): PatientAdministrationApiError {
  const code = typeof body.code === 'string' ? body.code : undefined;
  const remainingSeconds =
    typeof body.remainingSeconds === 'number' &&
    Number.isFinite(body.remainingSeconds)
      ? Math.max(1, Math.ceil(body.remainingSeconds))
      : undefined;

  if (code === 'PATIENT_ADMINISTRATION_STEP_INVALID') {
    return new PatientAdministrationApiError('step_invalid', response.status, code);
  }
  if (code === 'PATIENT_ADMINISTRATION_ASSET_NOT_ALLOWED') {
    return new PatientAdministrationApiError(
      'asset_not_allowed',
      response.status,
      code,
    );
  }
  if (code === 'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED') {
    return new PatientAdministrationApiError(
      'evidence_not_allowed',
      response.status,
      code,
    );
  }
  if (
    code === 'MEDIA_FILE_EMPTY' ||
    code === 'MEDIA_FILE_TOO_LARGE' ||
    code === 'MEDIA_FILE_TYPE_NOT_ALLOWED' ||
    code === 'MEDIA_FILE_SIGNATURE_INVALID' ||
    code === 'MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED'
  ) {
    return new PatientAdministrationApiError('media_invalid', response.status, code);
  }

  if (response.status === 401) {
    return new PatientAdministrationApiError(
      code === 'PATIENT_ADMINISTRATION_ENTRY_INVALID'
        ? 'entry_invalid'
        : 'unauthenticated',
      response.status,
      code,
    );
  }
  if (response.status === 403) {
    return new PatientAdministrationApiError('forbidden', response.status, code);
  }
  if (response.status === 404 && code === 'PATIENT_ADMINISTRATION_SESSION_NOT_FOUND') {
    return new PatientAdministrationApiError('session_not_found', response.status, code);
  }
  if (response.status === 409) {
    return new PatientAdministrationApiError('session_conflict', response.status, code);
  }
  if (response.status === 429) {
    return new PatientAdministrationApiError(
      'rate_limited',
      response.status,
      code,
      remainingSeconds,
    );
  }
  if (response.status === 400) {
    return new PatientAdministrationApiError('validation', response.status, code);
  }
  return new PatientAdministrationApiError('unknown', response.status, code);
}

async function patientAdministrationFetch(
  path: string,
  init: RequestInit,
  uncertainWrite = false,
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
    if (response.ok) {
      return response;
    }

    const body = await readErrorBody(response);
    if (uncertainWrite && response.status >= 500) {
      throw new PatientAdministrationApiError(
        'request_outcome_uncertain',
        response.status,
        typeof body.code === 'string' ? body.code : undefined,
      );
    }
    throw mapError(response, body);
  } catch (error: unknown) {
    if (init.signal?.aborted || error instanceof PatientAdministrationApiError) {
      throw error;
    }
    throw new PatientAdministrationApiError(
      uncertainWrite ? 'request_outcome_uncertain' : 'service_unavailable',
    );
  }
}

async function readJson<T>(response: Response, uncertainWrite = false): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new PatientAdministrationApiError(
      uncertainWrite ? 'request_outcome_uncertain' : 'invalid_response',
      response.status,
    );
  }
}

async function readStaffSession(
  ids: PatientAdministrationRouteIds,
  suffix: string,
  init: RequestInit,
  uncertainWrite = false,
): Promise<PatientAdministrationSessionSummary> {
  const response = await patientAdministrationFetch(
    `${buildStaffRoot(ids)}${suffix}`,
    init,
    uncertainWrite,
  );
  return readJson<PatientAdministrationSessionSummary>(response, uncertainWrite);
}

function jsonPost(body: object): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function getPatientAdministrationSession(
  ids: PatientAdministrationRouteIds,
  signal?: AbortSignal,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(ids, '', { method: 'GET', signal });
}

export async function getPatientAdministrationReview(
  ids: PatientAdministrationRouteIds,
  signal?: AbortSignal,
): Promise<PatientAdministrationReviewResponse> {
  const response = await patientAdministrationFetch(
    `${buildStaffRoot(ids)}/review`,
    { method: 'GET', signal },
  );
  return readJson<PatientAdministrationReviewResponse>(response);
}

export async function createPatientAdministrationSession(
  ids: PatientAdministrationRouteIds,
): Promise<PatientAdministrationEntryCodeResponse> {
  const response = await patientAdministrationFetch(
    buildStaffRoot(ids),
    jsonPost({}),
    true,
  );
  return readJson<PatientAdministrationEntryCodeResponse>(response, true);
}

export function confirmPatientAdministrationPreparation(
  ids: PatientAdministrationRouteIds,
  input: PatientAdministrationPreparationInput,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(ids, '/preparation/confirm', jsonPost(input), true);
}

export function handoffPatientAdministration(
  ids: PatientAdministrationRouteIds,
  expectedRevision: number,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(ids, '/handoff', jsonPost({ expectedRevision }), true);
}

export function pausePatientAdministration(
  ids: PatientAdministrationRouteIds,
  input: PatientAdministrationControlInput,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(ids, '/pause', jsonPost(input), true);
}

export function resumePatientAdministration(
  ids: PatientAdministrationRouteIds,
  input: PatientAdministrationControlInput,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(ids, '/resume', jsonPost(input), true);
}

export async function reissuePatientAdministrationEntryCode(
  ids: PatientAdministrationRouteIds,
  input: PatientAdministrationRequiredReasonInput,
): Promise<PatientAdministrationEntryCodeResponse> {
  const response = await patientAdministrationFetch(
    `${buildStaffRoot(ids)}/entry-code/reissue`,
    jsonPost(input),
    true,
  );
  return readJson<PatientAdministrationEntryCodeResponse>(response, true);
}

export function terminatePatientAdministration(
  ids: PatientAdministrationRouteIds,
  input: PatientAdministrationRequiredReasonInput,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(ids, '/terminate', jsonPost(input), true);
}

export async function enterPatientAdministration(
  code: string,
): Promise<PatientAdministrationCredentialResponse> {
  const response = await patientAdministrationFetch(
    '/patient-administration/enter',
    jsonPost({ code }),
    true,
  );
  return readJson<PatientAdministrationCredentialResponse>(response, true);
}

export async function getCurrentPatientAdministration(
  signal?: AbortSignal,
): Promise<PatientAdministrationCurrentResponse> {
  const response = await patientAdministrationFetch('/patient-administration/current', {
    method: 'GET',
    signal,
  });
  return readJson<PatientAdministrationCurrentResponse>(response);
}

export async function completeCurrentPatientAdministrationStep(
  expectedRevision: number,
): Promise<PatientAdministrationCurrentResponse> {
  const response = await patientAdministrationFetch(
    '/patient-administration/current/complete',
    jsonPost({ expectedRevision }),
    true,
  );
  return readJson<PatientAdministrationCurrentResponse>(response, true);
}

export async function getCurrentPatientAdministrationAsset(
  assetKey: string,
  signal?: AbortSignal,
): Promise<PatientAdministrationBinaryAsset> {
  const response = await patientAdministrationFetch(
    `/patient-administration/current/assets/${encodeURIComponent(assetKey)}`,
    { method: 'GET', signal, headers: { Accept: 'image/*' } },
  );
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (!mimeType.startsWith('image/')) {
    throw new PatientAdministrationApiError('invalid_response', response.status);
  }
  try {
    return { blob: await response.blob(), mimeType };
  } catch {
    throw new PatientAdministrationApiError('invalid_response', response.status);
  }
}

export async function playCurrentPatientAdministrationAudio(
  assetKey: string,
  expectedRevision: number,
): Promise<PatientAdministrationPlayedAudio> {
  const response = await patientAdministrationFetch(
    `/patient-administration/current/audio/${encodeURIComponent(assetKey)}/play`,
    {
      ...jsonPost({ expectedRevision }),
      headers: {
        ...jsonPost({ expectedRevision }).headers,
        Accept: 'audio/*',
      },
    },
    true,
  );
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  const revisionHeader = response.headers.get(
    'x-patient-administration-revision',
  );
  const revision = revisionHeader === null ? Number.NaN : Number(revisionHeader);
  if (
    !mimeType.startsWith('audio/') ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    throw new PatientAdministrationApiError(
      'request_outcome_uncertain',
      response.status,
    );
  }
  try {
    return { blob: await response.blob(), mimeType, revision };
  } catch {
    throw new PatientAdministrationApiError(
      'request_outcome_uncertain',
      response.status,
    );
  }
}

function genericEvidenceFilename(file: Blob): string {
  switch (file.type.split(';')[0].toLowerCase()) {
    case 'audio/webm':
      return 'patient-response.webm';
    case 'audio/ogg':
      return 'patient-response.ogg';
    case 'audio/mp4':
      return 'patient-response.m4a';
    case 'audio/mpeg':
      return 'patient-response.mp3';
    case 'image/jpeg':
      return 'patient-evidence.jpg';
    case 'image/webp':
      return 'patient-evidence.webp';
    default:
      return 'patient-evidence.png';
  }
}

export async function uploadCurrentPatientAdministrationEvidence(
  input: PatientAdministrationEvidenceUploadInput,
): Promise<PatientAdministrationEvidenceUploadResponse> {
  const form = new FormData();
  form.append('file', input.file, genericEvidenceFilename(input.file));
  form.append('expectedRevision', input.expectedRevision.toString());
  form.append('evidenceType', input.evidenceType);
  if (input.capturedAt) form.append('capturedAt', input.capturedAt);
  if (input.evidenceType === 'audio' && input.durationMs !== undefined) {
    form.append('durationMs', input.durationMs.toString());
  }
  const response = await patientAdministrationFetch(
    '/patient-administration/current/evidence',
    { method: 'POST', body: form },
    true,
  );
  return readJson<PatientAdministrationEvidenceUploadResponse>(response, true);
}

export function completePatientAdministrationStaffStep(
  ids: PatientAdministrationRouteIds,
  input: PatientAdministrationStaffCompleteInput,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(ids, '/current/complete', jsonPost(input), true);
}

export function takeOverPatientAdministrationCurrentStep(
  ids: PatientAdministrationRouteIds,
  input: PatientAdministrationTakeoverInput,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(ids, '/current/takeover', jsonPost(input), true);
}

export function redoLastPatientAdministrationStep(
  ids: PatientAdministrationRouteIds,
  input: PatientAdministrationRequiredReasonInput,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(ids, '/redo-last', jsonPost(input), true);
}

export function authorizePatientAdministrationStimulusReplay(
  ids: PatientAdministrationRouteIds,
  assetKey: string,
  input: PatientAdministrationRequiredReasonInput,
): Promise<PatientAdministrationSessionSummary> {
  return readStaffSession(
    ids,
    `/current/audio/${encodeURIComponent(assetKey)}/replay-authorize`,
    jsonPost(input),
    true,
  );
}
