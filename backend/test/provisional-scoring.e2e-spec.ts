import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model } from 'mongoose';
import request, { type Response } from 'supertest';
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
  MediaEvidence,
  MediaEvidenceDocument,
} from '../src/modules/media/schemas/media-evidence.schema';
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
import {
  ScoreResult,
  ScoreResultDocument,
} from '../src/modules/scoring/schemas/score-result.schema';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const DOCTOR_ACCOUNT = 'doctor-a17-test';
const SYSTEM_ACCOUNT = 'system-a17-test';
const PASSWORD = 'A17-Test-Password!';
const SUBJECT_PREFIX = 'SUBJ-A17-TEST-';
const VISIT_PREFIX = 'VISIT-A17-TEST-';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type SupertestApp = Parameters<typeof request.agent>[0];
type Fixture = { patientId: string; visitId: string; scaleInstanceId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function body(response: Response): Record<string, unknown> {
  if (!isRecord(response.body)) throw new Error('Expected response object');
  return response.body;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Expected ${label} object`);
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Expected ${label} string`);
  return value;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} array`);
  return value;
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeys(entry, keys));
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([key, nested]) => {
      keys.add(key);
      collectKeys(nested, keys);
    });
  }
  return keys;
}

describe('provisional scoring APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let instanceModel: Model<ScaleInstanceDocument>;
  let itemModel: Model<ItemResponseDocument>;
  let mediaModel: Model<MediaEvidenceDocument>;
  let scoreModel: Model<ScoreResultDocument>;
  let definitionModel: Model<ScaleDefinitionDocument>;
  let versionModel: Model<ScaleVersionDocument>;
  let doctorAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let server: SupertestApp;
  let modelsReady = false;

  function instancePath(fixture: Fixture): string {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${fixture.scaleInstanceId}`;
  }

  function computePath(fixture: Fixture): string {
    return `${instancePath(fixture)}/score-results/compute`;
  }

  function latestPath(fixture: Fixture): string {
    return `${instancePath(fixture)}/score-results/latest`;
  }

  async function cleanup(): Promise<void> {
    const users = await userModel
      .find({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }
    const visits = await visitModel
      .find({ visitCode: /^VISIT-A17-TEST-/ })
      .select({ _id: 1 })
      .exec();
    const visitIds = visits.map((visit) => visit._id);
    const instances =
      visitIds.length > 0
        ? await instanceModel
            .find({ assessmentVisitId: { $in: visitIds } })
            .select({ _id: 1 })
            .exec()
        : [];
    const instanceIds = instances.map((instance) => instance._id);
    if (instanceIds.length > 0) {
      await scoreModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await mediaModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await itemModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await instanceModel.deleteMany({ _id: { $in: instanceIds } }).exec();
    }
    if (visitIds.length > 0) {
      await visitModel.deleteMany({ _id: { $in: visitIds } }).exec();
    }
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A17-TEST-/ }).exec();
    await userModel
      .deleteMany({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .exec();
    const definitions = await definitionModel
      .find({ code: { $in: ['mmse', 'moca'] } })
      .select({ _id: 1 })
      .exec();
    const definitionIds = definitions.map((definition) => definition._id);
    if (definitionIds.length > 0) {
      await versionModel
        .deleteMany({ scaleDefinitionId: { $in: definitionIds } })
        .exec();
      await definitionModel.deleteMany({ _id: { $in: definitionIds } }).exec();
    }
  }

  async function createFixture(
    suffix: string,
    scaleCode: 'mmse' | 'moca',
  ): Promise<Fixture> {
    const patientResponse = await doctorAgent
      .post('/patients')
      .send({ subjectCode: `${SUBJECT_PREFIX}${suffix}` })
      .expect(201);
    const patientId = stringValue(body(patientResponse).id, 'patient id');
    const visitResponse = await doctorAgent
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: `${VISIT_PREFIX}${suffix}`,
        assessmentDate: '2026-07-01T08:00:00.000Z',
      })
      .expect(201);
    const visitId = stringValue(body(visitResponse).id, 'visit id');
    const instanceResponse = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({ scaleCode })
      .expect(201);
    const scaleInstance = record(
      body(instanceResponse).scaleInstance,
      'scale instance',
    );
    return {
      patientId,
      visitId,
      scaleInstanceId: stringValue(scaleInstance.id, 'scale instance id'),
    };
  }

  async function completeAndSubmit(fixture: Fixture): Promise<void> {
    const detail = body(
      await doctorAgent.get(instancePath(fixture)).expect(200),
    );
    const items = arrayValue(detail.itemResponses, 'item responses');
    const serialValues = [93, 86, 0, 0, 0];
    for (const value of items) {
      const item = record(value, 'item response');
      const itemId = stringValue(item.id, 'item id');
      const config = record(item.config, 'item config');
      const stepResponses = arrayValue(
        item.stepResponses,
        'step responses',
      ).map((stepValue, index) => ({
        stepCode: stringValue(record(stepValue, 'step').stepCode, 'step code'),
        actualValue: serialValues[index] ?? 0,
      }));
      await doctorAgent
        .patch(`${instancePath(fixture)}/item-responses/${itemId}`)
        .send({
          rawResponse: false,
          operatorNote: 'A17 de-identified operator note',
          ...(stepResponses.length > 0 ? { stepResponses } : {}),
          ...(config.requiresTimer === true
            ? { timing: { durationMs: 1000, timerSource: 'manual' } }
            : {}),
          markAsAnswered: true,
        })
        .expect(200);
      if (config.supportsPhotoUpload === true) {
        await doctorAgent
          .post(
            `${instancePath(fixture)}/item-responses/${itemId}/media-evidences`,
          )
          .field('evidenceType', 'photo')
          .field('captureMode', 'photo_upload')
          .field('imageWidth', '1')
          .field('imageHeight', '1')
          .attach('file', VALID_PNG, {
            filename: 'a17-test.png',
            contentType: 'image/png',
          })
          .expect(201);
      }
    }
    await doctorAgent
      .post(`${instancePath(fixture)}/submit`)
      .send({ confirm: true })
      .expect(200);
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test')
      throw new Error('E2E requires NODE_ENV=test');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    const databaseName = connection.name.toLowerCase();
    if (
      !databaseName.includes('_test') ||
      databaseName.includes('_dev') ||
      databaseName.includes('_prod')
    ) {
      throw new Error('E2E database isolation is not active');
    }
    const config = app.get(ConfigService);
    if (
      config.get<string>('app.env') !== 'test' ||
      config.get<string>('storage.driver') !== 'fake' ||
      config.get<string>('llm.provider') !== 'stub' ||
      config.get<string>('smsAuth.provider') !== 'stub'
    ) {
      throw new Error('E2E external service isolation is not active');
    }
    authService = app.get(AuthService);
    userModel = app.get(getModelToken(User.name));
    sessionModel = app.get(getModelToken(Session.name));
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    instanceModel = app.get(getModelToken(ScaleInstance.name));
    itemModel = app.get(getModelToken(ItemResponse.name));
    mediaModel = app.get(getModelToken(MediaEvidence.name));
    scoreModel = app.get(getModelToken(ScoreResult.name));
    definitionModel = app.get(getModelToken(ScaleDefinition.name));
    versionModel = app.get(getModelToken(ScaleVersion.name));
    modelsReady = true;
    await cleanup();
    const passwordHash = await authService.hashPassword(PASSWORD);
    await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A17 Doctor Test Operator',
      staffCode: 'STAFF-A17-TEST',
      email: 'doctor-a17-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A17 System Test Operator',
      staffCode: 'SYSTEM-A17-TEST',
      email: 'system-a17-test@example.test',
      passwordHash,
      roles: ['system'],
      permissions: [],
      userType: 'system',
      status: 'active',
      metadata: null,
    });
    server = app.getHttpServer() as SupertestApp;
    doctorAgent = request.agent(server);
    systemAgent = request.agent(server);
    await doctorAgent
      .post('/auth/login')
      .send({ accountName: DOCTOR_ACCOUNT, password: PASSWORD })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({ accountName: SYSTEM_ACCOUNT, password: PASSWORD })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      if (modelsReady) await cleanup();
      await app.close();
    }
  });

  it('enforces authentication, roles, confirmation, state and ownership', async () => {
    const placeholder = {
      patientId: '507f1f77bcf86cd799439021',
      visitId: '507f1f77bcf86cd799439022',
      scaleInstanceId: '507f1f77bcf86cd799439023',
    };
    await request(server).get(latestPath(placeholder)).expect(401);
    await request(server)
      .post(computePath(placeholder))
      .send({ confirm: true })
      .expect(401);
    await systemAgent.get(latestPath(placeholder)).expect(403);
    await systemAgent
      .post(computePath(placeholder))
      .send({ confirm: true })
      .expect(403);

    const fixture = await createFixture('GUARDS', 'mmse');
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: true })
          .expect(409),
      ).code,
    ).toBe('SCORE_INSTANCE_NOT_COMPUTABLE');
    expect(
      body(await doctorAgent.get(latestPath(fixture)).expect(404)).code,
    ).toBe('SCORE_RESULT_NOT_FOUND');
    expect(
      body(await doctorAgent.post(computePath(fixture)).send({}).expect(400))
        .code,
    ).toBe('SCORE_COMPUTATION_CONFIRMATION_REQUIRED');
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: false })
          .expect(400),
      ).code,
    ).toBe('SCORE_COMPUTATION_CONFIRMATION_REQUIRED');
    await doctorAgent
      .post(computePath(fixture))
      .send({ confirm: true, itemScores: [], runNo: 2, force: true })
      .expect(400);

    const other = await createFixture('OWNERSHIP', 'mmse');
    const crossPath = `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${other.scaleInstanceId}/score-results/latest`;
    expect(body(await doctorAgent.get(crossPath).expect(404)).code).toBe(
      'SCALE_INSTANCE_NOT_FOUND',
    );
  });

  it('computes MMSE provisionally, remains immutable and repeats idempotently', async () => {
    const fixture = await createFixture('MMSE', 'mmse');
    await completeAndSubmit(fixture);
    const beforeVisit = await visitModel
      .findById(fixture.visitId)
      .lean()
      .exec();
    const beforeInstance = await instanceModel
      .findById(fixture.scaleInstanceId)
      .lean()
      .exec();
    const beforeItems = await itemModel
      .find({ scaleInstanceId: fixture.scaleInstanceId })
      .sort({ itemOrder: 1 })
      .lean()
      .exec();

    const first = body(
      await doctorAgent
        .post(computePath(fixture))
        .send({ confirm: true })
        .expect(200),
    );
    expect(first.alreadyComputed).toBe(false);
    const result = record(first.scoreResult, 'score result');
    expect(result.runNo).toBe(1);
    expect(result.status).toBe('needs_review');
    expect(result.scoringSource).toBe('mixed');
    expect(result.scoringMode).toBe('rule_based');
    expect(result.qualityStatus).toBe('needs_review');
    expect(result.isFinal).toBe(false);
    const total = record(result.totalScore, 'total score');
    expect(total.provisionalScoreValue).toBe(2);
    expect(total.scorePercent).toBeNull();
    expect(total.isComplete).toBe(false);
    const itemScores = arrayValue(result.itemScores, 'item scores');
    const serial = itemScores.find(
      (item) =>
        isRecord(item) && item.itemCode === 'mmse.attention.serial_sevens',
    );
    expect(serial).toEqual(
      expect.objectContaining({
        provisionalScoreValue: 2,
        scoreStatus: 'auto_scored',
        scoreSource: 'auto_rule',
      }),
    );
    expect(
      arrayValue(first.reviewQueue, 'review queue').length,
    ).toBeGreaterThan(0);
    const keys = collectKeys(first);
    for (const forbidden of [
      'rawResponse',
      'structuredResponse',
      'responseText',
      'expectedValue',
      'scoringRule',
      'isCorrect',
      'metadata',
      'qualityHints',
      'reviewerId',
      'reviewerName',
      'reviewNote',
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
    expect(
      await scoreModel.countDocuments({
        scaleInstanceId: fixture.scaleInstanceId,
      }),
    ).toBe(1);
    expect(await visitModel.findById(fixture.visitId).lean().exec()).toEqual(
      beforeVisit,
    );
    expect(
      await instanceModel.findById(fixture.scaleInstanceId).lean().exec(),
    ).toEqual(beforeInstance);
    expect(
      await itemModel
        .find({ scaleInstanceId: fixture.scaleInstanceId })
        .sort({ itemOrder: 1 })
        .lean()
        .exec(),
    ).toEqual(beforeItems);
    expect(
      await connection.collection('cognitive_domain_results').countDocuments({
        scaleInstanceId: beforeInstance?._id,
      }),
    ).toBe(0);
    expect(
      await connection.collection('clinical_reports').countDocuments({
        scaleInstanceId: beforeInstance?._id,
      }),
    ).toBe(0);

    const latest = body(await doctorAgent.get(latestPath(fixture)).expect(200));
    expect(record(latest.scoreResult, 'latest result').scoreResultCode).toBe(
      result.scoreResultCode,
    );
    const second = body(
      await doctorAgent
        .post(computePath(fixture))
        .send({ confirm: true })
        .expect(200),
    );
    expect(second.alreadyComputed).toBe(true);
    expect(record(second.scoreResult, 'second result').scoreResultCode).toBe(
      result.scoreResultCode,
    );
    expect(
      await scoreModel.countDocuments({
        scaleInstanceId: fixture.scaleInstanceId,
      }),
    ).toBe(1);
  });

  it('uses MoCA aggregation and excludes immediate-memory raw records', async () => {
    const fixture = await createFixture('MOCA', 'moca');
    await completeAndSubmit(fixture);
    const response = body(
      await doctorAgent
        .post(computePath(fixture))
        .send({ confirm: true })
        .expect(200),
    );
    const result = record(response.scoreResult, 'score result');
    const items = arrayValue(result.itemScores, 'item scores');
    expect(
      items.find(
        (item) =>
          isRecord(item) && item.itemCode === 'moca.attention.serial_sevens',
      ),
    ).toEqual(expect.objectContaining({ provisionalScoreValue: 2 }));
    const rawRecords = items.filter(
      (item) =>
        isRecord(item) &&
        item.countsTowardTotal === false &&
        item.scoreStatus === 'not_scored',
    );
    expect(rawRecords.length).toBeGreaterThan(0);
    const reviewCodes = arrayValue(response.reviewQueue, 'review queue').map(
      (item) => record(item, 'review item').itemCode,
    );
    for (const rawRecord of rawRecords) {
      expect(reviewCodes).not.toContain(
        record(rawRecord, 'raw record').itemCode,
      );
    }
  });

  it('enforces first-compute states while preserving historical idempotent reads', async () => {
    const fixture = await createFixture('STATE', 'mmse');
    await completeAndSubmit(fixture);

    for (const status of ['inactive', 'archived'] as const) {
      await patientModel.updateOne({ _id: fixture.patientId }, { status });
      expect(
        body(
          await doctorAgent
            .post(computePath(fixture))
            .send({ confirm: true })
            .expect(409),
        ).code,
      ).toBe('PATIENT_NOT_ACTIVE');
    }
    await patientModel.updateOne(
      { _id: fixture.patientId },
      { status: 'active' },
    );

    for (const status of ['locked', 'voided'] as const) {
      await visitModel.updateOne({ _id: fixture.visitId }, { status });
      expect(
        body(
          await doctorAgent
            .post(computePath(fixture))
            .send({ confirm: true })
            .expect(409),
        ).code,
      ).toBe('VISIT_NOT_EDITABLE');
    }
    await visitModel.updateOne({ _id: fixture.visitId }, { status: 'draft' });

    const first = body(
      await doctorAgent
        .post(computePath(fixture))
        .send({ confirm: true })
        .expect(200),
    );
    expect(first.alreadyComputed).toBe(false);
    await patientModel.updateOne(
      { _id: fixture.patientId },
      { status: 'archived' },
    );
    await visitModel.updateOne({ _id: fixture.visitId }, { status: 'voided' });
    const repeated = body(
      await doctorAgent
        .post(computePath(fixture))
        .send({ confirm: true })
        .expect(200),
    );
    expect(repeated.alreadyComputed).toBe(true);
    await doctorAgent.get(latestPath(fixture)).expect(200);
  });
});
