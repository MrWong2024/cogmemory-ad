import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { Readable } from 'node:stream';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../src/modules/assessments/schemas/item-response.schema';
import {
  PatientAdministrationSession,
  type PatientAdministrationSessionDocument,
} from '../src/modules/assessments/schemas/patient-administration-session.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  MediaEvidence,
  type MediaEvidenceDocument,
} from '../src/modules/media/schemas/media-evidence.schema';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ScaleDefinition,
  type ScaleDefinitionDocument,
} from '../src/modules/scales/schemas/scale-definition.schema';
import {
  ScaleVersion,
  type ScaleVersionDocument,
} from '../src/modules/scales/schemas/scale-version.schema';
import { ScaleSeedDataService } from '../src/modules/scales/seeds/scale-seed-data.service';
import { PresentationAssetsService } from '../src/modules/scales/services/presentation-assets.service';
import { STORAGE_SERVICE } from '../src/modules/storage/storage.constants';
import type {
  SignedUrlOptions,
  SignedUrlResult,
  StorageService,
  UploadFileInput,
  UploadedFileResult,
} from '../src/modules/storage/storage.interface';
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';
import { requireInitialized } from './support/e2e-initialization';

jest.setTimeout(120_000);

const ACCOUNT_NAME = 'doctor-c1-patient-evidence';
const PASSWORD = 'C1-Patient-Evidence-Password!';
const TEST_CASES = ['MAIN', 'CONCURRENT', 'PAUSE'] as const;
const SUBJECT_CODES = TEST_CASES.map(
  (suffix) => `SUBJ-C1-PATIENT-EVIDENCE-${suffix}`,
);
const VISIT_CODES = TEST_CASES.map(
  (suffix) => `VISIT-C1-PATIENT-EVIDENCE-${suffix}`,
);
const AUDIO_PREFIX = 'C1-AUDIO:';
const IMAGE_PREFIX = 'C1-IMAGE:';
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;
type TestAgent = ReturnType<typeof request.agent>;

type UploadBatch = {
  allStarted: Promise<void>;
  release(): void;
};

class TrackingFakeStorageService implements StorageService {
  readonly driver = 'fake' as const;
  readonly objects = new Map<
    string,
    { buffer: Buffer; sizeBytes: number; mimeType: string }
  >();
  readonly uploadedKeys: string[] = [];
  readonly copiedKeys: string[] = [];
  readonly deletedKeys: string[] = [];
  private blockedBatch:
    | {
        remaining: number;
        allStartedResolve: () => void;
        releasePromise: Promise<void>;
      }
    | undefined;

