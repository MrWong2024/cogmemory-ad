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

function createStructuredManualItem(
  overrides: Partial<ItemResponseSummary> = {},
): ItemResponseSummary {
  return createItemResponseSummary({
    itemCode: 'test.structured',
    itemTitle: 'Structured item',
    responseType: 'multi_choice',
    itemConfigSnapshot: {
      scoreRange: { min: 0, max: 2, step: 1 },
      scoringRule: {
        mode: 'structured_manual',
        subItems: [
          { code: 'year', title: 'Year', maxScore: 1 },
          { code: 'month', title: 'Month', maxScore: 1 },
        ],
      },
    },
    stepResults: [],
    promptResponses: [],
    ...overrides,
  });
}

function createBinaryManualItem(
  overrides: Partial<ItemResponseSummary> = {},
): ItemResponseSummary {
  return createItemResponseSummary({
    itemCode: 'test.binary.manual',
    itemTitle: 'Binary manual item',
    responseType: 'text',
    itemConfigSnapshot: {
      scoreRange: { min: 0, max: 1, step: 1 },
      scoringRule: { mode: 'manual_exact_match' },
    },
    stepResults: [],
    promptResponses: [],
    ...overrides,
  });
}

function createReadingObservationItem(
  overrides: Partial<ItemResponseSummary> = {},
): ItemResponseSummary {
  return createItemResponseSummary({
    itemCode: 'mmse.language.reading_command',
    itemTitle: '阅读并执行',
    responseType: 'boolean',
    itemConfigSnapshot: {
      responseType: 'boolean',
      scoreRange: { min: 0, max: 1, step: 1 },
      scoringRule: { mode: 'manual_observation' },
    },
    versionTrace: { scaleVersion: '1.0' },
    stepResults: [],
    promptResponses: [],
    ...overrides,
  });
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
    hasCompletedPatientAdministrationSessionForScaleInstance: jest.Mock;
    findItemResponseByOwnership: jest.Mock;
    countItemResponseProgress: jest.Mock;
    toItemResponseSummary: jest.Mock;
    ensureVisitAndScaleStarted: jest.Mock;
  };
  let currentItemResponse: ItemResponseSummary;

  beforeEach(async () => {
    itemResponseModel = { findOneAndUpdate: jest.fn() };
    patientsService = { findPatientById: jest.fn() };
    assessmentsService = {
      findVisitByPatientAndId: jest.fn(),
      findScaleInstanceByPatientVisitAndId: jest.fn(),
      hasCompletedPatientAdministrationSessionForScaleInstance: jest
        .fn()
        .mockResolvedValue(true),
      findItemResponseByOwnership: jest.fn(),
      countItemResponseProgress: jest.fn(),
      toItemResponseSummary: jest.fn(),
      ensureVisitAndScaleStarted: jest.fn().mockResolvedValue(undefined),
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
      administrationMode: 'clinician_administered',
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

  it('fails closed when the parent or item has a submission barrier', async () => {
    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValueOnce(
      {
        id: SCALE_INSTANCE_ID,
        status: 'draft',
        submissionWriteBarrier: { malformed: true },
      },
    );
    await expectHttpExceptionCode(
      save({ responseText: 'blocked by parent' }),
      409,
      'SCALE_INSTANCE_NOT_EDITABLE',
    );

    currentItemResponse = createItemResponseSummary({
      submissionWriteBarrier: {
        version: 1,
        barrierId: '15443e65-6098-4ca4-b4a2-e16c1e066279',
        startedAt: new Date(),
      },
    });
    await expectHttpExceptionCode(
      save({ responseText: 'blocked by item' }),
      409,
      'SCALE_INSTANCE_NOT_EDITABLE',
    );
    expect(itemResponseModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

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

  it.each([
    'no session',
    'prepared',
    'active',
    'paused',
    'terminated',
    'expired',
  ])(
    'blocks supervised formal review while patient administration is %s',
    async () => {
      assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValueOnce(
        {
          id: SCALE_INSTANCE_ID,
          status: 'draft',
          administrationMode: 'supervised_patient_input',
        },
      );
      assessmentsService.hasCompletedPatientAdministrationSessionForScaleInstance.mockResolvedValueOnce(
        false,
      );

      await expectHttpExceptionCode(
        save({ responseText: 'must remain blocked' }),
        409,
        'PATIENT_ADMINISTRATION_NOT_COMPLETED',
      );
      expect(
        assessmentsService.hasCompletedPatientAdministrationSessionForScaleInstance,
      ).toHaveBeenCalledWith(SCALE_INSTANCE_ID);
      expect(
        assessmentsService.findItemResponseByOwnership,
      ).not.toHaveBeenCalled();
      expect(itemResponseModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(
        assessmentsService.ensureVisitAndScaleStarted,
      ).not.toHaveBeenCalled();
    },
  );

  it('allows supervised formal review after completed patient administration', async () => {
    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValueOnce(
      {
        id: SCALE_INSTANCE_ID,
        status: 'draft',
        administrationMode: 'supervised_patient_input',
      },
    );

    await expect(
      save({ responseText: 'formal review' }),
    ).resolves.toBeDefined();
    expect(
      assessmentsService.hasCompletedPatientAdministrationSessionForScaleInstance,
    ).toHaveBeenCalledWith(SCALE_INSTANCE_ID);
    expect(itemResponseModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(assessmentsService.ensureVisitAndScaleStarted).toHaveBeenCalledTimes(
      1,
    );
  });

  it('does not query patient administration for clinician-administered drafts', async () => {
    await expect(
      save({ responseText: 'clinician review' }),
    ).resolves.toBeDefined();
    expect(
      assessmentsService.hasCompletedPatientAdministrationSessionForScaleInstance,
    ).not.toHaveBeenCalled();
    expect(itemResponseModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

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
        $and: [
          {
            $or: [
              { submissionWriteBarrier: null },
              { submissionWriteBarrier: { $exists: false } },
            ],
          },
          {
            $or: [{ draftRevision: 0 }, { draftRevision: { $exists: false } }],
          },
        ],
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
    expect(assessmentsService.ensureVisitAndScaleStarted).toHaveBeenCalledWith({
      patientId: PATIENT_ID,
      assessmentVisitId: VISIT_ID,
      scaleInstanceId: SCALE_INSTANCE_ID,
      startedAt: update.$set.draftSavedAt,
    });
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
        $and: [
          {
            $or: [
              { submissionWriteBarrier: null },
              { submissionWriteBarrier: { $exists: false } },
            ],
          },
          {
            $or: [{ draftRevision: 0 }, { draftRevision: { $exists: false } }],
          },
        ],
      }),
    );
    expect(secondFilter).toEqual(
      expect.objectContaining({
        draftRevision: 1,
        $and: [
          {
            $or: [
              { submissionWriteBarrier: null },
              { submissionWriteBarrier: { $exists: false } },
            ],
          },
        ],
      }),
    );
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
    expect(
      assessmentsService.ensureVisitAndScaleStarted,
    ).toHaveBeenNthCalledWith(1, {
      patientId: PATIENT_ID,
      assessmentVisitId: VISIT_ID,
      scaleInstanceId: SCALE_INSTANCE_ID,
      startedAt: firstServerTime,
    });
    expect(
      assessmentsService.ensureVisitAndScaleStarted,
    ).toHaveBeenNthCalledWith(2, {
      patientId: PATIENT_ID,
      assessmentVisitId: VISIT_ID,
      scaleInstanceId: SCALE_INSTANCE_ID,
      startedAt: secondServerTime,
    });
  });

  it('treats a missing legacy revision as zero and upgrades it atomically', async () => {
    currentItemResponse = createItemResponseSummary({
      draftRevision: undefined,
      draftSavedAt: undefined,
    });

    await save({ expectedRevision: 0, responseText: 'legacy answer' });

    expect(readMockCallArgument(itemResponseModel.findOneAndUpdate, 0)).toEqual(
      expect.objectContaining({
        $and: [
          {
            $or: [
              { submissionWriteBarrier: null },
              { submissionWriteBarrier: { $exists: false } },
            ],
          },
          {
            $or: [{ draftRevision: 0 }, { draftRevision: { $exists: false } }],
          },
        ],
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
    expect(
      assessmentsService.ensureVisitAndScaleStarted,
    ).not.toHaveBeenCalled();
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

  it('classifies a parent or item barrier that wins the CAS race as not editable', async () => {
    const initial = createItemResponseSummary({ draftRevision: 1 });
    currentItemResponse = initial;
    itemResponseModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    assessmentsService.findScaleInstanceByPatientVisitAndId
      .mockResolvedValueOnce({ id: SCALE_INSTANCE_ID, status: 'draft' })
      .mockResolvedValueOnce({
        id: SCALE_INSTANCE_ID,
        status: 'draft',
        submissionWriteBarrier: { malformed: true },
      });

    await expectHttpExceptionCode(
      save({ responseText: 'lost to parent barrier' }),
      409,
      'SCALE_INSTANCE_NOT_EDITABLE',
    );

    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValue({
      id: SCALE_INSTANCE_ID,
      status: 'draft',
    });
    assessmentsService.findItemResponseByOwnership
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(
        createItemResponseSummary({
          draftRevision: 1,
          submissionWriteBarrier: { malformed: true },
        }),
      );
    itemResponseModel.findOneAndUpdate.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expectHttpExceptionCode(
      save({ responseText: 'lost to item barrier' }),
      409,
      'SCALE_INSTANCE_NOT_EDITABLE',
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
    expect(assessmentsService.ensureVisitAndScaleStarted).toHaveBeenCalledTimes(
      1,
    );
  });

  it('saves partial structured manual drafts without marking them answered', async () => {
    currentItemResponse = createStructuredManualItem();
    const structuredResponse = {
      subItems: {
        year: { responseText: '2026', isCorrect: null },
      },
    };

    await save({ structuredResponse });

    expect(readUpdateSet(itemResponseModel.findOneAndUpdate)).toEqual(
      expect.objectContaining({
        structuredResponse,
        status: 'in_progress',
      }),
    );
  });

  it.each([
    [
      'unknown field code',
      { subItems: { unknown: { responseText: 'x', isCorrect: true } } },
    ],
    [
      'forged max score',
      {
        subItems: {
          year: { responseText: 'x', isCorrect: true, maxScore: 99 },
        },
      },
    ],
    [
      'forged score value',
      {
        subItems: {
          year: { responseText: 'x', isCorrect: true, scoreValue: 1 },
        },
      },
    ],
    [
      'forged reference answer',
      {
        subItems: {
          year: {
            responseText: 'x',
            isCorrect: true,
            referenceAnswer: 'x',
          },
        },
      },
    ],
    [
      'invalid correctness string',
      { subItems: { year: { responseText: 'x', isCorrect: 'true' } } },
    ],
    [
      'invalid correctness number',
      { subItems: { year: { responseText: 'x', isCorrect: 1 } } },
    ],
  ])('rejects structured manual payload with %s', async (_label, payload) => {
    currentItemResponse = createStructuredManualItem();
    await expectHttpExceptionCode(
      save({ structuredResponse: payload }),
      400,
      'ITEM_RESPONSE_PAYLOAD_INVALID',
    );
    expect(itemResponseModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a missing field',
      {
        subItems: { year: { responseText: '2026', isCorrect: true } },
      },
    ],
    [
      'an empty response',
      {
        subItems: {
          year: { responseText: ' ', isCorrect: true },
          month: { responseText: 'August', isCorrect: true },
        },
      },
    ],
    [
      'a null confirmation',
      {
        subItems: {
          year: { responseText: '2026', isCorrect: null },
          month: { responseText: 'August', isCorrect: true },
        },
      },
    ],
    [
      'a missing confirmation',
      {
        subItems: {
          year: { responseText: '2026' },
          month: { responseText: 'August', isCorrect: true },
        },
      },
    ],
  ])(
    'cannot mark structured manual answered with %s',
    async (_label, value) => {
      currentItemResponse = createStructuredManualItem({
        status: 'in_progress',
        structuredResponse: value,
        responseText: 'legacy free text must not bypass the gate',
      });
      await expectHttpExceptionCode(
        save({ markAsAnswered: true }),
        409,
        'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
      );
    },
  );

  it('marks a complete structured manual response answered', async () => {
    currentItemResponse = createStructuredManualItem({
      status: 'in_progress',
      structuredResponse: {
        subItems: {
          year: { responseText: '2026', isCorrect: true },
          month: { responseText: 'July', isCorrect: false },
        },
      },
    });

    await save({ markAsAnswered: true });
    expect(readUpdateSet(itemResponseModel.findOneAndUpdate).status).toBe(
      'answered',
    );
  });

  it('allows a structured manual item to be completed as missing', async () => {
    currentItemResponse = createStructuredManualItem();

    await save({
      isMissing: true,
      missingReason: 'Unable to assess',
      markAsAnswered: true,
    });

    expect(readUpdateSet(itemResponseModel.findOneAndUpdate)).toEqual(
      expect.objectContaining({
        status: 'answered',
        isMissing: true,
        structuredResponse: null,
      }),
    );
  });

  it('marks a binary manual text response answered with a complete decision', async () => {
    currentItemResponse = createBinaryManualItem();

    await save({
      responseText: 'patient repetition',
      structuredResponse: {
        binaryManualDecision: { isCorrect: true },
      },
      markAsAnswered: true,
    });

    expect(readUpdateSet(itemResponseModel.findOneAndUpdate).status).toBe(
      'answered',
    );
  });

  it('does not let a binary decision replace the original answer', async () => {
    currentItemResponse = createBinaryManualItem();

    await expectHttpExceptionCode(
      save({
        structuredResponse: {
          binaryManualDecision: { isCorrect: true },
        },
        markAsAnswered: true,
      }),
      409,
      'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
    );
  });

  it('accepts false as a recorded boolean fact independently from a false decision', async () => {
    currentItemResponse = createBinaryManualItem({
      responseType: 'boolean',
      itemConfigSnapshot: {
        scoreRange: { min: 0, max: 1, step: 1 },
        scoringRule: { mode: 'manual_observation' },
      },
    });

    await save({
      rawResponse: false,
      structuredResponse: {
        binaryManualDecision: { isCorrect: false },
      },
      markAsAnswered: true,
    });

    expect(readUpdateSet(itemResponseModel.findOneAndUpdate)).toEqual(
      expect.objectContaining({ rawResponse: false, status: 'answered' }),
    );
  });

  it('saves either reading observation fact as a partial draft', async () => {
    currentItemResponse = createReadingObservationItem();
    await save({ responseText: '请闭上您的眼睛' });
    expect(readUpdateSet(itemResponseModel.findOneAndUpdate)).toEqual(
      expect.objectContaining({
        responseText: '请闭上您的眼睛',
        status: 'in_progress',
      }),
    );

    itemResponseModel.findOneAndUpdate.mockClear();
    currentItemResponse = createReadingObservationItem();
    await save({ rawResponse: true });
    expect(readUpdateSet(itemResponseModel.findOneAndUpdate)).toEqual(
      expect.objectContaining({ rawResponse: true, status: 'in_progress' }),
    );

    itemResponseModel.findOneAndUpdate.mockClear();
    currentItemResponse = createReadingObservationItem();
    await save({ rawResponse: false });
    expect(readUpdateSet(itemResponseModel.findOneAndUpdate)).toEqual(
      expect.objectContaining({ rawResponse: false, status: 'in_progress' }),
    );
  });

  it.each(['yes', 1, [], { observed: true }])(
    'rejects non-boolean reading observation rawResponse %p',
    async (rawResponse) => {
      currentItemResponse = createReadingObservationItem();
      await expectHttpExceptionCode(
        save({ rawResponse }),
        400,
        'ITEM_RESPONSE_PAYLOAD_INVALID',
      );
      expect(itemResponseModel.findOneAndUpdate).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'marks a complete reading observation answered when rawResponse is %s',
    async (rawResponse) => {
      currentItemResponse = createReadingObservationItem();

      await save({
        responseText: '请闭上您的眼睛',
        rawResponse,
        structuredResponse: {
          binaryManualDecision: { isCorrect: rawResponse },
        },
        markAsAnswered: true,
      });

      expect(readUpdateSet(itemResponseModel.findOneAndUpdate)).toEqual(
        expect.objectContaining({
          responseText: '请闭上您的眼睛',
          rawResponse,
          status: 'answered',
        }),
      );
    },
  );

  it.each([
    [
      'response text',
      {
        rawResponse: false,
        structuredResponse: {
          binaryManualDecision: { isCorrect: false },
        },
      },
    ],
    [
      'boolean observation',
      {
        responseText: '未能读出',
        rawResponse: null,
        structuredResponse: {
          binaryManualDecision: { isCorrect: false },
        },
      },
    ],
    [
      'scoring decision',
      {
        responseText: '请闭上您的眼睛',
        rawResponse: true,
      },
    ],
  ])(
    'cannot mark a reading observation answered without %s',
    async (_label, input) => {
      currentItemResponse = createReadingObservationItem();
      await expectHttpExceptionCode(
        save({ ...input, markAsAnswered: true }),
        409,
        'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
      );
    },
  );

  it('allows the reading observation item to be completed as missing', async () => {
    currentItemResponse = createReadingObservationItem();

    await save({
      isMissing: true,
      missingReason: 'Unable to assess',
      markAsAnswered: true,
    });

    expect(readUpdateSet(itemResponseModel.findOneAndUpdate)).toEqual(
      expect.objectContaining({
        status: 'answered',
        isMissing: true,
        rawResponse: null,
        structuredResponse: null,
      }),
    );
  });

  it('requires a boolean original fact even when the decision is complete', async () => {
    currentItemResponse = createBinaryManualItem({
      responseType: 'boolean',
      itemConfigSnapshot: {
        scoreRange: { min: 0, max: 1, step: 1 },
        scoringRule: { mode: 'manual_observation' },
      },
    });

    await expectHttpExceptionCode(
      save({
        structuredResponse: {
          binaryManualDecision: { isCorrect: false },
        },
        markAsAnswered: true,
      }),
      409,
      'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
    );
  });

  it('keeps writing and drawing answer content separate from the decision', async () => {
    currentItemResponse = createBinaryManualItem({
      responseType: 'drawing',
      itemConfigSnapshot: {
        scoreRange: { min: 0, max: 1, step: 1 },
        scoringRule: { mode: 'manual_drawing_review' },
      },
    });

    await expectHttpExceptionCode(
      save({
        structuredResponse: {
          binaryManualDecision: { isCorrect: true },
        },
        markAsAnswered: true,
      }),
      409,
      'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
    );

    await save({
      responseText: 'drawing evidence reviewed',
      structuredResponse: {
        binaryManualDecision: { isCorrect: true },
      },
      markAsAnswered: true,
    });
    expect(readUpdateSet(itemResponseModel.findOneAndUpdate).status).toBe(
      'answered',
    );
  });

  it('allows partial binary drafts but requires a complete decision to finish', async () => {
    currentItemResponse = createBinaryManualItem({
      responseText: 'existing raw answer',
    });

    await save({
      structuredResponse: {
        binaryManualDecision: { isCorrect: null },
      },
    });
    expect(
      readUpdateSet(itemResponseModel.findOneAndUpdate).structuredResponse,
    ).toEqual({ binaryManualDecision: { isCorrect: null } });

    currentItemResponse = createBinaryManualItem({
      responseText: 'existing raw answer',
      structuredResponse: {
        binaryManualDecision: { isCorrect: null },
      },
    });
    await expectHttpExceptionCode(
      save({ markAsAnswered: true }),
      409,
      'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
    );
  });

  it('allows a binary manual item to be completed as missing', async () => {
    currentItemResponse = createBinaryManualItem();

    await save({
      isMissing: true,
      missingReason: 'Unable to assess',
      markAsAnswered: true,
    });

    expect(readUpdateSet(itemResponseModel.findOneAndUpdate)).toEqual(
      expect.objectContaining({
        status: 'answered',
        isMissing: true,
        structuredResponse: null,
      }),
    );
  });

  it.each([
    { binaryManualDecision: { isCorrect: true }, scoreValue: 1 },
    { binaryManualDecision: { isCorrect: true, maxScore: 1 } },
    { binaryManualDecision: { isCorrect: true, note: 'forged' } },
  ])('rejects forged binary manual payloads', async (structuredResponse) => {
    currentItemResponse = createBinaryManualItem();

    await expectHttpExceptionCode(
      save({ structuredResponse }),
      400,
      'ITEM_RESPONSE_PAYLOAD_INVALID',
    );
    expect(itemResponseModel.findOneAndUpdate).not.toHaveBeenCalled();
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
