import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ClinicalHistoryQueryService } from '../services/clinical-history-query.service';
import { ClinicalHistoryController } from './clinical-history.controller';

describe('ClinicalHistoryController', () => {
  it('binds guards and roles and forwards a read without CurrentUser', async () => {
    const queryService = { listPatientAssessmentHistory: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [ClinicalHistoryController],
      providers: [
        { provide: ClinicalHistoryQueryService, useValue: queryService },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = moduleRef.get(ClinicalHistoryController);
    const params = { patientId: '507f1f77bcf86cd799439011' };
    const query = { page: 1, pageSize: 20 };
    queryService.listPatientAssessmentHistory.mockResolvedValue({ items: [] });

    await controller.list(params, query);

    expect(Reflect.getMetadata(ROLES_KEY, ClinicalHistoryController)).toEqual(
      PATIENT_WORKFLOW_ROLES,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ClinicalHistoryController),
    ).toEqual([SessionAuthGuard, RolesGuard]);
    expect(queryService.listPatientAssessmentHistory).toHaveBeenCalledWith(
      params.patientId,
      query,
    );
  });
});
