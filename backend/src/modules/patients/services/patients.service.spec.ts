// backend/src/modules/patients/services/patients.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Patient, PatientSchema } from '../schemas/patient.schema';
import { PatientsService } from './patients.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('Patient schema', () => {
  it('defines collection and indexes', () => {
    expect(PatientSchema.get('collection')).toBe('patients');
    expect(PatientSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ subjectCode: 1 }, expect.objectContaining({ unique: true })],
        [{ status: 1, subjectCode: 1 }, expect.any(Object)],
        [{ sourceType: 1, status: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines explicit primitive, nullable and Mixed field types', () => {
    expect(PatientSchema.path('sourceType')?.instance).toBe('String');
    expect(PatientSchema.path('sex')?.instance).toBe('String');
    expect(PatientSchema.path('birthDate')?.instance).toBe('Date');
    expect(PatientSchema.path('educationYears')?.instance).toBe('Number');
    expect(PatientSchema.path('handedness')?.instance).toBe('String');
    expect(PatientSchema.path('status')?.instance).toBe('String');
    expect(PatientSchema.path('externalRefs')?.instance).toBe('Mixed');
    expect(PatientSchema.path('metadata')?.instance).toBe('Mixed');
  });
});

describe('PatientsService', () => {
  let service: PatientsService;
  let patientModel: {
    findOne: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    patientModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PatientsService,
        {
          provide: getModelToken(Patient.name),
          useValue: patientModel,
        },
      ],
    }).compile();

    service = moduleRef.get(PatientsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes subject code with trim and uppercase', () => {
    expect(service.normalizeSubjectCode('  subj-test-001  ')).toBe(
      'SUBJ-TEST-001',
    );
  });

  it('returns null when patient is not found', async () => {
    patientModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findPatientBySubjectCode('SUBJ-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(patientModel.findOne).toHaveBeenCalledWith({
      subjectCode: 'SUBJ-UNKNOWN-001',
    });
  });

  it('maps patient results instead of returning raw documents', async () => {
    const patientId = new Types.ObjectId();
    const birthDate = new Date('1950-01-01T00:00:00.000Z');
    const rawPatient = {
      _id: patientId,
      subjectCode: 'SUBJ-TEST-001',
      displayName: 'Research Sample 001',
      sourceType: 'research',
      sex: 'unknown',
      birthDate,
      educationYears: 12,
      handedness: 'right',
      status: 'active',
      tags: ['sample'],
      notes: 'De-identified sample note',
      externalRefs: { importBatch: 'BATCH-TEST-001' },
      metadata: { cohort: 'TEST' },
      internalMarker: 'not returned',
    };
    patientModel.findOne.mockReturnValue(createExecQuery(rawPatient));

    const result = await service.findPatientBySubjectCode(' subj-test-001 ');

    expect(result).toEqual({
      id: patientId.toString(),
      subjectCode: 'SUBJ-TEST-001',
      displayName: 'Research Sample 001',
      sourceType: 'research',
      sex: 'unknown',
      birthDate,
      educationYears: 12,
      handedness: 'right',
      status: 'active',
      tags: ['sample'],
      notes: 'De-identified sample note',
      externalRefs: { importBatch: 'BATCH-TEST-001' },
      metadata: { cohort: 'TEST' },
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(patientModel.findOne).toHaveBeenCalledWith({
      subjectCode: 'SUBJ-TEST-001',
    });
  });

  it('lists active patients through mapper output', async () => {
    const patientId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        {
          _id: patientId,
          subjectCode: 'SUBJ-TEST-002',
          sourceType: 'clinical',
          sex: 'unknown',
          birthDate: null,
          educationYears: null,
          handedness: 'unknown',
          status: 'active',
          tags: [],
          externalRefs: null,
          metadata: null,
          internalMarker: 'not returned',
        },
      ]),
    );
    patientModel.find.mockReturnValue({ sort });

    const result = await service.listActivePatients();

    expect(patientModel.find).toHaveBeenCalledWith({ status: 'active' });
    expect(sort).toHaveBeenCalledWith({ subjectCode: 1 });
    expect(result).toEqual([
      {
        id: patientId.toString(),
        subjectCode: 'SUBJ-TEST-002',
        displayName: undefined,
        sourceType: 'clinical',
        sex: 'unknown',
        birthDate: null,
        educationYears: null,
        handedness: 'unknown',
        status: 'active',
        tags: [],
        notes: undefined,
        externalRefs: null,
        metadata: null,
      },
    ]);
    expect(result[0]).not.toHaveProperty('internalMarker');
  });
});
