import type {
  FollowUpTrendScaleInstanceSummary,
  FollowUpTrendVisitSummary,
} from '../../assessments/services/assessments.service';
import type { AssessmentHistoryCognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import type { AssessmentHistoryScoreResultSummary } from '../../scoring/services/scoring.service';
import { evaluateFollowUpTrendSource } from './follow-up-trend-source';

const ids = {
  patient: '507f1f77bcf86cd799439011',
  visit: '507f1f77bcf86cd799439012',
  instance: '507f1f77bcf86cd799439013',
  score: '507f1f77bcf86cd799439014',
  domain: '507f1f77bcf86cd799439015',
};
const at = new Date('2026-07-19T08:00:00.000Z');

function visit(
  overrides: Partial<FollowUpTrendVisitSummary> = {},
): FollowUpTrendVisitSummary {
  return {
    id: ids.visit,
    patientId: ids.patient,
    visitCode: 'VIS-TREND-1',
    visitType: 'follow_up',
    status: 'completed',
    assessmentDate: at,
    ...overrides,
  };
}

function instance(
  overrides: Partial<FollowUpTrendScaleInstanceSummary> = {},
): FollowUpTrendScaleInstanceSummary {
  return {
    id: ids.instance,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'SI-TREND-1',
    instanceNo: 1,
    status: 'locked',
    administrationMode: 'clinician_administered',
    versionTrace: {
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
    },
    voidedAt: null,
    durationMs: 1000,
    ...overrides,
  };
}

function score(
  overrides: Partial<AssessmentHistoryScoreResultSummary> = {},
): AssessmentHistoryScoreResultSummary {
  return {
    id: ids.score,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: ids.instance,
    scaleCode: 'moca',
    runNo: 1,
    status: 'locked',
    versionTrace: {
      scaleVersion: '1.0',
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
    },
    totalScore: {
      scoreValue: 24,
      minScore: 0,
      maxScore: 30,
      scorePercent: 80,
      scoredItemCount: 10,
      totalItemCount: 10,
      unscoredItemCount: 0,
      missingItemCount: 0,
      needsReviewItemCount: 0,
    },
    review: { reviewStatus: 'reviewed', reviewedAt: at, reviewerId: null },
    qualityStatus: 'passed',
    confirmedAt: at,
    lockedAt: at,
    voidedAt: null,
    ...overrides,
  };
}

function domain(
  overrides: Partial<AssessmentHistoryCognitiveDomainResultSummary> = {},
): AssessmentHistoryCognitiveDomainResultSummary {
  return {
    id: ids.domain,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: ids.instance,
    scoreResultId: ids.score,
    scaleCode: 'moca',
    runNo: 1,
    status: 'locked',
    mappingSource: 'scale_config',
    mappingMode: 'item_domain_codes',
    versionTrace: {
      scaleVersion: '1.0',
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
      domainMappingVersion: 'domain-1',
    },
    domainScores: [
      {
        domainCode: 'orientation',
        domainTitle: ' Orientation ',
        scoreValue: 5,
        minScore: 0,
        maxScore: 6,
        scorePercent: 83.333,
        weightedScore: null,
        weightedMaxScore: null,
        itemCount: 3,
        scoredItemCount: 3,
        unscoredItemCount: 0,
        missingItemCount: 0,
        needsReviewItemCount: 0,
        excludedItemCount: 0,
      },
      {
        domainCode: 'memory',
        domainTitle: '   ',
        scoreValue: 4,
        minScore: 0,
        maxScore: 5,
        scorePercent: 80,
        weightedScore: 4,
        weightedMaxScore: 5,
        itemCount: 2,
        scoredItemCount: 2,
        unscoredItemCount: 0,
        missingItemCount: 0,
        needsReviewItemCount: 0,
        excludedItemCount: 0,
      },
    ],
    mappingSnapshot: {
      mappingVersion: 'domain-1',
      domainCodes: ['orientation', 'memory'],
    },
    computation: { computedAt: at, warningCount: 0 },
    qualityStatus: 'passed',
    voidedAt: null,
    ...overrides,
  };
}

function evaluate(
  input: {
    visit?: FollowUpTrendVisitSummary;
    instances?: FollowUpTrendScaleInstanceSummary[];
    scores?: AssessmentHistoryScoreResultSummary[];
    domains?: AssessmentHistoryCognitiveDomainResultSummary[];
  } = {},
) {
  return evaluateFollowUpTrendSource({
    visit: input.visit ?? visit(),
    scaleCode: 'moca',
    scaleInstances: input.instances ?? [instance()],
    scoreResults: input.scores ?? [score()],
    domainResults: input.domains ?? [domain()],
  });
}

describe('follow-up trend source evaluator', () => {
  it('gives Visit voided precedence over missing and ambiguous instances', () => {
    expect(
      evaluate({ visit: visit({ status: 'voided' }), instances: [] })
        .dataStatus,
    ).toBe('source_voided');
    expect(
      evaluate({
        visit: visit({ status: 'voided' }),
        instances: [instance(), instance({ id: 'second' })],
      }).dataStatus,
    ).toBe('source_voided');
  });

  it('distinguishes missing, ambiguous, voided and non-final instances', () => {
    expect(evaluate({ instances: [] }).dataStatus).toBe('source_missing');
    expect(
      evaluate({ instances: [instance(), instance({ id: 'second' })] })
        .dataStatus,
    ).toBe('source_ambiguous');
    expect(
      evaluate({
        instances: [instance({ status: 'voided', voidedAt: at })],
      }).dataStatus,
    ).toBe('source_voided');
    expect(
      evaluate({ instances: [instance({ status: 'in_progress' })] }).dataStatus,
    ).toBe('source_not_final');
  });

  it('distinguishes missing, duplicate, voided, non-final and incomplete scores', () => {
    expect(evaluate({ scores: [] }).dataStatus).toBe('source_missing');
    expect(evaluate({ scores: [score(), score()] }).dataStatus).toBe(
      'source_incomplete',
    );
    expect(
      evaluate({ scores: [score({ status: 'voided', voidedAt: at })] })
        .dataStatus,
    ).toBe('source_voided');
    expect(
      evaluate({
        scores: [score(), score({ status: 'voided', voidedAt: at })],
      }).dataStatus,
    ).toBe('source_voided');
    expect(
      evaluate({
        scores: [
          score({ status: 'needs_review', confirmedAt: null, lockedAt: null }),
        ],
      }).dataStatus,
    ).toBe('source_not_final');
    expect(
      evaluate({ scores: [score({ qualityStatus: 'failed' })] }).dataStatus,
    ).toBe('source_incomplete');
    expect(
      evaluate({ scores: [score({ patientId: 'wrong' })] }).dataStatus,
    ).toBe('source_incomplete');
  });

  it('marks trace defects as a stable incomplete source reason', () => {
    const result = evaluate({
      scores: [
        score({
          versionTrace: {
            scaleVersion: '1.0',
            crfVersion: 'changed',
            scoringRuleVersion: 'score-1',
            fieldEncodingVersion: 'field-1',
          },
        }),
      ],
    });
    expect(result.dataStatus).toBe('source_incomplete');
    expect(result.sourceReasons).toEqual(['version_trace_incomplete']);
  });

  it('returns an available total independently of domain availability', () => {
    const missingDomain = evaluate({ domains: [] });
    expect(missingDomain).toMatchObject({
      dataStatus: 'available',
      domainSourceAvailable: false,
      domains: [],
      score: { totalScoreValue: 24 },
    });
    const incompleteDomain = evaluate({
      domains: [domain({ computation: { computedAt: at, warningCount: 1 } })],
    });
    expect(incompleteDomain.dataStatus).toBe('available');
    expect(incompleteDomain.domains).toEqual([]);
  });

  it('returns safe, normalized, sorted available score and domains', () => {
    const result = evaluate();
    expect(result.dataStatus).toBe('available');
    expect(result.scaleInstance).toEqual(
      expect.objectContaining({ id: ids.instance, durationMs: 1000 }),
    );
    expect(result.score).toEqual(
      expect.objectContaining({ status: 'locked', totalScoreValue: 24 }),
    );
    expect(result.domains.map((item) => item.domainCode)).toEqual([
      'memory',
      'orientation',
    ]);
    expect(result.domains[0].domainTitle).toBeNull();
    expect(result.domains[1].domainTitle).toBe('Orientation');
  });
});
