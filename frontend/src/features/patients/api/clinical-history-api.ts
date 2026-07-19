import { frontendEnv } from '@/src/lib/env';

import type {
  GetPatientFollowUpTrendQuery,
  ListPatientAssessmentHistoryQuery,
  PatientAssessmentHistoryResponse,
  PatientFollowUpTrendResponse,
} from '@/src/features/patients/types/clinical-history';

export type ClinicalHistoryApiErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'invalid_date_range'
  | 'patient_not_found'
  | 'scale_not_available'
  | 'follow_up_trend_range_too_large'
  | 'follow_up_trend_data_invalid'
  | 'service_unavailable'
  | 'unknown';

export class ClinicalHistoryApiError extends Error {
  constructor(
    readonly kind: ClinicalHistoryApiErrorKind,
    readonly status?: number,
    readonly backendCode?: string,
  ) {
    super(`Clinical history API request failed: ${kind}`);
    this.name = 'ClinicalHistoryApiError';
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

function appendQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value === undefined || value === null || value === '') {
    return;
  }

  searchParams.set(key, String(value));
}

function buildQueryString(
  values: Record<string, string | number | null | undefined>,
): string {
  const searchParams = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    appendQueryValue(searchParams, key, value);
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
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
): ClinicalHistoryApiError {
  if (status === 401) {
    return new ClinicalHistoryApiError('unauthenticated', status, backendCode);
  }

  if (status === 403) {
    return new ClinicalHistoryApiError('forbidden', status, backendCode);
  }

  const businessKinds: Record<string, ClinicalHistoryApiErrorKind> = {
    INVALID_DATE_RANGE: 'invalid_date_range',
    PATIENT_NOT_FOUND: 'patient_not_found',
    SCALE_NOT_AVAILABLE: 'scale_not_available',
    FOLLOW_UP_TREND_RANGE_TOO_LARGE: 'follow_up_trend_range_too_large',
    FOLLOW_UP_TREND_DATA_INVALID: 'follow_up_trend_data_invalid',
  };

  if (backendCode && businessKinds[backendCode]) {
    return new ClinicalHistoryApiError(
      businessKinds[backendCode],
      status,
      backendCode,
    );
  }

  if (status === 400) {
    return new ClinicalHistoryApiError('validation', status, backendCode);
  }

  if (status >= 500) {
    return new ClinicalHistoryApiError(
      'service_unavailable',
      status,
      backendCode,
    );
  }

  return new ClinicalHistoryApiError('unknown', status, backendCode);
}

async function clinicalHistoryFetch(
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
    if (error instanceof ClinicalHistoryApiError || init.signal?.aborted) {
      throw error;
    }

    throw new ClinicalHistoryApiError('service_unavailable');
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ClinicalHistoryApiError('unknown', response.status);
  }
}

export async function listPatientAssessmentHistory(
  patientId: string,
  query: ListPatientAssessmentHistoryQuery = {},
  options: RequestOptions = {},
): Promise<PatientAssessmentHistoryResponse> {
  const queryString = buildQueryString({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    visitType: query.visitType,
    status: query.status,
    scaleCode: query.scaleCode?.trim().toLowerCase(),
  });
  const response = await clinicalHistoryFetch(
    `/patients/${encodeURIComponent(patientId)}/assessment-history${queryString}`,
    { method: 'GET', signal: options.signal },
  );

  return readJson<PatientAssessmentHistoryResponse>(response);
}

export async function getPatientFollowUpTrend(
  patientId: string,
  query: GetPatientFollowUpTrendQuery,
  options: RequestOptions = {},
): Promise<PatientFollowUpTrendResponse> {
  const queryString = buildQueryString({
    scaleCode: query.scaleCode.trim().toLowerCase(),
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    maxPoints: query.maxPoints,
  });
  const response = await clinicalHistoryFetch(
    `/patients/${encodeURIComponent(patientId)}/follow-up-trends${queryString}`,
    { method: 'GET', signal: options.signal },
  );

  return readJson<PatientFollowUpTrendResponse>(response);
}
