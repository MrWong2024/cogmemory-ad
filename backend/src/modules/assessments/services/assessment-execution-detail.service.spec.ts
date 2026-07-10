import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PatientsService } from '../../patients/services/patients.service';
import { ScalesService } from '../../scales/services/scales.service';
import { AssessmentExecutionDetailService } from './assessment-execution-detail.service';
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

describe('AssessmentExecutionDetailService', () => {
  let service: AssessmentExecutionDetailService;
  let patientsService: { findPatientById: jest.Mock };
  let assessmentsService: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
    listItemResponsesByScaleInstanceId: jest.Mock;
    countItemResponseProgress: jest.Mock;
    toAssessmentVisitDetailResponse: jest.Mock;
    toPublicScaleInstanceResponse: jest.Mock;
  };
  let scalesService: {
    findDefinitionByCode: jest.Mock;
    findVersionByScaleCodeAndVersion: jest.Mock;
  };

  const patientId = '507f1f77bcf86cd799439011';
  const visitId = '507f1f77bcf86cd799439012';
  const scaleInstanceId = '507f1f77bcf86cd799439013';
  const definitionId = '507f1f77bcf86cd799439015';
  const versionId = '507f1f77bcf86cd799439016';

  beforeEach(async () => {
    patientsService = { findPatientById: jest.fn() };
    assessmentsService = {
      findVisitByPatientAndId: jest.fn(),
      findScaleInstanceByPatientVisitAndId: jest.fn(),
      listItemResponsesByScaleInstanceId: jest.fn(),
      countItemResponseProgress: jest.fn(),
      toAssessmentVisitDetailResponse: jest.fn(),
      toPublicScaleInstanceResponse: jest.fn(),
    };
    scalesService = {
      findDefinitionByCode: jest.fn(),
      findVersionByScaleCodeAndVersion: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AssessmentExecutionDetailService,
        { provide: PatientsService, useValue: patientsService },
        { provide: AssessmentsService, useValue: assessmentsService },
        { provide: ScalesService, useValue: scalesService },
      ],
    }).compile();
    service = moduleRef.get(AssessmentExecutionDetailService);

    patientsService.findPatientById.mockResolvedValue({
      id: patientId,
      status: 'inactive',
    });
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      id: visitId,
      status: 'completed',
    });
    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValue({
      id: scaleInstanceId,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      status: 'locked',
    });
    assessmentsService.listItemResponsesByScaleInstanceId.mockResolvedValue([]);
    assessmentsService.countItemResponseProgress.mockResolvedValue({
      totalItemCount: 11,
      answeredItemCount: 2,
    });
    assessmentsService.toAssessmentVisitDetailResponse.mockReturnValue({
      id: visitId,
    });
    assessmentsService.toPublicScaleInstanceResponse.mockReturnValue({
      id: scaleInstanceId,
      progress: { totalItemCount: 11, answeredItemCount: 2 },
    });
    scalesService.findDefinitionByCode.mockResolvedValue({
      id: definitionId,
      code: 'mmse',
      name: 'MMSE Name',
      shortName: 'MMSE',
    });
    scalesService.findVersionByScaleCodeAndVersion.mockResolvedValue({
      id: versionId,
      scaleDefinitionId: definitionId,
      scaleCode: 'mmse',
      version: '1.0',
      displayVersion: 'Display 1.0',
      crfVersion: 'CRF 1.0',
      sourceDocument: 'source.pdf',
      groups: [
        {
          code: 'second',
          title: 'Second',
          order: 2,
          cognitiveDomainCodes: ['memory'],
        },
        {
          code: 'first',
          title: 'First',
          order: 1,
          instruction: 'Safe instruction',
          cognitiveDomainCodes: ['orientation'],
        },
      ],
    });
  });

  it('allows historical read and returns safe ordered scale configuration', async () => {
    const result = await service.getScaleInstanceExecutionDetail(
      patientId,
      visitId,
      scaleInstanceId,
    );

    expect(result.scale).toEqual({
      code: 'mmse',
      name: 'MMSE Name',
      shortName: 'MMSE',
      version: '1.0',
      displayVersion: 'Display 1.0',
      crfVersion: 'CRF 1.0',
      sourceDocument: 'source.pdf',
    });
    expect(result.groups.map((group) => group.code)).toEqual([
      'first',
      'second',
    ]);
    expect(
      assessmentsService.toPublicScaleInstanceResponse,
    ).toHaveBeenCalledWith(expect.objectContaining({ id: scaleInstanceId }), {
      totalItemCount: 11,
      answeredItemCount: 2,
    });
  });

  it('uses stable not-found errors for each ownership level', async () => {
    patientsService.findPatientById.mockResolvedValueOnce(null);
    await expectHttpExceptionCode(
      service.getScaleInstanceExecutionDetail(
        patientId,
        visitId,
        scaleInstanceId,
      ),
      404,
      'PATIENT_NOT_FOUND',
    );

    assessmentsService.findVisitByPatientAndId.mockResolvedValueOnce(null);
    await expectHttpExceptionCode(
      service.getScaleInstanceExecutionDetail(
        patientId,
        visitId,
        scaleInstanceId,
      ),
      404,
      'VISIT_NOT_FOUND',
    );

    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValueOnce(
      null,
    );
    await expectHttpExceptionCode(
      service.getScaleInstanceExecutionDetail(
        patientId,
        visitId,
        scaleInstanceId,
      ),
      404,
      'SCALE_INSTANCE_NOT_FOUND',
    );
  });

  it('rejects a missing or mismatched materialized version safely', async () => {
    scalesService.findVersionByScaleCodeAndVersion.mockResolvedValueOnce(null);

    await expectHttpExceptionCode(
      service.getScaleInstanceExecutionDetail(
        patientId,
        visitId,
        scaleInstanceId,
      ),
      409,
      'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
    );

    scalesService.findVersionByScaleCodeAndVersion.mockResolvedValueOnce({
      id: '507f1f77bcf86cd799439099',
      scaleDefinitionId: definitionId,
      groups: [],
    });
    await expectHttpExceptionCode(
      service.getScaleInstanceExecutionDetail(
        patientId,
        visitId,
        scaleInstanceId,
      ),
      409,
      'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
    );
  });
});
