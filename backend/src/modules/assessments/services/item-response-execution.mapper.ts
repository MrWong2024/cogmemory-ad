import {
  ITEM_EVIDENCE_TYPES,
  type ItemEvidenceType,
} from '../schemas/item-response.schema';
import {
  ItemResponseDraftJsonValidationError,
  validateAndCloneDraftJsonValue,
  validateAndCloneStructuredDraft,
} from '../lib/item-response-draft-json';
import type { ItemResponseSummary } from './assessments.service';
import type {
  ItemExecutionConfigResponse,
  ItemExecutionScoreRangeResponse,
  ItemResponseDraftJsonValue,
  ItemResponseExecutionResponse,
} from '../types/item-response-execution-response.types';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function readOptionalString(
  record: Record<string, unknown>,
  propertyName: string,
): string | undefined {
  const value = record[propertyName];

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
}

function readBoolean(
  record: Record<string, unknown>,
  propertyName: string,
): boolean {
  const value = record[propertyName];
  return typeof value === 'boolean' ? value : false;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readScoreRange(
  config: Record<string, unknown>,
  itemResponse: ItemResponseSummary,
): ItemExecutionScoreRangeResponse {
  const configuredRange = config.scoreRange;
  const range = isPlainRecord(configuredRange) ? configuredRange : {};
  const step = readFiniteNumber(range.step);

  return {
    min:
      readFiniteNumber(range.min) ??
      readFiniteNumber(itemResponse.score?.minScore),
    max:
      readFiniteNumber(range.max) ??
      readFiniteNumber(itemResponse.score?.maxScore),
    ...(step === null ? {} : { step }),
  };
}

function isItemEvidenceType(value: unknown): value is ItemEvidenceType {
  return (
    typeof value === 'string' &&
    (ITEM_EVIDENCE_TYPES as readonly string[]).includes(value)
  );
}

function readEvidenceTypes(
  config: Record<string, unknown>,
): ItemEvidenceType[] {
  const evidenceTypes = config.evidenceTypes;

  if (!Array.isArray(evidenceTypes)) {
    return [];
  }

  return [...new Set(evidenceTypes.filter(isItemEvidenceType))];
}

function toExecutionConfig(
  itemResponse: ItemResponseSummary,
): ItemExecutionConfigResponse {
  const config = isPlainRecord(itemResponse.itemConfigSnapshot)
    ? itemResponse.itemConfigSnapshot
    : {};

  return {
    prompt: readOptionalString(config, 'prompt'),
    instruction: readOptionalString(config, 'instruction'),
    scoreRange: readScoreRange(config, itemResponse),
    evidenceTypes: readEvidenceTypes(config),
    requiresTimer: readBoolean(config, 'requiresTimer'),
    supportsPhotoUpload: readBoolean(config, 'supportsPhotoUpload'),
    supportsHandwriting: readBoolean(config, 'supportsHandwriting'),
    requiresOperatorNote: readBoolean(config, 'requiresOperatorNote'),
  };
}

function toSafeJsonValue(value: unknown): ItemResponseDraftJsonValue {
  try {
    return validateAndCloneDraftJsonValue(value);
  } catch (error: unknown) {
    if (error instanceof ItemResponseDraftJsonValidationError) {
      return null;
    }

    throw error;
  }
}

function toSafeStructuredValue(
  value: unknown,
): { [key: string]: ItemResponseDraftJsonValue } | null {
  try {
    return validateAndCloneStructuredDraft(value);
  } catch (error: unknown) {
    if (error instanceof ItemResponseDraftJsonValidationError) {
      return null;
    }

    throw error;
  }
}

export function toItemResponseExecutionResponse(
  itemResponse: ItemResponseSummary,
): ItemResponseExecutionResponse {
  return {
    id: itemResponse.id,
    scaleInstanceId: itemResponse.scaleInstanceId,
    itemCode: itemResponse.itemCode,
    crfCode: itemResponse.crfCode,
    groupCode: itemResponse.groupCode,
    itemTitle: itemResponse.itemTitle,
    itemOrder: itemResponse.itemOrder,
    responseType: itemResponse.responseType,
    countsTowardTotal: itemResponse.countsTowardTotal,
    cognitiveDomainCodes: [...itemResponse.cognitiveDomainCodes],
    versionTrace: itemResponse.versionTrace
      ? {
          scaleVersion: itemResponse.versionTrace.scaleVersion,
          crfVersion: itemResponse.versionTrace.crfVersion,
          scoringRuleVersion: itemResponse.versionTrace.scoringRuleVersion,
          fieldEncodingVersion: itemResponse.versionTrace.fieldEncodingVersion,
          sourceDocument: itemResponse.versionTrace.sourceDocument,
        }
      : null,
    config: toExecutionConfig(itemResponse),
    status: itemResponse.status,
    answerSource: itemResponse.answerSource,
    rawResponse: toSafeJsonValue(itemResponse.rawResponse),
    structuredResponse: toSafeStructuredValue(itemResponse.structuredResponse),
    responseText: itemResponse.responseText,
    isMissing: itemResponse.isMissing,
    missingReason: itemResponse.missingReason,
    stepResponses: itemResponse.stepResults.map((stepResult) => ({
      stepCode: stepResult.stepCode,
      crfCode: stepResult.crfCode,
      label: stepResult.label,
      order: stepResult.order,
      actualValue: toSafeJsonValue(stepResult.actualValue),
      countsTowardItemScore: stepResult.countsTowardItemScore,
      note: stepResult.note,
    })),
    promptResponses: itemResponse.promptResponses.map((promptResponse) => ({
      promptType: promptResponse.promptType,
      promptText: promptResponse.promptText,
      responseAfterPrompt: toSafeJsonValue(promptResponse.responseAfterPrompt),
      countsTowardScore: promptResponse.countsTowardScore,
      order: promptResponse.order,
      note: promptResponse.note,
    })),
    timing: itemResponse.timing
      ? {
          startedAt: itemResponse.timing.startedAt,
          completedAt: itemResponse.timing.completedAt,
          durationMs: itemResponse.timing.durationMs,
          timerSource: itemResponse.timing.timerSource,
        }
      : null,
    evidenceRequirements: itemResponse.evidenceRefs.map((evidenceRef) => ({
      evidenceType: evidenceRef.evidenceType,
      status: evidenceRef.status,
      attached: evidenceRef.mediaEvidenceId !== null,
    })),
    operatorNote: itemResponse.operatorNote,
  };
}
