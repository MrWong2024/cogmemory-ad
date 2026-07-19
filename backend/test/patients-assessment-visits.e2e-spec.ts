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
  Session,
  SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  Patient,
  PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const DOCTOR_ACCOUNT = 'doctor-a12-test';
const SYSTEM_ACCOUNT = 'system-a12-test';
const TEST_PATIENT_PREFIX = 'SUBJ-A12-TEST-';
const TEST_VISIT_PREFIX = 'VISIT-A12-TEST-';

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

describe('patient and assessment visit public APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let assessmentVisitModel: Model<AssessmentVisitDocument>;
  let doctorAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let doctorUserId: Types.ObjectId;
  let httpServer: SupertestApp;
  let modelsReady = false;

  async function cleanupA12Data(): Promise<void> {
    const testUsers = await userModel
      .find({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .select({ _id: 1 })
      .exec();
    const userIds = testUsers.map((user) => user._id);

    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }

    await assessmentVisitModel
      .deleteMany({ visitCode: /^VISIT-A12-TEST-/ })
      .exec();
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A12-TEST-/ }).exec();
    await userModel
      .deleteMany({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .exec();
  }

  function createPatient(
    subjectSuffix: string,
    overrides: Record<string, unknown> = {},
  ): SupertestTest {
    return doctorAgent.post('/patients').send({
      subjectCode: `${TEST_PATIENT_PREFIX}${subjectSuffix}`,
      displayName: `A12 Test Subject ${subjectSuffix}`,
      ...overrides,
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
    userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    sessionModel = app.get<Model<SessionDocument>>(getModelToken(Session.name));
    patientModel = app.get<Model<PatientDocument>>(getModelToken(Patient.name));
    assessmentVisitModel = app.get<Model<AssessmentVisitDocument>>(
      getModelToken(AssessmentVisit.name),
    );
    modelsReady = true;

    await cleanupA12Data();

    const passwordHash = await authService.hashPassword('A12-Test-Password!');
    const doctorUser = await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A12 Doctor Test Operator',
      staffCode: 'STAFF-A12-TEST',
      email: 'doctor-a12-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A12 System Test Operator',
      staffCode: 'SYSTEM-A12-TEST',
      email: 'system-a12-test@example.test',
      passwordHash,
      roles: ['system'],
      permissions: [],
      userType: 'system',
      status: 'active',
      metadata: null,
    });
    doctorUserId = doctorUser._id;

    httpServer = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
    doctorAgent = request.agent(httpServer);
    systemAgent = request.agent(httpServer);

    await doctorAgent
      .post('/auth/login')
      .send({
        accountName: DOCTOR_ACCOUNT,
        password: 'A12-Test-Password!',
      })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({
        accountName: SYSTEM_ACCOUNT,
        password: 'A12-Test-Password!',
      })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      if (modelsReady) {
        await cleanupA12Data();
      }

      await app.close();
    }
  });

  it('enforces 401 for unauthenticated requests and 403 for unsupported roles', async () => {
    await request(httpServer).get('/patients').expect(401);
    await systemAgent.get('/patients').expect(403);
  });

  it('creates a safe patient response and returns stable duplicate semantics', async () => {
    const response = await createPatient('CREATE', {
      sourceType: 'research',
      sex: 'unknown',
      educationYears: 12,
      tags: ['a12-test'],
      notes: 'De-identified A12 test note',
    }).expect(201);
    const responseBody = readResponseBody(response);

    expect(responseBody).toEqual(
      expect.objectContaining({
        subjectCode: 'SUBJ-A12-TEST-CREATE',
        sourceType: 'research',
        status: 'active',
      }),
    );
    expect(responseBody).not.toHaveProperty('externalRefs');
    expect(responseBody).not.toHaveProperty('metadata');
    expect(responseBody).not.toHaveProperty('__v');

    const duplicate = await createPatient('CREATE').expect(409);
    expect(readResponseBody(duplicate)).toEqual(
      expect.objectContaining({
        code: 'PATIENT_SUBJECT_CODE_CONFLICT',
      }),
    );
  });

  it('supports patient pagination, keyword filtering, detail, and path errors', async () => {
    const first = await createPatient('LIST-001').expect(201);
    const firstBody = readResponseBody(first);
    const firstPatientId = readString(firstBody, 'id');
    await createPatient('LIST-002').expect(201);

    const list = await doctorAgent
      .get('/patients')
      .query({ page: 1, pageSize: 1, keyword: 'LIST-001', status: 'active' })
      .expect(200);
    const listBody = readResponseBody(list);
    expect(listBody).toEqual(
      expect.objectContaining({ page: 1, pageSize: 1, total: 1 }),
    );
    expect(listBody.items).toEqual([
      expect.objectContaining({ subjectCode: 'SUBJ-A12-TEST-LIST-001' }),
    ]);

    const detail = await doctorAgent
      .get(`/patients/${firstPatientId}`)
      .expect(200);
    const detailBody = readResponseBody(detail);
    expect(detailBody).toEqual(expect.objectContaining({ id: firstPatientId }));
    expect(detailBody).not.toHaveProperty('externalRefs');
    expect(detailBody).not.toHaveProperty('metadata');

    await doctorAgent.get('/patients/not-a-mongo-id').expect(400);
    const missing = await doctorAgent
      .get(`/patients/${new Types.ObjectId().toString()}`)
      .expect(404);
    expect(readString(readResponseBody(missing), 'code')).toBe(
      'PATIENT_NOT_FOUND',
    );
  });

  it('rejects non-whitelisted patient and visit fields', async () => {
    await doctorAgent
      .post('/patients')
      .send({
        subjectCode: 'SUBJ-A12-TEST-FORGED',
        status: 'archived',
        externalRefs: { forged: true },
        metadata: { forged: true },
      })
      .expect(400);

    const patient = await createPatient('VISIT-WHITELIST').expect(201);
    const patientId = readString(readResponseBody(patient), 'id');
    await doctorAgent
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: 'VISIT-A12-TEST-FORGED',
        assessmentDate: '2026-01-01T08:00:00.000Z',
        status: 'completed',
        operatorSnapshot: { operatorName: 'Forged Operator' },
        completedAt: '2026-01-01T09:00:00.000Z',
        clinicalContext: { forged: true },
        metadata: { forged: true },
      })
      .expect(400);
  });

  it('creates and lists visits from server-owned patient and operator data', async () => {
    const patient = await createPatient('VISIT-CREATE').expect(201);
    const patientBody = readResponseBody(patient);
    const patientId = readString(patientBody, 'id');
    const subjectCode = readString(patientBody, 'subjectCode');
    const assessmentDate = '2026-02-01T08:00:00.000Z';
    const created = await doctorAgent
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: `${TEST_VISIT_PREFIX}CREATE`,
        visitType: 'follow_up',
        assessmentDate,
        notes: 'De-identified visit note',
      })
      .expect(201);
    const createdBody = readResponseBody(created);

    expect(createdBody).toEqual(
      expect.objectContaining({
        patientId,
        subjectCode,
        visitCode: 'VISIT-A12-TEST-CREATE',
        visitType: 'follow_up',
        status: 'draft',
        operatorSnapshot: {
          operatorId: doctorUserId.toString(),
          operatorName: 'A12 Doctor Test Operator',
          operatorRole: 'doctor',
        },
      }),
    );
    expect(createdBody).not.toHaveProperty('clinicalContext');
    expect(createdBody).not.toHaveProperty('metadata');

    const duplicate = await doctorAgent
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: `${TEST_VISIT_PREFIX}CREATE`,
        assessmentDate,
      })
      .expect(409);
    expect(readString(readResponseBody(duplicate), 'code')).toBe(
      'VISIT_CODE_CONFLICT',
    );

    const list = await doctorAgent
      .get(`/patients/${patientId}/visits`)
      .query({
        page: 1,
        pageSize: 1,
        status: 'draft',
        visitType: 'follow_up',
        dateFrom: '2026-02-01T00:00:00.000Z',
        dateTo: '2026-02-02T00:00:00.000Z',
      })
      .expect(200);
    const listBody = readResponseBody(list);
    expect(listBody).toEqual(
      expect.objectContaining({ page: 1, pageSize: 1, total: 1 }),
    );
    expect(listBody.items).toEqual([
      expect.objectContaining({ visitCode: 'VISIT-A12-TEST-CREATE' }),
    ]);
  });

  it('returns stable visit patient-state, missing-patient, and date-range errors', async () => {
    const inactivePatient = await patientModel.create({
      subjectCode: 'SUBJ-A12-TEST-INACTIVE',
      displayName: 'A12 Inactive Test Subject',
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'inactive',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    const inactiveResponse = await doctorAgent
      .post(`/patients/${inactivePatient._id.toString()}/visits`)
      .send({
        visitCode: 'VISIT-A12-TEST-INACTIVE',
        assessmentDate: '2026-03-01T08:00:00.000Z',
      })
      .expect(409);
    expect(readString(readResponseBody(inactiveResponse), 'code')).toBe(
      'PATIENT_NOT_ACTIVE',
    );

    const archivedPatient = await patientModel.create({
      subjectCode: 'SUBJ-A12-TEST-ARCHIVED',
      displayName: 'A12 Archived Test Subject',
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'archived',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    const archivedResponse = await doctorAgent
      .post(`/patients/${archivedPatient._id.toString()}/visits`)
      .send({
        visitCode: 'VISIT-A12-TEST-ARCHIVED',
        assessmentDate: '2026-03-02T08:00:00.000Z',
      })
      .expect(409);
    expect(readString(readResponseBody(archivedResponse), 'code')).toBe(
      'PATIENT_NOT_ACTIVE',
    );

    const missingPatientId = new Types.ObjectId().toString();
    const missing = await doctorAgent
      .get(`/patients/${missingPatientId}/visits`)
      .expect(404);
    expect(readString(readResponseBody(missing), 'code')).toBe(
      'PATIENT_NOT_FOUND',
    );

    const patient = await createPatient('DATE-RANGE').expect(201);
    const patientId = readString(readResponseBody(patient), 'id');
    const invalidRange = await doctorAgent
      .get(`/patients/${patientId}/visits`)
      .query({
        dateFrom: '2026-04-02T00:00:00.000Z',
        dateTo: '2026-04-01T00:00:00.000Z',
      })
      .expect(400);
    expect(readString(readResponseBody(invalidRange), 'code')).toBe(
      'INVALID_DATE_RANGE',
    );
  });

  it('never returns authentication credentials in clinical API bodies', async () => {
    const response = await doctorAgent.get('/patients').expect(200);
    const serializedBody = JSON.stringify(
      readResponseBody(response),
    ).toLowerCase();

    expect(serializedBody).not.toContain('passwordhash');
    expect(serializedBody).not.toContain('sessiontoken');
    expect(serializedBody).not.toContain('tokenhash');
    expect(serializedBody).not.toContain('set-cookie');
    expect(serializedBody).not.toContain('credential');
    expect(serializedBody).not.toContain('secret');
  });
});
