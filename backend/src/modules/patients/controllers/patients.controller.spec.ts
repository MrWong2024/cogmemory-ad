import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../patients.constants';
import { PatientsService } from '../services/patients.service';
import { PatientsController } from './patients.controller';

describe('PatientsController', () => {
  let controller: PatientsController;
  let patientsService: {
    listPatients: jest.Mock;
    createPatient: jest.Mock;
    findPatientById: jest.Mock;
    toPatientDetailResponse: jest.Mock;
  };

  beforeEach(async () => {
    patientsService = {
      listPatients: jest.fn(),
      createPatient: jest.fn(),
      findPatientById: jest.fn(),
      toPatientDetailResponse: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [
        {
          provide: PatientsService,
          useValue: patientsService,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(PatientsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('binds session and role guards with the patient workflow roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PatientsController)).toEqual(
      PATIENT_WORKFLOW_ROLES,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, PatientsController)).toEqual([
      SessionAuthGuard,
      RolesGuard,
    ]);
  });

  it('passes list query to PatientsService', async () => {
    const query = {
      page: 2,
      pageSize: 10,
      keyword: 'SUBJ-TEST',
      status: 'active' as const,
    };
    patientsService.listPatients.mockResolvedValue({
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
    });

    await expect(controller.listPatients(query)).resolves.toEqual({
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
    });
    expect(patientsService.listPatients).toHaveBeenCalledWith(query);
  });

  it('passes create DTO to PatientsService and returns detail response', async () => {
    const input = {
      subjectCode: 'SUBJ-TEST-CONTROLLER',
      sourceType: 'clinical' as const,
    };
    const response = {
      id: 'PATIENT-ID-TEST',
      subjectCode: input.subjectCode,
      sourceType: 'clinical' as const,
      sex: 'unknown' as const,
      birthDate: null,
      educationYears: null,
      handedness: 'unknown' as const,
      status: 'active' as const,
      tags: [],
    };
    patientsService.createPatient.mockResolvedValue(response);

    await expect(controller.createPatient(input)).resolves.toEqual(response);
    expect(patientsService.createPatient).toHaveBeenCalledWith(input);
  });

  it('maps an existing patient detail response', async () => {
    const patient = {
      id: '507f1f77bcf86cd799439011',
      subjectCode: 'SUBJ-TEST-DETAIL',
    };
    const response = { ...patient, status: 'active' };
    patientsService.findPatientById.mockResolvedValue(patient);
    patientsService.toPatientDetailResponse.mockReturnValue(response);

    await expect(
      controller.getPatient({ patientId: patient.id }),
    ).resolves.toEqual(response);
    expect(patientsService.findPatientById).toHaveBeenCalledWith(patient.id);
    expect(patientsService.toPatientDetailResponse).toHaveBeenCalledWith(
      patient,
    );
  });

  it('throws stable not found semantics when patient is absent', async () => {
    patientsService.findPatientById.mockResolvedValue(null);

    await expect(
      controller.getPatient({ patientId: '507f1f77bcf86cd799439011' }),
    ).rejects.toMatchObject({
      response: {
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      },
    });
    await expect(
      controller.getPatient({ patientId: '507f1f77bcf86cd799439011' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
