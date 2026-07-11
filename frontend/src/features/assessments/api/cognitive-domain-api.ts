import { frontendEnv } from '@/src/lib/env';

import type {
  CognitiveDomainResultDetailResponse,
  ComputeCognitiveDomainResultRequest,
  ComputeCognitiveDomainResultResponse,
} from '@/src/features/assessments/types/cognitive-domain-result';

export type CognitiveDomainApiErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'patient_not_found'
  | 'patient_not_active'
  | 'visit_not_found'
  | 'visit_not_editable'
  | 'scale_instance_not_found'
  | 'scale_instance_configuration_unavailable'
  | 'score_result_not_found'
  | 'cognitive_domain_computation_confirmation_required'
  | 'cognitive_domain_instance_not_computable'
  | 'cognitive_domain_source_score_not_final'
  | 'cognitive_domain_source_score_invalid'
  | 'cognitive_domain_mapping_unavailable'
  | 'cognitive_domain_input_invalid'
  | 'cognitive_domain_result_not_found'
  | 'cognitive_domain_result_incomplete'
  | 'cognitive_domain_result_voided'
  | 'cognitive_domain_computation_conflict'
  | 'cognitive_domain_computation_failed'
  | 'service_unavailable'
  | 'unknown';

export class CognitiveDomainApiError extends Error {
  constructor(
    readonly kind: CognitiveDomainApiErrorKind,
    readonly status?: number,
    readonly backendCode?: string,
  ) {
    super(`Cognitive domain API request failed: ${kind}`);
    this.name = 'CognitiveDomainApiError';
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
): CognitiveDomainApiError {
  if (status === 401) {
    return new CognitiveDomainApiError('unauthenticated', status, backendCode);
  }

  if (status === 403) {
    return new CognitiveDomainApiError('forbidden', status, backendCode);
  }

  const businessKinds: Record<string, CognitiveDomainApiErrorKind> = {
    PATIENT_NOT_FOUND: 'patient_not_found',
    PATIENT_NOT_ACTIVE: 'patient_not_active',
    VISIT_NOT_FOUND: 'visit_not_found',
    VISIT_NOT_EDITABLE: 'visit_not_editable',
    SCALE_INSTANCE_NOT_FOUND: 'scale_instance_not_found',
    SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE:
      'scale_instance_configuration_unavailable',
    SCORE_RESULT_NOT_FOUND: 'score_result_not_found',
    COGNITIVE_DOMAIN_COMPUTATION_CONFIRMATION_REQUIRED:
      'cognitive_domain_computation_confirmation_required',
    COGNITIVE_DOMAIN_INSTANCE_NOT_COMPUTABLE:
      'cognitive_domain_instance_not_computable',
    COGNITIVE_DOMAIN_SOURCE_SCORE_NOT_FINAL:
      'cognitive_domain_source_score_not_final',
    COGNITIVE_DOMAIN_SOURCE_SCORE_INVALID:
      'cognitive_domain_source_score_invalid',
    COGNITIVE_DOMAIN_MAPPING_UNAVAILABLE:
      'cognitive_domain_mapping_unavailable',
    COGNITIVE_DOMAIN_INPUT_INVALID: 'cognitive_domain_input_invalid',
    COGNITIVE_DOMAIN_RESULT_NOT_FOUND: 'cognitive_domain_result_not_found',
    COGNITIVE_DOMAIN_RESULT_INCOMPLETE:
      'cognitive_domain_result_incomplete',
    COGNITIVE_DOMAIN_RESULT_VOIDED: 'cognitive_domain_result_voided',
    COGNITIVE_DOMAIN_COMPUTATION_CONFLICT:
      'cognitive_domain_computation_conflict',
    COGNITIVE_DOMAIN_COMPUTATION_FAILED:
      'cognitive_domain_computation_failed',
  };

  if (backendCode && businessKinds[backendCode]) {
    return new CognitiveDomainApiError(
      businessKinds[backendCode],
      status,
      backendCode,
    );
  }

  if (status === 400) {
    return new CognitiveDomainApiError('validation', status, backendCode);
  }

  if (status >= 500) {
    return new CognitiveDomainApiError(
      'service_unavailable',
      status,
      backendCode,
    );
  }

  return new CognitiveDomainApiError('unknown', status, backendCode);
}

async function cognitiveDomainFetch(
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
    if (error instanceof CognitiveDomainApiError || init.signal?.aborted) {
      throw error;
    }

    throw new CognitiveDomainApiError('service_unavailable');
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new CognitiveDomainApiError('unknown', response.status);
  }
}

function buildCognitiveDomainPath(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
): string {
  return `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances/${encodeURIComponent(scaleInstanceId)}/cognitive-domain-results`;
}

export async function getLatestCognitiveDomainResult(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  options: RequestOptions = {},
): Promise<CognitiveDomainResultDetailResponse> {
  const response = await cognitiveDomainFetch(
    `${buildCognitiveDomainPath(patientId, visitId, scaleInstanceId)}/latest`,
    {
      method: 'GET',
      signal: options.signal,
    },
  );

  return readJson<CognitiveDomainResultDetailResponse>(response);
}

export async function computeCognitiveDomainResult(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  input: ComputeCognitiveDomainResultRequest,
): Promise<ComputeCognitiveDomainResultResponse> {
  if (input.confirm !== true) {
    throw new CognitiveDomainApiError(
      'cognitive_domain_computation_confirmation_required',
      400,
      'COGNITIVE_DOMAIN_COMPUTATION_CONFIRMATION_REQUIRED',
    );
  }

  const requestBody: ComputeCognitiveDomainResultRequest = { confirm: true };
  const response = await cognitiveDomainFetch(
    `${buildCognitiveDomainPath(patientId, visitId, scaleInstanceId)}/compute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  return readJson<ComputeCognitiveDomainResultResponse>(response);
}
