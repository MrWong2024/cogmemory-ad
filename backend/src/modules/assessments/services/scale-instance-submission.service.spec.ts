import { HttpException } from '@nestjs/common';
import { PatientsService } from '../../patients/services/patients.service';
import { ScalesService } from '../../scales/services/scales.service';
import type {
  CompleteScaleInstanceInput,
  ItemResponseSummary,
  ScaleInstanceSummary,
} from './assessments.service';
import { AssessmentsService } from './assessments.service';
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
    metadata: { initializedFromSeed: true },
    ...overrides,
  };
}

function createItem(
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
    itemTitle: 'Safe item',
    itemOrder: 1,
    responseType: 'text',
    countsTowardTotal: true,
    cognitiveDomainCodes: [],
    itemConfigSnapshot: null,
    versionTrace: null,
    status: 'answered',
    answerSource: 'clinician_recorded',
    rawResponse: 0,
    structuredResponse: null,
    isMissing: false,
    score: null,
    stepResults: [],
    promptResponses: [],
    timing: {
      startedAt: new Date('2026-07-10T06:00:00.000Z'),
      completedAt: null,
      durationMs: null,
      timerSource: 'manual',
    },
    evidenceRefs: [],
    operatorNote: 'safe note',
    qualityControlHints: null,
    metadata: null,
    lockedAt: null,
    voidedAt: null,
    ...overrides,
  };
}

