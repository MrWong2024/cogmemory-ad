// backend/src/modules/patients/services/patients.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Patient, PatientSchema } from '../schemas/patient.schema';
import { PatientsService } from './patients.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createPaginatedQuery<T>(value: T) {
  const exec = jest.fn().mockResolvedValue(value);
  const limit = jest.fn().mockReturnValue({ exec });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });

  return { sort, skip, limit, exec };
}

async function expectConflictCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  let caughtError: unknown;

  try {
    await promise;
  } catch (error: unknown) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(ConflictException);

  if (!(caughtError instanceof ConflictException)) {
    throw caughtError;
  }

  expect(caughtError.getResponse()).toEqual(expect.objectContaining({ code }));
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
    countDocuments: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    patientModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      create: jest.fn(),
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

  it('returns null when patient id is not found', async () => {
    const patientId = new Types.ObjectId();
    patientModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(service.findPatientById(patientId)).resolves.toBeNull();
    expect(patientModel.findOne).toHaveBeenCalledWith({ _id: patientId });
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

  it('lists patients with pagination, escaped keyword, and filters', async () => {
    const patientId = new Types.ObjectId();
    const queryChain = createPaginatedQuery([
      {
        _id: patientId,
        subjectCode: 'SUBJ-TEST-[001]',
        displayName: 'Sample [001]',
        sourceType: 'research',
        sex: 'unknown',
        birthDate: null,
        educationYears: null,
        handedness: 'unknown',
        status: 'inactive',
        tags: [],
        externalRefs: { hidden: true },
        metadata: { hidden: true },
      },
    ]);
    patientModel.find.mockReturnValue(queryChain);
    patientModel.countDocuments.mockReturnValue(createExecQuery(1));

    const result = await service.listPatients({
      page: 2,
      pageSize: 5,
      keyword: '[001]',
      status: 'inactive',
      sourceType: 'research',
    });

    const expectedFilter = {
      status: 'inactive',
      sourceType: 'research',
      $or: [{ subjectCode: /\[001\]/i }, { displayName: /\[001\]/i }],
    };
    expect(patientModel.find).toHaveBeenCalledWith(expectedFilter);
    expect(queryChain.sort).toHaveBeenCalledWith({ subjectCode: 1 });
    expect(queryChain.skip).toHaveBeenCalledWith(5);
    expect(queryChain.limit).toHaveBeenCalledWith(5);
    expect(patientModel.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(result).toEqual({
      items: [
        {
          id: patientId.toString(),
          subjectCode: 'SUBJ-TEST-[001]',
          displayName: 'Sample [001]',
          sourceType: 'research',
          sex: 'unknown',
          birthDate: null,
          educationYears: null,
          handedness: 'unknown',
          status: 'inactive',
          tags: [],
        },
      ],
      page: 2,
      pageSize: 5,
      total: 1,
    });
    expect(result.items[0]).not.toHaveProperty('externalRefs');
    expect(result.items[0]).not.toHaveProperty('metadata');
  });

  it('does not add keyword conditions for a blank keyword', async () => {
    const queryChain = createPaginatedQuery([]);
    patientModel.find.mockReturnValue(queryChain);
    patientModel.countDocuments.mockReturnValue(createExecQuery(0));

    await service.listPatients({ page: 1, pageSize: 20, keyword: '   ' });

    expect(patientModel.find).toHaveBeenCalledWith({});
  });

  it('creates an active patient with normalized defaults and public response', async () => {
    const patientId = new Types.ObjectId();
    patientModel.findOne.mockReturnValue(createExecQuery(null));
    patientModel.create.mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({ _id: patientId, ...input }),
    );

    const result = await service.createPatient({
      subjectCode: ' subj-test-create ',
      tags: [' sample ', ''],
    });

    expect(patientModel.create).toHaveBeenCalledWith({
      subjectCode: 'SUBJ-TEST-CREATE',
      displayName: undefined,
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['sample'],
      notes: undefined,
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: patientId.toString(),
        subjectCode: 'SUBJ-TEST-CREATE',
        status: 'active',
      }),
    );
    expect(result).not.toHaveProperty('externalRefs');
    expect(result).not.toHaveProperty('metadata');
  });

  it('converts a subject code precheck conflict to a stable 409 exception', async () => {
    patientModel.findOne.mockReturnValue(
      createExecQuery({
        _id: new Types.ObjectId(),
      }),
    );

    await expectConflictCode(
      service.createPatient({ subjectCode: 'SUBJ-TEST-DUPLICATE' }),
      'PATIENT_SUBJECT_CODE_CONFLICT',
    );
    expect(patientModel.create).not.toHaveBeenCalled();
  });

  it('converts a Mongo duplicate key race to a stable 409 exception', async () => {
    patientModel.findOne.mockReturnValue(createExecQuery(null));
    patientModel.create.mockRejectedValue({ code: 11000 });

    await expectConflictCode(
      service.createPatient({ subjectCode: 'SUBJ-TEST-RACE' }),
      'PATIENT_SUBJECT_CODE_CONFLICT',
    );
  });

  it('maps a public detail without externalRefs or metadata', () => {
    const response = service.toPatientDetailResponse({
      id: new Types.ObjectId().toString(),
      subjectCode: 'SUBJ-TEST-PUBLIC',
      displayName: 'Sample Public',
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: [],
      notes: 'Public note',
      externalRefs: { hidden: true },
      metadata: { hidden: true },
    });

    expect(response).toEqual(expect.objectContaining({ notes: 'Public note' }));
    expect(response).not.toHaveProperty('externalRefs');
    expect(response).not.toHaveProperty('metadata');
  });
});
