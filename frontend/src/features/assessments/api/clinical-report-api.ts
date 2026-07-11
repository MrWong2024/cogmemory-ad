import { frontendEnv } from '@/src/lib/env';

import type {
  ClinicalReportDetailResponse,
  GenerateClinicalReportRequest,
  GenerateClinicalReportResponse,
} from '@/src/features/assessments/types/clinical-report';

export type ClinicalReportApiErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'patient_not_found'
  | 'patient_not_active'
  | 'visit_not_found'
  | 'visit_not_editable'
  | 'scale_instance_not_found'
  | 'scale_instance_configuration_unavailable'
  | 'clinical_report_generation_confirmation_required'
  | 'clinical_report_scope_invalid'
  | 'clinical_report_source_scale_not_ready'
  | 'clinical_report_source_score_not_final'
  | 'clinical_report_source_domain_result_required'
  | 'clinical_report_source_domain_result_invalid'
  | 'clinical_report_source_media_invalid'
  | 'clinical_report_input_invalid'
  | 'clinical_report_not_found'
  | 'clinical_report_incomplete'
  | 'clinical_report_voided'
  | 'clinical_report_scope_conflict'
  | 'clinical_report_generation_conflict'
  | 'clinical_report_generation_failed'
  | 'service_unavailable'
  | 'unknown';

export class ClinicalReportApiError extends Error {
  constructor(
    readonly kind: ClinicalReportApiErrorKind,
    readonly status?: number,
    readonly backendCode?: string,
  ) {
    super(`Clinical report API request failed: ${kind}`);
    this.name = 'ClinicalReportApiError';
  }
}

type RequestOptions = {
  signal?: AbortSignal;
};

type BackendErrorBody = {
  code?: unknown;
};

const mongoIdPattern = /^[a-f\d]{24}$/;

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
): ClinicalReportApiError {
  if (status === 401) {
    return new ClinicalReportApiError('unauthenticated', status, backendCode);
  }
  if (status === 403) {
    return new ClinicalReportApiError('forbidden', status, backendCode);
  }

  const businessKinds: Record<string, ClinicalReportApiErrorKind> = {
    PATIENT_NOT_FOUND: 'patient_not_found',
    PATIENT_NOT_ACTIVE: 'patient_not_active',
    VISIT_NOT_FOUND: 'visit_not_found',
    VISIT_NOT_EDITABLE: 'visit_not_editable',
    SCALE_INSTANCE_NOT_FOUND: 'scale_instance_not_found',
    SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE:
      'scale_instance_configuration_unavailable',
    CLINICAL_REPORT_GENERATION_CONFIRMATION_REQUIRED:
      'clinical_report_generation_confirmation_required',
    CLINICAL_REPORT_SCOPE_INVALID: 'clinical_report_scope_invalid',
    CLINICAL_REPORT_SOURCE_SCALE_NOT_READY:
      'clinical_report_source_scale_not_ready',
    CLINICAL_REPORT_SOURCE_SCORE_NOT_FINAL:
      'clinical_report_source_score_not_final',
    CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_REQUIRED:
      'clinical_report_source_domain_result_required',
    CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_INVALID:
      'clinical_report_source_domain_result_invalid',
    CLINICAL_REPORT_SOURCE_MEDIA_INVALID:
      'clinical_report_source_media_invalid',
    CLINICAL_REPORT_INPUT_INVALID: 'clinical_report_input_invalid',
    CLINICAL_REPORT_NOT_FOUND: 'clinical_report_not_found',
    CLINICAL_REPORT_INCOMPLETE: 'clinical_report_incomplete',
    CLINICAL_REPORT_VOIDED: 'clinical_report_voided',
    CLINICAL_REPORT_SCOPE_CONFLICT: 'clinical_report_scope_conflict',
    CLINICAL_REPORT_GENERATION_CONFLICT:
      'clinical_report_generation_conflict',
    CLINICAL_REPORT_GENERATION_FAILED: 'clinical_report_generation_failed',
  };

  if (backendCode && businessKinds[backendCode]) {
    return new ClinicalReportApiError(
      businessKinds[backendCode],
      status,
      backendCode,
    );
  }
  if (status === 400) {
    return new ClinicalReportApiError('validation', status, backendCode);
  }
  if (status >= 500) {
    return new ClinicalReportApiError('service_unavailable', status, backendCode);
  }
  return new ClinicalReportApiError('unknown', status, backendCode);
}

async function clinicalReportFetch(
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
    if (error instanceof ClinicalReportApiError || init.signal?.aborted) {
      throw error;
    }
    throw new ClinicalReportApiError('service_unavailable');
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ClinicalReportApiError('unknown', response.status);
  }
}

function buildClinicalReportPath(patientId: string, visitId: string): string {
  return `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/clinical-reports`;
}

export function normalizeClinicalReportScopeIds(ids: string[]): string[] {
  if (ids.length < 1 || ids.length > 10) {
    throw new ClinicalReportApiError(
      'clinical_report_scope_invalid',
      400,
      'CLINICAL_REPORT_SCOPE_INVALID',
    );
  }

  const normalizedIds = ids.map((id) => id.trim().toLowerCase());
  if (normalizedIds.some((id) => !mongoIdPattern.test(id))) {
    throw new ClinicalReportApiError(
      'clinical_report_scope_invalid',
      400,
      'CLINICAL_REPORT_SCOPE_INVALID',
    );
  }
  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new ClinicalReportApiError(
      'clinical_report_scope_invalid',
      400,
      'CLINICAL_REPORT_SCOPE_INVALID',
    );
  }
  return normalizedIds;
}

export async function getLatestClinicalReport(
  patientId: string,
  visitId: string,
  options: RequestOptions = {},
): Promise<ClinicalReportDetailResponse> {
  const response = await clinicalReportFetch(
    `${buildClinicalReportPath(patientId, visitId)}/latest`,
    { method: 'GET', signal: options.signal },
  );
  return readJson<ClinicalReportDetailResponse>(response);
}

export async function generateClinicalReport(
  patientId: string,
  visitId: string,
  input: GenerateClinicalReportRequest,
): Promise<GenerateClinicalReportResponse> {
  if (input.confirm !== true) {
    throw new ClinicalReportApiError(
      'clinical_report_generation_confirmation_required',
      400,
      'CLINICAL_REPORT_GENERATION_CONFIRMATION_REQUIRED',
    );
  }

  const normalizedIds = normalizeClinicalReportScopeIds(
    input.primaryScaleInstanceIds,
  );
  const requestBody: GenerateClinicalReportRequest = {
    confirm: true,
    primaryScaleInstanceIds: normalizedIds,
  };
  const response = await clinicalReportFetch(
    `${buildClinicalReportPath(patientId, visitId)}/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );
  return readJson<GenerateClinicalReportResponse>(response);
}
