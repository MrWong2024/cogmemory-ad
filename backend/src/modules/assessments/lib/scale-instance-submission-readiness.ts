import type { PatientStatus } from '../../patients/schemas/patient.schema';
import type { ScaleItemConfigSummary } from '../../scales/services/scales.service';
import type { AssessmentStatus } from '../schemas/assessment-visit.schema';
import type {
  ItemEvidenceRefSummary,
  ItemResponseSummary,
  ScaleInstanceSummary,
} from '../services/assessments.service';
import type {
  ScaleSubmissionIssueResponse,
  ScaleSubmissionReadinessSummaryResponse,
  ScaleSubmissionState,
} from '../types/scale-instance-submission-response.types';
import {
  hasMeaningfulItemResponseAnswer,
  hasMeaningfulJsonValue,
  isPlainRecord,
} from './item-response-answer-content';

const COMPLETED_ITEM_STATUSES = new Set(['answered', 'scored']);
const EDITABLE_STATUSES = new Set(['draft', 'in_progress']);
const MEDIA_EVIDENCE_ORDER = ['photo', 'handwriting'] as const;
type MediaEvidenceType = (typeof MEDIA_EVIDENCE_ORDER)[number];

export type ScaleSubmissionReadinessEvaluationInput = {
  patientStatus: PatientStatus;
  visitStatus: AssessmentStatus;
  scaleInstance: ScaleInstanceSummary;
  versionItems: ScaleItemConfigSummary[];
  itemResponses: ItemResponseSummary[];
  checkedAt: Date;
};

export type ScaleSubmissionReadinessEvaluation = {
  checkedAt: Date;
  ready: boolean;
  canSubmitNow: boolean;
  submissionState: ScaleSubmissionState;
  stateReason?: string;
  summary: ScaleSubmissionReadinessSummaryResponse;
  blockingIssues: ScaleSubmissionIssueResponse[];
  warnings: ScaleSubmissionIssueResponse[];
  earliestValidItemTimingStart: Date | null;
};

type EffectiveItemConfig = {
  responseType: string;
  evidenceTypes: string[];
  requiresTimer: boolean;
  supportsPhotoUpload: boolean;
  supportsHandwriting: boolean;
  requiresOperatorNote: boolean;
  qualityControlRule: Record<string, unknown> | null;
};

type MediaRequirement = {
  mode: 'one_of' | 'all';
  types: MediaEvidenceType[];
};

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function readBoolean(
  record: Record<string, unknown>,
  propertyName: string,
  fallback: boolean,
): boolean {
  const value = record[propertyName];
  return typeof value === 'boolean' ? value : fallback;
}

