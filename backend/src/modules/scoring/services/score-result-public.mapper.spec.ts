import type { ScaleVersionSummary } from '../../scales/services/scales.service';
import type { ScoreResultSummary } from './scoring.service';
import { ScoreResultPublicMapper } from './score-result-public.mapper';

function versionFixture(): ScaleVersionSummary {
  return {
    id: '507f1f77bcf86cd799439011',
    scaleDefinitionId: '507f1f77bcf86cd799439012',
    scaleCode: 'mmse',
    version: '1.0',
    status: 'active',
    totalScoreRange: { min: 0, max: 30, step: 1 },
    groups: [
      {
        code: 'attention',
        title: 'Attention',
        order: 1,
        cognitiveDomainCodes: ['attention'],
      },
    ],
    items: [],
    qualityControlRules: null,
    reportingRules: null,
    researchExportMappings: null,
    effectiveFrom: null,
    retiredAt: null,
  };
}

function resultFixture(): ScoreResultSummary {
  return {
    id: '507f1f77bcf86cd799439013',
    patientId: '507f1f77bcf86cd799439014',
    assessmentVisitId: '507f1f77bcf86cd799439015',
    scaleInstanceId: '507f1f77bcf86cd799439016',
    subjectCode: 'SUBJ-A17-TEST-MAPPER',
    scaleDefinitionId: '507f1f77bcf86cd799439012',
    scaleVersionId: '507f1f77bcf86cd799439017',
    scaleCode: 'mmse',
    scaleVersion: '1.0',
    instanceCode: 'INST-A17-TEST-MAPPER',
    scoreResultCode: 'SCR-A17TESTMAPPER',
    runNo: 1,
    status: 'needs_review',
    scoringSource: 'mixed',
    scoringMode: 'rule_based',
    versionTrace: {
      scaleVersion: '1.0',
      scoringRuleVersion: 'mmse-crf-1.0',
    },
    totalScore: {
      scoreValue: 3,
      maxScore: 30,
      minScore: 0,
      scorePercent: 10,
      scoredItemCount: 1,
      totalItemCount: 2,
      unscoredItemCount: 1,
      missingItemCount: 1,
      needsReviewItemCount: 1,
    },
    itemScores: [
      {
        itemResponseId: '507f1f77bcf86cd799439018',
        itemCode: 'mmse.attention.serial_sevens',
        groupCode: 'attention',
        itemTitle: 'Serial sevens',
        itemOrder: 1,
        responseType: 'multi_step_calculation',
        countsTowardTotal: true,
        includedInTotal: true,
        scoreValue: 3,
        maxScore: 5,
        minScore: 0,
        scoreStatus: 'auto_scored',
        scoreSource: 'auto_rule',
        isMissing: false,
        cognitiveDomainCodes: ['attention'],
      },
      {
        itemResponseId: '507f1f77bcf86cd799439019',
        itemCode: 'mmse.language.repetition',
        groupCode: 'attention',
        itemTitle: 'Manual item',
        itemOrder: 2,
        responseType: 'text',
        countsTowardTotal: true,
        includedInTotal: false,
        scoreValue: null,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'needs_review',
        scoreSource: 'none',
        isMissing: true,
        cognitiveDomainCodes: ['language'],
        note: 'UNKNOWN_INTERNAL_DETAIL',
      },
    ],
    groupScores: [
      {
        groupCode: 'attention',
        groupTitle: 'Internal title',
        scoreValue: 3,
        maxScore: 6,
        minScore: 0,
        scoredItemCount: 1,
        totalItemCount: 2,
      },
    ],
    computation: {
      computedAt: new Date('2026-07-11T01:00:00.000Z'),
      computedBy: null,
      engineVersion: 'a17-provisional-1.0',
      ruleSetVersion: 'mmse-crf-1.0',
      inputItemCount: 2,
      includedItemCount: 2,
      excludedItemCount: 0,
      warningCount: 1,
      notes: 'warning_codes=UNKNOWN_GROUP_CONFIGURATION,PRIVATE_DETAIL',
    },
    review: {
      reviewStatus: 'pending',
      reviewedAt: new Date('2026-07-11T02:00:00.000Z'),
      reviewerId: '507f1f77bcf86cd799439020',
      reviewerName: 'Private Reviewer',
      reviewNote: 'Private review note',
    },
    qualityStatus: 'needs_review',
    qualityHints: { private: true },
    operatorNote: 'Private operator note',
    metadata: { private: true },
    confirmedAt: null,
    lockedAt: null,
    voidedAt: null,
    createdAt: new Date('2026-07-11T01:00:00.000Z'),
    updatedAt: new Date('2026-07-11T01:00:00.000Z'),
  };
}

