// backend/src/modules/assessments/services/assessments.service.spec.ts
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { PatientsService } from '../../patients/services/patients.service';
import {
  AssessmentVisit,
  AssessmentVisitSchema,
} from '../schemas/assessment-visit.schema';
import {
  ItemEvidenceRefSchema,
  ItemResponse,
  ItemResponseSchema,
  ItemResponseVersionTraceSchema,
  ItemScoreSnapshotSchema,
  ItemStepResultSchema,
  ItemTimingSnapshotSchema,
  PromptResponseRecordSchema,
} from '../schemas/item-response.schema';
import {
  ScaleInstance,
  ScaleInstanceSchema,
} from '../schemas/scale-instance.schema';
import { PatientAdministrationSession } from '../schemas/patient-administration-session.schema';
import { AssessmentsService } from './assessments.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createPaginatedQuery<T>(value: T) {
  const exec = jest.fn().mockResolvedValue(value);
  const limit = jest.fn().mockReturnValue({ exec });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });

  return { sort, skip, limit, exec };
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

function createPatientSummary(
  patientId: Types.ObjectId,
  status: 'active' | 'inactive' | 'archived' = 'active',
) {
  return {
    id: patientId.toString(),
    subjectCode: 'SUBJ-TEST-A12',
    sourceType: 'clinical' as const,
    sex: 'unknown' as const,
    birthDate: null,
    educationYears: null,
    handedness: 'unknown' as const,
    status,
    tags: [],
    externalRefs: null,
    metadata: null,
  };
}

function createVisitDocumentLike(
  patientId: Types.ObjectId,
  visitId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: visitId,
    patientId,
    subjectCode: 'SUBJ-TEST-MAINTENANCE',
    visitCode: 'VISIT-TEST-MAINTENANCE',
    visitType: 'baseline',
    status: 'draft',
    assessmentDate: new Date('2026-08-01T08:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    lockedAt: null,
    voidedAt: null,
    voidedBy: null,
    operatorSnapshot: null,
    clinicalContext: null,
    metadata: null,
    ...overrides,
  };
}

function createScaleInstanceDocumentLike(
  patientId: Types.ObjectId,
  visitId: Types.ObjectId,
  scaleInstanceId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: scaleInstanceId,
    assessmentVisitId: visitId,
    patientId,
    subjectCode: 'SUBJ-TEST-MAINTENANCE',
    scaleDefinitionId: new Types.ObjectId(),
    scaleVersionId: new Types.ObjectId(),
    scaleCode: 'mmse',
    scaleVersion: '1.0',
    instanceCode: 'INST-TEST-MAINTENANCE-MMSE-1',
    instanceNo: 1,
    status: 'draft',
    administrationMode: 'clinician_administered',
    versionTrace: null,
    startedAt: null,
    completedAt: null,
    lockedAt: null,
    voidedAt: null,
    durationMs: null,
    operatorSnapshot: null,
    progress: { totalItemCount: 1, answeredItemCount: 0 },
    qualityControlSummary: null,
    submissionWriteBarrier: null,
    metadata: { initializedFromSeed: true },
    ...overrides,
  };
}

function createPristineItemResponseDocumentLike(
  overrides: Record<string, unknown> = {},
) {
  return {
    status: 'not_started',
    draftRevision: 0,
    draftSavedAt: null,
    rawResponse: null,
    structuredResponse: null,
    isMissing: false,
    score: {
      scoreValue: null,
      maxScore: 1,
      minScore: 0,
      scoreStatus: 'not_scored',
      scoreSource: 'none',
      scoredAt: null,
      scoredBy: null,
    },
    stepResults: [
      {
        stepCode: 'seed-step',
        order: 1,
        expectedValue: 'seed-expected',
        actualValue: null,
        isCorrect: null,
        scoreValue: null,
        countsTowardItemScore: true,
      },
    ],
    promptResponses: [
      {
        promptType: 'semantic_category',
        responseAfterPrompt: null,
        isCorrect: null,
        countsTowardScore: false,
        order: 1,
        note: 'Initialized from seed prompt record.',
      },
    ],
    timing: {
      timerState: 'idle',
      startedAt: null,
      lastResumedAt: null,
      completedAt: null,
      durationMs: null,
      timerSource: 'none',
    },
    evidenceRefs: [
      {
        evidenceType: 'duration',
        mediaEvidenceId: null,
        status: 'pending',
        note: 'Initialized from scale seed.',
      },
    ],
    submissionWriteBarrier: null,
    lockedAt: null,
    voidedAt: null,
    ...overrides,
  };
}

