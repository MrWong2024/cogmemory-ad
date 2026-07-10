import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { AssessmentExecutionDetailService } from '../services/assessment-execution-detail.service';
import { ItemResponseDraftService } from '../services/item-response-draft.service';
import { AssessmentExecutionController } from './assessment-execution.controller';

describe('AssessmentExecutionController', () => {
  let controller: AssessmentExecutionController;
  let detailService: { getScaleInstanceExecutionDetail: jest.Mock };
  let draftService: { saveDraft: jest.Mock };

  beforeEach(async () => {
    detailService = { getScaleInstanceExecutionDetail: jest.fn() };
    draftService = { saveDraft: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [AssessmentExecutionController],
      providers: [
        { provide: AssessmentExecutionDetailService, useValue: detailService },
        { provide: ItemResponseDraftService, useValue: draftService },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AssessmentExecutionController);
  });

  it('binds both required guards and the patient workflow roles', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AssessmentExecutionController),
    ).toEqual(PATIENT_WORKFLOW_ROLES);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AssessmentExecutionController),
    ).toEqual([SessionAuthGuard, RolesGuard]);
  });

  it('forwards execution detail path parameters', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
    };
    detailService.getScaleInstanceExecutionDetail.mockResolvedValue({
      itemResponses: [],
    });

    await controller.getScaleInstanceExecutionDetail(params);

    expect(detailService.getScaleInstanceExecutionDetail).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  });

  it('forwards all ownership ids and the PATCH DTO', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
      itemResponseId: '507f1f77bcf86cd799439014',
    };
    const input = { responseText: 'de-identified response' };
    draftService.saveDraft.mockResolvedValue({ progress: {} });

    await controller.saveItemResponseDraft(params, input);

    expect(draftService.saveDraft).toHaveBeenCalledWith(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      params.itemResponseId,
      input,
    );
  });
});
