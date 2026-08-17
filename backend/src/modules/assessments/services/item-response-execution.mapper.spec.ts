import type { ItemResponseSummary } from './assessments.service';
import { toItemResponseExecutionResponse } from './item-response-execution.mapper';

function createItemResponseSummary(): ItemResponseSummary {
  return {
    id: '507f1f77bcf86cd799439014',
    assessmentVisitId: '507f1f77bcf86cd799439012',
    scaleInstanceId: '507f1f77bcf86cd799439013',
    patientId: '507f1f77bcf86cd799439011',
    subjectCode: 'SUBJ-A14-TEST',
    scaleDefinitionId: '507f1f77bcf86cd799439015',
    scaleVersionId: '507f1f77bcf86cd799439016',
    scaleCode: 'mmse',
    scaleVersion: '1.0',
    instanceCode: 'INST-A14-TEST',
    itemCode: 'mmse.attention.serial_sevens',
    crfCode: 'MMSE.3',
    groupCode: 'attention_calculation',
    itemTitle: '连续减 7',
    itemOrder: 4,
    responseType: 'multi_step_calculation',
    countsTowardTotal: true,
    cognitiveDomainCodes: ['attention_calculation'],
    itemConfigSnapshot: {
      prompt: 'Safe prompt',
      instruction: 'Safe instruction',
      scoreRange: { min: 0, max: 5, step: 1, hidden: true },
      evidenceTypes: ['raw_text', 'operator_note', 'invented'],
      requiresTimer: false,
      supportsPhotoUpload: false,
      supportsHandwriting: false,
      requiresOperatorNote: true,
      scoringRule: { expected: [93, 86, 79, 72, 65] },
      qualityControlRule: { hidden: true },
      reportingRule: { hidden: true },
      researchExportField: 'hidden',
      expectedValue: 93,
    },
    versionTrace: {
      scaleVersion: '1.0',
      crfVersion: 'CRF-1.0',
      scoringRuleVersion: 'score-1.0',
      fieldEncodingVersion: 'field-1.0',
      sourceDocument: 'MMSE+MoCA.pdf',
    },
    status: 'in_progress',
    answerSource: 'clinician_recorded',
    draftRevision: 3,
    draftSavedAt: new Date('2026-07-01T08:00:02.000Z'),
    rawResponse: { spoken: [93, 86] },
    structuredResponse: { completedSteps: 2 },
    responseText: '93, 86',
    responseSummary: 'internal summary',
    isMissing: false,
    score: {
      scoreValue: 2,
      maxScore: 5,
      minScore: 0,
      scoreStatus: 'manual_scored',
      scoreSource: 'operator',
      scoredAt: new Date(),
      scoredBy: '507f1f77bcf86cd799439019',
      scoringNote: 'hidden',
    },
    stepResults: [
      {
        stepCode: 'mmse.attention.serial_sevens.step_1',
        crfCode: 'MMSE.3.1',
        label: '100 - 7',
        order: 1,
        expectedValue: 93,
        actualValue: 93,
        isCorrect: true,
        scoreValue: 1,
        countsTowardItemScore: true,
        note: 'draft note',
      },
    ],
    promptResponses: [
      {
        promptType: 'semantic_category',
        promptText: 'Category cue',
        responseAfterPrompt: { recalled: true },
        isCorrect: true,
        countsTowardScore: false,
        order: 1,
        note: 'prompt note',
      },
    ],
    timing: {
      timerState: 'completed',
      startedAt: new Date('2026-07-01T08:00:00.000Z'),
      lastResumedAt: null,
      completedAt: null,
      durationMs: 1000,
      timerSource: 'manual',
    },
    evidenceRefs: [
      {
        evidenceType: 'raw_text',
        mediaEvidenceId: '507f1f77bcf86cd799439020',
        status: 'attached',
        note: 'internal evidence note',
      },
    ],
    operatorNote: 'Safe operator note',
    qualityControlHints: { hidden: true },
    metadata: { hidden: true },
    lockedAt: null,
    voidedAt: null,
  };
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (typeof value === 'object' && value !== null) {
    Object.entries(value).forEach(([key, nestedValue]) => {
      keys.add(key);
      collectKeys(nestedValue, keys);
    });
  }

  return keys;
}

