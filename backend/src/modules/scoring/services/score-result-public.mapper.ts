import { Injectable } from '@nestjs/common';
import type { ScaleVersionSummary } from '../../scales/services/scales.service';
import type { ScoreItemSummary, ScoreResultSummary } from './scoring.service';
import {
  SCORE_COMPUTATION_WARNING_CODES,
  SCORE_REVIEW_REASON_CODES,
  type ScoreComputationWarningCode,
  type ScoreReviewReasonCode,
} from '../types/provisional-scoring.types';
import type {
  ProvisionalScoreGroupResponse,
  ProvisionalScoreItemResponse,
  ProvisionalScoreResultResponse,
  ScoreReviewQueueItemResponse,
} from '../types/score-result-response.types';

const REASON_MESSAGES: Record<ScoreReviewReasonCode, string> = {
  MANUAL_SCORING_REQUIRED: 'This item requires manual scoring review.',
  UNSUPPORTED_SCORING_MODE: 'This item uses an unsupported scoring mode.',
  MISSING_RESPONSE_REQUIRES_REVIEW:
    'A missing response requires manual review.',
  PREEXISTING_ITEM_SCORE_REQUIRES_REVIEW:
    'An existing item score requires manual review.',
  STEP_CONFIGURATION_INVALID:
    'The step scoring configuration requires manual review.',
  STEP_RESPONSE_MISSING: 'A required scoring step is missing.',
  STEP_RESPONSE_TYPE_UNSUPPORTED:
    'A scoring step uses an unsupported value type.',
  AGGREGATION_RULE_UNSUPPORTED:
    'The aggregation rule is not supported for automatic scoring.',
  AGGREGATION_RULE_INVALID: 'The aggregation rule requires manual review.',
  ITEM_SCORE_RANGE_INVALID: 'The item score range requires manual review.',
  AUTO_SCORE_RESULT_INVALID:
    'The automatic score result requires manual review.',
  NON_SCORING_PROCESS_ITEM: 'Process record; not included in scoring.',
};

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function controlledReason(note?: string): ScoreReviewReasonCode | undefined {
  return SCORE_REVIEW_REASON_CODES.find((code) => code === note);
}

function publicReason(
  item: ScoreItemSummary,
): ScoreReviewReasonCode | undefined {
  const known = controlledReason(item.note);
  if (known) {
    return known;
  }
  return item.scoreStatus === 'needs_review'
    ? 'MANUAL_SCORING_REQUIRED'
    : undefined;
}

function parseWarningCodes(notes?: string): ScoreComputationWarningCode[] {
  if (!notes?.startsWith('warning_codes=')) {
    return [];
  }
  const candidates = notes.slice('warning_codes='.length).split(',');
  return SCORE_COMPUTATION_WARNING_CODES.filter((code) =>
    candidates.includes(code),
  );
}

