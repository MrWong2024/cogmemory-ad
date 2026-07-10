import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ScaleInstanceSubmissionService } from '../services/scale-instance-submission.service';
import { ScaleInstanceSubmissionController } from './scale-instance-submission.controller';

describe('ScaleInstanceSubmissionController', () => {
  let controller: ScaleInstanceSubmissionController;
  let service: {
    getSubmissionReadiness: jest.Mock;
    submitScaleInstance: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getSubmissionReadiness: jest.fn(),
      submitScaleInstance: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ScaleInstanceSubmissionController],
      providers: [
        { provide: ScaleInstanceSubmissionService, useValue: service },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(ScaleInstanceSubmissionController);
  });

  it('binds explicit session and roles guards with the patient workflow roles', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ScaleInstanceSubmissionController),
    ).toEqual(PATIENT_WORKFLOW_ROLES);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ScaleInstanceSubmissionController),
    ).toEqual([SessionAuthGuard, RolesGuard]);
  });

  it('forwards readiness and submission inputs without business logic', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
    };
    const user = {
      id: '507f1f77bcf86cd799439014',
      accountName: 'doctor-a16-test',
      displayName: 'Test Operator',
      roles: ['doctor'],
      permissions: [],
    };
    const input = { confirm: true };
    service.getSubmissionReadiness.mockResolvedValue({ ready: false });
    service.submitScaleInstance.mockResolvedValue({ alreadySubmitted: false });

    await controller.getSubmissionReadiness(params);
    await controller.submitScaleInstance(params, user, input);

    expect(service.getSubmissionReadiness).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
    expect(service.submitScaleInstance).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      user,
      input,
    );
  });
});
