import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Query, Types } from 'mongoose';
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
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const DOCTOR_ACCOUNT = 'doctor-a16-test';
const NURSE_ACCOUNT = 'nurse-a16-test';
const SYSTEM_ACCOUNT = 'system-a16-test';
const PASSWORD = 'A16-Test-Password!';
const SUBJECT_PREFIX = 'SUBJ-A16-TEST-';
const VISIT_PREFIX = 'VISIT-A16-TEST-';
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
  if (!isRecord(response.body)) {
    throw new Error('Expected object response body');
  }
  return response.body;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${label} to be a string`);
  }
  return value;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array`);
  }
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

function expectNoSubmissionBarrierFields(value: unknown): void {
  const keys = collectKeys(value);
  for (const forbidden of [
    'submissionWriteBarrier',
    'barrierId',
    'itemResponseIds',
    'fencedAt',
    'releaseStartedAt',
    'startedBy',
    '__v',
  ]) {
    expect(keys).not.toContain(forbidden);
  }
}

type QueryLatch = {
  reached: Promise<void>;
  release: () => void;
  restore: () => void;
};

type QueryExecutor = (this: Query<unknown, unknown>) => Promise<unknown>;

function latchNextQuery(
  label: string,
  predicate: (query: Query<unknown, unknown>) => boolean,
): QueryLatch {
  let resolveReached: (() => void) | undefined;
  let resolveRelease: (() => void) | undefined;
  let armed = true;
  const reached = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${label}`)),
      5000,
    );
    resolveReached = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  const released = new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 10000);
    resolveRelease = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  // Mongoose exposes the overloaded Query prototype method as an unbound member.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalExec = Query.prototype.exec as QueryExecutor;
  const spy = jest.spyOn(Query.prototype, 'exec').mockImplementation(function (
    this: Query<unknown, unknown>,
  ) {
    if (armed && predicate(this)) {
      armed = false;
      resolveReached?.();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return released.then(() => originalExec.call(this));
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return originalExec.call(this);
  });

  return {
    reached,
    release: () => resolveRelease?.(),
    restore: () => spy.mockRestore(),
  };
}

function queryCreatesParentBarrier(query: Query<unknown, unknown>): boolean {
  if (query.model.modelName !== ScaleInstance.name) {
    return false;
  }
  const update = query.getUpdate();
  if (!isRecord(update) || !isRecord(update.$set)) {
    return false;
  }
  const barrier = update.$set.submissionWriteBarrier;
  return isRecord(barrier) && barrier.state === 'fencing';
}

describe('scale instance submission APIs (e2e)', () => {
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
  let definitionModel: Model<ScaleDefinitionDocument>;
  let versionModel: Model<ScaleVersionDocument>;
  let doctorAgent: ReturnType<typeof request.agent>;
  let nurseAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let server: SupertestApp;
  let modelsReady = false;

  function instancePath(fixture: Fixture): string {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${fixture.scaleInstanceId}`;
  }

  function readinessPath(fixture: Fixture): string {
    return `${instancePath(fixture)}/submission-readiness`;
  }

  function submitPath(fixture: Fixture): string {
    return `${instancePath(fixture)}/submit`;
  }

  async function cleanup(): Promise<void> {
    const users = await userModel
      .find({
        accountName: {
          $in: [DOCTOR_ACCOUNT, NURSE_ACCOUNT, SYSTEM_ACCOUNT],
        },
      })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }

    const visits = await visitModel
      .find({ visitCode: /^VISIT-A16-TEST-/ })
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
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A16-TEST-/ }).exec();
    await userModel
      .deleteMany({
        accountName: {
          $in: [DOCTOR_ACCOUNT, NURSE_ACCOUNT, SYSTEM_ACCOUNT],
        },
      })
      .exec();

    const definitions = await definitionModel
      .find({ code: 'mmse' })
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
      .send({ scaleCode: 'mmse' })
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

  async function completeMmseThroughExistingApis(fixture: Fixture) {
    const detailResponse = await doctorAgent
      .get(instancePath(fixture))
      .expect(200);
    const itemResponses = arrayValue(
      body(detailResponse).itemResponses,
      'item responses',
    );
    let drawingItemId = '';
    let drawingDraftRevision = 0;
    const mediaItemIds: string[] = [];

    for (const value of itemResponses) {
      const item = record(value, 'item response');
      const itemId = stringValue(item.id, 'item response id');
      const itemCode = stringValue(item.itemCode, 'item code');
      const config = record(item.config, 'item config');
      const initialRevision = item.draftRevision;
      if (
        typeof initialRevision !== 'number' ||
        !Number.isSafeInteger(initialRevision) ||
        initialRevision < 0
      ) {
        throw new Error('Expected a safe item draft revision');
      }
      const stepResponses = arrayValue(
        item.stepResponses,
        'step responses',
      ).map((stepValue) => {
        const step = record(stepValue, 'step response');
        return {
          stepCode: stringValue(step.stepCode, 'step code'),
          actualValue: 0,
        };
      });
      const itemPath = `${instancePath(fixture)}/item-responses/${itemId}`;
      const structuredManualFields = Array.isArray(
        config.structuredManualFields,
      )
        ? config.structuredManualFields.map((field) =>
            record(field, 'structured manual field'),
          )
        : [];
      const structuredResponse =
        structuredManualFields.length > 0
          ? {
              subItems: Object.fromEntries(
                structuredManualFields.map((field) => [
                  stringValue(field.code, 'structured manual field code'),
                  {
                    responseText: 'A16 de-identified response',
                    isCorrect: false,
                  },
                ]),
              ),
            }
          : undefined;
      let savedRevision = initialRevision;
      if (stepResponses.length > 0) {
        const answerResponse = await doctorAgent
          .patch(itemPath)
          .send({
            expectedRevision: savedRevision,
            rawResponse: false,
            ...(structuredResponse ? { structuredResponse } : {}),
            operatorNote: 'A16 de-identified operator note',
            markAsAnswered: true,
          })
          .expect(200);
        const answeredItem = record(
          body(answerResponse).itemResponse,
          'answered item response',
        );
        const answeredRevision = answeredItem.draftRevision;
        if (
          typeof answeredRevision !== 'number' ||
          !Number.isSafeInteger(answeredRevision) ||
          answeredRevision < 0
        ) {
          throw new Error('Expected a safe answered item draft revision');
        }
        savedRevision = answeredRevision;
        const stepReadiness = body(
          await doctorAgent.get(readinessPath(fixture)).expect(200),
        );
        expect(
          arrayValue(stepReadiness.blockingIssues, 'blocking issues').some(
            (issue) =>
              isRecord(issue) && issue.code === 'ITEM_REQUIRED_STEP_MISSING',
          ),
        ).toBe(true);
        const stepResponse = await doctorAgent
          .patch(itemPath)
          .send({ expectedRevision: savedRevision, stepResponses })
          .expect(200);
        const steppedItem = record(
          body(stepResponse).itemResponse,
          'stepped item response',
        );
        const steppedRevision = steppedItem.draftRevision;
        if (
          typeof steppedRevision !== 'number' ||
          !Number.isSafeInteger(steppedRevision) ||
          steppedRevision < 0
        ) {
          throw new Error('Expected a safe stepped item draft revision');
        }
        savedRevision = steppedRevision;
      } else {
        const answerResponse = await doctorAgent
          .patch(itemPath)
          .send({
            expectedRevision: savedRevision,
            rawResponse: false,
            ...(structuredResponse ? { structuredResponse } : {}),
            operatorNote: 'A16 de-identified operator note',
            markAsAnswered: true,
          })
          .expect(200);
        const answeredItem = record(
          body(answerResponse).itemResponse,
          'answered item response',
        );
        const answeredRevision = answeredItem.draftRevision;
        if (
          typeof answeredRevision !== 'number' ||
          !Number.isSafeInteger(answeredRevision) ||
          answeredRevision < 0
        ) {
          throw new Error('Expected a safe answered item draft revision');
        }
        savedRevision = answeredRevision;
      }
      if (itemCode === 'mmse.visuospatial.copy_drawing') {
        drawingItemId = itemId;
        drawingDraftRevision = savedRevision;
      }
      if (config.supportsPhotoUpload === true) {
        mediaItemIds.push(itemId);
      }
    }

    if (!drawingItemId) {
      throw new Error('Expected MMSE drawing item');
    }
    const mediaReadiness = body(
      await doctorAgent.get(readinessPath(fixture)).expect(200),
    );
    const mediaIssue = arrayValue(
      mediaReadiness.blockingIssues,
      'blocking issues',
    ).find(
      (issue) =>
        isRecord(issue) && issue.code === 'ITEM_REQUIRED_MEDIA_MISSING',
    );
    expect(mediaIssue).toBeDefined();
    if (isRecord(mediaIssue)) {
      expect(mediaIssue.requiredEvidenceMode).toBe('one_of');
      expect(mediaIssue.requiredEvidenceTypes).toEqual([
        'photo',
        'handwriting',
      ]);
    }
    let drawingMediaEvidenceId = '';
    for (const itemId of mediaItemIds) {
      const mediaResponse = await doctorAgent
        .post(
          `${instancePath(fixture)}/item-responses/${itemId}/media-evidences`,
        )
        .field('evidenceType', 'photo')
        .field('captureMode', 'photo_upload')
        .field('imageWidth', '1')
        .field('imageHeight', '1')
        .field('isColor', 'false')
        .attach('file', VALID_PNG, {
          filename: 'a16-test.png',
          contentType: 'image/png',
        })
        .expect(201);
      if (itemId === drawingItemId) {
        const mediaEvidence = record(
          body(mediaResponse).mediaEvidence,
          'media evidence',
        );
        drawingMediaEvidenceId = stringValue(
          mediaEvidence.id,
          'media evidence id',
        );
      }
    }
    if (!drawingMediaEvidenceId) {
      throw new Error('Expected drawing media evidence');
    }
    return {
      drawingItemId,
      drawingDraftRevision,
      mediaEvidenceId: drawingMediaEvidenceId,
    };
  }

  async function readStableItemScope(fixture: Fixture): Promise<string[]> {
    const items = await itemModel
      .find({ scaleInstanceId: fixture.scaleInstanceId })
      .sort({ _id: 1 })
      .select({ _id: 1 })
      .lean()
      .exec();
    return items.map((item) => item._id.toString());
  }

  function parentBarrier(input: {
    barrierId: string;
    state: 'fencing' | 'fenced' | 'releasing' | 'completed';
    startedAt: Date;
    startedBy: string;
    startedByName: string;
    startedByRole: 'doctor' | 'nurse';
    itemResponseIds: string[];
  }): Record<string, unknown> {
    return {
      version: 1,
      barrierId: input.barrierId,
      state: input.state,
      startedAt: input.startedAt,
      fencedAt:
        input.state === 'fencing'
          ? null
          : new Date(input.startedAt.getTime() + 1000),
      releaseStartedAt:
        input.state === 'releasing'
          ? new Date(input.startedAt.getTime() + 2000)
          : null,
      completedAt:
        input.state === 'completed'
          ? new Date(input.startedAt.getTime() + 3000)
          : null,
      startedBy: new Types.ObjectId(input.startedBy),
      startedByName: input.startedByName,
      startedByRole: input.startedByRole,
      itemResponseIds: input.itemResponseIds.map(
        (itemResponseId) => new Types.ObjectId(itemResponseId),
      ),
      expectedItemCount: input.itemResponseIds.length,
    };
  }

  function childBarrier(
    barrierId: string,
    startedAt: Date,
  ): Record<string, unknown> {
    return { version: 1, barrierId, startedAt };
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
    definitionModel = app.get(getModelToken(ScaleDefinition.name));
    versionModel = app.get(getModelToken(ScaleVersion.name));
    modelsReady = true;
    await cleanup();

    const passwordHash = await authService.hashPassword(PASSWORD);
    await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A16 Doctor Test Operator',
      staffCode: 'STAFF-A16-TEST',
      email: 'doctor-a16-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A16 System Test Operator',
      staffCode: 'SYSTEM-A16-TEST',
      email: 'system-a16-test@example.test',
      passwordHash,
      roles: ['system'],
      permissions: [],
      userType: 'system',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: NURSE_ACCOUNT,
      displayName: 'A16 Nurse Test Operator',
      staffCode: 'STAFF-A16-NURSE',
      email: 'nurse-a16-test@example.test',
      passwordHash,
      roles: ['nurse'],
      permissions: [],
      userType: 'nurse',
      status: 'active',
      metadata: null,
    });

    server = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
    doctorAgent = request.agent(server);
    nurseAgent = request.agent(server);
    systemAgent = request.agent(server);
    await doctorAgent
      .post('/auth/login')
      .send({ accountName: DOCTOR_ACCOUNT, password: PASSWORD })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({ accountName: SYSTEM_ACCOUNT, password: PASSWORD })
      .expect(201);
    await nurseAgent
      .post('/auth/login')
      .send({ accountName: NURSE_ACCOUNT, password: PASSWORD })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      if (modelsReady) {
        await cleanup();
      }
      await app.close();
    }
  });

  it('enforces authentication, roles, confirmation and incomplete readiness', async () => {
    const placeholder = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
    };
    await request(server).get(readinessPath(placeholder)).expect(401);
    await systemAgent.get(readinessPath(placeholder)).expect(403);

    const fixture = await createFixture('INCOMPLETE');
    const readinessResponse = await doctorAgent
      .get(readinessPath(fixture))
      .expect(200);
    const readiness = body(readinessResponse);
    expectNoSubmissionBarrierFields(readiness);
    expect(readiness.ready).toBe(false);
    expect(readiness.canSubmitNow).toBe(false);
    expect(
      arrayValue(readiness.blockingIssues, 'blocking issues').some(
        (issue) => isRecord(issue) && issue.code === 'ITEM_NOT_COMPLETED',
      ),
    ).toBe(true);
    const keys = collectKeys(readiness);
    for (const forbidden of [
      'rawResponse',
      'structuredResponse',
      'responseText',
      'expectedValue',
      'scoringRule',
      'score',
      'isCorrect',
      'scoreValue',
      'mediaEvidenceId',
      'metadata',
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }

    const detail = body(
      await doctorAgent.get(instancePath(fixture)).expect(200),
    );
    const firstItem = record(
      arrayValue(detail.itemResponses, 'item responses')[0],
      'first item',
    );
    const firstItemPath = `${instancePath(fixture)}/item-responses/${stringValue(
      firstItem.id,
      'first item id',
    )}`;
    const firstItemRevision = firstItem.draftRevision;
    if (
      typeof firstItemRevision !== 'number' ||
      !Number.isSafeInteger(firstItemRevision) ||
      firstItemRevision < 0
    ) {
      throw new Error('Expected a safe first item draft revision');
    }
    const missingReasonRequired = await doctorAgent
      .patch(firstItemPath)
      .send({
        expectedRevision: firstItemRevision,
        isMissing: true,
        markAsAnswered: true,
      })
      .expect(400);
    expect(body(missingReasonRequired).code).toBe(
      'ITEM_RESPONSE_MISSING_REASON_REQUIRED',
    );
    await doctorAgent
      .patch(firstItemPath)
      .send({
        expectedRevision: firstItemRevision,
        isMissing: true,
        missingReason: 'A16 de-identified missing reason',
        markAsAnswered: true,
      })
      .expect(200);

    const missing = await doctorAgent
      .post(submitPath(fixture))
      .send({})
      .expect(400);
    expect(body(missing).code).toBe(
      'SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED',
    );
    const rejected = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: false })
      .expect(400);
    expect(body(rejected).code).toBe(
      'SCALE_INSTANCE_SUBMISSION_CONFIRMATION_REQUIRED',
    );
    const incomplete = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true })
      .expect(409);
    expect(body(incomplete).code).toBe('SCALE_INSTANCE_NOT_READY');
    await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true, force: true })
      .expect(400);

    const other = await createFixture('OWNERSHIP');
    const crossPath = `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${other.scaleInstanceId}/submission-readiness`;
    expect(body(await doctorAgent.get(crossPath).expect(404)).code).toBe(
      'SCALE_INSTANCE_NOT_FOUND',
    );
  });

  it('blocks a legacy free-text-only answered structured manual item', async () => {
    const fixture = await createFixture('STRUCTURED-INCOMPLETE');
    const item = await itemModel
      .findOne({
        scaleInstanceId: fixture.scaleInstanceId,
        itemCode: 'mmse.orientation.time',
      })
      .exec();
    if (!item) {
      throw new Error('Expected MMSE time orientation item response');
    }

    await itemModel
      .updateOne(
        { _id: item._id },
        {
          $set: {
            status: 'answered',
            rawResponse: null,
            responseText: 'Legacy free-text-only answer',
            structuredResponse: null,
          },
        },
      )
      .exec();

    const readiness = body(
      await doctorAgent.get(readinessPath(fixture)).expect(200),
    );
    expect(
      arrayValue(readiness.blockingIssues, 'blocking issues').some(
        (issue) =>
          isRecord(issue) &&
          issue.itemCode === 'mmse.orientation.time' &&
          issue.code === 'ITEM_STRUCTURED_SUBITEMS_INCOMPLETE',
      ),
    ).toBe(true);
    expect(readiness.ready).toBe(false);
  });

  it('completes through A14/A15, freezes edits and repeats idempotently', async () => {
    const fixture = await createFixture('SUCCESS');
    const { drawingItemId, drawingDraftRevision, mediaEvidenceId } =
      await completeMmseThroughExistingApis(fixture);
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

    const readyResponse = await doctorAgent
      .get(readinessPath(fixture))
      .expect(200);
    expect(body(readyResponse)).toEqual(
      expect.objectContaining({ ready: true, canSubmitNow: true }),
    );

    const firstResponse = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true })
      .expect(200);
    const first = body(firstResponse);
    expectNoSubmissionBarrierFields(first);
    const firstSubmission = record(first.submission, 'submission');
    expect(firstSubmission.alreadySubmitted).toBe(false);
    const stored = await instanceModel.findById(fixture.scaleInstanceId).exec();
    expect(stored?.status).toBe('completed');
    expect(stored?.completedAt).toBeInstanceOf(Date);
    expect(stored?.lockedAt).toBeNull();
    const progress = record(stored?.progress, 'stored progress');
    expect(progress.totalItemCount).toBe(11);
    expect(progress.answeredItemCount).toBe(11);
    expect(progress.source).toBe('submission');
    const metadata = record(stored?.metadata, 'stored metadata');
    expect(metadata.initializedFromSeed).toBe(true);
    expect(isRecord(metadata.seedSummary)).toBe(true);
    const submission = record(metadata.submission, 'stored submission');
    expect(submission.submissionId).toBe(firstSubmission.submissionId);
    expect(submission.submittedByName).toBe('A16 Doctor Test Operator');
    expect(submission.submittedByRole).toBe('doctor');
    const summary = record(
      submission.readinessSummary,
      'stored readiness summary',
    );
    expect(summary.expectedItemCount).toBe(11);
    expect(summary.actualItemCount).toBe(11);
    expect(summary.completedItemCount).toBe(11);
    expect(summary.blockingIssueCount).toBe(0);
    expect(typeof summary.warningCount).toBe('number');
    expect(
      (await visitModel.findById(fixture.visitId).lean().exec())?.status,
    ).toBe(beforeVisit?.status);
    expect(stored?.operatorSnapshot?.operatorId).toEqual(
      beforeInstance?.operatorSnapshot?.operatorId,
    );
    expect(stored?.operatorSnapshot?.operatorName).toBe(
      beforeInstance?.operatorSnapshot?.operatorName,
    );
    expect(
      (
        await itemModel
          .find({ scaleInstanceId: fixture.scaleInstanceId })
          .sort({ itemOrder: 1 })
          .lean()
          .exec()
      ).map((item) => item.status),
    ).toEqual(beforeItems.map((item) => item.status));

    await doctorAgent
      .patch(`${instancePath(fixture)}/item-responses/${drawingItemId}`)
      .send({ expectedRevision: drawingDraftRevision, rawResponse: true })
      .expect(409);
    await doctorAgent
      .post(
        `${instancePath(fixture)}/item-responses/${drawingItemId}/media-evidences`,
      )
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .attach('file', VALID_PNG, {
        filename: 'blocked.png',
        contentType: 'image/png',
      })
      .expect(409);
    await doctorAgent
      .post(
        `${instancePath(fixture)}/item-responses/${drawingItemId}/media-evidences/${mediaEvidenceId}/void`,
      )
      .send({ reason: 'must remain frozen' })
      .expect(409);
    await doctorAgent.get(instancePath(fixture)).expect(200);
    await doctorAgent
      .get(
        `${instancePath(fixture)}/item-responses/${drawingItemId}/media-evidences`,
      )
      .expect(200);
    await doctorAgent
      .get(
        `${instancePath(fixture)}/item-responses/${drawingItemId}/media-evidences/${mediaEvidenceId}/access-url`,
      )
      .expect(200);

    const secondResponse = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true })
      .expect(200);
    const secondSubmission = record(
      body(secondResponse).submission,
      'submission',
    );
    expect(secondSubmission.alreadySubmitted).toBe(true);
    expect(secondSubmission.submissionId).toBe(firstSubmission.submissionId);
    expectNoSubmissionBarrierFields(body(secondResponse));
    const storedAgain = await instanceModel
      .findById(fixture.scaleInstanceId)
      .exec();
    expect(storedAgain?.completedAt).toEqual(stored?.completedAt);
    expect(storedAgain?.durationMs).toBe(stored?.durationMs);

    for (const collectionName of [
      'score_results',
      'cognitive_domain_results',
      'clinical_reports',
    ]) {
      expect(
        await connection.collection(collectionName).countDocuments({
          scaleInstanceId: stored?._id,
        }),
      ).toBe(0);
    }
  });

  it('Stage 6: makes two real submit sessions converge on one barrier and first successful actor', async () => {
    const fixture = await createFixture('A30-DUAL-SUBMIT');
    await completeMmseThroughExistingApis(fixture);
    const nurse = await userModel
      .findOne({ accountName: NURSE_ACCOUNT })
      .exec();
    if (!nurse) {
      throw new Error('Expected A30 nurse user');
    }
    const parentLatch = latchNextQuery(
      'Stage 6 parent barrier creation',
      queryCreatesParentBarrier,
    );

    try {
      const doctorPromise = doctorAgent
        .post(submitPath(fixture))
        .send({ confirm: true })
        .then((response) => response);
      await parentLatch.reached;
      const nurseResponse = await nurseAgent
        .post(submitPath(fixture))
        .send({ confirm: true })
        .expect(200);
      parentLatch.release();
      const doctorResponse = await doctorPromise;
      expect(doctorResponse.status).toBe(200);

      const doctorSubmission = record(
        body(doctorResponse).submission,
        'doctor submission',
      );
      const nurseSubmission = record(
        body(nurseResponse).submission,
        'nurse submission',
      );
      expect(doctorSubmission.submissionId).toBe(nurseSubmission.submissionId);
      expect(nurseSubmission.alreadySubmitted).toBe(false);
      expect(doctorSubmission.alreadySubmitted).toBe(true);
      const stored = await instanceModel
        .findById(fixture.scaleInstanceId)
        .lean()
        .exec();
      const token = stored?.submissionWriteBarrier?.barrierId;
      expect(stored?.status).toBe('completed');
      expect(stored?.submissionWriteBarrier?.state).toBe('completed');
      expect(token).toBe(nurseSubmission.submissionId);
      expect(stored?.submissionWriteBarrier?.startedBy).toEqual(nurse._id);
      const storedSubmission = isRecord(stored?.metadata)
        ? stored.metadata.submission
        : null;
      expect(storedSubmission).toEqual(
        expect.objectContaining({
          submissionId: token,
          submittedBy: nurse._id,
          submittedByName: 'A16 Nurse Test Operator',
          submittedByRole: 'nurse',
        }),
      );
      const children = await itemModel
        .find({ scaleInstanceId: fixture.scaleInstanceId })
        .lean()
        .exec();
      expect(children).toHaveLength(11);
      expect(
        children.every(
          (itemResponse) =>
            itemResponse.submissionWriteBarrier?.barrierId === token,
        ),
      ).toBe(true);
      expectNoSubmissionBarrierFields(body(doctorResponse));
      expectNoSubmissionBarrierFields(body(nurseResponse));
    } finally {
      parentLatch.release();
      parentLatch.restore();
    }
  });

  it('Stage 7: resumes partial fencing with the original token, scope, and actor', async () => {
    const fixture = await createFixture('A30-PARTIAL-FENCING');
    await completeMmseThroughExistingApis(fixture);
    const nurse = await userModel
      .findOne({ accountName: NURSE_ACCOUNT })
      .exec();
    if (!nurse) {
      throw new Error('Expected A30 nurse user');
    }
    const scope = await readStableItemScope(fixture);
    const barrierId = '18be42e3-4466-4593-919a-5813b5100112';
    const startedAt = new Date('2026-08-03T02:00:00.000Z');
    const seededParent = parentBarrier({
      barrierId,
      state: 'fencing',
      startedAt,
      startedBy: nurse._id.toString(),
      startedByName: 'A16 Nurse Test Operator',
      startedByRole: 'nurse',
      itemResponseIds: scope,
    });
    await instanceModel
      .updateOne(
        { _id: fixture.scaleInstanceId },
        { $set: { submissionWriteBarrier: seededParent } },
      )
      .exec();
    await itemModel
      .updateMany(
        { _id: { $in: scope.slice(0, 4) } },
        {
          $set: {
            submissionWriteBarrier: childBarrier(barrierId, startedAt),
          },
        },
      )
      .exec();

    const response = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true })
      .expect(200);
    const submission = record(body(response).submission, 'submission');
    expect(submission.submissionId).toBe(barrierId);
    expect(record(submission.submittedBy, 'submitted by')).toEqual(
      expect.objectContaining({
        operatorId: nurse._id.toString(),
        operatorName: 'A16 Nurse Test Operator',
        operatorRole: 'nurse',
      }),
    );
    const stored = await instanceModel
      .findById(fixture.scaleInstanceId)
      .lean()
      .exec();
    expect(stored?.submissionWriteBarrier?.state).toBe('completed');
    expect(stored?.submissionWriteBarrier?.barrierId).toBe(barrierId);
    expect(
      (
        await itemModel
          .find({ scaleInstanceId: fixture.scaleInstanceId })
          .lean()
          .exec()
      ).every(
        (itemResponse) =>
          itemResponse.submissionWriteBarrier?.barrierId === barrierId,
      ),
    ).toBe(true);
  });

  it('Stage 8: finishes partial releasing, preserves foreign ownership, and submits a fresh token', async () => {
    const fixture = await createFixture('A30-PARTIAL-RELEASING');
    await completeMmseThroughExistingApis(fixture);
    const foreignFixture = await createFixture('A30-FOREIGN-TOKEN');
    const doctor = await userModel
      .findOne({ accountName: DOCTOR_ACCOUNT })
      .exec();
    if (!doctor) {
      throw new Error('Expected A30 doctor user');
    }
    const scope = await readStableItemScope(fixture);
    const oldBarrierId = '09ce3609-051d-428d-859c-dd255d9a69c0';
    const foreignBarrierId = '89cc6790-a2ec-4964-aec6-c8a7e3ce0450';
    const startedAt = new Date('2026-08-03T02:10:00.000Z');
    await instanceModel
      .updateOne(
        { _id: fixture.scaleInstanceId },
        {
          $set: {
            submissionWriteBarrier: parentBarrier({
              barrierId: oldBarrierId,
              state: 'releasing',
              startedAt,
              startedBy: doctor._id.toString(),
              startedByName: 'A16 Doctor Test Operator',
              startedByRole: 'doctor',
              itemResponseIds: scope,
            }),
          },
        },
      )
      .exec();
    await itemModel
      .updateMany(
        { _id: { $in: scope.slice(0, 3) } },
        {
          $set: {
            submissionWriteBarrier: childBarrier(oldBarrierId, startedAt),
          },
        },
      )
      .exec();
    const foreignItem = await itemModel.findOne({
      scaleInstanceId: foreignFixture.scaleInstanceId,
    });
    if (!foreignItem) {
      throw new Error('Expected foreign token item');
    }
    await itemModel
      .updateOne(
        { _id: foreignItem._id },
        {
          $set: {
            submissionWriteBarrier: childBarrier(foreignBarrierId, startedAt),
          },
        },
      )
      .exec();

    const response = await doctorAgent
      .post(submitPath(fixture))
      .send({ confirm: true })
      .expect(200);
    const freshBarrierId = stringValue(
      record(body(response).submission, 'submission').submissionId,
      'fresh submission id',
    );
    expect(freshBarrierId).not.toBe(oldBarrierId);
    const primaryItems = await itemModel
      .find({ scaleInstanceId: fixture.scaleInstanceId })
      .lean()
      .exec();
    expect(
      primaryItems.every(
        (itemResponse) =>
          itemResponse.submissionWriteBarrier?.barrierId === freshBarrierId,
      ),
    ).toBe(true);
    expect(
      primaryItems.some(
        (itemResponse) =>
          itemResponse.submissionWriteBarrier?.barrierId === oldBarrierId,
      ),
    ).toBe(false);
    expect(
      (await itemModel.findById(foreignItem._id).lean().exec())
        ?.submissionWriteBarrier?.barrierId,
    ).toBe(foreignBarrierId);
  });

  it('Stage 9: keeps legacy barriers open and fails invalid parent or child barriers closed', async () => {
    const legacy = await createFixture('A30-LEGACY');
    await instanceModel.collection.updateOne(
      { _id: new Types.ObjectId(legacy.scaleInstanceId) },
      { $unset: { submissionWriteBarrier: '' } },
    );
    await itemModel.collection.updateMany(
      { scaleInstanceId: new Types.ObjectId(legacy.scaleInstanceId) },
      { $unset: { submissionWriteBarrier: '' } },
    );
    const legacyGet = await doctorAgent.get(instancePath(legacy)).expect(200);
    expectNoSubmissionBarrierFields(body(legacyGet));
    expect(
      Object.prototype.hasOwnProperty.call(
        await instanceModel.collection.findOne({
          _id: new Types.ObjectId(legacy.scaleInstanceId),
        }),
        'submissionWriteBarrier',
      ),
    ).toBe(false);
    await completeMmseThroughExistingApis(legacy);
    await doctorAgent
      .post(submitPath(legacy))
      .send({ confirm: true })
      .expect(200);

    const invalid = await createFixture('A30-INVALID');
    const { drawingItemId, drawingDraftRevision, mediaEvidenceId } =
      await completeMmseThroughExistingApis(invalid);
    await instanceModel.collection.updateOne(
      { _id: new Types.ObjectId(invalid.scaleInstanceId) },
      { $set: { submissionWriteBarrier: { version: 999 } } },
    );
    const beforeInvalidItem = await itemModel
      .findById(drawingItemId)
      .lean()
      .exec();
    expect(
      body(
        await doctorAgent
          .patch(`${instancePath(invalid)}/item-responses/${drawingItemId}`)
          .send({
            expectedRevision: drawingDraftRevision,
            responseText: 'must remain blocked',
          })
          .expect(409),
      ).code,
    ).toBe('SCALE_INSTANCE_NOT_EDITABLE');
    expect(
      body(
        await doctorAgent
          .post(
            `${instancePath(invalid)}/item-responses/${drawingItemId}/media-evidences`,
          )
          .field('evidenceType', 'handwriting')
          .field('captureMode', 'tablet_handwriting')
          .field('trajectoryFormat', 'strokes')
          .attach('file', VALID_PNG, {
            filename: 'blocked.png',
            contentType: 'image/png',
          })
          .attach('trajectory', Buffer.from('{"strokes":[]}'), {
            filename: 'blocked.json',
            contentType: 'application/json',
          })
          .expect(409),
      ).code,
    ).toBe('SCALE_INSTANCE_NOT_EDITABLE');
    expect(
      body(
        await doctorAgent
          .post(
            `${instancePath(invalid)}/item-responses/${drawingItemId}/media-evidences/${mediaEvidenceId}/void`,
          )
          .send({ reason: 'must remain blocked' })
          .expect(409),
      ).code,
    ).toBe('SCALE_INSTANCE_NOT_EDITABLE');
    expect(
      body(
        await doctorAgent
          .post(submitPath(invalid))
          .send({ confirm: true })
          .expect(500),
      ).code,
    ).toBe('SCALE_INSTANCE_SUBMISSION_FAILED');
    expect(await itemModel.findById(drawingItemId).lean().exec()).toEqual(
      beforeInvalidItem,
    );

    await instanceModel.collection.updateOne(
      { _id: new Types.ObjectId(invalid.scaleInstanceId) },
      { $unset: { submissionWriteBarrier: '' } },
    );
    await itemModel.collection.updateOne(
      { _id: new Types.ObjectId(drawingItemId) },
      { $set: { submissionWriteBarrier: { version: 999 } } },
    );
    expect(
      body(
        await doctorAgent
          .patch(`${instancePath(invalid)}/item-responses/${drawingItemId}`)
          .send({
            expectedRevision: drawingDraftRevision,
            responseText: 'must remain blocked by child',
          })
          .expect(409),
      ).code,
    ).toBe('SCALE_INSTANCE_NOT_EDITABLE');
    expect(
      body(
        await doctorAgent
          .post(
            `${instancePath(invalid)}/item-responses/${drawingItemId}/media-evidences`,
          )
          .field('evidenceType', 'handwriting')
          .field('captureMode', 'tablet_handwriting')
          .field('trajectoryFormat', 'strokes')
          .attach('file', VALID_PNG, {
            filename: 'child-barrier-blocked.png',
            contentType: 'image/png',
          })
          .attach('trajectory', Buffer.from('{"strokes":[]}'), {
            filename: 'child-barrier-blocked.json',
            contentType: 'application/json',
          })
          .expect(409),
      ).code,
    ).toBe('SCALE_INSTANCE_NOT_EDITABLE');
    expect(
      body(
        await doctorAgent
          .post(
            `${instancePath(invalid)}/item-responses/${drawingItemId}/media-evidences/${mediaEvidenceId}/void`,
          )
          .send({ reason: 'must remain blocked by invalid child barrier' })
          .expect(409),
      ).code,
    ).toBe('SCALE_INSTANCE_NOT_EDITABLE');
    expect(
      body(
        await doctorAgent
          .post(submitPath(invalid))
          .send({ confirm: true })
          .expect(500),
      ).code,
    ).toBe('SCALE_INSTANCE_SUBMISSION_FAILED');
  });

  it('enforces first-submission patient, visit and instance state boundaries', async () => {
    const inactive = await createFixture('INACTIVE');
    await completeMmseThroughExistingApis(inactive);
    for (const status of ['inactive', 'archived'] as const) {
      await patientModel.updateOne({ _id: inactive.patientId }, { status });
      expect(
        body(
          await doctorAgent
            .post(submitPath(inactive))
            .send({ confirm: true })
            .expect(409),
        ).code,
      ).toBe('PATIENT_NOT_ACTIVE');
    }

    const closedVisit = await createFixture('VISIT-CLOSED');
    await completeMmseThroughExistingApis(closedVisit);
    for (const status of ['completed', 'locked', 'voided'] as const) {
      await visitModel.updateOne({ _id: closedVisit.visitId }, { status });
      expect(
        body(
          await doctorAgent
            .post(submitPath(closedVisit))
            .send({ confirm: true })
            .expect(409),
        ).code,
      ).toBe('VISIT_NOT_EDITABLE');
    }

    for (const status of ['locked', 'voided'] as const) {
      const blocked = await createFixture(`INSTANCE-${status.toUpperCase()}`);
      await instanceModel.updateOne(
        { _id: blocked.scaleInstanceId },
        { status },
      );
      expect(
        body(
          await doctorAgent
            .post(submitPath(blocked))
            .send({ confirm: true })
            .expect(409),
        ).code,
      ).toBe('SCALE_INSTANCE_NOT_SUBMITTABLE');
    }
  });
});
