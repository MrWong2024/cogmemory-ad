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
  PatientAudioAsrClientService,
  PatientAudioAsrError,
} from '../src/modules/media/services/patient-audio-asr-client.service';
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

const ACCOUNT_NAME = 'doctor-c2-review-transcription';
const PASSWORD = 'C2-Review-Transcription-Password!';
const SUBJECT_PREFIX = 'SUBJ-C2-REVIEW-ASR-';
const VISIT_PREFIX = 'VISIT-C2-REVIEW-ASR-';
const CASES = ['MAIN', 'CONCURRENT', 'FAILURE', 'DURATION'] as const;
const SUBJECT_CODES = CASES.map((suffix) => `${SUBJECT_PREFIX}${suffix}`);
const VISIT_CODES = CASES.map((suffix) => `${VISIT_PREFIX}${suffix}`);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;
type TestAgent = ReturnType<typeof request.agent>;

class EmptyFakeStorageService implements StorageService {
  readonly driver = 'fake' as const;
  readonly objects = new Map<string, Buffer>();
  readonly ownedKeys = new Set<string>();

  uploadFile(input: UploadFileInput): Promise<UploadedFileResult> {
    this.objects.set(input.objectKey, Buffer.from(input.buffer));
    this.ownedKeys.add(input.objectKey);
    return Promise.resolve({
      objectKey: input.objectKey,
      bucket: 'c2-fake-storage',
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
    });
  }

  getSignedUrl(
    objectKey: string,
    options: SignedUrlOptions,
  ): Promise<SignedUrlResult> {
    if (!this.objects.has(objectKey)) {
      return Promise.reject(new Error('C2 fake object is unavailable'));
    }
    return Promise.resolve({
      url: `https://fake.invalid/${encodeURIComponent(objectKey)}`,
      expiresAt: new Date(Date.now() + options.expiresInSeconds * 1000),
    });
  }

  deleteObject(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
    this.ownedKeys.delete(objectKey);
    return Promise.resolve();
  }
}

class ControlledStubAsrClient {
  calls = 0;
  private nextFailure = false;
  private block: { started: () => void; release: Promise<void> } | undefined;

  getMode() {
    return {
      provider: 'stub' as const,
      model: 'qwen-audio-3.0-asr-flash',
      timeoutMs: 90000,
    };
  }

  failNext(): void {
    this.nextFailure = true;
  }

  blockNext(): { started: Promise<void>; release(): void } {
    let startedResolve = (): void => undefined;
    let releaseResolve = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    this.block = { started: startedResolve, release };
    return { started, release: releaseResolve };
  }

