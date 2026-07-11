import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { CognitiveDomainComputationWorkflowService } from '../services/cognitive-domain-computation-workflow.service';
import { CognitiveDomainResultsController } from './cognitive-domain-results.controller';

describe('CognitiveDomainResultsController', () => {
  let controller: CognitiveDomainResultsController;
  let workflow: {
    computeDomainResult: jest.Mock;
    getLatestDomainResult: jest.Mock;
  };

  beforeEach(async () => {
    workflow = {
      computeDomainResult: jest.fn(),
      getLatestDomainResult: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CognitiveDomainResultsController],
      providers: [
        {
          provide: CognitiveDomainComputationWorkflowService,
          useValue: workflow,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(CognitiveDomainResultsController);
  });

  it('binds explicit session and role guards', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, CognitiveDomainResultsController),
    ).toEqual(PATIENT_WORKFLOW_ROLES);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CognitiveDomainResultsController),
    ).toEqual([SessionAuthGuard, RolesGuard]);
  });

  it('forwards compute with CurrentUser and latest without business logic', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
    };
    const currentUser = {
      id: '507f1f77bcf86cd799439014',
      accountName: 'doctor-a19-test',
      displayName: 'A19 Doctor',
      roles: ['doctor'],
      permissions: [],
    };
    const input = { confirm: true };
    workflow.computeDomainResult.mockResolvedValue({ alreadyComputed: false });
    workflow.getLatestDomainResult.mockResolvedValue({});

    await controller.computeDomainResult(params, currentUser, input);
    await controller.getLatestDomainResult(params);

    expect(workflow.computeDomainResult).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      currentUser,
      input,
    );
    expect(workflow.getLatestDomainResult).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  });
});
