import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model } from 'mongoose';
import request, { type Response, type Test as SupertestTest } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
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
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const DOCTOR_ACCOUNT = 'doctor-a14-test';
const SYSTEM_ACCOUNT = 'system-a14-test';
const TEST_PATIENT_PREFIX = 'SUBJ-A14-TEST-';
const TEST_VISIT_PREFIX = 'VISIT-A14-TEST-';
const TEST_SCALE_CODES = ['mmse', 'moca'];

type SupertestApp = Parameters<typeof request.agent>[0];

type ExecutionFixture = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
};

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

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([key, nestedValue]) => {
      keys.add(key);
      collectKeys(nestedValue, keys);
    });
  }

  return keys;
}

describe('item response execution detail and draft APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let authService: AuthService;
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

  async function cleanupA14Data(): Promise<void> {
    const testUsers = await userModel
      .find({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .select({ _id: 1 })
      .exec();
    const userIds = testUsers.map((user) => user._id);

    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }

    const visits = await assessmentVisitModel
      .find({ visitCode: /^VISIT-A14-TEST-/ })
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

    await patientModel.deleteMany({ subjectCode: /^SUBJ-A14-TEST-/ }).exec();
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

  function createPatient(suffix: string): SupertestTest {
    return doctorAgent.post('/patients').send({
      subjectCode: `${TEST_PATIENT_PREFIX}${suffix}`,
      displayName: `A14 De-identified Subject ${suffix}`,
    });
  }

  function createVisit(patientId: string, suffix: string): SupertestTest {
    return doctorAgent.post(`/patients/${patientId}/visits`).send({
      visitCode: `${TEST_VISIT_PREFIX}${suffix}`,
      assessmentDate: '2026-07-01T08:00:00.000Z',
    });
  }

  async function createExecution(
    suffix: string,
    scaleCode: 'mmse' | 'moca',
  ): Promise<ExecutionFixture> {
    const patientResponse = await createPatient(suffix).expect(201);
    const patientId = readString(readResponseBody(patientResponse), 'id');
    const visitResponse = await createVisit(patientId, suffix).expect(201);
    const visitId = readString(readResponseBody(visitResponse), 'id');
    const scaleResponse = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({ scaleCode })
      .expect(201);
    const scaleInstance = readRecord(
      readResponseBody(scaleResponse),
      'scaleInstance',
    );

    return {
      patientId,
      visitId,
      scaleInstanceId: readString(scaleInstance, 'id'),
    };
  }

  function executionPath(fixture: ExecutionFixture): string {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${fixture.scaleInstanceId}`;
  }

  function itemPath(fixture: ExecutionFixture, itemResponseId: string): string {
    return `${executionPath(fixture)}/item-responses/${itemResponseId}`;
  }

  async function findItem(
    fixture: ExecutionFixture,
    itemCode: string,
  ): Promise<ItemResponseDocument> {
    const itemResponse = await itemResponseModel
      .findOne({
        scaleInstanceId: fixture.scaleInstanceId,
        itemCode,
      })
      .exec();

    if (!itemResponse) {
      throw new Error(`Expected item response ${itemCode}`);
    }

    return itemResponse;
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

    await cleanupA14Data();

    const passwordHash = await authService.hashPassword('A14-Test-Password!');
    await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A14 Doctor Test Operator',
      staffCode: 'STAFF-A14-TEST',
      email: 'doctor-a14-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A14 System Test Operator',
      staffCode: 'SYSTEM-A14-TEST',
      email: 'system-a14-test@example.test',
      passwordHash,
      roles: ['system'],
      permissions: [],
      userType: 'system',
      status: 'active',
      metadata: null,
    });

    httpServer = app.getHttpServer() as SupertestApp;
    doctorAgent = request.agent(httpServer);
    systemAgent = request.agent(httpServer);

    await doctorAgent
      .post('/auth/login')
      .send({ accountName: DOCTOR_ACCOUNT, password: 'A14-Test-Password!' })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({ accountName: SYSTEM_ACCOUNT, password: 'A14-Test-Password!' })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      if (modelsReady) {
        await cleanupA14Data();
      }

      await app.close();
    }
  });

  it('enforces authentication and the confirmed clinical roles', async () => {
    const ids = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
      itemResponseId: '507f1f77bcf86cd799439014',
    };
    const detailPath = `/patients/${ids.patientId}/visits/${ids.visitId}/scale-instances/${ids.scaleInstanceId}`;
    const draftPath = `${detailPath}/item-responses/${ids.itemResponseId}`;

    await request(httpServer).get(detailPath).expect(401);
    await systemAgent.get(detailPath).expect(403);
    await request(httpServer)
      .patch(draftPath)
      .send({ responseText: 'x' })
      .expect(401);
    await systemAgent.patch(draftPath).send({ responseText: 'x' }).expect(403);
  });

  it('returns safe MMSE execution detail and derives progress from ItemResponse', async () => {
    const fixture = await createExecution('DETAIL', 'mmse');
    const detailResponse = await doctorAgent
      .get(executionPath(fixture))
      .expect(200);
    const detail = readResponseBody(detailResponse);
    const scale = readRecord(detail, 'scale');
    const scaleInstance = readRecord(detail, 'scaleInstance');
    const groups = readArray(detail, 'groups');
    const itemResponses = readArray(detail, 'itemResponses');

    expect(scale).toEqual(
      expect.objectContaining({ code: 'mmse', version: '1.0' }),
    );
    expect(groups).toHaveLength(6);
    expect(itemResponses).toHaveLength(11);
    expect(scaleInstance.progress).toEqual({
      totalItemCount: 11,
      answeredItemCount: 0,
    });

    const firstItem = itemResponses[0];
    if (!isRecord(firstItem)) {
      throw new Error('Expected an item execution response');
    }
    const config = readRecord(firstItem, 'config');
    const scoreRange = readRecord(config, 'scoreRange');
    expect(typeof firstItem.itemCode).toBe('string');
    expect(typeof firstItem.itemOrder).toBe('number');
    expect(typeof firstItem.responseType).toBe('string');
    expect(firstItem.status).toBe('not_started');
    expect(typeof config.prompt).toBe('string');
    expect(typeof config.instruction).toBe('string');
    expect(typeof scoreRange.min).toBe('number');
    expect(typeof scoreRange.max).toBe('number');
    expect(Array.isArray(config.evidenceTypes)).toBe(true);
    expect(typeof config.requiresTimer).toBe('boolean');
    expect(typeof config.supportsPhotoUpload).toBe('boolean');
    expect(typeof config.supportsHandwriting).toBe('boolean');
    expect(typeof config.requiresOperatorNote).toBe('boolean');

    const keys = collectKeys(detail);
    for (const forbiddenKey of [
      'itemConfigSnapshot',
      'scoringRule',
      'qualityControlRule',
      'reportingRule',
      'researchExportField',
      'expectedValue',
      'score',
      'isCorrect',
      'scoreValue',
      'qualityControlHints',
      'metadata',
      'scaleDefinitionId',
      'scaleVersionId',
      'mediaEvidenceId',
      '__v',
      'passwordHash',
      'sessionToken',
    ]) {
      expect(keys).not.toContain(forbiddenKey);
    }
  });

  it('saves a normal draft, marks it answered, preserves answered, and updates A13 progress', async () => {
    const fixture = await createExecution('DRAFT', 'mmse');
    const item = await findItem(fixture, 'mmse.memory.immediate_recall');
    const path = itemPath(fixture, item._id.toString());

    const draftResponse = await doctorAgent
      .patch(path)
      .send({
        rawResponse: { recalledWords: ['de-identified-word'] },
        responseText: 'de-identified response',
      })
      .expect(200);
    const draftBody = readResponseBody(draftResponse);
    expect(readRecord(draftBody, 'itemResponse')).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        rawResponse: { recalledWords: ['de-identified-word'] },
        responseText: 'de-identified response',
      }),
    );

    const answeredResponse = await doctorAgent
      .patch(path)
      .send({ markAsAnswered: true })
      .expect(200);
    expect(
      readRecord(readResponseBody(answeredResponse), 'itemResponse'),
    ).toEqual(expect.objectContaining({ status: 'answered' }));
    expect(readRecord(readResponseBody(answeredResponse), 'progress')).toEqual({
      totalItemCount: 11,
      answeredItemCount: 1,
    });

    const revisedResponse = await doctorAgent
      .patch(path)
      .send({ operatorNote: 'revised de-identified note' })
      .expect(200);
    expect(
      readRecord(readResponseBody(revisedResponse), 'itemResponse'),
    ).toEqual(expect.objectContaining({ status: 'answered' }));

    const visitDetailResponse = await doctorAgent
      .get(`/patients/${fixture.patientId}/visits/${fixture.visitId}`)
      .expect(200);
    const scaleInstances = readArray(
      readResponseBody(visitDetailResponse),
      'scaleInstances',
    );
    expect(scaleInstances).toEqual([
      expect.objectContaining({
        id: fixture.scaleInstanceId,
        progress: { totalItemCount: 11, answeredItemCount: 1 },
      }),
    ]);

    await doctorAgent
      .patch(path)
      .send({ isMissing: true })
      .expect(400)
      .expect((response: Response) => {
        expect(readString(readResponseBody(response), 'code')).toBe(
          'ITEM_RESPONSE_MISSING_REASON_REQUIRED',
        );
      });

    const missingResponse = await doctorAgent
      .patch(path)
      .send({ isMissing: true, missingReason: 'unable to assess' })
      .expect(200);
    expect(
      readRecord(readResponseBody(missingResponse), 'itemResponse'),
    ).toEqual(
      expect.objectContaining({
        status: 'answered',
        rawResponse: null,
        structuredResponse: null,
        isMissing: true,
        missingReason: 'unable to assess',
      }),
    );
    expect(
      readRecord(readResponseBody(missingResponse), 'itemResponse'),
    ).not.toHaveProperty('responseText');
  });

  it('updates only existing serial-seven step slots and preserves expected values', async () => {
    const fixture = await createExecution('STEPS', 'mmse');
    const item = await findItem(fixture, 'mmse.attention.serial_sevens');
    const path = itemPath(fixture, item._id.toString());
    const expectedBefore = item.stepResults.map((step) => step.expectedValue);
    const stepCode = item.stepResults[0]?.stepCode;

    if (!stepCode) {
      throw new Error('Expected a serial-seven step');
    }

    const response = await doctorAgent
      .patch(path)
      .send({
        stepResponses: [
          { stepCode, actualValue: 93, note: 'de-identified step note' },
        ],
      })
      .expect(200);
    const responseItem = readRecord(readResponseBody(response), 'itemResponse');
    const stepResponses = readArray(responseItem, 'stepResponses');
    expect(stepResponses[0]).toEqual(
      expect.objectContaining({
        stepCode,
        actualValue: 93,
        countsTowardItemScore: true,
      }),
    );
    expect(collectKeys(stepResponses)).not.toContain('expectedValue');
    expect(collectKeys(stepResponses)).not.toContain('isCorrect');
    expect(collectKeys(stepResponses)).not.toContain('scoreValue');

    const stored = await itemResponseModel.findById(item._id).exec();
    expect(stored?.stepResults.map((step) => step.expectedValue)).toEqual(
      expectedBefore,
    );

    const unknownResponse = await doctorAgent
      .patch(path)
      .send({ stepResponses: [{ stepCode: 'unknown', actualValue: 1 }] })
      .expect(400);
    expect(readString(readResponseBody(unknownResponse), 'code')).toBe(
      'ITEM_RESPONSE_STEP_NOT_FOUND',
    );
  });

  it('updates only existing MoCA prompt slots without changing scoring participation', async () => {
    const fixture = await createExecution('PROMPTS', 'moca');
    const item = await findItem(fixture, 'moca.memory.delayed_recall');
    const prompt = item.promptResponses[0];

    if (!prompt) {
      throw new Error('Expected a delayed recall prompt slot');
    }

    const path = itemPath(fixture, item._id.toString());
    const response = await doctorAgent
      .patch(path)
      .send({
        promptResponses: [
          {
            promptType: prompt.promptType,
            order: prompt.order,
            responseAfterPrompt: { recalled: true },
          },
        ],
      })
      .expect(200);
    const responsePrompts = readArray(
      readRecord(readResponseBody(response), 'itemResponse'),
      'promptResponses',
    );
    expect(responsePrompts[0]).toEqual(
      expect.objectContaining({
        promptType: prompt.promptType,
        order: prompt.order,
        responseAfterPrompt: { recalled: true },
        countsTowardScore: false,
      }),
    );
    expect(collectKeys(responsePrompts)).not.toContain('isCorrect');

    const stored = await itemResponseModel.findById(item._id).exec();
    expect(stored?.promptResponses[0]?.countsTowardScore).toBe(false);

    const unknownResponse = await doctorAgent
      .patch(path)
      .send({
        promptResponses: [
          {
            promptType: 'operator_clarification',
            order: 99,
            responseAfterPrompt: true,
          },
        ],
      })
      .expect(400);
    expect(readString(readResponseBody(unknownResponse), 'code')).toBe(
      'ITEM_RESPONSE_PROMPT_NOT_FOUND',
    );
  });

  it('enforces timing configuration and validates timing drafts', async () => {
    const fixture = await createExecution('TIMING', 'moca');
    const ordinaryItem = await findItem(
      fixture,
      'moca.abstraction.train_bicycle',
    );
    const timedItem = await findItem(
      fixture,
      'moca.language.verbal_fluency_animals',
    );

    const notAllowed = await doctorAgent
      .patch(itemPath(fixture, ordinaryItem._id.toString()))
      .send({ timing: { durationMs: 1000 } })
      .expect(400);
    expect(readString(readResponseBody(notAllowed), 'code')).toBe(
      'ITEM_RESPONSE_TIMING_NOT_ALLOWED',
    );

    const invalid = await doctorAgent
      .patch(itemPath(fixture, timedItem._id.toString()))
      .send({
        timing: {
          startedAt: '2026-07-01T09:00:00.000Z',
          completedAt: '2026-07-01T08:00:00.000Z',
        },
      })
      .expect(400);
    expect(readString(readResponseBody(invalid), 'code')).toBe(
      'ITEM_RESPONSE_INVALID_TIMING',
    );

    const saved = await doctorAgent
      .patch(itemPath(fixture, timedItem._id.toString()))
      .send({
        timing: {
          startedAt: '2026-07-01T08:00:00.000Z',
          completedAt: '2026-07-01T08:00:01.000Z',
          durationMs: 1000,
          timerSource: 'manual',
        },
      })
      .expect(200);
    expect(
      readRecord(readRecord(readResponseBody(saved), 'itemResponse'), 'timing'),
    ).toEqual(
      expect.objectContaining({ durationMs: 1000, timerSource: 'manual' }),
    );
  });

  it('rejects cross-ownership resources without revealing their existence', async () => {
    const owner = await createExecution('OWNER', 'mmse');
    const other = await createExecution('OTHER', 'mmse');
    const ownerItem = await findItem(owner, 'mmse.memory.immediate_recall');
    const otherItem = await findItem(other, 'mmse.memory.immediate_recall');

    const instanceMismatch = await doctorAgent
      .get(
        `/patients/${owner.patientId}/visits/${owner.visitId}/scale-instances/${other.scaleInstanceId}`,
      )
      .expect(404);
    expect(readString(readResponseBody(instanceMismatch), 'code')).toBe(
      'SCALE_INSTANCE_NOT_FOUND',
    );

    const itemMismatch = await doctorAgent
      .patch(itemPath(owner, otherItem._id.toString()))
      .send({ responseText: 'must not cross ownership' })
      .expect(404);
    expect(readString(readResponseBody(itemMismatch), 'code')).toBe(
      'ITEM_RESPONSE_NOT_FOUND',
    );

    await doctorAgent
      .patch(itemPath(owner, ownerItem._id.toString()))
      .send({ responseText: 'owner response' })
      .expect(200);
  });

  it('rejects patient, visit, scale-instance, and item non-editable states', async () => {
    const fixture = await createExecution('STATES', 'mmse');
    const item = await findItem(fixture, 'mmse.memory.immediate_recall');
    const path = itemPath(fixture, item._id.toString());

    await patientModel.updateOne(
      { _id: fixture.patientId },
      { status: 'inactive' },
    );
    const inactive = await doctorAgent
      .patch(path)
      .send({ responseText: 'blocked' })
      .expect(409);
    expect(readString(readResponseBody(inactive), 'code')).toBe(
      'PATIENT_NOT_ACTIVE',
    );
    await patientModel.updateOne(
      { _id: fixture.patientId },
      { status: 'active' },
    );

    for (const status of ['completed', 'locked', 'voided'] as const) {
      await assessmentVisitModel.updateOne(
        { _id: fixture.visitId },
        { status },
      );
      const response = await doctorAgent
        .patch(path)
        .send({ responseText: 'blocked' })
        .expect(409);
      expect(readString(readResponseBody(response), 'code')).toBe(
        'VISIT_NOT_EDITABLE',
      );
    }
    await assessmentVisitModel.updateOne(
      { _id: fixture.visitId },
      { status: 'draft' },
    );

    for (const status of ['completed', 'locked', 'voided'] as const) {
      await scaleInstanceModel.updateOne(
        { _id: fixture.scaleInstanceId },
        { status },
      );
      const response = await doctorAgent
        .patch(path)
        .send({ responseText: 'blocked' })
        .expect(409);
      expect(readString(readResponseBody(response), 'code')).toBe(
        'SCALE_INSTANCE_NOT_EDITABLE',
      );
    }
    await scaleInstanceModel.updateOne(
      { _id: fixture.scaleInstanceId },
      { status: 'draft' },
    );

    for (const status of ['scored', 'locked', 'voided'] as const) {
      await itemResponseModel.updateOne({ _id: item._id }, { status });
      const response = await doctorAgent
        .patch(path)
        .send({ responseText: 'blocked' })
        .expect(409);
      expect(readString(readResponseBody(response), 'code')).toBe(
        'ITEM_RESPONSE_NOT_EDITABLE',
      );
    }
  });

  it('rejects empty, incomplete, and server-controlled PATCH payloads', async () => {
    const fixture = await createExecution('VALIDATION', 'mmse');
    const item = await findItem(fixture, 'mmse.memory.immediate_recall');
    const path = itemPath(fixture, item._id.toString());

    const empty = await doctorAgent.patch(path).send({}).expect(400);
    expect(readString(readResponseBody(empty), 'code')).toBe(
      'ITEM_RESPONSE_EMPTY_PATCH',
    );

    const cannotAnswer = await doctorAgent
      .patch(path)
      .send({ operatorNote: 'note only', markAsAnswered: true })
      .expect(409);
    expect(readString(readResponseBody(cannotAnswer), 'code')).toBe(
      'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
    );

    for (const payload of [
      { responseText: 'answer', score: { scoreValue: 1 } },
      { responseText: 'answer', status: 'scored' },
      { responseText: 'answer', metadata: { hidden: true } },
      {
        stepResponses: [
          {
            stepCode: 'mmse.attention.serial_sevens.step_1',
            actualValue: 93,
            expectedValue: 93,
          },
        ],
      },
    ]) {
      await doctorAgent.patch(path).send(payload).expect(400);
    }

    await doctorAgent
      .get(
        `/patients/not-a-mongo-id/visits/${fixture.visitId}/scale-instances/${fixture.scaleInstanceId}`,
      )
      .expect(400);
  });
});
