import { frontendEnv } from '@/src/lib/env';

import type {
  ConfirmScoreResultRequest,
  ConfirmScoreResultResponse,
  ComputeScoreResultRequest,
  ComputeScoreResultResponse,
  ReviewScoreItemRequest,
  ReviewScoreItemResponse,
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
  | 'score_result_not_reviewable'
  | 'score_item_not_found'
  | 'score_item_not_reviewable'
  | 'score_item_review_target_unavailable'
  | 'score_manual_value_out_of_range'
  | 'score_manual_value_step_invalid'
  | 'score_result_metadata_unsupported'
  | 'score_review_audit_limit_reached'
  | 'score_result_review_conflict'
  | 'score_result_review_failed'
  | 'score_result_confirmation_required'
  | 'score_result_not_ready_for_confirmation'
  | 'score_result_confirmation_warnings_present'
  | 'score_result_confirmation_conflict'
  | 'score_result_confirmation_audit_unavailable'
  | 'score_result_confirmation_failed'
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
    SCORE_RESULT_NOT_REVIEWABLE: 'score_result_not_reviewable',
    SCORE_ITEM_NOT_FOUND: 'score_item_not_found',
    SCORE_ITEM_NOT_REVIEWABLE: 'score_item_not_reviewable',
    SCORE_ITEM_REVIEW_TARGET_UNAVAILABLE:
      'score_item_review_target_unavailable',
    SCORE_MANUAL_VALUE_OUT_OF_RANGE: 'score_manual_value_out_of_range',
    SCORE_MANUAL_VALUE_STEP_INVALID: 'score_manual_value_step_invalid',
    SCORE_RESULT_METADATA_UNSUPPORTED: 'score_result_metadata_unsupported',
    SCORE_REVIEW_AUDIT_LIMIT_REACHED: 'score_review_audit_limit_reached',
    SCORE_RESULT_REVIEW_CONFLICT: 'score_result_review_conflict',
    SCORE_RESULT_REVIEW_FAILED: 'score_result_review_failed',
    SCORE_RESULT_CONFIRMATION_REQUIRED: 'score_result_confirmation_required',
    SCORE_RESULT_NOT_READY_FOR_CONFIRMATION:
      'score_result_not_ready_for_confirmation',
    SCORE_RESULT_CONFIRMATION_WARNINGS_PRESENT:
      'score_result_confirmation_warnings_present',
    SCORE_RESULT_CONFIRMATION_CONFLICT:
      'score_result_confirmation_conflict',
    SCORE_RESULT_CONFIRMATION_AUDIT_UNAVAILABLE:
      'score_result_confirmation_audit_unavailable',
    SCORE_RESULT_CONFIRMATION_FAILED: 'score_result_confirmation_failed',
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

export async function reviewScoreItemManually(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  scoreResultId: string,
  itemResponseId: string,
  input: ReviewScoreItemRequest,
): Promise<ReviewScoreItemResponse> {
  const requestBody: ReviewScoreItemRequest = {
    scoreValue: input.scoreValue,
    reviewNote: input.reviewNote.trim(),
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
  const response = await provisionalScoringFetch(
    `${buildScoreResultPath(patientId, visitId, scaleInstanceId)}/${encodeURIComponent(scoreResultId)}/item-scores/${encodeURIComponent(itemResponseId)}/manual-review`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  return readJson<ReviewScoreItemResponse>(response);
}

export async function confirmScoreResult(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  scoreResultId: string,
  input: ConfirmScoreResultRequest,
): Promise<ConfirmScoreResultResponse> {
  const requestBody: ConfirmScoreResultRequest = {
    confirm: true,
    reviewNote: input.reviewNote.trim(),
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
  const response = await provisionalScoringFetch(
    `${buildScoreResultPath(patientId, visitId, scaleInstanceId)}/${encodeURIComponent(scoreResultId)}/confirm`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  return readJson<ConfirmScoreResultResponse>(response);
}
