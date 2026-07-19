import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ClinicalReportGenerationWorkflowService } from '../services/clinical-report-generation-workflow.service';
import { ClinicalReportArchiveWorkflowService } from '../services/clinical-report-archive-workflow.service';
import { ClinicalReportLockWorkflowService } from '../services/clinical-report-lock-workflow.service';
import { ClinicalReportReviewWorkflowService } from '../services/clinical-report-review-workflow.service';
import { ClinicalReportSourceFreezeWorkflowService } from '../services/clinical-report-source-freeze-workflow.service';
import { ClinicalReportCorrectionWorkflowService } from '../services/clinical-report-correction-workflow.service';
import { ClinicalReportHistoryQueryService } from '../services/clinical-report-history-query.service';
import { ClinicalReportsController } from './clinical-reports.controller';

describe('ClinicalReportsController', () => {
  let controller: ClinicalReportsController;
  let workflow: {
    generateClinicalReportDraft: jest.Mock;
    getLatestClinicalReport: jest.Mock;
  };
  let reviewWorkflow: {
    updateDraft: jest.Mock;
    submitForConfirmation: jest.Mock;
    confirmReport: jest.Mock;
  };
  let lockWorkflow: { lockClinicalReport: jest.Mock };
  let sourceFreezeWorkflow: { freezeClinicalReportSources: jest.Mock };
  let archiveWorkflow: { archiveClinicalReport: jest.Mock };
  let correctionWorkflow: { createClinicalReportCorrection: jest.Mock };
  let historyQuery: {
    listVersions: jest.Mock;
    getHistoricalReport: jest.Mock;
  };

  beforeEach(async () => {
    workflow = {
      generateClinicalReportDraft: jest.fn(),
      getLatestClinicalReport: jest.fn(),
    };
    reviewWorkflow = {
      updateDraft: jest.fn(),
      submitForConfirmation: jest.fn(),
      confirmReport: jest.fn(),
    };
    lockWorkflow = { lockClinicalReport: jest.fn() };
    sourceFreezeWorkflow = { freezeClinicalReportSources: jest.fn() };
    archiveWorkflow = { archiveClinicalReport: jest.fn() };
    correctionWorkflow = { createClinicalReportCorrection: jest.fn() };
    historyQuery = {
      listVersions: jest.fn(),
      getHistoricalReport: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ClinicalReportsController],
      providers: [
        {
          provide: ClinicalReportGenerationWorkflowService,
          useValue: workflow,
        },
        {
          provide: ClinicalReportReviewWorkflowService,
          useValue: reviewWorkflow,
        },
        {
          provide: ClinicalReportLockWorkflowService,
          useValue: lockWorkflow,
        },
        {
          provide: ClinicalReportSourceFreezeWorkflowService,
          useValue: sourceFreezeWorkflow,
        },
        {
          provide: ClinicalReportArchiveWorkflowService,
          useValue: archiveWorkflow,
        },
        {
          provide: ClinicalReportCorrectionWorkflowService,
          useValue: correctionWorkflow,
        },
        {
          provide: ClinicalReportHistoryQueryService,
          useValue: historyQuery,
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

  it('overrides confirmation roles to doctor and admin', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ClinicalReportsController.prototype.confirmReport,
      ),
    ).toEqual(['doctor', 'admin']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ClinicalReportsController.prototype.createCorrection,
      ),
    ).toEqual(['doctor', 'admin']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ClinicalReportsController.prototype.archiveReport,
      ),
    ).toEqual(['doctor', 'admin']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ClinicalReportsController.prototype.freezeSources,
      ),
    ).toEqual(['doctor', 'admin']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ClinicalReportsController.prototype.lockReport,
      ),
    ).toEqual(['doctor', 'admin']);
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

  it('forwards version list and historical detail without CurrentUser', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
    };
    const reportParams = {
      ...params,
      reportId: '507f1f77bcf86cd799439013',
    };
    const query = { page: 2, pageSize: 10 };
    historyQuery.listVersions.mockResolvedValue({ items: [] });
    historyQuery.getHistoricalReport.mockResolvedValue({});

    await controller.versions(params, query);
    await controller.historicalReport(reportParams);

    expect(historyQuery.listVersions).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      query,
    );
    expect(historyQuery.getHistoricalReport).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      reportParams.reportId,
    );
  });

  it('forwards edit, submission and confirmation with CurrentUser', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      reportId: '507f1f77bcf86cd799439013',
    };
    const currentUser = {
      id: '507f1f77bcf86cd799439014',
      accountName: 'doctor-a21-test',
      displayName: 'A21 Doctor',
      roles: ['doctor'],
      permissions: [],
    };
    const expectedUpdatedAt = '2026-07-12T08:00:00.000Z';
    const edit = {
      doctorOpinion: '脱敏测试意见',
      editNote: '脱敏修改依据',
      expectedUpdatedAt,
    };
    const submit = {
      confirm: true,
      submissionNote: '脱敏提交说明',
      expectedUpdatedAt,
    };
    const confirm = {
      confirm: true,
      confirmationNote: '脱敏确认说明',
      expectedUpdatedAt,
    };
    const lock = {
      confirm: true,
      lockNote: '脱敏不可逆锁定说明',
      expectedUpdatedAt,
    };
    const freeze = {
      confirm: true,
      freezeNote: '脱敏来源冻结说明',
      expectedUpdatedAt,
    };
    const archive = {
      confirm: true,
      archiveNote: '脱敏归档说明',
      expectedUpdatedAt,
    };
    const correction = {
      confirm: true,
      correctionReason: '脱敏更正原因',
      changeSummary: '脱敏计划变更范围',
      expectedUpdatedAt,
    };
    reviewWorkflow.updateDraft.mockResolvedValue({});
    reviewWorkflow.submitForConfirmation.mockResolvedValue({});
    reviewWorkflow.confirmReport.mockResolvedValue({});
    lockWorkflow.lockClinicalReport.mockResolvedValue({});
    sourceFreezeWorkflow.freezeClinicalReportSources.mockResolvedValue({});
    archiveWorkflow.archiveClinicalReport.mockResolvedValue({});
    correctionWorkflow.createClinicalReportCorrection.mockResolvedValue({});

    await controller.updateDraft(params, currentUser, edit);
    await controller.submitForConfirmation(params, currentUser, submit);
    await controller.confirmReport(params, currentUser, confirm);
    await controller.lockReport(params, currentUser, lock);
    await controller.freezeSources(params, currentUser, freeze);
    await controller.archiveReport(params, currentUser, archive);
    await controller.createCorrection(params, currentUser, correction);

    expect(reviewWorkflow.updateDraft).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      edit,
    );
    expect(reviewWorkflow.submitForConfirmation).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      submit,
    );
    expect(reviewWorkflow.confirmReport).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      confirm,
    );
    expect(lockWorkflow.lockClinicalReport).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      lock,
    );
    expect(
      sourceFreezeWorkflow.freezeClinicalReportSources,
    ).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      freeze,
    );
    expect(archiveWorkflow.archiveClinicalReport).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      archive,
    );
    expect(
      correctionWorkflow.createClinicalReportCorrection,
    ).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      correction,
    );
  });
});
