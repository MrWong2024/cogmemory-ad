import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PatientsService } from '../../patients/services/patients.service';
import { ScalesService } from '../../scales/services/scales.service';
import type {
  ItemResponseSummary,
  ScaleInstanceSummary,
} from './assessments.service';
import { AssessmentsService } from './assessments.service';
import { ScaleInstanceSubmissionBarrierService } from './scale-instance-submission-barrier.service';
import { ScaleInstanceSubmissionService } from './scale-instance-submission.service';

async function expectCode(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error: unknown) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(HttpException);
  if (!(caught instanceof HttpException)) {
    throw caught;
  }
  expect(caught.getStatus()).toBe(status);
  expect(caught.getResponse()).toEqual(expect.objectContaining({ code }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }
  return value;
}

function readMockCallArgument(
  mock: jest.Mock,
  argumentIndex: number,
  callIndex = 0,
): unknown {
  const calls: unknown = mock.mock.calls;
  if (!Array.isArray(calls) || !Array.isArray(calls[callIndex])) {
    throw new Error(`Expected mock call ${callIndex + 1}`);
  }
  return calls[callIndex][argumentIndex] as unknown;
}

function createInstance(
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
    startedAt: null,
    completedAt: null,
    lockedAt: null,
    voidedAt: null,
    durationMs: null,
    operatorSnapshot: null,
    progress: null,
    qualityControlSummary: null,
    submissionWriteBarrier: null,
    metadata: { initializedFromSeed: true },
    ...overrides,
  };
}

function createItem(
  id = '507f1f77bcf86cd799439016',
  overrides: Partial<ItemResponseSummary> = {},
): ItemResponseSummary {
  return {
    id,
    assessmentVisitId: '507f1f77bcf86cd799439012',
    scaleInstanceId: '507f1f77bcf86cd799439013',
    patientId: '507f1f77bcf86cd799439011',
    subjectCode: 'SUBJ-A16-TEST-001',
    scaleDefinitionId: '507f1f77bcf86cd799439014',
    scaleVersionId: '507f1f77bcf86cd799439015',
    scaleCode: 'scale',
    scaleVersion: '1.0',
    instanceCode: 'INST-A16-TEST-001',
    itemCode: `scale.item.${id.endsWith('16') ? '1' : '2'}`,
    itemTitle: 'Safe item',
    itemOrder: id.endsWith('16') ? 1 : 2,
    responseType: 'text',
    countsTowardTotal: true,
    cognitiveDomainCodes: [],
    itemConfigSnapshot: null,
    versionTrace: null,
    status: 'answered',
    answerSource: 'clinician_recorded',
    draftRevision: 0,
    draftSavedAt: null,
    rawResponse: 0,
    structuredResponse: null,
    isMissing: false,
    score: null,
    stepResults: [],
    promptResponses: [],
    timing: {
      timerState: 'completed',
      startedAt: new Date('2026-07-10T06:00:00.000Z'),
      lastResumedAt: null,
      completedAt: null,
      durationMs: null,
      timerSource: 'manual',
    },
    evidenceRefs: [],
    operatorNote: 'safe note',
    qualityControlHints: null,
    submissionWriteBarrier: null,
    metadata: null,
    lockedAt: null,
    voidedAt: null,
    ...overrides,
  };
}

type BarrierInput = {
  barrierId: string;
  startedAt: Date;
  startedBy: string;
  startedByName: string;
  startedByRole: string;
  itemResponseIds: string[];
};

