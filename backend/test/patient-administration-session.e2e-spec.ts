import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { Readable } from 'node:stream';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PATIENT_ADMINISTRATION_COOKIE_NAME } from '../src/modules/assessments/patient-administration.constants';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../src/modules/assessments/schemas/item-response.schema';
import {
  PatientAdministrationSession,
  type PatientAdministrationSessionDocument,
} from '../src/modules/assessments/schemas/patient-administration-session.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  MediaEvidence,
  type MediaEvidenceDocument,
} from '../src/modules/media/schemas/media-evidence.schema';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ScaleDefinition,
  type ScaleDefinitionDocument,
} from '../src/modules/scales/schemas/scale-definition.schema';
import {
  ScaleVersion,
  type ScaleVersionDocument,
} from '../src/modules/scales/schemas/scale-version.schema';
import { ScaleSeedDataService } from '../src/modules/scales/seeds/scale-seed-data.service';
import { PresentationAssetsService } from '../src/modules/scales/services/presentation-assets.service';
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';
import { requireInitialized } from './support/e2e-initialization';

jest.setTimeout(60_000);

const TEST_PREFIX = 'B1-SESSION-TEST';
const PATIENT_PREFIX = `SUBJ-${TEST_PREFIX}-`;
const VISIT_PREFIX = `VISIT-${TEST_PREFIX}-`;
const INSTANCE_PREFIX = `INST-${TEST_PREFIX}-`;
const ACCOUNTS = {
  admin: 'admin-b1-session-test',
  doctor: 'doctor-b1-session-test',
  nurse: 'nurse-b1-session-test',
  researchAssistant: 'research-b1-session-test',
  system: 'system-b1-session-test',
  handoffDoctor: 'handoff-doctor-b1-session-test',
} as const;
const PASSWORD = 'B1-Session-Test-Password!';

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;
type TestAgent = ReturnType<typeof request.agent>;
type Fixture = {
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  scaleInstance: ScaleInstanceDocument;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(response: Response): Record<string, unknown> {
  const body: unknown = response.body;
  if (!isRecord(body)) {
    throw new Error('Expected an object response body');
  }
  return body;
}

function readString(
  body: Record<string, unknown>,
  propertyName: string,
): string {
  const value = body[propertyName];
  if (typeof value !== 'string') {
    throw new Error(`Expected ${propertyName} to be a string`);
  }
  return value;
}

function readNumber(
  body: Record<string, unknown>,
  propertyName: string,
): number {
  const value = body[propertyName];
  if (typeof value !== 'number') {
    throw new Error(`Expected ${propertyName} to be a number`);
  }
  return value;
}

function readCookiePair(response: Response, cookieName: string): string {
  const headers: unknown = response.headers;
  if (!isRecord(headers)) {
    throw new Error('Expected response headers');
  }
  const header = headers['set-cookie'];
  const values = Array.isArray(header)
    ? header.filter((value): value is string => typeof value === 'string')
    : typeof header === 'string'
      ? [header]
      : [];
  const serialized = values.find((value) => value.startsWith(`${cookieName}=`));
  if (!serialized) {
    throw new Error(`Expected ${cookieName} response cookie`);
  }
  return serialized.split(';', 1)[0];
}

function preservedSessionFacts(
  session: PatientAdministrationSessionDocument | null,
) {
  if (!session) {
    throw new Error('Expected patient administration session');
  }
  return {
    id: session._id.toString(),
    status: session.status,
    currentStepKey: session.currentStepKey,
    startedAt: session.startedAt?.toISOString() ?? null,
    expiresAt: session.expiresAt.toISOString(),
    preparationConfirmedAt:
      session.preparationConfirmedAt?.toISOString() ?? null,
    preparationConfirmedBy: JSON.stringify(session.preparationConfirmedBy),
    impactFactorCodes: [...(session.impactFactorCodes ?? [])],
    impactFactorNote: session.impactFactorNote,
    stepCaptures: JSON.stringify(session.stepCaptures ?? []),
    playbackFacts: JSON.stringify(session.playbackFacts ?? []),
    stepEvidenceRefs: JSON.stringify(session.stepEvidenceRefs ?? []),
  };
}

describe('patient administration session APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let httpServer: SupertestApp;
  let authService: AuthService;
  let scaleSeedDataService: ScaleSeedDataService;
  let userModel: Model<UserDocument>;
  let authSessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let scaleInstanceModel: Model<ScaleInstanceDocument>;
  let itemResponseModel: Model<ItemResponseDocument>;
  let mediaEvidenceModel: Model<MediaEvidenceDocument>;
  let administrationSessionModel: Model<PatientAdministrationSessionDocument>;
  let scaleDefinitionModel: Model<ScaleDefinitionDocument>;
  let scaleVersionModel: Model<ScaleVersionDocument>;
  let mmseDefinition: ScaleDefinitionDocument;
  let mmseVersion: ScaleVersionDocument;
  let ownsMmseDefinition = false;
  let ownsMmseVersion = false;
  let modelsReady = false;
  const agents = new Map<string, TestAgent>();
  const ownedUserIds = new Set<string>();
  const ownedScaleInstanceIds = new Set<string>();

  async function cleanupOwnedData(): Promise<void> {
    const users = await userModel
      .find({ accountName: { $in: Object.values(ACCOUNTS) } })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    for (const userId of userIds) {
      ownedUserIds.add(userId.toString());
    }
    if (userIds.length > 0) {
      await authSessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }

    const knownInstanceIds = [...ownedScaleInstanceIds].map(
      (id) => new Types.ObjectId(id),
    );
    const instances = await scaleInstanceModel
      .find({
        $or: [
          { instanceCode: { $regex: `^${INSTANCE_PREFIX}` } },
          { subjectCode: { $regex: `^${PATIENT_PREFIX}` } },
          ...(knownInstanceIds.length > 0
            ? [{ _id: { $in: knownInstanceIds } }]
            : []),
        ],
      })
      .select({ _id: 1 })
      .exec();
    const instanceIds = instances.map((instance) => instance._id);
    if (instanceIds.length > 0) {
      await mediaEvidenceModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await itemResponseModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await administrationSessionModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await scaleInstanceModel.deleteMany({ _id: { $in: instanceIds } }).exec();
    }

    await visitModel
      .deleteMany({ visitCode: { $regex: `^${VISIT_PREFIX}` } })
      .exec();
    await patientModel
      .deleteMany({ subjectCode: { $regex: `^${PATIENT_PREFIX}` } })
      .exec();
    await userModel
      .deleteMany({ accountName: { $in: Object.values(ACCOUNTS) } })
      .exec();
  }

  async function createFixture(
    suffix: string,
    administrationMode:
      | 'clinician_administered'
      | 'supervised_patient_input' = 'supervised_patient_input',
    initializeWith?: TestAgent,
  ): Promise<Fixture> {
    const patient = await patientModel.create({
      subjectCode: `${PATIENT_PREFIX}${suffix}`,
      displayName: `De-identified B1 subject ${suffix}`,
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['b1-session-test'],
      externalRefs: null,
      metadata: null,
    });
    const visit = await visitModel.create({
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      visitCode: `${VISIT_PREFIX}${suffix}`,
      visitType: 'baseline',
      status: 'draft',
      assessmentDate: new Date('2026-08-06T01:00:00.000Z'),
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      operatorSnapshot: null,
      clinicalContext: null,
      metadata: null,
    });
    let scaleInstance: ScaleInstanceDocument;
    if (initializeWith) {
      const initialization = readBody(
        await initializeWith
          .post(
            `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances`,
          )
          .send({
            scaleCode: 'mmse',
            scaleVersion: '1.0',
            administrationMode,
          })
          .expect(201),
      );
      const initialized = initialization.scaleInstance;
      if (!isRecord(initialized)) {
        throw new Error('Expected initialized scale instance');
      }
      const stored = await scaleInstanceModel
        .findById(readString(initialized, 'id'))
        .exec();
      if (!stored) {
        throw new Error('Expected stored initialized scale instance');
      }
      scaleInstance = stored;
    } else {
      scaleInstance = await scaleInstanceModel.create({
        assessmentVisitId: visit._id,
        patientId: patient._id,
        subjectCode: patient.subjectCode,
        scaleDefinitionId: mmseDefinition._id,
        scaleVersionId: mmseVersion._id,
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        instanceCode: `${INSTANCE_PREFIX}${suffix}`,
        instanceNo: 1,
        status: 'draft',
        administrationMode,
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        voidedAt: null,
        operatorSnapshot: null,
        submissionWriteBarrier: null,
        metadata: null,
      });
    }
    ownedScaleInstanceIds.add(scaleInstance._id.toString());
    return { patient, visit, scaleInstance };
  }

  async function assertNoOwnedData(): Promise<void> {
    const ownedIds = [...ownedScaleInstanceIds].map(
      (id) => new Types.ObjectId(id),
    );
    const userIds = [...ownedUserIds].map((id) => new Types.ObjectId(id));
    const [
      users,
      authSessions,
      patients,
      visits,
      instances,
      itemResponses,
      mediaEvidence,
      administrationSessions,
    ] = await Promise.all([
      userModel.countDocuments({
        accountName: { $in: Object.values(ACCOUNTS) },
      }),
      userIds.length > 0
        ? authSessionModel.countDocuments({ userId: { $in: userIds } })
        : Promise.resolve(0),
      patientModel.countDocuments({
        subjectCode: { $regex: `^${PATIENT_PREFIX}` },
      }),
      visitModel.countDocuments({
        visitCode: { $regex: `^${VISIT_PREFIX}` },
      }),
      scaleInstanceModel.countDocuments({
        instanceCode: { $regex: `^${INSTANCE_PREFIX}` },
      }),
      ownedIds.length > 0
        ? itemResponseModel.countDocuments({
            scaleInstanceId: { $in: ownedIds },
          })
        : Promise.resolve(0),
      ownedIds.length > 0
        ? mediaEvidenceModel.countDocuments({
            scaleInstanceId: { $in: ownedIds },
          })
        : Promise.resolve(0),
      ownedIds.length > 0
        ? administrationSessionModel.countDocuments({
            scaleInstanceId: { $in: ownedIds },
          })
        : Promise.resolve(0),
    ]);
    expect({
      users,
      authSessions,
      patients,
      visits,
      instances,
      itemResponses,
      mediaEvidence,
      administrationSessions,
    }).toEqual({
      users: 0,
      authSessions: 0,
      patients: 0,
      visits: 0,
      instances: 0,
      itemResponses: 0,
      mediaEvidence: 0,
      administrationSessions: 0,
    });
  }

  function staffBase(fixture: Fixture): string {
    return `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/scale-instances/${fixture.scaleInstance._id.toString()}/patient-administration`;
  }

  function requireAgent(accountName: string): TestAgent {
    const agent = agents.get(accountName);
    if (!agent) {
      throw new Error(`Missing authenticated agent for ${accountName}`);
    }
    return agent;
  }

  async function login(accountName: string): Promise<TestAgent> {
    const agent = request.agent(httpServer);
    await agent
      .post('/auth/login')
      .send({ accountName, password: PASSWORD })
      .expect(201);
    agents.set(accountName, agent);
    return agent;
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('E2E requires NODE_ENV=test');
    }
    if (process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test') {
      throw new Error('E2E requires the standard_test database purpose');
    }

    const seedDataService = new ScaleSeedDataService();
    const mmseSeed = seedDataService.getScaleSeedByCode('mmse');
    if (!mmseSeed?.version.patientAdministrationSteps) {
      throw new Error('MMSE patient administration seed is unavailable');
    }
    const stubAssets = mmseSeed.version.patientAdministrationSteps.flatMap(
      (step) =>
        step.assetKeys.map((assetKey) => {
          const isImage = assetKey === 'mmse-drawing-stimulus';
          return {
            assetKey,
            stepKey: step.stepKey,
            kind: isImage ? ('image' as const) : ('audio' as const),
            ...(isImage
              ? {}
              : {
                  role: assetKey.endsWith('-stimulus')
                    ? 'stimulus'
                    : 'guidance',
                }),
            mimeType: isImage ? 'image/png' : 'audio/mpeg',
            file: `${assetKey}.${isImage ? 'png' : 'mp3'}`,
            filePath: `in-memory/${assetKey}.${isImage ? 'png' : 'mp3'}`,
            size: 16,
            sha256: '0'.repeat(64),
          };
        }),
    );
    const presentationAssetsStub = {
      validatePackage: jest.fn().mockResolvedValue({
        packageDirectory: 'in-memory',
        manifestPath: 'in-memory/manifest.json',
        manifest: {
          packageKey: 'mmse-1.0-package-001',
          scaleCode: 'mmse',
          scaleVersion: '1.0',
          status: 'released',
          sourcePdf: 'in-memory.pdf',
          sourcePdfSha256: '0'.repeat(64),
          reviewedBy: 'B1 regression stub',
          reviewedAt: '2026-08-06T00:00:00.000Z',
          assets: stubAssets,
        },
        assets: stubAssets,
      }),
      openAsset: jest
        .fn()
        .mockImplementation((_packageKey: string, assetKey: string) => {
          const asset = stubAssets.find(
            (candidate) => candidate.assetKey === assetKey,
          );
          if (!asset) {
            throw new Error(`Unexpected E2E asset ${assetKey}`);
          }
          const buffer = Buffer.from(`session-e2e-asset:${assetKey}`);
          return Promise.resolve({
            assetKey,
            kind: asset.kind,
            mimeType: asset.mimeType,
            size: buffer.length,
            stream: Readable.from(buffer),
          });
        }),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PresentationAssetsService)
      .useValue(presentationAssetsStub)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    if (connection.name !== 'cogmemory_ad_test') {
      throw new Error(
        `E2E database must be cogmemory_ad_test, received ${connection.name}`,
      );
    }
    const configService = app.get(ConfigService);
    if (
      configService.get<string>('app.env') !== 'test' ||
      configService.get<string>('storage.driver') !== 'fake' ||
      configService.get<string>('llm.provider') !== 'stub' ||
      configService.get<string>('smsAuth.provider') !== 'stub'
    ) {
      throw new Error('E2E external service isolation is not active');
    }

    authService = app.get(AuthService);
    scaleSeedDataService = app.get(ScaleSeedDataService);
    userModel = app.get(getModelToken(User.name));
    authSessionModel = app.get(getModelToken(Session.name));
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    scaleInstanceModel = app.get(getModelToken(ScaleInstance.name));
    itemResponseModel = app.get(getModelToken(ItemResponse.name));
    mediaEvidenceModel = app.get(getModelToken(MediaEvidence.name));
    administrationSessionModel = app.get(
      getModelToken(PatientAdministrationSession.name),
    );
    scaleDefinitionModel = app.get(getModelToken(ScaleDefinition.name));
    scaleVersionModel = app.get(getModelToken(ScaleVersion.name));
    modelsReady = true;

    await cleanupOwnedData();

    const existingDefinition = await scaleDefinitionModel
      .findOne({ code: 'mmse' })
      .exec();
    if (existingDefinition) {
      mmseDefinition = existingDefinition;
    } else {
      mmseDefinition = await scaleDefinitionModel.create({
        ...mmseSeed.definition,
        currentVersionId: null,
      });
      ownsMmseDefinition = true;
    }

    const existingVersion = await scaleVersionModel
      .findOne({ scaleDefinitionId: mmseDefinition._id, version: '1.0' })
      .exec();
    if (existingVersion) {
      mmseVersion = existingVersion;
    } else {
      mmseVersion = await scaleVersionModel.create({
        ...mmseSeed.version,
        scaleDefinitionId: mmseDefinition._id,
      });
      ownsMmseVersion = true;
      await scaleDefinitionModel
        .updateOne(
          { _id: mmseDefinition._id },
          { $set: { currentVersionId: mmseVersion._id } },
        )
        .exec();
    }

    const passwordHash = await authService.hashPassword(PASSWORD);
    await userModel.insertMany([
      {
        accountName: ACCOUNTS.admin,
        displayName: 'B1 Admin',
        staffCode: 'STAFF-B1-ADMIN',
        passwordHash,
        roles: ['admin'],
        permissions: [],
        userType: 'admin',
        status: 'active',
        metadata: null,
      },
      {
        accountName: ACCOUNTS.doctor,
        displayName: 'B1 Doctor',
        staffCode: 'STAFF-B1-DOCTOR',
        passwordHash,
        roles: ['doctor'],
        permissions: [],
        userType: 'doctor',
        status: 'active',
        metadata: null,
      },
      {
        accountName: ACCOUNTS.nurse,
        displayName: 'B1 Nurse',
        staffCode: 'STAFF-B1-NURSE',
        passwordHash,
        roles: ['nurse'],
        permissions: [],
        userType: 'nurse',
        status: 'active',
        metadata: null,
      },
      {
        accountName: ACCOUNTS.researchAssistant,
        displayName: 'B1 Research Assistant',
        staffCode: 'STAFF-B1-RESEARCH',
        passwordHash,
        roles: ['research_assistant'],
        permissions: [],
        userType: 'research_assistant',
        status: 'active',
        metadata: null,
      },
      {
        accountName: ACCOUNTS.system,
        displayName: 'B1 System',
        staffCode: 'STAFF-B1-SYSTEM',
        passwordHash,
        roles: ['system'],
        permissions: [],
        userType: 'system',
        status: 'active',
        metadata: null,
      },
      {
        accountName: ACCOUNTS.handoffDoctor,
        displayName: 'B1 Handoff Doctor',
        staffCode: 'STAFF-B1-HANDOFF',
        passwordHash,
        roles: ['doctor'],
        permissions: [],
        userType: 'doctor',
        status: 'active',
        metadata: null,
      },
    ]);

    httpServer = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
    for (const accountName of Object.values(ACCOUNTS)) {
      await login(accountName);
    }
  });

  afterAll(async () => {
    if (!app) {
      return;
    }
    if (modelsReady) {
      await cleanupOwnedData();
      await assertNoOwnedData();
      if (ownsMmseVersion) {
        await scaleVersionModel.deleteOne({ _id: mmseVersion._id }).exec();
      }
      if (ownsMmseDefinition) {
        await scaleDefinitionModel
          .deleteOne({ _id: mmseDefinition._id })
          .exec();
      }
    }
    await app.close();
  });

  it('validates deviceMode and creates same-device sessions without entry codes', async () => {
    const fixture = await createFixture('DEVICE-MODE');
    const base = staffBase(fixture);
    const doctor = requireAgent(ACCOUNTS.doctor);

    await doctor.post(base).send({}).expect(400);
    await doctor
      .post(base)
      .send({ deviceMode: 'unsupported_device' })
      .expect(400);
    expect(
      await administrationSessionModel
        .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
        .exec(),
    ).toBe(0);

    const createResponse = await doctor
      .post(base)
      .send({ deviceMode: 'same_device' })
      .expect(201);
    const createBody = readBody(createResponse);
    expect(createBody).toEqual(
      expect.objectContaining({
        deviceMode: 'same_device',
        entryCode: null,
        entryCodeExpiresAt: null,
        hasPatientCredential: false,
        status: 'prepared',
        revision: 0,
      }),
    );
    const stored = await administrationSessionModel
      .findById(readString(createBody, 'id'))
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(stored?.deviceMode).toBe('same_device');
    expect(stored?.entryCodeHash).toBeUndefined();
    expect(stored?.entryCodeExpiresAt).toBeUndefined();
    expect(stored?.sessionTokenHash).toBeUndefined();

    await doctor
      .post(`${base}/entry-code/reissue`)
      .send({ expectedRevision: 0, reason: 'must not switch mode' })
      .expect(409)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({
            code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
          }),
        );
      });
  });

  it('rejects recreate after completed history without adding or changing terminal sessions', async () => {
    const fixture = await createFixture('COMPLETED-RECREATE');
    const base = staffBase(fixture);
    const doctor = requireAgent(ACCOUNTS.doctor);
    const createdBy = {
      operatorId: new Types.ObjectId(),
      operatorName: 'B1 Completed Gate Doctor',
      operatorRole: 'doctor' as const,
    };
    const expiresAt = new Date(Date.now() + 60_000);
    const completed = await administrationSessionModel.create({
      scaleInstanceId: fixture.scaleInstance._id,
      deviceMode: 'same_device',
      status: 'completed',
      currentStepKey: 'completed-gate-step',
      revision: 19,
      expiresAt,
      completedAt: new Date(),
      impactFactorCodes: [],
      createdBy,
    });
    const laterTerminated = await administrationSessionModel.create({
      scaleInstanceId: fixture.scaleInstance._id,
      deviceMode: 'cross_device',
      status: 'terminated',
      currentStepKey: 'completed-gate-step',
      revision: 1,
      expiresAt,
      terminatedAt: new Date(),
      impactFactorCodes: [],
      createdBy,
    });
    const countBefore = await administrationSessionModel
      .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
      .exec();

    await doctor
      .post(base)
      .send({ deviceMode: 'same_device' })
      .expect(409)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({
            code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
          }),
        );
      });

    expect(
      await administrationSessionModel
        .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
        .exec(),
    ).toBe(countBefore);
    expect(
      (await administrationSessionModel.findById(completed._id).exec())?.status,
    ).toBe('completed');
    expect(
      (await administrationSessionModel.findById(laterTerminated._id).exec())
        ?.status,
    ).toBe('terminated');
  });

  it('allows recreate after termination while preserving the terminated session', async () => {
    const fixture = await createFixture('TERMINATED-RECREATE');
    const base = staffBase(fixture);
    const doctor = requireAgent(ACCOUNTS.doctor);
    const firstCreate = readBody(
      await doctor.post(base).send({ deviceMode: 'same_device' }).expect(201),
    );
    const firstSessionId = readString(firstCreate, 'id');

    await doctor
      .post(`${base}/terminate`)
      .send({
        expectedRevision: 0,
        reason: 'retry after interrupted assessment',
      })
      .expect(200)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({ status: 'terminated', revision: 1 }),
        );
      });

    const secondCreate = readBody(
      await doctor.post(base).send({ deviceMode: 'cross_device' }).expect(201),
    );
    const secondSessionId = readString(secondCreate, 'id');

    expect(secondSessionId).not.toBe(firstSessionId);
    expect(
      (await administrationSessionModel.findById(firstSessionId).exec())
        ?.status,
    ).toBe('terminated');
    expect(
      await administrationSessionModel
        .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
        .exec(),
    ).toBe(2);
  });

  it('allows every workflow role, rejects other roles, and enforces one open session under concurrency', async () => {
    const roleCases = [
      [ACCOUNTS.admin, 'ROLE-ADMIN'],
      [ACCOUNTS.doctor, 'ROLE-DOCTOR'],
      [ACCOUNTS.nurse, 'ROLE-NURSE'],
      [ACCOUNTS.researchAssistant, 'ROLE-RESEARCH'],
    ] as const;
    for (const [accountName, suffix] of roleCases) {
      const fixture = await createFixture(suffix);
      const response = await requireAgent(accountName)
        .post(staffBase(fixture))
        .send({ deviceMode: 'cross_device' })
        .expect(201);
      expect(readString(readBody(response), 'entryCode')).toMatch(/^\d{6}$/);
    }

    const forbidden = await createFixture('ROLE-SYSTEM');
    await requireAgent(ACCOUNTS.system)
      .post(staffBase(forbidden))
      .send({ deviceMode: 'cross_device' })
      .expect(403);

    const concurrent = await createFixture('CONCURRENT');
    const results = await Promise.all([
      requireAgent(ACCOUNTS.doctor)
        .post(staffBase(concurrent))
        .send({ deviceMode: 'cross_device' }),
      requireAgent(ACCOUNTS.nurse)
        .post(staffBase(concurrent))
        .send({ deviceMode: 'cross_device' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      await administrationSessionModel
        .countDocuments({ scaleInstanceId: concurrent.scaleInstance._id })
        .exec(),
    ).toBe(1);
  });

  it('runs the cross-device lifecycle with one-time credentials, CAS, safe current, reissue, and termination', async () => {
    const fixture = await createFixture('MAIN');
    const base = staffBase(fixture);
    const doctor = requireAgent(ACCOUNTS.doctor);
    const createResponse = await doctor
      .post(base)
      .send({ deviceMode: 'cross_device' })
      .expect(201);
    const createBody = readBody(createResponse);
    const entryCode = readString(createBody, 'entryCode');
    const sessionId = readString(createBody, 'id');
    expect(entryCode).toMatch(/^\d{6}$/);
    expect(createBody).toEqual(
      expect.objectContaining({
        deviceMode: 'cross_device',
        status: 'prepared',
        revision: 0,
        hasPatientCredential: false,
      }),
    );
    expect(JSON.stringify(createBody)).not.toContain('entryCodeHash');
    expect(JSON.stringify(createBody)).not.toContain('sessionTokenHash');
    expect(await visitModel.findById(fixture.visit._id).lean().exec()).toEqual(
      expect.objectContaining({ status: 'draft', startedAt: null }),
    );
    expect(
      await scaleInstanceModel
        .findById(fixture.scaleInstance._id)
        .lean()
        .exec(),
    ).toEqual(expect.objectContaining({ status: 'draft', startedAt: null }));

    const storedBeforeEnter = await administrationSessionModel
      .findById(sessionId)
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(storedBeforeEnter?.entryCodeHash).toBe(
      authService.hashSessionToken(entryCode),
    );
    expect(storedBeforeEnter?.entryCodeHash).not.toBe(entryCode);
    expect(storedBeforeEnter?.sessionTokenHash).toBeUndefined();

    await doctor
      .post(`${base}/preparation/confirm`)
      .send({ expectedRevision: 0, impactFactorCodes: [] })
      .expect(409);
    await doctor
      .post(`${base}/handoff`)
      .send({ expectedRevision: 0 })
      .expect(409);
    await doctor.get('/auth/me').expect(200);
    const storedAfterModeGate = await administrationSessionModel
      .findById(sessionId)
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(storedAfterModeGate?.revision).toBe(0);
    expect(storedAfterModeGate?.entryCodeHash).toBe(
      authService.hashSessionToken(entryCode),
    );
    expect(storedAfterModeGate?.sessionTokenHash).toBeUndefined();

    const patient = request.agent(httpServer);
    const enterResponse = await patient
      .post('/patient-administration/enter')
      .send({ code: entryCode })
      .expect(200);
    expect(readBody(enterResponse)).toEqual(
      expect.objectContaining({ status: 'prepared', revision: 1 }),
    );
    const setCookies = enterResponse.headers['set-cookie'];
    expect(
      Array.isArray(setCookies) ? setCookies.join(';') : setCookies,
    ).toContain('cogmemory_ad_patient_session=');
    expect(JSON.stringify(readBody(enterResponse))).not.toContain('token');

    await request(httpServer)
      .post('/patient-administration/enter')
      .send({ code: entryCode })
      .expect(401)
      .expect((response: Response) => {
        expect(readString(readBody(response), 'code')).toBe(
          'PATIENT_ADMINISTRATION_ENTRY_INVALID',
        );
      });

    const preparedCurrent = await patient
      .get('/patient-administration/current')
      .expect(200);
    expect(readBody(preparedCurrent)).toEqual(
      expect.objectContaining({
        status: 'prepared',
        revision: 1,
        currentStep: null,
      }),
    );

    const confirmResponse = await doctor
      .post(`${base}/preparation/confirm`)
      .send({
        expectedRevision: 1,
        impactFactorCodes: ['sensory'],
        impactFactorNote: '  corrected vision  ',
      })
      .expect(200);
    const confirmBody = readBody(confirmResponse);
    expect(confirmBody).toEqual(
      expect.objectContaining({
        status: 'active',
        revision: 2,
        impactFactorCodes: ['sensory'],
        impactFactorNote: 'corrected vision',
      }),
    );
    expect(readString(confirmBody, 'startedAt')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const storedAfterCrossDeviceConfirmation = await administrationSessionModel
      .findById(sessionId)
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(storedAfterCrossDeviceConfirmation?.startedAt).toBeInstanceOf(Date);
    expect(storedAfterCrossDeviceConfirmation?.sessionTokenHash).toBeDefined();
    expect(
      storedAfterCrossDeviceConfirmation?.controlEvents.map(
        (event) => event.action,
      ),
    ).toEqual(['entry_redeemed', 'preparation_confirmed']);
    const crossDeviceVisitAfterStart = await visitModel
      .findById(fixture.visit._id)
      .lean()
      .exec();
    const crossDeviceScaleAfterStart = await scaleInstanceModel
      .findById(fixture.scaleInstance._id)
      .lean()
      .exec();
    expect(crossDeviceVisitAfterStart).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        startedAt: storedAfterCrossDeviceConfirmation?.startedAt,
      }),
    );
    expect(crossDeviceScaleAfterStart).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        startedAt: storedAfterCrossDeviceConfirmation?.startedAt,
      }),
    );

    await doctor
      .post(`${base}/preparation/confirm`)
      .send({ expectedRevision: 2, impactFactorCodes: [] })
      .expect(409)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({
            code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
          }),
        );
      });
    const storedAfterRepeatedConfirmation = await administrationSessionModel
      .findById(sessionId)
      .exec();
    expect(storedAfterRepeatedConfirmation?.revision).toBe(2);
    expect(
      storedAfterRepeatedConfirmation?.controlEvents.map(
        (event) => event.action,
      ),
    ).toEqual(['entry_redeemed', 'preparation_confirmed']);

    const activeCurrent = await patient
      .get('/patient-administration/current')
      .expect(200);
    const activeBody = readBody(activeCurrent);
    const activeStep = activeBody.currentStep;
    if (!isRecord(activeStep)) {
      throw new Error('Expected a current patient step');
    }
    expect(Object.keys(activeBody).sort()).toEqual(
      ['currentStep', 'expiresAt', 'revision', 'status'].sort(),
    );
    expect(Object.keys(activeStep).sort()).toEqual(
      [
        'advanceBy',
        'assets',
        'order',
        'patientText',
        'responseMode',
        'stepKey',
      ].sort(),
    );
    const firstStepKey = readString(activeStep, 'stepKey');
    const assets = activeStep.assets;
    if (!Array.isArray(assets)) {
      throw new Error('Expected current step assets');
    }
    for (const asset of assets) {
      if (!isRecord(asset)) {
        throw new Error('Expected safe current step asset metadata');
      }
      expect(Object.keys(asset).sort()).toEqual(
        [
          'assetKey',
          'kind',
          'mimeType',
          'role',
          'technicalReplayAuthorized',
        ].sort(),
      );
      expect(asset.technicalReplayAuthorized).toBe(false);
    }
    const serializedCurrent = JSON.stringify(activeBody).toLowerCase();
    for (const forbidden of [
      'patientid',
      'visitid',
      'scaleinstanceid',
      'sessionid',
      'packagekey',
      'prompt',
      'instruction',
      'scoringrule',
      'expectedvalue',
      'filepath',
      'sha256',
      'spokentext',
      'sourcepage',
      'controlevents',
    ]) {
      expect(serializedCurrent).not.toContain(forbidden);
    }

    const beforeConflict = await administrationSessionModel
      .findById(sessionId)
      .exec();
    await doctor
      .post(`${base}/pause`)
      .send({ expectedRevision: 1, reason: 'stale write' })
      .expect(409);
    const afterConflict = await administrationSessionModel
      .findById(sessionId)
      .exec();
    expect(afterConflict?.revision).toBe(beforeConflict?.revision);
    expect(afterConflict?.controlEvents).toHaveLength(
      beforeConflict?.controlEvents.length ?? 0,
    );

    const pauseResponse = await doctor
      .post(`${base}/pause`)
      .send({ expectedRevision: 2, reason: 'short break' })
      .expect(200);
    expect(readBody(pauseResponse)).toEqual(
      expect.objectContaining({
        status: 'paused',
        revision: 3,
        hasPatientCredential: true,
      }),
    );
    expect(
      readBody(
        await patient.get('/patient-administration/current').expect(200),
      ),
    ).toEqual(expect.objectContaining({ status: 'paused', currentStep: null }));

    await doctor
      .post(`${base}/resume`)
      .send({ expectedRevision: 3, reason: 'continue' })
      .expect(200)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({ status: 'active', revision: 4 }),
        );
      });
    const resumed = readBody(
      await patient.get('/patient-administration/current').expect(200),
    );
    if (!isRecord(resumed.currentStep)) {
      throw new Error('Expected resumed current step');
    }
    expect(readString(resumed.currentStep, 'stepKey')).toBe(firstStepKey);
    expect(
      (await visitModel.findById(fixture.visit._id).lean().exec())?.startedAt,
    ).toEqual(storedAfterCrossDeviceConfirmation?.startedAt);
    expect(
      (
        await scaleInstanceModel
          .findById(fixture.scaleInstance._id)
          .lean()
          .exec()
      )?.startedAt,
    ).toEqual(storedAfterCrossDeviceConfirmation?.startedAt);

    const reissueResponse = await doctor
      .post(`${base}/entry-code/reissue`)
      .send({ expectedRevision: 4, reason: 'move to another device' })
      .expect(200);
    const reissueBody = readBody(reissueResponse);
    const newEntryCode = readString(reissueBody, 'entryCode');
    expect(reissueBody).toEqual(
      expect.objectContaining({ status: 'paused', revision: 5 }),
    );
    await patient.get('/patient-administration/current').expect(401);

    const replacementPatient = request.agent(httpServer);
    await replacementPatient
      .post('/patient-administration/enter')
      .send({ code: newEntryCode })
      .expect(200)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({ status: 'paused', revision: 6 }),
        );
      });
    expect(
      readBody(
        await replacementPatient
          .get('/patient-administration/current')
          .expect(200),
      ),
    ).toEqual(expect.objectContaining({ status: 'paused', currentStep: null }));

    await doctor
      .post(`${base}/terminate`)
      .send({ expectedRevision: 6, reason: 'assessment stopped' })
      .expect(200)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({ status: 'terminated', revision: 7 }),
        );
      });
    await replacementPatient.get('/patient-administration/current').expect(401);
  });

  it('enforces staff/patient identity separation for handoff and cross-device entry', async () => {
    const doctor = requireAgent(ACCOUNTS.doctor);
    const unpreparedFixture = await createFixture('UNPREPARED-HANDOFF');
    const unpreparedBase = staffBase(unpreparedFixture);
    const unpreparedCreated = readBody(
      await doctor
        .post(unpreparedBase)
        .send({ deviceMode: 'same_device' })
        .expect(201),
    );
    const unpreparedSessionId = readString(unpreparedCreated, 'id');
    const unpreparedBefore = await administrationSessionModel
      .findById(unpreparedSessionId)
      .select('+entryCodeHash +sessionTokenHash')
      .lean()
      .exec();
    const rejectedHandoff = await doctor
      .post(`${unpreparedBase}/handoff`)
      .send({ expectedRevision: 0 })
      .expect(409);
    expect(readBody(rejectedHandoff)).toEqual(
      expect.objectContaining({
        code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
      }),
    );
    expect(rejectedHandoff.headers['set-cookie']).toBeUndefined();
    await doctor.get('/auth/me').expect(200);
    const unpreparedAfter = await administrationSessionModel
      .findById(unpreparedSessionId)
      .select('+entryCodeHash +sessionTokenHash')
      .lean()
      .exec();
    expect(unpreparedAfter).toEqual(unpreparedBefore);

    const handoffFixture = await createFixture('HANDOFF');
    const handoffBase = staffBase(handoffFixture);
    const handoffDoctor = requireAgent(ACCOUNTS.handoffDoctor);
    const visitBefore = await visitModel
      .findById(handoffFixture.visit._id)
      .lean()
      .exec();
    const scaleInstanceBefore = await scaleInstanceModel
      .findById(handoffFixture.scaleInstance._id)
      .lean()
      .exec();
    const created = readBody(
      await handoffDoctor
        .post(handoffBase)
        .send({ deviceMode: 'same_device' })
        .expect(201),
    );
    expect(created).toEqual(
      expect.objectContaining({
        deviceMode: 'same_device',
        entryCode: null,
        entryCodeExpiresAt: null,
        status: 'prepared',
        revision: 0,
        hasPatientCredential: false,
      }),
    );
    const confirmed = readBody(
      await handoffDoctor
        .post(`${handoffBase}/preparation/confirm`)
        .send({
          expectedRevision: 0,
          impactFactorCodes: ['device_network'],
          impactFactorNote: 'practice completed',
        })
        .expect(200),
    );
    expect(confirmed).toEqual(
      expect.objectContaining({
        status: 'prepared',
        revision: 1,
        hasPatientCredential: false,
        startedAt: null,
        impactFactorCodes: ['device_network'],
        impactFactorNote: 'practice completed',
      }),
    );
    await handoffDoctor.get('/auth/me').expect(200);
    const storedBeforeHandoff = await administrationSessionModel
      .findById(readString(created, 'id'))
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(storedBeforeHandoff?.status).toBe('prepared');
    expect(storedBeforeHandoff?.revision).toBe(1);
    expect(storedBeforeHandoff?.startedAt).toBeUndefined();
    expect(storedBeforeHandoff?.entryCodeHash).toBeUndefined();
    expect(storedBeforeHandoff?.entryCodeExpiresAt).toBeUndefined();
    expect(storedBeforeHandoff?.sessionTokenHash).toBeUndefined();
    expect(
      storedBeforeHandoff?.controlEvents.map((event) => event.action),
    ).toEqual(['preparation_confirmed']);
    expect(
      await visitModel.findById(handoffFixture.visit._id).lean().exec(),
    ).toEqual(visitBefore);
    expect(
      await scaleInstanceModel
        .findById(handoffFixture.scaleInstance._id)
        .lean()
        .exec(),
    ).toEqual(scaleInstanceBefore);

    const handoffResponse = await handoffDoctor
      .post(`${handoffBase}/handoff`)
      .send({ expectedRevision: readNumber(confirmed, 'revision') })
      .expect(200);
    const handoffBody = readBody(handoffResponse);
    expect(handoffBody).toEqual(
      expect.objectContaining({
        status: 'active',
        revision: 2,
        hasPatientCredential: true,
      }),
    );
    expect(readString(handoffBody, 'startedAt')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(handoffBody)).not.toContain('token');
    await handoffDoctor.get('/auth/me').expect(401);
    const sameDeviceCurrent = readBody(
      await handoffDoctor.get('/patient-administration/current').expect(200),
    );
    expect(sameDeviceCurrent).toEqual(
      expect.objectContaining({ status: 'active', revision: 2 }),
    );
    if (!isRecord(sameDeviceCurrent.currentStep)) {
      throw new Error('Expected same-device handoff to expose a current step');
    }
    expect(readString(sameDeviceCurrent.currentStep, 'stepKey')).not.toBe('');
    const storedAfterHandoff = await administrationSessionModel
      .findById(readString(created, 'id'))
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(storedAfterHandoff).toEqual(
      expect.objectContaining({
        status: 'active',
        revision: 2,
        preparationConfirmedAt: storedBeforeHandoff?.preparationConfirmedAt,
        impactFactorCodes: ['device_network'],
        impactFactorNote: 'practice completed',
      }),
    );
    expect(storedAfterHandoff?.startedAt).toBeInstanceOf(Date);
    expect(storedAfterHandoff?.sessionTokenHash).toBeDefined();
    expect(storedAfterHandoff?.entryCodeHash).toBeUndefined();
    expect(storedAfterHandoff?.entryCodeExpiresAt).toBeUndefined();
    expect(
      storedAfterHandoff?.controlEvents.map((event) => event.action),
    ).toEqual(['preparation_confirmed', 'same_device_handoff']);
    const visitAfterHandoff = await visitModel
      .findById(handoffFixture.visit._id)
      .lean()
      .exec();
    const scaleInstanceAfterHandoff = await scaleInstanceModel
      .findById(handoffFixture.scaleInstance._id)
      .lean()
      .exec();
    expect(visitAfterHandoff).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        startedAt: storedAfterHandoff?.startedAt,
      }),
    );
    expect(scaleInstanceAfterHandoff).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        startedAt: storedAfterHandoff?.startedAt,
      }),
    );
    expect(
      await itemResponseModel.countDocuments({
        scaleInstanceId: handoffFixture.scaleInstance._id,
      }),
    ).toBe(0);
    expect(
      await mediaEvidenceModel.countDocuments({
        scaleInstanceId: handoffFixture.scaleInstance._id,
      }),
    ).toBe(0);

    const conflictFixture = await createFixture('STAFF-CONFLICT');
    const conflictBase = staffBase(conflictFixture);
    const conflictCreated = readBody(
      await doctor
        .post(conflictBase)
        .send({ deviceMode: 'cross_device' })
        .expect(201),
    );
    const conflictCode = readString(conflictCreated, 'entryCode');
    await doctor
      .post('/patient-administration/enter')
      .send({ code: conflictCode })
      .expect(409)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({
            code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
          }),
        );
      });
    const stored = await administrationSessionModel
      .findById(readString(conflictCreated, 'id'))
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(stored?.entryCodeHash).toBe(
      authService.hashSessionToken(conflictCode),
    );
    expect(stored?.sessionTokenHash).toBeUndefined();
    await request
      .agent(httpServer)
      .post('/patient-administration/enter')
      .send({ code: conflictCode })
      .expect(200);
  });

  it('safely re-hands off the same active same-device session after staff re-authentication', async () => {
    const handoffDoctor = await login(ACCOUNTS.handoffDoctor);
    const fixture = await createFixture(
      'ACTIVE-REHANDOFF',
      'supervised_patient_input',
      handoffDoctor,
    );
    const base = staffBase(fixture);
    const created = readBody(
      await handoffDoctor
        .post(base)
        .send({ deviceMode: 'same_device' })
        .expect(201),
    );
    const sessionId = readString(created, 'id');
    const confirmed = readBody(
      await handoffDoctor
        .post(`${base}/preparation/confirm`)
        .send({
          expectedRevision: 0,
          impactFactorCodes: ['device_network', 'environment'],
          impactFactorNote: 'stable preparation facts',
        })
        .expect(200),
    );
    const firstHandoffResponse = await handoffDoctor
      .post(`${base}/handoff`)
      .send({ expectedRevision: readNumber(confirmed, 'revision') })
      .expect(200);
    const firstHandoff = readBody(firstHandoffResponse);
    const originalPatientCookie = readCookiePair(
      firstHandoffResponse,
      PATIENT_ADMINISTRATION_COOKIE_NAME,
    );
    let revision = readNumber(firstHandoff, 'revision');
    expect(firstHandoff).toEqual(
      expect.objectContaining({
        id: sessionId,
        status: 'active',
        revision,
      }),
    );

    const firstCurrent = readBody(
      await handoffDoctor.get('/patient-administration/current').expect(200),
    );
    if (!isRecord(firstCurrent.currentStep)) {
      throw new Error('Expected active current step before re-handoff');
    }
    const firstStep = firstCurrent.currentStep;
    expect(readString(firstStep, 'responseMode')).toBe('speech');
    const assets = firstStep.assets;
    if (!Array.isArray(assets)) {
      throw new Error('Expected active current step assets');
    }
    let playedAudioCount = 0;
    for (const asset of assets) {
      if (!isRecord(asset) || asset.kind !== 'audio') {
        continue;
      }
      const playResponse = await handoffDoctor
        .post(
          `/patient-administration/current/audio/${readString(asset, 'assetKey')}/play`,
        )
        .send({ expectedRevision: revision })
        .expect(200);
      const revisionHeader =
        playResponse.headers['x-patient-administration-revision'];
      if (typeof revisionHeader !== 'string') {
        throw new Error('Expected patient administration revision header');
      }
      revision = Number(revisionHeader);
      if (!Number.isSafeInteger(revision)) {
        throw new Error('Expected a safe patient administration revision');
      }
      playedAudioCount += 1;
    }
    expect(playedAudioCount).toBeGreaterThan(0);

    const evidenceResponse = await handoffDoctor
      .post('/patient-administration/current/evidence')
      .field('expectedRevision', revision.toString())
      .field('evidenceType', 'audio')
      .field('durationMs', '1200')
      .attach('file', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]), {
        filename: 'active-rehandoff.webm',
        contentType: 'audio/webm;codecs=opus',
      })
      .expect(201);
    revision = readNumber(readBody(evidenceResponse), 'revision');
    const completedStep = readBody(
      await handoffDoctor
        .post('/patient-administration/current/complete')
        .send({ expectedRevision: revision })
        .expect(200),
    );
    revision = readNumber(completedStep, 'revision');

    const currentBeforeReHandoff = readBody(
      await handoffDoctor.get('/patient-administration/current').expect(200),
    );
    if (!isRecord(currentBeforeReHandoff.currentStep)) {
      throw new Error('Expected active current step after persisted facts');
    }
    const currentStepKey = readString(
      currentBeforeReHandoff.currentStep,
      'stepKey',
    );
    const storedBeforeReHandoff = await administrationSessionModel
      .findById(sessionId)
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    if (!storedBeforeReHandoff) {
      throw new Error('Expected active session before re-handoff');
    }
    expect(storedBeforeReHandoff.status).toBe('active');
    expect(storedBeforeReHandoff.currentStepKey).toBe(currentStepKey);
    expect(storedBeforeReHandoff.revision).toBe(revision);
    expect(storedBeforeReHandoff.stepCaptures.length).toBeGreaterThan(0);
    expect(storedBeforeReHandoff.playbackFacts.length).toBeGreaterThan(0);
    expect(storedBeforeReHandoff.stepEvidenceRefs.length).toBeGreaterThan(0);
    expect(Boolean(storedBeforeReHandoff.sessionTokenHash)).toBe(true);
    expect(storedBeforeReHandoff.entryCodeHash).toBeUndefined();
    expect(storedBeforeReHandoff.entryCodeExpiresAt).toBeUndefined();
    const patientTokenHashBefore = storedBeforeReHandoff.sessionTokenHash;
    const factsBefore = preservedSessionFacts(storedBeforeReHandoff);
    const eventActionsBefore = storedBeforeReHandoff.controlEvents.map(
      (event) => event.action,
    );
    const visitBeforeReHandoff = await visitModel
      .findById(fixture.visit._id)
      .lean()
      .exec();
    const scaleBeforeReHandoff = await scaleInstanceModel
      .findById(fixture.scaleInstance._id)
      .lean()
      .exec();
    const sessionCountBefore = await administrationSessionModel
      .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
      .exec();
    const itemResponseCountBefore = await itemResponseModel
      .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
      .exec();
    const mediaEvidenceCountBefore = await mediaEvidenceModel
      .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
      .exec();
    expect(sessionCountBefore).toBe(1);
    expect(itemResponseCountBefore).toBeGreaterThan(0);
    expect(mediaEvidenceCountBefore).toBeGreaterThan(0);

    await handoffDoctor
      .post('/auth/login')
      .send({ accountName: ACCOUNTS.handoffDoctor, password: PASSWORD })
      .expect(201);
    const latestSummary = readBody(await handoffDoctor.get(base).expect(200));
    expect(latestSummary).toEqual(
      expect.objectContaining({
        id: sessionId,
        status: 'active',
        currentStepKey,
        revision,
      }),
    );

    const staleResponse = await handoffDoctor
      .post(`${base}/handoff`)
      .send({ expectedRevision: revision - 1 })
      .expect(409);
    expect(readBody(staleResponse)).toEqual(
      expect.objectContaining({
        code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
      }),
    );
    expect(staleResponse.headers['set-cookie']).toBeUndefined();
    await handoffDoctor.get('/auth/me').expect(200);
    await request(httpServer)
      .get('/patient-administration/current')
      .set('Cookie', originalPatientCookie)
      .expect(200);
    const storedAfterStale = await administrationSessionModel
      .findById(sessionId)
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(preservedSessionFacts(storedAfterStale)).toEqual(factsBefore);
    expect(storedAfterStale?.revision).toBe(revision);
    expect(storedAfterStale?.sessionTokenHash === patientTokenHashBefore).toBe(
      true,
    );
    expect(
      storedAfterStale?.controlEvents.map((event) => event.action),
    ).toEqual(eventActionsBefore);

    const reHandoffResponse = await handoffDoctor
      .post(`${base}/handoff`)
      .send({ expectedRevision: revision })
      .expect(200);
    const reHandoff = readBody(reHandoffResponse);
    const replacementPatientCookie = readCookiePair(
      reHandoffResponse,
      PATIENT_ADMINISTRATION_COOKIE_NAME,
    );
    expect(reHandoff).toEqual(
      expect.objectContaining({
        id: sessionId,
        status: 'active',
        currentStepKey,
        revision: revision + 1,
        startedAt: factsBefore.startedAt,
        expiresAt: factsBefore.expiresAt,
      }),
    );
    expect(JSON.stringify(reHandoff)).not.toContain('token');
    await handoffDoctor.get('/auth/me').expect(401);
    const replacementCurrent = readBody(
      await request(httpServer)
        .get('/patient-administration/current')
        .set('Cookie', replacementPatientCookie)
        .expect(200),
    );
    expect(replacementCurrent).toEqual(
      expect.objectContaining({ status: 'active', revision: revision + 1 }),
    );
    if (!isRecord(replacementCurrent.currentStep)) {
      throw new Error('Expected current step after active re-handoff');
    }
    expect(readString(replacementCurrent.currentStep, 'stepKey')).toBe(
      currentStepKey,
    );
    await request(httpServer)
      .get('/patient-administration/current')
      .set('Cookie', originalPatientCookie)
      .expect(401);

    const storedAfterReHandoff = await administrationSessionModel
      .findById(sessionId)
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(preservedSessionFacts(storedAfterReHandoff)).toEqual(factsBefore);
    expect(storedAfterReHandoff?.revision).toBe(revision + 1);
    expect(
      Boolean(storedAfterReHandoff?.sessionTokenHash) &&
        storedAfterReHandoff?.sessionTokenHash !== patientTokenHashBefore,
    ).toBe(true);
    expect(storedAfterReHandoff?.entryCodeHash).toBeUndefined();
    expect(storedAfterReHandoff?.entryCodeExpiresAt).toBeUndefined();
    expect(
      storedAfterReHandoff?.controlEvents.map((event) => event.action),
    ).toEqual([...eventActionsBefore, 'same_device_handoff']);
    expect(
      (await visitModel.findById(fixture.visit._id).lean().exec())?.startedAt,
    ).toEqual(visitBeforeReHandoff?.startedAt);
    expect(
      (
        await scaleInstanceModel
          .findById(fixture.scaleInstance._id)
          .lean()
          .exec()
      )?.startedAt,
    ).toEqual(scaleBeforeReHandoff?.startedAt);
    expect(
      await administrationSessionModel
        .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
        .exec(),
    ).toBe(sessionCountBefore);
    expect(
      await itemResponseModel
        .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
        .exec(),
    ).toBe(itemResponseCountBefore);
    expect(
      await mediaEvidenceModel
        .countDocuments({ scaleInstanceId: fixture.scaleInstance._id })
        .exec(),
    ).toBe(mediaEvidenceCountBefore);
  });

  it('keeps paused handoff paused and resumes the same step without rewriting startedAt', async () => {
    const fixture = await createFixture('PAUSED-HANDOFF');
    const base = staffBase(fixture);
    const nurse = requireAgent(ACCOUNTS.nurse);
    const doctor = requireAgent(ACCOUNTS.doctor);
    const admin = requireAgent(ACCOUNTS.admin);
    const created = readBody(
      await nurse.post(base).send({ deviceMode: 'same_device' }).expect(201),
    );
    const confirmed = readBody(
      await nurse
        .post(`${base}/preparation/confirm`)
        .send({
          expectedRevision: 0,
          impactFactorCodes: ['environment'],
          impactFactorNote: 'quiet room',
        })
        .expect(200),
    );
    const initialHandoff = readBody(
      await nurse
        .post(`${base}/handoff`)
        .send({ expectedRevision: readNumber(confirmed, 'revision') })
        .expect(200),
    );
    const activeCurrent = readBody(
      await nurse.get('/patient-administration/current').expect(200),
    );
    if (!isRecord(activeCurrent.currentStep)) {
      throw new Error('Expected an active step before paused handoff');
    }
    const activeStepKey = readString(activeCurrent.currentStep, 'stepKey');
    const activeSession = await administrationSessionModel
      .findById(readString(created, 'id'))
      .exec();
    const originalStartedAt = activeSession?.startedAt;
    const originalPreparationConfirmedAt =
      activeSession?.preparationConfirmedAt;
    expect(originalStartedAt).toBeInstanceOf(Date);
    expect(
      (await visitModel.findById(fixture.visit._id).lean().exec())?.startedAt,
    ).toEqual(originalStartedAt);
    expect(
      (
        await scaleInstanceModel
          .findById(fixture.scaleInstance._id)
          .lean()
          .exec()
      )?.startedAt,
    ).toEqual(originalStartedAt);

    await doctor
      .post(`${base}/pause`)
      .send({
        expectedRevision: readNumber(initialHandoff, 'revision'),
        reason: 'device transfer',
      })
      .expect(200)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({ status: 'paused', revision: 3 }),
        );
      });
    const handoffResponse = await doctor
      .post(`${base}/handoff`)
      .send({ expectedRevision: 3 })
      .expect(200);
    expect(readBody(handoffResponse)).toEqual(
      expect.objectContaining({
        status: 'paused',
        revision: 4,
        startedAt: originalStartedAt?.toISOString(),
      }),
    );
    await doctor.get('/auth/me').expect(401);
    await nurse.get('/patient-administration/current').expect(401);
    expect(
      readBody(await doctor.get('/patient-administration/current').expect(200)),
    ).toEqual(
      expect.objectContaining({
        status: 'paused',
        revision: 4,
        currentStep: null,
      }),
    );
    const storedAfterHandoff = await administrationSessionModel
      .findById(readString(created, 'id'))
      .exec();
    expect(storedAfterHandoff?.status).toBe('paused');
    expect(storedAfterHandoff?.startedAt).toEqual(originalStartedAt);
    expect(storedAfterHandoff?.preparationConfirmedAt).toEqual(
      originalPreparationConfirmedAt,
    );
    expect(storedAfterHandoff?.impactFactorCodes).toEqual(['environment']);
    expect(storedAfterHandoff?.impactFactorNote).toBe('quiet room');

    await admin
      .post(`${base}/resume`)
      .send({ expectedRevision: 4, reason: 'continue after transfer' })
      .expect(200)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({ status: 'active', revision: 5 }),
        );
      });
    const resumedCurrent = readBody(
      await doctor.get('/patient-administration/current').expect(200),
    );
    if (!isRecord(resumedCurrent.currentStep)) {
      throw new Error('Expected the same active step after resume');
    }
    expect(readString(resumedCurrent.currentStep, 'stepKey')).toBe(
      activeStepKey,
    );
    const resumedSession = await administrationSessionModel
      .findById(readString(created, 'id'))
      .exec();
    expect(resumedSession?.startedAt).toEqual(originalStartedAt);
    expect(resumedSession?.controlEvents.map((event) => event.action)).toEqual([
      'preparation_confirmed',
      'same_device_handoff',
      'paused',
      'same_device_handoff',
      'resumed',
    ]);
    expect(
      (await visitModel.findById(fixture.visit._id).lean().exec())?.startedAt,
    ).toEqual(originalStartedAt);
    expect(
      (
        await scaleInstanceModel
          .findById(fixture.scaleInstance._id)
          .lean()
          .exec()
      )?.startedAt,
    ).toEqual(originalStartedAt);
    await login(ACCOUNTS.doctor);
  });

  it('fails closed for mode, lock, barrier, ownership, DTO, and still permits safety pause/terminate', async () => {
    const doctor = requireAgent(ACCOUNTS.doctor);
    const clinician = await createFixture(
      'CLINICIAN',
      'clinician_administered',
    );
    await doctor
      .post(staffBase(clinician))
      .send({ deviceMode: 'same_device' })
      .expect(409);

    const locked = await createFixture('LOCKED-CREATE');
    await scaleInstanceModel
      .updateOne(
        { _id: locked.scaleInstance._id },
        { $set: { lockedAt: new Date() } },
      )
      .exec();
    await doctor
      .post(staffBase(locked))
      .send({ deviceMode: 'same_device' })
      .expect(409);

    const barrier = await createFixture('BARRIER-CREATE');
    await scaleInstanceModel
      .updateOne(
        { _id: barrier.scaleInstance._id },
        { $set: { submissionWriteBarrier: { broken: true } } },
      )
      .exec();
    await doctor
      .post(staffBase(barrier))
      .send({ deviceMode: 'same_device' })
      .expect(409);

    const safety = await createFixture('SAFETY');
    const safetyBase = staffBase(safety);
    const safetyCreated = readBody(
      await doctor
        .post(safetyBase)
        .send({ deviceMode: 'cross_device' })
        .expect(201),
    );
    const safetyPatient = request.agent(httpServer);
    await safetyPatient
      .post('/patient-administration/enter')
      .send({ code: readString(safetyCreated, 'entryCode') })
      .expect(200);
    await doctor
      .post(`${safetyBase}/preparation/confirm`)
      .send({ expectedRevision: 1, impactFactorCodes: [] })
      .expect(200);
    await scaleInstanceModel
      .updateOne(
        { _id: safety.scaleInstance._id },
        { $set: { lockedAt: new Date() } },
      )
      .exec();
    await doctor
      .post(`${safetyBase}/pause`)
      .send({ expectedRevision: 2, reason: 'safety control' })
      .expect(200);
    await doctor
      .post(`${safetyBase}/resume`)
      .send({ expectedRevision: 3 })
      .expect(409)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({ code: 'SCALE_INSTANCE_NOT_EDITABLE' }),
        );
      });
    await doctor
      .post(`${safetyBase}/terminate`)
      .send({ expectedRevision: 3, reason: 'remain stopped' })
      .expect(200);

    const owner = await createFixture('OWNER');
    const other = await createFixture('OTHER');
    await doctor
      .get(
        `/patients/${other.patient._id.toString()}/visits/${owner.visit._id.toString()}/scale-instances/${owner.scaleInstance._id.toString()}/patient-administration`,
      )
      .expect(404)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({ code: 'VISIT_NOT_FOUND' }),
        );
      });
    await doctor
      .get(
        `/patients/${owner.patient._id.toString()}/visits/${owner.visit._id.toString()}/scale-instances/${other.scaleInstance._id.toString()}/patient-administration`,
      )
      .expect(404)
      .expect((response: Response) => {
        expect(readBody(response)).toEqual(
          expect.objectContaining({ code: 'SCALE_INSTANCE_NOT_FOUND' }),
        );
      });

    const forged = await createFixture('FORGED-BODY');
    await doctor
      .post(staffBase(forged))
      .send({
        deviceMode: 'same_device',
        status: 'active',
        patientId: new Types.ObjectId().toString(),
      })
      .expect(400);
    expect(
      await administrationSessionModel
        .countDocuments({ scaleInstanceId: forged.scaleInstance._id })
        .exec(),
    ).toBe(0);
  });

  it('creates only the three non-TTL contract indexes in standard_test', async () => {
    expect(scaleSeedDataService.validateScaleSeeds().valid).toBe(true);
    await administrationSessionModel.init();
    const indexes = await administrationSessionModel.collection.indexes();
    const contractIndexes = indexes.filter((index) => index.name !== '_id_');
    expect(contractIndexes).toHaveLength(3);
    expect(contractIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: { scaleInstanceId: 1 },
          unique: true,
          partialFilterExpression: {
            status: { $in: ['prepared', 'active', 'paused'] },
          },
        }),
        expect.objectContaining({
          key: { entryCodeHash: 1 },
          unique: true,
          sparse: true,
        }),
        expect.objectContaining({
          key: { sessionTokenHash: 1 },
          unique: true,
          sparse: true,
        }),
      ]),
    );
    for (const index of indexes) {
      expect(index).not.toHaveProperty('expireAfterSeconds');
    }
  });
});