describe('ScaleInstanceSubmissionService', () => {
  const patientId = '507f1f77bcf86cd799439011';
  const visitId = '507f1f77bcf86cd799439012';
  const instanceId = '507f1f77bcf86cd799439013';
  let patientsService: { findPatientById: jest.Mock };
  let assessmentsService: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
    listItemResponsesByScaleInstanceId: jest.Mock;
    toPublicScaleInstanceResponse: jest.Mock<
      { id: string; status: string; progress: unknown },
      [ScaleInstanceSummary, unknown]
    >;
    completeScaleInstanceIfEditable: jest.Mock<
      Promise<ScaleInstanceSummary | null>,
      [string, string, string, CompleteScaleInstanceInput]
    >;
    readScaleInstanceSubmissionAudit: jest.Mock;
  };
  let scalesService: {
    findDefinitionByCode: jest.Mock;
    findVersionByScaleCodeAndVersion: jest.Mock;
  };
  let service: ScaleInstanceSubmissionService;

  beforeEach(() => {
    patientsService = { findPatientById: jest.fn() };
    assessmentsService = {
      findVisitByPatientAndId: jest.fn(),
      findScaleInstanceByPatientVisitAndId: jest.fn(),
      listItemResponsesByScaleInstanceId: jest.fn(),
      toPublicScaleInstanceResponse: jest.fn(
        (instance: ScaleInstanceSummary, progress: unknown) => ({
          id: instance.id,
          status: instance.status,
          progress,
        }),
      ),
      completeScaleInstanceIfEditable: jest.fn<
        Promise<ScaleInstanceSummary | null>,
        [string, string, string, CompleteScaleInstanceInput]
      >(),
      readScaleInstanceSubmissionAudit: jest.fn(),
    };
    scalesService = {
      findDefinitionByCode: jest.fn(),
      findVersionByScaleCodeAndVersion: jest.fn(),
    };
    service = new ScaleInstanceSubmissionService(
      patientsService as PatientsService,
      assessmentsService as AssessmentsService,
      scalesService as ScalesService,
    );

    patientsService.findPatientById.mockResolvedValue({
      id: patientId,
      status: 'active',
    });
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      id: visitId,
      status: 'draft',
    });
    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValue(
      createInstance(),
    );
    assessmentsService.listItemResponsesByScaleInstanceId.mockResolvedValue([
      createItem(),
    ]);
    scalesService.findDefinitionByCode.mockResolvedValue({
      id: '507f1f77bcf86cd799439014',
      code: 'scale',
    });
    scalesService.findVersionByScaleCodeAndVersion.mockResolvedValue({
      id: '507f1f77bcf86cd799439015',
      scaleDefinitionId: '507f1f77bcf86cd799439014',
      scaleCode: 'scale',
      version: '1.0',
      items: [
        {
          code: 'scale.item.1',
          title: 'Safe item',
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
        },
      ],
    });
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

  it('validates ownership and configuration without leaking cross-chain resources', async () => {
    patientsService.findPatientById.mockResolvedValueOnce(null);
    await expectCode(
      service.getSubmissionReadiness(patientId, visitId, instanceId),
      404,
      'PATIENT_NOT_FOUND',
    );

    scalesService.findVersionByScaleCodeAndVersion.mockResolvedValueOnce(null);
    await expectCode(
      service.getSubmissionReadiness(patientId, visitId, instanceId),
      409,
      'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
    );
  });

  it('returns safe readiness and blocks incomplete submission', async () => {
    assessmentsService.listItemResponsesByScaleInstanceId.mockResolvedValue([
      createItem({ status: 'in_progress', rawResponse: null }),
    ]);
    const readiness = await service.getSubmissionReadiness(
      patientId,
      visitId,
      instanceId,
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.blockingIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'ITEM_NOT_COMPLETED',
        'ITEM_ANSWER_CONTENT_MISSING',
      ]),
    );

    await expectCode(
      service.submitScaleInstance(
        patientId,
        visitId,
        instanceId,
        {
          id: '507f1f77bcf86cd799439019',
          accountName: 'doctor-a16-test',
          displayName: 'Test Operator',
          roles: ['doctor'],
          permissions: [],
        },
        { confirm: true },
      ),
      409,
      'SCALE_INSTANCE_NOT_READY',
    );
  });

  it('performs a second readiness read and atomically completes with derived timing', async () => {
    const completed = createInstance({
      status: 'completed',
      startedAt: new Date('2026-07-10T06:00:00.000Z'),
      completedAt: new Date(),
      durationMs: 1000,
    });
    assessmentsService.completeScaleInstanceIfEditable.mockResolvedValue(
      completed,
    );

    const response = await service.submitScaleInstance(
      patientId,
      visitId,
      instanceId,
      {
        id: '507f1f77bcf86cd799439019',
        accountName: 'operator-a16-test',
        displayName: 'Test Operator',
        roles: ['admin', 'nurse', 'doctor'],
        permissions: [],
      },
      { confirm: true },
    );

    expect(
      assessmentsService.listItemResponsesByScaleInstanceId,
    ).toHaveBeenCalledTimes(2);
    expect(
      assessmentsService.completeScaleInstanceIfEditable,
    ).toHaveBeenCalledWith(
      patientId,
      visitId,
      instanceId,
      expect.objectContaining({
        startedAtToSet: new Date('2026-07-10T06:00:00.000Z'),
        submittedByRole: 'doctor',
      }),
    );
    const completionInput =
      assessmentsService.completeScaleInstanceIfEditable.mock.calls[0][3];
    expect(completionInput.readinessSummary.blockingIssueCount).toBe(0);
    expect(completionInput.readinessSummary.completedItemCount).toBe(1);
    expect(response.submission.alreadySubmitted).toBe(false);
    expect(response.submission.durationSource).toBe('earliest_item_timing');
    expect(response.readiness.submissionState).toBe('completed');
  });

  it('returns completed instances idempotently without rewriting audit or timing', async () => {
    const completedAt = new Date('2026-07-11T07:00:00.000Z');
    const completed = createInstance({
      status: 'completed',
      completedAt,
      startedAt: new Date('2026-07-10T06:00:00.000Z'),
      durationMs: 3600000,
    });
    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValue(
      completed,
    );
    assessmentsService.readScaleInstanceSubmissionAudit.mockReturnValue({
      submissionId: 'submission-a16-existing',
      submittedAt: completedAt,
      submittedBy: '507f1f77bcf86cd799439019',
      submittedByName: 'Test Operator',
      submittedByRole: 'doctor',
    });

    const response = await service.submitScaleInstance(
      patientId,
      visitId,
      instanceId,
      {
        id: '507f1f77bcf86cd799439019',
        accountName: 'doctor-a16-test',
        displayName: 'Test Operator',
        roles: ['doctor'],
        permissions: [],
      },
      { confirm: true },
    );

    expect(response.submission).toEqual(
      expect.objectContaining({
        submissionId: 'submission-a16-existing',
        submittedAt: completedAt,
        alreadySubmitted: true,
      }),
    );
    expect(
      assessmentsService.completeScaleInstanceIfEditable,
    ).not.toHaveBeenCalled();
  });

  it('enforces patient, visit, locked and voided first-submission states', async () => {
    patientsService.findPatientById.mockResolvedValue({
      id: patientId,
      status: 'inactive',
    });
    await expectCode(
      service.submitScaleInstance(
        patientId,
        visitId,
        instanceId,
        {
          id: '507f1f77bcf86cd799439019',
          accountName: 'doctor-a16-test',
          displayName: 'Test Operator',
          roles: ['doctor'],
          permissions: [],
        },
        { confirm: true },
      ),
      409,
      'PATIENT_NOT_ACTIVE',
    );

    patientsService.findPatientById.mockResolvedValue({
      id: patientId,
      status: 'active',
    });
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      id: visitId,
      status: 'completed',
    });
    await expectCode(
      service.submitScaleInstance(
        patientId,
        visitId,
        instanceId,
        {
          id: '507f1f77bcf86cd799439019',
          accountName: 'doctor-a16-test',
          displayName: 'Test Operator',
          roles: ['doctor'],
          permissions: [],
        },
        { confirm: true },
      ),
      409,
      'VISIT_NOT_EDITABLE',
    );
  });
});