describe('Assessment schemas', () => {
  it('defines AssessmentVisit collection and indexes', () => {
    expect(AssessmentVisitSchema.get('collection')).toBe('assessment_visits');
    expect(AssessmentVisitSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ visitCode: 1 }, expect.objectContaining({ unique: true })],
        [{ patientId: 1, assessmentDate: -1 }, expect.any(Object)],
        [{ subjectCode: 1, assessmentDate: -1 }, expect.any(Object)],
        [{ status: 1, assessmentDate: -1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines AssessmentVisit explicit ObjectId, primitive, Date and Mixed field types', () => {
    expect(AssessmentVisitSchema.path('patientId')?.instance).toBe('ObjectId');
    expect(AssessmentVisitSchema.path('visitType')?.instance).toBe('String');
    expect(AssessmentVisitSchema.path('status')?.instance).toBe('String');
    expect(AssessmentVisitSchema.path('assessmentDate')?.instance).toBe('Date');
    expect(AssessmentVisitSchema.path('startedAt')?.instance).toBe('Date');
    expect(AssessmentVisitSchema.path('completedAt')?.instance).toBe('Date');
    expect(AssessmentVisitSchema.path('lockedAt')?.instance).toBe('Date');
    expect(AssessmentVisitSchema.path('voidedAt')?.instance).toBe('Date');
    expect(AssessmentVisitSchema.path('voidedBy.operatorId')?.instance).toBe(
      'ObjectId',
    );
    expect(AssessmentVisitSchema.path('voidReason')?.instance).toBe('String');
    expect(
      AssessmentVisitSchema.path('operatorSnapshot.operatorId')?.instance,
    ).toBe('ObjectId');
    expect(
      AssessmentVisitSchema.path('operatorSnapshot.operatorRole')?.instance,
    ).toBe('String');
    expect(AssessmentVisitSchema.path('clinicalContext')?.instance).toBe(
      'Mixed',
    );
    expect(AssessmentVisitSchema.path('metadata')?.instance).toBe('Mixed');
  });

  it('defines ScaleInstance collection and indexes', () => {
    expect(ScaleInstanceSchema.get('collection')).toBe('scale_instances');
    expect(ScaleInstanceSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ instanceCode: 1 }, expect.objectContaining({ unique: true })],
        [
          { assessmentVisitId: 1, scaleCode: 1, instanceNo: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [{ patientId: 1, scaleCode: 1, startedAt: -1 }, expect.any(Object)],
        [{ status: 1, updatedAt: -1 }, expect.any(Object)],
        [{ scaleCode: 1, scaleVersion: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines ScaleInstance explicit ObjectId, primitive, Date, Number and Mixed field types', () => {
    expect(ScaleInstanceSchema.path('assessmentVisitId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScaleInstanceSchema.path('patientId')?.instance).toBe('ObjectId');
    expect(ScaleInstanceSchema.path('scaleDefinitionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScaleInstanceSchema.path('scaleVersionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScaleInstanceSchema.path('scaleCode')?.instance).toBe('String');
    expect(ScaleInstanceSchema.path('status')?.instance).toBe('String');
    expect(ScaleInstanceSchema.path('administrationMode')?.instance).toBe(
      'String',
    );
    expect(ScaleInstanceSchema.path('versionTrace.crfVersion')?.instance).toBe(
      'String',
    );
    expect(ScaleInstanceSchema.path('startedAt')?.instance).toBe('Date');
    expect(ScaleInstanceSchema.path('completedAt')?.instance).toBe('Date');
    expect(ScaleInstanceSchema.path('lockedAt')?.instance).toBe('Date');
    expect(ScaleInstanceSchema.path('voidedAt')?.instance).toBe('Date');
    expect(ScaleInstanceSchema.path('durationMs')?.instance).toBe('Number');
    expect(
      ScaleInstanceSchema.path('operatorSnapshot.operatorId')?.instance,
    ).toBe('ObjectId');
    expect(ScaleInstanceSchema.path('progress')?.instance).toBe('Mixed');
    expect(ScaleInstanceSchema.path('qualityControlSummary')?.instance).toBe(
      'Mixed',
    );
    expect(ScaleInstanceSchema.path('metadata')?.instance).toBe('Mixed');
  });

  it('defines ItemResponse collection and indexes', () => {
    expect(ItemResponseSchema.get('collection')).toBe('item_responses');
    expect(ItemResponseSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { scaleInstanceId: 1, itemCode: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [
          { assessmentVisitId: 1, scaleInstanceId: 1, itemOrder: 1 },
          expect.any(Object),
        ],
        [{ patientId: 1, scaleCode: 1, itemCode: 1 }, expect.any(Object)],
        [{ scaleCode: 1, itemCode: 1 }, expect.any(Object)],
        [{ status: 1, updatedAt: -1 }, expect.any(Object)],
        [{ scaleInstanceId: 1, countsTowardTotal: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines ItemResponse explicit ObjectId, primitive, nullable and Mixed field types', () => {
    expect(ItemResponseSchema.path('assessmentVisitId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemResponseSchema.path('scaleInstanceId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemResponseSchema.path('patientId')?.instance).toBe('ObjectId');
    expect(ItemResponseSchema.path('scaleDefinitionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemResponseSchema.path('scaleVersionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemResponseSchema.path('scaleCode')?.instance).toBe('String');
    expect(ItemResponseSchema.path('instanceCode')?.instance).toBe('String');
    expect(ItemResponseSchema.path('itemCode')?.instance).toBe('String');
    expect(ItemResponseSchema.path('itemOrder')?.instance).toBe('Number');
    expect(ItemResponseSchema.path('responseType')?.instance).toBe('String');
    expect(ItemResponseSchema.path('countsTowardTotal')?.instance).toBe(
      'Boolean',
    );
    expect(ItemResponseSchema.path('itemConfigSnapshot')?.instance).toBe(
      'Mixed',
    );
    expect(ItemResponseSchema.path('status')?.instance).toBe('String');
    expect(ItemResponseSchema.path('answerSource')?.instance).toBe('String');
    expect(ItemResponseSchema.path('draftRevision')?.instance).toBe('Number');
    expect(ItemResponseSchema.path('draftSavedAt')?.instance).toBe('Date');
    expect(ItemResponseSchema.path('rawResponse')?.instance).toBe('Mixed');
    expect(ItemResponseSchema.path('structuredResponse')?.instance).toBe(
      'Mixed',
    );
    expect(ItemResponseSchema.path('isMissing')?.instance).toBe('Boolean');
    expect(ItemResponseSchema.path('qualityControlHints')?.instance).toBe(
      'Mixed',
    );
    expect(ItemResponseSchema.path('metadata')?.instance).toBe('Mixed');
    expect(ItemResponseSchema.path('lockedAt')?.instance).toBe('Date');
    expect(ItemResponseSchema.path('voidedAt')?.instance).toBe('Date');

    expect(ItemResponseVersionTraceSchema.path('scaleVersion')?.instance).toBe(
      'String',
    );
    expect(ItemScoreSnapshotSchema.path('scoreValue')?.instance).toBe('Number');
    expect(ItemScoreSnapshotSchema.path('maxScore')?.instance).toBe('Number');
    expect(ItemScoreSnapshotSchema.path('minScore')?.instance).toBe('Number');
    expect(ItemScoreSnapshotSchema.path('scoreStatus')?.instance).toBe(
      'String',
    );
    expect(ItemScoreSnapshotSchema.path('scoreSource')?.instance).toBe(
      'String',
    );
    expect(ItemScoreSnapshotSchema.path('scoredAt')?.instance).toBe('Date');
    expect(ItemScoreSnapshotSchema.path('scoredBy')?.instance).toBe('ObjectId');
    expect(ItemStepResultSchema.path('expectedValue')?.instance).toBe('Mixed');
    expect(ItemStepResultSchema.path('actualValue')?.instance).toBe('Mixed');
    expect(ItemStepResultSchema.path('isCorrect')?.instance).toBe('Boolean');
    expect(ItemStepResultSchema.path('scoreValue')?.instance).toBe('Number');
    expect(PromptResponseRecordSchema.path('promptType')?.instance).toBe(
      'String',
    );
    expect(
      PromptResponseRecordSchema.path('responseAfterPrompt')?.instance,
    ).toBe('Mixed');
    expect(PromptResponseRecordSchema.path('isCorrect')?.instance).toBe(
      'Boolean',
    );
    expect(PromptResponseRecordSchema.path('countsTowardScore')?.instance).toBe(
      'Boolean',
    );
    expect(ItemTimingSnapshotSchema.path('timerState')?.instance).toBe(
      'String',
    );
    expect(ItemTimingSnapshotSchema.path('startedAt')?.instance).toBe('Date');
    expect(ItemTimingSnapshotSchema.path('lastResumedAt')?.instance).toBe(
      'Date',
    );
    expect(ItemTimingSnapshotSchema.path('completedAt')?.instance).toBe('Date');
    expect(ItemTimingSnapshotSchema.path('durationMs')?.instance).toBe(
      'Number',
    );
    expect(ItemTimingSnapshotSchema.path('timerSource')?.instance).toBe(
      'String',
    );
    expect(ItemEvidenceRefSchema.path('evidenceType')?.instance).toBe('String');
    expect(ItemEvidenceRefSchema.path('mediaEvidenceId')?.instance).toBe(
      'ObjectId',
    );
    expect(ItemEvidenceRefSchema.path('status')?.instance).toBe('String');
  });

  it('keeps ItemResponse embedded schemas without nested _id fields', () => {
    expect(ItemResponseVersionTraceSchema.get('_id')).toBe(false);
    expect(ItemScoreSnapshotSchema.get('_id')).toBe(false);
    expect(ItemStepResultSchema.get('_id')).toBe(false);
    expect(PromptResponseRecordSchema.get('_id')).toBe(false);
    expect(ItemTimingSnapshotSchema.get('_id')).toBe(false);
    expect(ItemEvidenceRefSchema.get('_id')).toBe(false);
  });
});

describe('AssessmentsService', () => {
  let service: AssessmentsService;
  let assessmentVisitModel: {
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    create: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
    deleteOne: jest.Mock;
  };
  let scaleInstanceModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
    find: jest.Mock;
    deleteMany: jest.Mock;
    deleteOne: jest.Mock;
  };
  let itemResponseModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    deleteMany: jest.Mock;
  };
  let patientAdministrationSessionModel: {
    exists: jest.Mock;
    find: jest.Mock;
    deleteMany: jest.Mock;
  };
  let patientsService: {
    findPatientById: jest.Mock;
  };

  beforeEach(async () => {
    assessmentVisitModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
    };
    scaleInstanceModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      find: jest.fn(),
      deleteMany: jest.fn(),
      deleteOne: jest.fn(),
    };
    itemResponseModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      deleteMany: jest.fn(),
    };
    patientAdministrationSessionModel = {
      exists: jest.fn(),
      find: jest.fn(),
      deleteMany: jest.fn(),
    };
    patientsService = {
      findPatientById: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        {
          provide: getModelToken(AssessmentVisit.name),
          useValue: assessmentVisitModel,
        },
        {
          provide: getModelToken(ScaleInstance.name),
          useValue: scaleInstanceModel,
        },
        {
          provide: getModelToken(ItemResponse.name),
          useValue: itemResponseModel,
        },
        {
          provide: getModelToken(PatientAdministrationSession.name),
          useValue: patientAdministrationSessionModel,
        },
        {
          provide: PatientsService,
          useValue: patientsService,
        },
      ],
    }).compile();

    service = moduleRef.get(AssessmentsService);
    itemResponseModel.find.mockReturnValue(createExecQuery([]));
    patientAdministrationSessionModel.exists.mockReturnValue(
      createExecQuery(null),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes visit and instance codes with trim and uppercase', () => {
    expect(service.normalizeVisitCode('  visit-test-001  ')).toBe(
      'VISIT-TEST-001',
    );
    expect(service.normalizeInstanceCode('  inst-test-001  ')).toBe(
      'INST-TEST-001',
    );
    expect(service.normalizeScaleCode(' MoCA ')).toBe('moca');
    expect(
      service.normalizeItemCode('  MMSE.Attention.Serial_Sevens.Step_1  '),
    ).toBe('mmse.attention.serial_sevens.step_1');
  });

  it('finds a historical completed patient administration session only', async () => {
    const scaleInstanceId = new Types.ObjectId();
    patientAdministrationSessionModel.exists.mockReturnValue(
      createExecQuery({ _id: new Types.ObjectId() }),
    );

    await expect(
      service.hasCompletedPatientAdministrationSessionForScaleInstance(
        scaleInstanceId,
      ),
    ).resolves.toBe(true);
    expect(patientAdministrationSessionModel.exists).toHaveBeenCalledWith({
      scaleInstanceId,
      status: 'completed',
    });
  });

  it.each([
    'prepared',
    'active',
    'paused',
    'terminated',
    'expired',
    'no session',
  ])('does not treat %s as completed patient administration', async () => {
    const scaleInstanceId = new Types.ObjectId();
    patientAdministrationSessionModel.exists.mockReturnValue(
      createExecQuery(null),
    );

    await expect(
      service.hasCompletedPatientAdministrationSessionForScaleInstance(
        scaleInstanceId,
      ),
    ).resolves.toBe(false);
    expect(patientAdministrationSessionModel.exists).toHaveBeenCalledWith({
      scaleInstanceId,
      status: 'completed',
    });
  });

  it('prepares a supervised draft without a session for physical deletion', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.findOne.mockReturnValue(
      createExecQuery(createVisitDocumentLike(patientId, visitId)),
    );
    scaleInstanceModel.findOne.mockReturnValue(
      createExecQuery(
        createScaleInstanceDocumentLike(patientId, visitId, scaleInstanceId, {
          administrationMode: 'supervised_patient_input',
        }),
      ),
    );
    patientAdministrationSessionModel.find.mockReturnValue(createExecQuery([]));
    itemResponseModel.countDocuments.mockReturnValue(createExecQuery(11));

    await expect(
      service.prepareScaleInstanceDeletion(patientId, visitId, scaleInstanceId),
    ).resolves.toEqual({
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId,
      patientAdministrationSessionIds: [],
      itemResponseCount: 11,
    });
  });

  it('prepares an in-progress supervised instance with only terminated or expired sessions', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const terminatedSessionId = new Types.ObjectId();
    const expiredSessionId = new Types.ObjectId();
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.findOne.mockReturnValue(
      createExecQuery(createVisitDocumentLike(patientId, visitId)),
    );
    scaleInstanceModel.findOne.mockReturnValue(
      createExecQuery(
        createScaleInstanceDocumentLike(patientId, visitId, scaleInstanceId, {
          administrationMode: 'supervised_patient_input',
          status: 'in_progress',
          startedAt: new Date('2026-08-25T01:00:00.000Z'),
        }),
      ),
    );
    patientAdministrationSessionModel.find.mockReturnValue(
      createExecQuery([
        { _id: terminatedSessionId, status: 'terminated' },
        { _id: expiredSessionId, status: 'expired' },
      ]),
    );
    itemResponseModel.countDocuments.mockReturnValue(createExecQuery(11));

    await expect(
      service.prepareScaleInstanceDeletion(patientId, visitId, scaleInstanceId),
    ).resolves.toEqual(
      expect.objectContaining({
        patientAdministrationSessionIds: [
          terminatedSessionId,
          expiredSessionId,
        ],
      }),
    );
  });

  it.each([
    [
      'prepared session',
      {},
      [{ _id: new Types.ObjectId(), status: 'prepared' }],
    ],
    ['active session', {}, [{ _id: new Types.ObjectId(), status: 'active' }]],
    ['paused session', {}, [{ _id: new Types.ObjectId(), status: 'paused' }]],
    [
      'completed session',
      {},
      [{ _id: new Types.ObjectId(), status: 'completed' }],
    ],
    ['completed instance', { status: 'completed' }, []],
    ['locked instance', { status: 'locked', lockedAt: new Date() }, []],
    ['voided instance', { status: 'voided', voidedAt: new Date() }, []],
    [
      'submission barrier',
      { submissionWriteBarrier: { version: 1, state: 'fencing' } },
      [],
    ],
    [
      'non-supervised instance',
      { administrationMode: 'clinician_administered' },
      [],
    ],
    ['isolated in-progress instance', { status: 'in_progress' }, []],
  ])('rejects deletion for %s', async (_name, overrides, sessions) => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.findOne.mockReturnValue(
      createExecQuery(createVisitDocumentLike(patientId, visitId)),
    );
    scaleInstanceModel.findOne.mockReturnValue(
      createExecQuery(
        createScaleInstanceDocumentLike(patientId, visitId, scaleInstanceId, {
          administrationMode: 'supervised_patient_input',
          ...overrides,
        }),
      ),
    );
    patientAdministrationSessionModel.find.mockReturnValue(
      createExecQuery(sessions),
    );

    await expectHttpExceptionCode(
      service.prepareScaleInstanceDeletion(patientId, visitId, scaleInstanceId),
      409,
      'SCALE_INSTANCE_NOT_DELETABLE',
    );
    expect(itemResponseModel.countDocuments).not.toHaveBeenCalled();
  });

  it('deletes only the planned failed-session and core instance ownership', async () => {
    const plan = {
      patientId: new Types.ObjectId(),
      assessmentVisitId: new Types.ObjectId(),
      scaleInstanceId: new Types.ObjectId(),
      patientAdministrationSessionIds: [new Types.ObjectId()],
      itemResponseCount: 11,
    };
    patientAdministrationSessionModel.deleteMany.mockReturnValue(
      createExecQuery({ deletedCount: 1 }),
    );
    itemResponseModel.deleteMany.mockReturnValue(
      createExecQuery({ deletedCount: 11 }),
    );
    scaleInstanceModel.deleteOne.mockReturnValue(
      createExecQuery({ deletedCount: 1 }),
    );

    await service.deletePatientAdministrationSessionsForScaleInstance(plan);
    await service.deleteItemResponsesForScaleInstance(plan);
    await service.deleteScaleInstance(plan);

    expect(patientAdministrationSessionModel.deleteMany).toHaveBeenCalledWith({
      _id: { $in: plan.patientAdministrationSessionIds },
      scaleInstanceId: plan.scaleInstanceId,
      status: { $in: ['terminated', 'expired'] },
    });
    expect(itemResponseModel.deleteMany).toHaveBeenCalledWith({
      assessmentVisitId: plan.assessmentVisitId,
      patientId: plan.patientId,
      scaleInstanceId: plan.scaleInstanceId,
    });
    expect(scaleInstanceModel.deleteOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: plan.scaleInstanceId,
        assessmentVisitId: plan.assessmentVisitId,
        patientId: plan.patientId,
      }),
    );
    expect(assessmentVisitModel.deleteOne).not.toHaveBeenCalled();
  });

  it('conditionally starts the owned scale and visit without overwriting lifecycle facts', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const startedAt = new Date('2026-08-18T01:00:00.000Z');
    scaleInstanceModel.updateOne.mockReturnValue(createExecQuery({}));
    assessmentVisitModel.updateOne.mockReturnValue(createExecQuery({}));

    await service.ensureVisitAndScaleStarted({
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId,
      startedAt,
    });

    const nonTerminalLifecycle = {
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
    };
    expect(scaleInstanceModel.updateOne).toHaveBeenNthCalledWith(
      1,
      {
        _id: scaleInstanceId,
        assessmentVisitId: visitId,
        patientId,
        ...nonTerminalLifecycle,
        status: { $in: ['draft', 'in_progress'] },
        $or: [{ startedAt: null }, { startedAt: { $exists: false } }],
      },
      { $set: { status: 'in_progress', startedAt } },
      { runValidators: true },
    );
    expect(scaleInstanceModel.updateOne).toHaveBeenNthCalledWith(
      2,
      {
        _id: scaleInstanceId,
        assessmentVisitId: visitId,
        patientId,
        ...nonTerminalLifecycle,
        status: 'draft',
      },
      { $set: { status: 'in_progress' } },
      { runValidators: true },
    );
    expect(assessmentVisitModel.updateOne).toHaveBeenNthCalledWith(
      1,
      {
        _id: visitId,
        patientId,
        ...nonTerminalLifecycle,
        status: { $in: ['draft', 'in_progress'] },
        $or: [{ startedAt: null }, { startedAt: { $exists: false } }],
      },
      { $set: { status: 'in_progress', startedAt } },
      { runValidators: true },
    );
    expect(assessmentVisitModel.updateOne).toHaveBeenNthCalledWith(
      2,
      {
        _id: visitId,
        patientId,
        ...nonTerminalLifecycle,
        status: 'draft',
      },
      { $set: { status: 'in_progress' } },
      { runValidators: true },
    );
  });

  it('keeps the first visit start while independently starting a later scale', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const firstScaleInstanceId = new Types.ObjectId();
    const secondScaleInstanceId = new Types.ObjectId();
    const firstStartedAt = new Date('2026-08-18T01:00:00.000Z');
    const secondStartedAt = new Date('2026-08-18T02:00:00.000Z');
    scaleInstanceModel.updateOne.mockReturnValue(createExecQuery({}));
    assessmentVisitModel.updateOne.mockReturnValue(createExecQuery({}));

    await service.ensureVisitAndScaleStarted({
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: firstScaleInstanceId,
      startedAt: firstStartedAt,
    });
    await service.ensureVisitAndScaleStarted({
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: secondScaleInstanceId,
      startedAt: secondStartedAt,
    });

    expect(scaleInstanceModel.updateOne).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        _id: secondScaleInstanceId,
        assessmentVisitId: visitId,
        patientId,
        $or: [{ startedAt: null }, { startedAt: { $exists: false } }],
      }),
      { $set: { status: 'in_progress', startedAt: secondStartedAt } },
      { runValidators: true },
    );
    expect(assessmentVisitModel.updateOne).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        _id: visitId,
        patientId,
        $or: [{ startedAt: null }, { startedAt: { $exists: false } }],
      }),
      { $set: { status: 'in_progress', startedAt: secondStartedAt } },
      { runValidators: true },
    );
  });

  it('reads follow-up trend Visits with an ascending bounded lean projection', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const assessmentDate = new Date('2026-07-19T08:00:00.000Z');
    const exec = jest.fn().mockResolvedValue([
      {
        _id: visitId,
        patientId,
        visitCode: 'VIS-TREND-1',
        visitType: 'follow_up',
        status: 'voided',
        assessmentDate,
      },
    ]);
    const lean = jest.fn().mockReturnValue({ exec });
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ sort });
    assessmentVisitModel.find.mockReturnValue({ select });

    await expect(
      service.listPatientFollowUpTrendVisits(patientId, {
        dateFrom: assessmentDate,
        dateTo: assessmentDate,
        limit: 51,
      }),
    ).resolves.toEqual([
      {
        id: visitId.toString(),
        patientId: patientId.toString(),
        visitCode: 'VIS-TREND-1',
        visitType: 'follow_up',
        status: 'voided',
        assessmentDate,
      },
    ]);
    expect(assessmentVisitModel.find).toHaveBeenCalledWith({
      patientId,
      assessmentDate: { $gte: assessmentDate, $lte: assessmentDate },
    });
    expect(sort).toHaveBeenCalledWith({ assessmentDate: 1, _id: 1 });
    expect(limit).toHaveBeenCalledWith(51);
    expect(select).toHaveBeenCalledWith({
      _id: 1,
      patientId: 1,
      visitCode: 1,
      visitType: 1,
      status: 1,
      assessmentDate: 1,
    });
  });

  it('batch reads only the requested trend scale instances with a lean projection', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const instanceId = new Types.ObjectId();
    const exec = jest.fn().mockResolvedValue([
      {
        _id: instanceId,
        patientId,
        assessmentVisitId: visitId,
        instanceCode: 'SI-TREND-1',
        instanceNo: 2,
        scaleCode: 'moca',
        scaleVersion: '1.0',
        administrationMode: 'clinician_administered',
        status: 'completed',
        durationMs: 1000,
        voidedAt: null,
        versionTrace: {
          crfVersion: 'crf-1',
          scoringRuleVersion: 'score-1',
          fieldEncodingVersion: 'field-1',
        },
      },
    ]);
    const lean = jest.fn().mockReturnValue({ exec });
    const sort = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ sort });
    scaleInstanceModel.find.mockReturnValue({ select });

    const result = await service.listPatientFollowUpTrendScaleInstances(
      patientId,
      [visitId.toString()],
      ' MoCA ',
    );
    expect(scaleInstanceModel.find).toHaveBeenCalledWith({
      patientId,
      assessmentVisitId: { $in: [visitId] },
      scaleCode: 'moca',
    });
    expect(select).toHaveBeenCalledWith({
      _id: 1,
      patientId: 1,
      assessmentVisitId: 1,
      instanceCode: 1,
      instanceNo: 1,
      scaleCode: 1,
      scaleVersion: 1,
      administrationMode: 1,
      status: 1,
      durationMs: 1,
      voidedAt: 1,
      'versionTrace.crfVersion': 1,
      'versionTrace.scoringRuleVersion': 1,
      'versionTrace.fieldEncodingVersion': 1,
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: instanceId.toString(),
        assessmentVisitId: visitId.toString(),
        instanceNo: 2,
        scaleCode: 'moca',
      }),
    ]);
  });

  it('returns null when visit is not found', async () => {
    assessmentVisitModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findVisitByCode('VISIT-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(assessmentVisitModel.findOne).toHaveBeenCalledWith({
      visitCode: 'VISIT-UNKNOWN-001',
    });
  });

  it('returns null when visit id is not found', async () => {
    const visitId = new Types.ObjectId();
    assessmentVisitModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(service.findVisitById(visitId)).resolves.toBeNull();
    expect(assessmentVisitModel.findOne).toHaveBeenCalledWith({ _id: visitId });
  });

  it('maps visit results instead of returning raw documents', async () => {
    const visitId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const operatorId = new Types.ObjectId();
    const assessmentDate = new Date('2026-01-02T08:00:00.000Z');
    const startedAt = new Date('2026-01-02T08:05:00.000Z');
    const rawVisit = {
      _id: visitId,
      patientId,
      subjectCode: 'SUBJ-TEST-001',
      visitCode: 'VISIT-TEST-001',
      visitType: 'baseline',
      status: 'in_progress',
      assessmentDate,
      startedAt,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      voidedBy: null,
      operatorSnapshot: {
        operatorId,
        operatorName: 'Sample Operator',
        operatorRole: 'research_assistant',
      },
      clinicalContext: { departmentCode: 'DEPT-TEST' },
      notes: 'De-identified visit note',
      metadata: { projectCode: 'PROJECT-TEST' },
      internalMarker: 'not returned',
    };
    assessmentVisitModel.findOne.mockReturnValue(createExecQuery(rawVisit));

    const result = await service.findVisitByCode(' visit-test-001 ');

    expect(result).toEqual({
      id: visitId.toString(),
      patientId: patientId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      visitCode: 'VISIT-TEST-001',
      visitType: 'baseline',
      status: 'in_progress',
      assessmentDate,
      startedAt,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: undefined,
      operatorSnapshot: {
        operatorId: operatorId.toString(),
        operatorName: 'Sample Operator',
        operatorRole: 'research_assistant',
      },
      clinicalContext: { departmentCode: 'DEPT-TEST' },
      notes: 'De-identified visit note',
      metadata: { projectCode: 'PROJECT-TEST' },
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(assessmentVisitModel.findOne).toHaveBeenCalledWith({
      visitCode: 'VISIT-TEST-001',
    });
  });

  it('lists visits by patient id through mapper output', async () => {
    const visitId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const assessmentDate = new Date('2026-01-03T08:00:00.000Z');
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        {
          _id: visitId,
          patientId,
          subjectCode: 'SUBJ-TEST-001',
          visitCode: 'VISIT-TEST-002',
          visitType: 'follow_up',
          status: 'draft',
          assessmentDate,
          startedAt: null,
          completedAt: null,
          lockedAt: null,
          voidedAt: null,
          operatorSnapshot: null,
          clinicalContext: null,
          metadata: null,
          internalMarker: 'not returned',
        },
      ]),
    );
    assessmentVisitModel.find.mockReturnValue({ sort });

    const result = await service.listVisitsByPatientId(patientId);

    expect(assessmentVisitModel.find).toHaveBeenCalledWith({ patientId });
    expect(sort).toHaveBeenCalledWith({ assessmentDate: -1 });
    expect(result).toEqual([
      {
        id: visitId.toString(),
        patientId: patientId.toString(),
        subjectCode: 'SUBJ-TEST-001',
        visitCode: 'VISIT-TEST-002',
        visitType: 'follow_up',
        status: 'draft',
        assessmentDate,
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        voidedAt: null,
        voidedBy: null,
        voidReason: undefined,
        operatorSnapshot: null,
        clinicalContext: null,
        notes: undefined,
        metadata: null,
      },
    ]);
    expect(result[0]).not.toHaveProperty('internalMarker');
  });

  it('lists patient visits with pagination and confirmed filters', async () => {
    const visitId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const dateFrom = new Date('2026-01-01T00:00:00.000Z');
    const dateTo = new Date('2026-01-31T23:59:59.999Z');
    const assessmentDate = new Date('2026-01-15T08:00:00.000Z');
    const queryChain = createPaginatedQuery([
      {
        _id: visitId,
        patientId,
        subjectCode: 'SUBJ-TEST-A12',
        visitCode: 'VISIT-TEST-A12-LIST',
        visitType: 'follow_up',
        status: 'completed',
        assessmentDate,
        startedAt: null,
        completedAt: assessmentDate,
        lockedAt: null,
        voidedAt: null,
        operatorSnapshot: null,
        clinicalContext: { hidden: true },
        notes: 'Visit note',
        metadata: { hidden: true },
      },
    ]);
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.find.mockReturnValue(queryChain);
    assessmentVisitModel.countDocuments.mockReturnValue(createExecQuery(1));

    const result = await service.listVisitsByPatientIdPaginated(patientId, {
      page: 2,
      pageSize: 5,
      status: 'completed',
      visitType: 'follow_up',
      dateFrom,
      dateTo,
    });

    const expectedFilter = {
      patientId,
      status: 'completed',
      visitType: 'follow_up',
      assessmentDate: { $gte: dateFrom, $lte: dateTo },
    };
    expect(assessmentVisitModel.find).toHaveBeenCalledWith(expectedFilter);
    expect(assessmentVisitModel.countDocuments).toHaveBeenCalledWith(
      expectedFilter,
    );
    expect(queryChain.sort).toHaveBeenCalledWith({
      assessmentDate: -1,
      _id: -1,
    });
    expect(queryChain.skip).toHaveBeenCalledWith(5);
    expect(queryChain.limit).toHaveBeenCalledWith(5);
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: visitId.toString(),
          patientId: patientId.toString(),
          visitCode: 'VISIT-TEST-A12-LIST',
        }),
      ],
      page: 2,
      pageSize: 5,
      total: 1,
    });
    expect(result.items[0]).not.toHaveProperty('clinicalContext');
    expect(result.items[0]).not.toHaveProperty('metadata');
  });

  it('rejects an invalid visit date range after confirming the patient', async () => {
    const patientId = new Types.ObjectId();
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );

    await expectHttpExceptionCode(
      service.listVisitsByPatientIdPaginated(patientId, {
        page: 1,
        pageSize: 20,
        dateFrom: new Date('2026-02-01T00:00:00.000Z'),
        dateTo: new Date('2026-01-01T00:00:00.000Z'),
      }),
      400,
      'INVALID_DATE_RANGE',
    );
    expect(patientsService.findPatientById).toHaveBeenCalledWith(patientId);
    expect(assessmentVisitModel.find).not.toHaveBeenCalled();
  });

  it('returns stable not found semantics when listing visits for an unknown patient', async () => {
    patientsService.findPatientById.mockResolvedValue(null);

    await expect(
      service.listVisitsByPatientIdPaginated(new Types.ObjectId(), {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expectHttpExceptionCode(
      service.listVisitsByPatientIdPaginated(new Types.ObjectId(), {
        page: 1,
        pageSize: 20,
      }),
      404,
      'PATIENT_NOT_FOUND',
    );
  });

  it('creates a draft visit from patient and operator snapshots', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const operatorId = new Types.ObjectId();
    const assessmentDate = new Date('2026-03-01T08:00:00.000Z');
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.findOne.mockReturnValue(createExecQuery(null));
    assessmentVisitModel.create.mockImplementation(
      (input: Record<string, unknown>) =>
        Promise.resolve({ _id: visitId, ...input }),
    );

    const result = await service.createVisitForPatient(patientId, {
      visitCode: ' visit-test-a12-create ',
      assessmentDate,
      notes: ' visit note ',
      operatorSnapshot: {
        operatorId: operatorId.toString(),
        operatorName: 'Sample Operator',
        operatorRole: 'doctor',
      },
    });

    expect(assessmentVisitModel.create).toHaveBeenCalledWith({
      patientId,
      subjectCode: 'SUBJ-TEST-A12',
      visitCode: 'VISIT-TEST-A12-CREATE',
      visitType: 'baseline',
      status: 'draft',
      assessmentDate,
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      voidedBy: null,
      operatorSnapshot: {
        operatorId,
        operatorName: 'Sample Operator',
        operatorRole: 'doctor',
      },
      clinicalContext: null,
      notes: 'visit note',
      metadata: null,
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: visitId.toString(),
        patientId: patientId.toString(),
        subjectCode: 'SUBJ-TEST-A12',
        visitCode: 'VISIT-TEST-A12-CREATE',
        status: 'draft',
      }),
    );
    expect(result).not.toHaveProperty('clinicalContext');
    expect(result).not.toHaveProperty('metadata');
  });

  it('rejects visit creation for a missing or non-active patient', async () => {
    const patientId = new Types.ObjectId();
    const input = {
      visitCode: 'VISIT-TEST-A12-BLOCKED',
      assessmentDate: new Date(),
      operatorSnapshot: {
        operatorId: new Types.ObjectId().toString(),
        operatorName: 'Sample Operator',
        operatorRole: 'nurse' as const,
      },
    };
    patientsService.findPatientById.mockResolvedValueOnce(null);

    await expectHttpExceptionCode(
      service.createVisitForPatient(patientId, input),
      404,
      'PATIENT_NOT_FOUND',
    );

    patientsService.findPatientById.mockResolvedValueOnce(
      createPatientSummary(patientId, 'inactive'),
    );
    await expectHttpExceptionCode(
      service.createVisitForPatient(patientId, input),
      409,
      'PATIENT_NOT_ACTIVE',
    );
    expect(assessmentVisitModel.create).not.toHaveBeenCalled();
  });

  it('converts visit code precheck and duplicate key conflicts to stable 409 semantics', async () => {
    const patientId = new Types.ObjectId();
    const input = {
      visitCode: 'VISIT-TEST-A12-DUPLICATE',
      assessmentDate: new Date(),
      operatorSnapshot: {
        operatorId: new Types.ObjectId().toString(),
        operatorName: 'Sample Operator',
        operatorRole: 'research_assistant' as const,
      },
    };
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.findOne.mockReturnValueOnce(
      createExecQuery({ _id: new Types.ObjectId() }),
    );

    await expectHttpExceptionCode(
      service.createVisitForPatient(patientId, input),
      409,
      'VISIT_CODE_CONFLICT',
    );

    assessmentVisitModel.findOne.mockReturnValueOnce(createExecQuery(null));
    assessmentVisitModel.create.mockRejectedValueOnce({ code: 11000 });
    await expect(
      service.createVisitForPatient(patientId, input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(assessmentVisitModel.create).toHaveBeenCalledTimes(1);
  });

  it('maps public visit responses without clinical context or metadata', () => {
    const response = service.toAssessmentVisitDetailResponse({
      id: new Types.ObjectId().toString(),
      patientId: new Types.ObjectId().toString(),
      subjectCode: 'SUBJ-TEST-A12',
      visitCode: 'VISIT-TEST-A12-PUBLIC',
      visitType: 'baseline',
      status: 'draft',
      assessmentDate: new Date(),
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      voidedBy: null,
      operatorSnapshot: null,
      clinicalContext: { hidden: true },
      metadata: { hidden: true },
    });

    expect(response).not.toHaveProperty('clinicalContext');
    expect(response).not.toHaveProperty('metadata');
  });

  it('returns null when scale instance is not found', async () => {
    scaleInstanceModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findScaleInstanceByCode('INST-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(scaleInstanceModel.findOne).toHaveBeenCalledWith({
      instanceCode: 'INST-UNKNOWN-001',
    });
  });

  it('maps scale instance results instead of returning raw documents', async () => {
    const instanceId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const operatorId = new Types.ObjectId();
    const startedAt = new Date('2026-01-04T08:00:00.000Z');
    const completedAt = new Date('2026-01-04T08:20:00.000Z');
    const rawInstance = {
      _id: instanceId,
      assessmentVisitId: visitId,
      patientId,
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      startedAt,
      completedAt,
      lockedAt: null,
      voidedAt: null,
      durationMs: 1200000,
      operatorSnapshot: {
        operatorId,
        operatorName: 'Sample Operator',
        operatorRole: 'doctor',
      },
      progress: { completedItemCount: 0 },
      qualityControlSummary: { reviewed: false },
      notes: 'De-identified scale instance note',
      submissionWriteBarrier: null,
      metadata: { source: 'unit-test' },
      internalMarker: 'not returned',
    };
    scaleInstanceModel.findOne.mockReturnValue(createExecQuery(rawInstance));

    const result = await service.findScaleInstanceByCode(' inst-test-001 ');

    expect(result).toEqual({
      id: instanceId.toString(),
      assessmentVisitId: visitId.toString(),
      patientId: patientId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId.toString(),
      scaleVersionId: versionId.toString(),
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      startedAt,
      completedAt,
      lockedAt: null,
      voidedAt: null,
      durationMs: 1200000,
      operatorSnapshot: {
        operatorId: operatorId.toString(),
        operatorName: 'Sample Operator',
        operatorRole: 'doctor',
      },
      progress: { completedItemCount: 0 },
      qualityControlSummary: { reviewed: false },
      notes: 'De-identified scale instance note',
      submissionWriteBarrier: null,
      metadata: { source: 'unit-test' },
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(scaleInstanceModel.findOne).toHaveBeenCalledWith({
      instanceCode: 'INST-TEST-001',
    });
  });

  it('lists scale instances by visit id through mapper output', async () => {
    const instanceId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        {
          _id: instanceId,
          assessmentVisitId: visitId,
          patientId,
          subjectCode: 'SUBJ-TEST-001',
          scaleDefinitionId: definitionId,
          scaleVersionId: versionId,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          instanceCode: 'INST-TEST-002',
          instanceNo: 1,
          status: 'draft',
          administrationMode: 'supervised_patient_input',
          versionTrace: null,
          startedAt: null,
          completedAt: null,
          lockedAt: null,
          voidedAt: null,
          durationMs: null,
          operatorSnapshot: null,
          progress: null,
          qualityControlSummary: null,
          metadata: null,
          internalMarker: 'not returned',
        },
      ]),
    );
    scaleInstanceModel.find.mockReturnValue({ sort });

    const result = await service.listScaleInstancesByVisitId(visitId);

    expect(scaleInstanceModel.find).toHaveBeenCalledWith({
      assessmentVisitId: visitId,
    });
    expect(sort).toHaveBeenCalledWith({ scaleCode: 1, instanceNo: 1 });
    expect(result).toEqual([
      {
        id: instanceId.toString(),
        assessmentVisitId: visitId.toString(),
        patientId: patientId.toString(),
        subjectCode: 'SUBJ-TEST-001',
        scaleDefinitionId: definitionId.toString(),
        scaleVersionId: versionId.toString(),
        scaleCode: 'moca',
        scaleVersion: '1.0',
        instanceCode: 'INST-TEST-002',
        instanceNo: 1,
        status: 'draft',
        administrationMode: 'supervised_patient_input',
        versionTrace: null,
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        voidedAt: null,
        durationMs: null,
        operatorSnapshot: null,
        progress: null,
        qualityControlSummary: null,
        notes: undefined,
        submissionWriteBarrier: null,
        metadata: null,
      },
    ]);
    expect(result[0]).not.toHaveProperty('internalMarker');
  });

  it('finds a visit only through the patient and visit ownership pair', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const visit = {
      _id: visitId,
      patientId,
      subjectCode: 'SUBJ-TEST-A13',
      visitCode: 'VISIT-TEST-A13',
      visitType: 'baseline',
      status: 'draft',
      assessmentDate: new Date('2026-05-01T08:00:00.000Z'),
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      operatorSnapshot: null,
      clinicalContext: null,
      metadata: null,
    };
    assessmentVisitModel.findOne.mockReturnValue(createExecQuery(visit));

    const result = await service.findVisitByPatientAndId(patientId, visitId);

    expect(assessmentVisitModel.findOne).toHaveBeenCalledWith({
      _id: visitId,
      patientId,
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: visitId.toString(),
        patientId: patientId.toString(),
        visitCode: 'VISIT-TEST-A13',
      }),
    );
  });

  it('finds an existing scale by visit and normalized scale code', async () => {
    const visitId = new Types.ObjectId();
    scaleInstanceModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findScaleInstanceByVisitAndScaleCode(visitId, ' MMSE '),
    ).resolves.toBeNull();
    expect(scaleInstanceModel.findOne).toHaveBeenCalledWith({
      assessmentVisitId: visitId,
      scaleCode: 'mmse',
    });
  });

  it('maps only safe scale-instance fields and sanitizes progress', () => {
    const instanceId = new Types.ObjectId().toString();
    const visitId = new Types.ObjectId().toString();
    const patientId = new Types.ObjectId().toString();
    const response = service.toPublicScaleInstanceResponse({
      id: instanceId,
      assessmentVisitId: visitId,
      patientId,
      subjectCode: 'SUBJ-TEST-A13',
      scaleDefinitionId: new Types.ObjectId().toString(),
      scaleVersionId: new Types.ObjectId().toString(),
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-A13-MMSE-1',
      instanceNo: 1,
      status: 'draft',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: '1.0',
        scoringRuleVersion: 'mmse-crf-1.0',
        fieldEncodingVersion: 'mmse-semantic-1.0',
        sourceDocument: 'MMSE+MoCA.pdf',
      },
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      durationMs: null,
      operatorSnapshot: {
        operatorId: new Types.ObjectId().toString(),
        operatorName: 'A13 Test Operator',
        operatorRole: 'doctor',
      },
      progress: {
        totalItemCount: 11,
        answeredItemCount: Number.POSITIVE_INFINITY,
        hiddenProgressField: true,
      },
      qualityControlSummary: { hidden: true },
      notes: 'hidden note',
      submissionWriteBarrier: {
        version: 1,
        barrierId: 'a85ee596-783e-4e86-8803-da321ef1d6d3',
        state: 'fenced',
      },
      metadata: { hidden: true },
    });

    expect(response).toEqual(
      expect.objectContaining({
        id: instanceId,
        assessmentVisitId: visitId,
        patientId,
        scaleCode: 'mmse',
        progress: { totalItemCount: 11, answeredItemCount: 0 },
      }),
    );
    expect(response).not.toHaveProperty('scaleDefinitionId');
    expect(response).not.toHaveProperty('scaleVersionId');
    expect(response).not.toHaveProperty('metadata');
    expect(response).not.toHaveProperty('qualityControlSummary');
    expect(response).not.toHaveProperty('notes');
    expect(response).not.toHaveProperty('submissionWriteBarrier');
    expect(response).not.toHaveProperty('barrierId');
    expect(response.progress).not.toHaveProperty('hiddenProgressField');
  });

  it('returns visit execution detail with patient-first ownership checks and safe instances', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const instanceId = new Types.ObjectId();
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.findOne.mockReturnValue(
      createExecQuery({
        _id: visitId,
        patientId,
        subjectCode: 'SUBJ-TEST-A13',
        visitCode: 'VISIT-TEST-A13-DETAIL',
        visitType: 'baseline',
        status: 'draft',
        assessmentDate: new Date('2026-05-01T08:00:00.000Z'),
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        voidedAt: null,
        operatorSnapshot: null,
        clinicalContext: { hidden: true },
        metadata: { hidden: true },
      }),
    );
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        {
          _id: instanceId,
          assessmentVisitId: visitId,
          patientId,
          subjectCode: 'SUBJ-TEST-A13',
          scaleDefinitionId: new Types.ObjectId(),
          scaleVersionId: new Types.ObjectId(),
          scaleCode: 'mmse',
          scaleVersion: '1.0',
          instanceCode: 'INST-TEST-A13-MMSE-1',
          instanceNo: 1,
          status: 'draft',
          administrationMode: 'clinician_administered',
          versionTrace: null,
          startedAt: null,
          completedAt: null,
          lockedAt: null,
          voidedAt: null,
          durationMs: null,
          operatorSnapshot: null,
          progress: { totalItemCount: 99, answeredItemCount: 99 },
          qualityControlSummary: { hidden: true },
          metadata: { hidden: true },
        },
      ]),
    );
    scaleInstanceModel.find.mockReturnValue({ sort });
    itemResponseModel.countDocuments
      .mockReturnValueOnce(createExecQuery(11))
      .mockReturnValueOnce(createExecQuery(2));

    const result = await service.getVisitExecutionDetail(patientId, visitId);

    expect(patientsService.findPatientById).toHaveBeenCalledWith(patientId);
    expect(assessmentVisitModel.findOne).toHaveBeenCalledWith({
      _id: visitId,
      patientId,
    });
    expect(result.visit).toEqual(
      expect.objectContaining({ id: visitId.toString() }),
    );
    expect(result.visit).not.toHaveProperty('clinicalContext');
    expect(result.scaleInstances).toEqual([
      expect.objectContaining({
        id: instanceId.toString(),
        scaleCode: 'mmse',
        progress: { totalItemCount: 11, answeredItemCount: 2 },
      }),
    ]);
    expect(result.scaleInstances[0]).not.toHaveProperty('metadata');
    expect(result.visitMaintenance).toEqual({
      canEdit: true,
      canDelete: true,
      canVoid: false,
      initializedScaleCount: 1,
    });
    expect(itemResponseModel.countDocuments).toHaveBeenNthCalledWith(1, {
      scaleInstanceId: instanceId,
    });
    expect(itemResponseModel.countDocuments).toHaveBeenNthCalledWith(2, {
      scaleInstanceId: instanceId,
      status: { $in: ['answered', 'scored'] },
    });
  });

  it('classifies empty and current seed-shaped visits as pre-assessment', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.findOne.mockReturnValue(
      createExecQuery(createVisitDocumentLike(patientId, visitId)),
    );

    const emptySort = jest.fn().mockReturnValue(createExecQuery([]));
    scaleInstanceModel.find.mockReturnValueOnce({ sort: emptySort });

    await expect(
      service.getVisitExecutionDetail(patientId, visitId),
    ).resolves.toEqual(
      expect.objectContaining({
        visitMaintenance: {
          canEdit: true,
          canDelete: true,
          canVoid: false,
          initializedScaleCount: 0,
        },
      }),
    );

    const scaleInstance = createScaleInstanceDocumentLike(
      patientId,
      visitId,
      scaleInstanceId,
    );
    const initializedSort = jest
      .fn()
      .mockReturnValue(createExecQuery([scaleInstance]));
    scaleInstanceModel.find.mockReturnValueOnce({ sort: initializedSort });
    itemResponseModel.find.mockReturnValueOnce(
      createExecQuery([createPristineItemResponseDocumentLike()]),
    );
    itemResponseModel.countDocuments.mockReturnValue(createExecQuery(0));

    await expect(
      service.getVisitExecutionDetail(patientId, visitId),
    ).resolves.toEqual(
      expect.objectContaining({
        visitMaintenance: {
          canEdit: true,
          canDelete: true,
          canVoid: false,
          initializedScaleCount: 1,
        },
      }),
    );
  });

  it.each([
    [
      'saved answer draft',
      { status: 'in_progress', draftRevision: 1, responseText: 'answer' },
    ],
    [
      'running timing',
      {
        timing: {
          timerState: 'running',
          startedAt: new Date('2026-08-01T08:00:00.000Z'),
          lastResumedAt: new Date('2026-08-01T08:00:00.000Z'),
          completedAt: null,
          durationMs: null,
          timerSource: 'system',
        },
      },
    ],
    [
      'scoring fact',
      {
        score: {
          scoreValue: 1,
          maxScore: 1,
          minScore: 0,
          scoreStatus: 'auto_scored',
          scoreSource: 'auto_rule',
          scoredAt: new Date('2026-08-01T08:05:00.000Z'),
          scoredBy: null,
        },
      },
    ],
    [
      'user step note',
      {
        stepResults: [
          {
            stepCode: 'seed-step',
            order: 1,
            expectedValue: 'seed-expected',
            actualValue: null,
            isCorrect: null,
            scoreValue: null,
            countsTowardItemScore: true,
            note: 'Recorded during assessment',
          },
        ],
      },
    ],
    [
      'attached evidence',
      {
        evidenceRefs: [
          {
            evidenceType: 'photo',
            mediaEvidenceId: new Types.ObjectId(),
            status: 'attached',
          },
        ],
      },
    ],
  ])(
    'classifies representative %s as an assessment fact',
    async (_name, overrides) => {
      const patientId = new Types.ObjectId();
      const visitId = new Types.ObjectId();
      const scaleInstanceId = new Types.ObjectId();
      patientsService.findPatientById.mockResolvedValue(
        createPatientSummary(patientId),
      );
      assessmentVisitModel.findOne.mockReturnValue(
        createExecQuery(createVisitDocumentLike(patientId, visitId)),
      );
      const sort = jest
        .fn()
        .mockReturnValue(
          createExecQuery([
            createScaleInstanceDocumentLike(
              patientId,
              visitId,
              scaleInstanceId,
            ),
          ]),
        );
      scaleInstanceModel.find.mockReturnValue({ sort });
      itemResponseModel.find.mockReturnValue(
        createExecQuery([createPristineItemResponseDocumentLike(overrides)]),
      );
      itemResponseModel.countDocuments.mockReturnValue(createExecQuery(0));

      const result = await service.getVisitExecutionDetail(patientId, visitId);

      expect(result.visitMaintenance).toEqual({
        canEdit: false,
        canDelete: false,
        canVoid: true,
        initializedScaleCount: 1,
      });
    },
  );

  it('treats any patient administration session as an assessment fact', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    patientsService.findPatientById.mockResolvedValue(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.findOne.mockReturnValue(
      createExecQuery(createVisitDocumentLike(patientId, visitId)),
    );
    const sort = jest
      .fn()
      .mockReturnValue(
        createExecQuery([
          createScaleInstanceDocumentLike(patientId, visitId, scaleInstanceId),
        ]),
      );
    scaleInstanceModel.find.mockReturnValue({ sort });
    itemResponseModel.find.mockReturnValue(
      createExecQuery([createPristineItemResponseDocumentLike()]),
    );
    patientAdministrationSessionModel.exists.mockReturnValue(
      createExecQuery({ _id: new Types.ObjectId() }),
    );
    itemResponseModel.countDocuments.mockReturnValue(createExecQuery(0));

    const result = await service.getVisitExecutionDetail(patientId, visitId);

    expect(patientAdministrationSessionModel.exists).toHaveBeenCalledWith({
      scaleInstanceId: { $in: [scaleInstanceId] },
    });
    expect(result.visitMaintenance).toEqual({
      canEdit: false,
      canDelete: false,
      canVoid: true,
      initializedScaleCount: 1,
    });
  });

  it('returns stable patient and visit errors for execution detail', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    patientsService.findPatientById.mockResolvedValueOnce(null);

    await expectHttpExceptionCode(
      service.getVisitExecutionDetail(patientId, visitId),
      404,
      'PATIENT_NOT_FOUND',
    );

    patientsService.findPatientById.mockResolvedValueOnce(
      createPatientSummary(patientId),
    );
    assessmentVisitModel.findOne.mockReturnValueOnce(createExecQuery(null));
    await expectHttpExceptionCode(
      service.getVisitExecutionDetail(patientId, visitId),
      404,
      'VISIT_NOT_FOUND',
    );
  });

  it('returns null when item response is not found', async () => {
    const scaleInstanceId = new Types.ObjectId();
    itemResponseModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findItemResponseByScaleInstanceAndItemCode(
        scaleInstanceId,
        ' MMSE.Attention.Serial_Sevens.Step_1 ',
      ),
    ).resolves.toBeNull();
    expect(itemResponseModel.findOne).toHaveBeenCalledWith({
      scaleInstanceId,
      itemCode: 'mmse.attention.serial_sevens.step_1',
    });
  });

  it('maps item response results instead of returning raw documents', async () => {
    const itemResponseId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const scoredBy = new Types.ObjectId();
    const startedAt = new Date('2026-01-05T08:00:00.000Z');
    const completedAt = new Date('2026-01-05T08:02:00.000Z');
    const scoredAt = new Date('2026-01-05T08:03:00.000Z');
    const rawItemResponse = {
      _id: itemResponseId,
      assessmentVisitId: visitId,
      scaleInstanceId,
      patientId,
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      itemCode: 'mmse.attention.serial_sevens.step_1',
      crfCode: 'N1.1.5.1',
      groupCode: 'attention',
      itemTitle: 'Serial sevens step 1',
      itemOrder: 5,
      responseType: 'multi_step_calculation',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['attention'],
      itemConfigSnapshot: { promptCode: 'serial-sevens' },
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      status: 'scored',
      answerSource: 'clinician_recorded',
      draftRevision: 5,
      draftSavedAt: startedAt,
      rawResponse: { spokenAnswer: '94, 86' },
      structuredResponse: { calculationSteps: ['94', '86'] },
      responseText: '94, 86',
      responseSummary: 'Serial sevens partially correct',
      isMissing: false,
      missingReason: undefined,
      score: {
        scoreValue: 1,
        maxScore: 2,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        scoredAt,
        scoredBy,
        scoringNote: 'Step scores recorded independently.',
      },
      stepResults: [
        {
          stepCode: 'step_1',
          crfCode: 'N1.1.5.1',
          label: '100 - 7',
          order: 1,
          expectedValue: 93,
          actualValue: 94,
          isCorrect: false,
          scoreValue: 0,
          countsTowardItemScore: true,
          note: 'Incorrect first subtraction.',
        },
        {
          stepCode: 'step_2',
          crfCode: 'N1.1.5.2',
          label: '93 - 7',
          order: 2,
          expectedValue: 86,
          actualValue: 86,
          isCorrect: true,
          scoreValue: 1,
          countsTowardItemScore: true,
          note: 'Scored independently from previous step.',
        },
      ],
      promptResponses: [
        {
          promptType: 'semantic_category',
          promptText: 'Category cue',
          responseAfterPrompt: { recalledWord: 'face' },
          isCorrect: true,
          countsTowardScore: false,
          order: 1,
          note: 'Cue response retained but not counted.',
        },
      ],
      timing: {
        startedAt,
        completedAt,
        durationMs: 120000,
        timerSource: 'manual',
      },
      evidenceRefs: [
        {
          evidenceType: 'handwriting',
          mediaEvidenceId: null,
          status: 'pending',
          note: 'Reserved for future media evidence.',
        },
      ],
      operatorNote: 'De-identified operator note',
      qualityControlHints: { needsReview: true },
      submissionWriteBarrier: null,
      metadata: { source: 'unit-test' },
      lockedAt: null,
      voidedAt: null,
      internalMarker: 'not returned',
    };
    itemResponseModel.findOne.mockReturnValue(createExecQuery(rawItemResponse));

    const result = await service.findItemResponseByScaleInstanceAndItemCode(
      scaleInstanceId,
      ' MMSE.Attention.Serial_Sevens.Step_1 ',
    );

    expect(result).toEqual({
      id: itemResponseId.toString(),
      assessmentVisitId: visitId.toString(),
      scaleInstanceId: scaleInstanceId.toString(),
      patientId: patientId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      scaleDefinitionId: definitionId.toString(),
      scaleVersionId: versionId.toString(),
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'INST-TEST-001',
      itemCode: 'mmse.attention.serial_sevens.step_1',
      crfCode: 'N1.1.5.1',
      groupCode: 'attention',
      itemTitle: 'Serial sevens step 1',
      itemOrder: 5,
      responseType: 'multi_step_calculation',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['attention'],
      itemConfigSnapshot: { promptCode: 'serial-sevens' },
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        sourceDocument: 'source-test',
      },
      status: 'scored',
      answerSource: 'clinician_recorded',
      draftRevision: 5,
      draftSavedAt: startedAt,
      rawResponse: { spokenAnswer: '94, 86' },
      structuredResponse: { calculationSteps: ['94', '86'] },
      responseText: '94, 86',
      responseSummary: 'Serial sevens partially correct',
      isMissing: false,
      missingReason: undefined,
      score: {
        scoreValue: 1,
        maxScore: 2,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        scoredAt,
        scoredBy: scoredBy.toString(),
        scoringNote: 'Step scores recorded independently.',
      },
      stepResults: [
        {
          stepCode: 'step_1',
          crfCode: 'N1.1.5.1',
          label: '100 - 7',
          order: 1,
          expectedValue: 93,
          actualValue: 94,
          isCorrect: false,
          scoreValue: 0,
          countsTowardItemScore: true,
          note: 'Incorrect first subtraction.',
        },
        {
          stepCode: 'step_2',
          crfCode: 'N1.1.5.2',
          label: '93 - 7',
          order: 2,
          expectedValue: 86,
          actualValue: 86,
          isCorrect: true,
          scoreValue: 1,
          countsTowardItemScore: true,
          note: 'Scored independently from previous step.',
        },
      ],
      promptResponses: [
        {
          promptType: 'semantic_category',
          promptText: 'Category cue',
          responseAfterPrompt: { recalledWord: 'face' },
          isCorrect: true,
          countsTowardScore: false,
          order: 1,
          note: 'Cue response retained but not counted.',
        },
      ],
      timing: {
        timerState: 'completed',
        startedAt,
        lastResumedAt: null,
        completedAt,
        durationMs: 120000,
        timerSource: 'manual',
      },
      evidenceRefs: [
        {
          evidenceType: 'handwriting',
          mediaEvidenceId: null,
          status: 'pending',
          note: 'Reserved for future media evidence.',
        },
      ],
      operatorNote: 'De-identified operator note',
      qualityControlHints: { needsReview: true },
      submissionWriteBarrier: null,
      metadata: { source: 'unit-test' },
      lockedAt: null,
      voidedAt: null,
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(itemResponseModel.findOne).toHaveBeenCalledWith({
      scaleInstanceId,
      itemCode: 'mmse.attention.serial_sevens.step_1',
    });
  });

  it('lists item responses by scale instance id ordered by item order', async () => {
    const itemResponseId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        {
          _id: itemResponseId,
          assessmentVisitId: visitId,
          scaleInstanceId,
          patientId,
          subjectCode: 'SUBJ-TEST-002',
          scaleDefinitionId: definitionId,
          scaleVersionId: versionId,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          instanceCode: 'INST-TEST-002',
          itemCode: 'moca.memory.immediate.trial_1.face',
          itemOrder: 3,
          responseType: 'text',
          countsTowardTotal: false,
          cognitiveDomainCodes: ['memory'],
          itemConfigSnapshot: null,
          versionTrace: null,
          status: 'answered',
          answerSource: 'supervised_patient_input',
          rawResponse: 'face',
          structuredResponse: { wordCode: 'face', recalled: true },
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
          internalMarker: 'not returned',
        },
      ]),
    );
    itemResponseModel.find.mockReturnValue({ sort });

    const result =
      await service.listItemResponsesByScaleInstanceId(scaleInstanceId);

    expect(itemResponseModel.find).toHaveBeenCalledWith({ scaleInstanceId });
    expect(sort).toHaveBeenCalledWith({ itemOrder: 1 });
    expect(result).toEqual([
      expect.objectContaining({
        id: itemResponseId.toString(),
        scaleInstanceId: scaleInstanceId.toString(),
        itemCode: 'moca.memory.immediate.trial_1.face',
        countsTowardTotal: false,
        score: null,
      }),
    ]);
    expect(result[0]).not.toHaveProperty('internalMarker');
  });

  it('lists scored item responses by scale instance id with scored filter', async () => {
    const scaleInstanceId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(createExecQuery([]));
    itemResponseModel.find.mockReturnValue({ sort });

    const result =
      await service.listScoredItemResponsesByScaleInstanceId(scaleInstanceId);

    expect(itemResponseModel.find).toHaveBeenCalledWith({
      scaleInstanceId,
      $or: [
        { status: 'scored' },
        {
          'score.scoreStatus': {
            $exists: true,
            $ne: 'not_scored',
          },
        },
      ],
    });
    expect(sort).toHaveBeenCalledWith({ itemOrder: 1 });
    expect(result).toEqual([]);
  });

  it('lists item responses by visit id ordered by scale instance and item order', async () => {
    const visitId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(createExecQuery([]));
    itemResponseModel.find.mockReturnValue({ sort });

    const result = await service.listItemResponsesByVisitId(visitId);

    expect(itemResponseModel.find).toHaveBeenCalledWith({
      assessmentVisitId: visitId,
    });
    expect(sort).toHaveBeenCalledWith({ scaleInstanceId: 1, itemOrder: 1 });
    expect(result).toEqual([]);
  });

  it('atomically attaches an evidence reference only from pending or missing', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const itemResponseId = new Types.ObjectId();
    const mediaEvidenceId = new Types.ObjectId();
    itemResponseModel.findOneAndUpdate.mockReturnValue(createExecQuery(null));

    await expect(
      service.attachItemEvidenceReference(
        patientId,
        visitId,
        scaleInstanceId,
        itemResponseId,
        'photo',
        mediaEvidenceId,
      ),
    ).resolves.toBeNull();

    expect(itemResponseModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: itemResponseId,
        assessmentVisitId: visitId,
        scaleInstanceId,
        patientId,
        status: { $in: ['not_started', 'in_progress', 'answered'] },
        lockedAt: null,
        $or: [
          { submissionWriteBarrier: null },
          { submissionWriteBarrier: { $exists: false } },
        ],
        evidenceRefs: {
          $elemMatch: {
            evidenceType: 'photo',
            mediaEvidenceId: null,
            status: { $in: ['pending', 'missing'] },
          },
        },
      },
      {
        $set: {
          'evidenceRefs.$[evidenceRef].mediaEvidenceId': mediaEvidenceId,
          'evidenceRefs.$[evidenceRef].status': 'attached',
        },
      },
      {
        arrayFilters: [
          {
            'evidenceRef.evidenceType': 'photo',
            'evidenceRef.mediaEvidenceId': null,
            'evidenceRef.status': { $in: ['pending', 'missing'] },
          },
        ],
        returnDocument: 'after',
        runValidators: true,
      },
    );
  });

  it('atomically clears only the matching attached media reference', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const itemResponseId = new Types.ObjectId();
    const mediaEvidenceId = new Types.ObjectId();
    itemResponseModel.findOneAndUpdate.mockReturnValue(createExecQuery(null));

    await service.clearItemEvidenceReference(
      patientId,
      visitId,
      scaleInstanceId,
      itemResponseId,
      'handwriting',
      mediaEvidenceId,
    );

    expect(itemResponseModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: itemResponseId,
        assessmentVisitId: visitId,
        scaleInstanceId,
        patientId,
        status: { $in: ['not_started', 'in_progress', 'answered'] },
        lockedAt: null,
        $or: [
          { submissionWriteBarrier: null },
          { submissionWriteBarrier: { $exists: false } },
        ],
        evidenceRefs: {
          $elemMatch: {
            evidenceType: 'handwriting',
            mediaEvidenceId,
            status: 'attached',
          },
        },
      },
      {
        $set: {
          'evidenceRefs.$[evidenceRef].mediaEvidenceId': null,
          'evidenceRefs.$[evidenceRef].status': 'pending',
        },
      },
      expect.objectContaining({
        arrayFilters: [
          {
            'evidenceRef.evidenceType': 'handwriting',
            'evidenceRef.mediaEvidenceId': mediaEvidenceId,
            'evidenceRef.status': 'attached',
          },
        ],
      }),
    );
  });

  it('restores only an empty pending reference during void compensation', async () => {
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const itemResponseId = new Types.ObjectId();
    const mediaEvidenceId = new Types.ObjectId();
    itemResponseModel.findOneAndUpdate.mockReturnValue(createExecQuery(null));

    await service.restoreItemEvidenceReference(
      patientId,
      visitId,
      scaleInstanceId,
      itemResponseId,
      'photo',
      mediaEvidenceId,
    );

    expect(itemResponseModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: itemResponseId,
        assessmentVisitId: visitId,
        scaleInstanceId,
        patientId,
        lockedAt: null,
        evidenceRefs: {
          $elemMatch: {
            evidenceType: 'photo',
            mediaEvidenceId: null,
            status: 'pending',
          },
        },
      },
      {
        $set: {
          'evidenceRefs.$[evidenceRef].mediaEvidenceId': mediaEvidenceId,
          'evidenceRefs.$[evidenceRef].status': 'attached',
        },
      },
      expect.objectContaining({
        arrayFilters: [
          {
            'evidenceRef.evidenceType': 'photo',
            'evidenceRef.mediaEvidenceId': null,
            'evidenceRef.status': 'pending',
          },
        ],
      }),
    );
  });

  it('safely reads only controlled submission audit fields', () => {
    const submittedAt = new Date('2026-07-11T08:00:00.000Z');
    const submittedBy = new Types.ObjectId();
    expect(
      service.readScaleInstanceSubmissionAudit({
        id: new Types.ObjectId().toString(),
        assessmentVisitId: new Types.ObjectId().toString(),
        patientId: new Types.ObjectId().toString(),
        subjectCode: 'SUBJ-A16-TEST-001',
        scaleDefinitionId: new Types.ObjectId().toString(),
        scaleVersionId: new Types.ObjectId().toString(),
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        instanceCode: 'INST-A16-TEST-001',
        instanceNo: 1,
        status: 'completed',
        administrationMode: 'clinician_administered',
        versionTrace: null,
        startedAt: null,
        completedAt: submittedAt,
        lockedAt: null,
        voidedAt: null,
        durationMs: null,
        operatorSnapshot: null,
        progress: null,
        qualityControlSummary: null,
        metadata: {
          initializedFromSeed: true,
          submission: {
            submissionId: 'submission-a16-test',
            submittedAt,
            submittedBy,
            submittedByName: 'Test Operator',
            submittedByRole: 'nurse',
            ignored: { rawResponse: 'must not be exposed' },
          },
        },
      }),
    ).toEqual({
      submissionId: 'submission-a16-test',
      submittedAt,
      submittedBy: submittedBy.toString(),
      submittedByName: 'Test Operator',
      submittedByRole: 'nurse',
    });
  });
});
