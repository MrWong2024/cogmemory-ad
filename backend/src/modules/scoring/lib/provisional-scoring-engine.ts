import type { ItemResponseSummary } from '../../assessments/services/assessments.service';
import type {
  ScaleItemConfigSummary,
  ScaleVersionSummary,
} from '../../scales/services/scales.service';
import type {
  ScoringComputationSummary,
  ScoringItemInput,
} from '../services/scoring.service';
import type {
  ProvisionalItemEvaluation,
  ProvisionalItemScore,
  ProvisionalScoringResult,
  ScoreReviewReasonCode,
} from '../types/provisional-scoring.types';

const MANUAL_MODES = new Set([
  'structured_manual',
  'manual_exact_match',
  'manual_observation',
  'manual_drawing_review',
  'structured_drawing_review',
  'timed_manual',
  'manual_concept_review',
  'delayed_recall_with_prompt_records',
  'raw_record_only',
]);

type RuleStep = {
  code: string;
  expected: number | boolean;
  maxScore: number;
};

type AggregationBand = {
  min: number;
  max: number;
  score: number;
};

type AutoScoreResult =
  | { scoreValue: number }
  | { reasonCode: ScoreReviewReasonCode };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
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

function isSupportedComparable(value: unknown): value is number | boolean {
  return isFiniteNumber(value) || typeof value === 'boolean';
}

function isValidScoreRange(item: ScaleItemConfigSummary): boolean {
  const { min, max, step } = item.scoreRange;
  return (
    isFiniteNumber(min) &&
    isFiniteNumber(max) &&
    min <= max &&
    (step === undefined || (isFiniteNumber(step) && step > 0))
  );
}

function normalizeScoreToRange(
  scoreValue: number,
  item: ScaleItemConfigSummary,
): number | null {
  if (!isFiniteNumber(scoreValue) || !isValidScoreRange(item)) {
    return null;
  }
  const { min, max, step } = item.scoreRange;
  const epsilon = 1e-9;
  if (scoreValue < min - epsilon || scoreValue > max + epsilon) {
    return null;
  }
  const bounded = Math.min(max, Math.max(min, scoreValue));
  if (step === undefined) {
    return bounded;
  }
  const stepCount = (bounded - min) / step;
  const roundedStepCount = Math.round(stepCount);
  if (Math.abs(stepCount - roundedStepCount) > epsilon) {
    return null;
  }
  const normalized = min + roundedStepCount * step;
  return Number.isFinite(normalized) ? normalized : null;
}

function parseRuleSteps(value: unknown): RuleStep[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const steps: RuleStep[] = [];
  const codes = new Set<string>();
  for (const entry of value) {
    if (!isPlainRecord(entry)) {
      return null;
    }
    const code =
      typeof entry.code === 'string' ? entry.code.trim().toLowerCase() : '';
    if (
      !code ||
      codes.has(code) ||
      !isSupportedComparable(entry.expected) ||
      !isFiniteNumber(entry.maxScore) ||
      entry.maxScore < 0
    ) {
      return null;
    }
    codes.add(code);
    steps.push({
      code,
      expected: entry.expected,
      maxScore: entry.maxScore,
    });
  }
  return steps;
}

function parseAggregationRule(
  value: unknown,
  stepCount: number,
): AggregationBand[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const bands: AggregationBand[] = [];
  for (const entry of value) {
    if (!isPlainRecord(entry) || !isFiniteNumber(entry.score)) {
      return null;
    }
    const keys = Object.keys(entry).sort();
    if (
      keys.length === 2 &&
      keys[0] === 'correctStepCount' &&
      keys[1] === 'score' &&
      Number.isInteger(entry.correctStepCount)
    ) {
      const count = entry.correctStepCount as number;
      bands.push({ min: count, max: count, score: entry.score });
      continue;
    }
    if (
      keys.length === 3 &&
      keys[0] === 'correctStepCountMax' &&
      keys[1] === 'correctStepCountMin' &&
      keys[2] === 'score' &&
      Number.isInteger(entry.correctStepCountMin) &&
      Number.isInteger(entry.correctStepCountMax)
    ) {
      bands.push({
        min: entry.correctStepCountMin as number,
        max: entry.correctStepCountMax as number,
        score: entry.score,
      });
      continue;
    }
    return null;
  }
  if (
    bands.some(
      (band) =>
        band.min < 0 ||
        band.max > stepCount ||
        band.min > band.max ||
        !Number.isInteger(band.min) ||
        !Number.isInteger(band.max),
    )
  ) {
    return null;
  }
  for (let count = 0; count <= stepCount; count += 1) {
    if (
      bands.filter((band) => count >= band.min && count <= band.max).length !==
      1
    ) {
      return null;
    }
  }
  return bands;
}

