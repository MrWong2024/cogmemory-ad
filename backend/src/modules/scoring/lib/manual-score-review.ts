import type { AssessmentOperatorRole } from '../../assessments/schemas/assessment-visit.schema';
import type { ScaleVersionSummary } from '../../scales/services/scales.service';
import type {
  ScoringComputationSummary,
  ScoreGroupSummary,
  ScoreResultSummary,
  TotalScoreSummary,
} from '../services/scoring.service';
import {
  SCORE_REVIEW_REASON_CODES,
  type ScoreReviewReasonCode,
} from '../types/provisional-scoring.types';
import type {
  A18ConfirmationAudit,
  A18ManualReviewEvent,
  ManualScoreReviewPrepared,
  ManualScoreReviewUpdate,
  ScoreReviewActor,
} from '../types/score-review.types';

export const MAX_A18_MANUAL_REVIEW_EVENTS = 500;
const SCORE_STEP_EPSILON = 1e-9;

export type ScoreReviewRuleErrorCode =
  | 'SCORE_INPUT_INVALID'
  | 'SCORE_ITEM_NOT_FOUND'
  | 'SCORE_ITEM_NOT_REVIEWABLE'
  | 'SCORE_MANUAL_VALUE_OUT_OF_RANGE'
  | 'SCORE_MANUAL_VALUE_STEP_INVALID'
  | 'SCORE_RESULT_METADATA_UNSUPPORTED'
  | 'SCORE_REVIEW_AUDIT_LIMIT_REACHED'
  | 'SCORE_RESULT_NOT_READY_FOR_CONFIRMATION'
  | 'SCORE_RESULT_CONFIRMATION_WARNINGS_PRESENT';

