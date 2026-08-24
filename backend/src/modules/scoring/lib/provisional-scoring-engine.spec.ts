import { Types } from 'mongoose';
import type { ItemResponseSummary } from '../../assessments/services/assessments.service';
import { MMSE_SCALE_VERSION_SEED } from '../../scales/seeds/mmse.seed';
import { MOCA_SCALE_VERSION_SEED } from '../../scales/seeds/moca.seed';
import type {
  ScaleItemConfigSummary,
  ScaleVersionSummary,
} from '../../scales/services/scales.service';
import type { ScoringComputationSummary } from '../services/scoring.service';
import {
  evaluateProvisionalItems,
  finalizeProvisionalScoring,
} from './provisional-scoring-engine';

function versionFromSeed(
  seed: typeof MMSE_SCALE_VERSION_SEED,
): ScaleVersionSummary {
  return {
    id: new Types.ObjectId().toString(),
    scaleDefinitionId: new Types.ObjectId().toString(),
    scaleCode: seed.scaleCode,
    version: seed.version,
    displayVersion: seed.displayVersion,
    crfVersion: seed.crfVersion,
    scoringRuleVersion: seed.scoringRuleVersion,
    fieldEncodingVersion: seed.fieldEncodingVersion,
    sourceDocument: seed.sourceDocument,
    status: seed.status,
    totalScoreRange: { ...seed.totalScoreRange },
    groups: seed.groups.map((group) => ({
      ...group,
      cognitiveDomainCodes: [...group.cognitiveDomainCodes],
    })),
    items: seed.items.map((item) => ({
      ...item,
      scoreRange: { ...item.scoreRange },
      cognitiveDomainCodes: [...item.cognitiveDomainCodes],
      evidenceTypes: [...item.evidenceTypes],
    })),
    qualityControlRules: seed.qualityControlRules,
    reportingRules: seed.reportingRules,
    researchExportMappings: seed.researchExportMappings,
    effectiveFrom: null,
    retiredAt: null,
  };
}

function responseFor(
  item: ScaleItemConfigSummary,
  overrides: Partial<ItemResponseSummary> = {},
): ItemResponseSummary {
  const id = new Types.ObjectId().toString();
  return {
    id,
    assessmentVisitId: new Types.ObjectId().toString(),
    scaleInstanceId: new Types.ObjectId().toString(),
    patientId: new Types.ObjectId().toString(),
    subjectCode: 'SUBJ-A17-TEST-ENGINE',
    scaleDefinitionId: new Types.ObjectId().toString(),
    scaleVersionId: new Types.ObjectId().toString(),
    scaleCode: 'test',
    scaleVersion: '1.0',
    instanceCode: 'INST-A17-TEST-ENGINE',
    itemCode: item.code,
    crfCode: item.crfCode,
    groupCode: item.groupCode,
    itemTitle: item.title,
    itemOrder: item.order,
    responseType: item.responseType,
    countsTowardTotal: item.countsTowardTotal,
    cognitiveDomainCodes: [...item.cognitiveDomainCodes],
    itemConfigSnapshot: null,
    versionTrace: null,
    status: 'answered',
    answerSource: 'clinician_recorded',
    rawResponse: false,
    structuredResponse: null,
    isMissing: false,
    score: {
      scoreValue: null,
      maxScore: item.scoreRange.max,
      minScore: item.scoreRange.min,
      scoreStatus: 'not_scored',
      scoreSource: 'none',
      scoredAt: null,
      scoredBy: null,
    },
    stepResults: [],
    promptResponses: [],
    timing: null,
    evidenceRefs: [],
    qualityControlHints: null,
    metadata: null,
    lockedAt: null,
    voidedAt: null,
    ...overrides,
  };
}

function serialSteps(
  prefix: string,
  actualValues: Array<number | string | boolean | null>,
) {
  const expected = [93, 86, 79, 72, 65];
  return expected.map((value, index) => ({
    stepCode: `${prefix}.step_${index + 1}`,
    order: index + 1,
    expectedValue: value,
    actualValue: actualValues[index],
    isCorrect: null,
    scoreValue: null,
    countsTowardItemScore: true,
  }));
}