function calculateMultiStepScore(
  item: ScaleItemConfigSummary,
  response: ItemResponseSummary,
  rule: Record<string, unknown>,
): AutoScoreResult {
  const ruleSteps = parseRuleSteps(rule.steps);
  if (!ruleSteps) {
    return { reasonCode: 'STEP_CONFIGURATION_INVALID' };
  }
  const responseSteps = new Map<string, ItemResponseSummary['stepResults']>();
  for (const responseStep of response.stepResults) {
    const code = responseStep.stepCode.trim().toLowerCase();
    const entries = responseSteps.get(code) ?? [];
    entries.push(responseStep);
    responseSteps.set(code, entries);
  }
  if (
    responseSteps.size !== ruleSteps.length ||
    Array.from(responseSteps.values()).some((entries) => entries.length !== 1)
  ) {
    return { reasonCode: 'STEP_CONFIGURATION_INVALID' };
  }

  let correctStepCount = 0;
  let directScore = 0;
  for (const ruleStep of ruleSteps) {
    const responseStep = responseSteps.get(ruleStep.code)?.[0];
    if (!responseStep || responseStep.actualValue === null) {
      return { reasonCode: 'STEP_RESPONSE_MISSING' };
    }
    if (
      responseStep.countsTowardItemScore !== true ||
      !isSupportedComparable(responseStep.expectedValue) ||
      !isSupportedComparable(responseStep.actualValue)
    ) {
      return { reasonCode: 'STEP_RESPONSE_TYPE_UNSUPPORTED' };
    }
    if (
      typeof responseStep.expectedValue !== typeof ruleStep.expected ||
      responseStep.expectedValue !== ruleStep.expected ||
      typeof responseStep.actualValue !== typeof ruleStep.expected
    ) {
      return { reasonCode: 'STEP_RESPONSE_TYPE_UNSUPPORTED' };
    }
    if (responseStep.actualValue === ruleStep.expected) {
      correctStepCount += 1;
      directScore += ruleStep.maxScore;
    }
  }

  let scoreValue = directScore;
  if (Object.prototype.hasOwnProperty.call(rule, 'aggregationRule')) {
    if (!Array.isArray(rule.aggregationRule)) {
      return { reasonCode: 'AGGREGATION_RULE_UNSUPPORTED' };
    }
    const bands = parseAggregationRule(rule.aggregationRule, ruleSteps.length);
    if (!bands) {
      return { reasonCode: 'AGGREGATION_RULE_INVALID' };
    }
    const band = bands.find(
      (candidate) =>
        correctStepCount >= candidate.min && correctStepCount <= candidate.max,
    );
    if (!band) {
      return { reasonCode: 'AGGREGATION_RULE_INVALID' };
    }
    scoreValue = band.score;
  }

  const normalizedScore = normalizeScoreToRange(scoreValue, item);
  return normalizedScore === null
    ? { reasonCode: 'AUTO_SCORE_RESULT_INVALID' }
    : { scoreValue: normalizedScore };
}

function hasPreexistingScore(response: ItemResponseSummary): boolean {
  return (
    response.status === 'scored' ||
    (response.score !== null &&
      (response.score.scoreValue !== null ||
        response.score.scoreStatus !== 'not_scored'))
  );
}

function reviewItem(
  item: ScaleItemConfigSummary,
  response: ItemResponseSummary,
  reasonCode: ScoreReviewReasonCode,
): ProvisionalItemScore {
  return {
    itemResponseId: response.id,
    itemCode: item.code,
    crfCode: item.crfCode,
    groupCode: item.groupCode,
    itemTitle: item.title,
    itemOrder: item.order,
    responseType: item.responseType,
    countsTowardTotal: item.countsTowardTotal,
    includedInTotal: false,
    scoreValue: null,
    maxScore: isFiniteNumber(item.scoreRange.max) ? item.scoreRange.max : null,
    minScore: isFiniteNumber(item.scoreRange.min) ? item.scoreRange.min : null,
    scoreStatus: 'needs_review',
    scoreSource: 'none',
    isMissing: response.isMissing,
    cognitiveDomainCodes: [...item.cognitiveDomainCodes],
    note: reasonCode,
  };
}

