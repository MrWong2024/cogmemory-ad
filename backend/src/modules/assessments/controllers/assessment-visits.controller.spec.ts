import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import type { AssessmentOperatorRole } from '../schemas/assessment-visit.schema';
import { AssessmentScaleWorkflowService } from '../services/assessment-scale-workflow.service';
import { AssessmentsService } from '../services/assessments.service';
import { AssessmentVisitsController } from './assessment-visits.controller';

const OPERATOR_ROLE_CASES: Array<[string[], AssessmentOperatorRole]> = [
  [['admin', 'doctor'], 'doctor'],
  [['admin', 'nurse'], 'nurse'],
  [['admin', 'research_assistant'], 'research_assistant'],
  [['admin'], 'admin'],
];

function createUser(roles: string[]): AuthenticatedUserContext {
  return {
    id: '507f1f77bcf86cd799439011',
    accountName: 'operator-a12-test',
    displayName: 'Operator A12 Test',
    roles,
    permissions: [],
  };
}

describe('AssessmentVisitsController', () => {
  let controller: AssessmentVisitsController;
  let assessmentsService: {
    listVisitsByPatientIdPaginated: jest.Mock;
    createVisitForPatient: jest.Mock;
    getVisitExecutionDetail: jest.Mock;
  };
  let assessmentScaleWorkflowService: {
    initializeScaleInstance: jest.Mock;
  };

  beforeEach(async () => {
    assessmentsService = {
      listVisitsByPatientIdPaginated: jest.fn(),
      createVisitForPatient: jest.fn(),
      getVisitExecutionDetail: jest.fn(),
    };
    assessmentScaleWorkflowService = {
      initializeScaleInstance: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AssessmentVisitsController],
      providers: [
        {
          provide: AssessmentsService,
          useValue: assessmentsService,
        },
        {
          provide: AssessmentScaleWorkflowService,
          useValue: assessmentScaleWorkflowService,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AssessmentVisitsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('binds session and role guards with the patient workflow roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AssessmentVisitsController)).toEqual(
      PATIENT_WORKFLOW_ROLES,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AssessmentVisitsController),
    ).toEqual([SessionAuthGuard, RolesGuard]);
  });

  it('passes patient id and query to AssessmentsService', async () => {
    const params = { patientId: '507f1f77bcf86cd799439011' };
    const query = { page: 2, pageSize: 10, status: 'draft' as const };
    assessmentsService.listVisitsByPatientIdPaginated.mockResolvedValue({
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
    });

    await expect(controller.listVisits(params, query)).resolves.toEqual({
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
    });
    expect(
      assessmentsService.listVisitsByPatientIdPaginated,
    ).toHaveBeenCalledWith(params.patientId, query);
  });

  it('passes both path ids to the visit execution detail service', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
    };
    assessmentsService.getVisitExecutionDetail.mockResolvedValue({
      visit: { id: params.visitId },
      scaleInstances: [],
    });

    await expect(controller.getVisitDetail(params)).resolves.toEqual({
      visit: { id: params.visitId },
      scaleInstances: [],
    });
    expect(assessmentsService.getVisitExecutionDetail).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
    );
  });

  it.each(OPERATOR_ROLE_CASES)(
    'initializes a scale with roles %j mapped to operator role %s',
    async (roles, expectedRole) => {
      const params = {
        patientId: '507f1f77bcf86cd799439012',
        visitId: '507f1f77bcf86cd799439013',
      };
      const input = {
        scaleCode: 'mmse',
        administrationMode: 'clinician_administered' as const,
      };
      assessmentScaleWorkflowService.initializeScaleInstance.mockResolvedValue({
        createdItemResponseCount: 11,
      });

      await controller.initializeScaleInstance(
        params,
        input,
        createUser(roles),
      );

      expect(
        assessmentScaleWorkflowService.initializeScaleInstance,
      ).toHaveBeenCalledWith(params.patientId, params.visitId, input, {
        operatorId: '507f1f77bcf86cd799439011',
        operatorName: 'Operator A12 Test',
        operatorRole: expectedRole,
      });
    },
  );

  it.each(OPERATOR_ROLE_CASES)(
    'maps roles %j to operator role %s using the confirmed priority',
    async (roles, expectedRole) => {
      const patientId = '507f1f77bcf86cd799439012';
      const input = {
        visitCode: `VISIT-A12-${expectedRole}`,
        assessmentDate: new Date('2026-01-01T08:00:00.000Z'),
      };
      assessmentsService.createVisitForPatient.mockResolvedValue({
        id: 'VISIT-ID-TEST',
      });

      await controller.createVisit({ patientId }, input, createUser(roles));

      expect(assessmentsService.createVisitForPatient).toHaveBeenCalledWith(
        patientId,
        {
          ...input,
          operatorSnapshot: {
            operatorId: '507f1f77bcf86cd799439011',
            operatorName: 'Operator A12 Test',
            operatorRole: expectedRole,
          },
        },
      );
    },
  );

  it('uses unknown only when no supported operator role is present', async () => {
    assessmentsService.createVisitForPatient.mockResolvedValue({
      id: 'VISIT-ID-TEST',
    });

    await controller.createVisit(
      { patientId: '507f1f77bcf86cd799439012' },
      {
        visitCode: 'VISIT-A12-UNKNOWN',
        assessmentDate: new Date('2026-01-01T08:00:00.000Z'),
      },
      createUser(['system']),
    );

    expect(assessmentsService.createVisitForPatient).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      {
        visitCode: 'VISIT-A12-UNKNOWN',
        assessmentDate: new Date('2026-01-01T08:00:00.000Z'),
        operatorSnapshot: {
          operatorId: '507f1f77bcf86cd799439011',
          operatorName: 'Operator A12 Test',
          operatorRole: 'unknown',
        },
      },
    );
  });

  it('does not accept a missing authenticated user context', () => {
    expect(() =>
      controller.createVisit(
        { patientId: '507f1f77bcf86cd799439012' },
        {
          visitCode: 'VISIT-A12-NO-USER',
          assessmentDate: new Date(),
        },
        undefined,
      ),
    ).toThrow(UnauthorizedException);
    expect(assessmentsService.createVisitForPatient).not.toHaveBeenCalled();
  });

  it('does not initialize a scale without authenticated user context', () => {
    expect(() =>
      controller.initializeScaleInstance(
        {
          patientId: '507f1f77bcf86cd799439012',
          visitId: '507f1f77bcf86cd799439013',
        },
        { scaleCode: 'mmse' },
        undefined,
      ),
    ).toThrow(UnauthorizedException);
    expect(
      assessmentScaleWorkflowService.initializeScaleInstance,
    ).not.toHaveBeenCalled();
  });
});
