import { HttpException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AuthService } from '../../auth/services/auth.service';
import { PatientsService } from '../../patients/services/patients.service';
import { PresentationAssetsService } from '../../scales/services/presentation-assets.service';
import { ScalesService } from '../../scales/services/scales.service';
import {
  PatientAdministrationSession,
  PatientAdministrationSessionSchema,
} from '../schemas/patient-administration-session.schema';
import { ScaleInstance } from '../schemas/scale-instance.schema';
import { AssessmentsService } from './assessments.service';
import { PatientAdministrationSessionService } from './patient-administration-session.service';

function createQuery<T>(value: T) {
  const exec = jest.fn().mockResolvedValue(value);
  const selected = { exec };
  const select = jest.fn().mockReturnValue(selected);
  const sorted = { select, exec };
  return {
    exec,
    select,
    sort: jest.fn().mockReturnValue(sorted),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }
  return value;
}

function readMockCallArgument(
  mock: jest.Mock,
  argumentIndex: number,
  callIndex = 0,
): unknown {
  const calls: unknown = mock.mock.calls;
  if (!Array.isArray(calls) || !Array.isArray(calls[callIndex])) {
    throw new Error(`Expected mock call ${callIndex + 1}`);
  }
  return calls[callIndex][argumentIndex] as unknown;
}

function readExceptionCode(error: HttpException): string | undefined {
  const response: unknown = error.getResponse();
  if (!isRecord(response)) {
    return undefined;
  }
  const code = response.code;
  return typeof code === 'string' ? code : undefined;
}

async function expectHttpException(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected an HttpException');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    if (!(error instanceof HttpException)) {
      throw error;
    }
    expect(error.getStatus()).toBe(status);
    expect(readExceptionCode(error)).toBe(code);
  }
}