export class ScoreReviewRuleError extends Error {
  constructor(readonly code: ScoreReviewRuleErrorCode) {
    super(code);
  }
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function controlledReason(value: unknown): ScoreReviewReasonCode {
  return (
    SCORE_REVIEW_REASON_CODES.find((code) => code === value) ??
    'MANUAL_SCORING_REQUIRED'
  );
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function readRole(value: unknown): AssessmentOperatorRole | null {
  return (
    (
      ['doctor', 'nurse', 'research_assistant', 'admin', 'unknown'] as const
    ).find((role) => role === value) ?? null
  );
}

function validateScoreRange(
  min: unknown,
  max: unknown,
  step: unknown,
): asserts min is number {
  if (
    !isFiniteNumber(min) ||
    !isFiniteNumber(max) ||
    min > max ||
    (step !== undefined && (!isFiniteNumber(step) || step <= 0))
  ) {
    throw new ScoreReviewRuleError('SCORE_INPUT_INVALID');
  }
}

function validateManualScoreValue(
  scoreValue: number,
  min: number,
  max: number,
  step?: number,
): void {
  if (!isFiniteNumber(scoreValue)) {
    throw new ScoreReviewRuleError('SCORE_INPUT_INVALID');
  }
  if (scoreValue < min || scoreValue > max) {
    throw new ScoreReviewRuleError('SCORE_MANUAL_VALUE_OUT_OF_RANGE');
  }
  if (step === undefined) {
    return;
  }
  const stepCount = (scoreValue - min) / step;
  const tolerance = SCORE_STEP_EPSILON * Math.max(1, Math.abs(stepCount));
  if (Math.abs(stepCount - Math.round(stepCount)) > tolerance) {
    throw new ScoreReviewRuleError('SCORE_MANUAL_VALUE_STEP_INVALID');
  }
}

function cloneMetadataForManualReview(
  metadata: ScoreResultSummary['metadata'],
): { metadata: Record<string, unknown>; events: unknown[] } {
  if (metadata !== null && !isPlainRecord(metadata)) {
    throw new ScoreReviewRuleError('SCORE_RESULT_METADATA_UNSUPPORTED');
  }
  const cloned = metadata ? { ...metadata } : {};
  const namespace = cloned.a18ManualReview;
  if (namespace === undefined) {
    return { metadata: cloned, events: [] };
  }
  if (!isPlainRecord(namespace) || !Array.isArray(namespace.events)) {
    throw new ScoreReviewRuleError('SCORE_RESULT_METADATA_UNSUPPORTED');
  }
  if (namespace.version !== undefined && namespace.version !== 1) {
    throw new ScoreReviewRuleError('SCORE_RESULT_METADATA_UNSUPPORTED');
  }
  return {
    metadata: cloned,
    events: namespace.events.map((event: unknown) => event),
  };
}

export function prepareManualScoreReview(input: {
  result: ScoreResultSummary;
  version: ScaleVersionSummary;
  itemResponseId: string;
  scoreValue: number;
  reviewNote: string;
  reviewedAt: Date;
  eventId: string;
  actor: ScoreReviewActor;
}): ManualScoreReviewPrepared {
  const targetIndex = input.result.itemScores.findIndex(
    (item) => item.itemResponseId === input.itemResponseId,
  );
  if (targetIndex < 0) {
    throw new ScoreReviewRuleError('SCORE_ITEM_NOT_FOUND');
  }
  const target = input.result.itemScores[targetIndex];
  if (
    !target.countsTowardTotal ||
    (target.scoreStatus !== 'needs_review' &&
      target.scoreStatus !== 'manual_scored')
  ) {
    throw new ScoreReviewRuleError('SCORE_ITEM_NOT_REVIEWABLE');
  }
  if (
    input.result.itemScores.some(
      (item) =>
        item.countsTowardTotal &&
        !['auto_scored', 'manual_scored', 'needs_review'].includes(
          item.scoreStatus,
        ),
    )
  ) {
    throw new ScoreReviewRuleError('SCORE_INPUT_INVALID');
  }
  const versionItem = input.version.items.find(
    (item) => item.code === target.itemCode,
  );
  if (!versionItem || !versionItem.countsTowardTotal) {
    throw new ScoreReviewRuleError('SCORE_INPUT_INVALID');
  }
  const { min, max, step } = versionItem.scoreRange;
  validateScoreRange(min, max, step);
  if (target.minScore !== min || target.maxScore !== max) {
    throw new ScoreReviewRuleError('SCORE_INPUT_INVALID');
  }
  validateManualScoreValue(input.scoreValue, min, max, step);

  const { metadata, events } = cloneMetadataForManualReview(
    input.result.metadata,
  );
  if (events.length >= MAX_A18_MANUAL_REVIEW_EVENTS) {
    throw new ScoreReviewRuleError('SCORE_REVIEW_AUDIT_LIMIT_REACHED');
  }
  const event: A18ManualReviewEvent = {
    eventId: input.eventId,
    itemResponseId: input.itemResponseId,
    itemCode: target.itemCode,
    originalReasonCode: controlledReason(target.note),
    previousScoreValue: isFiniteNumber(target.scoreValue)
      ? target.scoreValue
      : null,
    scoreValue: input.scoreValue,
    reviewNote: input.reviewNote,
    reviewedAt: input.reviewedAt,
    reviewerId: input.actor.operatorId,
    reviewerName: input.actor.operatorName,
    reviewerRole: input.actor.operatorRole,
  };
  const itemScores = input.result.itemScores.map((item, index) =>
    index === targetIndex
      ? {
          ...item,
          scoreValue: input.scoreValue,
          scoreStatus: 'manual_scored' as const,
          scoreSource: 'operator' as const,
          includedInTotal: true,
          cognitiveDomainCodes: [...item.cognitiveDomainCodes],
        }
      : { ...item, cognitiveDomainCodes: [...item.cognitiveDomainCodes] },
  );
  metadata.a18ManualReview = {
    version: 1,
    events: [...events, event],
    lastUpdatedAt: input.reviewedAt,
    lastUpdatedBy: input.actor.operatorId,
  };
  return { itemScores, metadata, event };
}

function calculateScorePercent(
  scoreValue: number | null,
  minScore: number,
  maxScore: number,
  complete: boolean,
): number | null {
  const denominator = maxScore - minScore;
  if (
    !complete ||
    scoreValue === null ||
    !isFiniteNumber(scoreValue) ||
    !isFiniteNumber(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  return Math.min(
    100,
    Math.max(0, ((scoreValue - minScore) / denominator) * 100),
  );
}

function finalizeSummary(
  version: ScaleVersionSummary,
  summary: ScoringComputationSummary,
): { totalScore: TotalScoreSummary; groupScores: ScoreGroupSummary[] } {
  const { min, max, step } = version.totalScoreRange;
  validateScoreRange(min, max, step);
  const complete =
    summary.totalScore.unscoredItemCount === 0 &&
    summary.totalScore.needsReviewItemCount === 0;
  const groupByCode = new Map(
    version.groups.map((group) => [group.code, group]),
  );
  const groupScores = summary.groupScores
    .map((group) => ({
      ...group,
      groupTitle: groupByCode.get(group.groupCode)?.title,
    }))
    .sort((left, right) => {
      const leftOrder = groupByCode.get(left.groupCode)?.order;
      const rightOrder = groupByCode.get(right.groupCode)?.order;
      return (
        (leftOrder ?? Number.MAX_SAFE_INTEGER) -
          (rightOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.groupCode.localeCompare(right.groupCode)
      );
    });
  return {
    totalScore: {
      ...summary.totalScore,
      minScore: min,
      maxScore: max,
      scorePercent: calculateScorePercent(
        summary.totalScore.scoreValue,
        min,
        max,
        complete,
      ),
    },
    groupScores,
  };
}

export function finalizeManualScoreReview(input: {
  prepared: ManualScoreReviewPrepared;
  version: ScaleVersionSummary;
  summary: ScoringComputationSummary;
  actor: ScoreReviewActor;
  reviewedAt: Date;
  reviewNote: string;
}): ManualScoreReviewUpdate {
  if (input.summary.warnings.length > 0) {
    throw new ScoreReviewRuleError('SCORE_INPUT_INVALID');
  }
  const pendingItemCount = input.prepared.itemScores.filter(
    (item) => item.countsTowardTotal && item.scoreStatus === 'needs_review',
  ).length;
  const autoCount = input.prepared.itemScores.filter(
    (item) => item.countsTowardTotal && item.scoreStatus === 'auto_scored',
  ).length;
  const manualCount = input.prepared.itemScores.filter(
    (item) => item.countsTowardTotal && item.scoreStatus === 'manual_scored',
  ).length;
  if (autoCount + manualCount + pendingItemCount === 0) {
    throw new ScoreReviewRuleError('SCORE_INPUT_INVALID');
  }
  const scoringSource =
    autoCount > 0 && manualCount > 0
      ? 'mixed'
      : manualCount > 0
        ? 'manual'
        : 'auto_rule';
  const finalized = finalizeSummary(input.version, input.summary);
  return {
    ...input.prepared,
    ...finalized,
    status: pendingItemCount > 0 ? 'needs_review' : 'computed',
    scoringSource,
    review:
      pendingItemCount > 0
        ? {
            reviewStatus: 'pending',
            reviewedAt: null,
            reviewerId: null,
          }
        : {
            reviewStatus: 'reviewed',
            reviewedAt: input.reviewedAt,
            reviewerId: input.actor.operatorId,
            reviewerName: input.actor.operatorName,
            reviewNote: input.reviewNote,
          },
    qualityStatus: pendingItemCount > 0 ? 'needs_review' : 'unchecked',
    pendingItemCount,
  };
}

function equalNumber(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return Math.abs(left - right) <= SCORE_STEP_EPSILON;
}

function totalMatches(
  stored: TotalScoreSummary | null,
  expected: TotalScoreSummary,
): boolean {
  return (
    stored !== null &&
    equalNumber(stored.scoreValue, expected.scoreValue) &&
    equalNumber(stored.minScore, expected.minScore) &&
    equalNumber(stored.maxScore, expected.maxScore) &&
    equalNumber(stored.scorePercent, expected.scorePercent) &&
    stored.scoredItemCount === expected.scoredItemCount &&
    stored.totalItemCount === expected.totalItemCount &&
    stored.unscoredItemCount === expected.unscoredItemCount &&
    stored.missingItemCount === expected.missingItemCount &&
    stored.needsReviewItemCount === expected.needsReviewItemCount
  );
}

function groupsMatch(
  stored: ScoreGroupSummary[],
  expected: ScoreGroupSummary[],
): boolean {
  return (
    stored.length === expected.length &&
    stored.every((group, index) => {
      const candidate = expected[index];
      return (
        candidate !== undefined &&
        group.groupCode === candidate.groupCode &&
        group.groupTitle === candidate.groupTitle &&
        equalNumber(group.scoreValue, candidate.scoreValue) &&
        equalNumber(group.minScore, candidate.minScore) &&
        equalNumber(group.maxScore, candidate.maxScore) &&
        group.scoredItemCount === candidate.scoredItemCount &&
        group.totalItemCount === candidate.totalItemCount
      );
    })
  );
}

function hasComputationWarnings(result: ScoreResultSummary): boolean {
  return (
    (result.computation?.warningCount ?? 0) > 0 ||
    result.computation?.notes?.startsWith('warning_codes=') === true
  );
}

export function evaluateScoreConfirmationReadiness(input: {
  result: ScoreResultSummary;
  version: ScaleVersionSummary;
  summary: ScoringComputationSummary;
}): { totalScore: TotalScoreSummary; groupScores: ScoreGroupSummary[] } {
  if (hasComputationWarnings(input.result)) {
    throw new ScoreReviewRuleError(
      'SCORE_RESULT_CONFIRMATION_WARNINGS_PRESENT',
    );
  }
  if (input.result.status !== 'computed' || input.result.confirmedAt !== null) {
    throw new ScoreReviewRuleError('SCORE_RESULT_NOT_READY_FOR_CONFIRMATION');
  }
  const itemByCode = new Map(
    input.version.items.map((item) => [item.code, item]),
  );
  const scoreCodes = new Set<string>();
  for (const item of input.result.itemScores) {
    if (scoreCodes.has(item.itemCode)) {
      throw new ScoreReviewRuleError('SCORE_RESULT_NOT_READY_FOR_CONFIRMATION');
    }
    scoreCodes.add(item.itemCode);
    const versionItem = itemByCode.get(item.itemCode);
    if (
      !versionItem ||
      item.countsTowardTotal !== versionItem.countsTowardTotal
    ) {
      throw new ScoreReviewRuleError('SCORE_RESULT_NOT_READY_FOR_CONFIRMATION');
    }
    if (!item.countsTowardTotal) {
      continue;
    }
    const { min, max, step } = versionItem.scoreRange;
    try {
      validateScoreRange(min, max, step);
      if (
        item.minScore !== min ||
        item.maxScore !== max ||
        !isFiniteNumber(item.scoreValue)
      ) {
        throw new ScoreReviewRuleError(
          'SCORE_RESULT_NOT_READY_FOR_CONFIRMATION',
        );
      }
      validateManualScoreValue(item.scoreValue, min, max, step);
    } catch (error: unknown) {
      if (error instanceof ScoreReviewRuleError) {
        throw new ScoreReviewRuleError(
          'SCORE_RESULT_NOT_READY_FOR_CONFIRMATION',
        );
      }
      throw error;
    }
    const sourceMatches =
      (item.scoreStatus === 'auto_scored' &&
        item.scoreSource === 'auto_rule') ||
      (item.scoreStatus === 'manual_scored' &&
        item.scoreSource === 'operator');
    if (!sourceMatches || !item.includedInTotal) {
      throw new ScoreReviewRuleError('SCORE_RESULT_NOT_READY_FOR_CONFIRMATION');
    }
  }
  if (
    scoreCodes.size !== input.version.items.length ||
    input.summary.warnings.length > 0
  ) {
    throw new ScoreReviewRuleError('SCORE_RESULT_NOT_READY_FOR_CONFIRMATION');
  }
  const finalized = finalizeSummary(input.version, input.summary);
  if (
    finalized.totalScore.scorePercent === null ||
    !totalMatches(input.result.totalScore, finalized.totalScore) ||
    !groupsMatch(input.result.groupScores, finalized.groupScores)
  ) {
    throw new ScoreReviewRuleError('SCORE_RESULT_NOT_READY_FOR_CONFIRMATION');
  }
  return finalized;
}

export function prepareScoreConfirmation(input: {
  result: ScoreResultSummary;
  confirmationId: string;
  confirmedAt: Date;
  actor: ScoreReviewActor;
  reviewNote: string;
}): { metadata: Record<string, unknown>; audit: A18ConfirmationAudit } {
  if (input.result.metadata !== null && !isPlainRecord(input.result.metadata)) {
    throw new ScoreReviewRuleError('SCORE_RESULT_METADATA_UNSUPPORTED');
  }
  const metadata = input.result.metadata ? { ...input.result.metadata } : {};
  if (metadata.a18Confirmation !== undefined) {
    throw new ScoreReviewRuleError('SCORE_RESULT_METADATA_UNSUPPORTED');
  }
  const audit: A18ConfirmationAudit = {
    confirmationId: input.confirmationId,
    confirmedAt: input.confirmedAt,
    confirmedBy: input.actor.operatorId,
    confirmedByName: input.actor.operatorName,
    confirmedByRole: input.actor.operatorRole,
    reviewNote: input.reviewNote,
  };
  metadata.a18Confirmation = audit;
  return { metadata, audit };
}

export function readManualReviewEvents(
  metadata: ScoreResultSummary['metadata'],
): A18ManualReviewEvent[] {
  if (!isPlainRecord(metadata) || !isPlainRecord(metadata.a18ManualReview)) {
    return [];
  }
  const events = metadata.a18ManualReview.events;
  if (!Array.isArray(events)) {
    return [];
  }
  return events.flatMap((entry): A18ManualReviewEvent[] => {
    if (!isPlainRecord(entry)) {
      return [];
    }
    const reviewedAt = readDate(entry.reviewedAt);
    const reviewerRole = readRole(entry.reviewerRole);
    if (
      typeof entry.eventId !== 'string' ||
      typeof entry.itemResponseId !== 'string' ||
      typeof entry.itemCode !== 'string' ||
      !isFiniteNumber(entry.scoreValue) ||
      typeof entry.reviewNote !== 'string' ||
      !reviewedAt ||
      typeof entry.reviewerId !== 'string' ||
      typeof entry.reviewerName !== 'string' ||
      !reviewerRole
    ) {
      return [];
    }
    return [
      {
        eventId: entry.eventId,
        itemResponseId: entry.itemResponseId,
        itemCode: entry.itemCode,
        originalReasonCode: controlledReason(entry.originalReasonCode),
        previousScoreValue: isFiniteNumber(entry.previousScoreValue)
          ? entry.previousScoreValue
          : null,
        scoreValue: entry.scoreValue,
        reviewNote: entry.reviewNote,
        reviewedAt,
        reviewerId: entry.reviewerId,
        reviewerName: entry.reviewerName,
        reviewerRole,
      },
    ];
  });
}

export function readConfirmationAudit(
  metadata: ScoreResultSummary['metadata'],
): A18ConfirmationAudit | null {
  if (!isPlainRecord(metadata) || !isPlainRecord(metadata.a18Confirmation)) {
    return null;
  }
  const value = metadata.a18Confirmation;
  const confirmedAt = readDate(value.confirmedAt);
  const confirmedByRole = readRole(value.confirmedByRole);
  if (
    typeof value.confirmationId !== 'string' ||
    !confirmedAt ||
    typeof value.confirmedBy !== 'string' ||
    typeof value.confirmedByName !== 'string' ||
    !confirmedByRole ||
    typeof value.reviewNote !== 'string'
  ) {
    return null;
  }
  return {
    confirmationId: value.confirmationId,
    confirmedAt,
    confirmedBy: value.confirmedBy,
    confirmedByName: value.confirmedByName,
    confirmedByRole,
    reviewNote: value.reviewNote,
  };
}
