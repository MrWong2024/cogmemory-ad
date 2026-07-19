import type { Model } from 'mongoose';
import type { ScaleVersionSummary } from '../../scales/services/scales.service';
import type { ScoreResultDocument } from '../schemas/score-result.schema';
import {
  ScoringService,
  type ScoreResultSummary,
} from '../services/scoring.service';
import type { ScoreReviewActor } from '../types/score-review.types';
import {
  evaluateScoreConfirmationReadiness,
  finalizeManualScoreReview,
  MAX_A18_MANUAL_REVIEW_EVENTS,
  prepareManualScoreReview,
  prepareScoreConfirmation,
  readConfirmationAudit,
  readManualReviewEvents,
  ScoreReviewRuleError,
} from './manual-score-review';

const ITEM_ONE = '507f1f77bcf86cd799439021';
const ITEM_TWO = '507f1f77bcf86cd799439022';
const ITEM_AUTO = '507f1f77bcf86cd799439023';
const ITEM_PROCESS = '507f1f77bcf86cd799439024';
const NOW = new Date('2026-07-11T02:00:00.000Z');
const ACTOR: ScoreReviewActor = {
  operatorId: '507f1f77bcf86cd799439025',
  operatorName: 'A18 Test Operator',
  operatorRole: 'doctor',
};

function scaleItem(
  code: string,
  order: number,
  countsTowardTotal = true,
  step = 1,
) {
  return {
    code,
    title: code,
    order,
    groupCode: 'group_one',
    responseType: 'number' as const,
    scoreRange: { min: 0, max: 1, step },
    countsTowardTotal,
    cognitiveDomainCodes: [],
    evidenceTypes: [],
    requiresTimer: false,
    supportsPhotoUpload: false,
    supportsHandwriting: false,
    requiresOperatorNote: false,
    scoringRule: null,
    qualityControlRule: null,
    reportingRule: null,
  };
}

function versionFixture(): ScaleVersionSummary {
  return {
    id: '507f1f77bcf86cd799439011',
    scaleDefinitionId: '507f1f77bcf86cd799439012',
    scaleCode: 'a18_test',
    version: '1.0',
    status: 'active',
    totalScoreRange: { min: 0, max: 3, step: 0.5 },
    groups: [
      {
        code: 'group_one',
        title: 'Group One',
        order: 1,
        cognitiveDomainCodes: [],
      },
    ],
    items: [
      scaleItem('manual.one', 1, true, 0.5),
      scaleItem('manual.two', 2),
      scaleItem('auto.one', 3),
      scaleItem('process.one', 4, false),
    ],
    qualityControlRules: null,
    reportingRules: null,
    researchExportMappings: null,
    effectiveFrom: null,
    retiredAt: null,
  };
}

function scoreItem(
  itemResponseId: string,
  itemCode: string,
  itemOrder: number,
  scoreStatus: 'needs_review' | 'auto_scored' | 'not_scored',
  scoreValue: number | null,
  countsTowardTotal = true,
) {
  return {
    itemResponseId,
    itemCode,
    groupCode: 'group_one',
    itemTitle: itemCode,
    itemOrder,
    responseType: 'number',
    countsTowardTotal,
    includedInTotal: countsTowardTotal && scoreValue !== null,
    scoreValue,
    maxScore: 1,
    minScore: 0,
    scoreStatus,
    scoreSource:
      scoreStatus === 'auto_scored'
        ? ('auto_rule' as const)
        : ('none' as const),
    isMissing: false,
    cognitiveDomainCodes: [],
    note:
      scoreStatus === 'needs_review'
        ? ('MANUAL_SCORING_REQUIRED' as const)
        : undefined,
  };
}

