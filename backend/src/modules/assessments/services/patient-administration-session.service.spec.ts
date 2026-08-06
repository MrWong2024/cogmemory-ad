import { HttpException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Readable } from 'node:stream';
import { AuthService } from '../../auth/services/auth.service';
import { PatientsService } from '../../patients/services/patients.service';
import {
  PresentationAssetsService,
  type VerifiedPresentationAssetPackage,
} from '../../scales/services/presentation-assets.service';
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
  const lean = jest.fn().mockReturnValue({ exec });
  const selected = { exec, lean };
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
  let presentationAssetsService: {
    validatePackage: jest.Mock;
    openAsset: jest.Mock;
  };
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
      subjectCode: 'SUBJECT-UNIT-001',
      instanceCode: 'MMSE-UNIT-001',
      status: 'draft',
      lockedAt: null,
      voidedAt: null,
      submissionWriteBarrier: null,
      administrationMode: 'supervised_patient_input',
      ...overrides,
    };
  }

  function scaleVersion(stepOverrides: Array<Record<string, unknown>> = []) {
    const steps = [
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
    ].map((step, index) => ({ ...step, ...stepOverrides[index] }));
    return {
      id: scaleVersionId,
      scaleDefinitionId,
      scaleCode: 'mmse',
      version: '1.0',
      presentationPackageKey: 'mmse-1.0-package-001',
      patientAdministrationSteps: steps,
    };
  }

  function verifiedPackage(): VerifiedPresentationAssetPackage {
    return {
      packageDirectory: 'safe-package-directory',
      manifestPath: 'safe-manifest-path',
      manifest: {
        packageKey: 'mmse-1.0-package-001',
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        status: 'released',
        sourcePdf: 'source.pdf',
        sourcePdfSha256: '0'.repeat(64),
        reviewedBy: 'unit-test',
        reviewedAt: '2026-08-06T00:00:00.000Z',
        assets: [],
      },
      assets: [
        {
          assetKey: 'asset-1',
          stepKey: 'first',
          kind: 'audio',
          role: 'guidance',
          mimeType: 'audio/mpeg',
          file: 'asset-1.mp3',
          filePath: 'safe/asset-1.mp3',
          size: 11,
          sha256: '1'.repeat(64),
        },
        {
          assetKey: 'asset-2',
          stepKey: 'second',
          kind: 'audio',
          role: 'stimulus',
          mimeType: 'audio/mpeg',
          file: 'asset-2.mp3',
          filePath: 'safe/asset-2.mp3',
          size: 12,
          sha256: '2'.repeat(64),
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
      controlEvents: [] as Array<Record<string, unknown>>,
      stepCaptures: [] as Array<Record<string, unknown>>,
      playbackFacts: [] as Array<Record<string, unknown>>,
      stepEvidenceRefs: [
        stepEvidenceRef('first', 1, 'audio', '507f1f77bcf86cd799439018'),
        stepEvidenceRef('second', 1, 'audio', '507f1f77bcf86cd799439019'),
      ] as Array<Record<string, unknown>>,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function stepEvidenceRef(
    stepKey: string,
    stepRun: number,
    evidenceType: 'audio' | 'photo' | 'handwriting',
    mediaEvidenceId = '507f1f77bcf86cd799439018',
  ) {
    return {
      stepKey,
      stepRun,
      evidenceType,
      mediaEvidenceId: new Types.ObjectId(mediaEvidenceId),
      uploadedAt: new Date(),
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
    presentationAssetsService = {
      validatePackage: jest.fn(),
      openAsset: jest.fn(),
    };
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

  function arrangeEditableBusiness(
    version: ReturnType<typeof scaleVersion> = scaleVersion(),
  ): void {
    patientsService.findPatientById.mockResolvedValue(activePatient());
    assessmentsService.findVisitByPatientAndId.mockResolvedValue(
      editableVisit(),
    );
    assessmentsService.findScaleInstanceByPatientVisitAndId.mockResolvedValue(
      editableScaleInstance(),
    );
    scalesService.findVersionByScaleCodeAndVersion.mockResolvedValue(version);
    presentationAssetsService.validatePackage.mockResolvedValue(
      verifiedPackage(),
    );
    presentationAssetsService.openAsset.mockImplementation(
      (_packageKey: string, assetKey: string) =>
        Promise.resolve({
          assetKey,
          kind: 'audio',
          mimeType: 'audio/mpeg',
          size: 12,
          stream: Readable.from(Buffer.from('unit-audio')),
        }),
    );
  }

  function patientContext(revision: number) {
    return {
      sessionId: '507f1f77bcf86cd799439017',
      sessionTokenHash: 'hash:raw-patient-token',
      revision,
    };
  }

  function arrangePatientBusiness(
    session: ReturnType<typeof sessionDocument>,
    version: ReturnType<typeof scaleVersion>,
  ): void {
    arrangeEditableBusiness(version);
    sessionModel.findOne.mockReturnValue(createQuery(session));
    scaleInstanceModel.findOne.mockReturnValue(
      createQuery({
        _id: new Types.ObjectId(scaleInstanceId),
        patientId: new Types.ObjectId(patientId),
        assessmentVisitId: new Types.ObjectId(visitId),
      }),
    );
  }

  function playbackFact(
    stepKey: string,
    assetKey: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      stepKey,
      stepRun: 1,
      assetKey,
      playCount: 1,
      remainingAuthorizedReplays: 0,
      lastPlayedAt: new Date(),
      technicalReplayAuthorizations: [],
      ...overrides,
    };
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
    for (const embeddedPath of [
      'stepCaptures',
      'playbackFacts',
      'stepEvidenceRefs',
    ]) {
      const path = PatientAdministrationSessionSchema.path(embeddedPath);
      expect(path).toBeDefined();
      expect(path.options.default).toEqual([]);
      expect(path.schema?.options._id).toBe(false);
    }
    const captureSchema =
      PatientAdministrationSessionSchema.path('stepCaptures').schema;
    const playbackSchema =
      PatientAdministrationSessionSchema.path('playbackFacts').schema;
    const evidenceSchema =
      PatientAdministrationSessionSchema.path('stepEvidenceRefs').schema;
    expect(captureSchema?.path('capturedBy').options.enum).toEqual([
      'patient',
      'staff',
    ]);
    expect(
      playbackSchema?.path('technicalReplayAuthorizations').schema?.options._id,
    ).toBe(false);
    expect(evidenceSchema?.path('stepRun').instance).toBe('Number');
    expect(evidenceSchema?.path('evidenceType').options.enum).toEqual([
      'audio',
      'photo',
      'handwriting',
    ]);
    expect(evidenceSchema?.path('mediaEvidenceId').instance).toBe('ObjectId');
    for (const forbidden of ['asr', 'oss']) {
      expect(
        PatientAdministrationSessionSchema.path(forbidden),
      ).toBeUndefined();
    }
  });

  it('prepares an authoritative current-run upload context without writing', async () => {
    const version = scaleVersion([{}, { advanceBy: 'patient' }]);
    const active = sessionDocument({
      status: 'active',
      revision: 3,
      sessionTokenHash: 'hash:raw-patient-token',
      stepEvidenceRefs: [],
    });
    arrangePatientBusiness(active, version);

    const context = await service.prepareCurrentEvidenceUpload(
      patientContext(3),
      3,
      'audio',
    );

    expect(context).toEqual({
      sessionId: '507f1f77bcf86cd799439017',
      sessionTokenHash: 'hash:raw-patient-token',
      scaleInstanceId,
      patientId,
      assessmentVisitId: visitId,
      subjectCode: 'SUBJECT-UNIT-001',
      scaleDefinitionId,
      scaleVersionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: 'MMSE-UNIT-001',
      currentStepKey: 'first',
      stepRun: 1,
      itemCode: 'item-1',
      responseMode: 'speech',
      expectedRevision: 3,
    });
    expect(sessionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects response-mode mismatches, observations, and duplicate current-run evidence', async () => {
    const speech = scaleVersion([{}, { advanceBy: 'patient' }]);
    const active = sessionDocument({
      status: 'active',
      revision: 3,
      sessionTokenHash: 'hash:raw-patient-token',
      stepEvidenceRefs: [],
    });
    arrangePatientBusiness(active, speech);
    await expectHttpException(
      service.prepareCurrentEvidenceUpload(patientContext(3), 3, 'photo'),
      403,
      'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
    );

    const observation = scaleVersion([
      {},
      { responseMode: 'staff_observation', assetKeys: [] },
    ]);
    arrangePatientBusiness(active, observation);
    await expectHttpException(
      service.prepareCurrentEvidenceUpload(patientContext(3), 3, 'audio'),
      403,
      'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
    );

    arrangePatientBusiness(
      sessionDocument({
        status: 'active',
        revision: 3,
        sessionTokenHash: 'hash:raw-patient-token',
      }),
      speech,
    );
    await expectHttpException(
      service.prepareCurrentEvidenceUpload(patientContext(3), 3, 'audio'),
      409,
      'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
    );
  });

  it('attaches one current-run evidence reference with revision CAS', async () => {
    const updated = sessionDocument({
      status: 'active',
      revision: 4,
      sessionTokenHash: 'hash:raw-patient-token',
    });
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(updated));
    const uploadedAt = new Date();

    const revision = await service.attachCurrentStepEvidence({
      uploadContext: {
        sessionId: '507f1f77bcf86cd799439017',
        sessionTokenHash: 'hash:raw-patient-token',
        scaleInstanceId,
        patientId,
        assessmentVisitId: visitId,
        subjectCode: 'SUBJECT-UNIT-001',
        scaleDefinitionId,
        scaleVersionId,
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        instanceCode: 'MMSE-UNIT-001',
        currentStepKey: 'first',
        stepRun: 1,
        itemCode: 'item-1',
        responseMode: 'speech',
        expectedRevision: 3,
      },
      mediaEvidenceId: '507f1f77bcf86cd799439020',
      evidenceType: 'audio',
      uploadedAt,
    });

    expect(revision).toBe(4);
    const filter = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 0),
      'evidence attach filter',
    );
    expect(filter).toEqual(
      expect.objectContaining({
        status: 'active',
        currentStepKey: 'first',
        revision: 3,
        sessionTokenHash: 'hash:raw-patient-token',
      }),
    );
    expect(filter.stepEvidenceRefs).toEqual({
      $not: {
        $elemMatch: {
          stepKey: 'first',
          stepRun: 1,
          evidenceType: { $in: ['audio'] },
        },
      },
    });
    const update = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'evidence attach update',
    );
    expect(update.$inc).toEqual({ revision: 1 });
    expect(update.$push).toEqual({
      stepEvidenceRefs: {
        stepKey: 'first',
        stepRun: 1,
        evidenceType: 'audio',
        mediaEvidenceId: new Types.ObjectId('507f1f77bcf86cd799439020'),
        uploadedAt,
      },
    });
  });

  it.each([
    ['writing', 'photo'],
    ['drawing', 'handwriting'],
  ] as const)(
    'requires a current-run image evidence before completing %s',
    async (responseMode, evidenceType) => {
      const version = scaleVersion([
        {},
        { advanceBy: 'patient', responseMode, assetKeys: [] },
      ]);
      const withoutEvidence = sessionDocument({
        status: 'active',
        revision: 3,
        sessionTokenHash: 'hash:raw-patient-token',
        playbackFacts: [],
        stepEvidenceRefs: [],
      });
      arrangePatientBusiness(withoutEvidence, version);
      await expectHttpException(
        service.completePatientStep(patientContext(3), 3),
        409,
        'PATIENT_ADMINISTRATION_STEP_INVALID',
      );

      const withEvidence = sessionDocument({
        ...withoutEvidence,
        stepEvidenceRefs: [stepEvidenceRef('first', 1, evidenceType)],
      });
      const advanced = sessionDocument({
        status: 'active',
        currentStepKey: 'second',
        revision: 4,
      });
      arrangePatientBusiness(withEvidence, version);
      sessionModel.findOneAndUpdate.mockReturnValue(createQuery(advanced));

      await expect(
        service.completePatientStep(patientContext(3), 3),
      ).resolves.toEqual(expect.objectContaining({ revision: 4 }));
    },
  );

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

  it('returns only safe current-step asset metadata and no legacy assetKeys', async () => {
    const version = scaleVersion([{}, { advanceBy: 'patient' }]);
    const active = sessionDocument({
      status: 'active',
      revision: 3,
      sessionTokenHash: 'hash:raw-patient-token',
    });
    arrangePatientBusiness(active, version);

    const response = await service.getCurrent(patientContext(3));

    expect(response.currentStep).toEqual({
      stepKey: 'first',
      order: 1,
      patientText: 'Only this safe text',
      responseMode: 'speech',
      advanceBy: 'patient',
      assets: [
        {
          assetKey: 'asset-1',
          kind: 'audio',
          role: 'guidance',
          mimeType: 'audio/mpeg',
        },
      ],
    });
    expect(response.currentStep).not.toHaveProperty('assetKeys');
    expect(JSON.stringify(response)).not.toMatch(
      /filePath|sha256|spokenText|packageKey/,
    );
  });

  it('enforces patient/staff step ownership and the all-audio completion precondition', async () => {
    const staffFirst = scaleVersion();
    const activeStaffStep = sessionDocument({
      status: 'active',
      revision: 3,
      sessionTokenHash: 'hash:raw-patient-token',
    });
    arrangePatientBusiness(activeStaffStep, staffFirst);
    await expectHttpException(
      service.completePatientStep(patientContext(3), 3),
      409,
      'PATIENT_ADMINISTRATION_STEP_INVALID',
    );

    const patientFirst = scaleVersion([{}, { advanceBy: 'patient' }]);
    arrangeEditableBusiness(patientFirst);
    sessionModel.findOne.mockReturnValue(createQuery(activeStaffStep));
    await expectHttpException(
      service.completeStaffStep(
        patientId,
        visitId,
        scaleInstanceId,
        3,
        'must not capture a patient step',
        operator,
      ),
      409,
      'PATIENT_ADMINISTRATION_STEP_INVALID',
    );

    arrangePatientBusiness(activeStaffStep, patientFirst);
    await expectHttpException(
      service.completePatientStep(patientContext(3), 3),
      409,
      'PATIENT_ADMINISTRATION_STEP_INVALID',
    );
    expect(sessionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires current-run audio for speech but no media for staff observation', async () => {
    const patientSpeech = scaleVersion([{}, { advanceBy: 'patient' }]);
    const speechWithoutEvidence = sessionDocument({
      status: 'active',
      revision: 3,
      sessionTokenHash: 'hash:raw-patient-token',
      playbackFacts: [playbackFact('first', 'asset-1')],
      stepEvidenceRefs: [],
    });
    arrangePatientBusiness(speechWithoutEvidence, patientSpeech);
    await expectHttpException(
      service.completePatientStep(patientContext(3), 3),
      409,
      'PATIENT_ADMINISTRATION_STEP_INVALID',
    );

    const observationVersion = scaleVersion([
      {},
      { responseMode: 'staff_observation', assetKeys: [] },
    ]);
    const observation = sessionDocument({
      status: 'active',
      revision: 3,
      stepEvidenceRefs: [],
    });
    const advanced = sessionDocument({
      status: 'active',
      currentStepKey: 'second',
      revision: 4,
    });
    arrangeEditableBusiness(observationVersion);
    sessionModel.findOne.mockReturnValue(createQuery(observation));
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(advanced));

    await expect(
      service.completeStaffStep(
        patientId,
        visitId,
        scaleInstanceId,
        3,
        'Observed by staff',
        operator,
      ),
    ).resolves.toEqual(expect.objectContaining({ revision: 4 }));
  });

  it('captures a patient step with revision/token CAS and advances in configured order', async () => {
    const version = scaleVersion([{}, { advanceBy: 'patient' }]);
    const active = sessionDocument({
      status: 'active',
      revision: 3,
      sessionTokenHash: 'hash:raw-patient-token',
      playbackFacts: [playbackFact('first', 'asset-1')],
    });
    const updated = sessionDocument({
      status: 'active',
      currentStepKey: 'second',
      revision: 4,
      sessionTokenHash: 'hash:raw-patient-token',
    });
    arrangePatientBusiness(active, version);
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(updated));

    const response = await service.completePatientStep(patientContext(3), 3);

    expect(response).toEqual(
      expect.objectContaining({ status: 'active', revision: 4 }),
    );
    expect(response.currentStep).toEqual(
      expect.objectContaining({ stepKey: 'second', order: 2 }),
    );
    const filter = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 0),
      'patient completion filter',
    );
    expect(filter).toEqual(
      expect.objectContaining({
        status: 'active',
        currentStepKey: 'first',
        revision: 3,
        sessionTokenHash: 'hash:raw-patient-token',
      }),
    );
    const update = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'patient completion update',
    );
    const captures = requireRecord(update.$set, 'completion set').stepCaptures;
    expect(captures).toEqual([
      expect.objectContaining({
        stepKey: 'first',
        stepRun: 1,
        capturedBy: 'patient',
      }),
    ]);
  });

  it('captures staff observation and clears every credential on final completion', async () => {
    const active = sessionDocument({
      status: 'active',
      currentStepKey: 'second',
      revision: 8,
      sessionTokenHash: 'hash:raw-patient-token',
      playbackFacts: [playbackFact('second', 'asset-2')],
    });
    const completed = sessionDocument({
      status: 'completed',
      currentStepKey: 'second',
      revision: 9,
      completedAt: new Date(),
      entryCodeHash: undefined,
      entryCodeExpiresAt: undefined,
      sessionTokenHash: undefined,
    });
    arrangeEditableBusiness();
    sessionModel.findOne.mockReturnValue(createQuery(active));
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(completed));

    const response = await service.completeStaffStep(
      patientId,
      visitId,
      scaleInstanceId,
      8,
      'Observed response',
      operator,
    );

    expect(response).toEqual(
      expect.objectContaining({
        status: 'completed',
        revision: 9,
        hasPatientCredential: false,
      }),
    );
    const update = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'staff completion update',
    );
    expect(update.$unset).toEqual({
      entryCodeHash: 1,
      entryCodeExpiresAt: 1,
      sessionTokenHash: 1,
    });
    const captures = requireRecord(
      update.$set,
      'staff completion set',
    ).stepCaptures;
    expect(captures).toEqual([
      expect.objectContaining({
        stepKey: 'second',
        capturedBy: 'staff',
        staffObservation: 'Observed response',
        operatorSnapshot: operator,
      }),
    ]);
  });

  it('completes a final patient step, clears its token, and returns currentStep null', async () => {
    const version = scaleVersion([{ advanceBy: 'patient' }, {}]);
    const active = sessionDocument({
      status: 'active',
      currentStepKey: 'second',
      revision: 9,
      sessionTokenHash: 'hash:raw-patient-token',
      playbackFacts: [playbackFact('second', 'asset-2')],
    });
    const completed = sessionDocument({
      status: 'completed',
      currentStepKey: 'second',
      revision: 10,
      completedAt: new Date(),
      entryCodeHash: undefined,
      entryCodeExpiresAt: undefined,
      sessionTokenHash: undefined,
    });
    arrangePatientBusiness(active, version);
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(completed));

    const response = await service.completePatientStep(patientContext(9), 9);

    expect(response).toEqual(
      expect.objectContaining({
        status: 'completed',
        revision: 10,
        currentStep: null,
      }),
    );
    const update = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'final patient completion update',
    );
    expect(update.$unset).toEqual({
      entryCodeHash: 1,
      entryCodeExpiresAt: 1,
      sessionTokenHash: 1,
    });
  });

  it('allows paused staff takeover of a patient step and records the control event', async () => {
    const version = scaleVersion([{}, { advanceBy: 'patient' }]);
    const paused = sessionDocument({
      status: 'paused',
      revision: 4,
      sessionTokenHash: 'hash:raw-patient-token',
    });
    const advanced = sessionDocument({
      status: 'paused',
      currentStepKey: 'second',
      revision: 5,
      sessionTokenHash: 'hash:raw-patient-token',
    });
    arrangeEditableBusiness(version);
    sessionModel.findOne.mockReturnValue(createQuery(paused));
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(advanced));

    const response = await service.takeOverCurrentStep(
      patientId,
      visitId,
      scaleInstanceId,
      4,
      'patient needs assistance',
      'staff captured response',
      operator,
    );

    expect(response).toEqual(
      expect.objectContaining({
        status: 'paused',
        currentStepKey: 'second',
        revision: 5,
      }),
    );
    const update = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'takeover update',
    );
    expect(requireRecord(update.$push, 'takeover push').controlEvents).toEqual(
      expect.objectContaining({
        action: 'staff_takeover',
        reason: 'patient needs assistance',
      }),
    );
  });

  it('redoes only the direct previous capture, invalidates it logically, and produces stepRun 2', async () => {
    const capturedAt = new Date('2026-08-06T01:00:00.000Z');
    const paused = sessionDocument({
      status: 'paused',
      currentStepKey: 'second',
      revision: 6,
      stepCaptures: [
        {
          stepKey: 'first',
          stepRun: 1,
          capturedBy: 'patient',
          capturedAt,
        },
      ],
    });
    const redone = sessionDocument({
      status: 'paused',
      currentStepKey: 'first',
      revision: 7,
      stepCaptures: [
        {
          stepKey: 'first',
          stepRun: 1,
          capturedBy: 'patient',
          capturedAt,
          invalidatedAt: new Date(),
          invalidatedReason: 'redo direct previous',
        },
      ],
    });
    arrangeEditableBusiness();
    sessionModel.findOne.mockReturnValue(createQuery(paused));
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(redone));

    await service.redoLastStep(
      patientId,
      visitId,
      scaleInstanceId,
      6,
      'redo direct previous',
      operator,
    );

    const redoUpdate = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'redo update',
    );
    const redoneCaptures = requireRecord(redoUpdate.$set, 'redo set')
      .stepCaptures as Array<Record<string, unknown>>;
    expect(redoneCaptures[0]).toEqual(
      expect.objectContaining({
        stepKey: 'first',
        stepRun: 1,
        invalidatedReason: 'redo direct previous',
      }),
    );
    expect(redoneCaptures[0].invalidatedAt).toBeInstanceOf(Date);

    const patientVersion = scaleVersion([{}, { advanceBy: 'patient' }]);
    const resumed = {
      ...redone,
      status: 'active',
      sessionTokenHash: 'hash:raw-patient-token',
      playbackFacts: [playbackFact('first', 'asset-1', { stepRun: 2 })],
    };
    const advanced = sessionDocument({
      status: 'active',
      currentStepKey: 'second',
      revision: 8,
    });
    arrangePatientBusiness(resumed, patientVersion);
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(advanced));
    await expectHttpException(
      service.completePatientStep(patientContext(7), 7),
      409,
      'PATIENT_ADMINISTRATION_STEP_INVALID',
    );
    sessionModel.findOne.mockReturnValue(
      createQuery({
        ...resumed,
        stepEvidenceRefs: [
          stepEvidenceRef('first', 1, 'audio'),
          stepEvidenceRef('first', 2, 'audio', '507f1f77bcf86cd799439020'),
        ],
      }),
    );
    await service.completePatientStep(patientContext(7), 7);
    const rerunUpdate = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1, 1),
      'rerun completion update',
    );
    const rerunCaptures = requireRecord(rerunUpdate.$set, 'rerun set')
      .stepCaptures as Array<Record<string, unknown>>;
    expect(rerunCaptures[1]).toEqual(
      expect.objectContaining({ stepKey: 'first', stepRun: 2 }),
    );
  });

  it('rejects redo on the first step and on a completed session', async () => {
    arrangeEditableBusiness();
    sessionModel.findOne.mockReturnValue(
      createQuery(sessionDocument({ status: 'paused', revision: 2 })),
    );
    await expectHttpException(
      service.redoLastStep(
        patientId,
        visitId,
        scaleInstanceId,
        2,
        'nothing before first',
        operator,
      ),
      409,
      'PATIENT_ADMINISTRATION_STEP_INVALID',
    );

    sessionModel.findOne.mockReturnValue(
      createQuery(
        sessionDocument({
          status: 'paused',
          currentStepKey: 'second',
          revision: 3,
          stepCaptures: [
            {
              stepKey: 'first',
              stepRun: 1,
              capturedBy: 'patient',
              capturedAt: new Date(),
            },
            {
              stepKey: 'first',
              stepRun: 2,
              capturedBy: 'staff',
              operatorSnapshot: operator,
              capturedAt: new Date(),
            },
          ],
        }),
      ),
    );
    await expectHttpException(
      service.redoLastStep(
        patientId,
        visitId,
        scaleInstanceId,
        3,
        'ambiguous active captures',
        operator,
      ),
      409,
      'PATIENT_ADMINISTRATION_STEP_INVALID',
    );

    sessionModel.findOne.mockReturnValue(
      createQuery(sessionDocument({ status: 'completed', revision: 3 })),
    );
    await expectHttpException(
      service.redoLastStep(
        patientId,
        visitId,
        scaleInstanceId,
        3,
        'completed cannot redo',
        operator,
      ),
      409,
      'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
    );
  });

  it('enforces ordered audio, allows guidance replay, and forbids unapproved stimulus replay', async () => {
    const version = scaleVersion([
      {},
      {
        advanceBy: 'patient',
        assetKeys: ['asset-1', 'asset-extra'],
      },
    ]);
    const packageWithExtra = verifiedPackage();
    packageWithExtra.assets.push({
      assetKey: 'asset-extra',
      stepKey: 'first',
      kind: 'audio',
      role: 'stimulus',
      mimeType: 'audio/mpeg',
      file: 'asset-extra.mp3',
      filePath: 'safe/asset-extra.mp3',
      size: 13,
      sha256: '3'.repeat(64),
    });
    const active = sessionDocument({
      status: 'active',
      revision: 3,
      sessionTokenHash: 'hash:raw-patient-token',
    });
    arrangePatientBusiness(active, version);
    presentationAssetsService.validatePackage.mockResolvedValue(
      packageWithExtra,
    );
    await expectHttpException(
      service.playCurrentAudio(patientContext(3), 'asset-extra', 3),
      403,
      'PATIENT_ADMINISTRATION_ASSET_NOT_ALLOWED',
    );

    const guidancePlayed = sessionDocument({
      status: 'active',
      revision: 4,
      sessionTokenHash: 'hash:raw-patient-token',
      playbackFacts: [playbackFact('first', 'asset-1', { playCount: 2 })],
    });
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(guidancePlayed));
    const guidanceResult = await service.playCurrentAudio(
      patientContext(3),
      'asset-1',
      3,
    );
    expect(guidanceResult.revision).toBe(4);
    const guidanceUpdate = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'guidance playback update',
    );
    expect(
      (
        requireRecord(guidanceUpdate.$set, 'guidance set')
          .playbackFacts as Array<Record<string, unknown>>
      )[0].playCount,
    ).toBe(1);

    const stimulusPlayed = sessionDocument({
      status: 'active',
      currentStepKey: 'second',
      revision: 7,
      sessionTokenHash: 'hash:raw-patient-token',
      playbackFacts: [playbackFact('second', 'asset-2')],
    });
    arrangePatientBusiness(stimulusPlayed, scaleVersion());
    await expectHttpException(
      service.playCurrentAudio(patientContext(7), 'asset-2', 7),
      403,
      'PATIENT_ADMINISTRATION_ASSET_NOT_ALLOWED',
    );
  });

  it('authorizes one paused technical stimulus replay, prevents stacking, and consumes it', async () => {
    const paused = sessionDocument({
      status: 'paused',
      currentStepKey: 'second',
      revision: 5,
      playbackFacts: [playbackFact('second', 'asset-2')],
    });
    const authorized = sessionDocument({
      status: 'paused',
      currentStepKey: 'second',
      revision: 6,
      playbackFacts: [
        playbackFact('second', 'asset-2', {
          remainingAuthorizedReplays: 1,
          technicalReplayAuthorizations: [
            {
              authorizedAt: new Date(),
              authorizedBy: operator,
              reason: 'technical interruption',
            },
          ],
        }),
      ],
    });
    arrangeEditableBusiness();
    sessionModel.findOne.mockReturnValue(createQuery(paused));
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(authorized));

    const response = await service.authorizeTechnicalReplay(
      patientId,
      visitId,
      scaleInstanceId,
      'asset-2',
      5,
      'technical interruption',
      operator,
    );
    expect(response.revision).toBe(6);
    const authorizationUpdate = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1),
      'authorization update',
    );
    const authorizationFact = (
      requireRecord(authorizationUpdate.$set, 'authorization set')
        .playbackFacts as Array<Record<string, unknown>>
    )[0];
    expect(authorizationFact.remainingAuthorizedReplays).toBe(1);
    expect(authorizationFact.technicalReplayAuthorizations).toEqual([
      expect.objectContaining({
        authorizedBy: operator,
        reason: 'technical interruption',
      }),
    ]);

    sessionModel.findOne.mockReturnValue(createQuery(authorized));
    await expectHttpException(
      service.authorizeTechnicalReplay(
        patientId,
        visitId,
        scaleInstanceId,
        'asset-2',
        6,
        'must not stack',
        operator,
      ),
      409,
      'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
    );

    const activeAuthorized = {
      ...authorized,
      status: 'active',
      sessionTokenHash: 'hash:raw-patient-token',
    };
    arrangePatientBusiness(activeAuthorized, scaleVersion());
    const consumed = sessionDocument({
      status: 'active',
      currentStepKey: 'second',
      revision: 7,
      sessionTokenHash: 'hash:raw-patient-token',
      playbackFacts: [
        playbackFact('second', 'asset-2', {
          playCount: 2,
          remainingAuthorizedReplays: 0,
        }),
      ],
    });
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(consumed));
    const replay = await service.playCurrentAudio(
      patientContext(6),
      'asset-2',
      6,
    );
    expect(replay.revision).toBe(7);
    const replayUpdate = requireRecord(
      readMockCallArgument(sessionModel.findOneAndUpdate, 1, 1),
      'replay update',
    );
    const replayFact = (
      requireRecord(replayUpdate.$set, 'replay set').playbackFacts as Array<
        Record<string, unknown>
      >
    )[0];
    expect(replayFact).toEqual(
      expect.objectContaining({
        playCount: 2,
        remainingAuthorizedReplays: 0,
      }),
    );
  });

  it('rejects replay authorization unless paused and after the first stimulus play', async () => {
    const active = sessionDocument({
      status: 'active',
      currentStepKey: 'second',
      revision: 5,
      playbackFacts: [playbackFact('second', 'asset-2')],
    });
    arrangeEditableBusiness();
    sessionModel.findOne.mockReturnValue(createQuery(active));
    await expectHttpException(
      service.authorizeTechnicalReplay(
        patientId,
        visitId,
        scaleInstanceId,
        'asset-2',
        5,
        'active must not authorize',
        operator,
      ),
      409,
      'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
    );

    const pausedBeforePlay = sessionDocument({
      status: 'paused',
      currentStepKey: 'second',
      revision: 6,
      playbackFacts: [],
    });
    sessionModel.findOne.mockReturnValue(createQuery(pausedBeforePlay));
    await expectHttpException(
      service.authorizeTechnicalReplay(
        patientId,
        visitId,
        scaleInstanceId,
        'asset-2',
        6,
        'not played yet',
        operator,
      ),
      403,
      'PATIENT_ADMINISTRATION_ASSET_NOT_ALLOWED',
    );
  });

  it('serves only a current image after a final authorization check', async () => {
    const version = scaleVersion([
      {},
      {
        advanceBy: 'patient',
        assetKeys: ['asset-image'],
      },
    ]);
    const imagePackage = verifiedPackage();
    imagePackage.assets = [
      ...imagePackage.assets.filter((asset) => asset.stepKey !== 'first'),
      {
        assetKey: 'asset-image',
        stepKey: 'first',
        kind: 'image',
        mimeType: 'image/png',
        file: 'asset-image.png',
        filePath: 'safe/asset-image.png',
        size: 9,
        sha256: '4'.repeat(64),
      },
    ];
    const active = sessionDocument({
      status: 'active',
      revision: 3,
      sessionTokenHash: 'hash:raw-patient-token',
    });
    arrangePatientBusiness(active, version);
    sessionModel.findOne
      .mockReturnValueOnce(createQuery(active))
      .mockReturnValueOnce(createQuery(active));
    presentationAssetsService.validatePackage.mockResolvedValue(imagePackage);
    presentationAssetsService.openAsset.mockResolvedValue({
      assetKey: 'asset-image',
      kind: 'image',
      mimeType: 'image/png',
      size: 9,
      stream: Readable.from(Buffer.from('unit-img')),
    });

    const opened = await service.openCurrentImage(
      patientContext(3),
      'asset-image',
    );
    expect(opened).toEqual(
      expect.objectContaining({
        assetKey: 'asset-image',
        kind: 'image',
        mimeType: 'image/png',
        size: 9,
      }),
    );
    expect(sessionModel.findOne).toHaveBeenCalledTimes(2);

    await expectHttpException(
      service.playCurrentAudio(patientContext(3), 'asset-image', 3),
      403,
      'PATIENT_ADMINISTRATION_ASSET_NOT_ALLOWED',
    );
  });

  it('destroys an opened stream when playback loses the revision CAS', async () => {
    const version = scaleVersion([{}, { advanceBy: 'patient' }]);
    const active = sessionDocument({
      status: 'active',
      revision: 3,
      sessionTokenHash: 'hash:raw-patient-token',
    });
    const stream = Readable.from(Buffer.from('losing-stream'));
    arrangePatientBusiness(active, version);
    presentationAssetsService.openAsset.mockResolvedValue({
      assetKey: 'asset-1',
      kind: 'audio',
      mimeType: 'audio/mpeg',
      size: 13,
      stream,
    });
    sessionModel.findOneAndUpdate.mockReturnValue(createQuery(null));
    sessionModel.findById.mockReturnValue(createQuery(active));

    await expectHttpException(
      service.playCurrentAudio(patientContext(3), 'asset-1', 3),
      409,
      'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
    );
    expect(stream.destroyed).toBe(true);
  });
});
