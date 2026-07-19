import type { FollowUpTrendVisitSummary } from '../../assessments/services/assessments.service';
import type { AvailableScaleOptionResponse } from '../../scales/types/scale-catalog-response.types';
import type {
  PatientFollowUpTrendPoint,
  PatientFollowUpTrendResponse,
  TrendComparisonResponse,
} from '../types/follow-up-trend.types';
import {
  compareFollowUpTrendSources,
  firstTrendComparison,
} from './follow-up-trend-comparability';
import type { FollowUpTrendSourceEvaluation } from './follow-up-trend-source';
import { normalizedSourceText } from './clinical-history-source-evaluator';

export const FOLLOW_UP_TREND_COMPARABILITY_POLICY = {
  version: 'wp04-exact-trace-v1',
  comparisonDirection: 'current_minus_immediately_previous',
  totalScoreRequiresExactTrace: true,
  domainScoreRequiresExactMapping: true,
  scorePercentIsNotProbability: true,
  noDiagnosticInterpretation: true,
} as const;

export type FollowUpTrendPointMappingInput = {
  visit: FollowUpTrendVisitSummary;
  evaluation: FollowUpTrendSourceEvaluation;
};

function mapComparison(
  comparison: TrendComparisonResponse,
): TrendComparisonResponse {
  return {
    status: comparison.status,
    reasons: [...comparison.reasons],
    scoreDelta: comparison.scoreDelta,
    scorePercentDelta: comparison.scorePercentDelta,
    domainDeltas: {
      status: comparison.domainDeltas.status,
      reasons: [...comparison.domainDeltas.reasons],
      items: comparison.domainDeltas.items.map((item) => ({
        domainCode: item.domainCode,
        status: item.status,
        reasons: [...item.reasons],
        scoreDelta: item.scoreDelta,
        scorePercentDelta: item.scorePercentDelta,
        weightedScoreDelta: item.weightedScoreDelta,
      })),
    },
  };
}

function mapPoint(
  input: FollowUpTrendPointMappingInput,
  comparison: TrendComparisonResponse,
): PatientFollowUpTrendPoint {
  const instance = input.evaluation.scaleInstance;
  const score = input.evaluation.score;
  return {
    visit: {
      id: input.visit.id,
      visitCode: input.visit.visitCode,
      visitType: input.visit.visitType,
      status: input.visit.status,
      assessmentDate: input.visit.assessmentDate,
    },
    scaleInstance: instance
      ? {
          id: instance.id,
          instanceCode: instance.instanceCode,
          scaleCode: instance.scaleCode,
          scaleVersion: instance.scaleVersion,
          administrationMode: instance.administrationMode,
          status: instance.status,
          durationMs: instance.durationMs,
          versionTrace: {
            scaleVersion: instance.versionTrace.scaleVersion,
            crfVersion: instance.versionTrace.crfVersion,
            scoringRuleVersion: instance.versionTrace.scoringRuleVersion,
            fieldEncodingVersion: instance.versionTrace.fieldEncodingVersion,
          },
        }
      : null,
    dataStatus: input.evaluation.dataStatus,
    score:
      input.evaluation.dataStatus === 'available' && score
        ? {
            status: score.status,
            qualityStatus: 'passed',
            totalScoreValue: score.totalScoreValue,
            totalMinScore: score.totalMinScore,
            totalMaxScore: score.totalMaxScore,
            scorePercent: score.scorePercent,
            confirmedAt: score.confirmedAt,
            lockedAt: score.lockedAt,
          }
        : null,
    domains: input.evaluation.domains.map((domain) => ({
      domainCode: domain.domainCode,
      domainTitle: domain.domainTitle,
      scoreValue: domain.scoreValue,
      minScore: domain.minScore,
      maxScore: domain.maxScore,
      scorePercent: domain.scorePercent,
      weightedScore: domain.weightedScore,
      weightedMaxScore: domain.weightedMaxScore,
      itemCount: domain.itemCount,
    })),
    comparisonToPrevious: mapComparison(comparison),
  };
}

export function mapPatientFollowUpTrendResponse(input: {
  scale: AvailableScaleOptionResponse;
  dateFrom?: Date;
  dateTo?: Date;
  points: readonly FollowUpTrendPointMappingInput[];
}): PatientFollowUpTrendResponse {
  const ordered = [...input.points].sort(
    (left, right) =>
      left.visit.assessmentDate.getTime() -
        right.visit.assessmentDate.getTime() ||
      left.visit.id.localeCompare(right.visit.id),
  );
  const points = ordered.map((point, index) => {
    const comparison =
      index === 0
        ? firstTrendComparison()
        : compareFollowUpTrendSources(
            ordered[index - 1].evaluation,
            point.evaluation,
          );
    return mapPoint(point, comparison);
  });
  return {
    scale: {
      scaleCode: input.scale.code,
      displayName:
        normalizedSourceText(input.scale.shortName) ?? input.scale.name,
    },
    range: {
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      pointCount: points.length,
    },
    comparabilityPolicy: FOLLOW_UP_TREND_COMPARABILITY_POLICY,
    points,
  };
}
