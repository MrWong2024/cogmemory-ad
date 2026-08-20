import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Query, Types } from 'mongoose';
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
import { FakeStorageService } from '../src/modules/storage/fake-storage.service';
import { STORAGE_SERVICE } from '../src/modules/storage/storage.constants';

jest.setTimeout(30000);

const DOCTOR_ACCOUNT = 'doctor-a15-test';
const SYSTEM_ACCOUNT = 'system-a15-test';
const TEST_PATIENT_PREFIX = 'SUBJ-A15-TEST-';
const TEST_VISIT_PREFIX = 'VISIT-A15-TEST-';
const TEST_SCALE_CODES = ['moca'];
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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

function readErrorCode(response: Response): string {
  return readString(readResponseBody(response), 'code');
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

function querySetsEvidenceStatus(
  query: Query<unknown, unknown>,
  status: 'attached' | 'pending',
): boolean {
  if (query.model.modelName !== ItemResponse.name) {
    return false;
  }
  const update = query.getUpdate();
  return (
    isRecord(update) &&
    isRecord(update.$set) &&
    update.$set['evidenceRefs.$[evidenceRef].status'] === status
  );
}

function queryIsSubmissionFencing(query: Query<unknown, unknown>): boolean {
  if (query.model.modelName !== ItemResponse.name) {
    return false;
  }
  const update = query.getUpdate();
  if (!isRecord(update) || !isRecord(update.$set)) {
    return false;
  }
  const barrier = update.$set.submissionWriteBarrier;
  return isRecord(barrier) && barrier.version === 1;
}

type StorageTracker = {
  readObjectKeys: () => Set<string>;
  restore: () => void;
};

function trackFakeStorage(storage: FakeStorageService): StorageTracker {
  const uploadSpy = jest.spyOn(storage, 'uploadFile');
  const deleteSpy = jest.spyOn(storage, 'deleteObject');

  return {
    readObjectKeys: () => {
      const objectKeys = new Set<string>();
      const uploadCalls: unknown = uploadSpy.mock.calls;
      if (Array.isArray(uploadCalls)) {
        for (const call of uploadCalls) {
          if (Array.isArray(call) && isRecord(call[0])) {
            const objectKey = call[0].objectKey;
            if (typeof objectKey === 'string') {
              objectKeys.add(objectKey);
            }
          }
        }
      }
      const deleteCalls: unknown = deleteSpy.mock.calls;
      if (Array.isArray(deleteCalls)) {
        for (const call of deleteCalls) {
          if (Array.isArray(call) && typeof call[0] === 'string') {
            objectKeys.delete(call[0]);
          }
        }
      }
      return objectKeys;
    },
    restore: () => {
      uploadSpy.mockRestore();
      deleteSpy.mockRestore();
    },
  };
}

describe('media evidence APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let scaleInstanceModel: Model<ScaleInstanceDocument>;
  let itemResponseModel: Model<ItemResponseDocument>;
  let mediaEvidenceModel: Model<MediaEvidenceDocument>;
  let scaleDefinitionModel: Model<ScaleDefinitionDocument>;
  let scaleVersionModel: Model<ScaleVersionDocument>;
  let storageService: FakeStorageService;
  let doctorAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let httpServer: SupertestApp;
  let modelsReady = false;

  async function cleanupA15Data(): Promise<void> {
    const testUsers = await userModel
      .find({ accountName: { $in: [DOCTOR_ACCOUNT, SYSTEM_ACCOUNT] } })
      .select({ _id: 1 })
      .exec();
    const userIds = testUsers.map((userDocument) => userDocument._id);

    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }

    const visits = await visitModel
      .find({ visitCode: /^VISIT-A15-TEST-/ })
      .select({ _id: 1 })
      .exec();
    const visitIds = visits.map((visit) => visit._id);
    const instances =
      visitIds.length > 0
        ? await scaleInstanceModel
            .find({ assessmentVisitId: { $in: visitIds } })
            .select({ _id: 1 })
            .exec()
        : [];
    const instanceIds = instances.map((instance) => instance._id);

    if (instanceIds.length > 0) {
      await mediaEvidenceModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await itemResponseModel
        .deleteMany({ scaleInstanceId: { $in: instanceIds } })
        .exec();
      await scaleInstanceModel.deleteMany({ _id: { $in: instanceIds } }).exec();
    }

    if (visitIds.length > 0) {
      await visitModel.deleteMany({ _id: { $in: visitIds } }).exec();
    }

    await patientModel.deleteMany({ subjectCode: /^SUBJ-A15-TEST-/ }).exec();
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
      displayName: `A15 De-identified Subject ${suffix}`,
    });
  }

  function createVisit(patientId: string, suffix: string): SupertestTest {
    return doctorAgent.post(`/patients/${patientId}/visits`).send({
      visitCode: `${TEST_VISIT_PREFIX}${suffix}`,
      assessmentDate: '2026-07-10T08:00:00.000Z',
    });
  }

  async function createExecution(suffix: string): Promise<ExecutionFixture> {
    const patientResponse = await createPatient(suffix).expect(201);
    const patientId = readString(readResponseBody(patientResponse), 'id');
    const visitResponse = await createVisit(patientId, suffix).expect(201);
    const visitId = readString(readResponseBody(visitResponse), 'id');
    const instanceResponse = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({ scaleCode: 'moca' })
      .expect(201);
    const scaleInstance = readRecord(
      readResponseBody(instanceResponse),
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

  function evidencePath(
    fixture: ExecutionFixture,
    itemResponseId: string,
  ): string {
    return `${executionPath(fixture)}/item-responses/${itemResponseId}/media-evidences`;
  }

  async function findExecutionItem(
    fixture: ExecutionFixture,
    evidenceType: 'photo' | 'handwriting',
    excludedIds: string[] = [],
  ): Promise<Record<string, unknown>> {
    const response = await doctorAgent.get(executionPath(fixture)).expect(200);
    const itemResponses = readArray(
      readResponseBody(response),
      'itemResponses',
    );
    const item = itemResponses.find((candidate) => {
      if (!isRecord(candidate) || excludedIds.includes(String(candidate.id))) {
        return false;
      }

      const config = candidate.config;
      return (
        isRecord(config) &&
        Array.isArray(config.evidenceTypes) &&
        config.evidenceTypes.includes(evidenceType)
      );
    });

    if (!isRecord(item)) {
      throw new Error(`Expected an item requiring ${evidenceType}`);
    }

    return item;
  }

  function uploadPhoto(path: string): SupertestTest {
    return doctorAgent
      .post(path)
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .field('imageWidth', '1')
      .field('imageHeight', '1')
      .field('isColor', 'false')
      .attach('file', VALID_PNG, {
        filename: 'private-client-name.png',
        contentType: 'image/png',
      });
  }

  function uploadHandwriting(path: string): SupertestTest {
    return doctorAgent
      .post(path)
      .field('evidenceType', 'handwriting')
      .field('captureMode', 'tablet_handwriting')
      .field('trajectoryFormat', 'strokes')
      .field('strokeCount', '1')
      .field('canvasWidth', '1024')
      .field('canvasHeight', '768')
      .attach('file', VALID_PNG, {
        filename: 'a30-rendered.png',
        contentType: 'image/png',
      })
      .attach('trajectory', Buffer.from('{"strokes":[[{"x":1,"y":2}]]}'), {
        filename: 'a30-trajectory.json',
        contentType: 'application/json',
      });
  }

  async function prepareAnsweredExecution(
    fixture: ExecutionFixture,
    excludedMediaItemId: string,
  ): Promise<void> {
    const items = await itemResponseModel
      .find({ scaleInstanceId: fixture.scaleInstanceId })
      .exec();
    for (const item of items) {
      await itemResponseModel
        .updateOne(
          { _id: item._id },
          {
            $set: {
              status: 'answered',
              rawResponse: false,
              operatorNote: 'A30 deterministic media concurrency fixture',
              timing: {
                timerState: 'completed',
                startedAt: new Date('2026-07-10T08:00:00.000Z'),
                lastResumedAt: null,
                completedAt: new Date('2026-07-10T08:00:01.000Z'),
                durationMs: 1000,
                timerSource: 'manual',
              },
            },
          },
        )
        .exec();
      if (item.stepResults.length > 0) {
        await itemResponseModel
          .updateOne(
            { _id: item._id },
            { $set: { 'stepResults.$[].actualValue': 0 } },
          )
          .exec();
      }
      if (
        item._id.toString() !== excludedMediaItemId &&
        item.evidenceRefs.length > 0
      ) {
        await itemResponseModel
          .updateOne(
            { _id: item._id },
            {
              $set: {
                'evidenceRefs.0.mediaEvidenceId': new Types.ObjectId(),
                'evidenceRefs.0.status': 'attached',
              },
            },
          )
          .exec();
      }
    }
  }

  async function expectReady(fixture: ExecutionFixture): Promise<void> {
    const response = await doctorAgent
      .get(`${executionPath(fixture)}/submission-readiness`)
      .expect(200);
    const readiness = readResponseBody(response);
    const issueCodes = readArray(readiness, 'blockingIssues').map((issue) =>
      isRecord(issue) ? issue.code : 'INVALID_ISSUE',
    );
    expect({ ready: readiness.ready, issueCodes }).toEqual({
      ready: true,
      issueCodes: [],
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
    visitModel = app.get<Model<AssessmentVisitDocument>>(
      getModelToken(AssessmentVisit.name),
    );
    scaleInstanceModel = app.get<Model<ScaleInstanceDocument>>(
      getModelToken(ScaleInstance.name),
    );
    itemResponseModel = app.get<Model<ItemResponseDocument>>(
      getModelToken(ItemResponse.name),
    );
    mediaEvidenceModel = app.get<Model<MediaEvidenceDocument>>(
      getModelToken(MediaEvidence.name),
    );
    scaleDefinitionModel = app.get<Model<ScaleDefinitionDocument>>(
      getModelToken(ScaleDefinition.name),
    );
    scaleVersionModel = app.get<Model<ScaleVersionDocument>>(
      getModelToken(ScaleVersion.name),
    );
    storageService = app.get<FakeStorageService>(STORAGE_SERVICE);
    modelsReady = true;

    await cleanupA15Data();

    const passwordHash = await authService.hashPassword('A15-Test-Password!');
    await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A15 Doctor Test Operator',
      staffCode: 'STAFF-A15-TEST',
      email: 'doctor-a15-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A15 System Test Operator',
      staffCode: 'SYSTEM-A15-TEST',
      email: 'system-a15-test@example.test',
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
      .send({ accountName: DOCTOR_ACCOUNT, password: 'A15-Test-Password!' })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({ accountName: SYSTEM_ACCOUNT, password: 'A15-Test-Password!' })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      if (modelsReady) {
        await cleanupA15Data();
      }

      await app.close();
    }
  });

  it('enforces authentication and the four confirmed clinical roles', async () => {
    const path = `/patients/${new Types.ObjectId().toString()}/visits/${new Types.ObjectId().toString()}/scale-instances/${new Types.ObjectId().toString()}/item-responses/${new Types.ObjectId().toString()}/media-evidences`;

    await request(httpServer).get(path).expect(401);
    await systemAgent.get(path).expect(403);
    await request(httpServer)
      .post(path)
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .attach('file', VALID_PNG, {
        filename: 'test.png',
        contentType: 'image/png',
      })
      .expect(401);
    await systemAgent
      .post(path)
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .attach('file', VALID_PNG, {
        filename: 'test.png',
        contentType: 'image/png',
      })
      .expect(403);
  });

  it('completes photo list, upload, A14 sync, access, void and re-upload', async () => {
    const fixture = await createExecution('PHOTO');
    const item = await findExecutionItem(fixture, 'photo');
    const itemResponseId = readString(item, 'id');
    const path = evidencePath(fixture, itemResponseId);
    const draftPath = `${executionPath(fixture)}/item-responses/${itemResponseId}`;
    const mediaBaselineRevision = readSafeInteger(item, 'draftRevision');
    const mediaBaselineSavedAt = item.draftSavedAt;
    expect(mediaBaselineRevision).toBe(0);
    expect(mediaBaselineSavedAt).toBeNull();

    expect(
      readArray(
        readResponseBody(await doctorAgent.get(path).expect(200)),
        'items',
      ),
    ).toEqual([]);

    const uploadResponse = await uploadPhoto(path).expect(201);
    const uploadBody = readResponseBody(uploadResponse);
    const mediaEvidence = readRecord(uploadBody, 'mediaEvidence');
    const requirement = readRecord(uploadBody, 'evidenceRequirement');
    const mediaEvidenceId = readString(mediaEvidence, 'id');
    expect(requirement).toEqual({
      evidenceType: 'photo',
      status: 'attached',
      attached: true,
      mediaEvidenceId,
    });
    expect(mediaEvidence).toEqual(
      expect.objectContaining({
        evidenceType: 'photo',
        captureMode: 'photo_upload',
        status: 'attached',
        storageStatus: 'stored',
      }),
    );

    const forbiddenKeys = collectKeys(uploadBody);
    for (const forbidden of [
      'objectKey',
      'bucket',
      'objectPrefix',
      'originalFilename',
      'checksum',
      'metadata',
      'qualityHints',
      'patientId',
      'assessmentVisitId',
      'itemResponseId',
      'submissionWriteBarrier',
      'barrierId',
      'itemResponseIds',
      'expectedItemCount',
      'startedBy',
      'passwordHash',
      'sessionToken',
    ]) {
      expect(forbiddenKeys).not.toContain(forbidden);
    }

    const storedEvidence = await mediaEvidenceModel
      .findById(mediaEvidenceId)
      .exec();
    expect(storedEvidence?.storage?.originalFilename).toBeUndefined();
    expect(storedEvidence?.storage?.objectKey).not.toContain(
      'private-client-name',
    );
    expect(storedEvidence?.storage?.checksumAlgorithm).toBe('sha256');

    const storedItem = await itemResponseModel.findById(itemResponseId).exec();
    const photoReference = storedItem?.evidenceRefs.find(
      (reference) => reference.evidenceType === 'photo',
    );
    expect(photoReference?.status).toBe('attached');
    expect(photoReference?.mediaEvidenceId?.toString()).toBe(mediaEvidenceId);
    expect(storedItem?.status).toBe('not_started');
    expect(storedItem?.draftRevision).toBe(mediaBaselineRevision);
    expect(storedItem?.draftSavedAt ?? null).toBe(mediaBaselineSavedAt);

    const detail = readResponseBody(
      await doctorAgent.get(executionPath(fixture)).expect(200),
    );
    const updatedItem = readArray(detail, 'itemResponses').find(
      (candidate) => isRecord(candidate) && candidate.id === itemResponseId,
    );
    if (!isRecord(updatedItem)) {
      throw new Error('Expected updated execution item');
    }
    const attachedRequirement = readArray(
      updatedItem,
      'evidenceRequirements',
    ).find(
      (candidate) => isRecord(candidate) && candidate.evidenceType === 'photo',
    );
    expect(attachedRequirement).toEqual({
      evidenceType: 'photo',
      status: 'attached',
      attached: true,
      mediaEvidenceId,
    });
    expect(updatedItem.draftRevision).toBe(mediaBaselineRevision);
    expect(updatedItem.draftSavedAt).toBe(mediaBaselineSavedAt);

    const savedDraftResponse = await doctorAgent
      .patch(draftPath)
      .send({
        expectedRevision: mediaBaselineRevision,
        responseText: 'answer saved after media upload',
      })
      .expect(200);
    const savedDraftItem = readRecord(
      readResponseBody(savedDraftResponse),
      'itemResponse',
    );
    expect(savedDraftItem.draftRevision).toBe(mediaBaselineRevision + 1);
    const draftSavedAt = readString(savedDraftItem, 'draftSavedAt');
    expect(Number.isFinite(Date.parse(draftSavedAt))).toBe(true);
    expect(readArray(savedDraftItem, 'evidenceRequirements')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceType: 'photo',
          status: 'attached',
          attached: true,
          mediaEvidenceId,
        }),
      ]),
    );

    const accessPath = `${path}/${mediaEvidenceId}/access-url`;
    const access = readResponseBody(
      await doctorAgent.get(accessPath).expect(200),
    );
    expect(access.asset).toBe('primary');
    expect(readString(access, 'url')).toContain('fake-storage.local');
    expect(access).not.toHaveProperty('objectKey');
    expect(access).not.toHaveProperty('bucket');

    const duplicate = await uploadPhoto(path).expect(409);
    expect(readErrorCode(duplicate)).toBe('MEDIA_EVIDENCE_ALREADY_ATTACHED');

    await doctorAgent
      .post(`${path}/${mediaEvidenceId}/void`)
      .send({})
      .expect(400);
    const voidResponse = await doctorAgent
      .post(`${path}/${mediaEvidenceId}/void`)
      .send({ reason: 'wrong capture selected' })
      .expect(200);
    for (const forbidden of [
      'submissionWriteBarrier',
      'barrierId',
      'itemResponseIds',
      'expectedItemCount',
      'startedBy',
      '__v',
    ]) {
      expect(collectKeys(readResponseBody(voidResponse))).not.toContain(
        forbidden,
      );
    }
    const voidBody = readResponseBody(voidResponse);
    expect(readRecord(voidBody, 'mediaEvidence').status).toBe('voided');
    const voidedEvidence = await mediaEvidenceModel
      .findById(mediaEvidenceId)
      .exec();
    expect(voidedEvidence?.status).toBe('voided');
    expect(voidedEvidence?.voidedAt).toBeInstanceOf(Date);
    expect(voidedEvidence?.storage?.objectKey).toBe(
      storedEvidence?.storage?.objectKey,
    );
    expect(voidedEvidence?.metadata).toEqual(
      expect.objectContaining({ voidReason: 'wrong capture selected' }),
    );

    const clearedItem = await itemResponseModel.findById(itemResponseId).exec();
    const clearedReference = clearedItem?.evidenceRefs.find(
      (reference) => reference.evidenceType === 'photo',
    );
    expect(clearedReference?.status).toBe('pending');
    expect(clearedReference?.mediaEvidenceId).toBeNull();
    expect(readRecord(voidBody, 'evidenceRequirement')).toEqual({
      evidenceType: clearedReference?.evidenceType,
      status: clearedReference?.status,
      attached: clearedReference?.mediaEvidenceId !== null,
      mediaEvidenceId: clearedReference?.mediaEvidenceId?.toString() ?? null,
    });
    expect(clearedItem?.draftRevision).toBe(mediaBaselineRevision + 1);
    expect(clearedItem?.draftSavedAt?.toISOString()).toBe(draftSavedAt);
    const listAfterVoid = readArray(
      readResponseBody(await doctorAgent.get(path).expect(200)),
      'items',
    );
    for (const forbidden of [
      'submissionWriteBarrier',
      'barrierId',
      'itemResponseIds',
      'expectedItemCount',
      'startedBy',
      '__v',
    ]) {
      expect(collectKeys(listAfterVoid)).not.toContain(forbidden);
    }
    expect(listAfterVoid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: mediaEvidenceId, status: 'voided' }),
      ]),
    );
    const inaccessible = await doctorAgent.get(accessPath).expect(409);
    expect(readErrorCode(inaccessible)).toBe('MEDIA_EVIDENCE_NOT_ACCESSIBLE');

    const replacement = readRecord(
      readResponseBody(await uploadPhoto(path).expect(201)),
      'mediaEvidence',
    );
    expect(readString(replacement, 'id')).not.toBe(mediaEvidenceId);
    const afterReplacement = await itemResponseModel
      .findById(itemResponseId)
      .exec();
    expect(afterReplacement?.draftRevision).toBe(mediaBaselineRevision + 1);
    expect(afterReplacement?.draftSavedAt?.toISOString()).toBe(draftSavedAt);
  });

  it('Stage 3: compensates upload data and fake objects when A16 wins before attach', async () => {
    const fixture = await createExecution('A30-UPLOAD-BARRIER');
    const item = await findExecutionItem(fixture, 'handwriting');
    const itemResponseId = readString(item, 'id');
    await prepareAnsweredExecution(fixture, itemResponseId);
    const path = evidencePath(fixture, itemResponseId);
    const storageTracker = trackFakeStorage(storageService);
    let attachLatch: QueryLatch | undefined;

    try {
      const existingResponse = await uploadHandwriting(path).expect(201);
      const existingEvidenceId = readString(
        readRecord(readResponseBody(existingResponse), 'mediaEvidence'),
        'id',
      );
      await expectReady(fixture);
      const baselineObjectKeys = storageTracker.readObjectKeys();
      const baselineItem = await itemResponseModel
        .findById(itemResponseId)
        .lean()
        .exec();
      attachLatch = latchNextQuery('Stage 3 evidence attach', (query) =>
        querySetsEvidenceStatus(query, 'attached'),
      );
      const uploadPromise = uploadPhoto(path).then((response) => response);
      await attachLatch.reached;
      const duringUpload = await mediaEvidenceModel
        .find({
          scaleInstanceId: fixture.scaleInstanceId,
          itemResponseId,
          deletedAt: null,
        })
        .lean()
        .exec();
      expect(duringUpload).toHaveLength(2);
      expect(storageTracker.readObjectKeys().size).toBe(
        baselineObjectKeys.size + 1,
      );

      await doctorAgent
        .post(`${executionPath(fixture)}/submit`)
        .send({ confirm: true })
        .expect(200);
      attachLatch.release();
      const uploadResponse = await uploadPromise;
      expect(uploadResponse.status).toBe(409);
      expect(readErrorCode(uploadResponse)).toBe('SCALE_INSTANCE_NOT_EDITABLE');

      const remainingEvidence = await mediaEvidenceModel
        .find({
          scaleInstanceId: fixture.scaleInstanceId,
          itemResponseId,
          deletedAt: null,
        })
        .lean()
        .exec();
      expect(remainingEvidence.map((entry) => entry._id.toString())).toEqual([
        existingEvidenceId,
      ]);
      expect(storageTracker.readObjectKeys()).toEqual(baselineObjectKeys);
      const storedItem = await itemResponseModel
        .findById(itemResponseId)
        .lean()
        .exec();
      expect(storedItem?.evidenceRefs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            evidenceType: 'handwriting',
            mediaEvidenceId: new Types.ObjectId(existingEvidenceId),
            status: 'attached',
          }),
        ]),
      );
      expect(storedItem?.draftRevision).toBe(baselineItem?.draftRevision);
      expect(storedItem?.draftSavedAt).toEqual(baselineItem?.draftSavedAt);
    } finally {
      attachLatch?.release();
      attachLatch?.restore();
      storageTracker.restore();
    }
  });

  it('Stage 4: rejects a paused void clear after A16 completes with attached facts intact', async () => {
    const fixture = await createExecution('A30-VOID-BARRIER');
    const item = await findExecutionItem(fixture, 'photo');
    const itemResponseId = readString(item, 'id');
    await prepareAnsweredExecution(fixture, itemResponseId);
    const path = evidencePath(fixture, itemResponseId);
    const uploadResponse = await uploadPhoto(path).expect(201);
    const mediaEvidenceId = readString(
      readRecord(readResponseBody(uploadResponse), 'mediaEvidence'),
      'id',
    );
    await expectReady(fixture);
    const baselineEvidence = await mediaEvidenceModel
      .findById(mediaEvidenceId)
      .lean()
      .exec();
    const baselineItem = await itemResponseModel
      .findById(itemResponseId)
      .lean()
      .exec();
    const clearLatch = latchNextQuery('Stage 4 evidence clear', (query) =>
      querySetsEvidenceStatus(query, 'pending'),
    );

    try {
      const voidPromise = doctorAgent
        .post(`${path}/${mediaEvidenceId}/void`)
        .send({ reason: 'must lose to submission barrier' })
        .then((response) => response);
      await clearLatch.reached;
      await doctorAgent
        .post(`${executionPath(fixture)}/submit`)
        .send({ confirm: true })
        .expect(200);
      const beforeRelease = await itemResponseModel
        .findById(itemResponseId)
        .lean()
        .exec();
      clearLatch.release();
      const voidResponse = await voidPromise;
      expect(voidResponse.status).toBe(409);
      expect(readErrorCode(voidResponse)).toBe('SCALE_INSTANCE_NOT_EDITABLE');

      expect(
        await itemResponseModel.findById(itemResponseId).lean().exec(),
      ).toEqual(beforeRelease);
      expect(
        await mediaEvidenceModel.findById(mediaEvidenceId).lean().exec(),
      ).toEqual(baselineEvidence);
      expect(beforeRelease?.draftRevision).toBe(baselineItem?.draftRevision);
      expect(beforeRelease?.draftSavedAt).toEqual(baselineItem?.draftSavedAt);
      expect(
        beforeRelease?.evidenceRefs.some(
          (reference) =>
            reference.mediaEvidenceId?.toString() === mediaEvidenceId &&
            reference.status === 'attached',
        ),
      ).toBe(true);
    } finally {
      clearLatch.release();
      clearLatch.restore();
    }
  });

  it('Stage 5: releases fencing after a winning void invalidates readiness, then permits resubmit', async () => {
    const fixture = await createExecution('A30-VOID-FIRST');
    const item = await findExecutionItem(fixture, 'photo');
    const itemResponseId = readString(item, 'id');
    await prepareAnsweredExecution(fixture, itemResponseId);
    const path = evidencePath(fixture, itemResponseId);
    const uploadResponse = await uploadPhoto(path).expect(201);
    const mediaEvidenceId = readString(
      readRecord(readResponseBody(uploadResponse), 'mediaEvidence'),
      'id',
    );
    await expectReady(fixture);
    const baselineItem = await itemResponseModel
      .findById(itemResponseId)
      .lean()
      .exec();
    const clearLatch = latchNextQuery('Stage 5 evidence clear', (query) =>
      querySetsEvidenceStatus(query, 'pending'),
    );
    let fencingLatch: QueryLatch | undefined;

    try {
      const voidPromise = doctorAgent
        .post(`${path}/${mediaEvidenceId}/void`)
        .send({ reason: 'A30 deterministic readiness invalidation' })
        .then((response) => response);
      await clearLatch.reached;
      clearLatch.restore();

      fencingLatch = latchNextQuery(
        'Stage 5 item fencing',
        queryIsSubmissionFencing,
      );
      const submitPromise = doctorAgent
        .post(`${executionPath(fixture)}/submit`)
        .send({ confirm: true })
        .then((response) => response);
      await fencingLatch.reached;
      const fencingParent = await scaleInstanceModel
        .findById(fixture.scaleInstanceId)
        .lean()
        .exec();
      const oldBarrierId = fencingParent?.submissionWriteBarrier?.barrierId;
      expect(fencingParent?.submissionWriteBarrier?.state).toBe('fencing');

      clearLatch.release();
      const voidResponse = await voidPromise;
      expect(voidResponse.status).toBe(200);
      fencingLatch.release();
      const submitResponse = await submitPromise;
      expect(submitResponse.status).toBe(409);
      expect(readErrorCode(submitResponse)).toBe('SCALE_INSTANCE_NOT_READY');

      const releasedParent = await scaleInstanceModel
        .findById(fixture.scaleInstanceId)
        .lean()
        .exec();
      const releasedItems = await itemResponseModel
        .find({ scaleInstanceId: fixture.scaleInstanceId })
        .lean()
        .exec();
      expect(releasedParent?.status).not.toBe('completed');
      expect(releasedParent?.submissionWriteBarrier ?? null).toBeNull();
      expect(
        isRecord(releasedParent?.metadata)
          ? releasedParent.metadata.submission
          : undefined,
      ).toBeUndefined();
      expect(
        releasedItems.every(
          (itemResponse) =>
            (itemResponse.submissionWriteBarrier ?? null) === null,
        ),
      ).toBe(true);
      expect(
        releasedItems.some(
          (itemResponse) =>
            itemResponse.submissionWriteBarrier?.barrierId === oldBarrierId,
        ),
      ).toBe(false);
      const voidedEvidence = await mediaEvidenceModel
        .findById(mediaEvidenceId)
        .lean()
        .exec();
      expect(voidedEvidence?.status).toBe('voided');
      const releasedTarget = releasedItems.find(
        (itemResponse) => itemResponse._id.toString() === itemResponseId,
      );
      expect(releasedTarget?.draftRevision).toBe(baselineItem?.draftRevision);
      expect(releasedTarget?.draftSavedAt).toEqual(baselineItem?.draftSavedAt);
      expect(
        releasedTarget?.evidenceRefs.some(
          (reference) =>
            reference.evidenceType === 'photo' &&
            reference.status === 'pending' &&
            reference.mediaEvidenceId === null,
        ),
      ).toBe(true);

      await uploadPhoto(path).expect(201);
      await expectReady(fixture);
      await doctorAgent
        .post(`${executionPath(fixture)}/submit`)
        .send({ confirm: true })
        .expect(200);
      const completed = await scaleInstanceModel
        .findById(fixture.scaleInstanceId)
        .lean()
        .exec();
      expect(completed?.status).toBe('completed');
      expect(completed?.submissionWriteBarrier?.barrierId).not.toBe(
        oldBarrierId,
      );
    } finally {
      clearLatch.release();
      clearLatch.restore();
      fencingLatch?.release();
      fencingLatch?.restore();
    }
  });

  it('uploads handwriting with normalized JSON trajectory and signs both assets', async () => {
    const fixture = await createExecution('HANDWRITING');
    const item = await findExecutionItem(fixture, 'handwriting');
    const itemResponseId = readString(item, 'id');
    const path = evidencePath(fixture, itemResponseId);
    const trajectory = Buffer.from(
      ' { "strokes" : [ [ { "x": 1, "y": 2 } ] ] } ',
    );
    const response = await doctorAgent
      .post(path)
      .field('evidenceType', 'handwriting')
      .field('captureMode', 'tablet_handwriting')
      .field('trajectoryFormat', 'strokes')
      .field('strokeCount', '1')
      .field('canvasWidth', '1024')
      .field('canvasHeight', '768')
      .attach('file', VALID_PNG, {
        filename: 'rendered.png',
        contentType: 'image/png',
      })
      .attach('trajectory', trajectory, {
        filename: 'trajectory.json',
        contentType: 'application/json',
      })
      .expect(201);
    const mediaEvidence = readRecord(
      readResponseBody(response),
      'mediaEvidence',
    );
    const trace = readRecord(mediaEvidence, 'handwritingTrace');
    expect(trace).toEqual(
      expect.objectContaining({
        hasTrajectory: true,
        trajectoryFormat: 'strokes',
        strokeCount: 1,
      }),
    );
    expect(trace).not.toHaveProperty('trajectoryObjectKey');
    const mediaEvidenceId = readString(mediaEvidence, 'id');

    await doctorAgent
      .get(`${path}/${mediaEvidenceId}/access-url?asset=primary`)
      .expect(200);
    const trajectoryAccess = readResponseBody(
      await doctorAgent
        .get(`${path}/${mediaEvidenceId}/access-url?asset=trajectory`)
        .expect(200),
    );
    expect(trajectoryAccess.asset).toBe('trajectory');

    const stored = await mediaEvidenceModel.findById(mediaEvidenceId).exec();
    expect(stored?.handwritingTrace?.hasTrajectory).toBe(true);
    expect(stored?.handwritingTrace?.trajectoryObjectKey).toMatch(
      /\.trajectory\.json$/,
    );
  });

  it('rejects trajectory misuse, capture mismatches and unsafe media', async () => {
    const fixture = await createExecution('VALIDATION');
    const item = await findExecutionItem(fixture, 'photo');
    const path = evidencePath(fixture, readString(item, 'id'));

    const photoTrajectory = await doctorAgent
      .post(path)
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .attach('file', VALID_PNG, {
        filename: 'rendered.png',
        contentType: 'image/png',
      })
      .attach('trajectory', Buffer.from('{}'), {
        filename: 'trajectory.json',
        contentType: 'application/json',
      })
      .expect(400);
    expect(readErrorCode(photoTrajectory)).toBe('MEDIA_TRAJECTORY_INVALID');

    const wrongMode = await doctorAgent
      .post(path)
      .field('evidenceType', 'handwriting')
      .field('captureMode', 'paper_scan')
      .attach('file', VALID_PNG, {
        filename: 'rendered.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(readErrorCode(wrongMode)).toBe('MEDIA_CAPTURE_MODE_INVALID');

    const invalidTrajectory = await doctorAgent
      .post(path)
      .field('evidenceType', 'handwriting')
      .field('captureMode', 'tablet_handwriting')
      .attach('file', VALID_PNG, {
        filename: 'rendered.png',
        contentType: 'image/png',
      })
      .attach('trajectory', Buffer.from('{invalid'), {
        filename: 'trajectory.json',
        contentType: 'application/json',
      })
      .expect(400);
    expect(readErrorCode(invalidTrajectory)).toBe('MEDIA_TRAJECTORY_INVALID');

    const svg = await doctorAgent
      .post(path)
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .attach('file', Buffer.from('<svg/>'), {
        filename: 'forged.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);
    expect(readErrorCode(svg)).toBe('MEDIA_FILE_TYPE_NOT_ALLOWED');

    const spoofedPdf = await doctorAgent
      .post(path)
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .attach('file', Buffer.from('%PDF-1.7'), {
        filename: 'forged.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(readErrorCode(spoofedPdf)).toBe('MEDIA_FILE_SIGNATURE_INVALID');

    const pngWithText = Buffer.concat([
      VALID_PNG.subarray(0, 8),
      Buffer.from([0, 0, 0, 1]),
      Buffer.from('tEXt'),
      Buffer.from('x'),
      Buffer.alloc(4),
    ]);
    const metadata = await doctorAgent
      .post(path)
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .attach('file', pngWithText, {
        filename: 'metadata.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(readErrorCode(metadata)).toBe(
      'MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED',
    );

    const forged = await doctorAgent
      .post(path)
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .field('objectKey', 'forged/private-key')
      .field('status', 'locked')
      .field('metadata', '{}')
      .attach('file', VALID_PNG, {
        filename: 'rendered.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(readResponseBody(forged)).not.toHaveProperty('objectKey');

    const oversized = await doctorAgent
      .post(path)
      .field('evidenceType', 'photo')
      .field('captureMode', 'photo_upload')
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'oversized.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(readErrorCode(oversized)).toBe('MEDIA_FILE_TOO_LARGE');

    const detail = readResponseBody(
      await doctorAgent.get(executionPath(fixture)).expect(200),
    );
    const itemWithoutPhoto = readArray(detail, 'itemResponses').find(
      (candidate) => {
        if (!isRecord(candidate) || !isRecord(candidate.config)) {
          return false;
        }

        return (
          Array.isArray(candidate.config.evidenceTypes) &&
          !candidate.config.evidenceTypes.includes('photo')
        );
      },
    );

    if (!isRecord(itemWithoutPhoto)) {
      throw new Error('Expected an item without photo evidence requirement');
    }

    const notRequired = await uploadPhoto(
      evidencePath(fixture, readString(itemWithoutPhoto, 'id')),
    ).expect(409);
    expect(readErrorCode(notRequired)).toBe('ITEM_EVIDENCE_TYPE_NOT_REQUIRED');
  });

  it('allows historical reads while blocking mutations and cross ownership', async () => {
    const fixture = await createExecution('HISTORY');
    const item = await findExecutionItem(fixture, 'photo');
    const itemResponseId = readString(item, 'id');
    const path = evidencePath(fixture, itemResponseId);
    const uploaded = readRecord(
      readResponseBody(await uploadPhoto(path).expect(201)),
      'mediaEvidence',
    );
    const mediaEvidenceId = readString(uploaded, 'id');

    await patientModel
      .updateOne({ _id: fixture.patientId }, { $set: { status: 'inactive' } })
      .exec();
    await doctorAgent.get(path).expect(200);
    await doctorAgent.get(`${path}/${mediaEvidenceId}/access-url`).expect(200);
    const inactiveUpload = await uploadPhoto(path).expect(409);
    expect(readErrorCode(inactiveUpload)).toBe('PATIENT_NOT_ACTIVE');

    await patientModel
      .updateOne({ _id: fixture.patientId }, { $set: { status: 'active' } })
      .exec();
    await visitModel
      .updateOne({ _id: fixture.visitId }, { $set: { status: 'completed' } })
      .exec();
    const visitBlocked = await doctorAgent
      .post(`${path}/${mediaEvidenceId}/void`)
      .send({ reason: 'wrong capture' })
      .expect(409);
    expect(readErrorCode(visitBlocked)).toBe('VISIT_NOT_EDITABLE');
    await doctorAgent.get(path).expect(200);

    const foreignFixture = await createExecution('FOREIGN');
    const crossPath = evidencePath(foreignFixture, itemResponseId);
    await doctorAgent.get(crossPath).expect(404);
    const foreignItem = await findExecutionItem(foreignFixture, 'photo');
    const foreignPath = evidencePath(
      foreignFixture,
      readString(foreignItem, 'id'),
    );
    const crossMedia = await doctorAgent
      .get(`${foreignPath}/${mediaEvidenceId}/access-url`)
      .expect(404);
    expect(readErrorCode(crossMedia)).toBe('MEDIA_EVIDENCE_NOT_FOUND');
  });

  it('blocks upload and void for every non-editable visit, instance and item state', async () => {
    const fixture = await createExecution('STATES');
    const item = await findExecutionItem(fixture, 'photo');
    const itemResponseId = readString(item, 'id');
    const path = evidencePath(fixture, itemResponseId);
    const mediaEvidenceId = readString(
      readRecord(
        readResponseBody(await uploadPhoto(path).expect(201)),
        'mediaEvidence',
      ),
      'id',
    );
    const voidPath = `${path}/${mediaEvidenceId}/void`;

    for (const status of ['completed', 'locked', 'voided']) {
      await visitModel
        .updateOne({ _id: fixture.visitId }, { $set: { status } })
        .exec();
      expect(readErrorCode(await uploadPhoto(path).expect(409))).toBe(
        'VISIT_NOT_EDITABLE',
      );
      expect(
        readErrorCode(
          await doctorAgent
            .post(voidPath)
            .send({ reason: 'wrong capture' })
            .expect(409),
        ),
      ).toBe('VISIT_NOT_EDITABLE');
    }
    await visitModel
      .updateOne({ _id: fixture.visitId }, { $set: { status: 'draft' } })
      .exec();

    for (const status of ['completed', 'locked', 'voided']) {
      await scaleInstanceModel
        .updateOne({ _id: fixture.scaleInstanceId }, { $set: { status } })
        .exec();
      expect(readErrorCode(await uploadPhoto(path).expect(409))).toBe(
        'SCALE_INSTANCE_NOT_EDITABLE',
      );
      expect(
        readErrorCode(
          await doctorAgent
            .post(voidPath)
            .send({ reason: 'wrong capture' })
            .expect(409),
        ),
      ).toBe('SCALE_INSTANCE_NOT_EDITABLE');
    }
    await scaleInstanceModel
      .updateOne(
        { _id: fixture.scaleInstanceId },
        { $set: { status: 'draft' } },
      )
      .exec();

    for (const status of ['scored', 'locked', 'voided']) {
      await itemResponseModel
        .updateOne({ _id: itemResponseId }, { $set: { status } })
        .exec();
      expect(readErrorCode(await uploadPhoto(path).expect(409))).toBe(
        'ITEM_RESPONSE_NOT_EDITABLE',
      );
      expect(
        readErrorCode(
          await doctorAgent
            .post(voidPath)
            .send({ reason: 'wrong capture' })
            .expect(409),
        ),
      ).toBe('ITEM_RESPONSE_NOT_EDITABLE');
    }
  });
});
