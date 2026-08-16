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
  PatientAdministrationSession,
  PatientAdministrationSessionDocument,
} from '../src/modules/assessments/schemas/patient-administration-session.schema';
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

function readRecord(
  record: Record<string, unknown>,
  propertyName: string,
): Record<string, unknown> {
  const value = record[propertyName];

  if (!isRecord(value)) {
    throw new Error(`Expected ${propertyName} to be an object`);
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
  let scaleInstanceModel: Model<ScaleInstanceDocument>;
  let itemResponseModel: Model<ItemResponseDocument>;
  let patientAdministrationSessionModel: Model<PatientAdministrationSessionDocument>;
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

    const scaleInstances = await scaleInstanceModel
      .find({ subjectCode: /^SUBJ-A12-TEST-/ })
      .select({ _id: 1 })
      .exec();
    const scaleInstanceIds = scaleInstances.map((instance) => instance._id);

    if (scaleInstanceIds.length > 0) {
      await patientAdministrationSessionModel
        .deleteMany({ scaleInstanceId: { $in: scaleInstanceIds } })
        .exec();
    }

    await itemResponseModel
      .deleteMany({ subjectCode: /^SUBJ-A12-TEST-/ })
      .exec();
    await scaleInstanceModel
      .deleteMany({ subjectCode: /^SUBJ-A12-TEST-/ })
      .exec();
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

  async function createVisit(
    suffix: string,
  ): Promise<{ patientId: string; subjectCode: string; visitId: string }> {
    const patientResponse = await createPatient(suffix).expect(201);
    const patientBody = readResponseBody(patientResponse);
    const patientId = readString(patientBody, 'id');
    const subjectCode = readString(patientBody, 'subjectCode');
    const visitResponse = await doctorAgent
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: `${TEST_VISIT_PREFIX}${suffix}`,
        assessmentDate: '2026-08-01T08:00:00.000Z',
      })
      .expect(201);

    return {
      patientId,
      subjectCode,
      visitId: readString(readResponseBody(visitResponse), 'id'),
    };
  }

  async function createInitializedScale(
    fixture: { patientId: string; subjectCode: string; visitId: string },
    suffix: string,
  ): Promise<{
    scaleInstanceId: Types.ObjectId;
    itemResponseId: Types.ObjectId;
  }> {
    const scaleDefinitionId = new Types.ObjectId();
    const scaleVersionId = new Types.ObjectId();
    const scaleInstance = await scaleInstanceModel.create({
      assessmentVisitId: new Types.ObjectId(fixture.visitId),
      patientId: new Types.ObjectId(fixture.patientId),
      subjectCode: fixture.subjectCode,
      scaleDefinitionId,
      scaleVersionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: `INST-A12-MAINT-${suffix}-MMSE-1`,
      instanceNo: 1,
      status: 'draft',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: '1.0',
        scoringRuleVersion: '1.0',
        fieldEncodingVersion: '1.0',
        sourceDocument: 'e2e-seed-fixture',
      },
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      durationMs: null,
      operatorSnapshot: null,
      progress: {
        totalItemCount: 1,
        answeredItemCount: 0,
        source: 'scale_seed',
      },
      qualityControlSummary: null,
      submissionWriteBarrier: null,
      metadata: { initializedFromSeed: true },
    });
    const itemResponse = await itemResponseModel.create({
      assessmentVisitId: new Types.ObjectId(fixture.visitId),
      scaleInstanceId: scaleInstance._id,
      patientId: new Types.ObjectId(fixture.patientId),
      subjectCode: fixture.subjectCode,
      scaleDefinitionId,
      scaleVersionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: scaleInstance.instanceCode,
      itemCode: `maintenance-${suffix.toLowerCase()}`,
      itemOrder: 1,
      responseType: 'text',
      countsTowardTotal: true,
      cognitiveDomainCodes: [],
      itemConfigSnapshot: { initializedFromSeed: true },
      versionTrace: {
        scaleVersion: '1.0',
        crfVersion: '1.0',
        scoringRuleVersion: '1.0',
        fieldEncodingVersion: '1.0',
        sourceDocument: 'e2e-seed-fixture',
      },
      status: 'not_started',
      answerSource: 'clinician_recorded',
      draftRevision: 0,
      draftSavedAt: null,
      rawResponse: null,
      structuredResponse: null,
      isMissing: false,
      score: {
        scoreValue: null,
        maxScore: 1,
        minScore: 0,
        scoreStatus: 'not_scored',
        scoreSource: 'none',
        scoredAt: null,
        scoredBy: null,
      },
      stepResults: [
        {
          stepCode: 'seed-step',
          order: 1,
          expectedValue: 'seed-expected',
          actualValue: null,
          isCorrect: null,
          scoreValue: null,
          countsTowardItemScore: true,
        },
      ],
      promptResponses: [
        {
          promptType: 'semantic_category',
          promptText: 'Category cue',
          responseAfterPrompt: null,
          isCorrect: null,
          countsTowardScore: false,
          order: 1,
          note: 'Initialized from seed prompt record.',
        },
      ],
      timing: {
        timerState: 'idle',
        startedAt: null,
        lastResumedAt: null,
        completedAt: null,
        durationMs: null,
        timerSource: 'none',
      },
      evidenceRefs: [
        {
          evidenceType: 'duration',
          mediaEvidenceId: null,
          status: 'pending',
          note: 'Initialized from scale seed.',
        },
      ],
      submissionWriteBarrier: null,
      qualityControlHints: null,
      metadata: { initializedFromSeed: true },
      lockedAt: null,
      voidedAt: null,
    });

    return {
      scaleInstanceId: scaleInstance._id,
      itemResponseId: itemResponse._id,
    };
  }

  async function createAdministrationSession(
    scaleInstanceId: Types.ObjectId,
    status: 'prepared' | 'completed',
  ): Promise<Types.ObjectId> {
    const now = new Date();
    const session = await patientAdministrationSessionModel.create({
      scaleInstanceId,
      deviceMode: 'same_device',
      status,
      currentStepKey: 'orientation-year',
      revision: 0,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      impactFactorCodes: [],
      createdBy: {
        operatorId: doctorUserId,
        operatorName: 'A12 Doctor Test Operator',
        operatorRole: 'doctor',
      },
      ...(status === 'completed' ? { completedAt: now } : {}),
      controlEvents: [],
      stepCaptures: [],
      playbackFacts: [],
      stepEvidenceRefs: [],
    });

    return session._id;
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

    if (databaseName !== 'cogmemory_ad_test') {
      throw new Error('E2E database must be exactly cogmemory_ad_test');
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
    scaleInstanceModel = app.get<Model<ScaleInstanceDocument>>(
      getModelToken(ScaleInstance.name),
    );
    itemResponseModel = app.get<Model<ItemResponseDocument>>(
      getModelToken(ItemResponse.name),
    );
    patientAdministrationSessionModel = app.get<
      Model<PatientAdministrationSessionDocument>
    >(getModelToken(PatientAdministrationSession.name));
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

  it('edits and physically deletes an empty pre-assessment visit', async () => {
    const fixture = await createVisit('MAINT-EMPTY');
    const detail = await doctorAgent
      .get(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .expect(200);

    expect(readResponseBody(detail).visitMaintenance).toEqual({
      canEdit: true,
      canDelete: true,
      canVoid: false,
      initializedScaleCount: 0,
    });

    const updated = await doctorAgent
      .patch(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .send({
        visitCode: ' visit-a12-test-maint-empty-updated ',
        visitType: 'follow_up',
        assessmentDate: '2026-08-02T08:00:00.000Z',
        notes: ' Updated before assessment ',
      })
      .expect(200);
    const updatedBody = readResponseBody(updated);

    expect(updatedBody.visit).toEqual(
      expect.objectContaining({
        visitCode: 'VISIT-A12-TEST-MAINT-EMPTY-UPDATED',
        visitType: 'follow_up',
        notes: 'Updated before assessment',
      }),
    );
    expect(updatedBody.visitMaintenance).toEqual({
      canEdit: true,
      canDelete: true,
      canVoid: false,
      initializedScaleCount: 0,
    });

    await doctorAgent
      .delete(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .expect(204);
    await expect(
      assessmentVisitModel.exists({ _id: fixture.visitId }),
    ).resolves.toBeNull();
    await expect(
      patientModel.exists({ _id: fixture.patientId }),
    ).resolves.not.toBeNull();
  });

  it('edits and deletes initialized-only MMSE with only its skeleton records', async () => {
    const fixture = await createVisit('MAINT-INITIALIZED');
    const initialized = await createInitializedScale(fixture, 'INITIALIZED');
    const detail = await doctorAgent
      .get(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .expect(200);

    expect(readResponseBody(detail).visitMaintenance).toEqual({
      canEdit: true,
      canDelete: true,
      canVoid: false,
      initializedScaleCount: 1,
    });

    const updated = await doctorAgent
      .patch(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .send({ notes: 'Initialized but not started' })
      .expect(200);
    expect(readResponseBody(updated).visitMaintenance).toEqual({
      canEdit: true,
      canDelete: true,
      canVoid: false,
      initializedScaleCount: 1,
    });

    await doctorAgent
      .delete(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .expect(204);

    await expect(
      itemResponseModel.exists({ _id: initialized.itemResponseId }),
    ).resolves.toBeNull();
    await expect(
      scaleInstanceModel.exists({ _id: initialized.scaleInstanceId }),
    ).resolves.toBeNull();
    await expect(
      assessmentVisitModel.exists({ _id: fixture.visitId }),
    ).resolves.toBeNull();
    await expect(
      patientModel.exists({ _id: fixture.patientId }),
    ).resolves.not.toBeNull();
  });

  it('blocks edit/delete after a real item draft and voids idempotently without deleting facts', async () => {
    const fixture = await createVisit('MAINT-ITEM-FACT');
    const initialized = await createInitializedScale(fixture, 'ITEM-FACT');
    await itemResponseModel
      .updateOne(
        { _id: initialized.itemResponseId },
        {
          $set: {
            status: 'in_progress',
            draftRevision: 1,
            draftSavedAt: new Date('2026-08-01T08:05:00.000Z'),
            responseText: 'Formal draft answer',
          },
        },
      )
      .exec();

    const detail = await doctorAgent
      .get(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .expect(200);
    expect(readResponseBody(detail).visitMaintenance).toEqual({
      canEdit: false,
      canDelete: false,
      canVoid: true,
      initializedScaleCount: 1,
    });

    const editBlocked = await doctorAgent
      .patch(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .send({ notes: 'Must not be written' })
      .expect(409);
    expect(readString(readResponseBody(editBlocked), 'code')).toBe(
      'VISIT_NOT_EDITABLE',
    );
    const deleteBlocked = await doctorAgent
      .delete(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .expect(409);
    expect(readString(readResponseBody(deleteBlocked), 'code')).toBe(
      'VISIT_NOT_DELETABLE',
    );
    await expect(
      itemResponseModel.exists({ _id: initialized.itemResponseId }),
    ).resolves.not.toBeNull();

    const firstVoid = await doctorAgent
      .post(`/patients/${fixture.patientId}/visits/${fixture.visitId}/void`)
      .send({ confirm: true, reason: 'Duplicate clinical visit' })
      .expect(201);
    const firstVisit = readRecord(readResponseBody(firstVoid), 'visit');
    expect(firstVisit).toEqual(
      expect.objectContaining({
        status: 'voided',
        voidReason: 'Duplicate clinical visit',
        voidedBy: {
          operatorId: doctorUserId.toString(),
          operatorName: 'A12 Doctor Test Operator',
          operatorRole: 'doctor',
        },
      }),
    );
    expect(readResponseBody(firstVoid).visitMaintenance).toEqual({
      canEdit: false,
      canDelete: false,
      canVoid: false,
      initializedScaleCount: 1,
    });

    const originalVoidedAt = readString(firstVisit, 'voidedAt');
    const secondVoid = await doctorAgent
      .post(`/patients/${fixture.patientId}/visits/${fixture.visitId}/void`)
      .send({ confirm: true, reason: 'Must not replace original reason' })
      .expect(201);
    const secondVisit = readRecord(readResponseBody(secondVoid), 'visit');

    expect(readString(secondVisit, 'voidedAt')).toBe(originalVoidedAt);
    expect(readString(secondVisit, 'voidReason')).toBe(
      'Duplicate clinical visit',
    );
    expect(secondVisit.voidedBy).toEqual(firstVisit.voidedBy);
    await expect(
      scaleInstanceModel.exists({ _id: initialized.scaleInstanceId }),
    ).resolves.not.toBeNull();
    await expect(
      itemResponseModel.exists({ _id: initialized.itemResponseId }),
    ).resolves.not.toBeNull();
  });

  it.each(['prepared', 'completed'] as const)(
    'treats a %s patient administration session as historical execution fact',
    async (sessionStatus) => {
      const suffix = `MAINT-SESSION-${sessionStatus.toUpperCase()}`;
      const fixture = await createVisit(suffix);
      const initialized = await createInitializedScale(fixture, suffix);
      const sessionId = await createAdministrationSession(
        initialized.scaleInstanceId,
        sessionStatus,
      );

      const detail = await doctorAgent
        .get(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
        .expect(200);
      expect(readResponseBody(detail).visitMaintenance).toEqual({
        canEdit: false,
        canDelete: false,
        canVoid: true,
        initializedScaleCount: 1,
      });

      const deleteBlocked = await doctorAgent
        .delete(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
        .expect(409);
      expect(readString(readResponseBody(deleteBlocked), 'code')).toBe(
        'VISIT_NOT_DELETABLE',
      );

      if (sessionStatus === 'completed') {
        await doctorAgent
          .post(`/patients/${fixture.patientId}/visits/${fixture.visitId}/void`)
          .send({ confirm: true, reason: 'Completed session retained' })
          .expect(201);
        await expect(
          patientAdministrationSessionModel.exists({ _id: sessionId }),
        ).resolves.not.toBeNull();
      }
    },
  );

  it('rejects pre-assessment void, empty/forged patches, and duplicate visit codes', async () => {
    const source = await createVisit('MAINT-CONTRACT-SOURCE');
    const target = await createVisit('MAINT-CONTRACT-TARGET');

    const preAssessmentVoid = await doctorAgent
      .post(`/patients/${source.patientId}/visits/${source.visitId}/void`)
      .send({ confirm: true, reason: 'Should be deleted' })
      .expect(409);
    expect(readString(readResponseBody(preAssessmentVoid), 'code')).toBe(
      'VISIT_NOT_VOIDABLE',
    );

    const emptyPatch = await doctorAgent
      .patch(`/patients/${source.patientId}/visits/${source.visitId}`)
      .send({})
      .expect(400);
    expect(readString(readResponseBody(emptyPatch), 'code')).toBe(
      'VISIT_UPDATE_EMPTY_PATCH',
    );

    await doctorAgent
      .patch(`/patients/${source.patientId}/visits/${source.visitId}`)
      .send({ status: 'completed', voidReason: 'Forged' })
      .expect(400);

    const duplicate = await doctorAgent
      .patch(`/patients/${target.patientId}/visits/${target.visitId}`)
      .send({ visitCode: `${TEST_VISIT_PREFIX}MAINT-CONTRACT-SOURCE` })
      .expect(409);
    expect(readString(readResponseBody(duplicate), 'code')).toBe(
      'VISIT_CODE_CONFLICT',
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
