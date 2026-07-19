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

const DOCTOR_ACCOUNT = 'doctor-a18-test';
const SYSTEM_ACCOUNT = 'system-a18-test';
const PASSWORD = 'A18-Test-Password!';
const SUBJECT_PREFIX = 'SUBJ-A18-TEST-';
const VISIT_PREFIX = 'VISIT-A18-TEST-';
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

describe('manual score review and confirmation APIs (e2e)', () => {
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

  function reviewPath(
    fixture: Fixture,
    scoreResultId: string,
    itemResponseId: string,
  ): string {
    return `${instancePath(fixture)}/score-results/${scoreResultId}/item-scores/${itemResponseId}/manual-review`;
  }

  function confirmPath(fixture: Fixture, scoreResultId: string): string {
    return `${instancePath(fixture)}/score-results/${scoreResultId}/confirm`;
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
      .find({ visitCode: /^VISIT-A18-TEST-/ })
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
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A18-TEST-/ }).exec();
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
    scaleCode: 'mmse' | 'moca' = 'mmse',
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
          operatorNote: 'A18 de-identified operator note',
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
            filename: 'a18-test.png',
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
      displayName: 'A18 Doctor Test Operator',
      staffCode: 'STAFF-A18-TEST',
      email: 'doctor-a18-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A18 System Test Operator',
      staffCode: 'SYSTEM-A18-TEST',
      email: 'system-a18-test@example.test',
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

  it('enforces authentication, roles and path ownership', async () => {
    const fixture = {
      patientId: '507f1f77bcf86cd799439021',
      visitId: '507f1f77bcf86cd799439022',
      scaleInstanceId: '507f1f77bcf86cd799439023',
    };
    const scoreResultId = '507f1f77bcf86cd799439024';
    const itemResponseId = '507f1f77bcf86cd799439025';
    await request(server)
      .patch(reviewPath(fixture, scoreResultId, itemResponseId))
      .send({
        scoreValue: 0,
        reviewNote: 'manual test review',
        expectedUpdatedAt: '2026-07-11T01:00:00.000Z',
      })
      .expect(401);
    await request(server)
      .post(confirmPath(fixture, scoreResultId))
      .send({
        confirm: true,
        reviewNote: 'final test confirmation',
        expectedUpdatedAt: '2026-07-11T01:00:00.000Z',
      })
      .expect(401);
    await systemAgent
      .patch(reviewPath(fixture, scoreResultId, itemResponseId))
      .send({
        scoreValue: 0,
        reviewNote: 'manual test review',
        expectedUpdatedAt: '2026-07-11T01:00:00.000Z',
      })
      .expect(403);
    await systemAgent
      .post(confirmPath(fixture, scoreResultId))
      .send({
        confirm: true,
        reviewNote: 'final test confirmation',
        expectedUpdatedAt: '2026-07-11T01:00:00.000Z',
      })
      .expect(403);
  });

  it('reviews every pending item, re-derives totals and confirms idempotently', async () => {
    const fixture = await createFixture('MAIN', 'moca');
    await completeAndSubmit(fixture);
    const computed = body(
      await doctorAgent
        .post(computePath(fixture))
        .send({ confirm: true })
        .expect(200),
    );
    const initialResult = record(computed.scoreResult, 'initial result');
    const scoreResultId = stringValue(initialResult.id, 'score result id');
    const initialUpdatedAt = stringValue(
      initialResult.updatedAt,
      'initial updatedAt',
    );
    expect(Number.isFinite(Date.parse(initialUpdatedAt))).toBe(true);
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
    const initialQueue = arrayValue(
      computed.reviewQueue,
      'initial review queue',
    );
    expect(initialQueue.length).toBeGreaterThan(1);
    const firstQueueItem = record(initialQueue[0], 'first review item');
    const firstItemId = stringValue(
      firstQueueItem.itemResponseId,
      'first item response id',
    );
    const initialItems = arrayValue(
      initialResult.itemScores,
      'initial item scores',
    );
    const firstScoreItem = record(
      initialItems.find(
        (item) => isRecord(item) && item.itemResponseId === firstItemId,
      ),
      'first score item',
    );
    const minScore = numberValue(firstScoreItem.minScore, 'minimum score');
    const maxScore = numberValue(firstScoreItem.maxScore, 'maximum score');

    await doctorAgent
      .patch(reviewPath(fixture, scoreResultId, firstItemId))
      .send({ scoreValue: minScore, expectedUpdatedAt: initialUpdatedAt })
      .expect(400);
    await doctorAgent
      .patch(reviewPath(fixture, scoreResultId, firstItemId))
      .send({
        scoreValue: minScore,
        reviewNote: 'manual zero test review',
      })
      .expect(400);
    expect(
      body(
        await doctorAgent
          .patch(reviewPath(fixture, scoreResultId, firstItemId))
          .send({
            scoreValue: maxScore + 1,
            reviewNote: 'manual range test review',
            expectedUpdatedAt: initialUpdatedAt,
          })
          .expect(409),
      ).code,
    ).toBe('SCORE_MANUAL_VALUE_OUT_OF_RANGE');
    expect(
      body(
        await doctorAgent
          .patch(reviewPath(fixture, scoreResultId, firstItemId))
          .send({
            scoreValue: minScore + 0.5,
            reviewNote: 'manual step test review',
            expectedUpdatedAt: initialUpdatedAt,
          })
          .expect(409),
      ).code,
    ).toBe('SCORE_MANUAL_VALUE_STEP_INVALID');

    const autoItem = record(
      initialItems.find(
        (item) => isRecord(item) && item.scoreStatus === 'auto_scored',
      ),
      'automatic score item',
    );
    expect(
      body(
        await doctorAgent
          .patch(
            reviewPath(
              fixture,
              scoreResultId,
              stringValue(autoItem.itemResponseId, 'automatic item id'),
            ),
          )
          .send({
            scoreValue: numberValue(autoItem.minScore, 'automatic min score'),
            reviewNote: 'automatic overwrite rejection',
            expectedUpdatedAt: initialUpdatedAt,
          })
          .expect(409),
      ).code,
    ).toBe('SCORE_ITEM_NOT_REVIEWABLE');
    const processItem = record(
      initialItems.find(
        (item) => isRecord(item) && item.countsTowardTotal === false,
      ),
      'process score item',
    );
    expect(
      body(
        await doctorAgent
          .patch(
            reviewPath(
              fixture,
              scoreResultId,
              stringValue(processItem.itemResponseId, 'process item id'),
            ),
          )
          .send({
            scoreValue: 0,
            reviewNote: 'process overwrite rejection',
            expectedUpdatedAt: initialUpdatedAt,
          })
          .expect(409),
      ).code,
    ).toBe('SCORE_ITEM_NOT_REVIEWABLE');
    await doctorAgent
      .patch(reviewPath(fixture, scoreResultId, firstItemId))
      .send({
        scoreValue: minScore,
        reviewNote: 'manual zero test review',
        expectedUpdatedAt: initialUpdatedAt,
        metadata: { forged: true },
      })
      .expect(400);

    const firstReview = body(
      await doctorAgent
        .patch(reviewPath(fixture, scoreResultId, firstItemId))
        .send({
          scoreValue: minScore,
          reviewNote: 'manual zero test review',
          expectedUpdatedAt: initialUpdatedAt,
        })
        .expect(200),
    );
    const firstReviewedResult = record(
      firstReview.scoreResult,
      'reviewed result',
    );
    const firstReviewedAt = stringValue(
      firstReviewedResult.updatedAt,
      'reviewed updatedAt',
    );
    expect(firstReviewedAt).not.toBe(initialUpdatedAt);
    expect(
      record(firstReview.reviewUpdate, 'review update').pendingItemCount,
    ).toBe(initialQueue.length - 1);
    expect(arrayValue(firstReview.reviewQueue, 'review queue')).toHaveLength(
      initialQueue.length - 1,
    );
    const reviewedItem = record(
      arrayValue(firstReviewedResult.itemScores, 'reviewed items').find(
        (item) => isRecord(item) && item.itemResponseId === firstItemId,
      ),
      'reviewed item',
    );
    expect(reviewedItem.provisionalScoreValue).toBe(minScore);
    expect(reviewedItem.scoreStatus).toBe('manual_scored');
    expect(reviewedItem.scoreSource).toBe('operator');
    expect(record(reviewedItem.manualReview, 'manual review').reviewNote).toBe(
      'manual zero test review',
    );
    expect(collectKeys(firstReview).has('previousScoreValue')).toBe(false);
    expect(collectKeys(firstReview).has('metadata')).toBe(false);
    expect(
      body(
        await doctorAgent
          .patch(reviewPath(fixture, scoreResultId, firstItemId))
          .send({
            scoreValue: maxScore,
            reviewNote: 'manual stale conflict review',
            expectedUpdatedAt: initialUpdatedAt,
          })
          .expect(409),
      ).code,
    ).toBe('SCORE_RESULT_REVIEW_CONFLICT');

    const revised = body(
      await doctorAgent
        .patch(reviewPath(fixture, scoreResultId, firstItemId))
        .send({
          scoreValue: maxScore,
          reviewNote: 'manual revised test review',
          expectedUpdatedAt: firstReviewedAt,
        })
        .expect(200),
    );
    let currentResult = record(revised.scoreResult, 'revised result');
    let currentUpdatedAt = stringValue(
      currentResult.updatedAt,
      'revised updatedAt',
    );
    expect(currentUpdatedAt).not.toBe(firstReviewedAt);
    expect(arrayValue(revised.reviewQueue, 'revised queue')).toHaveLength(
      initialQueue.length - 1,
    );
    expect(
      body(
        await doctorAgent
          .post(confirmPath(fixture, scoreResultId))
          .send({
            confirm: true,
            reviewNote: 'premature final confirmation',
            expectedUpdatedAt: currentUpdatedAt,
          })
          .expect(409),
      ).code,
    ).toBe('SCORE_RESULT_NOT_READY_FOR_CONFIRMATION');

    while (
      arrayValue(currentResult.itemScores, 'current items').some(
        (item) => isRecord(item) && item.scoreStatus === 'needs_review',
      )
    ) {
      const queue = arrayValue(
        body(await doctorAgent.get(latestPath(fixture)).expect(200))
          .reviewQueue,
        'latest queue',
      );
      const target = record(queue[0], 'next review target');
      const targetId = stringValue(target.itemResponseId, 'next item id');
      const targetScore = record(
        arrayValue(currentResult.itemScores, 'current score items').find(
          (item) => isRecord(item) && item.itemResponseId === targetId,
        ),
        'next score item',
      );
      const response = body(
        await doctorAgent
          .patch(reviewPath(fixture, scoreResultId, targetId))
          .send({
            scoreValue: numberValue(targetScore.minScore, 'next min score'),
            reviewNote: 'manual queue completion review',
            expectedUpdatedAt: currentUpdatedAt,
          })
          .expect(200),
      );
      currentResult = record(response.scoreResult, 'current result');
      currentUpdatedAt = stringValue(
        currentResult.updatedAt,
        'current updatedAt',
      );
    }

    expect(currentResult.status).toBe('computed');
    expect(currentResult.qualityStatus).toBe('unchecked');
    expect(currentResult.isFinal).toBe(false);
    expect(currentResult.scoringSource).toBe('mixed');
    expect(
      record(currentResult.totalScore, 'final total').scorePercent,
    ).not.toBeNull();
    expect(
      arrayValue(
        body(await doctorAgent.get(latestPath(fixture)).expect(200))
          .reviewQueue,
        'empty queue',
      ),
    ).toHaveLength(0);

    expect(
      body(
        await doctorAgent
          .post(confirmPath(fixture, scoreResultId))
          .send({
            confirm: true,
            reviewNote: 'stale final confirmation',
            expectedUpdatedAt: initialUpdatedAt,
          })
          .expect(409),
      ).code,
    ).toBe('SCORE_RESULT_CONFIRMATION_CONFLICT');
    expect(
      body(
        await doctorAgent
          .post(confirmPath(fixture, scoreResultId))
          .send({
            reviewNote: 'missing confirm test',
            expectedUpdatedAt: currentUpdatedAt,
          })
          .expect(400),
      ).code,
    ).toBe('SCORE_RESULT_CONFIRMATION_REQUIRED');
    await doctorAgent
      .post(confirmPath(fixture, scoreResultId))
      .send({ confirm: true, expectedUpdatedAt: currentUpdatedAt })
      .expect(400);
    await doctorAgent
      .post(confirmPath(fixture, scoreResultId))
      .send({
        confirm: true,
        reviewNote: 'final score confirmation',
        expectedUpdatedAt: currentUpdatedAt,
        force: true,
      })
      .expect(400);

    const confirmedResponse = body(
      await doctorAgent
        .post(confirmPath(fixture, scoreResultId))
        .send({
          confirm: true,
          reviewNote: 'final score confirmation',
          expectedUpdatedAt: currentUpdatedAt,
        })
        .expect(200),
    );
    const confirmed = record(confirmedResponse.scoreResult, 'confirmed result');
    const receipt = record(
      confirmedResponse.confirmationReceipt,
      'confirmation receipt',
    );
    expect(confirmed).toEqual(
      expect.objectContaining({
        status: 'confirmed',
        qualityStatus: 'passed',
        isFinal: true,
      }),
    );
    expect(receipt.alreadyConfirmed).toBe(false);
    const confirmationId = stringValue(
      receipt.confirmationId,
      'confirmation id',
    );
    const confirmedAt = stringValue(receipt.confirmedAt, 'confirmed at');
    const confirmedUpdatedAt = stringValue(
      confirmed.updatedAt,
      'confirmed updatedAt',
    );
    expect(record(receipt.confirmedBy, 'confirmed by').operatorName).toBe(
      'A18 Doctor Test Operator',
    );
    expect(receipt.reviewNote).toBe('final score confirmation');
    const forbiddenKeys = collectKeys(confirmedResponse);
    for (const forbidden of [
      'rawResponse',
      'expectedValue',
      'scoringRule',
      'metadata',
      'previousScoreValue',
      'events',
    ]) {
      expect(forbiddenKeys.has(forbidden)).toBe(false);
    }

    const repeated = body(
      await doctorAgent
        .post(confirmPath(fixture, scoreResultId))
        .send({
          confirm: true,
          reviewNote: 'ignored repeated confirmation',
          expectedUpdatedAt: confirmedUpdatedAt,
        })
        .expect(200),
    );
    const repeatedReceipt = record(
      repeated.confirmationReceipt,
      'repeated confirmation receipt',
    );
    expect(repeatedReceipt).toEqual(
      expect.objectContaining({
        confirmationId,
        confirmedAt,
        reviewNote: 'final score confirmation',
        alreadyConfirmed: true,
      }),
    );
    expect(
      body(
        await doctorAgent
          .patch(reviewPath(fixture, scoreResultId, firstItemId))
          .send({
            scoreValue: minScore,
            reviewNote: 'post-confirm review rejection',
            expectedUpdatedAt: confirmedUpdatedAt,
          })
          .expect(409),
      ).code,
    ).toBe('SCORE_RESULT_NOT_REVIEWABLE');
    expect(
      record(
        body(await doctorAgent.get(latestPath(fixture)).expect(200))
          .scoreResult,
        'latest confirmed result',
      ).status,
    ).toBe('confirmed');
    expect(
      body(
        await doctorAgent
          .post(computePath(fixture))
          .send({ confirm: true })
          .expect(200),
      ).alreadyComputed,
    ).toBe(true);

    const stored = await scoreModel.findById(scoreResultId).lean().exec();
    const metadata = record(stored?.metadata, 'stored score metadata');
    const manualAudit = record(metadata.a18ManualReview, 'manual audit');
    expect(arrayValue(manualAudit.events, 'manual events').length).toBe(
      initialQueue.length + 1,
    );
    expect(record(metadata.a18Confirmation, 'confirmation audit')).toEqual(
      expect.objectContaining({ confirmationId }),
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
      await itemModel.countDocuments({
        scaleInstanceId: fixture.scaleInstanceId,
        'score.scoreStatus': { $ne: 'not_scored' },
      }),
    ).toBe(0);
    expect(
      await connection.collection('cognitive_domain_results').countDocuments({
        scaleInstanceId: new Types.ObjectId(fixture.scaleInstanceId),
      }),
    ).toBe(0);
    expect(
      await connection.collection('clinical_reports').countDocuments({
        scaleInstanceId: new Types.ObjectId(fixture.scaleInstanceId),
      }),
    ).toBe(0);
  });
});
