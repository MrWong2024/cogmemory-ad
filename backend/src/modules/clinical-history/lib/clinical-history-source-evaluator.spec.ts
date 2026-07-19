import type { AssessmentHistoryScaleInstanceSummary } from '../../assessments/services/assessments.service';
import type { AssessmentHistoryCognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import type { AssessmentHistoryScoreResultSummary } from '../../scoring/services/scoring.service';
import {
  evaluateClinicalHistoryDomainSource,
  evaluateClinicalHistoryScoreSource,
} from './clinical-history-source-evaluator';

const ids = {
  patient: '507f1f77bcf86cd799439011',
  visit: '507f1f77bcf86cd799439012',
  instance: '507f1f77bcf86cd799439013',
  score: '507f1f77bcf86cd799439014',
  domain: '507f1f77bcf86cd799439015',
};
const at = new Date('2026-07-19T08:00:00.000Z');

function instance(): AssessmentHistoryScaleInstanceSummary {
  return {
    id: ids.instance,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'SI-SOURCE-1',
    instanceNo: 1,
    status: 'locked',
    administrationMode: 'clinician_administered',
    versionTrace: {
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
    },
    startedAt: at,
    completedAt: at,
    lockedAt: at,
    voidedAt: null,
    durationMs: 1000,
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
        domainCode: 'memory',
        scoreValue: 4,
        minScore: 0,
        maxScore: 5,
        scorePercent: 80,
        weightedScore: null,
        weightedMaxScore: null,
        itemCount: 2,
        scoredItemCount: 2,
        unscoredItemCount: 0,
        missingItemCount: 0,
        needsReviewItemCount: 0,
        excludedItemCount: 0,
      },
    ],
    mappingSnapshot: { mappingVersion: 'domain-1', domainCodes: ['memory'] },
    computation: { computedAt: at, warningCount: 0 },
    qualityStatus: 'passed',
    voidedAt: null,
    ...overrides,
  };
}

describe('shared clinical history source qualification', () => {
  it('qualifies one exact final score and reports missing trace detail', () => {
    expect(evaluateClinicalHistoryScoreSource(instance(), [score()])).toEqual(
      expect.objectContaining({ availability: 'available' }),
    );
    expect(
      evaluateClinicalHistoryScoreSource(instance(), [
        score({
          versionTrace: {
            scaleVersion: '1.0',
            crfVersion: '',
            scoringRuleVersion: 'score-1',
            fieldEncodingVersion: 'field-1',
          },
        }),
      ]),
    ).toEqual(
      expect.objectContaining({
        availability: 'source_incomplete',
        traceIncomplete: true,
      }),
    );
  });

  it.each([
    score({ patientId: '507f1f77bcf86cd799439099' }),
    score({ qualityStatus: 'failed' }),
    score({
      review: {
        reviewStatus: 'pending',
        reviewedAt: null,
        reviewerId: null,
      },
    }),
    score({ confirmedAt: null }),
    score({ lockedAt: null }),
    score({ totalScore: null }),
    score({
      totalScore: {
        ...score().totalScore!,
        scoreValue: 31,
      },
    }),
    score({
      totalScore: {
        ...score().totalScore!,
        scorePercent: 101,
      },
    }),
  ])('rejects incomplete final score source %#', (candidate) => {
    expect(
      evaluateClinicalHistoryScoreSource(instance(), [candidate]).availability,
    ).toBe('source_incomplete');
  });

  it('keeps stable score status precedence', () => {
    expect(
      evaluateClinicalHistoryScoreSource(instance(), [
        score({ status: 'voided', voidedAt: at }),
      ]).availability,
    ).toBe('source_voided');
    expect(
      evaluateClinicalHistoryScoreSource(instance(), [
        score({ status: 'computed', confirmedAt: null, lockedAt: null }),
      ]).availability,
    ).toBe('source_not_final');
    expect(
      evaluateClinicalHistoryScoreSource(instance(), [score(), score()])
        .availability,
    ).toBe('source_incomplete');
  });

  it('qualifies exact domains and rejects mapping, ownership and score defects', () => {
    const availableScore = score();
    expect(
      evaluateClinicalHistoryDomainSource({
        instance: instance(),
        scoreCandidates: [availableScore],
        scoreAvailability: 'available',
        domainCandidates: [domain()],
      }),
    ).toEqual(
      expect.objectContaining({
        availability: 'available',
        mappingVersion: 'domain-1',
      }),
    );
    for (const candidate of [
      domain({ scoreResultId: '507f1f77bcf86cd799439099' }),
      domain({ qualityStatus: 'failed' }),
      domain({ mappingSource: 'manual' }),
      domain({ mappingMode: 'weighted_mapping' }),
      domain({ computation: { computedAt: at, warningCount: 1 } }),
      domain({
        mappingSnapshot: { mappingVersion: 'domain-2', domainCodes: [] },
      }),
      domain({ domainScores: [] }),
      domain({
        domainScores: [
          ...domain().domainScores,
          { ...domain().domainScores[0] },
        ],
      }),
    ]) {
      expect(
        evaluateClinicalHistoryDomainSource({
          instance: instance(),
          scoreCandidates: [availableScore],
          scoreAvailability: 'available',
          domainCandidates: [candidate],
        }).availability,
      ).toBe('source_incomplete');
    }
  });
});