describe('PatientAdministrationSessionService', () => {
  const patientId = '507f1f77bcf86cd799439011';
  const visitId = '507f1f77bcf86cd799439012';
  const scaleInstanceId = '507f1f77bcf86cd799439013';
  const scaleDefinitionId = '507f1f77bcf86cd799439014';
  const scaleVersionId = '507f1f77bcf86cd799439015';
  let service: PatientAdministrationSessionService;
  let sessionModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findById: jest.Mock;
    updateOne: jest.Mock;
    create: jest.Mock;
  };
  let scaleInstanceModel: { findOne: jest.Mock };
  let patientsService: { findPatientById: jest.Mock };
  let assessmentsService: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
  };
  let scalesService: { findVersionByScaleCodeAndVersion: jest.Mock };
  let presentationAssetsService: { validatePackage: jest.Mock };
  let authService: {
    generateSessionToken: jest.Mock;
    hashSessionToken: jest.Mock;
  };

  const operator = {
    operatorId: new Types.ObjectId('507f1f77bcf86cd799439016'),
    operatorName: 'B1 Test Doctor',
    operatorRole: 'doctor' as const,
  };

  function activePatient() {
    return { id: patientId, status: 'active' };
  }

  function editableVisit() {
    return { id: visitId, patientId, status: 'draft' };
  }

  function editableScaleInstance(overrides: Record<string, unknown> = {}) {
    return {
      id: scaleInstanceId,
      patientId,
      assessmentVisitId: visitId,
      scaleDefinitionId,
      scaleVersionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      status: 'draft',
      lockedAt: null,
      voidedAt: null,
      submissionWriteBarrier: null,
      administrationMode: 'supervised_patient_input',
      ...overrides,
    };
  }

  function scaleVersion() {
    return {
      id: scaleVersionId,
      scaleDefinitionId,
      scaleCode: 'mmse',
      version: '1.0',
      presentationPackageKey: 'mmse-1.0-package-001',
      patientAdministrationSteps: [
        {
          stepKey: 'second',
          order: 2,
          itemCode: 'item-2',
          assetKeys: ['asset-2'],
          responseMode: 'speech',
          advanceBy: 'staff',
        },
        {
          stepKey: 'first',
          order: 1,
          itemCode: 'item-1',
          patientText: 'Only this safe text',
          assetKeys: ['asset-1'],
          responseMode: 'speech',
          advanceBy: 'staff',
        },
      ],
    };
  }

  function sessionDocument(overrides: Record<string, unknown> = {}) {
    const now = new Date();
    return {
      _id: new Types.ObjectId('507f1f77bcf86cd799439017'),
      scaleInstanceId: new Types.ObjectId(scaleInstanceId),
      status: 'prepared',
      currentStepKey: 'first',
      revision: 0,
      expiresAt: new Date(now.getTime() + 60_000),
      entryCodeHash: 'hash-entry',
      entryCodeExpiresAt: new Date(now.getTime() + 30_000),
      impactFactorCodes: [],
      createdBy: operator,
      controlEvents: [],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  beforeEach(async () => {
    sessionModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn(),
      create: jest.fn(),
    };
    scaleInstanceModel = { findOne: jest.fn() };
    patientsService = { findPatientById: jest.fn() };
    assessmentsService = {
      findVisitByPatientAndId: jest.fn(),
      findScaleInstanceByPatientVisitAndId: jest.fn(),
    };
    scalesService = { findVersionByScaleCodeAndVersion: jest.fn() };
    presentationAssetsService = { validatePackage: jest.fn() };
    authService = {
      generateSessionToken: jest.fn().mockReturnValue('raw-patient-token'),
      hashSessionToken: jest
        .fn()
        .mockImplementation((value: string) => `hash:${value}`),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PatientAdministrationSessionService,
        {
          provide: getModelToken(PatientAdministrationSession.name),
          useValue: sessionModel,
        },
        {
          provide: getModelToken(ScaleInstance.name),
          useValue: scaleInstanceModel,
        },
        { provide: PatientsService, useValue: patientsService },
        { provide: AssessmentsService, useValue: assessmentsService },
        { provide: ScalesService, useValue: scalesService },
        {
          provide: PresentationAssetsService,
          useValue: presentationAssetsService,
        },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();
    service = moduleRef.get(PatientAdministrationSessionService);
  });

  function arrangeEditableBusiness(): void {
    patientsService.findPatientById.mockResolvedValue(activePatient());
    assessmentsService.findVisitByPatientAndId.mockResolvedValue(
      editableVisit(),
    );
    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValue(
      editableScaleInstance(),
    );
    scalesService.findVersionByScaleCodeAndVersion.mockResolvedValue(
      scaleVersion(),
    );
    presentationAssetsService.validatePackage.mockResolvedValue({
      assets: [{ assetKey: 'asset-1' }, { assetKey: 'asset-2' }],
    });
  }

  it('declares exactly the three contract indexes and hidden credentials', () => {
    const indexes = PatientAdministrationSessionSchema.indexes();
    expect(indexes).toHaveLength(3);
    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          { scaleInstanceId: 1 },
          expect.objectContaining({
            unique: true,
            partialFilterExpression: {
              status: { $in: ['prepared', 'active', 'paused'] },
            },
          }),
        ],
        [
          { entryCodeHash: 1 },
          expect.objectContaining({ unique: true, sparse: true }),
        ],
        [
          { sessionTokenHash: 1 },
          expect.objectContaining({ unique: true, sparse: true }),
        ],
      ]),
    );
    for (const [, options] of indexes) {
      expect(options).not.toHaveProperty('expireAfterSeconds');
    }
    expect(
      PatientAdministrationSessionSchema.path('entryCodeHash').options.select,
    ).toBe(false);
    expect(
      PatientAdministrationSessionSchema.path('sessionTokenHash').options
        .select,
    ).toBe(false);
    for (const forbidden of ['stepCaptures', 'playbackFacts', 'asr', 'oss']) {
      expect(
        PatientAdministrationSessionSchema.path(forbidden),
      ).toBeUndefined();
    }
  });

  it('creates prepared state from the minimum ordered step and persists only the code hash', async () => {
    arrangeEditableBusiness();
    sessionModel.findOne
      .mockReturnValueOnce(createQuery(null))
      .mockReturnValueOnce(createQuery(null));
    sessionModel.create.mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve(sessionDocument(input)),
    );

    const response = await service.createSession(
      patientId,
      visitId,
      scaleInstanceId,
      operator,
    );

    expect(response.entryCode).toMatch(/^\d{6}$/);
    expect(response.currentStepKey).toBe('first');
    const persisted = requireRecord(
      readMockCallArgument(sessionModel.create, 0),
      'create input',
    );
    expect(persisted.entryCodeHash).toBe(`hash:${response.entryCode}`);
    expect(persisted).not.toHaveProperty('entryCode');
    expect(persisted).not.toHaveProperty('sessionTokenHash');
    expect(persisted.status).toBe('prepared');
    expect(persisted.revision).toBe(0);
    expect(presentationAssetsService.validatePackage).toHaveBeenCalledTimes(1);
  });

  it('retries a bounded entry-code hash collision without creating a parallel session', async () => {
    arrangeEditableBusiness();
    sessionModel.findOne
      .mockReturnValueOnce(createQuery(null))
      .mockReturnValueOnce(createQuery(null));
    sessionModel.create
      .mockRejectedValueOnce({
        code: 11000,
        keyPattern: { entryCodeHash: 1 },
      })
      .mockImplementationOnce((input: Record<string, unknown>) =>
        Promise.resolve(sessionDocument(input)),
      );

    const response = await service.createSession(
      patientId,
      visitId,
      scaleInstanceId,
      operator,
    );

    expect(response.entryCode).toMatch(/^\d{6}$/);
    expect(sessionModel.create).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate or ambiguous step ordering before writing a session', async () => {
    arrangeEditableBusiness();
    const invalid = scaleVersion();
    invalid.patientAdministrationSteps[1].order = 2;
    scalesService.findVersionByScaleCodeAndVersion.mockResolvedValue(invalid);

    await expect(
      service.createSession(patientId, visitId, scaleInstanceId, operator),
    ).rejects.toMatchObject({ status: 500 });
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it('rate limits repeated invalid entry attempts with the same stable code', async () => {
    sessionModel.findOne.mockImplementation(() => createQuery(null));

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expectHttpException(
        service.redeemEntryCode('000000', 'same-client'),
        401,
        'PATIENT_ADMINISTRATION_ENTRY_INVALID',
      );
    }

    await expectHttpException(
      service.redeemEntryCode('000000', 'same-client'),
      429,
      'PATIENT_ADMINISTRATION_ENTRY_INVALID',
    );
    expect(sessionModel.findOne).toHaveBeenCalledTimes(10);
  });

  it('allows pause and clears no patient credential when the assessment becomes non-editable', async () => {
    patientsService.findPatientById.mockResolvedValue({
      ...activePatient(),
      status: 'inactive',
    });
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      ...editableVisit(),
      status: 'locked',
    });
    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValue(
      editableScaleInstance({ status: 'locked', lockedAt: new Date() }),
    );
    const activeSession = sessionDocument({
      status: 'active',
      revision: 4,
      sessionTokenHash: 'patient-hash',
    });
    const pausedSession = sessionDocument({
      status: 'paused',
      revision: 5,
      sessionTokenHash: 'patient-hash',
    });
    sessionModel.findOne.mockReturnValue(createQuery(activeSession));
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(pausedSession));

    const result = await service.pauseSession(
      patientId,
      visitId,
      scaleInstanceId,
      4,
      'safety pause',
      operator,
    );

    expect(result.status).toBe('paused');
    expect(result.hasPatientCredential).toBe(true);
    expect(
      scalesService.findVersionByScaleCodeAndVersion,
    ).not.toHaveBeenCalled();
    const update = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'pause update',
    );
    expect(update).not.toHaveProperty('$unset');
  });

  it('expires an open patient credential once with revision CAS and clears every credential', async () => {
    const expiredSource = sessionDocument({
      status: 'active',
      revision: 7,
      expiresAt: new Date(Date.now() - 1_000),
      entryCodeHash: 'old-entry-hash',
      entryCodeExpiresAt: new Date(Date.now() - 2_000),
      sessionTokenHash: 'hash:raw-patient-token',
    });
    const expiredResult = sessionDocument({
      status: 'expired',
      revision: 8,
      expiresAt: expiredSource.expiresAt,
      expiredAt: new Date(),
      entryCodeHash: undefined,
      entryCodeExpiresAt: undefined,
      sessionTokenHash: undefined,
    });
    sessionModel.findOne.mockReturnValue(createQuery(expiredSource));
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(expiredResult));

    await expect(
      service.validatePatientCredential('raw-patient-token'),
    ).resolves.toBeNull();

    expect(sessionModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const filter = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 0),
      'expiry filter',
    );
    const update = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'expiry update',
    );
    expect(filter._id).toEqual(expiredSource._id);
    expect(filter.status).toBe('active');
    expect(filter.revision).toBe(7);
    expect(
      requireRecord(filter.expiresAt, 'expiry date filter').$lte,
    ).toBeInstanceOf(Date);
    expect(requireRecord(update.$set, 'expiry set').status).toBe('expired');
    expect(update.$unset).toEqual({
      entryCodeHash: 1,
      entryCodeExpiresAt: 1,
      sessionTokenHash: 1,
    });
    expect(update.$inc).toEqual({ revision: 1 });
    const push = requireRecord(update.$push, 'expiry push');
    expect(
      requireRecord(push.controlEvents, 'expiry control event').action,
    ).toBe('expired');
  });
});
