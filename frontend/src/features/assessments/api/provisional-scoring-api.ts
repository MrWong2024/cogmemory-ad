import { frontendEnv } from '@/src/lib/env';

import type {
  ComputeScoreResultRequest,
  ComputeScoreResultResponse,
  ScoreResultDetailResponse,
} from '@/src/features/assessments/types/provisional-scoring';

export type ProvisionalScoringApiErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'patient_not_found'
  | 'patient_not_active'
  | 'visit_not_found'
  | 'visit_not_editable'
  | 'scale_instance_not_found'
  | 'scale_instance_configuration_unavailable'
  | 'score_computation_confirmation_required'
  | 'score_instance_not_computable'
  | 'score_input_invalid'
  | 'score_result_not_found'
  | 'score_result_incomplete'
  | 'score_result_voided'
  | 'score_computation_conflict'
  | 'score_computation_failed'
  | 'service_unavailable'
  | 'unknown';

export class ProvisionalScoringApiError extends Error {
  constructor(
    readonly kind: ProvisionalScoringApiErrorKind,
    readonly status?: number,
    readonly backendCode?: string,
  ) {
    super(`Provisional scoring API request failed: ${kind}`);
    this.name = 'ProvisionalScoringApiError';
  }
}

type RequestOptions = {
  signal?: AbortSignal;
};

type BackendErrorBody = {
  code?: unknown;
};

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
): ProvisionalScoringApiError {
  if (status === 401) {
    return new ProvisionalScoringApiError(
      'unauthenticated',
      status,
      backendCode,
    );
  }

  if (status === 403) {
    return new ProvisionalScoringApiError('forbidden', status, backendCode);
  }

  const businessKinds: Record<string, ProvisionalScoringApiErrorKind> = {
    PATIENT_NOT_FOUND: 'patient_not_found',
    PATIENT_NOT_ACTIVE: 'patient_not_active',
    VISIT_NOT_FOUND: 'visit_not_found',
    VISIT_NOT_EDITABLE: 'visit_not_editable',
    SCALE_INSTANCE_NOT_FOUND: 'scale_instance_not_found',
    SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE:
      'scale_instance_configuration_unavailable',
    SCORE_COMPUTATION_CONFIRMATION_REQUIRED:
      'score_computation_confirmation_required',
    SCORE_INSTANCE_NOT_COMPUTABLE: 'score_instance_not_computable',
    SCORE_INPUT_INVALID: 'score_input_invalid',
    SCORE_RESULT_NOT_FOUND: 'score_result_not_found',
    SCORE_RESULT_INCOMPLETE: 'score_result_incomplete',
    SCORE_RESULT_VOIDED: 'score_result_voided',
    SCORE_COMPUTATION_CONFLICT: 'score_computation_conflict',
    SCORE_COMPUTATION_FAILED: 'score_computation_failed',
  };

  if (backendCode && businessKinds[backendCode]) {
    return new ProvisionalScoringApiError(
      businessKinds[backendCode],
      status,
      backendCode,
    );
  }

  if (status === 400) {
    return new ProvisionalScoringApiError('validation', status, backendCode);
  }

  if (status >= 500) {
    return new ProvisionalScoringApiError(
      'service_unavailable',
      status,
      backendCode,
    );
  }

  return new ProvisionalScoringApiError('unknown', status, backendCode);
}

async function provisionalScoringFetch(
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
    if (error instanceof ProvisionalScoringApiError || init.signal?.aborted) {
      throw error;
    }

    throw new ProvisionalScoringApiError('service_unavailable');
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProvisionalScoringApiError('unknown', response.status);
  }
}

function buildScoreResultPath(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
): string {
  return `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances/${encodeURIComponent(scaleInstanceId)}/score-results`;
}

export async function getLatestProvisionalScoreResult(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  options: RequestOptions = {},
): Promise<ScoreResultDetailResponse> {
  const response = await provisionalScoringFetch(
    `${buildScoreResultPath(patientId, visitId, scaleInstanceId)}/latest`,
    {
      method: 'GET',
      signal: options.signal,
    },
  );

  return readJson<ScoreResultDetailResponse>(response);
}

export async function computeProvisionalScoreResult(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  input: ComputeScoreResultRequest,
): Promise<ComputeScoreResultResponse> {
  if (input.confirm !== true) {
    throw new ProvisionalScoringApiError(
      'score_computation_confirmation_required',
      400,
      'SCORE_COMPUTATION_CONFIRMATION_REQUIRED',
    );
  }

  const requestBody: ComputeScoreResultRequest = { confirm: true };
  const response = await provisionalScoringFetch(
    `${buildScoreResultPath(patientId, visitId, scaleInstanceId)}/compute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  return readJson<ComputeScoreResultResponse>(response);
}
