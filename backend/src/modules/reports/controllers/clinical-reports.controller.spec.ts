import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ClinicalReportGenerationWorkflowService } from '../services/clinical-report-generation-workflow.service';
import { ClinicalReportsController } from './clinical-reports.controller';

describe('ClinicalReportsController', () => {
  let controller: ClinicalReportsController;
  let workflow: {
    generateClinicalReportDraft: jest.Mock;
    getLatestClinicalReport: jest.Mock;
  };

  beforeEach(async () => {
    workflow = {
      generateClinicalReportDraft: jest.fn(),
      getLatestClinicalReport: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ClinicalReportsController],
      providers: [
        {
          provide: ClinicalReportGenerationWorkflowService,
          useValue: workflow,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(ClinicalReportsController);
  });

  it('binds explicit session and role guards', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ClinicalReportsController)).toEqual(
      PATIENT_WORKFLOW_ROLES,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClinicalReportsController),
    ).toEqual([SessionAuthGuard, RolesGuard]);
  });

  it('forwards generate with CurrentUser and latest without it', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
    };
    const currentUser = {
      id: '507f1f77bcf86cd799439013',
      accountName: 'doctor-a20-test',
      displayName: 'A20 Doctor',
      roles: ['doctor'],
      permissions: [],
    };
    const input = {
      confirm: true,
      primaryScaleInstanceIds: ['507f1f77bcf86cd799439014'],
    };
    workflow.generateClinicalReportDraft.mockResolvedValue({
      alreadyGenerated: false,
    });
    workflow.getLatestClinicalReport.mockResolvedValue({});

    await controller.generate(params, currentUser, input);
    await controller.latest(params);

    expect(workflow.generateClinicalReportDraft).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      currentUser,
      input,
    );
    expect(workflow.getLatestClinicalReport).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
    );
  });
});