  blockNextUploads(count: number): UploadBatch {
    if (this.blockedBatch || !Number.isSafeInteger(count) || count < 1) {
      throw new Error('Invalid tracking storage upload block');
    }
    let allStartedResolve = (): void => undefined;
    let releaseResolve = (): void => undefined;
    const allStarted = new Promise<void>((resolve) => {
      allStartedResolve = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    this.blockedBatch = { remaining: count, allStartedResolve, releasePromise };
    return { allStarted, release: releaseResolve };
  }

  async uploadFile(input: UploadFileInput): Promise<UploadedFileResult> {
    this.objects.set(input.objectKey, {
      buffer: Buffer.from(input.buffer),
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
    });
    this.uploadedKeys.push(input.objectKey);
    const batch = this.blockedBatch;
    if (batch && batch.remaining > 0) {
      batch.remaining -= 1;
      if (batch.remaining === 0) {
        batch.allStartedResolve();
      }
      await batch.releasePromise;
      if (batch.remaining === 0) {
        this.blockedBatch = undefined;
      }
    }
    return {
      objectKey: input.objectKey,
      bucket: 'c1-fake-storage',
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
    };
  }

  getSignedUrl(
    objectKey: string,
    options: SignedUrlOptions,
  ): Promise<SignedUrlResult> {
    return Promise.resolve({
      url: `https://fake.invalid/${encodeURIComponent(objectKey)}`,
      expiresAt: new Date(Date.now() + options.expiresInSeconds * 1000),
    });
  }

  copyObject(sourceObjectKey: string, targetObjectKey: string): Promise<void> {
    this.copiedKeys.push(`${sourceObjectKey}->${targetObjectKey}`);
    return Promise.resolve();
  }

  deleteObject(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
    this.deletedKeys.push(objectKey);
    return Promise.resolve();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bodyOf(response: Response): Record<string, unknown> {
  const body: unknown = response.body;
  if (!isRecord(body)) {
    throw new Error('Expected an object response body');
  }
  return body;
}

function stringOf(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string') {
    throw new Error(`Expected ${key} to be a string`);
  }
  return value;
}

function numberOf(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number') {
    throw new Error(`Expected ${key} to be a number`);
  }
  return value;
}

function arrayOf(body: Record<string, unknown>, key: string): unknown[] {
  const value = body[key];
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${key} to be an array`);
  }
  return value;
}

function cookieHeaderOf(response: Response): string {
  const setCookie: unknown = response.headers['set-cookie'];
  const values =
    typeof setCookie === 'string'
      ? [setCookie]
      : Array.isArray(setCookie) &&
          setCookie.every((value) => typeof value === 'string')
        ? setCookie
        : [];
  if (values.length === 0) {
    throw new Error('Expected patient session cookie');
  }
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

function jsonSnapshot(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Timed out waiting for controlled upload')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

describe('patient administration evidence APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let httpServer: SupertestApp;
  let staff: TestAgent;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let authSessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let scaleInstanceModel: Model<ScaleInstanceDocument>;
  let itemResponseModel: Model<ItemResponseDocument>;
  let administrationSessionModel: Model<PatientAdministrationSessionDocument>;
  let mediaEvidenceModel: Model<MediaEvidenceDocument>;
  let scaleDefinitionModel: Model<ScaleDefinitionDocument>;
  let scaleVersionModel: Model<ScaleVersionDocument>;
  let mmseDefinition: ScaleDefinitionDocument;
  let mmseVersion: ScaleVersionDocument;
  let ownsMmseDefinition = false;
  let ownsMmseVersion = false;
  let modelsReady = false;
  const trackingStorage = new TrackingFakeStorageService();
  const ownedUserIds = new Set<string>();
  const ownedScaleInstanceIds = new Set<string>();

  async function cleanupOwnedData(): Promise<void> {
    const users = await userModel
      .find({ accountName: ACCOUNT_NAME })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0) {
      await authSessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }

    const patients = await patientModel
      .find({ subjectCode: { $in: SUBJECT_CODES } })
      .select({ _id: 1 })
      .exec();
    const patientIds = patients.map((patient) => patient._id);
    if (patientIds.length > 0) {
      const instances = await scaleInstanceModel
        .find({ patientId: { $in: patientIds } })
        .select({ _id: 1 })
        .exec();
      const instanceIds = instances.map((instance) => instance._id);
      if (instanceIds.length > 0) {
        await mediaEvidenceModel
          .deleteMany({ scaleInstanceId: { $in: instanceIds } })
          .exec();
        await administrationSessionModel
          .deleteMany({ scaleInstanceId: { $in: instanceIds } })
          .exec();
        await itemResponseModel
          .deleteMany({ scaleInstanceId: { $in: instanceIds } })
          .exec();
        await scaleInstanceModel
          .deleteMany({ _id: { $in: instanceIds } })
          .exec();
      }
      await visitModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await patientModel.deleteMany({ _id: { $in: patientIds } }).exec();
    }
    await userModel.deleteMany({ accountName: ACCOUNT_NAME }).exec();
  }

  async function assertNoOwnedData(): Promise<void> {
    const userIds = [...ownedUserIds].map((id) => new Types.ObjectId(id));
    const instanceIds = [...ownedScaleInstanceIds].map(
      (id) => new Types.ObjectId(id),
    );
    const counts = await Promise.all([
      userModel.countDocuments({ accountName: ACCOUNT_NAME }),
      userIds.length > 0
        ? authSessionModel.countDocuments({ userId: { $in: userIds } })
        : Promise.resolve(0),
      patientModel.countDocuments({ subjectCode: { $in: SUBJECT_CODES } }),
      visitModel.countDocuments({ visitCode: { $in: VISIT_CODES } }),
      instanceIds.length > 0
        ? scaleInstanceModel.countDocuments({ _id: { $in: instanceIds } })
        : Promise.resolve(0),
      instanceIds.length > 0
        ? itemResponseModel.countDocuments({
            scaleInstanceId: { $in: instanceIds },
          })
        : Promise.resolve(0),
      instanceIds.length > 0
        ? mediaEvidenceModel.countDocuments({
            scaleInstanceId: { $in: instanceIds },
          })
        : Promise.resolve(0),
      instanceIds.length > 0
        ? administrationSessionModel.countDocuments({
            scaleInstanceId: { $in: instanceIds },
          })
        : Promise.resolve(0),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error('C1 E2E requires NODE_ENV=test and standard_test');
    }

    const seedDataService = new ScaleSeedDataService();
    const mmseSeed = seedDataService.getScaleSeedByCode('mmse');
    const steps = mmseSeed?.version.patientAdministrationSteps;
    if (!mmseSeed || !steps || steps.length !== 19) {
      throw new Error('Expected the built-in 19-step MMSE seed');
    }
    const stubAssets = steps.flatMap((step) =>
      step.assetKeys.map((assetKey) => {
        const isImage = assetKey === 'mmse-drawing-stimulus';
        return {
          assetKey,
          stepKey: step.stepKey,
          kind: isImage ? ('image' as const) : ('audio' as const),
          ...(isImage
            ? {}
            : {
                role: assetKey.endsWith('-stimulus')
                  ? ('stimulus' as const)
                  : ('guidance' as const),
              }),
          mimeType: isImage ? 'image/png' : 'audio/mpeg',
          file: `in-memory/${assetKey}.${isImage ? 'png' : 'mp3'}`,
          filePath: `in-memory/${assetKey}.${isImage ? 'png' : 'mp3'}`,
          size: Buffer.byteLength(
            `${isImage ? IMAGE_PREFIX : AUDIO_PREFIX}${assetKey}`,
          ),
          sha256: '0'.repeat(64),
        };
      }),
    );
    const presentationAssetsStub = {
      validatePackage: jest.fn().mockResolvedValue({
        packageDirectory: 'in-memory',
        manifestPath: 'in-memory/manifest.json',
        manifest: {
          packageKey: 'mmse-1.0-package-001',
          scaleCode: 'mmse',
          scaleVersion: '1.0',
          status: 'released',
          sourcePdf: 'in-memory.pdf',
          sourcePdfSha256: '0'.repeat(64),
          reviewedBy: 'C1 E2E in-memory stub',
          reviewedAt: '2026-08-06T00:00:00.000Z',
          assets: stubAssets,
        },
        assets: stubAssets,
      }),
      openAsset: jest
        .fn()
        .mockImplementation((_packageKey: string, assetKey: string) => {
          const asset = stubAssets.find(
            (candidate) => candidate.assetKey === assetKey,
          );
          if (!asset) {
            throw new Error(`Unexpected C1 E2E asset ${assetKey}`);
          }
          const buffer = Buffer.from(
            `${asset.kind === 'image' ? IMAGE_PREFIX : AUDIO_PREFIX}${assetKey}`,
          );
          return Promise.resolve({
            assetKey,
            kind: asset.kind,
            mimeType: asset.mimeType,
            size: buffer.length,
            stream: Readable.from(buffer),
          });
        }),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PresentationAssetsService)
      .useValue(presentationAssetsStub)
      .overrideProvider(STORAGE_SERVICE)
      .useValue(trackingStorage)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    const configService = app.get(ConfigService);
    if (
      connection.name !== 'cogmemory_ad_test' ||
      configService.get<string>('app.env') !== 'test' ||
      configService.get<string>('mongo.purpose') !== 'standard_test' ||
      configService.get<string>('storage.driver') !== 'fake' ||
      configService.get<string>('asr.provider') !== 'stub' ||
      configService.get<string>('llm.provider') !== 'stub' ||
      configService.get<string>('smsAuth.provider') !== 'stub'
    ) {
      throw new Error('C1 E2E isolation is not active');
    }

    authService = app.get(AuthService);
    userModel = app.get(getModelToken(User.name));
    authSessionModel = app.get(getModelToken(Session.name));
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    scaleInstanceModel = app.get(getModelToken(ScaleInstance.name));
    itemResponseModel = app.get(getModelToken(ItemResponse.name));
    administrationSessionModel = app.get(
      getModelToken(PatientAdministrationSession.name),
    );
    mediaEvidenceModel = app.get(getModelToken(MediaEvidence.name));
    scaleDefinitionModel = app.get(getModelToken(ScaleDefinition.name));
    scaleVersionModel = app.get(getModelToken(ScaleVersion.name));
    modelsReady = true;
    await cleanupOwnedData();

    const existingDefinition = await scaleDefinitionModel
      .findOne({ code: 'mmse' })
      .exec();
    if (existingDefinition) {
      mmseDefinition = existingDefinition;
    } else {
      mmseDefinition = await scaleDefinitionModel.create({
        ...mmseSeed.definition,
        currentVersionId: null,
      });
      ownsMmseDefinition = true;
    }
    const existingVersion = await scaleVersionModel
      .findOne({ scaleDefinitionId: mmseDefinition._id, version: '1.0' })
      .exec();
    if (existingVersion) {
      mmseVersion = existingVersion;
    } else {
      mmseVersion = await scaleVersionModel.create({
        ...mmseSeed.version,
        scaleDefinitionId: mmseDefinition._id,
      });
      ownsMmseVersion = true;
      await scaleDefinitionModel
        .updateOne(
          { _id: mmseDefinition._id },
          { $set: { currentVersionId: mmseVersion._id } },
        )
        .exec();
    }
    expect(mmseVersion.items).toHaveLength(11);
    expect(
      mmseVersion.items.every(
        (item) =>
          item.requiresOperatorNote === false &&
          item.evidenceTypes.includes('operator_note'),
      ),
    ).toBe(true);

    const user = await userModel.create({
      accountName: ACCOUNT_NAME,
      displayName: 'C1 Patient Evidence Doctor',
      staffCode: 'STAFF-C1-PATIENT-EVIDENCE',
      passwordHash: await authService.hashPassword(PASSWORD),
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    ownedUserIds.add(user._id.toString());
    httpServer = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
    staff = request.agent(httpServer);
    await staff
      .post('/auth/login')
      .send({ accountName: ACCOUNT_NAME, password: PASSWORD })
      .expect(201);
  });

  afterAll(async () => {
    if (!app) {
      return;
    }
    if (modelsReady) {
      await cleanupOwnedData();
      await assertNoOwnedData();
      for (const objectKey of [...trackingStorage.objects.keys()]) {
        await trackingStorage.deleteObject(objectKey);
      }
      expect(trackingStorage.objects.size).toBe(0);
      if (ownsMmseVersion) {
        await scaleVersionModel.deleteOne({ _id: mmseVersion._id }).exec();
      }
      if (ownsMmseDefinition) {
        await scaleDefinitionModel
          .deleteOne({ _id: mmseDefinition._id })
          .exec();
      }
    }
    await app.close();
  });

  async function createActiveAdministration(
    suffix: (typeof TEST_CASES)[number],
  ) {
    const subjectCode = `SUBJ-C1-PATIENT-EVIDENCE-${suffix}`;
    const visitCode = `VISIT-C1-PATIENT-EVIDENCE-${suffix}`;
    const patient = await patientModel.create({
      subjectCode,
      displayName: `De-identified C1 ${suffix}`,
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['c1-patient-evidence'],
      externalRefs: null,
      metadata: null,
    });
    const visit = await visitModel.create({
      patientId: patient._id,
      subjectCode,
      visitCode,
      visitType: 'baseline',
      status: 'draft',
      assessmentDate: new Date('2026-08-06T01:00:00.000Z'),
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      operatorSnapshot: null,
      clinicalContext: null,
      metadata: null,
    });
    const initialization = await staff
      .post(
        `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances`,
      )
      .send({
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        administrationMode: 'supervised_patient_input',
      })
      .expect(201);
    const initializedInstance = bodyOf(initialization).scaleInstance;
    if (!isRecord(initializedInstance)) {
      throw new Error('Expected initialized scale instance');
    }
    const scaleInstanceId = stringOf(initializedInstance, 'id');
    ownedScaleInstanceIds.add(scaleInstanceId);
    const base = `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances/${scaleInstanceId}/patient-administration`;
    const createResponse = await staff
      .post(base)
      .send({ deviceMode: 'cross_device' })
      .expect(201);
    const createBody = bodyOf(createResponse);
    const patientAgent = request.agent(httpServer);
    const entered = await patientAgent
      .post('/patient-administration/enter')
      .send({ code: stringOf(createBody, 'entryCode') })
      .expect(200);
    const confirmed = await staff
      .post(`${base}/preparation/confirm`)
      .send({ expectedRevision: 1, impactFactorCodes: [] })
      .expect(200);
    return {
      patientAgent,
      patientId: patient._id.toString(),
      visitId: visit._id.toString(),
      scaleInstanceId,
      sessionId: stringOf(createBody, 'id'),
      patientCookie: cookieHeaderOf(entered),
      base,
      revision: numberOf(bodyOf(confirmed), 'revision'),
    };
  }

  async function currentStep(
    state: Awaited<ReturnType<typeof createActiveAdministration>>,
    expectedOrder?: number,
  ): Promise<Record<string, unknown>> {
    const response = await state.patientAgent
      .get('/patient-administration/current')
      .expect(200);
    const body = bodyOf(response);
    const step = body.currentStep;
    if (!isRecord(step)) {
      throw new Error('Expected an active patient step');
    }
    if (expectedOrder !== undefined) {
      expect(numberOf(step, 'order')).toBe(expectedOrder);
    }
    expect(numberOf(body, 'revision')).toBe(state.revision);
    return step;
  }

  async function playCurrentAudio(
    state: Awaited<ReturnType<typeof createActiveAdministration>>,
    step: Record<string, unknown>,
  ): Promise<void> {
    for (const value of arrayOf(step, 'assets')) {
      if (!isRecord(value) || value.kind !== 'audio') {
        continue;
      }
      const response = await state.patientAgent
        .post(
          `/patient-administration/current/audio/${stringOf(value, 'assetKey')}/play`,
        )
        .send({ expectedRevision: state.revision })
        .expect(200);
      state.revision = Number(
        response.headers['x-patient-administration-revision'],
      );
    }
  }

  async function uploadEvidence(
    state: Awaited<ReturnType<typeof createActiveAdministration>>,
    evidenceType: 'audio' | 'photo' | 'handwriting',
  ): Promise<Response> {
    let upload = state.patientAgent
      .post('/patient-administration/current/evidence')
      .field('expectedRevision', state.revision.toString())
      .field('evidenceType', evidenceType);
    if (evidenceType === 'audio') {
      upload = upload.field('durationMs', '1800');
    }
    const response = await upload
      .attach('file', evidenceType === 'audio' ? WEBM : PNG, {
        filename: 'patient-private-name-must-not-leak.bin',
        contentType: evidenceType === 'audio' ? 'audio/webm' : 'image/png',
      })
      .expect(201);
    state.revision = numberOf(bodyOf(response), 'revision');
    return response;
  }

  async function completeCurrent(
    state: Awaited<ReturnType<typeof createActiveAdministration>>,
    step: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response =
      step.advanceBy === 'patient'
        ? await state.patientAgent
            .post('/patient-administration/current/complete')
            .send({ expectedRevision: state.revision })
            .expect(200)
        : await staff
            .post(`${state.base}/current/complete`)
            .send({
              expectedRevision: state.revision,
              staffObservation: `C1 observed step ${numberOf(step, 'order')}`,
            })
            .expect(200);
    const body = bodyOf(response);
    state.revision = numberOf(body, 'revision');
    return body;
  }

  async function advanceWithEvidence(
    state: Awaited<ReturnType<typeof createActiveAdministration>>,
    expectedOrder: number,
  ): Promise<void> {
    const step = await currentStep(state, expectedOrder);
    await playCurrentAudio(state, step);
    const responseMode = stringOf(step, 'responseMode');
    if (responseMode !== 'staff_observation') {
      await uploadEvidence(
        state,
        responseMode === 'speech'
          ? 'audio'
          : responseMode === 'writing'
            ? 'handwriting'
            : 'photo',
      );
    }
    await completeCurrent(state, step);
  }

  it('persists safe evidence, isolates redo runs, and adopts only a valid completed run without copying data', async () => {
    const state = await createActiveAdministration('MAIN');
    const scaleBefore = jsonSnapshot(
      await scaleInstanceModel.findById(state.scaleInstanceId).lean().exec(),
    );
    const itemsBefore = jsonSnapshot(
      await itemResponseModel
        .find({ scaleInstanceId: new Types.ObjectId(state.scaleInstanceId) })
        .sort({ itemOrder: 1 })
        .lean()
        .exec(),
    );
    const first = await currentStep(state, 1);
    await state.patientAgent
      .post('/patient-administration/current/complete')
      .send({ expectedRevision: state.revision })
      .expect(409);

    const objectCountBefore = trackingStorage.objects.size;
    await state.patientAgent
      .post('/patient-administration/current/evidence')
      .field('expectedRevision', state.revision.toString())
      .field('evidenceType', 'audio')
      .field('stepKey', 'forged-step')
      .field('itemResponseId', new Types.ObjectId().toString())
      .attach('file', WEBM, {
        filename: 'forged-private-name.webm',
        contentType: 'audio/webm',
      })
      .expect(400);
    await state.patientAgent
      .post('/patient-administration/current/evidence')
      .field('expectedRevision', state.revision.toString())
      .field('evidenceType', 'audio')
      .attach('file', Buffer.from('OggS-invalid-for-webm', 'ascii'), {
        filename: 'spoofed.webm',
        contentType: 'audio/webm',
      })
      .expect(400)
      .expect((response: Response) => {
        expect(bodyOf(response)).toEqual(
          expect.objectContaining({ code: 'MEDIA_FILE_SIGNATURE_INVALID' }),
        );
      });
    expect(trackingStorage.objects.size).toBe(objectCountBefore);
    expect(
      await mediaEvidenceModel.countDocuments({
        scaleInstanceId: new Types.ObjectId(state.scaleInstanceId),
      }),
    ).toBe(0);
    expect(
      (await administrationSessionModel.findById(state.sessionId).lean().exec())
        ?.stepEvidenceRefs,
    ).toEqual([]);

    const revisionBeforeUpload = state.revision;
    const uploadResponse = await uploadEvidence(state, 'audio');
    const uploadBody = bodyOf(uploadResponse);
    expect(Object.keys(uploadBody).sort()).toEqual([
      'evidenceType',
      'mediaEvidenceId',
      'revision',
      'uploadedAt',
    ]);
    expect(stringOf(uploadBody, 'evidenceType')).toBe('audio');
    expect(state.revision).toBe(revisionBeforeUpload + 1);

    const evidence = await mediaEvidenceModel
      .findById(stringOf(uploadBody, 'mediaEvidenceId'))
      .lean()
      .exec();
    expect(evidence).toEqual(
      expect.objectContaining({
        patientId: new Types.ObjectId(state.patientId),
        assessmentVisitId: new Types.ObjectId(state.visitId),
        scaleInstanceId: new Types.ObjectId(state.scaleInstanceId),
        evidenceType: 'audio',
        captureMode: 'browser_audio_recording',
        status: 'attached',
        storageStatus: 'stored',
        audioMetadata: { durationMs: 1800 },
        imageMetadata: null,
        operatorSnapshot: null,
      }),
    );
    expect(evidence?.patientAdministrationContext).toEqual({
      sessionId: new Types.ObjectId(state.sessionId),
      stepKey: stringOf(first, 'stepKey'),
      stepRun: 1,
    });
    expect(evidence?.storage?.originalFilename).toBeUndefined();
    expect(JSON.stringify(evidence)).not.toMatch(
      /patient-session-token-hash|patient-private-name-must-not-leak/i,
    );
    const storedSession = await administrationSessionModel
      .findById(state.sessionId)
      .lean()
      .exec();
    expect(storedSession?.revision).toBe(state.revision);
    expect(storedSession?.stepEvidenceRefs).toEqual([
      expect.objectContaining({
        stepKey: stringOf(first, 'stepKey'),
        stepRun: 1,
        evidenceType: 'audio',
        mediaEvidenceId: evidence?._id,
      }),
    ]);
    expect(
      jsonSnapshot(
        await itemResponseModel
          .find({ scaleInstanceId: new Types.ObjectId(state.scaleInstanceId) })
          .sort({ itemOrder: 1 })
          .lean()
          .exec(),
      ),
    ).toEqual(itemsBefore);

    await state.patientAgent
      .post('/patient-administration/current/evidence')
      .field('expectedRevision', state.revision.toString())
      .field('evidenceType', 'audio')
      .attach('file', WEBM, {
        filename: 'duplicate.webm',
        contentType: 'audio/webm',
      })
      .expect(409);
    expect(
      await mediaEvidenceModel.countDocuments({
        scaleInstanceId: new Types.ObjectId(state.scaleInstanceId),
      }),
    ).toBe(1);

    await state.patientAgent
      .post('/patient-administration/current/complete')
      .send({ expectedRevision: revisionBeforeUpload })
      .expect(409);
    await state.patientAgent
      .post('/patient-administration/current/complete')
      .send({ expectedRevision: state.revision })
      .expect(409);
    await playCurrentAudio(state, first);
    await completeCurrent(state, first);

    for (let order = 2; order <= 15; order += 1) {
      await advanceWithEvidence(state, order);
    }

    const observation16 = await currentStep(state, 16);
    expect(stringOf(observation16, 'responseMode')).toBe('staff_observation');
    const beforeObservationObjects = trackingStorage.objects.size;
    await state.patientAgent
      .post('/patient-administration/current/evidence')
      .field('expectedRevision', state.revision.toString())
      .field('evidenceType', 'audio')
      .attach('file', WEBM, {
        filename: 'observation.webm',
        contentType: 'audio/webm',
      })
      .expect(403)
      .expect((response: Response) => {
        expect(bodyOf(response)).toEqual(
          expect.objectContaining({
            code: 'PATIENT_ADMINISTRATION_EVIDENCE_NOT_ALLOWED',
          }),
        );
      });
    expect(trackingStorage.objects.size).toBe(beforeObservationObjects);
    await completeCurrent(state, observation16);
    await advanceWithEvidence(state, 17);

    const writingRunOne = await currentStep(state, 18);
    expect(stringOf(writingRunOne, 'responseMode')).toBe('writing');
    await playCurrentAudio(state, writingRunOne);
    await uploadEvidence(state, 'handwriting');
    await completeCurrent(state, writingRunOne);

    await currentStep(state, 19);
    const pausedForRedo = await staff
      .post(`${state.base}/pause`)
      .send({ expectedRevision: state.revision, reason: 'C1 redo isolation' })
      .expect(200);
    state.revision = numberOf(bodyOf(pausedForRedo), 'revision');
    const redone = await staff
      .post(`${state.base}/redo-last`)
      .send({
        expectedRevision: state.revision,
        reason: 'C1 verify old evidence isolation',
      })
      .expect(200);
    state.revision = numberOf(bodyOf(redone), 'revision');
    const resumedForRedo = await staff
      .post(`${state.base}/resume`)
      .send({ expectedRevision: state.revision, reason: 'C1 redo ready' })
      .expect(200);
    state.revision = numberOf(bodyOf(resumedForRedo), 'revision');
    const writingRunTwo = await currentStep(state, 18);
    await playCurrentAudio(state, writingRunTwo);
    await state.patientAgent
      .post('/patient-administration/current/complete')
      .send({ expectedRevision: state.revision })
      .expect(409);
    const refsAfterRedo = (
      await administrationSessionModel.findById(state.sessionId).lean().exec()
    )?.stepEvidenceRefs.filter(
      (reference) => reference.stepKey === stringOf(writingRunTwo, 'stepKey'),
    );
    expect(refsAfterRedo).toEqual([
      expect.objectContaining({ stepRun: 1, evidenceType: 'handwriting' }),
    ]);

    const pausedForTakeover = await staff
      .post(`${state.base}/pause`)
      .send({ expectedRevision: state.revision, reason: 'C1 takeover path' })
      .expect(200);
    state.revision = numberOf(bodyOf(pausedForTakeover), 'revision');
    const takeover = await staff
      .post(`${state.base}/current/takeover`)
      .send({
        expectedRevision: state.revision,
        reason: 'C1 patient needs staff assistance',
        staffObservation: 'C1 staff captured the writing response',
      })
      .expect(200);
    state.revision = numberOf(bodyOf(takeover), 'revision');
    const resumedAfterTakeover = await staff
      .post(`${state.base}/resume`)
      .send({ expectedRevision: state.revision, reason: 'C1 final drawing' })
      .expect(200);
    state.revision = numberOf(bodyOf(resumedAfterTakeover), 'revision');

    const drawing = await currentStep(state, 19);
    expect(stringOf(drawing, 'responseMode')).toBe('drawing');
    await playCurrentAudio(state, drawing);
    await uploadEvidence(state, 'photo');
    const completed = await completeCurrent(state, drawing);
    expect(completed).toEqual(
      expect.objectContaining({ status: 'completed', currentStep: null }),
    );

    expect(
      jsonSnapshot(
        await scaleInstanceModel.findById(state.scaleInstanceId).lean().exec(),
      ),
    ).toEqual(scaleBefore);
    expect(
      jsonSnapshot(
        await itemResponseModel
          .find({ scaleInstanceId: new Types.ObjectId(state.scaleInstanceId) })
          .sort({ itemOrder: 1 })
          .lean()
          .exec(),
      ),
    ).toEqual(itemsBefore);

    const completedSession = await administrationSessionModel
      .findById(state.sessionId)
      .lean()
      .exec();
    expect(completedSession?.status).toBe('completed');
    const drawingEvidence = await mediaEvidenceModel
      .findOne({
        scaleInstanceId: new Types.ObjectId(state.scaleInstanceId),
        evidenceType: 'photo',
        'patientAdministrationContext.stepKey': 'mmse-drawing',
        'patientAdministrationContext.stepRun': 1,
      })
      .lean()
      .exec();
    const invalidatedWritingEvidence = await mediaEvidenceModel
      .findOne({
        scaleInstanceId: new Types.ObjectId(state.scaleInstanceId),
        evidenceType: 'handwriting',
        'patientAdministrationContext.stepKey': 'mmse-expression',
        'patientAdministrationContext.stepRun': 1,
      })
      .lean()
      .exec();
    if (!drawingEvidence || !invalidatedWritingEvidence) {
      throw new Error('Expected drawing and invalidated writing evidence');
    }
    const drawingItemId = drawingEvidence.itemResponseId.toString();
    const writingItemId = invalidatedWritingEvidence.itemResponseId.toString();
    const drawingItemBefore = await itemResponseModel
      .findById(drawingItemId)
      .lean()
      .exec();
    const writingRefsBefore = jsonSnapshot(
      (await itemResponseModel.findById(writingItemId).lean().exec())
        ?.evidenceRefs,
    );
    if (!drawingItemBefore) {
      throw new Error('Expected drawing item response');
    }
    const formalAnswerBeforeAdoption = jsonSnapshot({
      status: drawingItemBefore.status,
      rawResponse: drawingItemBefore.rawResponse,
      structuredResponse: drawingItemBefore.structuredResponse,
      responseText: drawingItemBefore.responseText,
      operatorNote: drawingItemBefore.operatorNote,
      score: drawingItemBefore.score,
      draftRevision: drawingItemBefore.draftRevision,
      draftSavedAt: drawingItemBefore.draftSavedAt,
    });
    const readinessPath = `/patients/${state.patientId}/visits/${state.visitId}/scale-instances/${state.scaleInstanceId}/submission-readiness`;
    const readinessBefore = bodyOf(await staff.get(readinessPath).expect(200));
    expect(
      arrayOf(readinessBefore, 'blockingIssues').some(
        (issue) =>
          isRecord(issue) &&
          issue.code === 'ITEM_REQUIRED_MEDIA_MISSING' &&
          issue.itemCode === 'mmse.visuospatial.copy_drawing',
      ),
    ).toBe(true);

    const evidenceCountBeforeAdoption = await mediaEvidenceModel.countDocuments(
      {
        scaleInstanceId: new Types.ObjectId(state.scaleInstanceId),
      },
    );
    const storageBeforeAdoption = {
      uploaded: trackingStorage.uploadedKeys.length,
      copied: trackingStorage.copiedKeys.length,
      deleted: trackingStorage.deletedKeys.length,
      objects: trackingStorage.objects.size,
    };
    const adoptPath = `/patients/${state.patientId}/visits/${state.visitId}/scale-instances/${state.scaleInstanceId}/item-responses/${drawingItemId}/media-evidences/${drawingEvidence._id.toString()}/adopt`;
    const adopted = bodyOf(await staff.post(adoptPath).expect(200));
    expect(adopted.evidenceRequirement).toEqual({
      evidenceType: 'photo',
      status: 'attached',
      attached: true,
    });
    const adoptedMediaEvidence = adopted.mediaEvidence;
    if (!isRecord(adoptedMediaEvidence)) {
      throw new Error('Expected adopted media evidence response');
    }
    expect(adoptedMediaEvidence.id).toBe(drawingEvidence._id.toString());
    for (const protectedKey of [
      'patientId',
      'visitId',
      'scaleInstanceId',
      'itemResponseId',
      'sessionId',
      'stepKey',
      'stepRun',
      'objectKey',
      'bucket',
      'checksum',
    ]) {
      expect(adoptedMediaEvidence).not.toHaveProperty(protectedKey);
    }

    const drawingItemAfter = await itemResponseModel
      .findById(drawingItemId)
      .lean()
      .exec();
    expect(
      drawingItemAfter?.evidenceRefs.find(
        (reference) => reference.evidenceType === 'photo',
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'attached',
        mediaEvidenceId: drawingEvidence._id,
      }),
    );
    expect(
      jsonSnapshot({
        status: drawingItemAfter?.status,
        rawResponse: drawingItemAfter?.rawResponse,
        structuredResponse: drawingItemAfter?.structuredResponse,
        responseText: drawingItemAfter?.responseText,
        operatorNote: drawingItemAfter?.operatorNote,
        score: drawingItemAfter?.score,
        draftRevision: drawingItemAfter?.draftRevision,
        draftSavedAt: drawingItemAfter?.draftSavedAt,
      }),
    ).toEqual(formalAnswerBeforeAdoption);
    expect(
      await mediaEvidenceModel.countDocuments({
        scaleInstanceId: new Types.ObjectId(state.scaleInstanceId),
      }),
    ).toBe(evidenceCountBeforeAdoption);
    expect({
      uploaded: trackingStorage.uploadedKeys.length,
      copied: trackingStorage.copiedKeys.length,
      deleted: trackingStorage.deletedKeys.length,
      objects: trackingStorage.objects.size,
    }).toEqual(storageBeforeAdoption);

    const readinessAfter = bodyOf(await staff.get(readinessPath).expect(200));
    expect(
      arrayOf(readinessAfter, 'blockingIssues').some(
        (issue) =>
          isRecord(issue) &&
          issue.code === 'ITEM_REQUIRED_MEDIA_MISSING' &&
          issue.itemCode === 'mmse.visuospatial.copy_drawing',
      ),
    ).toBe(false);
    await staff
      .post(adoptPath)
      .expect(409)
      .expect((response: Response) => {
        expect(bodyOf(response)).toEqual(
          expect.objectContaining({ code: 'MEDIA_EVIDENCE_ALREADY_ATTACHED' }),
        );
      });

    const invalidatedAdoptPath = `/patients/${state.patientId}/visits/${state.visitId}/scale-instances/${state.scaleInstanceId}/item-responses/${writingItemId}/media-evidences/${invalidatedWritingEvidence._id.toString()}/adopt`;
    await staff
      .post(invalidatedAdoptPath)
      .expect(409)
      .expect((response: Response) => {
        expect(bodyOf(response)).toEqual(
          expect.objectContaining({ code: 'MEDIA_EVIDENCE_NOT_ADOPTABLE' }),
        );
      });
    expect(
      jsonSnapshot(
        (await itemResponseModel.findById(writingItemId).lean().exec())
          ?.evidenceRefs,
      ),
    ).toEqual(writingRefsBefore);
    expect({
      uploaded: trackingStorage.uploadedKeys.length,
      copied: trackingStorage.copiedKeys.length,
      deleted: trackingStorage.deletedKeys.length,
      objects: trackingStorage.objects.size,
    }).toEqual(storageBeforeAdoption);
  });

  it('allows at most one concurrent upload and compensates the losing evidence and object', async () => {
    const state = await createActiveAdministration('CONCURRENT');
    const batch = trackingStorage.blockNextUploads(2);
    const revision = state.revision;
    const uploads = [1, 2].map((ordinal) =>
      request(httpServer)
        .post('/patient-administration/current/evidence')
        .set('Cookie', state.patientCookie)
        .field('expectedRevision', revision.toString())
        .field('evidenceType', 'audio')
        .attach('file', WEBM, {
          filename: `concurrent-${ordinal}.webm`,
          contentType: 'audio/webm',
        })
        .then((response) => response),
    );
    try {
      await within(batch.allStarted, 5000);
    } finally {
      batch.release();
    }
    const responses = await Promise.all(uploads);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const storedSession = await administrationSessionModel
      .findById(state.sessionId)
      .lean()
      .exec();
    expect(storedSession?.stepEvidenceRefs).toHaveLength(1);
    expect(
      await mediaEvidenceModel.countDocuments({
        scaleInstanceId: new Types.ObjectId(state.scaleInstanceId),
      }),
    ).toBe(1);
    const instanceEvidence = await mediaEvidenceModel
      .findOne({ scaleInstanceId: new Types.ObjectId(state.scaleInstanceId) })
      .lean()
      .exec();
    const ownedObjectKeys = trackingStorage.uploadedKeys.filter((key) =>
      key.includes(state.scaleInstanceId),
    );
    expect(ownedObjectKeys).toHaveLength(2);
    expect(
      ownedObjectKeys.filter((key) => trackingStorage.objects.has(key)),
    ).toEqual([instanceEvidence?.storage?.objectKey]);
    expect(
      ownedObjectKeys.filter((key) =>
        trackingStorage.deletedKeys.includes(key),
      ),
    ).toHaveLength(1);
  });

  it('compensates its exact evidence and object when pause wins the revision CAS', async () => {
    const state = await createActiveAdministration('PAUSE');
    const batch = trackingStorage.blockNextUploads(1);
    const upload = state.patientAgent
      .post('/patient-administration/current/evidence')
      .field('expectedRevision', state.revision.toString())
      .field('evidenceType', 'audio')
      .attach('file', WEBM, {
        filename: 'pause-race.webm',
        contentType: 'audio/webm',
      })
      .then((response) => response);
    try {
      await within(batch.allStarted, 5000);
    } catch (error: unknown) {
      batch.release();
      throw error;
    }
    const ownedObjectKeys = trackingStorage.uploadedKeys.filter((key) =>
      key.includes(state.scaleInstanceId),
    );
    expect(ownedObjectKeys).toHaveLength(1);
    const paused = await staff
      .post(`${state.base}/pause`)
      .send({
        expectedRevision: state.revision,
        reason: 'C1 upload pause race',
      })
      .expect(200);
    state.revision = numberOf(bodyOf(paused), 'revision');
    batch.release();
    const uploadResponse = await upload;
    expect(uploadResponse.status).toBe(409);

    expect(trackingStorage.objects.has(ownedObjectKeys[0])).toBe(false);
    expect(trackingStorage.deletedKeys).toContain(ownedObjectKeys[0]);
    expect(
      await mediaEvidenceModel.countDocuments({
        scaleInstanceId: new Types.ObjectId(state.scaleInstanceId),
      }),
    ).toBe(0);
    const storedSession = await administrationSessionModel
      .findById(state.sessionId)
      .lean()
      .exec();
    expect(storedSession).toEqual(
      expect.objectContaining({ status: 'paused', revision: state.revision }),
    );
    expect(storedSession?.stepEvidenceRefs).toEqual([]);
  });
});
