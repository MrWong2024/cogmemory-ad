import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ProvisionalScoringWorkflowService } from '../services/provisional-scoring-workflow.service';
import { ScoringController } from './scoring.controller';

describe('ScoringController', () => {
  let controller: ScoringController;
  let workflow: {
    computeScoreResult: jest.Mock;
    getLatestScoreResult: jest.Mock;
  };

  beforeEach(async () => {
    workflow = {
      computeScoreResult: jest.fn(),
      getLatestScoreResult: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ScoringController],
      providers: [
        { provide: ProvisionalScoringWorkflowService, useValue: workflow },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(ScoringController);
  });

  it('binds explicit session and roles guards with workflow roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ScoringController)).toEqual(
      PATIENT_WORKFLOW_ROLES,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, ScoringController)).toEqual([
      SessionAuthGuard,
      RolesGuard,
    ]);
  });

  it('forwards compute and latest requests without scoring logic', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
    };
    const input = { confirm: true };
    workflow.computeScoreResult.mockResolvedValue({ alreadyComputed: false });
    workflow.getLatestScoreResult.mockResolvedValue({ reviewQueue: [] });

    await controller.computeScoreResult(params, input);
    await controller.getLatestScoreResult(params);

    expect(workflow.computeScoreResult).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input,
    );
    expect(workflow.getLatestScoreResult).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  });
});
