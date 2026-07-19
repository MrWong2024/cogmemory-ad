import type {
  FollowUpTrendScaleInstanceSummary,
  FollowUpTrendVisitSummary,
} from '../../assessments/services/assessments.service';
import type { AssessmentHistoryCognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import type { AssessmentHistoryScoreResultSummary } from '../../scoring/services/scoring.service';
import type {
  TrendComparisonReasonCode,
  TrendDataStatus,
} from '../types/follow-up-trend.types';
import {
  evaluateClinicalHistoryDomainSource,
  evaluateClinicalHistoryScoreSource,
  finiteNumber,
  normalizedSourceText,
  validSourceDate,
} from './clinical-history-source-evaluator';

export type TrendEvaluatedScaleInstance = {
  id: string;
  instanceCode: string;
  scaleCode: string;
  scaleVersion: string;
  administrationMode: FollowUpTrendScaleInstanceSummary['administrationMode'];
  status: FollowUpTrendScaleInstanceSummary['status'];
  durationMs: number | null;
  versionTrace: {
    scaleVersion: string | null;
    crfVersion: string | null;
    scoringRuleVersion: string | null;
    fieldEncodingVersion: string | null;
  };
};

export type TrendEvaluatedScore = {
  status: 'confirmed' | 'locked';
  qualityStatus: 'passed';
  totalScoreValue: number;
  totalMinScore: number;
  totalMaxScore: number;
  scorePercent: number;
  confirmedAt: Date;
  lockedAt: Date | null;
};

export type TrendEvaluatedDomainScore = {
  domainCode: string;
  domainTitle: string | null;
  scoreValue: number;
  minScore: number;
  maxScore: number;
  scorePercent: number;
  weightedScore: number | null;
  weightedMaxScore: number | null;
  itemCount: number;
};

export type TrendTotalComparisonContext = {
  scaleCode: string;
  scaleVersion: string;
  crfVersion: string;
  scoringRuleVersion: string;
  fieldEncodingVersion: string;
  administrationMode: FollowUpTrendScaleInstanceSummary['administrationMode'];
  totalMinScore: number;
  totalMaxScore: number;
};

export type TrendDomainComparisonContext = {
  domainMappingVersion: string;
  mappingSource: string;
  mappingMode: string;
};

export type FollowUpTrendSourceEvaluation = {
  dataStatus: TrendDataStatus;
  scaleInstance: TrendEvaluatedScaleInstance | null;
  score: TrendEvaluatedScore | null;
  domains: TrendEvaluatedDomainScore[];
  totalContext: TrendTotalComparisonContext | null;
  domainContext: TrendDomainComparisonContext | null;
  domainSourceAvailable: boolean;
  sourceReasons: TrendComparisonReasonCode[];
};

function evaluatedInstance(
  instance: FollowUpTrendScaleInstanceSummary,
): TrendEvaluatedScaleInstance {
  return {
    id: instance.id,
    instanceCode: instance.instanceCode,
    scaleCode: instance.scaleCode,
    scaleVersion: instance.scaleVersion,
    administrationMode: instance.administrationMode,
    status: instance.status,
    durationMs:
      finiteNumber(instance.durationMs) && instance.durationMs >= 0
        ? instance.durationMs
        : null,
    versionTrace: {
      scaleVersion: normalizedSourceText(instance.scaleVersion),
      crfVersion: normalizedSourceText(instance.versionTrace?.crfVersion),
      scoringRuleVersion: normalizedSourceText(
        instance.versionTrace?.scoringRuleVersion,
      ),
      fieldEncodingVersion: normalizedSourceText(
        instance.versionTrace?.fieldEncodingVersion,
      ),
    },
  };
}

function unavailableEvaluation(
  dataStatus: Exclude<TrendDataStatus, 'available'>,
  scaleInstance: TrendEvaluatedScaleInstance | null,
  sourceReasons: TrendComparisonReasonCode[] = [],
): FollowUpTrendSourceEvaluation {
  return {
    dataStatus,
    scaleInstance,
    score: null,
    domains: [],
    totalContext: null,
    domainContext: null,
    domainSourceAvailable: false,
    sourceReasons,
  };
}

function mapQualifiedDomainScores(
  domain: AssessmentHistoryCognitiveDomainResultSummary,
): TrendEvaluatedDomainScore[] | null {
  const mapped: TrendEvaluatedDomainScore[] = [];
  for (const score of domain.domainScores) {
    const domainCode = normalizedSourceText(score.domainCode)?.toLowerCase();
    if (
      !domainCode ||
      !finiteNumber(score.scoreValue) ||
      !finiteNumber(score.minScore) ||
      !finiteNumber(score.maxScore) ||
      !finiteNumber(score.scorePercent) ||
      !Number.isInteger(score.itemCount)
    ) {
      return null;
    }
    mapped.push({
      domainCode,
      domainTitle: normalizedSourceText(score.domainTitle),
      scoreValue: score.scoreValue,
      minScore: score.minScore,
      maxScore: score.maxScore,
      scorePercent: score.scorePercent,
      weightedScore: finiteNumber(score.weightedScore)
        ? score.weightedScore
        : null,
      weightedMaxScore: finiteNumber(score.weightedMaxScore)
        ? score.weightedMaxScore
        : null,
      itemCount: score.itemCount,
    });
  }
  return mapped.sort((left, right) =>
    left.domainCode.localeCompare(right.domainCode),
  );
}

export function evaluateFollowUpTrendSource(input: {
  visit: FollowUpTrendVisitSummary;
  scaleCode: string;
  scaleInstances: readonly FollowUpTrendScaleInstanceSummary[];
  scoreResults: readonly AssessmentHistoryScoreResultSummary[];
  domainResults: readonly AssessmentHistoryCognitiveDomainResultSummary[];
}): FollowUpTrendSourceEvaluation {
  const orderedInstances = [...input.scaleInstances].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const uniqueInstance =
    orderedInstances.length === 1 ? orderedInstances[0] : null;
  const safeInstance = uniqueInstance
    ? evaluatedInstance(uniqueInstance)
    : null;

  if (input.visit.status === 'voided') {
    return unavailableEvaluation('source_voided', safeInstance);
  }
  if (orderedInstances.length > 1) {
    return unavailableEvaluation('source_ambiguous', null);
  }
  if (!uniqueInstance) {
    return unavailableEvaluation('source_missing', null);
  }
  if (uniqueInstance.status === 'voided') {
    return unavailableEvaluation('source_voided', safeInstance);
  }

  const scoreCandidates = input.scoreResults
    .filter((score) => score.scaleInstanceId === uniqueInstance.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (scoreCandidates.some((score) => score.status === 'voided')) {
    return unavailableEvaluation('source_voided', safeInstance);
  }
  if (scoreCandidates.length === 0) {
    return unavailableEvaluation('source_missing', safeInstance);
  }
  if (
    uniqueInstance.status !== 'completed' &&
    uniqueInstance.status !== 'locked'
  ) {
    return unavailableEvaluation('source_not_final', safeInstance);
  }
  if (
    scoreCandidates.length === 1 &&
    scoreCandidates[0].status !== 'confirmed' &&
    scoreCandidates[0].status !== 'locked'
  ) {
    return unavailableEvaluation('source_not_final', safeInstance);
  }

  const instanceOwnershipComplete =
    uniqueInstance.patientId === input.visit.patientId &&
    uniqueInstance.assessmentVisitId === input.visit.id &&
    uniqueInstance.scaleCode === input.scaleCode &&
    Boolean(normalizedSourceText(uniqueInstance.id)) &&
    Boolean(normalizedSourceText(uniqueInstance.instanceCode)) &&
    uniqueInstance.voidedAt === null;
  const scoreQualification = evaluateClinicalHistoryScoreSource(
    uniqueInstance,
    scoreCandidates,
  );
  const sourceReasons: TrendComparisonReasonCode[] =
    scoreQualification.traceIncomplete ? ['version_trace_incomplete'] : [];
  if (
    !instanceOwnershipComplete ||
    scoreQualification.availability !== 'available' ||
    !scoreQualification.source
  ) {
    return unavailableEvaluation(
      'source_incomplete',
      safeInstance,
      sourceReasons,
    );
  }

  const score = scoreQualification.source;
  const total = score.totalScore;
  if (
    (score.status !== 'confirmed' && score.status !== 'locked') ||
    !total ||
    !finiteNumber(total.scoreValue) ||
    !finiteNumber(total.minScore) ||
    !finiteNumber(total.maxScore) ||
    !finiteNumber(total.scorePercent) ||
    !validSourceDate(score.confirmedAt)
  ) {
    return unavailableEvaluation(
      'source_incomplete',
      safeInstance,
      sourceReasons,
    );
  }
  const evaluatedScore: TrendEvaluatedScore = {
    status: score.status,
    qualityStatus: 'passed',
    totalScoreValue: total.scoreValue,
    totalMinScore: total.minScore,
    totalMaxScore: total.maxScore,
    scorePercent: total.scorePercent,
    confirmedAt: score.confirmedAt,
    lockedAt: validSourceDate(score.lockedAt) ? score.lockedAt : null,
  };
  const trace = scoreQualification.versionTrace;
  if (
    !trace.scaleVersion ||
    !trace.crfVersion ||
    !trace.scoringRuleVersion ||
    !trace.fieldEncodingVersion
  ) {
    return unavailableEvaluation('source_incomplete', safeInstance, [
      'version_trace_incomplete',
    ]);
  }

  const domainCandidates = input.domainResults
    .filter((domain) => domain.scaleInstanceId === uniqueInstance.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  const domainQualification = evaluateClinicalHistoryDomainSource({
    instance: uniqueInstance,
    scoreCandidates,
    scoreAvailability: scoreQualification.availability,
    domainCandidates,
  });
  const mappedDomains = domainQualification.source
    ? mapQualifiedDomainScores(domainQualification.source)
    : null;
  const domainSourceAvailable =
    domainQualification.availability === 'available' &&
    Boolean(domainQualification.mappingVersion) &&
    Boolean(mappedDomains);

  return {
    dataStatus: 'available',
    scaleInstance: safeInstance,
    score: evaluatedScore,
    domains: domainSourceAvailable ? mappedDomains! : [],
    totalContext: {
      scaleCode: input.scaleCode,
      scaleVersion: trace.scaleVersion,
      crfVersion: trace.crfVersion,
      scoringRuleVersion: trace.scoringRuleVersion,
      fieldEncodingVersion: trace.fieldEncodingVersion,
      administrationMode: uniqueInstance.administrationMode,
      totalMinScore: total.minScore,
      totalMaxScore: total.maxScore,
    },
    domainContext: domainSourceAvailable
      ? {
          domainMappingVersion: domainQualification.mappingVersion!,
          mappingSource: domainQualification.source!.mappingSource,
          mappingMode: domainQualification.source!.mappingMode,
        }
      : null,
    domainSourceAvailable,
    sourceReasons: [],
  };
}