describe('ScaleInstanceSubmissionService', () => {
  const patientId = '507f1f77bcf86cd799439011';
  const visitId = '507f1f77bcf86cd799439012';
  const instanceId = '507f1f77bcf86cd799439013';
  const operator = {
    id: '507f1f77bcf86cd799439019',
    accountName: 'operator-a16-test',
    displayName: 'First Operator',
    roles: ['doctor'],
    permissions: [],
  };
  let currentInstance: ScaleInstanceSummary;
  let currentItems: ItemResponseSummary[];
  let audit: {
    submissionId: string;
    submittedAt: Date;
    submittedBy: string;
    submittedByName: string;
    submittedByRole: 'doctor';
  } | null;
  let patientsService: { findPatientById: jest.Mock };
  let assessmentsService: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
    hasCompletedPatientAdministrationSessionForScaleInstance: jest.Mock;
    listItemResponsesByScaleInstanceId: jest.Mock;
    toPublicScaleInstanceResponse: jest.Mock;
    readScaleInstanceSubmissionAudit: jest.Mock;
  };
  let scalesService: {
    findDefinitionByCode: jest.Mock;
    findVersionByScaleCodeAndVersion: jest.Mock;
  };
  let barrierService: {
    createParentBarrierIfOpen: jest.Mock;
    fenceItemResponses: jest.Mock;
    markParentFenced: jest.Mock;
    claimRelease: jest.Mock;
    releaseItemResponses: jest.Mock;
    clearParentBarrier: jest.Mock;
    completeScaleInstance: jest.Mock;
  };
  let service: ScaleInstanceSubmissionService;

  function parentBarrier(
    input: BarrierInput,
    state: 'fencing' | 'fenced' | 'releasing' | 'completed',
  ): Record<string, unknown> {
    return {
      version: 1,
      barrierId: input.barrierId,
      state,
      startedAt: input.startedAt,
      fencedAt: state === 'fencing' ? null : new Date(),
      releaseStartedAt: state === 'releasing' ? new Date() : null,
      completedAt: state === 'completed' ? new Date() : null,
      startedBy: input.startedBy,
      startedByName: input.startedByName,
      startedByRole: input.startedByRole,
      itemResponseIds: input.itemResponseIds,
      expectedItemCount: input.itemResponseIds.length,
    };
  }

  function childBarrier(input: BarrierInput): Record<string, unknown> {
    return {
      version: 1,
      barrierId: input.barrierId,
      startedAt: input.startedAt,
    };
  }

  beforeEach(async () => {
    currentInstance = createInstance();
    currentItems = [createItem()];
    audit = null;
    patientsService = { findPatientById: jest.fn() };
    assessmentsService = {
      findVisitByPatientAndId: jest.fn(),
      findScaleInstanceByPatientVisitAndId: jest.fn(() =>
        Promise.resolve(currentInstance),
      ),
      hasCompletedPatientAdministrationSessionForScaleInstance: jest
        .fn()
        .mockResolvedValue(true),
      listItemResponsesByScaleInstanceId: jest.fn(() =>
        Promise.resolve(currentItems),
      ),
      toPublicScaleInstanceResponse: jest.fn(
        (instance: ScaleInstanceSummary, progress: unknown) => ({
          id: instance.id,
          status: instance.status,
          progress,
        }),
      ),
      readScaleInstanceSubmissionAudit: jest.fn(() => audit),
    };
    scalesService = {
      findDefinitionByCode: jest.fn(),
      findVersionByScaleCodeAndVersion: jest.fn(),
    };
    barrierService = {
      createParentBarrierIfOpen: jest.fn((input: BarrierInput) => {
        if (currentInstance.submissionWriteBarrier !== null) {
          return Promise.resolve(false);
        }
        currentInstance = {
          ...currentInstance,
          submissionWriteBarrier: parentBarrier(input, 'fencing'),
        };
        return Promise.resolve(true);
      }),
      fenceItemResponses: jest.fn((_a, _b, _c, input: BarrierInput) => {
        currentItems = currentItems.map((item) => ({
          ...item,
          submissionWriteBarrier: childBarrier(input),
        }));
        return Promise.resolve();
      }),
      markParentFenced: jest.fn((_a, _b, _c, input: BarrierInput) => {
        currentInstance = {
          ...currentInstance,
          submissionWriteBarrier: parentBarrier(input, 'fenced'),
        };
        return Promise.resolve(true);
      }),
      claimRelease: jest.fn((_a, _b, _c, barrierId: string) => {
        const input = currentInstance.submissionWriteBarrier as BarrierInput;
        if (input.barrierId !== barrierId) {
          return Promise.resolve(false);
        }
        currentInstance = {
          ...currentInstance,
          submissionWriteBarrier: parentBarrier(input, 'releasing'),
        };
        return Promise.resolve(true);
      }),
      releaseItemResponses: jest.fn((_a, _b, _c, input: BarrierInput) => {
        currentItems = currentItems.map((item) => ({
          ...item,
          submissionWriteBarrier: null,
        }));
        return Promise.resolve(input.itemResponseIds.length);
      }),
      clearParentBarrier: jest.fn(() => {
        currentInstance = {
          ...currentInstance,
          submissionWriteBarrier: null,
        };
        return Promise.resolve(true);
      }),
      completeScaleInstance: jest.fn(
        (input: {
          barrier: BarrierInput;
          completionTime: Date;
          startedAtToSet?: Date;
          durationMs: number | null;
        }) => {
          if (currentInstance.status === 'completed') {
            return Promise.resolve(false);
          }
          audit = {
            submissionId: input.barrier.barrierId,
            submittedAt: input.completionTime,
            submittedBy: input.barrier.startedBy,
            submittedByName: input.barrier.startedByName,
            submittedByRole: 'doctor',
          };
          currentInstance = {
            ...currentInstance,
            status: 'completed',
            startedAt:
              currentInstance.startedAt ?? input.startedAtToSet ?? null,
            completedAt: input.completionTime,
            durationMs: input.durationMs,
            submissionWriteBarrier: parentBarrier(input.barrier, 'completed'),
          };
          return Promise.resolve(true);
        },
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScaleInstanceSubmissionService,
        { provide: PatientsService, useValue: patientsService },
        { provide: AssessmentsService, useValue: assessmentsService },
        { provide: ScalesService, useValue: scalesService },
        {
          provide: ScaleInstanceSubmissionBarrierService,
          useValue: barrierService,
        },
      ],
    }).compile();
    service = moduleRef.get(ScaleInstanceSubmissionService);

    patientsService.findPatientById.mockResolvedValue({
      id: patientId,
      status: 'active',
    });
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      id: visitId,
      status: 'draft',
    });
    scalesService.findDefinitionByCode.mockResolvedValue({
      id: '507f1f77bcf86cd799439014',
      code: 'scale',
    });
    scalesService.findVersionByScaleCodeAndVersion.mockImplementation(() =>
      Promise.resolve({
        id: '507f1f77bcf86cd799439015',
        scaleDefinitionId: '507f1f77bcf86cd799439014',
        scaleCode: 'scale',
        version: '1.0',
        items: currentItems.map((item) => ({
          code: item.itemCode,
          title: item.itemTitle,
          order: item.itemOrder,
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
        })),
      }),
    );
  });

  it('requires explicit confirmation and an authenticated user', async () => {
    await expectCode(
      service.submitScaleInstance(patientId, visitId, instanceId, undefined, {
        confirm: false,
      }),
      400,
      'SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED',
    );
    await expect(
      service.submitScaleInstance(patientId, visitId, instanceId, undefined, {
        confirm: true,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('blocks incomplete submission before creating a parent barrier', async () => {
    currentItems = [
      createItem('507f1f77bcf86cd799439016', {
        status: 'in_progress',
        rawResponse: null,
      }),
    ];

    await expectCode(
      service.submitScaleInstance(patientId, visitId, instanceId, operator, {
        confirm: true,
      }),
      409,
      'SCALE_INSTANCE_NOT_READY',
    );
    expect(barrierService.createParentBarrierIfOpen).not.toHaveBeenCalled();
  });

  it('loads the completed patient administration fact for supervised readiness', async () => {
    currentInstance = createInstance({
      administrationMode: 'supervised_patient_input',
    });
    assessmentsService.hasCompletedPatientAdministrationSessionForScaleInstance.mockResolvedValueOnce(
      false,
    );

    const response = await service.getSubmissionReadiness(
      patientId,
      visitId,
      instanceId,
    );

    expect(
      assessmentsService.hasCompletedPatientAdministrationSessionForScaleInstance,
    ).toHaveBeenCalledWith(instanceId);
    expect(response.ready).toBe(false);
    expect(response.canSubmitNow).toBe(false);
    expect(response.blockingIssues).toEqual([
      expect.objectContaining({
        code: 'SCALE_INSTANCE_PATIENT_ADMINISTRATION_INCOMPLETE',
        scope: 'scale_instance',
      }),
    ]);
  });

  it('reuses readiness to block direct supervised submission before creating a barrier', async () => {
    currentInstance = createInstance({
      administrationMode: 'supervised_patient_input',
    });
    assessmentsService.hasCompletedPatientAdministrationSessionForScaleInstance.mockResolvedValue(
      false,
    );

    await expectCode(
      service.submitScaleInstance(patientId, visitId, instanceId, operator, {
        confirm: true,
      }),
      409,
      'SCALE_INSTANCE_NOT_READY',
    );
    expect(barrierService.createParentBarrierIfOpen).not.toHaveBeenCalled();
  });

  it('does not query patient administration for clinician readiness', async () => {
    const response = await service.getSubmissionReadiness(
      patientId,
      visitId,
      instanceId,
    );

    expect(response.ready).toBe(true);
    expect(
      assessmentsService.hasCompletedPatientAdministrationSessionForScaleInstance,
    ).not.toHaveBeenCalled();
  });

  it('reuses the first token and actor across fencing and completion', async () => {
    const response = await service.submitScaleInstance(
      patientId,
      visitId,
      instanceId,
      operator,
      { confirm: true },
    );

    const created = requireRecord(
      readMockCallArgument(barrierService.createParentBarrierIfOpen, 0),
      'created barrier input',
    );
    expect(created.startedBy).toBe(operator.id);
    expect(created.startedByName).toBe(operator.displayName);
    expect(barrierService.fenceItemResponses).toHaveBeenCalledWith(
      patientId,
      visitId,
      instanceId,
      expect.objectContaining({ barrierId: created.barrierId }),
    );
    expect(barrierService.completeScaleInstance).toHaveBeenCalledTimes(1);
    const completionInput = requireRecord(
      readMockCallArgument(barrierService.completeScaleInstance, 0),
      'completion input',
    );
    expect(
      requireRecord(completionInput.barrier, 'completion barrier').barrierId,
    ).toBe(created.barrierId);
    expect(response.submission.submissionId).toBe(created.barrierId);
    expect(response.submission.alreadySubmitted).toBe(false);
    expect(response.submission.submittedBy?.operatorId).toBe(operator.id);
    expect(response.submission.submittedBy?.operatorName).toBe(
      operator.displayName,
    );
    expect(completionInput.startedAtToSet).toEqual(
      new Date('2026-07-10T06:00:00.000Z'),
    );
    expect(response.submission.durationSource).toBe('earliest_item_timing');
  });

  it('preserves an existing instance start and uses it for submission duration', async () => {
    const existingStartedAt = new Date('2026-07-10T05:55:00.000Z');
    currentInstance = createInstance({
      status: 'in_progress',
      startedAt: existingStartedAt,
    });

    const response = await service.submitScaleInstance(
      patientId,
      visitId,
      instanceId,
      operator,
      { confirm: true },
    );
    const completionInput = requireRecord(
      readMockCallArgument(barrierService.completeScaleInstance, 0),
      'completion input',
    );

    expect(completionInput).not.toHaveProperty('startedAtToSet');
    expect(currentInstance.startedAt).toEqual(existingStartedAt);
    expect(response.submission.durationSource).toBe('existing_instance_start');
  });

  it('makes dual submits join the first barrier and preserves its audit actor', async () => {
    const secondOperator = {
      ...operator,
      id: '507f1f77bcf86cd799439020',
      accountName: 'operator-two',
      displayName: 'Second Operator',
    };
    const [first, second] = await Promise.all([
      service.submitScaleInstance(patientId, visitId, instanceId, operator, {
        confirm: true,
      }),
      service.submitScaleInstance(
        patientId,
        visitId,
        instanceId,
        secondOperator,
        { confirm: true },
      ),
    ]);

    expect(first.submission.submissionId).toBe(second.submission.submissionId);
    expect(first.submission.submittedBy?.operatorId).toBe(operator.id);
    expect(second.submission.submittedBy?.operatorId).toBe(operator.id);
    expect([
      first.submission.alreadySubmitted,
      second.submission.alreadySubmitted,
    ]).toContain(false);
  });

  it('resumes partial fencing with the same token', async () => {
    const seeded: BarrierInput = {
      barrierId: 'd6e8cc3a-5fea-47ac-a5f7-7f53fd47fa17',
      startedAt: new Date('2026-07-10T06:00:00.000Z'),
      startedBy: operator.id,
      startedByName: operator.displayName,
      startedByRole: 'doctor',
      itemResponseIds: ['507f1f77bcf86cd799439016', '507f1f77bcf86cd799439017'],
    };
    currentInstance = createInstance({
      submissionWriteBarrier: parentBarrier(seeded, 'fencing'),
    });
    currentItems = [
      createItem(seeded.itemResponseIds[0], {
        submissionWriteBarrier: childBarrier(seeded),
      }),
      createItem(seeded.itemResponseIds[1]),
    ];

    const response = await service.submitScaleInstance(
      patientId,
      visitId,
      instanceId,
      operator,
      { confirm: true },
    );

    expect(barrierService.createParentBarrierIfOpen).not.toHaveBeenCalled();
    expect(barrierService.fenceItemResponses).toHaveBeenCalledWith(
      patientId,
      visitId,
      instanceId,
      expect.objectContaining({ barrierId: seeded.barrierId }),
    );
    expect(response.submission.submissionId).toBe(seeded.barrierId);
  });

  it('finishes releasing an old token before starting a fresh attempt', async () => {
    const seeded: BarrierInput = {
      barrierId: '5d095091-784f-4eea-bb2b-a0f23796a1ca',
      startedAt: new Date('2026-07-10T06:00:00.000Z'),
      startedBy: operator.id,
      startedByName: operator.displayName,
      startedByRole: 'doctor',
      itemResponseIds: ['507f1f77bcf86cd799439016'],
    };
    currentInstance = createInstance({
      submissionWriteBarrier: parentBarrier(seeded, 'releasing'),
    });
    currentItems = [
      createItem(seeded.itemResponseIds[0], {
        submissionWriteBarrier: childBarrier(seeded),
      }),
    ];

    const response = await service.submitScaleInstance(
      patientId,
      visitId,
      instanceId,
      operator,
      { confirm: true },
    );

    expect(barrierService.releaseItemResponses).toHaveBeenCalledWith(
      patientId,
      visitId,
      instanceId,
      expect.objectContaining({ barrierId: seeded.barrierId }),
    );
    const fresh = requireRecord(
      readMockCallArgument(barrierService.createParentBarrierIfOpen, 0),
      'fresh barrier input',
    );
    expect(fresh.barrierId).not.toBe(seeded.barrierId);
    expect(response.submission.submissionId).toBe(fresh.barrierId);
  });

  it('fails closed for malformed parent barrier state', async () => {
    currentInstance = createInstance({
      submissionWriteBarrier: { version: 999, state: 'fenced' },
    });

    await expectCode(
      service.submitScaleInstance(patientId, visitId, instanceId, operator, {
        confirm: true,
      }),
      500,
      'SCALE_INSTANCE_SUBMISSION_FAILED',
    );
    expect(barrierService.fenceItemResponses).not.toHaveBeenCalled();
  });

  it('returns legacy completed instances idempotently without adding barriers', async () => {
    const completedAt = new Date('2026-07-11T07:00:00.000Z');
    currentInstance = createInstance({
      status: 'completed',
      completedAt,
      startedAt: new Date('2026-07-10T06:00:00.000Z'),
      durationMs: 3600000,
      submissionWriteBarrier: null,
    });
    audit = {
      submissionId: 'submission-a16-existing',
      submittedAt: completedAt,
      submittedBy: operator.id,
      submittedByName: operator.displayName,
      submittedByRole: 'doctor',
    };

    const response = await service.submitScaleInstance(
      patientId,
      visitId,
      instanceId,
      operator,
      { confirm: true },
    );

    expect(response.submission).toEqual(
      expect.objectContaining({
        submissionId: 'submission-a16-existing',
        alreadySubmitted: true,
      }),
    );
    expect(barrierService.createParentBarrierIfOpen).not.toHaveBeenCalled();
    expect(barrierService.completeScaleInstance).not.toHaveBeenCalled();
  });
});