describe('ScoreResultPublicMapper', () => {
  const mapper = new ScoreResultPublicMapper();

  it('maps provisional totals and derives a stable safe review queue', () => {
    const mapped = mapper.toPublicResult(resultFixture(), versionFixture());
    expect(mapped.scoreResult.totalScore).toEqual(
      expect.objectContaining({
        provisionalScoreValue: 3,
        scorePercent: null,
        isComplete: false,
        isFinal: false,
      }),
    );
    expect(mapped.reviewQueue).toEqual([
      expect.objectContaining({
        itemCode: 'mmse.language.repetition',
        reasonCode: 'MANUAL_SCORING_REQUIRED',
      }),
    ]);
    expect(mapped.scoreResult.computation.warningCodes).toEqual([
      'UNKNOWN_GROUP_CONFIGURATION',
    ]);
  });

  it('does not expose internal scores, rules, response data or reviewer fields', () => {
    const mapped = mapper.toPublicResult(resultFixture(), versionFixture());
    const serialized = JSON.stringify(mapped);
    const keys = new Set<string>();
    const collectKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collectKeys);
      } else if (typeof value === 'object' && value !== null) {
        Object.entries(value).forEach(([key, nested]) => {
          keys.add(key);
          collectKeys(nested);
        });
      }
    };
    collectKeys(mapped);
    for (const forbidden of [
      'rawResponse',
      'structuredResponse',
      'responseText',
      'expectedValue',
      'scoringRule',
      'isCorrect',
      'qualityHints',
      'metadata',
      'reviewerId',
      'reviewerName',
      'reviewNote',
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
    for (const forbiddenValue of [
      'Private Reviewer',
      'Private operator note',
      'PRIVATE_DETAIL',
      'UNKNOWN_INTERNAL_DETAIL',
    ]) {
      expect(serialized).not.toContain(forbiddenValue);
    }
  });

  it('maps only the latest safe manual review and confirmation summaries', () => {
    const result = resultFixture();
    result.status = 'confirmed';
    result.confirmedAt = new Date('2026-07-11T03:00:00.000Z');
    result.itemScores[1] = {
      ...result.itemScores[1],
      includedInTotal: true,
      scoreValue: 1,
      scoreStatus: 'manual_scored',
      scoreSource: 'operator',
    };
    result.metadata = {
      a18ManualReview: {
        version: 1,
        events: [
          {
            eventId: 'event-old',
            itemResponseId: result.itemScores[1].itemResponseId,
            itemCode: result.itemScores[1].itemCode,
            originalReasonCode: 'MANUAL_SCORING_REQUIRED',
            previousScoreValue: null,
            scoreValue: 0,
            reviewNote: 'old safe note',
            reviewedAt: new Date('2026-07-11T02:00:00.000Z'),
            reviewerId: '507f1f77bcf86cd799439020',
            reviewerName: 'Old Reviewer',
            reviewerRole: 'nurse',
          },
          {
            eventId: 'event-latest',
            itemResponseId: result.itemScores[1].itemResponseId,
            itemCode: result.itemScores[1].itemCode,
            originalReasonCode: 'MANUAL_SCORING_REQUIRED',
            previousScoreValue: 0,
            scoreValue: 1,
            reviewNote: 'latest safe note',
            reviewedAt: new Date('2026-07-11T02:30:00.000Z'),
            reviewerId: '507f1f77bcf86cd799439021',
            reviewerName: 'Latest Reviewer',
            reviewerRole: 'doctor',
          },
        ],
      },
      a18Confirmation: {
        confirmationId: 'confirmation-safe',
        confirmedAt: result.confirmedAt,
        confirmedBy: '507f1f77bcf86cd799439021',
        confirmedByName: 'Latest Reviewer',
        confirmedByRole: 'doctor',
        reviewNote: 'final safe note',
      },
    };

    const mapped = mapper.toPublicResult(result, versionFixture());
    expect(mapped.scoreResult.updatedAt).toEqual(result.updatedAt);
    const manualReview = mapped.scoreResult.itemScores[1].manualReview;
    expect(manualReview?.reviewNote).toBe('latest safe note');
    expect(manualReview?.reviewer.operatorName).toBe('Latest Reviewer');
    expect(manualReview?.reviewer.operatorRole).toBe('doctor');
    expect(mapped.scoreResult.itemScores[1]).not.toHaveProperty(
      'reviewReasonCode',
    );
    expect(mapped.scoreResult.confirmation?.confirmationId).toBe(
      'confirmation-safe',
    );
    expect(mapped.scoreResult.confirmation?.reviewNote).toBe('final safe note');
    const serialized = JSON.stringify(mapped);
    expect(serialized).not.toContain('previousScoreValue');
    expect(serialized).not.toContain('event-old');
    expect(serialized).not.toContain('old safe note');
    expect(serialized).not.toContain('a18ManualReview');
  });

  it('safely ignores malformed metadata rather than exposing or throwing it', () => {
    const result = resultFixture();
    result.metadata = { a18ManualReview: { events: 'private-invalid' } };
    expect(() => mapper.toPublicResult(result, versionFixture())).not.toThrow();
    expect(
      JSON.stringify(mapper.toPublicResult(result, versionFixture())),
    ).not.toContain('private-invalid');
  });
});
