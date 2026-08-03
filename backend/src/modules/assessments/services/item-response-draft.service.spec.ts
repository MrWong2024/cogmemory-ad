import { HttpException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { PatientsService } from '../../patients/services/patients.service';
import type { UpdateItemResponseDraftDto } from '../dto/update-item-response-draft.dto';
import { ItemResponse } from '../schemas/item-response.schema';
import {
  AssessmentsService,
  type ItemResponseSummary,
} from './assessments.service';
import { ItemResponseDraftService } from './item-response-draft.service';

const PATIENT_ID = '507f1f77bcf86cd799439011';
const VISIT_ID = '507f1f77bcf86cd799439012';
const SCALE_INSTANCE_ID = '507f1f77bcf86cd799439013';
const ITEM_RESPONSE_ID = '507f1f77bcf86cd799439014';

function createItemResponseSummary(
  overrides: Partial<ItemResponseSummary> = {},
): ItemResponseSummary {
  return {
    id: ITEM_RESPONSE_ID,
    assessmentVisitId: VISIT_ID,
    scaleInstanceId: SCALE_INSTANCE_ID,
    patientId: PATIENT_ID,
    subjectCode: 'SUBJ-A14-UNIT',
    scaleDefinitionId: '507f1f77bcf86cd799439015',
    scaleVersionId: '507f1f77bcf86cd799439016',
    scaleCode: 'mmse',
    scaleVersion: '1.0',
    instanceCode: 'INST-A14-UNIT',
    itemCode: 'mmse.attention.serial_sevens',
    crfCode: 'MMSE.3',
    groupCode: 'attention_calculation',
    itemTitle: 'Serial sevens',
    itemOrder: 4,
    responseType: 'multi_step_calculation',
    countsTowardTotal: true,
    cognitiveDomainCodes: ['attention_calculation'],
    itemConfigSnapshot: {
      prompt: 'Safe prompt',
      scoreRange: { min: 0, max: 5, step: 1 },
      evidenceTypes: ['raw_text'],
      requiresTimer: false,
    },
    versionTrace: { scaleVersion: '1.0' },
    status: 'not_started',
    answerSource: 'clinician_recorded',
    draftRevision: 0,
    draftSavedAt: null,
    rawResponse: null,
    structuredResponse: null,
    isMissing: false,
    score: {
      scoreValue: null,
      maxScore: 5,
      minScore: 0,
      scoreStatus: 'not_scored',
      scoreSource: 'none',
      scoredAt: null,
      scoredBy: null,
    },
    stepResults: [
      {
        stepCode: 'mmse.attention.serial_sevens.step_1',
        crfCode: 'MMSE.3.1',
        label: '100 - 7',
        order: 1,
        expectedValue: 93,
        actualValue: null,
        isCorrect: null,
        scoreValue: null,
        countsTowardItemScore: true,
        note: 'preserved step note',
      },
      {
        stepCode: 'mmse.attention.serial_sevens.step_2',
        crfCode: 'MMSE.3.2',
        label: '93 - 7',
        order: 2,
        expectedValue: 86,
        actualValue: null,
        isCorrect: null,
        scoreValue: null,
        countsTowardItemScore: true,
      },
    ],
    promptResponses: [
      {
        promptType: 'semantic_category',
        promptText: 'Category cue',
        responseAfterPrompt: null,
        isCorrect: null,
        countsTowardScore: false,
        order: 1,
        note: 'preserved prompt note',
      },
    ],
    timing: null,
    evidenceRefs: [],
    qualityControlHints: null,
    metadata: null,
    lockedAt: null,
    voidedAt: null,
    ...overrides,
  };
}

async function expectHttpExceptionCode(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  let caughtError: unknown;

  try {
    await promise;
  } catch (error: unknown) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(HttpException);

  if (!(caughtError instanceof HttpException)) {
    throw caughtError;
  }

  expect(caughtError.getStatus()).toBe(status);
  expect(caughtError.getResponse()).toEqual(expect.objectContaining({ code }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMockCallArgument(
  mock: jest.Mock,
  argumentIndex: number,
  callIndex = 0,
): unknown {
  const calls: unknown = mock.mock.calls;

  if (!Array.isArray(calls)) {
    throw new Error('Expected mock calls');
  }

  const selectedCall: unknown = calls[callIndex];

  if (!Array.isArray(selectedCall)) {
    throw new Error(`Expected mock call ${callIndex + 1}`);
  }

  const argument: unknown = selectedCall[argumentIndex];
  return argument;
}

function readUpdateSet(
  mock: jest.Mock,
  callIndex = 0,
): Record<string, unknown> {
  const update = readMockCallArgument(mock, 1, callIndex);

  if (!isRecord(update) || !isRecord(update.$set)) {
    throw new Error('Expected an atomic $set update');
  }

  return update.$set;
}

describe('ItemResponseDraftService', () => {
  let service: ItemResponseDraftService;
  let itemResponseModel: { findOneAndUpdate: jest.Mock };
  let patientsService: { findPatientById: jest.Mock };
  let assessmentsService: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
    findItemResponseByOwnership: jest.Mock;
    countItemResponseProgress: jest.Mock;
    toItemResponseSummary: jest.Mock;
  };
  let currentItemResponse: ItemResponseSummary;

  beforeEach(async () => {
    itemResponseModel = { findOneAndUpdate: jest.fn() };
    patientsService = { findPatientById: jest.fn() };
    assessmentsService = {
      findVisitByPatientAndId: jest.fn(),
      findScaleInstanceByPatientVisitAndId: jest.fn(),
      findItemResponseByOwnership: jest.fn(),
      countItemResponseProgress: jest.fn(),
      toItemResponseSummary: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ItemResponseDraftService,
        {
          provide: getModelToken(ItemResponse.name),
          useValue: itemResponseModel,
        },
        { provide: PatientsService, useValue: patientsService },
        { provide: AssessmentsService, useValue: assessmentsService },
      ],
    }).compile();
    service = moduleRef.get(ItemResponseDraftService);

    currentItemResponse = createItemResponseSummary();
    patientsService.findPatientById.mockResolvedValue({
      id: PATIENT_ID,
      status: 'active',
    });
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      id: VISIT_ID,
      status: 'draft',
    });
    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValue({
      id: SCALE_INSTANCE_ID,
      status: 'draft',
    });
    assessmentsService.findItemResponseByOwnership.mockImplementation(() =>
      Promise.resolve(currentItemResponse),
    );
    assessmentsService.countItemResponseProgress.mockResolvedValue({
      totalItemCount: 11,
      answeredItemCount: 1,
    });
    assessmentsService.toItemResponseSummary.mockImplementation(
      () => currentItemResponse,
    );
    itemResponseModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: ITEM_RESPONSE_ID }),
    });
  });

  type SaveInput = Omit<UpdateItemResponseDraftDto, 'expectedRevision'> & {
    expectedRevision?: number;
  };

  function save(input: SaveInput) {
    const { expectedRevision, ...draft } = input;
    const currentRevision =
      Number.isSafeInteger(currentItemResponse.draftRevision) &&
      Number(currentItemResponse.draftRevision) >= 0
        ? Number(currentItemResponse.draftRevision)
        : 0;

    return service.saveDraft(
      PATIENT_ID,
      VISIT_ID,
      SCALE_INSTANCE_ID,
      ITEM_RESPONSE_ID,
      {
        expectedRevision: expectedRevision ?? currentRevision,
        ...draft,
      },
    );
  }

  it('rejects an empty PATCH after the complete ownership check', async () => {
    await expectHttpExceptionCode(save({}), 400, 'ITEM_RESPONSE_EMPTY_PATCH');
    await expectHttpExceptionCode(
      save({ markAsAnswered: false }),
      400,
      'ITEM_RESPONSE_EMPTY_PATCH',
    );
    expect(assessmentsService.findItemResponseByOwnership).toHaveBeenCalledWith(
      PATIENT_ID,
      VISIT_ID,
      SCALE_INSTANCE_ID,
      ITEM_RESPONSE_ID,
    );
    expect(itemResponseModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('enforces patient existence and active status', async () => {
    patientsService.findPatientById.mockResolvedValueOnce(null);
    await expectHttpExceptionCode(
      save({ responseText: 'answer' }),
      404,
      'PATIENT_NOT_FOUND',
    );

    patientsService.findPatientById.mockResolvedValueOnce({
      id: PATIENT_ID,
      status: 'inactive',
    });
    await expectHttpExceptionCode(
      save({ responseText: 'answer' }),
      409,
      'PATIENT_NOT_ACTIVE',
    );
    expect(assessmentsService.findVisitByPatientAndId).not.toHaveBeenCalled();
  });

  it.each(['completed', 'locked', 'voided'])(
    'rejects a %s visit',
    async (status) => {
      assessmentsService.findVisitByPatientAndId.mockResolvedValueOnce({
        id: VISIT_ID,
        status,
      });
      await expectHttpExceptionCode(
        save({ responseText: 'answer' }),
        409,
        'VISIT_NOT_EDITABLE',
      );
    },
  );

  it.each(['completed', 'locked', 'voided'])(
    'rejects a %s scale instance',
    async (status) => {
      assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValueOnce(
        { id: SCALE_INSTANCE_ID, status },
      );
      await expectHttpExceptionCode(
        save({ responseText: 'answer' }),
        409,
        'SCALE_INSTANCE_NOT_EDITABLE',
      );
    },
  );

  it.each(['scored', 'locked', 'voided'])(
    'rejects a %s item response',
    async (status) => {
      currentItemResponse = createItemResponseSummary({
        status: status as ItemResponseSummary['status'],
      });
      await expectHttpExceptionCode(
        save({ responseText: 'answer' }),
        409,
        'ITEM_RESPONSE_NOT_EDITABLE',
      );
    },
  );

  it('uses not-found semantics for every mismatched ownership resource', async () => {
    assessmentsService.findVisitByPatientAndId.mockResolvedValueOnce(null);
    await expectHttpExceptionCode(
      save({ responseText: 'answer' }),
      404,
      'VISIT_NOT_FOUND',
    );

    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValueOnce(
      null,
    );
    await expectHttpExceptionCode(
      save({ responseText: 'answer' }),
      404,
      'SCALE_INSTANCE_NOT_FOUND',
    );

    assessmentsService.findItemResponseByOwnership.mockResolvedValueOnce(null);
    await expectHttpExceptionCode(
      save({ responseText: 'answer' }),
      404,
      'ITEM_RESPONSE_NOT_FOUND',
    );
  });

  it('validates and clones JSON and moves not_started to in_progress', async () => {
    const rawResponse = { recalled: ['word'] };

    const result = await save({ rawResponse, responseText: 'answer' });
    const set = readUpdateSet(itemResponseModel.findOneAndUpdate);

    expect(set.rawResponse).toEqual(rawResponse);
    expect(set.rawResponse).not.toBe(rawResponse);
    expect(set.status).toBe('in_progress');
    expect(result.progress).toEqual({
      totalItemCount: 11,
      answeredItemCount: 1,
    });
    expect(itemResponseModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: ITEM_RESPONSE_ID,
        assessmentVisitId: VISIT_ID,
        scaleInstanceId: SCALE_INSTANCE_ID,
        patientId: PATIENT_ID,
        status: { $in: ['not_started', 'in_progress', 'answered'] },
        lockedAt: null,
        $or: [{ draftRevision: 0 }, { draftRevision: { $exists: false } }],
      }),
      expect.objectContaining({
        $inc: { draftRevision: 1 },
      }),
      { returnDocument: 'after', runValidators: true },
    );
    const update = readMockCallArgument(itemResponseModel.findOneAndUpdate, 1);

    if (!isRecord(update) || !isRecord(update.$set)) {
      throw new Error('Expected an atomic draft update');
    }

    expect(update.$set.draftSavedAt).toBeInstanceOf(Date);
  });

  it('saves the same explicit value twice with a new server time and revision each time', async () => {
    const firstServerTime = new Date('2026-08-03T08:00:00.000Z');
    const secondServerTime = new Date('2026-08-03T08:00:01.000Z');
    const clientAttemptedTime = '2036-01-01T00:00:00.000Z';

    jest.useFakeTimers();

    try {
      jest.setSystemTime(firstServerTime);
      const firstClientInput = {
        responseText: 'same explicit answer',
        draftSavedAt: clientAttemptedTime,
      };
      await save(firstClientInput);

      currentItemResponse = createItemResponseSummary({
        status: 'in_progress',
        draftRevision: 1,
        draftSavedAt: firstServerTime,
        responseText: 'same explicit answer',
      });
      jest.setSystemTime(secondServerTime);
      const secondClientInput = {
        expectedRevision: 1,
        responseText: 'same explicit answer',
        draftSavedAt: clientAttemptedTime,
      };
      await save(secondClientInput);
    } finally {
      jest.useRealTimers();
    }

    const firstFilter = readMockCallArgument(
      itemResponseModel.findOneAndUpdate,
      0,
      0,
    );
    const secondFilter = readMockCallArgument(
      itemResponseModel.findOneAndUpdate,
      0,
      1,
    );
    const firstUpdate = readMockCallArgument(
      itemResponseModel.findOneAndUpdate,
      1,
      0,
    );
    const secondUpdate = readMockCallArgument(
      itemResponseModel.findOneAndUpdate,
      1,
      1,
    );

    expect(firstFilter).toEqual(
      expect.objectContaining({
        $or: [{ draftRevision: 0 }, { draftRevision: { $exists: false } }],
      }),
    );
    expect(secondFilter).toEqual(expect.objectContaining({ draftRevision: 1 }));
    expect(readUpdateSet(itemResponseModel.findOneAndUpdate, 0)).toEqual(
      expect.objectContaining({
        responseText: 'same explicit answer',
        draftSavedAt: firstServerTime,
      }),
    );
    expect(readUpdateSet(itemResponseModel.findOneAndUpdate, 1)).toEqual(
      expect.objectContaining({
        responseText: 'same explicit answer',
        draftSavedAt: secondServerTime,
      }),
    );
    expect(isRecord(firstUpdate) ? firstUpdate.$inc : null).toEqual({
      draftRevision: 1,
    });
    expect(isRecord(secondUpdate) ? secondUpdate.$inc : null).toEqual({
      draftRevision: 1,
    });
    expect(firstServerTime.toISOString()).not.toBe(clientAttemptedTime);
    expect(secondServerTime.toISOString()).not.toBe(clientAttemptedTime);
  });

  it('treats a missing legacy revision as zero and upgrades it atomically', async () => {
    currentItemResponse = createItemResponseSummary({
      draftRevision: undefined,
      draftSavedAt: undefined,
    });

    await save({ expectedRevision: 0, responseText: 'legacy answer' });

    expect(readMockCallArgument(itemResponseModel.findOneAndUpdate, 0)).toEqual(
      expect.objectContaining({
        $or: [{ draftRevision: 0 }, { draftRevision: { $exists: false } }],
      }),
    );
    expect(readMockCallArgument(itemResponseModel.findOneAndUpdate, 1)).toEqual(
      expect.objectContaining({ $inc: { draftRevision: 1 } }),
    );
  });

  it('rejects an initially stale revision before attempting the atomic write', async () => {
    currentItemResponse = createItemResponseSummary({ draftRevision: 2 });

    await expectHttpExceptionCode(
      save({ expectedRevision: 1, responseText: 'stale answer' }),
      409,
      'ITEM_RESPONSE_DRAFT_CONFLICT',
    );
    expect(itemResponseModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('classifies a CAS miss with a changed revision as a draft conflict', async () => {
    const initial = createItemResponseSummary({ draftRevision: 3 });
    const competing = createItemResponseSummary({
      draftRevision: 4,
      responseText: 'winning answer',
    });
    currentItemResponse = initial;
    assessmentsService.findItemResponseByOwnership
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(competing);
    itemResponseModel.findOneAndUpdate.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expectHttpExceptionCode(
      save({ expectedRevision: 3, responseText: 'losing answer' }),
      409,
      'ITEM_RESPONSE_DRAFT_CONFLICT',
    );
    expect(itemResponseModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('prefers a lifecycle error when an atomic miss is no longer editable', async () => {
    const initial = createItemResponseSummary({ draftRevision: 1 });
    currentItemResponse = initial;
    assessmentsService.findItemResponseByOwnership
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(
        createItemResponseSummary({ status: 'scored', draftRevision: 1 }),
      );
    itemResponseModel.findOneAndUpdate.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expectHttpExceptionCode(
      save({ responseText: 'answer' }),
      409,
      'ITEM_RESPONSE_NOT_EDITABLE',
    );
  });

  it('maps an unexplained atomic miss to the stable save failure', async () => {
    const initial = createItemResponseSummary({ draftRevision: 1 });
    currentItemResponse = initial;
    assessmentsService.findItemResponseByOwnership.mockResolvedValue(initial);
    itemResponseModel.findOneAndUpdate.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expectHttpExceptionCode(
      save({ responseText: 'answer' }),
      500,
      'ITEM_RESPONSE_SAVE_FAILED',
    );
  });

  it('returns the stable payload error without exposing the submitted value', async () => {
    let caughtError: unknown;

    try {
      await save({ rawResponse: Number.NaN });
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(HttpException);
    if (!(caughtError instanceof HttpException)) {
      throw caughtError;
    }
    expect(caughtError.getResponse()).toEqual({
      code: 'ITEM_RESPONSE_PAYLOAD_INVALID',
      message: 'Item response draft payload is invalid',
    });
  });

  it('requires a meaningful answer before marking answered', async () => {
    await expectHttpExceptionCode(
      save({ operatorNote: 'note only', markAsAnswered: true }),
      409,
      'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
    );

    await save({ rawResponse: false, markAsAnswered: true });
    expect(readUpdateSet(itemResponseModel.findOneAndUpdate).status).toBe(
      'answered',
    );
  });

  it('keeps an answered item answered while editing its draft', async () => {
    currentItemResponse = createItemResponseSummary({
      status: 'answered',
      rawResponse: 'existing answer',
    });

    await save({ responseText: 'revised answer' });
    expect(
      readUpdateSet(itemResponseModel.findOneAndUpdate),
    ).not.toHaveProperty('status');
  });

  it('requires a missing reason and clears answer values while preserving notes', async () => {
    await expectHttpExceptionCode(
      save({ isMissing: true }),
      400,
      'ITEM_RESPONSE_MISSING_REASON_REQUIRED',
    );

    currentItemResponse = createItemResponseSummary({
      rawResponse: 'old',
      structuredResponse: { old: true },
      responseText: 'old',
      stepResults: createItemResponseSummary().stepResults.map((step) => ({
        ...step,
        actualValue: 1,
      })),
      promptResponses: createItemResponseSummary().promptResponses.map(
        (prompt) => ({ ...prompt, responseAfterPrompt: 'old' }),
      ),
    });
    await save({
      responseText: 'must be cleared',
      isMissing: true,
      missingReason: ' unable to assess ',
    });
    const set = readUpdateSet(itemResponseModel.findOneAndUpdate);

    expect(set).toEqual(
      expect.objectContaining({
        isMissing: true,
        missingReason: 'unable to assess',
        rawResponse: null,
        structuredResponse: null,
      }),
    );
    expect(set).not.toHaveProperty('responseText');
    const steps = set.stepResults;
    const prompts = set.promptResponses;
    expect(Array.isArray(steps) && steps[0]).toEqual(
      expect.objectContaining({
        actualValue: null,
        note: 'preserved step note',
      }),
    );
    expect(Array.isArray(prompts) && prompts[0]).toEqual(
      expect.objectContaining({
        responseAfterPrompt: null,
        note: 'preserved prompt note',
      }),
    );
  });

  it('automatically clears an existing missing state when a new answer arrives', async () => {
    currentItemResponse = createItemResponseSummary({
      status: 'in_progress',
      isMissing: true,
      missingReason: 'old reason',
    });

    await save({ structuredResponse: { recalled: true } });
    const update = readMockCallArgument(itemResponseModel.findOneAndUpdate, 1);
    expect(
      isRecord(update) && isRecord(update.$set) && update.$set.isMissing,
    ).toBe(false);
    expect(isRecord(update) && isRecord(update.$unset)).toBe(true);
    if (isRecord(update) && isRecord(update.$unset)) {
      expect(update.$unset.missingReason).toBe(1);
    }
  });

  it('merges only existing step slots and preserves scoring fields and order', async () => {
    await save({
      stepResponses: [
        {
          stepCode: 'mmse.attention.serial_sevens.step_2',
          actualValue: 86,
          note: 'updated',
        },
      ],
    });
    const set = readUpdateSet(itemResponseModel.findOneAndUpdate);
    const steps = set.stepResults;

    expect(steps).toEqual([
      expect.objectContaining({
        stepCode: 'mmse.attention.serial_sevens.step_1',
        expectedValue: 93,
        actualValue: null,
        order: 1,
      }),
      expect.objectContaining({
        stepCode: 'mmse.attention.serial_sevens.step_2',
        expectedValue: 86,
        actualValue: 86,
        isCorrect: null,
        scoreValue: null,
        countsTowardItemScore: true,
        order: 2,
        note: 'updated',
      }),
    ]);

    await expectHttpExceptionCode(
      save({ stepResponses: [{ stepCode: 'unknown', actualValue: 1 }] }),
      400,
      'ITEM_RESPONSE_STEP_NOT_FOUND',
    );
    await expectHttpExceptionCode(
      save({
        stepResponses: [
          { stepCode: 'mmse.attention.serial_sevens.step_1', actualValue: 93 },
          { stepCode: 'mmse.attention.serial_sevens.step_1', actualValue: 92 },
        ],
      }),
      400,
      'ITEM_RESPONSE_DUPLICATE_STEP',
    );
  });

  it('merges prompt slots without changing prompt text or scoring participation', async () => {
    await save({
      promptResponses: [
        {
          promptType: 'semantic_category',
          order: 1,
          responseAfterPrompt: 'recalled',
          note: 'updated',
        },
      ],
    });
    const prompts = readUpdateSet(
      itemResponseModel.findOneAndUpdate,
    ).promptResponses;

    expect(prompts).toEqual([
      expect.objectContaining({
        promptType: 'semantic_category',
        promptText: 'Category cue',
        responseAfterPrompt: 'recalled',
        isCorrect: null,
        countsTowardScore: false,
        order: 1,
        note: 'updated',
      }),
    ]);

    await expectHttpExceptionCode(
      save({
        promptResponses: [
          {
            promptType: 'multiple_choice',
            order: 1,
            responseAfterPrompt: true,
          },
        ],
      }),
      400,
      'ITEM_RESPONSE_PROMPT_NOT_FOUND',
    );
    await expectHttpExceptionCode(
      save({
        promptResponses: [
          {
            promptType: 'semantic_category',
            order: 1,
            responseAfterPrompt: true,
          },
          {
            promptType: 'semantic_category',
            order: 1,
            responseAfterPrompt: false,
          },
        ],
      }),
      400,
      'ITEM_RESPONSE_DUPLICATE_PROMPT',
    );
  });

  it('allows timing only for configured items and validates chronology', async () => {
    await expectHttpExceptionCode(
      save({
        timing: {
          timerState: 'completed',
          startedAt: null,
          lastResumedAt: null,
          completedAt: null,
          durationMs: 1000,
          timerSource: 'manual',
        },
      }),
      400,
      'ITEM_RESPONSE_TIMING_NOT_ALLOWED',
    );

    currentItemResponse = createItemResponseSummary({
      itemConfigSnapshot: {
        evidenceTypes: ['duration'],
        requiresTimer: false,
      },
    });
    await expectHttpExceptionCode(
      save({
        timing: {
          timerState: 'completed',
          startedAt: '2026-07-01T09:00:00.000Z',
          lastResumedAt: null,
          completedAt: '2026-07-01T08:00:00.000Z',
          durationMs: 1000,
          timerSource: 'manual',
        },
      }),
      400,
      'ITEM_RESPONSE_INVALID_TIMING',
    );

    await save({
      timing: {
        timerState: 'completed',
        startedAt: '2026-07-01T08:00:00.000Z',
        lastResumedAt: null,
        completedAt: '2026-07-01T08:00:01.000Z',
        durationMs: 1000,
        timerSource: 'manual',
      },
    });
    expect(readUpdateSet(itemResponseModel.findOneAndUpdate).timing).toEqual({
      timerState: 'completed',
      startedAt: new Date('2026-07-01T08:00:00.000Z'),
      lastResumedAt: null,
      completedAt: new Date('2026-07-01T08:00:01.000Z'),
      durationMs: 1000,
      timerSource: 'manual',
    });
  });

  it('returns a safe save failure when the atomic update fails', async () => {
    itemResponseModel.findOneAndUpdate.mockReturnValueOnce({
      exec: jest.fn().mockRejectedValue(new Error('database internals')),
    });

    await expectHttpExceptionCode(
      save({ responseText: 'answer' }),
      500,
      'ITEM_RESPONSE_SAVE_FAILED',
    );
  });
});