function summaryFor(
  itemScores: ReturnType<typeof evaluateProvisionalItems>['itemScores'],
): ScoringComputationSummary {
  const included = itemScores.filter((item) => item.countsTowardTotal);
  const scored = included.filter((item) => item.scoreValue !== null);
  const groups = new Map<string, typeof included>();
  for (const item of included) {
    if (item.groupCode) {
      groups.set(item.groupCode, [...(groups.get(item.groupCode) ?? []), item]);
    }
  }
  const totalValue = scored.reduce(
    (sum, item) => sum + (item.scoreValue ?? 0),
    0,
  );
  return {
    totalScore: {
      scoreValue: scored.length > 0 ? totalValue : null,
      maxScore: included.reduce((sum, item) => sum + (item.maxScore ?? 0), 0),
      minScore: included.reduce((sum, item) => sum + (item.minScore ?? 0), 0),
      scorePercent: null,
      scoredItemCount: scored.length,
      totalItemCount: included.length,
      unscoredItemCount: included.length - scored.length,
      missingItemCount: included.filter((item) => item.isMissing).length,
      needsReviewItemCount: included.filter(
        (item) => item.scoreStatus === 'needs_review',
      ).length,
    },
    itemScores,
    groupScores: Array.from(groups.entries()).map(([groupCode, items]) => ({
      groupCode,
      scoreValue: items.some((item) => item.scoreValue !== null)
        ? items.reduce((sum, item) => sum + (item.scoreValue ?? 0), 0)
        : null,
      maxScore: items.reduce((sum, item) => sum + (item.maxScore ?? 0), 0),
      minScore: items.reduce((sum, item) => sum + (item.minScore ?? 0), 0),
      scoredItemCount: items.filter((item) => item.scoreValue !== null).length,
      totalItemCount: items.length,
    })),
    inputItemCount: itemScores.length,
    includedItemCount: included.length,
    excludedItemCount: itemScores.length - included.length,
    scoredItemCount: scored.length,
    unscoredItemCount: included.length - scored.length,
    missingItemCount: included.filter((item) => item.isMissing).length,
    needsReviewItemCount: included.filter(
      (item) => item.scoreStatus === 'needs_review',
    ).length,
    warnings: [],
  };
}

