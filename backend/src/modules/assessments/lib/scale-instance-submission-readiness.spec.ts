import type { ScaleItemConfigSummary } from '../../scales/services/scales.service';
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

function evaluate(
  versionItems: ScaleItemConfigSummary[],
  itemResponses: ItemResponseSummary[],
  scaleInstance = createScaleInstance(),
) {
  return evaluateScaleInstanceSubmissionReadiness({
    patientStatus: 'active',
    visitStatus: 'draft',
    scaleInstance,
    versionItems,
    itemResponses,
    checkedAt: CHECKED_AT,
  });
}

describe('scale instance submission readiness', () => {
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
            startedAt: new Date('2026-07-11T07:10:00.000Z'),
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
            startedAt: new Date('2026-07-11T07:10:00.000Z'),
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
    const refs = [
      {
        evidenceType: 'photo' as const,
        mediaEvidenceId: 'media-1',
        status: 'attached' as const,
      },
      {
        evidenceType: 'handwriting' as const,
        mediaEvidenceId: null,
        status: 'pending' as const,
      },
    ];
    expect(
      evaluate([oneOf], [createItemResponse({ evidenceRefs: refs })]).ready,
    ).toBe(true);

    const photoOnly = createVersionItem({
      evidenceTypes: ['photo'],
      qualityControlRule: { requireEvidence: ['photo'] },
    });
    expect(
      evaluate(
        [photoOnly],
        [createItemResponse({ evidenceRefs: refs.slice(1) })],
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
            refs[1],
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
            startedAt: new Date('2026-07-11T06:30:00.000Z'),
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