function resultFixture(): ScoreResultSummary {
  return {
    id: '507f1f77bcf86cd799439013',
    patientId: '507f1f77bcf86cd799439014',
    assessmentVisitId: '507f1f77bcf86cd799439015',
    scaleInstanceId: '507f1f77bcf86cd799439016',
    subjectCode: 'SUBJ-A18-TEST-PURE',
    scaleDefinitionId: '507f1f77bcf86cd799439012',
    scaleVersionId: '507f1f77bcf86cd799439011',
    scaleCode: 'a18_test',
    scaleVersion: '1.0',
    instanceCode: 'INST-A18-TEST-PURE',
    scoreResultCode: 'SCR-A18TESTPURE',
    runNo: 1,
    status: 'needs_review',
    scoringSource: 'mixed',
    scoringMode: 'rule_based',
    versionTrace: { scaleVersion: '1.0' },
    totalScore: {
      scoreValue: 1,
      minScore: 0,
      maxScore: 3,
      scorePercent: null,
      scoredItemCount: 1,
      totalItemCount: 3,
      unscoredItemCount: 2,
      missingItemCount: 0,
      needsReviewItemCount: 2,
    },
    itemScores: [
      scoreItem(ITEM_ONE, 'manual.one', 1, 'needs_review', null),
      scoreItem(ITEM_TWO, 'manual.two', 2, 'needs_review', null),
      scoreItem(ITEM_AUTO, 'auto.one', 3, 'auto_scored', 1),
      scoreItem(ITEM_PROCESS, 'process.one', 4, 'not_scored', null, false),
    ],
    groupScores: [
      {
        groupCode: 'group_one',
        groupTitle: 'Group One',
        scoreValue: 1,
        minScore: 0,
        maxScore: 3,
        scoredItemCount: 1,
        totalItemCount: 3,
      },
    ],
    computation: {
      computedAt: NOW,
      computedBy: null,
      inputItemCount: 4,
      includedItemCount: 3,
      excludedItemCount: 1,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'pending',
      reviewedAt: null,
      reviewerId: null,
    },
    qualityStatus: 'needs_review',
    qualityHints: null,
    metadata: { existingNamespace: { preserved: true } },
    confirmedAt: null,
    lockedAt: null,
    voidedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createScoringService(): ScoringService {
  return new ScoringService({} as Model<ScoreResultDocument>);
}

function expectRuleError(
  action: () => unknown,
  code: ScoreReviewRuleError['code'],
): void {
  try {
    action();
    throw new Error(`Expected ${code}`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ScoreReviewRuleError);
    if (error instanceof ScoreReviewRuleError) {
      expect(error.code).toBe(code);
    }
  }
}

function review(
  result: ScoreResultSummary,
  itemResponseId: string,
  scoreValue: number,
  eventId: string,
) {
  const prepared = prepareManualScoreReview({
    result,
    version: versionFixture(),
    itemResponseId,
    scoreValue,
    reviewNote: 'manual test review',
    reviewedAt: NOW,
    eventId,
    actor: ACTOR,
  });
  const summary = createScoringService().summarizeItemScores(
    prepared.itemScores,
    { provisional: true },
  );
  return finalizeManualScoreReview({
    prepared,
    version: versionFixture(),
    summary,
    actor: ACTOR,
    reviewedAt: NOW,
    reviewNote: 'manual test review',
  });
}

describe('manual score review pure functions', () => {
  it('accepts zero, preserves the original reason and appends a safe audit event', () => {
    const update = review(resultFixture(), ITEM_ONE, 0, 'event-one');
    const item = update.itemScores.find(
      (candidate) => candidate.itemResponseId === ITEM_ONE,
    );
    expect(item).toEqual(
      expect.objectContaining({
        scoreValue: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        includedInTotal: true,
        note: 'MANUAL_SCORING_REQUIRED',
      }),
    );
    expect(update.status).toBe('needs_review');
    expect(update.scoringSource).toBe('mixed');
    expect(update.pendingItemCount).toBe(1);
    expect(update.totalScore.scorePercent).toBeNull();
    expect(update.metadata.existingNamespace).toEqual({ preserved: true });
    expect(readManualReviewEvents(update.metadata)).toEqual([
      expect.objectContaining({
        eventId: 'event-one',
        previousScoreValue: null,
        scoreValue: 0,
        reviewerId: ACTOR.operatorId,
      }),
    ]);
  });

  it('allows a manual score revision and completes the queue with derived totals', () => {
    const first = review(resultFixture(), ITEM_ONE, 0.5, 'event-one');
    const intermediate: ScoreResultSummary = {
      ...resultFixture(),
      ...first,
      updatedAt: new Date('2026-07-11T02:00:01.000Z'),
    };
    const second = review(intermediate, ITEM_TWO, 1, 'event-two');
    expect(second.status).toBe('computed');
    expect(second.review).toEqual(
      expect.objectContaining({
        reviewStatus: 'reviewed',
        reviewerId: ACTOR.operatorId,
      }),
    );
    expect(second.qualityStatus).toBe('unchecked');
    expect(second.totalScore.scoreValue).toBe(2.5);
    expect(second.totalScore.scorePercent).toBeCloseTo(83.3333333333);
    expect(second.groupScores[0]).toEqual(
      expect.objectContaining({
        groupTitle: 'Group One',
        scoreValue: 2.5,
        scoredItemCount: 3,
      }),
    );
    expect(readManualReviewEvents(second.metadata)).toHaveLength(2);

    const completed: ScoreResultSummary = {
      ...intermediate,
      ...second,
    };
    const revised = review(completed, ITEM_ONE, 0, 'event-three');
    expect(revised.status).toBe('computed');
    expect(readManualReviewEvents(revised.metadata)).toHaveLength(3);
    expect(
      readManualReviewEvents(revised.metadata).at(-1)?.previousScoreValue,
    ).toBe(0.5);
  });

  it('rejects auto, process, out-of-range and step-misaligned scores', () => {
    for (const [itemResponseId, scoreValue, code] of [
      [ITEM_AUTO, 1, 'SCORE_ITEM_NOT_REVIEWABLE'],
      [ITEM_PROCESS, 0, 'SCORE_ITEM_NOT_REVIEWABLE'],
      [ITEM_ONE, 2, 'SCORE_MANUAL_VALUE_OUT_OF_RANGE'],
      [ITEM_ONE, 0.25, 'SCORE_MANUAL_VALUE_STEP_INVALID'],
    ] as const) {
      expectRuleError(
        () =>
          prepareManualScoreReview({
            result: resultFixture(),
            version: versionFixture(),
            itemResponseId,
            scoreValue,
            reviewNote: 'manual test review',
            reviewedAt: NOW,
            eventId: 'event-rejected',
            actor: ACTOR,
          }),
        code,
      );
    }
  });

  it('rejects unsupported metadata and the 500 event audit boundary', () => {
    expectRuleError(
      () =>
        prepareManualScoreReview({
          result: { ...resultFixture(), metadata: ['unsupported'] },
          version: versionFixture(),
          itemResponseId: ITEM_ONE,
          scoreValue: 0,
          reviewNote: 'manual test review',
          reviewedAt: NOW,
          eventId: 'event-rejected',
          actor: ACTOR,
        }),
      'SCORE_RESULT_METADATA_UNSUPPORTED',
    );
    const events = Array.from(
      { length: MAX_A18_MANUAL_REVIEW_EVENTS },
      (_, index) => ({ eventId: `event-${index}` }),
    );
    expectRuleError(
      () =>
        prepareManualScoreReview({
          result: {
            ...resultFixture(),
            metadata: { a18ManualReview: { version: 1, events } },
          },
          version: versionFixture(),
          itemResponseId: ITEM_ONE,
          scoreValue: 0,
          reviewNote: 'manual test review',
          reviewedAt: NOW,
          eventId: 'event-limit',
          actor: ACTOR,
        }),
      'SCORE_REVIEW_AUDIT_LIMIT_REACHED',
    );
  });

  it('validates confirmation totals and warnings and builds controlled audit', () => {
    const first = review(resultFixture(), ITEM_ONE, 1, 'event-one');
    const second = review(
      { ...resultFixture(), ...first },
      ITEM_TWO,
      1,
      'event-two',
    );
    const computed: ScoreResultSummary = {
      ...resultFixture(),
      ...second,
      status: 'computed',
    };
    const summary = createScoringService().summarizeItemScores(
      computed.itemScores,
      { provisional: true },
    );
    const readiness = evaluateScoreConfirmationReadiness({
      result: computed,
      version: versionFixture(),
      summary,
    });
    expect(readiness.totalScore.scoreValue).toBe(3);
    expect(readiness.totalScore.scorePercent).toBe(100);
    const confirmation = prepareScoreConfirmation({
      result: computed,
      confirmationId: 'confirmation-one',
      confirmedAt: NOW,
      actor: ACTOR,
      reviewNote: 'final test confirmation',
    });
    expect(readConfirmationAudit(confirmation.metadata)).toEqual(
      expect.objectContaining({
        confirmationId: 'confirmation-one',
        confirmedBy: ACTOR.operatorId,
      }),
    );

    expectRuleError(
      () =>
        evaluateScoreConfirmationReadiness({
          result: {
            ...computed,
            computation: { ...computed.computation!, warningCount: 1 },
          },
          version: versionFixture(),
          summary,
        }),
      'SCORE_RESULT_CONFIRMATION_WARNINGS_PRESENT',
    );
    expectRuleError(
      () =>
        evaluateScoreConfirmationReadiness({
          result: {
            ...computed,
            totalScore: { ...computed.totalScore!, scoreValue: 2 },
          },
          version: versionFixture(),
          summary,
        }),
      'SCORE_RESULT_NOT_READY_FOR_CONFIRMATION',
    );
  });

  it('uses explicit rule errors without exposing values in messages', () => {
    const error = new ScoreReviewRuleError('SCORE_INPUT_INVALID');
    expect(error.message).toBe('SCORE_INPUT_INVALID');
  });
});
