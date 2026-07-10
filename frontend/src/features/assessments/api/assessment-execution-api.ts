import { frontendEnv } from '@/src/lib/env';

import type {
  AssessmentVisitExecutionDetailResponse,
  AvailableScaleListResponse,
  InitializeScaleInstanceRequest,
  InitializeScaleInstanceResponse,
} from '@/src/features/assessments/types/assessment-execution';

export type AssessmentExecutionApiErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'patient_not_found'
  | 'patient_not_active'
  | 'visit_not_found'
  | 'visit_not_initializable'
  | 'scale_not_available'
  | 'scale_version_not_available'
  | 'scale_not_active'
  | 'scale_version_not_active'
  | 'scale_catalog_invalid'
  | 'scale_catalog_version_conflict'
  | 'scale_instance_already_exists'
  | 'scale_execution_initialization_failed'
  | 'service_unavailable'
  | 'unknown';

export class AssessmentExecutionApiError extends Error {
  constructor(
    readonly kind: AssessmentExecutionApiErrorKind,
    readonly status?: number,
    readonly backendCode?: string,
  ) {
    super(`Assessment execution API request failed: ${kind}`);
    this.name = 'AssessmentExecutionApiError';
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
): AssessmentExecutionApiError {
  if (status === 401) {
    return new AssessmentExecutionApiError(
      'unauthenticated',
      status,
      backendCode,
    );
  }

  if (status === 403) {
    return new AssessmentExecutionApiError('forbidden', status, backendCode);
  }

  if (status === 400) {
    return new AssessmentExecutionApiError('validation', status, backendCode);
  }

  const notFoundKinds: Record<
    string,
    AssessmentExecutionApiErrorKind
  > = {
    PATIENT_NOT_FOUND: 'patient_not_found',
    VISIT_NOT_FOUND: 'visit_not_found',
    SCALE_NOT_AVAILABLE: 'scale_not_available',
    SCALE_VERSION_NOT_AVAILABLE: 'scale_version_not_available',
  };
  const conflictKinds: Record<
    string,
    AssessmentExecutionApiErrorKind
  > = {
    PATIENT_NOT_ACTIVE: 'patient_not_active',
    VISIT_NOT_INITIALIZABLE: 'visit_not_initializable',
    SCALE_NOT_ACTIVE: 'scale_not_active',
    SCALE_VERSION_NOT_ACTIVE: 'scale_version_not_active',
    SCALE_CATALOG_VERSION_CONFLICT: 'scale_catalog_version_conflict',
    SCALE_INSTANCE_ALREADY_EXISTS: 'scale_instance_already_exists',
  };
  const serverErrorKinds: Record<
    string,
    AssessmentExecutionApiErrorKind
  > = {
    SCALE_CATALOG_INVALID: 'scale_catalog_invalid',
    SCALE_EXECUTION_INITIALIZATION_FAILED:
      'scale_execution_initialization_failed',
  };

  if (status === 404 && backendCode && notFoundKinds[backendCode]) {
    return new AssessmentExecutionApiError(
      notFoundKinds[backendCode],
      status,
      backendCode,
    );
  }

  if (status === 409 && backendCode && conflictKinds[backendCode]) {
    return new AssessmentExecutionApiError(
      conflictKinds[backendCode],
      status,
      backendCode,
    );
  }

  if (status === 500 && backendCode && serverErrorKinds[backendCode]) {
    return new AssessmentExecutionApiError(
      serverErrorKinds[backendCode],
      status,
      backendCode,
    );
  }

  return new AssessmentExecutionApiError('unknown', status, backendCode);
}

async function assessmentExecutionFetch(
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
    if (error instanceof AssessmentExecutionApiError || init.signal?.aborted) {
      throw error;
    }

    throw new AssessmentExecutionApiError('service_unavailable');
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new AssessmentExecutionApiError('unknown', response.status);
  }
}

export async function listAvailableScales(
  options: RequestOptions = {},
): Promise<AvailableScaleListResponse> {
  const response = await assessmentExecutionFetch('/scales/available', {
    method: 'GET',
    signal: options.signal,
  });

  return readJson<AvailableScaleListResponse>(response);
}

export async function getAssessmentVisitExecutionDetail(
  patientId: string,
  visitId: string,
  options: RequestOptions = {},
): Promise<AssessmentVisitExecutionDetailResponse> {
  const response = await assessmentExecutionFetch(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`,
    {
      method: 'GET',
      signal: options.signal,
    },
  );

  return readJson<AssessmentVisitExecutionDetailResponse>(response);
}

export async function initializeScaleInstance(
  patientId: string,
  visitId: string,
  input: InitializeScaleInstanceRequest,
): Promise<InitializeScaleInstanceResponse> {
  const requestBody: InitializeScaleInstanceRequest = {
    scaleCode: input.scaleCode,
    ...(input.scaleVersion ? { scaleVersion: input.scaleVersion } : {}),
    ...(input.administrationMode
      ? { administrationMode: input.administrationMode }
      : {}),
  };
  const response = await assessmentExecutionFetch(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  return readJson<InitializeScaleInstanceResponse>(response);
}

