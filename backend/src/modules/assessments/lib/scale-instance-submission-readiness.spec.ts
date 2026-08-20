import type { ScaleItemConfigSummary } from '../../scales/services/scales.service';
import { MMSE_SCALE_VERSION_SEED } from '../../scales/seeds/mmse.seed';
import type {
  ItemResponseSummary,
  ScaleInstanceSummary,
} from '../services/assessments.service';
import {
  evaluateScaleInstanceSubmissionReadiness,
  sortSubmissionIssues,
} from './scale-instance-submission-readiness';

const CHECKED_AT = new Date('2026-07-11T08:00:00.000Z');

function createVersionItem(
  overrides: Partial<ScaleItemConfigSummary> = {},
): ScaleItemConfigSummary {
  return {
    code: 'scale.item.1',
    title: 'Safe item title',
    order: 1,
    responseType: 'text',
    scoreRange: { min: 0, max: 1 },
    countsTowardTotal: true,
    cognitiveDomainCodes: [],
    evidenceTypes: ['raw_text'],
    requiresTimer: false,
    supportsPhotoUpload: false,
    supportsHandwriting: false,
    requiresOperatorNote: false,
    scoringRule: null,
    qualityControlRule: null,
    reportingRule: null,
    ...overrides,
  };
}

function createScaleInstance(
  overrides: Partial<ScaleInstanceSummary> = {},
): ScaleInstanceSummary {
  return {
    id: '507f1f77bcf86cd799439013',
    assessmentVisitId: '507f1f77bcf86cd799439012',
    patientId: '507f1f77bcf86cd799439011',
    subjectCode: 'SUBJ-A16-TEST-001',
    scaleDefinitionId: '507f1f77bcf86cd799439014',
    scaleVersionId: '507f1f77bcf86cd799439015',
    scaleCode: 'scale',
    scaleVersion: '1.0',
    instanceCode: 'INST-A16-TEST-001',
    instanceNo: 1,
    status: 'draft',
    administrationMode: 'clinician_administered',
    versionTrace: null,
    startedAt: new Date('2026-07-11T07:00:00.000Z'),
    completedAt: null,
    lockedAt: null,
    voidedAt: null,
    durationMs: null,
    operatorSnapshot: null,
    progress: null,
    qualityControlSummary: null,
    metadata: null,
    ...overrides,
  };
}

