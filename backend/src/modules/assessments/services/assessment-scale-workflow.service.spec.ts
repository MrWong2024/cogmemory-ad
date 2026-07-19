import { HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { PatientsService } from '../../patients/services/patients.service';
import { ScaleCatalogService } from '../../scales/services/scale-catalog.service';
import { AssessmentExecutionService } from './assessment-execution.service';
import { AssessmentScaleWorkflowService } from './assessment-scale-workflow.service';
import { AssessmentsService } from './assessments.service';

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

describe('AssessmentScaleWorkflowService', () => {
  let service: AssessmentScaleWorkflowService;
  let patientsService: { findPatientById: jest.Mock };
  let assessmentsService: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByVisitAndScaleCode: jest.Mock;
    toPublicScaleInstanceResponse: jest.Mock;
  };
  let scaleCatalogService: {
    getAvailableScaleOption: jest.Mock;
    ensureSeedScaleVersionMaterialized: jest.Mock;
  };
  let assessmentExecutionService: {
    createScaleExecutionFromSeed: jest.Mock;
  };
  const patientId = '507f1f77bcf86cd799439011';
  const visitId = '507f1f77bcf86cd799439012';
  const operatorId = '507f1f77bcf86cd799439013';
  const operatorSnapshot = {
    operatorId,
    operatorName: 'A13 Test Operator',
    operatorRole: 'doctor' as const,
  };

  beforeEach(async () => {
    patientsService = { findPatientById: jest.fn() };
    assessmentsService = {
      findVisitByPatientAndId: jest.fn(),
      findScaleInstanceByVisitAndScaleCode: jest.fn(),
      toPublicScaleInstanceResponse: jest.fn(),
    };
    scaleCatalogService = {
      getAvailableScaleOption: jest.fn(),
      ensureSeedScaleVersionMaterialized: jest.fn(),
    };
    assessmentExecutionService = {
      createScaleExecutionFromSeed: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AssessmentScaleWorkflowService,
        { provide: PatientsService, useValue: patientsService },
        { provide: AssessmentsService, useValue: assessmentsService },
        { provide: ScaleCatalogService, useValue: scaleCatalogService },
        {
          provide: AssessmentExecutionService,
          useValue: assessmentExecutionService,
        },
      ],
    }).compile();

    service = moduleRef.get(AssessmentScaleWorkflowService);

    patientsService.findPatientById.mockResolvedValue({
      id: patientId,
      subjectCode: 'SUBJ-A13-TEST',
      status: 'active',
    });
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      id: visitId,
      patientId,
      status: 'draft',
    });
    assessmentsService.findScaleInstanceByVisitAndScaleCode.mockResolvedValue(
      null,
    );
    scaleCatalogService.getAvailableScaleOption.mockReturnValue({
      code: 'mmse',
      name: '简易精神状态评价量表',
      shortName: 'MMSE',
      version: '1.0',
      displayVersion: 'CRF 1.0',
    });
    scaleCatalogService.ensureSeedScaleVersionMaterialized.mockResolvedValue({
      scaleDefinitionId: new Types.ObjectId().toString(),
      scaleVersionId: new Types.ObjectId().toString(),
      scaleCode: 'mmse',
      version: '1.0',
      option: {
        code: 'mmse',
        name: '简易精神状态评价量表',
        shortName: 'MMSE',
        version: '1.0',
        displayVersion: 'CRF 1.0',
      },
    });
    assessmentExecutionService.createScaleExecutionFromSeed.mockResolvedValue({
      scaleInstance: { id: new Types.ObjectId().toString() },
      createdItemResponseCount: 11,
    });
    assessmentsService.toPublicScaleInstanceResponse.mockReturnValue({
      id: 'PUBLIC-INSTANCE-ID',
      scaleCode: 'mmse',
      progress: { totalItemCount: 11, answeredItemCount: 0 },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a server-owned execution with stable instance fields', async () => {
    const result = await service.initializeScaleInstance(
      patientId,
      visitId,
      {
        scaleCode: 'mmse',
        administrationMode: 'supervised_patient_input',
      },
      operatorSnapshot,
    );

    expect(
      assessmentExecutionService.createScaleExecutionFromSeed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId,
        assessmentVisitId: visitId,
        subjectCode: 'SUBJ-A13-TEST',
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        instanceCode: `INST-${visitId.toUpperCase()}-MMSE-1`,
        instanceNo: 1,
        administrationMode: 'supervised_patient_input',
        operatorSnapshot,
        startedAt: null,
        metadata: null,
      }),
    );
    expect(result).toEqual({
      scale: {
        code: 'mmse',
        name: '简易精神状态评价量表',
        shortName: 'MMSE',
        version: '1.0',
        displayVersion: 'CRF 1.0',
      },
      scaleInstance: {
        id: 'PUBLIC-INSTANCE-ID',
        scaleCode: 'mmse',
        progress: { totalItemCount: 11, answeredItemCount: 0 },
      },
      createdItemResponseCount: 11,
    });
  });

  it('requires an existing active patient before visit or catalog access', async () => {
    patientsService.findPatientById.mockResolvedValueOnce(null);
    await expectHttpExceptionCode(
      service.initializeScaleInstance(
        patientId,
        visitId,
        { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
        operatorSnapshot,
      ),
      404,
      'PATIENT_NOT_FOUND',
    );

    patientsService.findPatientById.mockResolvedValueOnce({
      id: patientId,
      subjectCode: 'SUBJ-A13-TEST',
      status: 'inactive',
    });
    await expectHttpExceptionCode(
      service.initializeScaleInstance(
        patientId,
        visitId,
        { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
        operatorSnapshot,
      ),
      409,
      'PATIENT_NOT_ACTIVE',
    );
    expect(assessmentsService.findVisitByPatientAndId).not.toHaveBeenCalled();
  });

  it('does not reveal a visit belonging to another patient', async () => {
    assessmentsService.findVisitByPatientAndId.mockResolvedValue(null);

    await expectHttpExceptionCode(
      service.initializeScaleInstance(
        patientId,
        visitId,
        { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
        operatorSnapshot,
      ),
      404,
      'VISIT_NOT_FOUND',
    );
    expect(assessmentsService.findVisitByPatientAndId).toHaveBeenCalledWith(
      patientId,
      visitId,
    );
  });

  it.each(['completed', 'locked', 'voided'])(
    'rejects a %s visit before materializing the catalog',
    async (status) => {
      assessmentsService.findVisitByPatientAndId.mockResolvedValue({
        id: visitId,
        patientId,
        status,
      });

      await expectHttpExceptionCode(
        service.initializeScaleInstance(
          patientId,
          visitId,
          { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
          operatorSnapshot,
        ),
        409,
        'VISIT_NOT_INITIALIZABLE',
      );
      expect(
        scaleCatalogService.ensureSeedScaleVersionMaterialized,
      ).not.toHaveBeenCalled();
    },
  );

  it('allows an in-progress visit', async () => {
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      id: visitId,
      patientId,
      status: 'in_progress',
    });

    await service.initializeScaleInstance(
      patientId,
      visitId,
      { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
      operatorSnapshot,
    );

    expect(
      assessmentExecutionService.createScaleExecutionFromSeed,
    ).toHaveBeenCalledTimes(1);
  });

  it('propagates safe scale catalog not-available semantics', async () => {
    scaleCatalogService.getAvailableScaleOption.mockImplementation(() => {
      throw new NotFoundException({
        code: 'SCALE_NOT_AVAILABLE',
        message: 'Scale is not available',
      });
    });

    await expectHttpExceptionCode(
      service.initializeScaleInstance(
        patientId,
        visitId,
        { scaleCode: 'unknown', administrationMode: 'clinician_administered' },
        operatorSnapshot,
      ),
      404,
      'SCALE_NOT_AVAILABLE',
    );
  });

  it('rejects an existing scale before catalog writes', async () => {
    assessmentsService.findScaleInstanceByVisitAndScaleCode.mockResolvedValue({
      id: new Types.ObjectId().toString(),
    });

    await expectHttpExceptionCode(
      service.initializeScaleInstance(
        patientId,
        visitId,
        { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
        operatorSnapshot,
      ),
      409,
      'SCALE_INSTANCE_ALREADY_EXISTS',
    );
    expect(
      scaleCatalogService.ensureSeedScaleVersionMaterialized,
    ).not.toHaveBeenCalled();
  });

  it('maps only a scale-instance unique duplicate race to 409', async () => {
    assessmentExecutionService.createScaleExecutionFromSeed.mockRejectedValue({
      code: 11000,
      keyPattern: {
        assessmentVisitId: 1,
        scaleCode: 1,
        instanceNo: 1,
      },
    });

    await expectHttpExceptionCode(
      service.initializeScaleInstance(
        patientId,
        visitId,
        { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
        operatorSnapshot,
      ),
      409,
      'SCALE_INSTANCE_ALREADY_EXISTS',
    );

    assessmentExecutionService.createScaleExecutionFromSeed.mockRejectedValue({
      code: 11000,
      keyPattern: { unrelatedUniqueKey: 1 },
    });
    await expectHttpExceptionCode(
      service.initializeScaleInstance(
        patientId,
        visitId,
        { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
        operatorSnapshot,
      ),
      500,
      'SCALE_EXECUTION_INITIALIZATION_FAILED',
    );
  });

  it('converts internal execution errors to a safe initialization error', async () => {
    assessmentExecutionService.createScaleExecutionFromSeed.mockRejectedValue(
      new Error('database internals must stay hidden'),
    );

    await expectHttpExceptionCode(
      service.initializeScaleInstance(
        patientId,
        visitId,
        { scaleCode: 'mmse', administrationMode: 'clinician_administered' },
        operatorSnapshot,
      ),
      500,
      'SCALE_EXECUTION_INITIALIZATION_FAILED',
    );
  });
});
