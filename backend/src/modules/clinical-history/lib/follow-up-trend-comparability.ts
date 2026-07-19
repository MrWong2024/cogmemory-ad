import type {
  TrendComparisonReasonCode,
  TrendComparisonResponse,
  TrendDomainComparisonResponse,
  TrendDomainItemComparisonResponse,
} from '../types/follow-up-trend.types';
import type {
  FollowUpTrendSourceEvaluation,
  TrendEvaluatedDomainScore,
} from './follow-up-trend-source';

export const TREND_REASON_ORDER: readonly TrendComparisonReasonCode[] = [
  'scale_version_changed',
  'crf_version_changed',
  'scoring_rule_version_changed',
  'field_encoding_version_changed',
  'administration_mode_changed',
  'score_range_changed',
  'version_trace_incomplete',
  'source_missing',
  'source_not_final',
  'source_voided',
  'source_incomplete',
  'source_ambiguous',
  'domain_mapping_version_changed',
  'domain_mapping_source_changed',
  'domain_mapping_mode_changed',
  'domain_set_changed',
  'domain_range_changed',
  'domain_missing',
  'domain_source_incomplete',
];

const REASON_RANK = new Map(
  TREND_REASON_ORDER.map((reason, index) => [reason, index]),
);

export function sortTrendReasons(
  reasons: readonly TrendComparisonReasonCode[],
): TrendComparisonReasonCode[] {
  return [...new Set(reasons)].sort(
    (left, right) => REASON_RANK.get(left)! - REASON_RANK.get(right)!,
  );
}

function unavailableDomainComparison(): TrendDomainComparisonResponse {
  return { status: 'unavailable', reasons: [], items: [] };
}

export function firstTrendComparison(): TrendComparisonResponse {
  return {
    status: 'first_point',
    reasons: [],
    scoreDelta: null,
    scorePercentDelta: null,
    domainDeltas: unavailableDomainComparison(),
  };
}

function dataStatusReason(
  evaluation: FollowUpTrendSourceEvaluation,
): TrendComparisonReasonCode[] {
  return evaluation.dataStatus === 'available'
    ? evaluation.sourceReasons
    : [evaluation.dataStatus, ...evaluation.sourceReasons];
}

function unionDomainCodes(
  previous: FollowUpTrendSourceEvaluation,
  current: FollowUpTrendSourceEvaluation,
): string[] {
  return [
    ...new Set([
      ...previous.domains.map((domain) => domain.domainCode),
      ...current.domains.map((domain) => domain.domainCode),
    ]),
  ].sort((left, right) => left.localeCompare(right));
}

function incomparableDomainItems(
  previous: FollowUpTrendSourceEvaluation,
  current: FollowUpTrendSourceEvaluation,
  reasons: readonly TrendComparisonReasonCode[],
): TrendDomainItemComparisonResponse[] {
  const orderedReasons = sortTrendReasons(reasons);
  return unionDomainCodes(previous, current).map((domainCode) => ({
    domainCode,
    status: 'not_comparable',
    reasons: orderedReasons,
    scoreDelta: null,
    scorePercentDelta: null,
    weightedScoreDelta: null,
  }));
}

function exactTotalReasons(
  previous: FollowUpTrendSourceEvaluation,
  current: FollowUpTrendSourceEvaluation,
): TrendComparisonReasonCode[] {
  const left = previous.totalContext;
  const right = current.totalContext;
  if (!left || !right) {
    return ['version_trace_incomplete'];
  }
  const reasons: TrendComparisonReasonCode[] = [];
  const completeTrace = [
    left.scaleCode,
    left.scaleVersion,
    left.crfVersion,
    left.scoringRuleVersion,
    left.fieldEncodingVersion,
    right.scaleCode,
    right.scaleVersion,
    right.crfVersion,
    right.scoringRuleVersion,
    right.fieldEncodingVersion,
  ].every((value) => value.trim().length > 0);
  if (!completeTrace) reasons.push('version_trace_incomplete');
  if (
    left.scaleCode !== right.scaleCode ||
    left.scaleVersion !== right.scaleVersion
  ) {
    reasons.push('scale_version_changed');
  }
  if (left.crfVersion !== right.crfVersion) {
    reasons.push('crf_version_changed');
  }
  if (left.scoringRuleVersion !== right.scoringRuleVersion) {
    reasons.push('scoring_rule_version_changed');
  }
  if (left.fieldEncodingVersion !== right.fieldEncodingVersion) {
    reasons.push('field_encoding_version_changed');
  }
  if (left.administrationMode !== right.administrationMode) {
    reasons.push('administration_mode_changed');
  }
  if (
    left.totalMinScore !== right.totalMinScore ||
    left.totalMaxScore !== right.totalMaxScore
  ) {
    reasons.push('score_range_changed');
  }
  return sortTrendReasons(reasons);
}

function byDomainCode(
  domains: readonly TrendEvaluatedDomainScore[],
): Map<string, TrendEvaluatedDomainScore> {
  return new Map(domains.map((domain) => [domain.domainCode, domain]));
}

