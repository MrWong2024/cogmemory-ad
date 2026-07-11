import { frontendEnv } from '@/src/lib/env';

import type {
  AssessmentVisitExecutionDetailResponse,
  AvailableScaleListResponse,
  InitializeScaleInstanceRequest,
  InitializeScaleInstanceResponse,
} from '@/src/features/assessments/types/assessment-execution';
import type {
  ScaleInstanceExecutionDetailResponse,
  UpdateItemResponseDraftRequest,
  UpdateItemResponseDraftResponse,
  UpdateItemStepDraftRequest,
  UpdateItemTimingDraftRequest,
  UpdatePromptResponseDraftRequest,
} from '@/src/features/assessments/types/item-response-execution';
import type {
  ScaleSubmissionReadinessResponse,
  SubmitScaleInstanceRequest,
  SubmitScaleInstanceResponse,
} from '@/src/features/assessments/types/scale-instance-submission';

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
  | 'scale_instance_not_found'
  | 'scale_instance_not_editable'
  | 'scale_instance_configuration_unavailable'
  | 'scale_instance_not_submittable'
  | 'scale_instance_not_ready'
  | 'scale_instance_start_time_invalid'
  | 'scale_instance_submission_confirmation_required'
  | 'scale_instance_submission_conflict'
  | 'scale_instance_submission_audit_unavailable'
  | 'scale_instance_submission_failed'
  | 'visit_not_editable'
  | 'item_response_not_found'
  | 'item_response_not_editable'
  | 'item_response_empty_patch'
  | 'item_response_payload_invalid'
  | 'item_response_missing_reason_required'
  | 'item_response_cannot_mark_answered'
  | 'item_response_step_not_found'
  | 'item_response_duplicate_step'
  | 'item_response_prompt_not_found'
  | 'item_response_duplicate_prompt'
  | 'item_response_timing_not_allowed'
  | 'item_response_invalid_timing'
  | 'item_response_save_failed'
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

  const businessKinds: Record<string, AssessmentExecutionApiErrorKind> = {
    PATIENT_NOT_FOUND: 'patient_not_found',
    PATIENT_NOT_ACTIVE: 'patient_not_active',
    VISIT_NOT_FOUND: 'visit_not_found',
    VISIT_NOT_INITIALIZABLE: 'visit_not_initializable',
    VISIT_NOT_EDITABLE: 'visit_not_editable',
    SCALE_NOT_AVAILABLE: 'scale_not_available',
    SCALE_VERSION_NOT_AVAILABLE: 'scale_version_not_available',
    SCALE_NOT_ACTIVE: 'scale_not_active',
    SCALE_VERSION_NOT_ACTIVE: 'scale_version_not_active',
    SCALE_CATALOG_INVALID: 'scale_catalog_invalid',
    SCALE_CATALOG_VERSION_CONFLICT: 'scale_catalog_version_conflict',
    SCALE_INSTANCE_ALREADY_EXISTS: 'scale_instance_already_exists',
    SCALE_INSTANCE_NOT_FOUND: 'scale_instance_not_found',
    SCALE_INSTANCE_NOT_EDITABLE: 'scale_instance_not_editable',
    SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE:
      'scale_instance_configuration_unavailable',
    SCALE_INSTANCE_NOT_SUBMITTABLE: 'scale_instance_not_submittable',
    SCALE_INSTANCE_NOT_READY: 'scale_instance_not_ready',
    SCALE_INSTANCE_START_TIME_INVALID: 'scale_instance_start_time_invalid',
    SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED:
      'scale_instance_submission_confirmation_required',
    SCALE_INSTANCE_SUBMISSION_CONFLICT:
      'scale_instance_submission_conflict',
    SCALE_INSTANCE_SUBMISSION_AUDIT_UNAVAILABLE:
      'scale_instance_submission_audit_unavailable',
    SCALE_INSTANCE_SUBMISSION_FAILED: 'scale_instance_submission_failed',
    ITEM_RESPONSE_NOT_FOUND: 'item_response_not_found',
    ITEM_RESPONSE_NOT_EDITABLE: 'item_response_not_editable',
    ITEM_RESPONSE_EMPTY_PATCH: 'item_response_empty_patch',
    ITEM_RESPONSE_PAYLOAD_INVALID: 'item_response_payload_invalid',
    ITEM_RESPONSE_MISSING_REASON_REQUIRED:
      'item_response_missing_reason_required',
    ITEM_RESPONSE_CANNOT_MARK_ANSWERED:
      'item_response_cannot_mark_answered',
    ITEM_RESPONSE_STEP_NOT_FOUND: 'item_response_step_not_found',
    ITEM_RESPONSE_DUPLICATE_STEP: 'item_response_duplicate_step',
    ITEM_RESPONSE_PROMPT_NOT_FOUND: 'item_response_prompt_not_found',
    ITEM_RESPONSE_DUPLICATE_PROMPT: 'item_response_duplicate_prompt',
    ITEM_RESPONSE_TIMING_NOT_ALLOWED: 'item_response_timing_not_allowed',
    ITEM_RESPONSE_INVALID_TIMING: 'item_response_invalid_timing',
    ITEM_RESPONSE_SAVE_FAILED: 'item_response_save_failed',
    SCALE_EXECUTION_INITIALIZATION_FAILED:
      'scale_execution_initialization_failed',
  };

  if (backendCode && businessKinds[backendCode]) {
    return new AssessmentExecutionApiError(
      businessKinds[backendCode],
      status,
      backendCode,
    );
  }

  if (status === 400) {
    return new AssessmentExecutionApiError('validation', status, backendCode);
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

export async function getScaleInstanceExecutionDetail(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  options: RequestOptions = {},
): Promise<ScaleInstanceExecutionDetailResponse> {
  const response = await assessmentExecutionFetch(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances/${encodeURIComponent(scaleInstanceId)}`,
    {
      method: 'GET',
      signal: options.signal,
    },
  );

  return readJson<ScaleInstanceExecutionDetailResponse>(response);
}

export async function getScaleInstanceSubmissionReadiness(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  options: RequestOptions = {},
): Promise<ScaleSubmissionReadinessResponse> {
  const response = await assessmentExecutionFetch(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances/${encodeURIComponent(scaleInstanceId)}/submission-readiness`,
    {
      method: 'GET',
      signal: options.signal,
    },
  );

  return readJson<ScaleSubmissionReadinessResponse>(response);
}

export async function submitScaleInstance(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  input: SubmitScaleInstanceRequest,
): Promise<SubmitScaleInstanceResponse> {
  const requestBody: SubmitScaleInstanceRequest = { confirm: input.confirm };
  const response = await assessmentExecutionFetch(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances/${encodeURIComponent(scaleInstanceId)}/submit`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  return readJson<SubmitScaleInstanceResponse>(response);
}

function buildStepRequest(
  step: UpdateItemStepDraftRequest,
): UpdateItemStepDraftRequest {
  return {
    stepCode: step.stepCode,
    ...(step.actualValue !== undefined
      ? { actualValue: step.actualValue }
      : {}),
    ...(step.note !== undefined ? { note: step.note } : {}),
  };
}

function buildPromptRequest(
  prompt: UpdatePromptResponseDraftRequest,
): UpdatePromptResponseDraftRequest {
  return {
    promptType: prompt.promptType,
    order: prompt.order,
    ...(prompt.responseAfterPrompt !== undefined
      ? { responseAfterPrompt: prompt.responseAfterPrompt }
      : {}),
    ...(prompt.note !== undefined ? { note: prompt.note } : {}),
  };
}

function buildTimingRequest(
  timing: UpdateItemTimingDraftRequest,
): UpdateItemTimingDraftRequest {
  return {
    ...(timing.startedAt !== undefined ? { startedAt: timing.startedAt } : {}),
    ...(timing.completedAt !== undefined
      ? { completedAt: timing.completedAt }
      : {}),
    ...(timing.durationMs !== undefined
      ? { durationMs: timing.durationMs }
      : {}),
    ...(timing.timerSource !== undefined
      ? { timerSource: timing.timerSource }
      : {}),
  };
}

function buildItemResponseDraftRequest(
  input: UpdateItemResponseDraftRequest,
): UpdateItemResponseDraftRequest {
  return {
    ...(input.rawResponse !== undefined
      ? { rawResponse: input.rawResponse }
      : {}),
    ...(input.structuredResponse !== undefined
      ? { structuredResponse: input.structuredResponse }
      : {}),
    ...(input.responseText !== undefined
      ? { responseText: input.responseText }
      : {}),
    ...(input.isMissing !== undefined ? { isMissing: input.isMissing } : {}),
    ...(input.missingReason !== undefined
      ? { missingReason: input.missingReason }
      : {}),
    ...(input.stepResponses !== undefined
      ? { stepResponses: input.stepResponses.map(buildStepRequest) }
      : {}),
    ...(input.promptResponses !== undefined
      ? { promptResponses: input.promptResponses.map(buildPromptRequest) }
      : {}),
    ...(input.timing !== undefined
      ? {
          timing:
            input.timing === null ? null : buildTimingRequest(input.timing),
        }
      : {}),
    ...(input.operatorNote !== undefined
      ? { operatorNote: input.operatorNote }
      : {}),
    ...(input.markAsAnswered !== undefined
      ? { markAsAnswered: input.markAsAnswered }
      : {}),
  };
}

export async function saveItemResponseDraft(
  patientId: string,
  visitId: string,
  scaleInstanceId: string,
  itemResponseId: string,
  input: UpdateItemResponseDraftRequest,
): Promise<UpdateItemResponseDraftResponse> {
  const response = await assessmentExecutionFetch(
    `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/scale-instances/${encodeURIComponent(scaleInstanceId)}/item-responses/${encodeURIComponent(itemResponseId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildItemResponseDraftRequest(input)),
    },
  );

  return readJson<UpdateItemResponseDraftResponse>(response);
}
