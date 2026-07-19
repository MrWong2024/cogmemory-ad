import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import request, { type Response } from 'supertest';
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
  CognitiveDomainResult,
  CognitiveDomainResultDocument,
} from '../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
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

const DOCTOR_ACCOUNT = 'doctor-a19-test';
const SYSTEM_ACCOUNT = 'system-a19-test';
const PASSWORD = 'A19-Test-Password!';
const SUBJECT_PREFIX = 'SUBJ-A19-TEST-';
const VISIT_PREFIX = 'VISIT-A19-TEST-';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;
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

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number') throw new Error(`Expected ${label} number`);
  return value;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} array`);
  return value;
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((entry) => collectKeys(entry, keys));
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, nested]) => {
      keys.add(key);
      collectKeys(nested, keys);
    });
  }
  return keys;
}

describe('cognitive domain computation APIs (e2e)', () => {
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
  let domainModel: Model<CognitiveDomainResultDocument>;
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
    return `${instancePath(fixture)}/cognitive-domain-results/compute`;
  }

  function latestPath(fixture: Fixture): string {
    return `${instancePath(fixture)}/cognitive-domain-results/latest`;
  }

  async function cleanup(): Promise<void> {
    const users = await userModel
      .find({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0)
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    const visits = await visitModel
      .find({ visitCode: /^VISIT-A19-TEST-/ })
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
      await domainModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
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
    if (visitIds.length > 0)
      await visitModel.deleteMany({ _id: { $in: visitIds } }).exec();
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A19-TEST-/ }).exec();
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

  async function createFixture(suffix: string): Promise<Fixture> {
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
      .send({ scaleCode: 'moca' })
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
          operatorNote: 'A19 de-identified operator note',
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
            filename: 'a19-test.png',
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

  async function createConfirmedScore(
    fixture: Fixture,
  ): Promise<Record<string, unknown>> {
    let response = body(
      await doctorAgent
        .post(`${instancePath(fixture)}/score-results/compute`)
        .send({ confirm: true })
        .expect(200),
    );
    let scoreResult = record(response.scoreResult, 'score result');
    const scoreResultId = stringValue(scoreResult.id, 'score result id');
    while (arrayValue(response.reviewQueue, 'review queue').length > 0) {
      const target = record(
        arrayValue(response.reviewQueue, 'review queue')[0],
        'target',
      );
      const itemResponseId = stringValue(
        target.itemResponseId,
        'target item response id',
      );
      const scoreItem = record(
        arrayValue(scoreResult.itemScores, 'score items').find(
          (item) => isRecord(item) && item.itemResponseId === itemResponseId,
        ),
        'score item',
      );
      response = body(
        await doctorAgent
          .patch(
            `${instancePath(fixture)}/score-results/${scoreResultId}/item-scores/${itemResponseId}/manual-review`,
          )
          .send({
            scoreValue: numberValue(scoreItem.minScore, 'item min score'),
            reviewNote: 'A19 de-identified manual review',
            expectedUpdatedAt: stringValue(
              scoreResult.updatedAt,
              'score updatedAt',
            ),
          })
          .expect(200),
      );
      scoreResult = record(response.scoreResult, 'reviewed score result');
    }
    const confirmed = body(
      await doctorAgent
        .post(`${instancePath(fixture)}/score-results/${scoreResultId}/confirm`)
        .send({
          confirm: true,
          reviewNote: 'A19 de-identified score confirmation',
          expectedUpdatedAt: stringValue(
            scoreResult.updatedAt,
            'score updatedAt',
          ),
        })
        .expect(200),
    );
    return record(confirmed.scoreResult, 'confirmed score result');
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
    domainModel = app.get(getModelToken(CognitiveDomainResult.name));
    definitionModel = app.get(getModelToken(ScaleDefinition.name));
    versionModel = app.get(getModelToken(ScaleVersion.name));
    modelsReady = true;
    await cleanup();
    const passwordHash = await authService.hashPassword(PASSWORD);
    await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A19 Doctor Test Operator',
      staffCode: 'STAFF-A19-TEST',
      email: 'doctor-a19-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A19 System Test Operator',
      staffCode: 'SYSTEM-A19-TEST',
      email: 'system-a19-test@example.test',
      passwordHash,
      roles: ['system'],
      permissions: [],
      userType: 'system',
      status: 'active',
      metadata: null,
    });
    server = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
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

  it('enforces authentication and clinical workflow roles', async () => {
    const fixture = {
      patientId: '507f1f77bcf86cd799439021',
      visitId: '507f1f77bcf86cd799439022',
      scaleInstanceId: '507f1f77bcf86cd799439023',
    };
    await request(server).get(latestPath(fixture)).expect(401);
    await request(server)
      .post(computePath(fixture))
      .send({ confirm: true })
      .expect(401);
    await systemAgent.get(latestPath(fixture)).expect(403);
    await systemAgent
      .post(computePath(fixture))
      .send({ confirm: true })
      .expect(403);
  });

  it('computes, queries and preserves an overlapping run-one result safely', async () => {
    const fixture = await createFixture('MAIN');
    await completeAndSubmit(fixture);
    expect(
      body(await doctorAgent.get(latestPath(fixture)).expect(404)).code,
    ).toBe('COGNITIVE_DOMAIN_RESULT_NOT_FOUND');
    await doctorAgent.post(computePath(fixture)).send({}).expect(400);
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: false })
          .expect(400),
      ).code,
    ).toBe('COGNITIVE_DOMAIN_COMPUTATION_CONFIRMATION_REQUIRED');
    await doctorAgent
      .post(computePath(fixture))
      .send({ confirm: true, domainScores: [], weights: [], force: true })
      .expect(400);

    await doctorAgent
      .post(`${instancePath(fixture)}/score-results/compute`)
      .send({ confirm: true })
      .expect(200);
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: true })
          .expect(409),
      ).code,
    ).toBe('COGNITIVE_DOMAIN_SOURCE_SCORE_NOT_FINAL');
    const confirmedScore = await createConfirmedScore(fixture);
    const scoreResultId = stringValue(confirmedScore.id, 'score result id');

    const patientBeforeState = await patientModel
      .findById(fixture.patientId)
      .lean()
      .exec();
    const visitBeforeState = await visitModel
      .findById(fixture.visitId)
      .lean()
      .exec();
    await patientModel.updateOne(
      { _id: fixture.patientId },
      { $set: { status: 'inactive' } },
    );
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: true })
          .expect(409),
      ).code,
    ).toBe('PATIENT_NOT_ACTIVE');
    await patientModel.updateOne(
      { _id: fixture.patientId },
      { $set: { status: 'active' } },
    );
    await visitModel.updateOne(
      { _id: fixture.visitId },
      { $set: { status: 'locked' } },
    );
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: true })
          .expect(409),
      ).code,
    ).toBe('VISIT_NOT_EDITABLE');
    await visitModel.updateOne(
      { _id: fixture.visitId },
      { $set: { status: visitBeforeState?.status ?? 'draft' } },
    );
    await instanceModel.updateOne(
      { _id: fixture.scaleInstanceId },
      { $set: { status: 'in_progress' } },
    );
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: true })
          .expect(409),
      ).code,
    ).toBe('COGNITIVE_DOMAIN_INSTANCE_NOT_COMPUTABLE');
    await instanceModel.updateOne(
      { _id: fixture.scaleInstanceId },
      { $set: { status: 'completed' } },
    );

    const beforePatient = await patientModel
      .findById(fixture.patientId)
      .lean()
      .exec();
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
    const beforeScore = await scoreModel.findById(scoreResultId).lean().exec();
    expect(patientBeforeState).not.toBeNull();

    const computed = body(
      await doctorAgent
        .post(computePath(fixture))
        .send({ confirm: true })
        .expect(200),
    );
    expect(computed.alreadyComputed).toBe(false);
    const result = record(computed.cognitiveDomainResult, 'domain result');
    expect(result).toEqual(
      expect.objectContaining({
        runNo: 1,
        status: 'computed',
        mappingSource: 'scale_config',
        mappingMode: 'item_domain_codes',
        qualityStatus: 'unchecked',
        isFinal: false,
      }),
    );
    const mapping = record(result.mapping, 'mapping');
    expect(record(mapping.policy, 'mapping policy')).toEqual({
      strategy: 'full_item_score_per_domain',
      weight: 1,
      deduplicatePerItem: true,
      overlappingDomains: true,
    });
    expect(
      record(mapping.interpretation, 'mapping interpretation')
        .domainScoresAreScaleTotalPartition,
    ).toBe(false);
    const domainScores = arrayValue(result.domainScores, 'domain scores').map(
      (value) => record(value, 'domain score'),
    );
    const domainCodes = domainScores.map((score) =>
      stringValue(score.domainCode, 'domain code'),
    );
    expect(domainCodes).toEqual([...domainCodes].sort());
    for (const score of domainScores) {
      const min = numberValue(score.minScore, 'domain min');
      const max = numberValue(score.maxScore, 'domain max');
      const value = numberValue(score.scoreValue, 'domain score');
      expect(score.scorePercent).toBeCloseTo(
        ((value - min) / (max - min)) * 100,
      );
    }
    const contributions = arrayValue(
      result.itemContributions,
      'item contributions',
    ).map((value) => record(value, 'contribution'));
    const sortedContributions = [...contributions].sort(
      (left, right) =>
        numberValue(left.itemOrder, 'left order') -
          numberValue(right.itemOrder, 'right order') ||
        stringValue(left.itemCode, 'left item').localeCompare(
          stringValue(right.itemCode, 'right item'),
        ) ||
        stringValue(left.domainCode, 'left domain').localeCompare(
          stringValue(right.domainCode, 'right domain'),
        ),
    );
    expect(contributions).toEqual(sortedContributions);
    const grouped = new Map<string, Record<string, unknown>[]>();
    contributions.forEach((contribution) => {
      const code = stringValue(contribution.itemCode, 'item code');
      grouped.set(code, [...(grouped.get(code) ?? []), contribution]);
    });
    const overlapping = [...grouped.values()].find(
      (entries) => entries.length > 1,
    );
    expect(overlapping).toBeDefined();
    if (overlapping) {
      expect(new Set(overlapping.map((entry) => entry.domainCode)).size).toBe(
        overlapping.length,
      );
      expect(new Set(overlapping.map((entry) => entry.scoreValue)).size).toBe(
        1,
      );
      expect(overlapping.every((entry) => entry.weight === 1)).toBe(true);
    }
    expect(
      contributions.some((entry) => entry.countsTowardDomain === false),
    ).toBe(true);
    const forbiddenKeys = collectKeys(computed);
    for (const forbidden of [
      'rawResponse',
      'structuredResponse',
      'responseText',
      'missingReason',
      'scoringRule',
      'expectedValue',
      'isCorrect',
      'metadata',
      'qualityHints',
      'computedBy',
      'operatorNote',
      'subjectCode',
      'diagnosis',
      'thresholds',
    ]) {
      expect(forbiddenKeys.has(forbidden)).toBe(false);
    }
    expect(
      await domainModel.countDocuments({
        scaleInstanceId: new Types.ObjectId(fixture.scaleInstanceId),
        runNo: 1,
      }),
    ).toBe(1);
    expect(await scoreModel.findById(scoreResultId).lean().exec()).toEqual(
      beforeScore,
    );
    expect(
      await patientModel.findById(fixture.patientId).lean().exec(),
    ).toEqual(beforePatient);
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
      await connection.collection('clinical_reports').countDocuments({
        assessmentVisitId: new Types.ObjectId(fixture.visitId),
      }),
    ).toBe(0);

    const repeated = body(
      await doctorAgent
        .post(computePath(fixture))
        .send({ confirm: true })
        .expect(200),
    );
    expect(repeated.alreadyComputed).toBe(true);
    expect(repeated.cognitiveDomainResult).toEqual(result);
    const latest = body(await doctorAgent.get(latestPath(fixture)).expect(200));
    expect(latest.cognitiveDomainResult).toEqual(result);

    await patientModel.updateOne(
      { _id: fixture.patientId },
      { $set: { status: 'archived' } },
    );
    await visitModel.updateOne(
      { _id: fixture.visitId },
      { $set: { status: 'voided' } },
    );
    await instanceModel.updateOne(
      { _id: fixture.scaleInstanceId },
      { $set: { status: 'voided' } },
    );
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: true })
          .expect(200),
      ).alreadyComputed,
    ).toBe(true);
    const domainResultId = stringValue(result.id, 'domain result id');
    await domainModel.updateOne(
      { _id: domainResultId },
      { $set: { status: 'voided', voidedAt: new Date() } },
    );
    expect(
      record(
        body(await doctorAgent.get(latestPath(fixture)).expect(200))
          .cognitiveDomainResult,
        'voided result',
      ).status,
    ).toBe('voided');
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: true })
          .expect(409),
      ).code,
    ).toBe('COGNITIVE_DOMAIN_RESULT_VOIDED');
  });
});
