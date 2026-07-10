import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { MediaEvidenceWorkflowService } from '../services/media-evidence-workflow.service';
import { MediaEvidenceController } from './media-evidence.controller';

describe('MediaEvidenceController', () => {
  let controller: MediaEvidenceController;
  let workflow: {
    listEvidence: jest.Mock;
    uploadEvidence: jest.Mock;
    createAccessUrl: jest.Mock;
    voidEvidence: jest.Mock;
  };

  beforeEach(async () => {
    workflow = {
      listEvidence: jest.fn(),
      uploadEvidence: jest.fn(),
      createAccessUrl: jest.fn(),
      voidEvidence: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MediaEvidenceController],
      providers: [
        { provide: MediaEvidenceWorkflowService, useValue: workflow },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(MediaEvidenceController);
  });

  it('binds SessionAuthGuard, RolesGuard and the clinical workflow roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, MediaEvidenceController)).toEqual(
      PATIENT_WORKFLOW_ROLES,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MediaEvidenceController),
    ).toEqual([SessionAuthGuard, RolesGuard]);
  });

  it('forwards list, upload, access URL and void inputs', async () => {
    const params = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
      itemResponseId: '507f1f77bcf86cd799439014',
    };
    const mediaParams = {
      ...params,
      mediaEvidenceId: '507f1f77bcf86cd799439015',
    };
    const input = {
      evidenceType: 'photo' as const,
      captureMode: 'photo_upload' as const,
    };
    const files = { file: [] };
    const user = {
      id: '507f1f77bcf86cd799439016',
      accountName: 'doctor-a15-test',
      displayName: 'A15 Test Operator',
      roles: ['doctor'],
      permissions: [],
    };

    workflow.listEvidence.mockResolvedValue({ items: [] });
    workflow.uploadEvidence.mockResolvedValue({});
    workflow.createAccessUrl.mockResolvedValue({});
    workflow.voidEvidence.mockResolvedValue({});

    await controller.listEvidence(params);
    await controller.uploadEvidence(params, input, files, user);
    await controller.createAccessUrl(mediaParams, { asset: 'trajectory' });
    await controller.voidEvidence(
      mediaParams,
      { reason: 'wrong capture' },
      user,
    );

    expect(workflow.listEvidence).toHaveBeenCalledWith(params);
    expect(workflow.uploadEvidence).toHaveBeenCalledWith(
      params,
      input,
      files,
      user,
    );
    expect(workflow.createAccessUrl).toHaveBeenCalledWith(mediaParams, {
      asset: 'trajectory',
    });
    expect(workflow.voidEvidence).toHaveBeenCalledWith(
      mediaParams,
      { reason: 'wrong capture' },
      user,
    );
  });
});
