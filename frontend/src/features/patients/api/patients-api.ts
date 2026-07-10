import { frontendEnv } from '@/src/lib/env';

import type {
  AssessmentVisit,
  AssessmentVisitListResponse,
  CreateAssessmentVisitRequest,
  CreatePatientRequest,
  ListAssessmentVisitsQuery,
  ListPatientsQuery,
  PatientDetail,
  PatientListResponse,
} from '@/src/features/patients/types/patient';

export type PatientsApiErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'patient_not_found'
  | 'patient_code_conflict'
  | 'patient_not_active'
  | 'visit_code_conflict'
  | 'invalid_date_range'
  | 'service_unavailable'
  | 'unknown';

export class PatientsApiError extends Error {
  constructor(
    readonly kind: PatientsApiErrorKind,
    readonly status?: number,
    readonly backendCode?: string,
  ) {
    super(`Patients API request failed: ${kind}`);
    this.name = 'PatientsApiError';
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
): PatientsApiError {
  if (status === 401) {
    return new PatientsApiError('unauthenticated', status, backendCode);
  }

  if (status === 403) {
    return new PatientsApiError('forbidden', status, backendCode);
  }

  if (status === 404 && backendCode === 'PATIENT_NOT_FOUND') {
    return new PatientsApiError('patient_not_found', status, backendCode);
  }

  if (status === 409 && backendCode === 'PATIENT_SUBJECT_CODE_CONFLICT') {
    return new PatientsApiError('patient_code_conflict', status, backendCode);
  }

  if (status === 409 && backendCode === 'PATIENT_NOT_ACTIVE') {
    return new PatientsApiError('patient_not_active', status, backendCode);
  }

  if (status === 409 && backendCode === 'VISIT_CODE_CONFLICT') {
    return new PatientsApiError('visit_code_conflict', status, backendCode);
  }

  if (status === 400 && backendCode === 'INVALID_DATE_RANGE') {
    return new PatientsApiError('invalid_date_range', status, backendCode);
  }

  if (status === 400) {
    return new PatientsApiError('validation', status, backendCode);
  }

  return new PatientsApiError('unknown', status, backendCode);
}

async function patientsFetch(path: string, init: RequestInit): Promise<Response> {
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
    if (error instanceof PatientsApiError || init.signal?.aborted) {
      throw error;
    }

    throw new PatientsApiError('service_unavailable');
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new PatientsApiError('unknown', response.status);
  }
}

export async function listPatients(
  query: ListPatientsQuery = {},
  options: RequestOptions = {},
): Promise<PatientListResponse> {
  const queryString = buildQueryString({
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword,
    status: query.status,
    sourceType: query.sourceType,
  });
  const response = await patientsFetch(`/patients${queryString}`, {
    method: 'GET',
    signal: options.signal,
  });

  return readJson<PatientListResponse>(response);
}

export async function createPatient(
  input: CreatePatientRequest,
): Promise<PatientDetail> {
  const response = await patientsFetch('/patients', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return readJson<PatientDetail>(response);
}

export async function getPatient(
  patientId: string,
  options: RequestOptions = {},
): Promise<PatientDetail> {
  const response = await patientsFetch(
    `/patients/${encodeURIComponent(patientId)}`,
    {
      method: 'GET',
      signal: options.signal,
    },
  );

  return readJson<PatientDetail>(response);
}

export async function listPatientVisits(
  patientId: string,
  query: ListAssessmentVisitsQuery = {},
  options: RequestOptions = {},
): Promise<AssessmentVisitListResponse> {
  const queryString = buildQueryString({
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    visitType: query.visitType,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
  const response = await patientsFetch(
    `/patients/${encodeURIComponent(patientId)}/visits${queryString}`,
    {
      method: 'GET',
      signal: options.signal,
    },
  );

  return readJson<AssessmentVisitListResponse>(response);
}

export async function createPatientVisit(
  patientId: string,
  input: CreateAssessmentVisitRequest,
): Promise<AssessmentVisit> {
  const response = await patientsFetch(
    `/patients/${encodeURIComponent(patientId)}/visits`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  return readJson<AssessmentVisit>(response);
}
