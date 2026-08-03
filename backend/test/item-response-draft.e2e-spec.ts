import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model } from 'mongoose';
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
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const DOCTOR_ACCOUNT = 'doctor-a14-test';
const NURSE_ACCOUNT = 'nurse-a14-test';
const SYSTEM_ACCOUNT = 'system-a14-test';
const TEST_PATIENT_PREFIX = 'SUBJ-A14-TEST-';
const TEST_VISIT_PREFIX = 'VISIT-A14-TEST-';
const TEST_SCALE_CODES = ['mmse', 'moca'];

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;

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

function readSafeInteger(
  record: Record<string, unknown>,
  propertyName: string,
): number {
  const value = record[propertyName];

  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(
      `Expected ${propertyName} to be a safe non-negative integer`,
    );
  }

  return Number(value);
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
  let nurseAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let httpServer: SupertestApp;
  let modelsReady = false;

  async function cleanupA14Data(): Promise<void> {
    const testUsers = await userModel
      .find({
        accountName: {
          $in: [DOCTOR_ACCOUNT, NURSE_ACCOUNT, SYSTEM_ACCOUNT],
        },
      })
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
      .deleteMany({
        accountName: {
          $in: [DOCTOR_ACCOUNT, NURSE_ACCOUNT, SYSTEM_ACCOUNT],
        },
      })
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

  async function readExecutionItem(
    fixture: ExecutionFixture,
    itemResponseId: string,
  ): Promise<Record<string, unknown>> {
    const response = await doctorAgent.get(executionPath(fixture)).expect(200);
    const item = readArray(readResponseBody(response), 'itemResponses').find(
      (candidate) => isRecord(candidate) && candidate.id === itemResponseId,
    );

    if (!isRecord(item)) {
      throw new Error(`Expected public item response ${itemResponseId}`);
    }

    return item;
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
      throw new Error('E2E database name must be cogmemory_ad_test');
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
      accountName: NURSE_ACCOUNT,
      displayName: 'A14 Nurse Test Operator',
      staffCode: 'STAFF-A14-NURSE',
      email: 'nurse-a14-test@example.test',
      passwordHash,
      roles: ['nurse'],
      permissions: [],
      userType: 'nurse',
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

    httpServer = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
    doctorAgent = request.agent(httpServer);
    nurseAgent = request.agent(httpServer);
    systemAgent = request.agent(httpServer);

    await doctorAgent
      .post('/auth/login')
      .send({ accountName: DOCTOR_ACCOUNT, password: 'A14-Test-Password!' })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({ accountName: SYSTEM_ACCOUNT, password: 'A14-Test-Password!' })
      .expect(201);
    await nurseAgent
      .post('/auth/login')
      .send({ accountName: NURSE_ACCOUNT, password: 'A14-Test-Password!' })
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
      .send({ expectedRevision: 0, responseText: 'x' })
      .expect(401);
    await systemAgent
      .patch(draftPath)
      .send({ expectedRevision: 0, responseText: 'x' })
      .expect(403);
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
    expect(firstItem.draftRevision).toBe(0);
    expect(firstItem.draftSavedAt).toBeNull();
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
    const initialPublicItem = await readExecutionItem(
      fixture,
      item._id.toString(),
    );
    const initialRevision = readSafeInteger(initialPublicItem, 'draftRevision');

    const draftResponse = await doctorAgent
      .patch(path)
      .send({
        expectedRevision: initialRevision,
        rawResponse: { recalledWords: ['de-identified-word'] },
        responseText: 'de-identified response',
      })
      .expect(200);
    const draftBody = readResponseBody(draftResponse);
    const draftItem = readRecord(draftBody, 'itemResponse');
    expect(draftItem).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        draftRevision: initialRevision + 1,
        rawResponse: { recalledWords: ['de-identified-word'] },
        responseText: 'de-identified response',
      }),
    );
    expect(
      Number.isFinite(Date.parse(readString(draftItem, 'draftSavedAt'))),
    ).toBe(true);

    const answeredResponse = await doctorAgent
      .patch(path)
      .send({
        expectedRevision: readSafeInteger(draftItem, 'draftRevision'),
        markAsAnswered: true,
      })
      .expect(200);
    const answeredItem = readRecord(
      readResponseBody(answeredResponse),
      'itemResponse',
    );
    expect(answeredItem).toEqual(
      expect.objectContaining({
        status: 'answered',
        draftRevision: initialRevision + 2,
      }),
    );
    expect(readRecord(readResponseBody(answeredResponse), 'progress')).toEqual({
      totalItemCount: 11,
      answeredItemCount: 1,
    });

    const revisedResponse = await doctorAgent
      .patch(path)
      .send({
        expectedRevision: readSafeInteger(answeredItem, 'draftRevision'),
        operatorNote: 'revised de-identified note',
      })
      .expect(200);
    const revisedItem = readRecord(
      readResponseBody(revisedResponse),
      'itemResponse',
    );
    expect(revisedItem).toEqual(
      expect.objectContaining({
        status: 'answered',
        draftRevision: initialRevision + 3,
      }),
    );

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
      .send({
        expectedRevision: readSafeInteger(revisedItem, 'draftRevision'),
        isMissing: true,
      })
      .expect(400)
      .expect((response: Response) => {
        expect(readString(readResponseBody(response), 'code')).toBe(
          'ITEM_RESPONSE_MISSING_REASON_REQUIRED',
        );
      });

    const missingResponse = await doctorAgent
      .patch(path)
      .send({
        expectedRevision: readSafeInteger(revisedItem, 'draftRevision'),
        isMissing: true,
        missingReason: 'unable to assess',
      })
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

  it('allows exactly one of two legal concurrent saves and leaves the loser zero-write', async () => {
    const fixture = await createExecution('CONCURRENT', 'mmse');
    const item = await findItem(fixture, 'mmse.memory.immediate_recall');
    const path = itemPath(fixture, item._id.toString());
    const publicItem = await readExecutionItem(fixture, item._id.toString());
    const expectedRevision = readSafeInteger(publicItem, 'draftRevision');
    const before = await itemResponseModel.findById(item._id).lean().exec();

    if (!before) {
      throw new Error('Expected concurrent item before snapshot');
    }

    const [doctorResponse, nurseResponse] = await Promise.all([
      doctorAgent.patch(path).send({
        expectedRevision,
        rawResponse: { candidate: 'doctor' },
        responseText: 'doctor candidate',
        operatorNote: 'doctor note',
      }),
      nurseAgent.patch(path).send({
        expectedRevision,
        rawResponse: { candidate: 'nurse' },
        responseText: 'nurse candidate',
        operatorNote: 'nurse note',
      }),
    ]);
    const responses = [doctorResponse, nurseResponse];
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = responses.find((response) => response.status === 200);
    const loser = responses.find((response) => response.status === 409);

    if (!winner || !loser) {
      throw new Error('Expected one concurrent winner and one loser');
    }

    expect(readString(readResponseBody(loser), 'code')).toBe(
      'ITEM_RESPONSE_DRAFT_CONFLICT',
    );
    const winnerItem = readRecord(readResponseBody(winner), 'itemResponse');
    const winningCandidate =
      readRecord(winnerItem, 'rawResponse').candidate === 'doctor'
        ? 'doctor'
        : 'nurse';
    const after = await itemResponseModel.findById(item._id).lean().exec();

    if (!after) {
      throw new Error('Expected concurrent item after snapshot');
    }

    expect(after.draftRevision).toBe(expectedRevision + 1);
    expect(after.draftSavedAt).toBeInstanceOf(Date);
    expect(after.rawResponse).toEqual({ candidate: winningCandidate });
    expect(after.responseText).toBe(`${winningCandidate} candidate`);
    expect(after.operatorNote).toBe(`${winningCandidate} note`);
    expect(after.patientId.toString()).toBe(before.patientId.toString());
    expect(after.assessmentVisitId.toString()).toBe(
      before.assessmentVisitId.toString(),
    );
    expect(after.scaleInstanceId.toString()).toBe(
      before.scaleInstanceId.toString(),
    );
    expect(after.score).toEqual(before.score);
    expect(after.evidenceRefs).toEqual(before.evidenceRefs);
    expect(after.countsTowardTotal).toBe(before.countsTowardTotal);

    const beforeStale = await itemResponseModel
      .findById(item._id)
      .lean()
      .exec();
    const stale = await doctorAgent
      .patch(path)
      .send({ expectedRevision, responseText: 'must not overwrite' })
      .expect(409);
    expect(readString(readResponseBody(stale), 'code')).toBe(
      'ITEM_RESPONSE_DRAFT_CONFLICT',
    );
    const afterStale = await itemResponseModel.findById(item._id).lean().exec();
    expect(afterStale).toEqual(beforeStale);
  });

  it('upgrades a legacy item with no persisted draft revision from zero to one', async () => {
    const fixture = await createExecution('LEGACY', 'mmse');
    const item = await findItem(fixture, 'mmse.memory.immediate_recall');
    await itemResponseModel
      .updateOne(
        { _id: item._id },
        { $unset: { draftRevision: 1, draftSavedAt: 1 } },
      )
      .exec();
    const publicItem = await readExecutionItem(fixture, item._id.toString());
    expect(publicItem.draftRevision).toBe(0);
    expect(publicItem.draftSavedAt).toBeNull();

    const response = await doctorAgent
      .patch(itemPath(fixture, item._id.toString()))
      .send({
        expectedRevision: readSafeInteger(publicItem, 'draftRevision'),
        responseText: 'legacy upgraded answer',
      })
      .expect(200);
    const responseItem = readRecord(readResponseBody(response), 'itemResponse');
    expect(responseItem.draftRevision).toBe(1);
    expect(
      Number.isFinite(Date.parse(readString(responseItem, 'draftSavedAt'))),
    ).toBe(true);
    const stored = await itemResponseModel.findById(item._id).exec();
    expect(stored?.draftRevision).toBe(1);
    expect(stored?.draftSavedAt).toBeInstanceOf(Date);
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
    const initialPublicItem = await readExecutionItem(
      fixture,
      item._id.toString(),
    );

    const response = await doctorAgent
      .patch(path)
      .send({
        expectedRevision: readSafeInteger(initialPublicItem, 'draftRevision'),
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
      .send({
        expectedRevision: readSafeInteger(responseItem, 'draftRevision'),
        stepResponses: [{ stepCode: 'unknown', actualValue: 1 }],
      })
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
    const initialPublicItem = await readExecutionItem(
      fixture,
      item._id.toString(),
    );
    const response = await doctorAgent
      .patch(path)
      .send({
        expectedRevision: readSafeInteger(initialPublicItem, 'draftRevision'),
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
    const responseItem = readRecord(readResponseBody(response), 'itemResponse');
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
        expectedRevision: readSafeInteger(responseItem, 'draftRevision'),
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

  it('enforces timing configuration, invariants, and persisted transitions', async () => {
    const fixture = await createExecution('TIMING', 'moca');
    const ordinaryItem = await findItem(
      fixture,
      'moca.abstraction.train_bicycle',
    );
    const timedItem = await findItem(
      fixture,
      'moca.language.verbal_fluency_animals',
    );
    const ordinaryPublicItem = await readExecutionItem(
      fixture,
      ordinaryItem._id.toString(),
    );
    const initialTimedPublicItem = await readExecutionItem(
      fixture,
      timedItem._id.toString(),
    );
    const initialTimedRevision = readSafeInteger(
      initialTimedPublicItem,
      'draftRevision',
    );

    const notAllowed = await doctorAgent
      .patch(itemPath(fixture, ordinaryItem._id.toString()))
      .send({
        expectedRevision: readSafeInteger(ordinaryPublicItem, 'draftRevision'),
        timing: {
          timerState: 'completed',
          startedAt: null,
          lastResumedAt: null,
          completedAt: null,
          durationMs: 1000,
          timerSource: 'manual',
        },
      })
      .expect(400);
    expect(readString(readResponseBody(notAllowed), 'code')).toBe(
      'ITEM_RESPONSE_TIMING_NOT_ALLOWED',
    );

    const invalidCombination = await doctorAgent
      .patch(itemPath(fixture, timedItem._id.toString()))
      .send({
        expectedRevision: initialTimedRevision,
        timing: {
          timerState: 'running',
          startedAt: '2026-07-01T08:00:00.000Z',
          lastResumedAt: '2026-07-01T08:00:01.000Z',
          completedAt: null,
          durationMs: 0,
          timerSource: 'manual',
        },
      })
      .expect(400);
    expect(readString(readResponseBody(invalidCombination), 'code')).toBe(
      'ITEM_RESPONSE_INVALID_TIMING',
    );

    const invalidTransition = await doctorAgent
      .patch(itemPath(fixture, timedItem._id.toString()))
      .send({
        expectedRevision: initialTimedRevision,
        timing: {
          timerState: 'paused',
          startedAt: '2026-07-01T08:00:00.000Z',
          lastResumedAt: null,
          completedAt: null,
          durationMs: 1000,
          timerSource: 'system',
        },
      })
      .expect(400);
    expect(readString(readResponseBody(invalidTransition), 'code')).toBe(
      'ITEM_RESPONSE_INVALID_TIMING',
    );

    const runningResponse = await doctorAgent
      .patch(itemPath(fixture, timedItem._id.toString()))
      .send({
        expectedRevision: initialTimedRevision,
        timing: {
          timerState: 'running',
          startedAt: '2026-07-01T08:00:00.000Z',
          lastResumedAt: '2026-07-01T08:00:00.000Z',
          completedAt: null,
          durationMs: 0,
          timerSource: 'system',
        },
      })
      .expect(200);
    const runningItem = readRecord(
      readResponseBody(runningResponse),
      'itemResponse',
    );
    expect(readRecord(runningItem, 'timing')).toEqual(
      expect.objectContaining({
        timerState: 'running',
        durationMs: 0,
        timerSource: 'system',
      }),
    );

    const pausedResponse = await doctorAgent
      .patch(itemPath(fixture, timedItem._id.toString()))
      .send({
        expectedRevision: readSafeInteger(runningItem, 'draftRevision'),
        timing: {
          timerState: 'paused',
          startedAt: '2026-07-01T08:00:00.000Z',
          lastResumedAt: null,
          completedAt: null,
          durationMs: 1000,
          timerSource: 'system',
        },
      })
      .expect(200);
    const pausedItem = readRecord(
      readResponseBody(pausedResponse),
      'itemResponse',
    );
    expect(readRecord(pausedItem, 'timing').timerState).toBe('paused');

    const resumedResponse = await doctorAgent
      .patch(itemPath(fixture, timedItem._id.toString()))
      .send({
        expectedRevision: readSafeInteger(pausedItem, 'draftRevision'),
        timing: {
          timerState: 'running',
          startedAt: '2026-07-01T08:00:00.000Z',
          lastResumedAt: '2026-07-01T08:00:02.000Z',
          completedAt: null,
          durationMs: 1000,
          timerSource: 'system',
        },
      })
      .expect(200);
    const resumedItem = readRecord(
      readResponseBody(resumedResponse),
      'itemResponse',
    );

    const completedResponse = await doctorAgent
      .patch(itemPath(fixture, timedItem._id.toString()))
      .send({
        expectedRevision: readSafeInteger(resumedItem, 'draftRevision'),
        timing: {
          timerState: 'completed',
          startedAt: '2026-07-01T08:00:00.000Z',
          lastResumedAt: null,
          completedAt: '2026-07-01T08:00:04.000Z',
          durationMs: 3000,
          timerSource: 'system',
        },
      })
      .expect(200);
    const completedItem = readRecord(
      readResponseBody(completedResponse),
      'itemResponse',
    );
    expect(readRecord(completedItem, 'timing')).toEqual(
      expect.objectContaining({
        timerState: 'completed',
        lastResumedAt: null,
        durationMs: 3000,
      }),
    );

    const storedItem = await itemResponseModel.findById(timedItem._id).exec();
    const storedInstance = await scaleInstanceModel
      .findById(fixture.scaleInstanceId)
      .exec();
    const storedVisit = await assessmentVisitModel
      .findById(fixture.visitId)
      .exec();
    expect(storedItem).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        draftRevision: initialTimedRevision + 4,
      }),
    );
    expect(storedItem?.score?.scoreStatus).toBe('not_scored');
    expect(storedInstance?.status).toBe('draft');
    expect(storedVisit?.status).toBe('draft');
  });

  it('rejects cross-ownership resources without revealing their existence', async () => {
    const owner = await createExecution('OWNER', 'mmse');
    const other = await createExecution('OTHER', 'mmse');
    const ownerItem = await findItem(owner, 'mmse.memory.immediate_recall');
    const otherItem = await findItem(other, 'mmse.memory.immediate_recall');
    const ownerPublicItem = await readExecutionItem(
      owner,
      ownerItem._id.toString(),
    );
    const otherPublicItem = await readExecutionItem(
      other,
      otherItem._id.toString(),
    );

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
      .send({
        expectedRevision: readSafeInteger(otherPublicItem, 'draftRevision'),
        responseText: 'must not cross ownership',
      })
      .expect(404);
    expect(readString(readResponseBody(itemMismatch), 'code')).toBe(
      'ITEM_RESPONSE_NOT_FOUND',
    );

    await doctorAgent
      .patch(itemPath(owner, ownerItem._id.toString()))
      .send({
        expectedRevision: readSafeInteger(ownerPublicItem, 'draftRevision'),
        responseText: 'owner response',
      })
      .expect(200);
  });

  it('rejects patient, visit, scale-instance, and item non-editable states', async () => {
    const fixture = await createExecution('STATES', 'mmse');
    const item = await findItem(fixture, 'mmse.memory.immediate_recall');
    const path = itemPath(fixture, item._id.toString());
    const publicItem = await readExecutionItem(fixture, item._id.toString());
    const expectedRevision = readSafeInteger(publicItem, 'draftRevision');

    await patientModel.updateOne(
      { _id: fixture.patientId },
      { status: 'inactive' },
    );
    const inactive = await doctorAgent
      .patch(path)
      .send({ expectedRevision, responseText: 'blocked' })
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
        .send({ expectedRevision, responseText: 'blocked' })
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
        .send({ expectedRevision, responseText: 'blocked' })
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
        .send({ expectedRevision, responseText: 'blocked' })
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
    const publicItem = await readExecutionItem(fixture, item._id.toString());
    const expectedRevision = readSafeInteger(publicItem, 'draftRevision');

    await doctorAgent
      .patch(path)
      .send({ responseText: 'missing token' })
      .expect(400);
    for (const invalidRevision of [-1, 0.5, '0', Number.MAX_SAFE_INTEGER + 1]) {
      await doctorAgent
        .patch(path)
        .send({
          expectedRevision: invalidRevision,
          responseText: 'invalid token',
        })
        .expect(400);
    }

    const empty = await doctorAgent
      .patch(path)
      .send({ expectedRevision })
      .expect(400);
    expect(readString(readResponseBody(empty), 'code')).toBe(
      'ITEM_RESPONSE_EMPTY_PATCH',
    );
    const falseOnly = await doctorAgent
      .patch(path)
      .send({ expectedRevision, markAsAnswered: false })
      .expect(400);
    expect(readString(readResponseBody(falseOnly), 'code')).toBe(
      'ITEM_RESPONSE_EMPTY_PATCH',
    );

    const cannotAnswer = await doctorAgent
      .patch(path)
      .send({
        expectedRevision,
        operatorNote: 'note only',
        markAsAnswered: true,
      })
      .expect(409);
    expect(readString(readResponseBody(cannotAnswer), 'code')).toBe(
      'ITEM_RESPONSE_CANNOT_MARK_ANSWERED',
    );

    for (const payload of [
      {
        expectedRevision,
        responseText: 'answer',
        score: { scoreValue: 1 },
      },
      { expectedRevision, responseText: 'answer', status: 'scored' },
      {
        expectedRevision,
        responseText: 'answer',
        metadata: { hidden: true },
      },
      {
        expectedRevision,
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