function compareDomains(
  previous: FollowUpTrendSourceEvaluation,
  current: FollowUpTrendSourceEvaluation,
): TrendDomainComparisonResponse {
  if (
    !previous.domainSourceAvailable ||
    !current.domainSourceAvailable ||
    !previous.domainContext ||
    !current.domainContext
  ) {
    return {
      status: 'unavailable',
      reasons: ['domain_source_incomplete'],
      items: [],
    };
  }
  const globalReasons: TrendComparisonReasonCode[] = [];
  if (
    previous.domainContext.domainMappingVersion !==
    current.domainContext.domainMappingVersion
  ) {
    globalReasons.push('domain_mapping_version_changed');
  }
  if (
    previous.domainContext.mappingSource !== current.domainContext.mappingSource
  ) {
    globalReasons.push('domain_mapping_source_changed');
  }
  if (
    previous.domainContext.mappingMode !== current.domainContext.mappingMode
  ) {
    globalReasons.push('domain_mapping_mode_changed');
  }
  const previousCodes = previous.domains.map((domain) => domain.domainCode);
  const currentCodes = current.domains.map((domain) => domain.domainCode);
  if (
    previousCodes.length !== currentCodes.length ||
    previousCodes.some((code, index) => code !== currentCodes[index])
  ) {
    globalReasons.push('domain_set_changed');
  }
  if (globalReasons.length > 0) {
    const reasons = sortTrendReasons(globalReasons);
    return {
      status: 'not_comparable',
      reasons,
      items: incomparableDomainItems(previous, current, reasons),
    };
  }

  const previousByCode = byDomainCode(previous.domains);
  const currentByCode = byDomainCode(current.domains);
  const items: TrendDomainItemComparisonResponse[] = unionDomainCodes(
    previous,
    current,
  ).map((domainCode) => {
    const left = previousByCode.get(domainCode);
    const right = currentByCode.get(domainCode);
    if (!left || !right) {
      return {
        domainCode,
        status: 'not_comparable',
        reasons: ['domain_missing'],
        scoreDelta: null,
        scorePercentDelta: null,
        weightedScoreDelta: null,
      };
    }
    const weightedMaxComparable =
      (left.weightedMaxScore === null && right.weightedMaxScore === null) ||
      (left.weightedMaxScore !== null &&
        right.weightedMaxScore !== null &&
        left.weightedMaxScore === right.weightedMaxScore);
    const weightedScoreComparable =
      (left.weightedScore === null && right.weightedScore === null) ||
      (left.weightedScore !== null && right.weightedScore !== null);
    if (
      left.minScore !== right.minScore ||
      left.maxScore !== right.maxScore ||
      !weightedMaxComparable ||
      !weightedScoreComparable
    ) {
      return {
        domainCode,
        status: 'not_comparable',
        reasons: ['domain_range_changed'],
        scoreDelta: null,
        scorePercentDelta: null,
        weightedScoreDelta: null,
      };
    }
    return {
      domainCode,
      status: 'comparable',
      reasons: [],
      scoreDelta: right.scoreValue - left.scoreValue,
      scorePercentDelta: right.scorePercent - left.scorePercent,
      weightedScoreDelta:
        left.weightedScore !== null && right.weightedScore !== null
          ? right.weightedScore - left.weightedScore
          : null,
    };
  });
  const comparableCount = items.filter(
    (item) => item.status === 'comparable',
  ).length;
  const reasons = sortTrendReasons(items.flatMap((item) => item.reasons));
  return {
    status:
      comparableCount === items.length
        ? 'comparable'
        : comparableCount === 0
          ? 'not_comparable'
          : 'partially_comparable',
    reasons,
    items,
  };
}

export function compareFollowUpTrendSources(
  previous: FollowUpTrendSourceEvaluation,
  current: FollowUpTrendSourceEvaluation,
): TrendComparisonResponse {
  if (
    previous.dataStatus !== 'available' ||
    current.dataStatus !== 'available'
  ) {
    return {
      status: 'unavailable',
      reasons: sortTrendReasons([
        ...dataStatusReason(previous),
        ...dataStatusReason(current),
      ]),
      scoreDelta: null,
      scorePercentDelta: null,
      domainDeltas: unavailableDomainComparison(),
    };
  }
  const totalReasons = exactTotalReasons(previous, current);
  if (totalReasons.length > 0 || !previous.score || !current.score) {
    const reasons: TrendComparisonReasonCode[] =
      totalReasons.length > 0 ? totalReasons : ['version_trace_incomplete'];
    return {
      status: 'not_comparable',
      reasons,
      scoreDelta: null,
      scorePercentDelta: null,
      domainDeltas: {
        status: 'not_comparable',
        reasons,
        items: incomparableDomainItems(previous, current, reasons),
      },
    };
  }
  return {
    status: 'comparable',
    reasons: [],
    scoreDelta: current.score.totalScoreValue - previous.score.totalScoreValue,
    scorePercentDelta: current.score.scorePercent - previous.score.scorePercent,
    domainDeltas: compareDomains(previous, current),
  };
}
