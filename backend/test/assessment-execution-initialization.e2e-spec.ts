import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import request, { type Response, type Test as SupertestTest } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { requireInitialized } from './support/e2e-initialization';
import {
  AssessmentVisit,
  AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  ItemResponseDocument,
} from '../src/modules/assessments/schemas/item-response.schema';
import {
  ScaleInstance,
  ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import {
  Session,
  SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  Patient,
  PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ScaleDefinition,
  ScaleDefinitionDocument,
} from '../src/modules/scales/schemas/scale-definition.schema';
import {
  ScaleVersion,
  ScaleVersionDocument,
} from '../src/modules/scales/schemas/scale-version.schema';
import { ScaleSeedDataService } from '../src/modules/scales/seeds/scale-seed-data.service';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const DOCTOR_ACCOUNT = 'doctor-a13-test';
const SYSTEM_ACCOUNT = 'system-a13-test';
const TEST_PATIENT_PREFIX = 'SUBJ-A13-TEST-';
const TEST_VISIT_PREFIX = 'VISIT-A13-TEST-';
const TEST_SCALE_CODES = ['mmse', 'moca'];

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readResponseBody(response: Response): Record<string, unknown> {
  const body: unknown = response.body;

  if (!isRecord(body)) {
    throw new Error('Expected an object response body');
  }

  return body;
}

function readString(
  record: Record<string, unknown>,
  propertyName: string,
): string {
  const value = record[propertyName];

  if (typeof value !== 'string') {
    throw new Error(`Expected ${propertyName} to be a string`);
  }

  return value;
}

function readArray(
  record: Record<string, unknown>,
  propertyName: string,
): unknown[] {
  const value = record[propertyName];

  if (!Array.isArray(value)) {
    throw new Error(`Expected ${propertyName} to be an array`);
  }

  return value;
}

describe('assessment execution initialization public APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let authService: AuthService;
  let scaleSeedDataService: ScaleSeedDataService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let assessmentVisitModel: Model<AssessmentVisitDocument>;
  let scaleInstanceModel: Model<ScaleInstanceDocument>;
  let itemResponseModel: Model<ItemResponseDocument>;
  let scaleDefinitionModel: Model<ScaleDefinitionDocument>;
  let scaleVersionModel: Model<ScaleVersionDocument>;
  let doctorAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let httpServer: SupertestApp;
  let modelsReady = false;

  async function cleanupA13Data(): Promise<void> {
    const testUsers = await userModel
      .find({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .select({ _id: 1 })
      .exec();
    const userIds = testUsers.map((user) => user._id);

    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }

    const visits = await assessmentVisitModel
      .find({ visitCode: /^VISIT-A13-TEST-/ })
      .select({ _id: 1 })
      .exec();
    const visitIds = visits.map((visit) => visit._id);
    const scaleInstances =
      visitIds.length > 0
        ? await scaleInstanceModel
            .find({ assessmentVisitId: { $in: visitIds } })
            .select({ _id: 1 })
            .exec()
        : [];
    const scaleInstanceIds = scaleInstances.map((scale) => scale._id);

    if (scaleInstanceIds.length > 0) {
      await itemResponseModel
        .deleteMany({ scaleInstanceId: { $in: scaleInstanceIds } })
        .exec();
      await scaleInstanceModel
        .deleteMany({ _id: { $in: scaleInstanceIds } })
        .exec();
    }

    if (visitIds.length > 0) {
      await assessmentVisitModel.deleteMany({ _id: { $in: visitIds } }).exec();
    }

    await patientModel.deleteMany({ subjectCode: /^SUBJ-A13-TEST-/ }).exec();
    await userModel
      .deleteMany({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .exec();

    const definitions = await scaleDefinitionModel
      .find({ code: { $in: TEST_SCALE_CODES } })
      .select({ _id: 1 })
      .exec();
    const definitionIds = definitions.map((definition) => definition._id);

    if (definitionIds.length > 0) {
      await scaleVersionModel
        .deleteMany({ scaleDefinitionId: { $in: definitionIds } })
        .exec();
      await scaleDefinitionModel
        .deleteMany({ _id: { $in: definitionIds } })
        .exec();
    }
  }

  function createPatient(
    suffix: string,
    overrides: Record<string, unknown> = {},
  ): SupertestTest {
    return doctorAgent.post('/patients').send({
      subjectCode: `${TEST_PATIENT_PREFIX}${suffix}`,
      displayName: `A13 De-identified Subject ${suffix}`,
      ...overrides,
    });
  }

  function createVisit(
    patientId: string,
    suffix: string,
    overrides: Record<string, unknown> = {},
  ): SupertestTest {
    return doctorAgent.post(`/patients/${patientId}/visits`).send({
      visitCode: `${TEST_VISIT_PREFIX}${suffix}`,
      assessmentDate: '2026-06-01T08:00:00.000Z',
      ...overrides,
    });
  }

  async function createDirectPatient(
    suffix: string,
    status: 'active' | 'inactive' | 'archived' = 'active',
  ): Promise<PatientDocument> {
    return patientModel.create({
      subjectCode: `${TEST_PATIENT_PREFIX}${suffix}`,
      displayName: `A13 De-identified Subject ${suffix}`,
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status,
      tags: ['a13-test'],
      externalRefs: null,
      metadata: null,
    });
  }

  async function createDirectVisit(
    patient: PatientDocument,
    suffix: string,
    status: 'draft' | 'in_progress' | 'completed' | 'locked' | 'voided',
  ): Promise<AssessmentVisitDocument> {
    return assessmentVisitModel.create({
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      visitCode: `${TEST_VISIT_PREFIX}${suffix}`,
      visitType: 'baseline',
      status,
      assessmentDate: new Date('2026-06-02T08:00:00.000Z'),
      startedAt: null,
      completedAt: status === 'completed' ? new Date() : null,
      lockedAt: status === 'locked' ? new Date() : null,
      voidedAt: status === 'voided' ? new Date() : null,
      operatorSnapshot: null,
      clinicalContext: null,
      metadata: null,
    });
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('E2E requires NODE_ENV=test');
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    const databaseName = connection.name.toLowerCase();

    if (!databaseName.includes('_test')) {
      throw new Error('E2E database name must follow the test naming rule');
    }

    if (databaseName.includes('_dev') || databaseName.includes('_prod')) {
      throw new Error('E2E must not connect to development or production');
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
    userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    sessionModel = app.get<Model<SessionDocument>>(getModelToken(Session.name));
    patientModel = app.get<Model<PatientDocument>>(getModelToken(Patient.name));
    assessmentVisitModel = app.get<Model<AssessmentVisitDocument>>(
      getModelToken(AssessmentVisit.name),
    );
    scaleInstanceModel = app.get<Model<ScaleInstanceDocument>>(
      getModelToken(ScaleInstance.name),
    );
    itemResponseModel = app.get<Model<ItemResponseDocument>>(
      getModelToken(ItemResponse.name),
    );
    scaleDefinitionModel = app.get<Model<ScaleDefinitionDocument>>(
      getModelToken(ScaleDefinition.name),
    );
    scaleVersionModel = app.get<Model<ScaleVersionDocument>>(
      getModelToken(ScaleVersion.name),
    );
    modelsReady = true;

    await cleanupA13Data();

    const passwordHash = await authService.hashPassword('A13-Test-Password!');
    await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A13 Doctor Test Operator',
      staffCode: 'STAFF-A13-TEST',
      email: 'doctor-a13-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A13 System Test Operator',
      staffCode: 'SYSTEM-A13-TEST',
      email: 'system-a13-test@example.test',
      passwordHash,
      roles: ['system'],
      permissions: [],
      userType: 'system',
      status: 'active',
      metadata: null,
    });

    httpServer = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
    doctorAgent = request.agent(httpServer);
    systemAgent = request.agent(httpServer);

    await doctorAgent
      .post('/auth/login')
      .send({ accountName: DOCTOR_ACCOUNT, password: 'A13-Test-Password!' })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({ accountName: SYSTEM_ACCOUNT, password: 'A13-Test-Password!' })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      if (modelsReady) {
        await cleanupA13Data();
      }

      await app.close();
    }
  });

  it('enforces authentication and the confirmed clinical roles', async () => {
    await request(httpServer).get('/scales/available').expect(401);
    await systemAgent.get('/scales/available').expect(403);
  });

  it('returns MMSE and MoCA catalog summaries without full configuration', async () => {
    const response = await doctorAgent.get('/scales/available').expect(200);
    const body = readResponseBody(response);
    const items = readArray(body, 'items');

    expect(items).toHaveLength(2);
    expect(items).toEqual([
      expect.objectContaining({
        code: 'mmse',
        version: '1.0',
        groupCount: 6,
        itemCount: 11,
      }),
      expect.objectContaining({
        code: 'moca',
        version: '1.0',
        groupCount: 8,
        itemCount: 16,
      }),
    ]);
    for (const item of items) {
      if (!isRecord(item)) {
        throw new Error('Expected a scale catalog item object');
      }

      expect(item).not.toHaveProperty('groups');
      expect(item).not.toHaveProperty('items');
      expect(item).not.toHaveProperty('scoringRule');
      expect(item).not.toHaveProperty('expectedValue');
    }
    expect(await scaleDefinitionModel.countDocuments({}).exec()).toBe(0);
    expect(await scaleVersionModel.countDocuments({}).exec()).toBe(0);
  });

  it('creates MMSE and MoCA executions and returns safe visit detail', async () => {
    const patientResponse = await createPatient('MAIN').expect(201);
    const patientId = readString(readResponseBody(patientResponse), 'id');
    const visitResponse = await createVisit(patientId, 'MAIN').expect(201);
    const visitId = readString(readResponseBody(visitResponse), 'id');

    const initialDetail = await doctorAgent
      .get(`/patients/${patientId}/visits/${visitId}`)
      .expect(200);
    expect(
      readArray(readResponseBody(initialDetail), 'scaleInstances'),
    ).toEqual([]);

    const mmseResponse = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({ scaleCode: ' MMSE ' })
      .expect(201);
    const mmseBody = readResponseBody(mmseResponse);
    const mmseScale = mmseBody.scale;
    const mmseScaleInstance = mmseBody.scaleInstance;

    if (!isRecord(mmseScale) || !isRecord(mmseScaleInstance)) {
      throw new Error('Expected scale and scaleInstance response objects');
    }

    expect(mmseBody.createdItemResponseCount).toBe(11);
    expect(mmseScale).toEqual(
      expect.objectContaining({ code: 'mmse', version: '1.0' }),
    );
    expect(mmseScaleInstance).toEqual(
      expect.objectContaining({
        assessmentVisitId: visitId,
        patientId,
        scaleCode: 'mmse',
        instanceCode: `INST-${visitId.toUpperCase()}-MMSE-1`,
        instanceNo: 1,
        status: 'draft',
        startedAt: null,
        progress: { totalItemCount: 11, answeredItemCount: 0 },
      }),
    );
    expect(mmseBody).not.toHaveProperty('itemResponses');

    const mmseDefinition = await scaleDefinitionModel
      .findOne({ code: 'mmse' })
      .exec();
    expect(mmseDefinition).not.toBeNull();
    const mmseVersion = await scaleVersionModel
      .findOne({ scaleCode: 'mmse', version: '1.0' })
      .exec();
    expect(mmseVersion).not.toBeNull();
    expect(mmseDefinition?.currentVersionId?.toString()).toBe(
      mmseVersion?._id.toString(),
    );
    expect(mmseVersion?.items).toHaveLength(11);

    const mmseInstance = await scaleInstanceModel
      .findOne({ assessmentVisitId: visitId, scaleCode: 'mmse' })
      .exec();
    expect(mmseInstance).not.toBeNull();
    expect(
      await itemResponseModel
        .countDocuments({ scaleInstanceId: mmseInstance?._id })
        .exec(),
    ).toBe(11);

    const duplicate = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({ scaleCode: 'mmse' })
      .expect(409);
    expect(readString(readResponseBody(duplicate), 'code')).toBe(
      'SCALE_INSTANCE_ALREADY_EXISTS',
    );

    const mocaResponse = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({
        scaleCode: 'moca',
        scaleVersion: '1.0',
        administrationMode: 'supervised_patient_input',
      })
      .expect(201);
    expect(readResponseBody(mocaResponse)).toEqual(
      expect.objectContaining({ createdItemResponseCount: 16 }),
    );

    const detail = await doctorAgent
      .get(`/patients/${patientId}/visits/${visitId}`)
      .expect(200);
    const detailBody = readResponseBody(detail);
    const scaleInstances = readArray(detailBody, 'scaleInstances');
    expect(scaleInstances).toEqual([
      expect.objectContaining({ scaleCode: 'mmse', instanceNo: 1 }),
      expect.objectContaining({
        scaleCode: 'moca',
        instanceNo: 1,
        administrationMode: 'supervised_patient_input',
      }),
    ]);
    const serializedDetail = JSON.stringify(detailBody).toLowerCase();
    expect(serializedDetail).not.toContain('scaledefinitionid');
    expect(serializedDetail).not.toContain('scaleversionid');
    expect(serializedDetail).not.toContain('metadata');
    expect(serializedDetail).not.toContain('qualitycontrolsummary');
    expect(serializedDetail).not.toContain('passwordhash');
    expect(serializedDetail).not.toContain('sessiontoken');
    expect(serializedDetail).not.toContain('set-cookie');
  });

  it('rejects inactive patients and non-initializable visit states', async () => {
    const inactivePatient = await createDirectPatient('INACTIVE', 'inactive');
    const inactiveVisit = await createDirectVisit(
      inactivePatient,
      'INACTIVE',
      'draft',
    );
    const inactiveResponse = await doctorAgent
      .post(
        `/patients/${inactivePatient._id.toString()}/visits/${inactiveVisit._id.toString()}/scale-instances`,
      )
      .send({ scaleCode: 'mmse' })
      .expect(409);
    expect(readString(readResponseBody(inactiveResponse), 'code')).toBe(
      'PATIENT_NOT_ACTIVE',
    );

    const activePatient = await createDirectPatient('BLOCKED-STATES');

    for (const status of ['completed', 'locked', 'voided'] as const) {
      const visit = await createDirectVisit(
        activePatient,
        `BLOCKED-${status}`,
        status,
      );
      const response = await doctorAgent
        .post(
          `/patients/${activePatient._id.toString()}/visits/${visit._id.toString()}/scale-instances`,
        )
        .send({ scaleCode: 'moca' })
        .expect(409);
      expect(readString(readResponseBody(response), 'code')).toBe(
        'VISIT_NOT_INITIALIZABLE',
      );
    }
  });

  it('enforces visit ownership, path validation, and safe not-found semantics', async () => {
    const owner = await createDirectPatient('OWNER');
    const otherPatient = await createDirectPatient('OTHER');
    const visit = await createDirectVisit(owner, 'OWNERSHIP', 'draft');
    const mismatched = await doctorAgent
      .get(
        `/patients/${otherPatient._id.toString()}/visits/${visit._id.toString()}`,
      )
      .expect(404);
    expect(readString(readResponseBody(mismatched), 'code')).toBe(
      'VISIT_NOT_FOUND',
    );

    const initializeMismatch = await doctorAgent
      .post(
        `/patients/${otherPatient._id.toString()}/visits/${visit._id.toString()}/scale-instances`,
      )
      .send({ scaleCode: 'mmse' })
      .expect(404);
    expect(readString(readResponseBody(initializeMismatch), 'code')).toBe(
      'VISIT_NOT_FOUND',
    );

    await doctorAgent
      .get(`/patients/not-a-mongo-id/visits/${visit._id.toString()}`)
      .expect(400);
    await doctorAgent
      .get(`/patients/${owner._id.toString()}/visits/not-a-mongo-id`)
      .expect(400);
  });

  it('rejects unavailable scales, versions, and forged server fields', async () => {
    const patientResponse = await createPatient('VALIDATION').expect(201);
    const patientId = readString(readResponseBody(patientResponse), 'id');
    const visitResponse = await createVisit(patientId, 'VALIDATION').expect(
      201,
    );
    const visitId = readString(readResponseBody(visitResponse), 'id');

    const unavailableScale = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({ scaleCode: 'unknown' })
      .expect(404);
    expect(readString(readResponseBody(unavailableScale), 'code')).toBe(
      'SCALE_NOT_AVAILABLE',
    );

    const unavailableVersion = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({ scaleCode: 'mmse', scaleVersion: '9.9' })
      .expect(404);
    expect(readString(readResponseBody(unavailableVersion), 'code')).toBe(
      'SCALE_VERSION_NOT_AVAILABLE',
    );

    await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({
        scaleCode: 'mmse',
        patientId,
        assessmentVisitId: visitId,
        subjectCode: 'FORGED',
        scaleDefinitionId: new Types.ObjectId().toString(),
        scaleVersionId: new Types.ObjectId().toString(),
        instanceCode: 'FORGED',
        instanceNo: 2,
        status: 'completed',
        operatorSnapshot: { operatorName: 'Forged' },
        progress: { answeredItemCount: 99 },
        metadata: { hidden: true },
      })
      .expect(400);
  });

  it('keeps ItemResponse counts aligned with validated built-in seeds', () => {
    const validation = scaleSeedDataService.validateScaleSeeds();
    const seeds = scaleSeedDataService.getAllScaleSeeds();

    expect(validation.valid).toBe(true);
    expect(
      seeds.map((seed) => ({
        code: seed.definition.code,
        itemCount: seed.version.items.length,
      })),
    ).toEqual([
      { code: 'mmse', itemCount: 11 },
      { code: 'moca', itemCount: 16 },
    ]);
  });
});