export function evaluateProvisionalItems(
  versionItems: ScaleItemConfigSummary[],
  itemResponses: ItemResponseSummary[],
): ProvisionalItemEvaluation {
  const responseByCode = new Map(
    itemResponses.map((response) => [response.itemCode, response]),
  );
  const itemScores: ProvisionalItemScore[] = versionItems.map((item) => {
    const response = responseByCode.get(item.code);
    if (!response) {
      throw new Error('Validated scoring input is missing an item response');
    }
    if (!item.countsTowardTotal) {
      return {
        ...reviewItem(item, response, 'NON_SCORING_PROCESS_ITEM'),
        scoreStatus: 'not_scored',
        note: 'NON_SCORING_PROCESS_ITEM',
      };
    }
    if (response.isMissing) {
      return reviewItem(item, response, 'MISSING_RESPONSE_REQUIRES_REVIEW');
    }
    if (hasPreexistingScore(response)) {
      return reviewItem(
        item,
        response,
        'PREEXISTING_ITEM_SCORE_REQUIRES_REVIEW',
      );
    }
    if (!isValidScoreRange(item)) {
      return reviewItem(item, response, 'ITEM_SCORE_RANGE_INVALID');
    }
    const rule = item.scoringRule;
    if (!isPlainRecord(rule) || typeof rule.mode !== 'string') {
      return reviewItem(item, response, 'UNSUPPORTED_SCORING_MODE');
    }
    if (rule.mode !== 'multi_step_manual') {
      return reviewItem(
        item,
        response,
        MANUAL_MODES.has(rule.mode)
          ? 'MANUAL_SCORING_REQUIRED'
          : 'UNSUPPORTED_SCORING_MODE',
      );
    }
    const autoScore = calculateMultiStepScore(item, response, rule);
    if ('reasonCode' in autoScore) {
      return reviewItem(item, response, autoScore.reasonCode);
    }
    return {
      itemResponseId: response.id,
      itemCode: item.code,
      crfCode: item.crfCode,
      groupCode: item.groupCode,
      itemTitle: item.title,
      itemOrder: item.order,
      responseType: item.responseType,
      countsTowardTotal: true,
      includedInTotal: true,
      scoreValue: autoScore.scoreValue,
      maxScore: item.scoreRange.max,
      minScore: item.scoreRange.min,
      scoreStatus: 'auto_scored',
      scoreSource: 'auto_rule',
      isMissing: false,
      cognitiveDomainCodes: [...item.cognitiveDomainCodes],
      note: undefined,
    };
  });

  return { itemScores, warningCodes: [] };
}

export function toScoringItemInputs(
  evaluation: ProvisionalItemEvaluation,
): ScoringItemInput[] {
  return evaluation.itemScores.map((item) => ({ ...item }));
}

export function finalizeProvisionalScoring(
  version: ScaleVersionSummary,
  evaluation: ProvisionalItemEvaluation,
  summary: ScoringComputationSummary,
): ProvisionalScoringResult {
  const autoScoredItemCount = evaluation.itemScores.filter(
    (item) => item.scoreStatus === 'auto_scored',
  ).length;
  const pendingReviewItemCount = evaluation.itemScores.filter(
    (item) => item.countsTowardTotal && item.scoreStatus === 'needs_review',
  ).length;
  const excludedItemCount = evaluation.itemScores.filter(
    (item) => !item.countsTowardTotal,
  ).length;
  const warningCodes = [...evaluation.warningCodes];
  const groupCodes = new Set(version.groups.map((group) => group.code));
  if (
    evaluation.itemScores.some(
      (item) => item.groupCode && !groupCodes.has(item.groupCode),
    )
  ) {
    warningCodes.push('UNKNOWN_GROUP_CONFIGURATION');
  }
  if (summary.includedItemCount === 0) {
    warningCodes.push('NO_SCORING_ITEMS');
  }
  const isComplete =
    summary.totalScore.unscoredItemCount === 0 &&
    summary.totalScore.needsReviewItemCount === 0;
  const totalMin = version.totalScoreRange.min;
  const totalMax = version.totalScoreRange.max;
  const totalValue = summary.totalScore.scoreValue;
  const denominator = totalMax - totalMin;
  const scorePercent =
    isComplete &&
    totalValue !== null &&
    Number.isFinite(totalValue) &&
    Number.isFinite(denominator) &&
    denominator > 0
      ? Math.min(
          100,
          Math.max(0, ((totalValue - totalMin) / denominator) * 100),
        )
      : null;
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
  const resultStatus = pendingReviewItemCount > 0 ? 'needs_review' : 'computed';
  const scoringSource =
    autoScoredItemCount > 0
      ? pendingReviewItemCount > 0
        ? 'mixed'
        : 'auto_rule'
      : pendingReviewItemCount > 0
        ? 'manual'
        : 'auto_rule';

  return {
    itemScores: evaluation.itemScores,
    groupScores,
    totalScore: {
      ...summary.totalScore,
      minScore: totalMin,
      maxScore: totalMax,
      scorePercent,
    },
    resultStatus,
    scoringSource,
    reviewStatus: pendingReviewItemCount > 0 ? 'pending' : 'not_required',
    qualityStatus:
      pendingReviewItemCount > 0 || warningCodes.length > 0
        ? 'needs_review'
        : 'unchecked',
    warningCodes: Array.from(new Set(warningCodes)),
    autoScoredItemCount,
    pendingReviewItemCount,
    excludedItemCount,
  };
}