  async transcribe() {
    this.calls += 1;
    const block = this.block;
    if (block) {
      this.block = undefined;
      block.started();
      await block.release;
    }
    if (this.nextFailure) {
      this.nextFailure = false;
      throw new PatientAudioAsrError('provider_unavailable');
    }
    return {
      provider: 'stub' as const,
      model: 'qwen-audio-3.0-asr-flash',
      text: '测试转写候选',
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bodyOf(response: Response): Record<string, unknown> {
  if (!isRecord(response.body)) {
    throw new Error('Expected response body object');
  }
  return response.body;
}

function stringOf(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string') {
    throw new Error(`Expected ${key} string`);
  }
  return result;
}

function numberOf(value: Record<string, unknown>, key: string): number {
  const result = value[key];
  if (typeof result !== 'number') {
    throw new Error(`Expected ${key} number`);
  }
  return result;
}

function jsonSnapshot(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe('patient administration review and transcription APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let staff: TestAgent;
  let httpServer: SupertestApp;
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
  let ownsDefinition = false;
  let ownsVersion = false;
  let previousCurrentVersionId: Types.ObjectId | null = null;
  let modelsReady = false;
  const storage = new EmptyFakeStorageService();
  const asr = new ControlledStubAsrClient();
  const ownedUserIds = new Set<string>();
  const ownedScaleInstanceIds = new Set<string>();

  async function cleanupOwnedData(): Promise<void> {
    const users = await userModel
      .find({ accountName: ACCOUNT_NAME })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length) {
      await authSessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }
    const patients = await patientModel
      .find({ subjectCode: { $in: SUBJECT_CODES } })
      .select({ _id: 1 })
      .exec();
    const patientIds = patients.map((patient) => patient._id);
    if (patientIds.length) {
      const instances = await scaleInstanceModel
        .find({ patientId: { $in: patientIds } })
        .select({ _id: 1 })
        .exec();
      const instanceIds = instances.map((instance) => instance._id);
      if (instanceIds.length) {
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
      authSessionModel.countDocuments({ userId: { $in: userIds } }),
      patientModel.countDocuments({ subjectCode: { $in: SUBJECT_CODES } }),
      visitModel.countDocuments({ visitCode: { $in: VISIT_CODES } }),
      scaleInstanceModel.countDocuments({ _id: { $in: instanceIds } }),
      itemResponseModel.countDocuments({
        scaleInstanceId: { $in: instanceIds },
      }),
      mediaEvidenceModel.countDocuments({
        scaleInstanceId: { $in: instanceIds },
      }),
      administrationSessionModel.countDocuments({
        scaleInstanceId: { $in: instanceIds },
      }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(storage.objects.size).toBe(0);
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error('C2 E2E requires NODE_ENV=test and standard_test');
    }

    const mmseSeed = new ScaleSeedDataService().getScaleSeedByCode('mmse');
    const patientSteps = mmseSeed?.version.patientAdministrationSteps;
    if (!mmseSeed || !patientSteps?.length) {
      throw new Error('Expected MMSE patient administration seed');
    }
    const stubAssets = patientSteps.flatMap((step) =>
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
          size: Buffer.byteLength(`C2-ASSET:${assetKey}`),
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
          reviewedBy: 'C2 E2E in-memory stub',
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
            throw new Error(`Unexpected C2 E2E asset ${assetKey}`);
          }
          const buffer = Buffer.from(`C2-ASSET:${assetKey}`);
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
      .overrideProvider(PatientAudioAsrClientService)
      .useValue(asr)
      .overrideProvider(STORAGE_SERVICE)
      .useValue(storage)
      .overrideProvider(PresentationAssetsService)
      .useValue(presentationAssetsStub)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    connection = app.get(getConnectionToken());
    const config = app.get(ConfigService);
    if (
      connection.name !== 'cogmemory_ad_test' ||
      config.get<string>('app.env') !== 'test' ||
      config.get<string>('mongo.purpose') !== 'standard_test' ||
      config.get<string>('storage.driver') !== 'fake' ||
      config.get<string>('asr.provider') !== 'stub'
    ) {
      throw new Error('C2 E2E isolation is not active');
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
      previousCurrentVersionId = existingDefinition.currentVersionId ?? null;
    } else {
      mmseDefinition = await scaleDefinitionModel.create({
        ...mmseSeed.definition,
        currentVersionId: null,
      });
      ownsDefinition = true;
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
      ownsVersion = true;
      await scaleDefinitionModel
        .updateOne(
          { _id: mmseDefinition._id },
          { $set: { currentVersionId: mmseVersion._id } },
        )
        .exec();
    }

    const user = await userModel.create({
      accountName: ACCOUNT_NAME,
      displayName: 'C2 Review Doctor',
      staffCode: 'STAFF-C2-REVIEW-ASR',
      passwordHash: await authService.hashPassword(PASSWORD),
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    ownedUserIds.add(user._id.toString());
    httpServer = requireInitialized(
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
      for (const objectKey of [...storage.ownedKeys]) {
        await storage.deleteObject(objectKey);
      }
      await assertNoOwnedData();
      if (ownsVersion) {
        await scaleDefinitionModel
          .updateOne(
            { _id: mmseDefinition._id },
            previousCurrentVersionId
              ? { $set: { currentVersionId: previousCurrentVersionId } }
              : { $unset: { currentVersionId: 1 } },
          )
          .exec();
        await scaleVersionModel.deleteOne({ _id: mmseVersion._id }).exec();
      }
      if (ownsDefinition) {
        await scaleDefinitionModel
          .deleteOne({ _id: mmseDefinition._id })
          .exec();
      }
    }
    await app.close();
  });

  async function createUploadedFixture() {
    const suffix = 'MAIN';
    const subjectCode = `${SUBJECT_PREFIX}${suffix}`;
    const visitCode = `${VISIT_PREFIX}${suffix}`;
    const patient = await patientModel.create({
      subjectCode,
      displayName: 'De-identified C2 MAIN',
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['c2-review-asr'],
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
    const initialized = bodyOf(initialization).scaleInstance;
    if (!isRecord(initialized)) {
      throw new Error('Expected initialized scale instance');
    }
    const scaleInstanceId = stringOf(initialized, 'id');
    ownedScaleInstanceIds.add(scaleInstanceId);
    const administrationBase = `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances/${scaleInstanceId}/patient-administration`;
    const created = await staff.post(administrationBase).send({}).expect(201);
    const createdBody = bodyOf(created);
    const patientAgent = request.agent(httpServer);
    await patientAgent
      .post('/patient-administration/enter')
      .send({ code: stringOf(createdBody, 'entryCode') })
      .expect(200);
    const confirmed = await staff
      .post(`${administrationBase}/preparation/confirm`)
      .send({
        expectedRevision: 1,
        impactFactorCodes: ['sensory'],
        impactFactorNote: 'de-identified factor note',
      })
      .expect(200);
    let revision = numberOf(bodyOf(confirmed), 'revision');
    const current = await patientAgent
      .get('/patient-administration/current')
      .expect(200);
    const currentStep = bodyOf(current).currentStep;
    if (!isRecord(currentStep) || currentStep.responseMode !== 'speech') {
      throw new Error('Expected first C2 MMSE speech step');
    }
    const assets = currentStep.assets;
    if (!Array.isArray(assets)) {
      throw new Error('Expected current step assets');
    }
    for (const asset of assets) {
      if (!isRecord(asset) || asset.kind !== 'audio') {
        continue;
      }
      const played = await patientAgent
        .post(
          `/patient-administration/current/audio/${stringOf(asset, 'assetKey')}/play`,
        )
        .send({ expectedRevision: revision })
        .expect(200);
      revision = Number(played.headers['x-patient-administration-revision']);
    }
    const uploaded = await patientAgent
      .post('/patient-administration/current/evidence')
      .field('expectedRevision', revision.toString())
      .field('evidenceType', 'audio')
      .field('durationMs', '1800')
      .attach('file', WEBM, {
        filename: 'private-patient-name-must-not-leak.webm',
        contentType: 'audio/webm',
      })
      .expect(201);
    const uploadedBody = bodyOf(uploaded);
    revision = numberOf(uploadedBody, 'revision');
    const mediaEvidenceId = stringOf(uploadedBody, 'mediaEvidenceId');
    const advanceBy = currentStep.advanceBy;
    const completed =
      advanceBy === 'patient'
        ? await patientAgent
            .post('/patient-administration/current/complete')
            .send({ expectedRevision: revision })
            .expect(200)
        : await staff
            .post(`${administrationBase}/current/complete`)
            .send({
              expectedRevision: revision,
              staffObservation: 'initial observed response',
            })
            .expect(200);
    revision = numberOf(bodyOf(completed), 'revision');
    const paused = await staff
      .post(`${administrationBase}/pause`)
      .send({ expectedRevision: revision, reason: 'short break' })
      .expect(200);
    revision = numberOf(bodyOf(paused), 'revision');
    const redone = await staff
      .post(`${administrationBase}/redo-last`)
      .send({ expectedRevision: revision, reason: 'repeat requested' })
      .expect(200);
    revision = numberOf(bodyOf(redone), 'revision');
    await staff
      .post(`${administrationBase}/current/takeover`)
      .send({
        expectedRevision: revision,
        reason: 'manual fallback',
        staffObservation: 'manual observation',
      })
      .expect(200);

    const audio = await mediaEvidenceModel.findById(mediaEvidenceId).exec();
    const itemResponse = audio
      ? await itemResponseModel.findById(audio.itemResponseId).exec()
      : null;
    const scaleInstance = await scaleInstanceModel
      .findById(scaleInstanceId)
      .exec();
    const administration = await administrationSessionModel
      .findById(stringOf(createdBody, 'id'))
      .exec();
    if (!audio || !itemResponse || !scaleInstance || !administration) {
      throw new Error('Expected uploaded C2 facts');
    }
    const itemBase = `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances/${scaleInstanceId}/item-responses/${itemResponse._id.toString()}/media-evidences`;
    return {
      patient,
      visit,
      scaleInstance,
      itemResponse,
      administration,
      audio,
      itemBase,
      reviewUrl: `${administrationBase}/review`,
      transcribeUrl: `${itemBase}/${audio._id.toString()}/transcribe`,
    };
  }

  async function createFixture(
    suffix: (typeof CASES)[number],
    durationMs: number | null = 1800,
  ) {
    const subjectCode = `${SUBJECT_PREFIX}${suffix}`;
    const visitCode = `${VISIT_PREFIX}${suffix}`;
    const patient = await patientModel.create({
      subjectCode,
      displayName: `De-identified C2 ${suffix}`,
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['c2-review-asr'],
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
    const initialized = bodyOf(initialization).scaleInstance;
    if (!isRecord(initialized)) {
      throw new Error('Expected initialized scale instance');
    }
    const scaleInstanceId = stringOf(initialized, 'id');
    ownedScaleInstanceIds.add(scaleInstanceId);
    const firstStep = [...(mmseVersion.patientAdministrationSteps ?? [])].sort(
      (left, right) => left.order - right.order,
    )[0];
    if (!firstStep) {
      throw new Error('Expected first MMSE patient step');
    }
    const itemResponse = await itemResponseModel
      .findOne({ scaleInstanceId, itemCode: firstStep.itemCode })
      .exec();
    const scaleInstance = await scaleInstanceModel
      .findById(scaleInstanceId)
      .exec();
    if (!itemResponse || !scaleInstance) {
      throw new Error('Expected initialized C2 assessment facts');
    }
    const actor = {
      operatorId: new Types.ObjectId([...ownedUserIds][0]),
      operatorName: 'C2 Review Doctor',
      operatorRole: 'doctor' as const,
    };
    const now = new Date('2026-08-06T02:00:00.000Z');
    const administration = await administrationSessionModel.create({
      scaleInstanceId: scaleInstance._id,
      status: 'active',
      currentStepKey: firstStep.stepKey,
      revision: 7,
      expiresAt: new Date('2026-08-06T04:00:00.000Z'),
      preparationConfirmedAt: now,
      preparationConfirmedBy: actor,
      impactFactorCodes: ['sensory'],
      impactFactorNote: 'de-identified factor note',
      createdBy: actor,
      startedAt: now,
      controlEvents: [
        { action: 'entry_redeemed', occurredAt: now },
        {
          action: 'paused',
          occurredAt: new Date(now.getTime() + 1000),
          reason: 'short break',
          operatorSnapshot: actor,
        },
        {
          action: 'staff_takeover',
          occurredAt: new Date(now.getTime() + 2000),
          reason: 'manual fallback',
          operatorSnapshot: actor,
        },
        {
          action: 'step_redo',
          occurredAt: new Date(now.getTime() + 3000),
          reason: 'repeat requested',
          operatorSnapshot: actor,
        },
      ],
      stepCaptures: [
        {
          stepKey: firstStep.stepKey,
          stepRun: 1,
          capturedBy: 'patient',
          capturedAt: now,
          invalidatedAt: new Date(now.getTime() + 3000),
          invalidatedReason: 'repeat requested',
        },
        {
          stepKey: firstStep.stepKey,
          stepRun: 2,
          capturedBy: 'staff',
          staffObservation: 'manual observation',
          capturedAt: new Date(now.getTime() + 4000),
          operatorSnapshot: actor,
        },
      ],
      playbackFacts: [],
      stepEvidenceRefs: [],
    });
    const audioObjectKey = `c2/${suffix.toLowerCase()}/audio.webm`;
    storage.objects.set(audioObjectKey, WEBM);
    storage.ownedKeys.add(audioObjectKey);
    const audio = await mediaEvidenceModel.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      scaleInstanceId: scaleInstance._id,
      itemResponseId: itemResponse._id,
      subjectCode,
      scaleDefinitionId: scaleInstance.scaleDefinitionId,
      scaleVersionId: scaleInstance.scaleVersionId,
      scaleCode: scaleInstance.scaleCode,
      scaleVersion: scaleInstance.scaleVersion,
      instanceCode: scaleInstance.instanceCode,
      itemCode: itemResponse.itemCode,
      evidenceCode: `EVD-C2-${suffix}-AUDIO`,
      evidenceType: 'audio',
      captureMode: 'browser_audio_recording',
      status: 'attached',
      storageStatus: 'stored',
      countsTowardTotal: itemResponse.countsTowardTotal,
      cognitiveDomainCodes: [...itemResponse.cognitiveDomainCodes],
      itemSnapshot: null,
      versionTrace: null,
      storage: {
        storageDriver: 'fake',
        bucket: 'c2-fake-storage',
        objectKey: audioObjectKey,
        mimeType: 'audio/webm',
        fileExtension: 'webm',
        sizeBytes: 128,
        storedAt: now,
      },
      imageMetadata: null,
      handwritingTrace: null,
      captureContext: { uploadedAt: now, sourceApp: 'patient_administration' },
      operatorSnapshot: null,
      patientAdministrationContext: {
        sessionId: administration._id,
        stepKey: firstStep.stepKey,
        stepRun: 1,
      },
      audioMetadata: { durationMs },
      qualityStatus: 'unchecked',
      qualityHints: null,
      metadata: null,
      lockedAt: null,
      voidedAt: null,
      deletedAt: null,
    });
    await administrationSessionModel
      .updateOne(
        { _id: administration._id },
        {
          $set: {
            stepEvidenceRefs: [
              {
                stepKey: firstStep.stepKey,
                stepRun: 1,
                evidenceType: 'audio',
                mediaEvidenceId: audio._id,
                uploadedAt: now,
              },
            ],
          },
        },
      )
      .exec();
    const itemBase = `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances/${scaleInstanceId}/item-responses/${itemResponse._id.toString()}/media-evidences`;
    const reviewUrl = `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances/${scaleInstanceId}/patient-administration/review`;
    return {
      patient,
      visit,
      scaleInstance,
      itemResponse,
      administration,
      audio,
      itemBase,
      reviewUrl,
      transcribeUrl: `${itemBase}/${audio._id.toString()}/transcribe`,
    };
  }

  it('returns a safe review and media projection, then persists an idempotent candidate without changing formal facts', async () => {
    const fixture = await createUploadedFixture();
    const scaleBefore = jsonSnapshot(fixture.scaleInstance.toObject());
    const itemBefore = jsonSnapshot(fixture.itemResponse.toObject());
    const sessionBefore = jsonSnapshot(
      await administrationSessionModel
        .findById(fixture.administration._id)
        .lean()
        .exec(),
    );

    const review = await staff.get(fixture.reviewUrl).expect(200);
    const reviewBody = bodyOf(review);
    expect(reviewBody.session).toEqual(
      expect.objectContaining({
        status: 'paused',
        impactFactorCodes: ['sensory'],
      }),
    );
    const serializedReview = JSON.stringify(reviewBody);
    expect(serializedReview).toContain('repeat requested');
    expect(serializedReview).toContain('manual observation');
    expect(serializedReview).toContain('not_requested');
    for (const forbidden of [
      'sessionId',
      'entryCode',
      'expiresAt',
      'revision',
      'patientText',
      'assetKeys',
      'objectKey',
      'bucket',
      'checksum',
      'scoringRule',
      'scoreValue',
    ]) {
      expect(serializedReview).not.toContain(forbidden);
    }

    const mediaList = await staff.get(fixture.itemBase).expect(200);
    const serializedMedia = JSON.stringify(bodyOf(mediaList));
    expect(serializedMedia).toContain('not_requested');
    expect(serializedMedia).toContain('durationMs');
    expect(serializedMedia).not.toContain('objectKey');
    const access = await staff
      .get(`${fixture.itemBase}/${fixture.audio._id.toString()}/access-url`)
      .query({ asset: 'primary' })
      .expect(200);
    expect(bodyOf(access)).toEqual(
      expect.objectContaining({ asset: 'primary' }),
    );

    const callsBefore = asr.calls;
    await staff
      .post(fixture.transcribeUrl)
      .send({ signedUrl: 'https://forged.invalid/audio' })
      .expect(400);
    const first = await staff.post(fixture.transcribeUrl).expect(200);
    expect(Object.keys(bodyOf(first)).sort()).toEqual([
      'mediaEvidenceId',
      'transcription',
    ]);
    expect(bodyOf(first).transcription).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        text: '测试转写候选',
        provider: 'stub',
        model: 'qwen-audio-3.0-asr-flash',
      }),
    );
    await staff.post(fixture.transcribeUrl).expect(200);
    expect(asr.calls).toBe(callsBefore + 1);

    const persisted = await mediaEvidenceModel
      .findById(fixture.audio._id)
      .lean()
      .exec();
    expect(persisted?.transcription?.status).toBe('succeeded');
    expect(persisted?.transcription?.text).toBe('测试转写候选');
    expect(persisted?.transcription?.requestedBy?.operatorId).toEqual(
      new Types.ObjectId([...ownedUserIds][0]),
    );
    expect(persisted?.transcription?.requestedBy?.operatorName).toBe(
      'C2 Review Doctor',
    );
    expect(persisted?.transcription?.requestedBy?.operatorRole).toBe('doctor');
    expect(
      jsonSnapshot(
        await scaleInstanceModel
          .findById(fixture.scaleInstance._id)
          .lean()
          .exec(),
      ),
    ).toEqual(scaleBefore);
    expect(
      jsonSnapshot(
        await itemResponseModel
          .findById(fixture.itemResponse._id)
          .lean()
          .exec(),
      ),
    ).toEqual(itemBefore);
    expect(
      jsonSnapshot(
        await administrationSessionModel
          .findById(fixture.administration._id)
          .lean()
          .exec(),
      ),
    ).toEqual(sessionBefore);

    const manual = await staff
      .patch(
        `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/scale-instances/${fixture.scaleInstance._id.toString()}/item-responses/${fixture.itemResponse._id.toString()}`,
      )
      .send({
        expectedRevision: fixture.itemResponse.draftRevision ?? 0,
        responseText: '医生人工确认文本',
        markAsAnswered: true,
      })
      .expect(200);
    const manualItem = bodyOf(manual).itemResponse;
    expect(manualItem).toEqual(
      expect.objectContaining({
        status: 'answered',
        draftRevision: 1,
        responseText: '医生人工确认文本',
      }),
    );
    expect(JSON.stringify(manualItem)).not.toContain('测试转写候选');
  });

  it('allows only one concurrent claim and keeps the succeeded retry idempotent', async () => {
    const fixture = await createFixture('CONCURRENT', null);
    const gate = asr.blockNext();
    const callsBefore = asr.calls;
    const first = staff
      .post(fixture.transcribeUrl)
      .then((response) => response);
    await gate.started;
    await staff
      .post(fixture.transcribeUrl)
      .expect(409)
      .expect((response: Response) => {
        expect(bodyOf(response).code).toBe('MEDIA_TRANSCRIPTION_CONFLICT');
      });
    gate.release();
    expect((await first).status).toBe(200);
    await staff.post(fixture.transcribeUrl).expect(200);
    expect(asr.calls).toBe(callsBefore + 1);
  });

  it('persists a finite provider failure while leaving audio and formal facts usable', async () => {
    const fixture = await createFixture('FAILURE');
    const scaleBefore = jsonSnapshot(fixture.scaleInstance.toObject());
    const itemBefore = jsonSnapshot(fixture.itemResponse.toObject());
    const sessionBefore = jsonSnapshot(
      await administrationSessionModel
        .findById(fixture.administration._id)
        .lean()
        .exec(),
    );
    asr.failNext();
    const response = await staff.post(fixture.transcribeUrl).expect(200);
    expect(bodyOf(response).transcription).toEqual(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'provider_unavailable',
      }),
    );
    const persisted = await mediaEvidenceModel
      .findById(fixture.audio._id)
      .lean()
      .exec();
    expect(persisted).toEqual(
      expect.objectContaining({ status: 'attached', storageStatus: 'stored' }),
    );
    await staff
      .get(`${fixture.itemBase}/${fixture.audio._id.toString()}/access-url`)
      .query({ asset: 'primary' })
      .expect(200);
    await staff
      .post(fixture.transcribeUrl)
      .expect(200)
      .expect((retry: Response) => {
        expect(bodyOf(retry).transcription).toEqual(
          expect.objectContaining({ status: 'succeeded' }),
        );
      });
    expect(
      jsonSnapshot(
        await scaleInstanceModel
          .findById(fixture.scaleInstance._id)
          .lean()
          .exec(),
      ),
    ).toEqual(scaleBefore);
    expect(
      jsonSnapshot(
        await itemResponseModel
          .findById(fixture.itemResponse._id)
          .lean()
          .exec(),
      ),
    ).toEqual(itemBefore);
    expect(
      jsonSnapshot(
        await administrationSessionModel
          .findById(fixture.administration._id)
          .lean()
          .exec(),
      ),
    ).toEqual(sessionBefore);
  });

  it('rejects duration overflow and non-audio evidence without changing transcription state', async () => {
    const fixture = await createFixture('DURATION', 300001);
    const callsBefore = asr.calls;
    await staff
      .post(fixture.transcribeUrl)
      .expect(409)
      .expect((response: Response) => {
        expect(bodyOf(response).code).toBe('MEDIA_TRANSCRIPTION_NOT_ALLOWED');
      });
    const longAudio = await mediaEvidenceModel
      .findById(fixture.audio._id)
      .lean()
      .exec();
    expect(longAudio?.transcription).toBeUndefined();
    expect(asr.calls).toBe(callsBefore);

    const photo = await mediaEvidenceModel.create({
      ...fixture.audio.toObject(),
      _id: new Types.ObjectId(),
      evidenceCode: 'EVD-C2-DURATION-PHOTO',
      evidenceType: 'photo',
      captureMode: 'photo_upload',
      audioMetadata: null,
      transcription: undefined,
      storage: {
        ...fixture.audio.storage,
        objectKey: 'c2/duration/photo.png',
        mimeType: 'image/png',
        fileExtension: 'png',
      },
    });
    await staff
      .post(`${fixture.itemBase}/${photo._id.toString()}/transcribe`)
      .expect(409)
      .expect((response: Response) => {
        expect(bodyOf(response).code).toBe('MEDIA_TRANSCRIPTION_NOT_ALLOWED');
      });
    expect(
      (await mediaEvidenceModel.findById(photo._id).lean().exec())
        ?.transcription,
    ).toBeUndefined();
    expect(asr.calls).toBe(callsBefore);
  });
});