function readStringArray(
  record: Record<string, unknown>,
  propertyName: string,
): string[] {
  const value = record[propertyName];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function readEffectiveItemConfig(
  itemResponse: ItemResponseSummary,
  versionItem?: ScaleItemConfigSummary,
): EffectiveItemConfig {
  const snapshot = isPlainRecord(itemResponse.itemConfigSnapshot)
    ? itemResponse.itemConfigSnapshot
    : {};
  const snapshotQualityRule = snapshot.qualityControlRule;
  const versionQualityRule = versionItem?.qualityControlRule;

  return {
    responseType:
      typeof snapshot.responseType === 'string'
        ? snapshot.responseType
        : (versionItem?.responseType ?? itemResponse.responseType),
    evidenceTypes: [
      ...new Set([
        ...(versionItem?.evidenceTypes ?? []),
        ...readStringArray(snapshot, 'evidenceTypes'),
      ]),
    ],
    requiresTimer: readBoolean(
      snapshot,
      'requiresTimer',
      versionItem?.requiresTimer ?? false,
    ),
    supportsPhotoUpload: readBoolean(
      snapshot,
      'supportsPhotoUpload',
      versionItem?.supportsPhotoUpload ?? false,
    ),
    supportsHandwriting: readBoolean(
      snapshot,
      'supportsHandwriting',
      versionItem?.supportsHandwriting ?? false,
    ),
    requiresOperatorNote: readBoolean(
      snapshot,
      'requiresOperatorNote',
      versionItem?.requiresOperatorNote ?? false,
    ),
    qualityControlRule: isPlainRecord(snapshotQualityRule)
      ? snapshotQualityRule
      : isPlainRecord(versionQualityRule)
        ? versionQualityRule
        : null,
  };
}

function readRequiredEvidenceTypes(config: EffectiveItemConfig): string[] {
  const required = config.qualityControlRule?.requireEvidence;
  return Array.isArray(required)
    ? required.filter((value): value is string =>
        [
          'photo',
          'handwriting',
          'duration',
          'raw_text',
          'operator_note',
        ].includes(typeof value === 'string' ? value : ''),
      )
    : [];
}

function deriveMediaRequirement(
  config: EffectiveItemConfig,
): MediaRequirement | null {
  const explicitlyRequired = readRequiredEvidenceTypes(config).filter(
    (value): value is MediaEvidenceType =>
      value === 'photo' || value === 'handwriting',
  );
  const explicitTypes = MEDIA_EVIDENCE_ORDER.filter((type) =>
    explicitlyRequired.includes(type),
  );

  if (explicitTypes.length > 0) {
    return {
      mode: explicitTypes.length === 2 ? 'one_of' : 'all',
      types: explicitTypes,
    };
  }

  if (
    !['drawing', 'photo_upload', 'handwriting'].includes(config.responseType)
  ) {
    return null;
  }

  const supported = MEDIA_EVIDENCE_ORDER.filter(
    (type) =>
      (type === 'photo' && config.supportsPhotoUpload) ||
      (type === 'handwriting' && config.supportsHandwriting),
  );

  return supported.length > 0
    ? { mode: supported.length === 2 ? 'one_of' : 'all', types: supported }
    : null;
}

function isAttachedEvidence(
  evidenceRefs: ItemEvidenceRefSummary[],
  evidenceType: MediaEvidenceType,
): boolean {
  return evidenceRefs.some(
    (reference) =>
      reference.evidenceType === evidenceType &&
      reference.status === 'attached' &&
      Boolean(reference.mediaEvidenceId?.trim()),
  );
}

function toItemIssueBase(
  itemResponse: ItemResponseSummary,
): Pick<
  ScaleSubmissionIssueResponse,
  | 'scope'
  | 'itemResponseId'
  | 'itemCode'
  | 'crfCode'
  | 'itemTitle'
  | 'itemOrder'
  | 'groupCode'
> {
  return {
    scope: 'item',
    itemResponseId: itemResponse.id,
    itemCode: itemResponse.itemCode,
    crfCode: itemResponse.crfCode,
    itemTitle: itemResponse.itemTitle,
    itemOrder: itemResponse.itemOrder,
    groupCode: itemResponse.groupCode,
  };
}

function toTime(value: Date | null): number | null {
  if (!(value instanceof Date)) {
    return null;
  }

  const time = value.getTime();
  return Number.isFinite(time) ? time : null;
}

export function sortSubmissionIssues(
  issues: ScaleSubmissionIssueResponse[],
): ScaleSubmissionIssueResponse[] {
  return [...issues].sort((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope === 'scale_instance' ? -1 : 1;
    }

    const orderDifference =
      (left.itemOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.itemOrder ?? Number.MAX_SAFE_INTEGER);
    return orderDifference || left.code.localeCompare(right.code);
  });
}

