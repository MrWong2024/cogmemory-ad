import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
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

const DOCTOR_ACCOUNT = 'doctor-a15-test';
const SYSTEM_ACCOUNT = 'system-a15-test';
const TEST_PATIENT_PREFIX = 'SUBJ-A15-TEST-';
const TEST_VISIT_PREFIX = 'VISIT-A15-TEST-';
const TEST_SCALE_CODES = ['moca'];
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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

function readErrorCode(response: Response): string {
  return readString(readResponseBody(response), 'code');
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

    httpServer = app.getHttpServer() as SupertestApp;
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
    expect(attachedRequirement).toEqual(
      expect.objectContaining({ status: 'attached', attached: true }),
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
    expect(
      readRecord(readResponseBody(voidResponse), 'mediaEvidence').status,
    ).toBe('voided');
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
    const listAfterVoid = readArray(
      readResponseBody(await doctorAgent.get(path).expect(200)),
      'items',
    );
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