describe('provisional scoring engine', () => {
  const mmse = versionFromSeed(MMSE_SCALE_VERSION_SEED);
  const moca = versionFromSeed(MOCA_SCALE_VERSION_SEED);
  const mmseSerial = mmse.items.find(
    (item) => item.scoringRule?.mode === 'multi_step_manual',
  );
  const mocaSerial = moca.items.find(
    (item) => item.scoringRule?.mode === 'multi_step_manual',
  );

  if (!mmseSerial || !mocaSerial) {
    throw new Error('Expected real serial sevens seed items');
  }

  it.each([
    {
      label: 'manual smoke regression',
      actualValues: [93, 86, 79, 76, 65],
      correctStepCount: 3,
      mocaScore: 2,
    },
    {
      label: 'first-step error with later independent recovery',
      actualValues: [92, 85, 78, 71, 65],
      correctStepCount: 3,
      mocaScore: 2,
    },
    {
      label: 'restarts a correct chain after an error',
      actualValues: [93, 86, 80, 73, 66],
      correctStepCount: 4,
      mocaScore: 3,
    },
    {
      label: 'all steps correct',
      actualValues: [93, 86, 79, 72, 65],
      correctStepCount: 5,
      mocaScore: 3,
    },
  ])(
    'scores serial sevens by chained independent steps: $label',
    ({ actualValues, correctStepCount, mocaScore }) => {
      const mmseResponse = responseFor(mmseSerial, {
        stepResults: serialSteps('mmse.attention.serial_sevens', actualValues),
      });
      const mocaResponse = responseFor(mocaSerial, {
        stepResults: serialSteps('moca.attention.serial_sevens', actualValues),
      });

      expect(
        evaluateProvisionalItems([mmseSerial], [mmseResponse]).itemScores[0],
      ).toEqual(
        expect.objectContaining({
          scoreValue: correctStepCount,
          scoreStatus: 'auto_scored',
          scoreSource: 'auto_rule',
        }),
      );
      expect(
        evaluateProvisionalItems([mocaSerial], [mocaResponse]).itemScores[0]
          .scoreValue,
      ).toBe(mocaScore);
      expect(
        [...mmseResponse.stepResults, ...mocaResponse.stepResults].every(
          (step) => step.isCorrect === null,
        ),
      ).toBe(true);
    },
  );

  it('keeps ordinary multi-step numeric scoring on fixed expected values', () => {
    const item: ScaleItemConfigSummary = {
      ...mmseSerial,
      scoreRange: { min: 0, max: 2, step: 1 },
      scoringRule: {
        mode: 'multi_step_manual',
        steps: [
          { code: 'test.step_1', expected: 93, maxScore: 1 },
          { code: 'test.step_2', expected: 86, maxScore: 1 },
        ],
      },
    };
    const response = responseFor(item, {
      stepResults: [
        {
          stepCode: 'test.step_1',
          order: 1,
          expectedValue: 93,
          actualValue: 92,
          isCorrect: null,
          scoreValue: null,
          countsTowardItemScore: true,
        },
        {
          stepCode: 'test.step_2',
          order: 2,
          expectedValue: 86,
          actualValue: 85,
          isCorrect: null,
          scoreValue: null,
          countsTowardItemScore: true,
        },
      ],
    });

    expect(
      evaluateProvisionalItems([item], [response]).itemScores[0].scoreValue,
    ).toBe(0);
  });

  it('accepts finite zero and boolean false without coercion', () => {
    const item: ScaleItemConfigSummary = {
      ...mmseSerial,
      scoreRange: { min: 0, max: 2, step: 1 },
      scoringRule: {
        mode: 'multi_step_manual',
        steps: [
          { code: 'test.zero', expected: 0, maxScore: 1 },
          { code: 'test.false', expected: false, maxScore: 1 },
        ],
      },
    };
    const response = responseFor(item, {
      stepResults: [
        {
          stepCode: 'test.zero',
          order: 1,
          expectedValue: 0,
          actualValue: 0,
          isCorrect: null,
          scoreValue: null,
          countsTowardItemScore: true,
        },
        {
          stepCode: 'test.false',
          order: 2,
          expectedValue: false,
          actualValue: false,
          isCorrect: null,
          scoreValue: null,
          countsTowardItemScore: true,
        },
      ],
    });
    expect(
      evaluateProvisionalItems([item], [response]).itemScores[0].scoreValue,
    ).toBe(2);
  });

  it.each([
    [
      'missing step',
      serialSteps('mmse.attention.serial_sevens', [93, 86, 79, 72]).slice(0, 4),
      'STEP_CONFIGURATION_INVALID',
    ],
    [
      'numeric string',
      serialSteps('mmse.attention.serial_sevens', ['93', 86, 79, 72, 65]),
      'STEP_RESPONSE_TYPE_UNSUPPORTED',
    ],
    [
      'missing value',
      serialSteps('mmse.attention.serial_sevens', [null, 86, 79, 72, 65]),
      'STEP_RESPONSE_MISSING',
    ],
  ])('reviews %s without guessing', (_label, stepResults, reasonCode) => {
    const response = responseFor(mmseSerial, { stepResults });
    expect(
      evaluateProvisionalItems([mmseSerial], [response]).itemScores[0],
    ).toEqual(expect.objectContaining({ scoreValue: null, note: reasonCode }));
  });

  it('rejects duplicate response steps and malformed aggregation rules', () => {
    const duplicate = serialSteps(
      'mmse.attention.serial_sevens',
      [93, 86, 79, 72, 65],
    );
    duplicate.push({ ...duplicate[0] });
    expect(
      evaluateProvisionalItems(
        [mmseSerial],
        [responseFor(mmseSerial, { stepResults: duplicate })],
      ).itemScores[0].note,
    ).toBe('STEP_CONFIGURATION_INVALID');

    const mismatchedReference = serialSteps(
      'mmse.attention.serial_sevens',
      [93, 86, 79, 72, 65],
    );
    mismatchedReference[1] = {
      ...mismatchedReference[1],
      expectedValue: 85,
    };
    expect(
      evaluateProvisionalItems(
        [mmseSerial],
        [responseFor(mmseSerial, { stepResults: mismatchedReference })],
      ).itemScores[0].note,
    ).toBe('STEP_RESPONSE_TYPE_UNSUPPORTED');

    const malformed = {
      ...mocaSerial,
      scoringRule: {
        ...mocaSerial.scoringRule,
        aggregationRule: [{ correctStepCount: 0, score: 0 }],
      },
    };
    expect(
      evaluateProvisionalItems(
        [malformed],
        [
          responseFor(malformed, {
            stepResults: serialSteps(
              'moca.attention.serial_sevens',
              [93, 86, 79, 72, 65],
            ),
          }),
        ],
      ).itemScores[0].note,
    ).toBe('AGGREGATION_RULE_INVALID');
  });

  it('excludes non-scoring raw records without putting them in review', () => {
    const item = moca.items.find(
      (candidate) => candidate.scoringRule?.mode === 'raw_record_only',
    );
    if (!item) throw new Error('Expected real raw record item');
    const score = evaluateProvisionalItems([item], [responseFor(item)])
      .itemScores[0];
    expect(score).toEqual(
      expect.objectContaining({
        countsTowardTotal: false,
        includedInTotal: false,
        scoreStatus: 'not_scored',
        scoreSource: 'none',
        note: 'NON_SCORING_PROCESS_ITEM',
      }),
    );
  });

  it('sums clinician-confirmed structured manual correctness deterministically', () => {
    const item = mmse.items.find(
      (candidate) => candidate.code === 'mmse.orientation.time',
    );
    if (!item) throw new Error('Expected MMSE time orientation item');
    const response = responseFor(item, {
      structuredResponse: {
        subItems: {
          'mmse.orientation.year': {
            responseText: 'clearly not the reference answer',
            isCorrect: true,
          },
          'mmse.orientation.season': {
            responseText: 'summer',
            isCorrect: true,
          },
          'mmse.orientation.month': {
            responseText: 'July',
            isCorrect: true,
          },
          'mmse.orientation.date': {
            responseText: '1',
            isCorrect: false,
          },
          'mmse.orientation.weekday': {
            responseText: 'Monday',
            isCorrect: true,
          },
        },
      },
    });

    expect(evaluateProvisionalItems([item], [response]).itemScores[0]).toEqual(
      expect.objectContaining({
        scoreValue: 4,
        scoreStatus: 'auto_scored',
        scoreSource: 'auto_rule',
        includedInTotal: true,
        note: undefined,
      }),
    );
  });

  it('scores a complete all-false structured response as zero', () => {
    const item = mmse.items.find(
      (candidate) => candidate.code === 'mmse.language.naming',
    );
    if (!item) throw new Error('Expected MMSE naming item');

    const score = evaluateProvisionalItems(
      [item],
      [
        responseFor(item, {
          structuredResponse: {
            subItems: {
              'mmse.language.naming.watch': {
                responseText: 'watch response',
                isCorrect: false,
              },
              'mmse.language.naming.pencil': {
                responseText: 'pencil response',
                isCorrect: false,
              },
            },
          },
        }),
      ],
    ).itemScores[0];

    expect(score).toEqual(
      expect.objectContaining({ scoreValue: 0, scoreStatus: 'auto_scored' }),
    );
  });

  it('maps a clinician-confirmed binary decision to deterministic 1 or 0', () => {
    const item = mmse.items.find(
      (candidate) => candidate.scoringRule?.mode === 'manual_exact_match',
    );
    if (!item) throw new Error('Expected binary exact-match item');

    const correct = evaluateProvisionalItems(
      [item],
      [
        responseFor(item, {
          responseText: 'arbitrary patient repetition',
          structuredResponse: {
            binaryManualDecision: { isCorrect: true },
          },
        }),
      ],
    ).itemScores[0];
    const incorrect = evaluateProvisionalItems(
      [item],
      [
        responseFor(item, {
          responseText: 'same arbitrary patient repetition',
          structuredResponse: {
            binaryManualDecision: { isCorrect: false },
          },
        }),
      ],
    ).itemScores[0];

    expect(correct).toEqual(
      expect.objectContaining({
        scoreValue: 1,
        scoreStatus: 'auto_scored',
        scoreSource: 'auto_rule',
        includedInTotal: true,
        note: undefined,
      }),
    );
    expect(incorrect).toEqual(
      expect.objectContaining({
        scoreValue: 0,
        scoreStatus: 'auto_scored',
        scoreSource: 'auto_rule',
        includedInTotal: true,
      }),
    );
  });

  it('scores only the clinician decision when boolean observation and judgment differ', () => {
    const item = mmse.items.find(
      (candidate) => candidate.scoringRule?.mode === 'manual_observation',
    );
    if (!item) throw new Error('Expected binary observation item');

    const score = evaluateProvisionalItems(
      [item],
      [
        responseFor(item, {
          rawResponse: true,
          structuredResponse: {
            binaryManualDecision: { isCorrect: false },
          },
        }),
      ],
    ).itemScores[0];

    expect(score).toEqual(
      expect.objectContaining({ scoreValue: 0, scoreStatus: 'auto_scored' }),
    );
  });

  it('reviews invalid stored structured responses and unparseable definitions', () => {
    const item = mmse.items.find(
      (candidate) => candidate.code === 'mmse.orientation.time',
    );
    if (!item) throw new Error('Expected MMSE time orientation item');

    expect(
      evaluateProvisionalItems(
        [item],
        [
          responseFor(item, {
            structuredResponse: {
              subItems: {
                'mmse.orientation.year': {
                  responseText: '2026',
                  isCorrect: true,
                },
              },
            },
          }),
        ],
      ).itemScores[0],
    ).toEqual(
      expect.objectContaining({
        scoreValue: null,
        scoreStatus: 'needs_review',
        note: 'STRUCTURED_RESPONSE_INVALID',
      }),
    );

    const unparseable = {
      ...item,
      scoringRule: {
        mode: 'structured_manual',
        subItems: [{ code: 'no-stable-label', maxScore: 1 }],
      },
    };
    expect(
      evaluateProvisionalItems([unparseable], [responseFor(unparseable)])
        .itemScores[0].note,
    ).toBe('MANUAL_SCORING_REQUIRED');
  });

  it.each([
    'manual_exact_match',
    'manual_observation',
    'manual_drawing_review',
    'structured_drawing_review',
    'timed_manual',
    'manual_concept_review',
    'delayed_recall_with_prompt_records',
  ])('keeps %s in manual review', (mode) => {
    const item = [...mmse.items, ...moca.items].find(
      (candidate) =>
        candidate.countsTowardTotal && candidate.scoringRule?.mode === mode,
    );
    if (!item) throw new Error(`Expected real ${mode} item`);
    expect(
      evaluateProvisionalItems([item], [responseFor(item)]).itemScores[0],
    ).toEqual(
      expect.objectContaining({
        note: 'MANUAL_SCORING_REQUIRED',
        scoreValue: null,
      }),
    );
  });

  it('reviews missing responses and preexisting item scores before rules', () => {
    expect(
      evaluateProvisionalItems(
        [mmseSerial],
        [responseFor(mmseSerial, { isMissing: true })],
      ).itemScores[0].note,
    ).toBe('MISSING_RESPONSE_REQUIRES_REVIEW');
    expect(
      evaluateProvisionalItems(
        [mmseSerial],
        [
          responseFor(mmseSerial, {
            score: {
              scoreValue: 1,
              maxScore: 5,
              minScore: 0,
              scoreStatus: 'manual_scored',
              scoreSource: 'operator',
              scoredAt: null,
              scoredBy: null,
            },
          }),
        ],
      ).itemScores[0].note,
    ).toBe('PREEXISTING_ITEM_SCORE_REQUIRES_REVIEW');
  });

  it('reviews unknown modes and invalid score ranges', () => {
    const unknown = { ...mmseSerial, scoringRule: { mode: 'future_mode' } };
    expect(
      evaluateProvisionalItems([unknown], [responseFor(unknown)]).itemScores[0]
        .note,
    ).toBe('UNSUPPORTED_SCORING_MODE');
    const invalid = { ...mmseSerial, scoreRange: { min: 5, max: 0, step: 1 } };
    expect(
      evaluateProvisionalItems([invalid], [responseFor(invalid)]).itemScores[0]
        .note,
    ).toBe('ITEM_SCORE_RANGE_INVALID');
  });

  it('builds provisional totals, groups, status and source without a partial percent', () => {
    const automatic = responseFor(mmseSerial, {
      stepResults: serialSteps(
        'mmse.attention.serial_sevens',
        [93, 86, 79, 72, 65],
      ),
    });
    const manualItem = mmse.items.find(
      (item) =>
        item.countsTowardTotal &&
        item.scoringRule?.mode === 'manual_exact_match',
    );
    if (!manualItem) throw new Error('Expected manual item');
    const evaluation = evaluateProvisionalItems(
      [mmseSerial, manualItem],
      [automatic, responseFor(manualItem)],
    );
    const result = finalizeProvisionalScoring(
      mmse,
      evaluation,
      summaryFor(evaluation.itemScores),
    );
    expect(result).toEqual(
      expect.objectContaining({
        resultStatus: 'needs_review',
        scoringSource: 'mixed',
        reviewStatus: 'pending',
        qualityStatus: 'needs_review',
      }),
    );
    expect(result.totalScore).toEqual(
      expect.objectContaining({
        scoreValue: 5,
        scorePercent: null,
        scoredItemCount: 1,
        unscoredItemCount: 1,
        needsReviewItemCount: 1,
      }),
    );
    expect(result.groupScores[0]).toEqual(
      expect.objectContaining({
        groupCode: 'attention_calculation',
        scoreValue: 5,
      }),
    );
  });
});