function deriveSubmissionState(input: {
  patientStatus: PatientStatus;
  visitStatus: AssessmentStatus;
  instanceStatus: AssessmentStatus;
  ready: boolean;
}): { state: ScaleSubmissionState; reason?: string } {
  if (input.instanceStatus === 'completed') {
    return {
      state: 'completed',
      reason: 'Scale instance is already completed',
    };
  }
  if (input.instanceStatus === 'locked') {
    return { state: 'locked', reason: 'Scale instance is locked' };
  }
  if (input.instanceStatus === 'voided') {
    return { state: 'voided', reason: 'Scale instance is voided' };
  }
  if (input.patientStatus !== 'active') {
    return { state: 'patient_inactive', reason: 'Patient is not active' };
  }
  if (!EDITABLE_STATUSES.has(input.visitStatus)) {
    return {
      state: 'visit_not_editable',
      reason: 'Assessment visit is not editable',
    };
  }
  if (!EDITABLE_STATUSES.has(input.instanceStatus)) {
    return { state: 'editable', reason: 'Scale instance is not editable' };
  }
  return input.ready ? { state: 'ready' } : { state: 'incomplete' };
}

export function evaluateScaleInstanceSubmissionReadiness(
  input: ScaleSubmissionReadinessEvaluationInput,
): ScaleSubmissionReadinessEvaluation {
  const blockingIssues: ScaleSubmissionIssueResponse[] = [];
  const warnings: ScaleSubmissionIssueResponse[] = [];
  const expectedByCode = new Map(
    input.versionItems.map((item) => [normalizeCode(item.code), item]),
  );
  const actualCodes = input.itemResponses.map((item) =>
    normalizeCode(item.itemCode),
  );
  const actualCodeSet = new Set(actualCodes);
  const missingItemCodes = [...expectedByCode.keys()]
    .filter((code) => !actualCodeSet.has(code))
    .sort();
  const unexpectedItemCodes = [...new Set(actualCodes)]
    .filter((code) => !expectedByCode.has(code))
    .sort();

  if (
    input.versionItems.length !== input.itemResponses.length ||
    missingItemCodes.length > 0 ||
    unexpectedItemCodes.length > 0 ||
    actualCodeSet.size !== actualCodes.length
  ) {
    blockingIssues.push({
      code: 'SCALE_INSTANCE_ITEM_SET_MISMATCH',
      severity: 'blocking',
      scope: 'scale_instance',
      missingItemCodes,
      unexpectedItemCodes,
      message: 'Scale instance item set does not match its scale version',
    });
  }

  const checkedAtTime = input.checkedAt.getTime();
  const instanceStartedAtTime = toTime(input.scaleInstance.startedAt);
  if (
    input.scaleInstance.startedAt &&
    (instanceStartedAtTime === null || instanceStartedAtTime > checkedAtTime)
  ) {
    blockingIssues.push({
      code: 'SCALE_INSTANCE_START_TIME_INVALID',
      severity: 'blocking',
      scope: 'scale_instance',
      message: 'Scale instance start time is invalid',
    });
  }

  let missingItemCount = 0;
  let requiredMediaItemCount = 0;
  let satisfiedMediaItemCount = 0;
  const validItemStarts: Date[] = [];

  for (const itemResponse of input.itemResponses) {
    const itemBase = toItemIssueBase(itemResponse);
    const versionItem = expectedByCode.get(
      normalizeCode(itemResponse.itemCode),
    );
    const config = readEffectiveItemConfig(itemResponse, versionItem);
    const itemStartedAtTime = toTime(itemResponse.timing?.startedAt ?? null);

    if (itemStartedAtTime !== null && itemStartedAtTime <= checkedAtTime) {
      validItemStarts.push(new Date(itemStartedAtTime));
    }

    if (
      itemResponse.evidenceRefs.some(
        (reference) =>
          (reference.evidenceType === 'photo' ||
            reference.evidenceType === 'handwriting') &&
          ((reference.status === 'attached' && !reference.mediaEvidenceId) ||
            (Boolean(reference.mediaEvidenceId) &&
              reference.status !== 'attached')),
      )
    ) {
      blockingIssues.push({
        ...itemBase,
        code: 'ITEM_EVIDENCE_REFERENCE_INCONSISTENT',
        severity: 'blocking',
        message: 'Media evidence reference is inconsistent',
      });
    }

    if (!COMPLETED_ITEM_STATUSES.has(itemResponse.status)) {
      blockingIssues.push({
        ...itemBase,
        code: 'ITEM_NOT_COMPLETED',
        severity: 'blocking',
        message: 'Item response is not completed',
      });
    }

    if (itemResponse.isMissing) {
      missingItemCount += 1;
      if (!itemResponse.missingReason?.trim()) {
        blockingIssues.push({
          ...itemBase,
          code: 'ITEM_MISSING_REASON_REQUIRED',
          severity: 'blocking',
          message: 'Missing item requires a reason',
        });
      }
      continue;
    }

    if (itemResponse.missingReason?.trim()) {
      warnings.push({
        ...itemBase,
        code: 'ITEM_STALE_MISSING_REASON',
        severity: 'warning',
        message: 'Non-missing item retains a missing reason',
      });
    }

    if (
      !hasMeaningfulItemResponseAnswer({
        rawResponse: itemResponse.rawResponse,
        structuredResponse: itemResponse.structuredResponse,
        responseText: itemResponse.responseText,
        isMissing: false,
        stepValues: itemResponse.stepResults.map((step) => step.actualValue),
        promptValues: itemResponse.promptResponses.map(
          (prompt) => prompt.responseAfterPrompt,
        ),
      })
    ) {
      blockingIssues.push({
        ...itemBase,
        code: 'ITEM_ANSWER_CONTENT_MISSING',
        severity: 'blocking',
        message: 'Completed item has no meaningful answer content',
      });
    }

    const missingStepCodes = itemResponse.stepResults
      .filter(
        (step) =>
          step.countsTowardItemScore &&
          !hasMeaningfulJsonValue(step.actualValue),
      )
      .sort(
        (left, right) =>
          left.order - right.order ||
          left.stepCode.localeCompare(right.stepCode),
      )
      .map((step) => step.stepCode);
    if (missingStepCodes.length > 0) {
      blockingIssues.push({
        ...itemBase,
        code: 'ITEM_REQUIRED_STEP_MISSING',
        severity: 'blocking',
        missingStepCodes,
        message: 'Required item steps are incomplete',
      });
    }

    const requiredEvidenceTypes = readRequiredEvidenceTypes(config);
    const requiresTiming =
      config.requiresTimer ||
      config.evidenceTypes.includes('duration') ||
      requiredEvidenceTypes.includes('duration');
    const startedAtTime = toTime(itemResponse.timing?.startedAt ?? null);
    const completedAtTime = toTime(itemResponse.timing?.completedAt ?? null);
    const durationMs = itemResponse.timing?.durationMs;
    const hasValidDuration =
      typeof durationMs === 'number' &&
      Number.isFinite(durationMs) &&
      Number.isInteger(durationMs) &&
      durationMs >= 0;

    if (requiresTiming && !hasValidDuration) {
      blockingIssues.push({
        ...itemBase,
        code: 'ITEM_REQUIRED_TIMING_MISSING',
        severity: 'blocking',
        message: 'Required item timing is missing',
      });
    }
    if (
      startedAtTime !== null &&
      completedAtTime !== null &&
      completedAtTime < startedAtTime
    ) {
      blockingIssues.push({
        ...itemBase,
        code: 'ITEM_INVALID_TIMING',
        severity: 'blocking',
        message: 'Item timing order is invalid',
      });
    } else if (
      hasValidDuration &&
      (startedAtTime === null) !== (completedAtTime === null)
    ) {
      warnings.push({
        ...itemBase,
        code: 'ITEM_TIMING_POINTS_INCOMPLETE',
        severity: 'warning',
        message: 'Item timing points are incomplete',
      });
    }

    const mediaRequirement = deriveMediaRequirement(config);
    if (mediaRequirement) {
      requiredMediaItemCount += 1;
      const missingReferenceTypes = mediaRequirement.types.filter(
        (type) =>
          !itemResponse.evidenceRefs.some(
            (reference) => reference.evidenceType === type,
          ),
      );
      if (missingReferenceTypes.length > 0) {
        blockingIssues.push({
          ...itemBase,
          code: 'ITEM_EVIDENCE_REQUIREMENT_CONFIGURATION_MISMATCH',
          severity: 'blocking',
          requiredEvidenceMode: mediaRequirement.mode,
          requiredEvidenceTypes: missingReferenceTypes,
          message: 'Required media evidence reference is not configured',
        });
      }

      const satisfiedTypes = mediaRequirement.types.filter((type) =>
        isAttachedEvidence(itemResponse.evidenceRefs, type),
      );
      const mediaSatisfied =
        mediaRequirement.mode === 'one_of'
          ? satisfiedTypes.length > 0
          : satisfiedTypes.length === mediaRequirement.types.length;
      if (mediaSatisfied) {
        satisfiedMediaItemCount += 1;
      } else {
        blockingIssues.push({
          ...itemBase,
          code: 'ITEM_REQUIRED_MEDIA_MISSING',
          severity: 'blocking',
          requiredEvidenceMode: mediaRequirement.mode,
          requiredEvidenceTypes: mediaRequirement.types,
          message: 'Required media evidence is missing',
        });
      }
    }

    if (
      (config.requiresOperatorNote ||
        requiredEvidenceTypes.includes('operator_note')) &&
      !itemResponse.operatorNote?.trim()
    ) {
      blockingIssues.push({
        ...itemBase,
        code: 'ITEM_REQUIRED_OPERATOR_NOTE_MISSING',
        severity: 'blocking',
        message: 'Required operator note is missing',
      });
    }
  }

  validItemStarts.sort((left, right) => left.getTime() - right.getTime());
  const earliestValidItemTimingStart = validItemStarts[0] ?? null;
  if (instanceStartedAtTime === null && !earliestValidItemTimingStart) {
    warnings.push({
      code: 'SCALE_INSTANCE_DURATION_UNAVAILABLE',
      severity: 'warning',
      scope: 'scale_instance',
      message: 'Scale instance duration cannot be derived',
    });
  }

  const sortedBlockingIssues = sortSubmissionIssues(blockingIssues);
  const sortedWarnings = sortSubmissionIssues(warnings);
  const completedItemCount = input.itemResponses.filter((item) =>
    COMPLETED_ITEM_STATUSES.has(item.status),
  ).length;
  const ready = sortedBlockingIssues.length === 0;
  const state = deriveSubmissionState({
    patientStatus: input.patientStatus,
    visitStatus: input.visitStatus,
    instanceStatus: input.scaleInstance.status,
    ready,
  });
  const canSubmitNow =
    ready &&
    input.patientStatus === 'active' &&
    EDITABLE_STATUSES.has(input.visitStatus) &&
    EDITABLE_STATUSES.has(input.scaleInstance.status);

  return {
    checkedAt: new Date(input.checkedAt.getTime()),
    ready,
    canSubmitNow,
    submissionState: state.state,
    ...(state.reason ? { stateReason: state.reason } : {}),
    summary: {
      expectedItemCount: input.versionItems.length,
      actualItemCount: input.itemResponses.length,
      completedItemCount,
      incompleteItemCount: input.itemResponses.length - completedItemCount,
      missingItemCount,
      requiredMediaItemCount,
      satisfiedMediaItemCount,
      blockingIssueCount: sortedBlockingIssues.length,
      warningCount: sortedWarnings.length,
    },
    blockingIssues: sortedBlockingIssues,
    warnings: sortedWarnings,
    earliestValidItemTimingStart,
  };
}