describe('item response execution mapper', () => {
  it('returns only the explicit execution contract and clones draft JSON', () => {
    const source = createItemResponseSummary();
    const response = toItemResponseExecutionResponse(source);
    const keys = collectKeys(response);

    expect(response).toEqual(
      expect.objectContaining({
        id: source.id,
        scaleInstanceId: source.scaleInstanceId,
        itemCode: source.itemCode,
        draftRevision: 3,
        draftSavedAt: new Date('2026-07-01T08:00:02.000Z'),
        config: {
          prompt: 'Safe prompt',
          instruction: 'Safe instruction',
          scoreRange: { min: 0, max: 5, step: 1 },
          evidenceTypes: ['raw_text', 'operator_note'],
          requiresTimer: false,
          supportsPhotoUpload: false,
          supportsHandwriting: false,
          requiresOperatorNote: true,
        },
      }),
    );
    expect(response.rawResponse).toEqual(source.rawResponse);
    expect(response.rawResponse).not.toBe(source.rawResponse);
    expect(response.structuredResponse).not.toBe(source.structuredResponse);
    expect(response.stepResponses[0]).toEqual({
      stepCode: 'mmse.attention.serial_sevens.step_1',
      crfCode: 'MMSE.3.1',
      label: '100 - 7',
      order: 1,
      actualValue: 93,
      countsTowardItemScore: true,
      note: 'draft note',
    });
    expect(response.promptResponses[0]).toEqual({
      promptType: 'semantic_category',
      promptText: 'Category cue',
      responseAfterPrompt: { recalled: true },
      countsTowardScore: false,
      order: 1,
      note: 'prompt note',
    });
    expect(response.evidenceRequirements).toEqual([
      { evidenceType: 'raw_text', status: 'attached', attached: true },
    ]);

    for (const forbiddenKey of [
      'itemConfigSnapshot',
      'scoringRule',
      'qualityControlRule',
      'reportingRule',
      'researchExportField',
      'expectedValue',
      'isCorrect',
      'scoreValue',
      'score',
      'responseSummary',
      'qualityControlHints',
      'metadata',
      'scaleDefinitionId',
      'scaleVersionId',
      'patientId',
      'assessmentVisitId',
      'mediaEvidenceId',
      'lockedAt',
      'voidedAt',
    ]) {
      expect(keys).not.toContain(forbiddenKey);
    }
  });

  it('falls back to score bounds and nulls invalid legacy Mixed drafts', () => {
    const source = createItemResponseSummary();
    source.itemConfigSnapshot = { scoreRange: 'invalid' };
    source.rawResponse = new Date();
    source.structuredResponse = Object.create(null) as Record<string, unknown>;

    const response = toItemResponseExecutionResponse(source);

    expect(response.config.scoreRange).toEqual({ min: 0, max: 5 });
    expect(response.rawResponse).toBeNull();
    expect(response.structuredResponse).toBeNull();
  });

  it('normalizes unsafe legacy draft metadata and timing', () => {
    const source = createItemResponseSummary();
    source.draftRevision = -1;
    source.draftSavedAt = new Date(Number.NaN);
    source.timing = {
      timerState: 'running',
      startedAt: new Date('2026-07-01T08:00:00.000Z'),
      lastResumedAt: null,
      completedAt: null,
      durationMs: 1000,
      timerSource: 'system',
    };

    const response = toItemResponseExecutionResponse(source);

    expect(response.draftRevision).toBe(0);
    expect(response.draftSavedAt).toBeNull();
    expect(response.timing?.timerState).toBe('paused');
    expect(response.timing?.lastResumedAt).toBeNull();
  });

  it('projects only executable structured manual fields from the snapshot', () => {
    const source = createItemResponseSummary();
    source.itemConfigSnapshot = {
      prompt: 'Naming prompt',
      scoreRange: { min: 0, max: 2, step: 1 },
      scoringRule: {
        mode: 'structured_manual',
        sourceDocument: 'private.pdf',
        subItems: [
          { code: 'watch', expected: '手表', maxScore: 1 },
          { code: 'pencil', title: '铅笔', expected: '铅笔', maxScore: 1 },
        ],
      },
      qualityControlRule: { requireStructuredSubItems: true },
    };

    const response = toItemResponseExecutionResponse(source);

    expect(response.config.structuredManualFields).toEqual([
      {
        code: 'watch',
        label: '手表',
        maxScore: 1,
        referenceAnswer: '手表',
      },
      {
        code: 'pencil',
        label: '铅笔',
        maxScore: 1,
        referenceAnswer: '铅笔',
      },
    ]);
    expect(response.config).not.toHaveProperty('scoringRule');
    expect(response.config).not.toHaveProperty('qualityControlRule');
    expect(response.config).not.toHaveProperty('sourceDocument');
  });

  it('omits structured manual fields for non-structured and malformed rules', () => {
    const source = createItemResponseSummary();
    expect(toItemResponseExecutionResponse(source).config).not.toHaveProperty(
      'structuredManualFields',
    );

    source.itemConfigSnapshot = {
      scoringRule: {
        mode: 'structured_manual',
        subItems: [{ code: 'missing-label', maxScore: 1 }],
      },
    };
    expect(toItemResponseExecutionResponse(source).config).not.toHaveProperty(
      'structuredManualFields',
    );
  });
});