@Injectable()
export class ScoreResultPublicMapper {
  toPublicResult(
    result: ScoreResultSummary,
    version: ScaleVersionSummary,
  ): {
    scoreResult: ProvisionalScoreResultResponse;
    reviewQueue: ScoreReviewQueueItemResponse[];
  } {
    const itemScores = result.itemScores.map((item) => this.mapItem(item));
    const reviewQueue = itemScores
      .filter((item) => item.reviewRequired)
      .map((item) => ({
        itemResponseId: item.itemResponseId,
        itemCode: item.itemCode,
        crfCode: item.crfCode,
        groupCode: item.groupCode,
        itemTitle: item.itemTitle,
        itemOrder: item.itemOrder,
        responseType: item.responseType,
        countsTowardTotal: item.countsTowardTotal,
        reasonCode: item.reviewReasonCode ?? 'MANUAL_SCORING_REQUIRED',
        reasonMessage:
          item.reviewReasonMessage ?? REASON_MESSAGES.MANUAL_SCORING_REQUIRED,
      }))
      .sort(
        (left, right) =>
          left.itemOrder - right.itemOrder ||
          left.itemCode.localeCompare(right.itemCode),
      );
    const total = result.totalScore;
    const isComplete =
      total !== null &&
      total.unscoredItemCount === 0 &&
      total.needsReviewItemCount === 0;
    const isFinal = result.status === 'confirmed' || result.status === 'locked';
    const groupMap = new Map(
      version.groups.map((group) => [group.code, group]),
    );
    const groupScores = result.groupScores
      .map((group) => this.mapGroup(group.groupCode, result, version))
      .sort((left, right) => {
        const leftOrder = groupMap.get(left.groupCode)?.order;
        const rightOrder = groupMap.get(right.groupCode)?.order;
        return (
          (leftOrder ?? Number.MAX_SAFE_INTEGER) -
            (rightOrder ?? Number.MAX_SAFE_INTEGER) ||
          left.groupCode.localeCompare(right.groupCode)
        );
      });
    const pendingItemCount = reviewQueue.length;

    return {
      scoreResult: {
        id: result.id,
        scoreResultCode: result.scoreResultCode,
        runNo: result.runNo,
        status: result.status,
        scoringSource: result.scoringSource,
        scoringMode: result.scoringMode,
        versionTrace: result.versionTrace
          ? {
              scaleVersion: result.versionTrace.scaleVersion,
              crfVersion: result.versionTrace.crfVersion,
              scoringRuleVersion: result.versionTrace.scoringRuleVersion,
              fieldEncodingVersion: result.versionTrace.fieldEncodingVersion,
              sourceDocument: result.versionTrace.sourceDocument,
            }
          : null,
        totalScore: {
          provisionalScoreValue: finiteOrNull(total?.scoreValue),
          minScore: finiteOrNull(total?.minScore),
          maxScore: finiteOrNull(total?.maxScore),
          scorePercent: isComplete ? finiteOrNull(total?.scorePercent) : null,
          totalItemCount: nonNegativeInteger(total?.totalItemCount),
          scoredItemCount: nonNegativeInteger(total?.scoredItemCount),
          unscoredItemCount: nonNegativeInteger(total?.unscoredItemCount),
          needsReviewItemCount: nonNegativeInteger(total?.needsReviewItemCount),
          missingItemCount: nonNegativeInteger(total?.missingItemCount),
          isComplete,
          isFinal,
        },
        groupScores,
        itemScores,
        computation: {
          computedAt: result.computation?.computedAt ?? null,
          engineVersion: result.computation?.engineVersion,
          scoringRuleVersion:
            result.computation?.ruleSetVersion ??
            result.versionTrace?.scoringRuleVersion,
          autoScoredItemCount: itemScores.filter(
            (item) => item.scoreStatus === 'auto_scored',
          ).length,
          pendingReviewItemCount: pendingItemCount,
          excludedItemCount: itemScores.filter(
            (item) => !item.countsTowardTotal,
          ).length,
          warningCodes: parseWarningCodes(result.computation?.notes),
        },
        review: {
          status: result.review?.reviewStatus ?? 'not_required',
          pendingItemCount,
        },
        qualityStatus: result.qualityStatus,
        isFinal,
      },
      reviewQueue,
    };
  }

  private mapItem(item: ScoreItemSummary): ProvisionalScoreItemResponse {
    const reasonCode = publicReason(item);
    const reviewRequired = item.scoreStatus === 'needs_review';
    return {
      itemResponseId: item.itemResponseId ?? null,
      itemCode: item.itemCode,
      crfCode: item.crfCode,
      groupCode: item.groupCode,
      itemTitle: item.itemTitle,
      itemOrder: item.itemOrder,
      responseType: item.responseType,
      countsTowardTotal: item.countsTowardTotal,
      includedInTotal: item.includedInTotal,
      provisionalScoreValue:
        item.scoreStatus === 'auto_scored' ||
        item.scoreStatus === 'manual_scored'
          ? finiteOrNull(item.scoreValue)
          : null,
      minScore: finiteOrNull(item.minScore),
      maxScore: finiteOrNull(item.maxScore),
      scoreStatus: item.scoreStatus,
      scoreSource: item.scoreSource,
      isMissing: item.isMissing,
      cognitiveDomainCodes: [...item.cognitiveDomainCodes],
      reviewRequired,
      ...(reasonCode ? { reviewReasonCode: reasonCode } : {}),
      ...(reasonCode
        ? { reviewReasonMessage: REASON_MESSAGES[reasonCode] }
        : {}),
    };
  }

  private mapGroup(
    groupCode: string,
    result: ScoreResultSummary,
    version: ScaleVersionSummary,
  ): ProvisionalScoreGroupResponse {
    const stored = result.groupScores.find(
      (group) => group.groupCode === groupCode,
    );
    const config = version.groups.find((group) => group.code === groupCode);
    const items = result.itemScores.filter(
      (item) => item.groupCode === groupCode && item.countsTowardTotal,
    );
    const scoredItemCount = items.filter(
      (item) => item.scoreValue !== null,
    ).length;
    const needsReviewItemCount = items.filter(
      (item) => item.scoreStatus === 'needs_review',
    ).length;
    const unscoredItemCount = items.filter(
      (item) => item.scoreValue === null,
    ).length;
    const missingItemCount = items.filter((item) => item.isMissing).length;
    return {
      groupCode,
      groupTitle: config?.title ?? stored?.groupTitle,
      order: config?.order,
      provisionalScoreValue: finiteOrNull(stored?.scoreValue),
      minScore: finiteOrNull(stored?.minScore),
      maxScore: finiteOrNull(stored?.maxScore),
      scoredItemCount,
      unscoredItemCount,
      needsReviewItemCount,
      missingItemCount,
      isComplete: unscoredItemCount === 0 && needsReviewItemCount === 0,
    };
  }
}
