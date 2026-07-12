import { frontendEnv } from '@/src/lib/env';

import type {
  ArchiveClinicalReportRequest,
  ArchiveClinicalReportResponse,
  ConfirmClinicalReportRequest,
  ConfirmClinicalReportResponse,
  ClinicalReportDetailResponse,
  FreezeClinicalReportSourcesRequest,
  FreezeClinicalReportSourcesResponse,
  GenerateClinicalReportRequest,
  GenerateClinicalReportResponse,
  LockClinicalReportRequest,
  LockClinicalReportResponse,
  SubmitClinicalReportForConfirmationRequest,
  SubmitClinicalReportForConfirmationResponse,
  UpdateClinicalReportDraftRequest,
  UpdateClinicalReportDraftResponse,
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
  | 'clinical_report_metadata_unsupported'
  | 'clinical_report_not_editable'
  | 'clinical_report_edit_no_changes'
  | 'clinical_report_edit_audit_limit_reached'
  | 'clinical_report_edit_conflict'
  | 'clinical_report_edit_failed'
  | 'clinical_report_submission_confirmation_required'
  | 'clinical_report_not_ready_for_submission'
  | 'clinical_report_submission_conflict'
  | 'clinical_report_submission_audit_unavailable'
  | 'clinical_report_submission_failed'
  | 'clinical_report_confirmation_required'
  | 'clinical_report_not_ready_for_confirmation'
  | 'clinical_report_confirmation_conflict'
  | 'clinical_report_confirmation_audit_unavailable'
  | 'clinical_report_confirmation_failed'
  | 'clinical_report_lock_confirmation_required'
  | 'clinical_report_not_lockable'
  | 'clinical_report_lock_conflict'
  | 'clinical_report_lock_audit_unavailable'
  | 'clinical_report_lock_failed'
  | 'clinical_report_source_freeze_confirmation_required'
  | 'clinical_report_not_source_freezable'
  | 'clinical_report_source_freeze_scope_invalid'
  | 'clinical_report_source_freeze_input_invalid'
  | 'clinical_report_source_freeze_conflict'
  | 'clinical_report_source_freeze_audit_unavailable'
  | 'clinical_report_source_freeze_incomplete'
  | 'clinical_report_source_freeze_failed'
  | 'clinical_report_archive_confirmation_required'
  | 'clinical_report_not_archivable'
  | 'clinical_report_archive_conflict'
  | 'clinical_report_archive_audit_unavailable'
  | 'clinical_report_archive_failed'
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
    CLINICAL_REPORT_METADATA_UNSUPPORTED:
      'clinical_report_metadata_unsupported',
    CLINICAL_REPORT_NOT_EDITABLE: 'clinical_report_not_editable',
    CLINICAL_REPORT_EDIT_NO_CHANGES: 'clinical_report_edit_no_changes',
    CLINICAL_REPORT_EDIT_AUDIT_LIMIT_REACHED:
      'clinical_report_edit_audit_limit_reached',
    CLINICAL_REPORT_EDIT_CONFLICT: 'clinical_report_edit_conflict',
    CLINICAL_REPORT_EDIT_FAILED: 'clinical_report_edit_failed',
    CLINICAL_REPORT_SUBMISSION_CONFIRMATION_REQUIRED:
      'clinical_report_submission_confirmation_required',
    CLINICAL_REPORT_NOT_READY_FOR_SUBMISSION:
      'clinical_report_not_ready_for_submission',
    CLINICAL_REPORT_SUBMISSION_CONFLICT:
      'clinical_report_submission_conflict',
    CLINICAL_REPORT_SUBMISSION_AUDIT_UNAVAILABLE:
      'clinical_report_submission_audit_unavailable',
    CLINICAL_REPORT_SUBMISSION_FAILED: 'clinical_report_submission_failed',
    CLINICAL_REPORT_CONFIRMATION_REQUIRED:
      'clinical_report_confirmation_required',
    CLINICAL_REPORT_NOT_READY_FOR_CONFIRMATION:
      'clinical_report_not_ready_for_confirmation',
    CLINICAL_REPORT_CONFIRMATION_CONFLICT:
      'clinical_report_confirmation_conflict',
    CLINICAL_REPORT_CONFIRMATION_AUDIT_UNAVAILABLE:
      'clinical_report_confirmation_audit_unavailable',
    CLINICAL_REPORT_CONFIRMATION_FAILED:
      'clinical_report_confirmation_failed',
    CLINICAL_REPORT_LOCK_CONFIRMATION_REQUIRED:
      'clinical_report_lock_confirmation_required',
    CLINICAL_REPORT_NOT_LOCKABLE: 'clinical_report_not_lockable',
    CLINICAL_REPORT_LOCK_CONFLICT: 'clinical_report_lock_conflict',
    CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE:
      'clinical_report_lock_audit_unavailable',
    CLINICAL_REPORT_LOCK_FAILED: 'clinical_report_lock_failed',
    CLINICAL_REPORT_SOURCE_FREEZE_CONFIRMATION_REQUIRED:
      'clinical_report_source_freeze_confirmation_required',
    CLINICAL_REPORT_NOT_SOURCE_FREEZABLE:
      'clinical_report_not_source_freezable',
    CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID:
      'clinical_report_source_freeze_scope_invalid',
    CLINICAL_REPORT_SOURCE_FREEZE_INPUT_INVALID:
      'clinical_report_source_freeze_input_invalid',
    CLINICAL_REPORT_SOURCE_FREEZE_CONFLICT:
      'clinical_report_source_freeze_conflict',
    CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE:
      'clinical_report_source_freeze_audit_unavailable',
    CLINICAL_REPORT_SOURCE_FREEZE_INCOMPLETE:
      'clinical_report_source_freeze_incomplete',
    CLINICAL_REPORT_SOURCE_FREEZE_FAILED:
      'clinical_report_source_freeze_failed',
    CLINICAL_REPORT_ARCHIVE_CONFIRMATION_REQUIRED:
      'clinical_report_archive_confirmation_required',
    CLINICAL_REPORT_NOT_ARCHIVABLE: 'clinical_report_not_archivable',
    CLINICAL_REPORT_ARCHIVE_CONFLICT: 'clinical_report_archive_conflict',
    CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE:
      'clinical_report_archive_audit_unavailable',
    CLINICAL_REPORT_ARCHIVE_FAILED: 'clinical_report_archive_failed',
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

function buildClinicalReportResourcePath(
  patientId: string,
  visitId: string,
  reportId: string,
): string {
  const normalizedReportId = reportId.trim().toLowerCase();
  if (!mongoIdPattern.test(normalizedReportId)) {
    throw new ClinicalReportApiError('validation', 400);
  }
  return `${buildClinicalReportPath(patientId, visitId)}/${encodeURIComponent(normalizedReportId)}`;
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

export async function updateClinicalReportDraft(
  patientId: string,
  visitId: string,
  reportId: string,
  input: UpdateClinicalReportDraftRequest,
): Promise<UpdateClinicalReportDraftResponse> {
  const requestBody: UpdateClinicalReportDraftRequest = {
    doctorOpinion: input.doctorOpinion.trim(),
    ...(input.recommendationText === undefined
      ? {}
      : { recommendationText: input.recommendationText.trim() }),
    editNote: input.editNote.trim(),
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
  const response = await clinicalReportFetch(
    `${buildClinicalReportResourcePath(patientId, visitId, reportId)}/draft`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );
  return readJson<UpdateClinicalReportDraftResponse>(response);
}

export async function submitClinicalReportForConfirmation(
  patientId: string,
  visitId: string,
  reportId: string,
  input: SubmitClinicalReportForConfirmationRequest,
): Promise<SubmitClinicalReportForConfirmationResponse> {
  const requestBody: SubmitClinicalReportForConfirmationRequest = {
    confirm: true,
    submissionNote: input.submissionNote.trim(),
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
  const response = await clinicalReportFetch(
    `${buildClinicalReportResourcePath(patientId, visitId, reportId)}/submit-confirmation`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );
  return readJson<SubmitClinicalReportForConfirmationResponse>(response);
}

export async function confirmClinicalReport(
  patientId: string,
  visitId: string,
  reportId: string,
  input: ConfirmClinicalReportRequest,
): Promise<ConfirmClinicalReportResponse> {
  const requestBody: ConfirmClinicalReportRequest = {
    confirm: true,
    confirmationNote: input.confirmationNote.trim(),
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
  const response = await clinicalReportFetch(
    `${buildClinicalReportResourcePath(patientId, visitId, reportId)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );
  return readJson<ConfirmClinicalReportResponse>(response);
}

export async function lockClinicalReport(
  patientId: string,
  visitId: string,
  reportId: string,
  input: LockClinicalReportRequest,
): Promise<LockClinicalReportResponse> {
  const requestBody: LockClinicalReportRequest = {
    confirm: true,
    lockNote: input.lockNote.trim(),
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
  const response = await clinicalReportFetch(
    `${buildClinicalReportResourcePath(patientId, visitId, reportId)}/lock`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );
  return readJson<LockClinicalReportResponse>(response);
}

export async function freezeClinicalReportSources(
  patientId: string,
  visitId: string,
  reportId: string,
  input: FreezeClinicalReportSourcesRequest,
): Promise<FreezeClinicalReportSourcesResponse> {
  const requestBody: FreezeClinicalReportSourcesRequest = {
    confirm: true,
    freezeNote: input.freezeNote.trim(),
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
  const response = await clinicalReportFetch(
    `${buildClinicalReportResourcePath(patientId, visitId, reportId)}/freeze-sources`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );
  return readJson<FreezeClinicalReportSourcesResponse>(response);
}

export async function archiveClinicalReport(
  patientId: string,
  visitId: string,
  reportId: string,
  input: ArchiveClinicalReportRequest,
): Promise<ArchiveClinicalReportResponse> {
  const requestBody: ArchiveClinicalReportRequest = {
    confirm: true,
    archiveNote: input.archiveNote.trim(),
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
  const response = await clinicalReportFetch(
    `${buildClinicalReportResourcePath(patientId, visitId, reportId)}/archive`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );
  return readJson<ArchiveClinicalReportResponse>(response);
}