function createItemResponse(
  overrides: Partial<ItemResponseSummary> = {},
): ItemResponseSummary {
  return {
    id: '507f1f77bcf86cd799439016',
    assessmentVisitId: '507f1f77bcf86cd799439012',
    scaleInstanceId: '507f1f77bcf86cd799439013',
    patientId: '507f1f77bcf86cd799439011',
    subjectCode: 'SUBJ-A16-TEST-001',
    scaleDefinitionId: '507f1f77bcf86cd799439014',
    scaleVersionId: '507f1f77bcf86cd799439015',
    scaleCode: 'scale',
    scaleVersion: '1.0',
    instanceCode: 'INST-A16-TEST-001',
    itemCode: 'scale.item.1',
    itemTitle: 'Safe item title',
    itemOrder: 1,
    responseType: 'text',
    countsTowardTotal: true,
    cognitiveDomainCodes: [],
    itemConfigSnapshot: null,
    versionTrace: null,
    status: 'answered',
    answerSource: 'clinician_recorded',
    rawResponse: false,
    structuredResponse: null,
    isMissing: false,
    score: null,
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

function createReadingVersionItem(): ScaleItemConfigSummary {
  return createVersionItem({
    code: 'mmse.language.reading_command',
    title: '阅读并执行',
    responseType: 'boolean',
    scoreRange: { min: 0, max: 1, step: 1 },
    scoringRule: { mode: 'manual_observation' },
  });
}

function createReadingItemResponse(
  overrides: Partial<ItemResponseSummary> = {},
): ItemResponseSummary {
  return createItemResponse({
    itemCode: 'mmse.language.reading_command',
    itemTitle: '阅读并执行',
    responseType: 'boolean',
    itemConfigSnapshot: {
      responseType: 'boolean',
      scoreRange: { min: 0, max: 1, step: 1 },
      scoringRule: { mode: 'manual_observation' },
    },
    versionTrace: { scaleVersion: '1.0' },
    rawResponse: false,
    responseText: '请闭上您的眼睛',
    structuredResponse: {
      binaryManualDecision: { isCorrect: false },
    },
    ...overrides,
  });
}

function evaluate(
  versionItems: ScaleItemConfigSummary[],
  itemResponses: ItemResponseSummary[],
  scaleInstance = createScaleInstance(),
  patientAdministrationCompleted = true,
) {
  return evaluateScaleInstanceSubmissionReadiness({
    patientStatus: 'active',
    visitStatus: 'draft',
    patientAdministrationCompleted,
    scaleInstance,
    versionItems,
    itemResponses,
    checkedAt: CHECKED_AT,
  });
}

describe('scale instance submission readiness', () => {
  it('adds one scale-level blocker until supervised patient administration is completed', () => {
    const supervisedInstance = createScaleInstance({
      administrationMode: 'supervised_patient_input',
    });
    const incomplete = evaluate(
      [createVersionItem()],
      [createItemResponse()],
      supervisedInstance,
      false,
    );

    expect(
      incomplete.blockingIssues.filter(
        (issue) => issue.scope === 'scale_instance',
      ),
    ).toEqual([
      expect.objectContaining({
        code: 'SCALE_INSTANCE_PATIENT_ADMINISTRATION_INCOMPLETE',
        severity: 'blocking',
        scope: 'scale_instance',
      }),
    ]);
    expect(incomplete.ready).toBe(false);
    expect(incomplete.canSubmitNow).toBe(false);
    expect(incomplete.summary.blockingIssueCount).toBe(1);

    const completed = evaluate(
      [createVersionItem()],
      [createItemResponse()],
      supervisedInstance,
      true,
    );
    expect(completed.blockingIssues.map((issue) => issue.code)).not.toContain(
      'SCALE_INSTANCE_PATIENT_ADMINISTRATION_INCOMPLETE',
    );
    expect(completed.ready).toBe(true);

    const clinician = evaluate(
      [createVersionItem()],
      [createItemResponse()],
      createScaleInstance({ administrationMode: 'clinician_administered' }),
      false,
    );
    expect(clinician.blockingIssues).toHaveLength(0);
    expect(clinician.ready).toBe(true);
  });

  it('keeps existing item-level blockers while adding the supervised gate', () => {
    const result = evaluate(
      [createVersionItem()],
      [createItemResponse({ status: 'in_progress', rawResponse: null })],
      createScaleInstance({
        administrationMode: 'supervised_patient_input',
      }),
      false,
    );

    expect(result.blockingIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'SCALE_INSTANCE_PATIENT_ADMINISTRATION_INCOMPLETE',
        'ITEM_NOT_COMPLETED',
        'ITEM_ANSWER_CONTENT_MISSING',
      ]),
    );
  });

  it('accepts false and zero but rejects empty JSON answer values', () => {
    for (const value of [false, 0]) {
      expect(
        evaluate(
          [createVersionItem()],
          [createItemResponse({ rawResponse: value })],
        ).ready,
      ).toBe(true);
    }

    for (const value of ['', [], {}]) {
      const result = evaluate(
        [createVersionItem()],
        [createItemResponse({ rawResponse: value })],
      );
      expect(result.blockingIssues.map((issue) => issue.code)).toContain(
        'ITEM_ANSWER_CONTENT_MISSING',
      );
    }
  });

  it('checks the complete configured item set including non-scored items', () => {
    const versionItems = [
      createVersionItem(),
      createVersionItem({
        code: 'scale.process.item',
        order: 2,
        countsTowardTotal: false,
      }),
    ];
    const result = evaluate(versionItems, [createItemResponse()]);
    const mismatch = result.blockingIssues.find(
      (issue) => issue.code === 'SCALE_INSTANCE_ITEM_SET_MISMATCH',
    );

    expect(mismatch?.missingItemCodes).toEqual(['scale.process.item']);
    expect(result.summary.expectedItemCount).toBe(2);
  });

  it('checks completion, missing reason, required steps and leaves prompts optional', () => {
    const result = evaluate(
      [createVersionItem()],
      [
        createItemResponse({
          status: 'in_progress',
          rawResponse: null,
          stepResults: [
            {
              stepCode: 'step.required',
              order: 1,
              expectedValue: 'hidden',
              actualValue: '',
              isCorrect: null,
              scoreValue: null,
              countsTowardItemScore: true,
            },
            {
              stepCode: 'step.optional',
              order: 2,
              expectedValue: 'hidden',
              actualValue: null,
              isCorrect: null,
              scoreValue: null,
              countsTowardItemScore: false,
            },
          ],
          promptResponses: [
            {
              promptType: 'semantic_category',
              responseAfterPrompt: null,
              isCorrect: null,
              countsTowardScore: false,
              order: 1,
            },
          ],
        }),
      ],
    );

    expect(result.blockingIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'ITEM_NOT_COMPLETED',
        'ITEM_ANSWER_CONTENT_MISSING',
        'ITEM_REQUIRED_STEP_MISSING',
      ]),
    );

    const missing = evaluate(
      [createVersionItem()],
      [
        createItemResponse({
          isMissing: true,
          missingReason: ' ',
          rawResponse: null,
        }),
      ],
    );
    expect(missing.blockingIssues.map((issue) => issue.code)).toEqual([
      'ITEM_MISSING_REASON_REQUIRED',
    ]);
  });

  it('fails closed on incomplete non-missing structured manual responses', () => {
    const versionItem = createVersionItem({
      responseType: 'multi_choice',
      scoreRange: { min: 0, max: 2, step: 1 },
      scoringRule: {
        mode: 'structured_manual',
        subItems: [
          { code: 'year', title: 'Year', maxScore: 1 },
          { code: 'month', title: 'Month', maxScore: 1 },
        ],
      },
    });
    const complete = evaluate(
      [versionItem],
      [
        createItemResponse({
          structuredResponse: {
            subItems: {
              year: { responseText: '2026', isCorrect: true },
              month: { responseText: 'July', isCorrect: false },
            },
          },
        }),
      ],
    );
    expect(complete.blockingIssues.map((issue) => issue.code)).not.toContain(
      'ITEM_STRUCTURED_SUBITEMS_INCOMPLETE',
    );

    const legacyFreeTextOnly = evaluate(
      [versionItem],
      [
        createItemResponse({
          rawResponse: null,
          responseText: 'Legacy free-text answer',
          structuredResponse: {
            subItems: {
              year: { responseText: '2026', isCorrect: true },
            },
          },
        }),
      ],
    );
    expect(
      legacyFreeTextOnly.blockingIssues.map((issue) => issue.code),
    ).toContain('ITEM_STRUCTURED_SUBITEMS_INCOMPLETE');

    const missing = evaluate(
      [versionItem],
      [
        createItemResponse({
          isMissing: true,
          missingReason: 'Unable to assess',
          rawResponse: null,
          structuredResponse: null,
        }),
      ],
    );
    expect(missing.blockingIssues.map((issue) => issue.code)).not.toContain(
      'ITEM_STRUCTURED_SUBITEMS_INCOMPLETE',
    );

    expect(
      evaluate([createVersionItem()], [createItemResponse()]).blockingIssues,
    ).toEqual([]);
  });

  it('requires binary manual decisions without treating them as answer content', () => {
    const versionItem = createVersionItem({
      scoringRule: { mode: 'manual_observation' },
      scoreRange: { min: 0, max: 1, step: 1 },
    });

    const complete = evaluate(
      [versionItem],
      [
        createItemResponse({
          rawResponse: false,
          structuredResponse: {
            binaryManualDecision: { isCorrect: false },
          },
        }),
      ],
    );
    expect(complete.blockingIssues).toEqual([]);

    const historicalAnswered = evaluate(
      [versionItem],
      [createItemResponse({ status: 'answered', structuredResponse: null })],
    );
    expect(
      historicalAnswered.blockingIssues.map((issue) => issue.code),
    ).toContain('ITEM_BINARY_MANUAL_DECISION_INCOMPLETE');

    const decisionOnly = evaluate(
      [versionItem],
      [
        createItemResponse({
          rawResponse: null,
          structuredResponse: {
            binaryManualDecision: { isCorrect: true },
          },
        }),
      ],
    );
    expect(decisionOnly.blockingIssues.map((issue) => issue.code)).toContain(
      'ITEM_ANSWER_CONTENT_MISSING',
    );
    expect(
      decisionOnly.blockingIssues.map((issue) => issue.code),
    ).not.toContain('ITEM_BINARY_MANUAL_DECISION_INCOMPLETE');

    const missing = evaluate(
      [versionItem],
      [
        createItemResponse({
          isMissing: true,
          missingReason: 'Unable to assess',
          rawResponse: null,
          structuredResponse: null,
        }),
      ],
    );
    expect(missing.blockingIssues.map((issue) => issue.code)).not.toContain(
      'ITEM_BINARY_MANUAL_DECISION_INCOMPLETE',
    );
  });

  it('keeps reading observation completeness separate from the scoring decision', () => {
    const versionItem = createReadingVersionItem();

    const complete = evaluate(
      [versionItem],
      [createReadingItemResponse({ rawResponse: false })],
    );
    expect(complete.blockingIssues).toEqual([]);

    const missingText = evaluate(
      [versionItem],
      [createReadingItemResponse({ responseText: ' ' })],
    );
    expect(missingText.blockingIssues.map((issue) => issue.code)).toContain(
      'ITEM_MANUAL_OBSERVATION_INCOMPLETE',
    );

    const missingBoolean = evaluate(
      [versionItem],
      [createReadingItemResponse({ rawResponse: null })],
    );
    expect(missingBoolean.blockingIssues.map((issue) => issue.code)).toContain(
      'ITEM_MANUAL_OBSERVATION_INCOMPLETE',
    );

    const decisionMissing = evaluate(
      [versionItem],
      [createReadingItemResponse({ structuredResponse: null })],
    );
    expect(decisionMissing.blockingIssues.map((issue) => issue.code)).toContain(
      'ITEM_BINARY_MANUAL_DECISION_INCOMPLETE',
    );
    expect(
      decisionMissing.blockingIssues.map((issue) => issue.code),
    ).not.toContain('ITEM_MANUAL_OBSERVATION_INCOMPLETE');

    const bothIncomplete = evaluate(
      [versionItem],
      [
        createReadingItemResponse({
          rawResponse: null,
          structuredResponse: null,
        }),
      ],
    );
    expect(bothIncomplete.blockingIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'ITEM_MANUAL_OBSERVATION_INCOMPLETE',
        'ITEM_BINARY_MANUAL_DECISION_INCOMPLETE',
      ]),
    );

    const missing = evaluate(
      [versionItem],
      [
        createReadingItemResponse({
          isMissing: true,
          missingReason: 'Unable to assess',
          rawResponse: null,
          responseText: undefined,
          structuredResponse: null,
        }),
      ],
    );
    expect(missing.blockingIssues.map((issue) => issue.code)).not.toContain(
      'ITEM_MANUAL_OBSERVATION_INCOMPLETE',
    );
  });

  it('does not apply binary decision readiness to structured or multi-step manual items', () => {
    const structured = createVersionItem({
      scoringRule: {
        mode: 'structured_manual',
        subItems: [{ code: 'field', title: 'Field', maxScore: 1 }],
      },
      scoreRange: { min: 0, max: 1, step: 1 },
    });
    const multiStep = createVersionItem({
      code: 'scale.item.2',
      order: 2,
      responseType: 'multi_step_calculation',
      scoringRule: { mode: 'multi_step_manual' },
      scoreRange: { min: 0, max: 1, step: 1 },
    });
    const result = evaluate(
      [structured, multiStep],
      [
        createItemResponse({
          rawResponse: 'raw',
          structuredResponse: {
            subItems: {
              field: { responseText: 'answer', isCorrect: true },
            },
          },
        }),
        createItemResponse({
          id: '507f1f77bcf86cd799439017',
          itemCode: multiStep.code,
          itemOrder: multiStep.order,
          responseType: multiStep.responseType,
          rawResponse: 'raw',
        }),
      ],
    );

    expect(result.blockingIssues.map((issue) => issue.code)).not.toContain(
      'ITEM_BINARY_MANUAL_DECISION_INCOMPLETE',
    );
  });

  it('checks timing duration, order and incomplete points', () => {
    const versionItem = createVersionItem({
      requiresTimer: true,
      evidenceTypes: ['duration'],
    });
    const missing = evaluate(
      [versionItem],
      [createItemResponse({ timing: null })],
    );
    expect(missing.blockingIssues.map((issue) => issue.code)).toContain(
      'ITEM_REQUIRED_TIMING_MISSING',
    );

    const invalid = evaluate(
      [versionItem],
      [
        createItemResponse({
          timing: {
            timerState: 'completed',
            startedAt: new Date('2026-07-11T07:10:00.000Z'),
            lastResumedAt: null,
            completedAt: new Date('2026-07-11T07:09:00.000Z'),
            durationMs: 1000,
            timerSource: 'manual',
          },
        }),
      ],
    );
    expect(invalid.blockingIssues.map((issue) => issue.code)).toContain(
      'ITEM_INVALID_TIMING',
    );

    const warning = evaluate(
      [versionItem],
      [
        createItemResponse({
          timing: {
            timerState: 'completed',
            startedAt: new Date('2026-07-11T07:10:00.000Z'),
            lastResumedAt: null,
            completedAt: null,
            durationMs: 1000,
            timerSource: 'manual',
          },
        }),
      ],
    );
    expect(warning.warnings.map((issue) => issue.code)).toContain(
      'ITEM_TIMING_POINTS_INCOMPLETE',
    );
  });

  it('implements photo and handwriting one-of, single-type and inconsistent reference rules', () => {
    const oneOf = createVersionItem({
      responseType: 'drawing',
      evidenceTypes: ['photo', 'handwriting'],
      supportsPhotoUpload: true,
      supportsHandwriting: true,
      qualityControlRule: {
        requireEvidence: ['photo', 'handwriting'],
      },
    });
    const pendingRefs = [
      {
        evidenceType: 'photo' as const,
        mediaEvidenceId: null,
        status: 'pending' as const,
      },
      {
        evidenceType: 'handwriting' as const,
        mediaEvidenceId: null,
        status: 'pending' as const,
      },
    ];
    const missing = evaluate(
      [oneOf],
      [createItemResponse({ evidenceRefs: pendingRefs })],
    );
    expect(missing.blockingIssues.map((issue) => issue.code)).toContain(
      'ITEM_REQUIRED_MEDIA_MISSING',
    );

    const photoAttached = evaluate(
      [oneOf],
      [
        createItemResponse({
          evidenceRefs: [
            {
              evidenceType: 'photo',
              mediaEvidenceId: 'media-photo',
              status: 'attached',
            },
            pendingRefs[1],
          ],
        }),
      ],
    );
    expect(
      photoAttached.blockingIssues.map((issue) => issue.code),
    ).not.toContain('ITEM_REQUIRED_MEDIA_MISSING');

    const handwritingAttached = evaluate(
      [oneOf],
      [
        createItemResponse({
          evidenceRefs: [
            pendingRefs[0],
            {
              evidenceType: 'handwriting',
              mediaEvidenceId: 'media-handwriting',
              status: 'attached',
            },
          ],
        }),
      ],
    );
    expect(
      handwritingAttached.blockingIssues.map((issue) => issue.code),
    ).not.toContain('ITEM_REQUIRED_MEDIA_MISSING');

    const afterUniqueEvidenceVoid = evaluate(
      [oneOf],
      [createItemResponse({ evidenceRefs: pendingRefs })],
    );
    expect(
      afterUniqueEvidenceVoid.blockingIssues.map((issue) => issue.code),
    ).toContain('ITEM_REQUIRED_MEDIA_MISSING');

    const photoOnly = createVersionItem({
      evidenceTypes: ['photo'],
      qualityControlRule: { requireEvidence: ['photo'] },
    });
    expect(
      evaluate(
        [photoOnly],
        [createItemResponse({ evidenceRefs: pendingRefs.slice(1) })],
      ).blockingIssues.map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        'ITEM_EVIDENCE_REQUIREMENT_CONFIGURATION_MISMATCH',
        'ITEM_REQUIRED_MEDIA_MISSING',
      ]),
    );

    const inconsistent = evaluate(
      [oneOf],
      [
        createItemResponse({
          evidenceRefs: [
            {
              evidenceType: 'photo',
              mediaEvidenceId: null,
              status: 'attached',
            },
            pendingRefs[1],
          ],
        }),
      ],
    );
    expect(inconsistent.blockingIssues.map((issue) => issue.code)).toContain(
      'ITEM_EVIDENCE_REFERENCE_INCONSISTENT',
    );
  });

  it('checks operator notes, derives timing and returns stable state and issue ordering', () => {
    const result = evaluate(
      [createVersionItem({ requiresOperatorNote: true })],
      [
        createItemResponse({
          itemOrder: 2,
          operatorNote: ' ',
          timing: {
            timerState: 'completed',
            startedAt: new Date('2026-07-11T06:30:00.000Z'),
            lastResumedAt: null,
            completedAt: null,
            durationMs: null,
            timerSource: 'manual',
          },
        }),
      ],
      createScaleInstance({ startedAt: null }),
    );
    expect(result.earliestValidItemTimingStart).toEqual(
      new Date('2026-07-11T06:30:00.000Z'),
    );
    expect(result.blockingIssues.map((issue) => issue.code)).toContain(
      'ITEM_REQUIRED_OPERATOR_NOTE_MISSING',
    );
    expect(result.canSubmitNow).toBe(false);
    expect(result.submissionState).toBe('incomplete');

    expect(
      sortSubmissionIssues([
        {
          code: 'ITEM_NOT_COMPLETED',
          severity: 'blocking',
          scope: 'item',
          itemOrder: 2,
          message: 'safe',
        },
        {
          code: 'SCALE_INSTANCE_ITEM_SET_MISMATCH',
          severity: 'blocking',
          scope: 'scale_instance',
          message: 'safe',
        },
        {
          code: 'ITEM_ANSWER_CONTENT_MISSING',
          severity: 'blocking',
          scope: 'item',
          itemOrder: 2,
          message: 'safe',
        },
      ]).map((issue) => issue.code),
    ).toEqual([
      'SCALE_INSTANCE_ITEM_SET_MISMATCH',
      'ITEM_ANSWER_CONTENT_MISSING',
      'ITEM_NOT_COMPLETED',
    ]);
  });

  it('does not block a current MMSE item solely because operatorNote is absent', () => {
    const mmseItem = MMSE_SCALE_VERSION_SEED.items.find(
      (item) => item.code === 'mmse.orientation.time',
    );
    if (!mmseItem) {
      throw new Error('Expected current MMSE orientation item');
    }
    const result = evaluate(
      [mmseItem],
      [
        createItemResponse({
          itemCode: mmseItem.code,
          itemTitle: mmseItem.title,
          itemOrder: mmseItem.order,
          responseType: mmseItem.responseType,
          rawResponse: '2026-08-10',
          operatorNote: undefined,
        }),
      ],
    );

    expect(result.blockingIssues.map((issue) => issue.code)).not.toContain(
      'ITEM_REQUIRED_OPERATOR_NOTE_MISSING',
    );
  });

  it('blocks a future instance start and reports unavailable duration only as warning', () => {
    const invalid = evaluate(
      [createVersionItem()],
      [createItemResponse()],
      createScaleInstance({
        startedAt: new Date('2026-07-11T09:00:00.000Z'),
      }),
    );
    expect(invalid.blockingIssues[0].code).toBe(
      'SCALE_INSTANCE_START_TIME_INVALID',
    );

    const unavailable = evaluate(
      [createVersionItem()],
      [createItemResponse()],
      createScaleInstance({ startedAt: null }),
    );
    expect(unavailable.ready).toBe(true);
    expect(unavailable.warnings.map((issue) => issue.code)).toContain(
      'SCALE_INSTANCE_DURATION_UNAVAILABLE',
    );
  });
});
