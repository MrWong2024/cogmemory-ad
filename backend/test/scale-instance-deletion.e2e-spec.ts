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

const ACCOUNT_NAME = 'doctor-scale-instance-deletion';
const PASSWORD = 'Scale-Instance-Deletion-E2E!';
const SUBJECT_CODE = 'SUBJ-SCALE-INSTANCE-DELETE-E2E';
const VISIT_CODE = 'VISIT-SCALE-INSTANCE-DELETE-E2E';
const EMPTY_VISIT_SUBJECT_CODE = 'SUBJ-SCALE-INSTANCE-DELETE-E2E-EMPTY-VISIT';
const EMPTY_VISIT_CODE = 'VISIT-SCALE-INSTANCE-DELETE-E2E-EMPTY-VISIT';
const OWNED_SUBJECT_CODES = [SUBJECT_CODE, EMPTY_VISIT_SUBJECT_CODE];
const OWNED_VISIT_CODES = [VISIT_CODE, EMPTY_VISIT_CODE];
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;

class TrackingFakeStorageService implements StorageService {
  readonly driver = 'fake' as const;
  readonly objects = new Map<string, Buffer>();
  readonly deletedKeys: string[] = [];

  uploadFile(input: UploadFileInput): Promise<UploadedFileResult> {
    this.objects.set(input.objectKey, Buffer.from(input.buffer));
    return Promise.resolve({
      objectKey: input.objectKey,
      bucket: 'scale-instance-deletion-fake',
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
    });
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

describe('incomplete scale instance physical deletion (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let httpServer: SupertestApp;
  let staff: ReturnType<typeof request.agent>;
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
  let ownsMmseDefinition = false;
  let ownsMocaDefinition = false;
  let ownsMmseVersion = false;
  let ownsMocaVersion = false;
  let mmseDefinitionId: Types.ObjectId | undefined;
  let mocaDefinitionId: Types.ObjectId | undefined;
  let ownedUserId: Types.ObjectId | undefined;
  const ownedScaleInstanceIds = new Set<string>();
  const storage = new TrackingFakeStorageService();

  async function cleanupOwnedData(): Promise<void> {
    const patients = await patientModel
      .find({ subjectCode: { $in: OWNED_SUBJECT_CODES } })
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

    const users = await userModel
      .find({ accountName: ACCOUNT_NAME })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0) {
      await authSessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }
    await userModel.deleteMany({ accountName: ACCOUNT_NAME }).exec();
  }

  async function assertOwnedResidualIsZero(): Promise<void> {
    const scaleInstanceIds = [...ownedScaleInstanceIds].map(
      (scaleInstanceId) => new Types.ObjectId(scaleInstanceId),
    );
    const counts = await Promise.all([
      userModel.countDocuments({ accountName: ACCOUNT_NAME }),
      ownedUserId
        ? authSessionModel.countDocuments({ userId: ownedUserId })
        : Promise.resolve(0),
      patientModel.countDocuments({
        subjectCode: { $in: OWNED_SUBJECT_CODES },
      }),
      visitModel.countDocuments({ visitCode: { $in: OWNED_VISIT_CODES } }),
      scaleInstanceModel.countDocuments({ _id: { $in: scaleInstanceIds } }),
      itemResponseModel.countDocuments({
        scaleInstanceId: { $in: scaleInstanceIds },
      }),
      administrationSessionModel.countDocuments({
        scaleInstanceId: { $in: scaleInstanceIds },
      }),
      mediaEvidenceModel.countDocuments({
        scaleInstanceId: { $in: scaleInstanceIds },
      }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error(
        'Scale instance deletion E2E requires NODE_ENV=test and standard_test',
      );
    }

    const seedDataService = new ScaleSeedDataService();
    const mmseSeed = seedDataService.getScaleSeedByCode('mmse');
    const steps = mmseSeed?.version.patientAdministrationSteps;
    if (!mmseSeed || !steps) {
      throw new Error('Expected the built-in MMSE patient administration seed');
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
          size: Buffer.byteLength(assetKey),
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
          reviewedBy: 'Scale instance deletion E2E',
          reviewedAt: '2026-08-25T00:00:00.000Z',
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
            throw new Error(`Unexpected asset ${assetKey}`);
          }
          const buffer = Buffer.from(assetKey);
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
      .useValue(storage)
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
      throw new Error('Scale instance deletion E2E isolation is not active');
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
    await cleanupOwnedData();

    const existingMmseDefinition = await scaleDefinitionModel
      .findOne({ code: 'mmse' })
      .exec();
    const existingMocaDefinition = await scaleDefinitionModel
      .findOne({ code: 'moca' })
      .exec();
    ownsMmseDefinition = existingMmseDefinition === null;
    ownsMocaDefinition = existingMocaDefinition === null;
    ownsMmseVersion = existingMmseDefinition
      ? (await scaleVersionModel
          .exists({
            scaleDefinitionId: existingMmseDefinition._id,
            version: '1.0',
          })
          .exec()) === null
      : true;
    ownsMocaVersion = existingMocaDefinition
      ? (await scaleVersionModel
          .exists({
            scaleDefinitionId: existingMocaDefinition._id,
            version: '1.0',
          })
          .exec()) === null
      : true;
    const user = await userModel.create({
      accountName: ACCOUNT_NAME,
      displayName: 'Scale Instance Deletion Doctor',
      staffCode: 'STAFF-SCALE-INSTANCE-DELETE',
      passwordHash: await authService.hashPassword(PASSWORD),
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    ownedUserId = user._id;
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
    await cleanupOwnedData();
    await assertOwnedResidualIsZero();
    for (const objectKey of [...storage.objects.keys()]) {
      await storage.deleteObject(objectKey);
    }
    expect(storage.objects.size).toBe(0);

    if (ownsMmseVersion && mmseDefinitionId) {
      await scaleVersionModel
        .deleteOne({ scaleDefinitionId: mmseDefinitionId, version: '1.0' })
        .exec();
    }
    if (ownsMocaVersion && mocaDefinitionId) {
      await scaleVersionModel
        .deleteOne({ scaleDefinitionId: mocaDefinitionId, version: '1.0' })
        .exec();
    }
    if (ownsMmseDefinition && mmseDefinitionId) {
      await scaleDefinitionModel.deleteOne({ _id: mmseDefinitionId }).exec();
    }
    if (ownsMocaDefinition && mocaDefinitionId) {
      await scaleDefinitionModel.deleteOne({ _id: mocaDefinitionId }).exec();
    }
    await app.close();
  });

  it('blocks an active attempt, then physically deletes a terminated attempt and allows reinitialization', async () => {
    const patientResponse = await staff
      .post('/patients')
      .send({
        subjectCode: SUBJECT_CODE,
        displayName: 'De-identified deletion test patient',
      })
      .expect(201);
    const patientId = stringOf(bodyOf(patientResponse), 'id');
    const visitResponse = await staff
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: VISIT_CODE,
        assessmentDate: '2026-08-25T01:00:00.000Z',
      })
      .expect(201);
    const visitId = stringOf(bodyOf(visitResponse), 'id');
    const initialize = async (
      scaleCode: 'mmse' | 'moca',
      administrationMode: 'supervised_patient_input' | 'clinician_administered',
    ) => {
      const response = await staff
        .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
        .send({ scaleCode, scaleVersion: '1.0', administrationMode })
        .expect(201);
      const scaleInstance = bodyOf(response).scaleInstance;
      if (!isRecord(scaleInstance)) {
        throw new Error('Expected initialized ScaleInstance response');
      }
      const scaleInstanceId = stringOf(scaleInstance, 'id');
      ownedScaleInstanceIds.add(scaleInstanceId);
      return scaleInstanceId;
    };
    const targetScaleInstanceId = await initialize(
      'mmse',
      'supervised_patient_input',
    );
    const otherScaleInstanceId = await initialize(
      'moca',
      'clinician_administered',
    );
    const mmseDefinition = await scaleDefinitionModel
      .findOne({ code: 'mmse' })
      .exec();
    const mocaDefinition = await scaleDefinitionModel
      .findOne({ code: 'moca' })
      .exec();
    if (!mmseDefinition || !mocaDefinition) {
      throw new Error('Expected materialized MMSE and MoCA definitions');
    }
    mmseDefinitionId = mmseDefinition._id;
    mocaDefinitionId = mocaDefinition._id;
    const targetBase = `/patients/${patientId}/visits/${visitId}/scale-instances/${targetScaleInstanceId}`;
    const administrationBase = `${targetBase}/patient-administration`;
    const sessionResponse = await staff
      .post(administrationBase)
      .send({ deviceMode: 'cross_device' })
      .expect(201);
    const sessionBody = bodyOf(sessionResponse);
    const patientAgent = request.agent(httpServer);
    await patientAgent
      .post('/patient-administration/enter')
      .send({ code: stringOf(sessionBody, 'entryCode') })
      .expect(200);
    const preparationResponse = await staff
      .post(`${administrationBase}/preparation/confirm`)
      .send({ expectedRevision: 1, impactFactorCodes: [] })
      .expect(200);
    let revision = numberOf(bodyOf(preparationResponse), 'revision');
    const evidenceResponse = await patientAgent
      .post('/patient-administration/current/evidence')
      .field('expectedRevision', revision.toString())
      .field('evidenceType', 'audio')
      .field('durationMs', '1800')
      .attach('file', WEBM, {
        filename: 'de-identified-audio.webm',
        contentType: 'audio/webm',
      })
      .expect(201);
    revision = numberOf(bodyOf(evidenceResponse), 'revision');
    const mediaEvidenceId = stringOf(
      bodyOf(evidenceResponse),
      'mediaEvidenceId',
    );
    const storedEvidence = await mediaEvidenceModel
      .findById(mediaEvidenceId)
      .exec();
    const objectKey = storedEvidence?.storage?.objectKey;
    if (!objectKey) {
      throw new Error('Expected owned storage object key');
    }
    expect(storage.objects.has(objectKey)).toBe(true);

    const activeBlocked = await staff.delete(targetBase).expect(409);
    expect(bodyOf(activeBlocked)).toEqual(
      expect.objectContaining({ code: 'SCALE_INSTANCE_NOT_DELETABLE' }),
    );
    expect(
      await Promise.all([
        scaleInstanceModel.countDocuments({ _id: targetScaleInstanceId }),
        itemResponseModel.countDocuments({
          scaleInstanceId: targetScaleInstanceId,
        }),
        administrationSessionModel.countDocuments({
          scaleInstanceId: targetScaleInstanceId,
        }),
        mediaEvidenceModel.countDocuments({
          scaleInstanceId: targetScaleInstanceId,
        }),
      ]),
    ).toEqual([1, 11, 1, 1]);
    expect(storage.objects.has(objectKey)).toBe(true);

    const visitBeforeDelete = await visitModel.findById(visitId).lean().exec();
    await staff
      .post(`${administrationBase}/terminate`)
      .send({
        expectedRevision: revision,
        reason: 'Synthetic interrupted administration',
      })
      .expect(200)
      .expect((response: Response) => {
        expect(bodyOf(response)).toEqual(
          expect.objectContaining({ status: 'terminated' }),
        );
      });
    const deleted = await staff.delete(targetBase).expect(204);
    expect(deleted.text).toBe('');

    expect(
      await Promise.all([
        scaleInstanceModel.countDocuments({ _id: targetScaleInstanceId }),
        itemResponseModel.countDocuments({
          scaleInstanceId: targetScaleInstanceId,
        }),
        administrationSessionModel.countDocuments({
          scaleInstanceId: targetScaleInstanceId,
        }),
        mediaEvidenceModel.countDocuments({
          scaleInstanceId: targetScaleInstanceId,
        }),
      ]),
    ).toEqual([0, 0, 0, 0]);
    expect(storage.objects.has(objectKey)).toBe(false);
    expect(storage.deletedKeys).toContain(objectKey);
    expect(await visitModel.findById(visitId).lean().exec()).toEqual(
      visitBeforeDelete,
    );
    expect(
      await scaleInstanceModel.countDocuments({ _id: otherScaleInstanceId }),
    ).toBe(1);

    const replacementScaleInstanceId = await initialize(
      'mmse',
      'supervised_patient_input',
    );
    expect(replacementScaleInstanceId).not.toBe(targetScaleInstanceId);
    await staff.delete(targetBase).expect(404);
  });

  it('deletes a started visit after its terminated scale instance is formally removed', async () => {
    const patientResponse = await staff
      .post('/patients')
      .send({
        subjectCode: EMPTY_VISIT_SUBJECT_CODE,
        displayName: 'De-identified empty visit deletion test patient',
      })
      .expect(201);
    const patientId = stringOf(bodyOf(patientResponse), 'id');
    const visitResponse = await staff
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: EMPTY_VISIT_CODE,
        assessmentDate: '2026-08-25T02:00:00.000Z',
      })
      .expect(201);
    const visitId = stringOf(bodyOf(visitResponse), 'id');
    const initializeResponse = await staff
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        administrationMode: 'supervised_patient_input',
      })
      .expect(201);
    const scaleInstance = bodyOf(initializeResponse).scaleInstance;
    if (!isRecord(scaleInstance)) {
      throw new Error('Expected initialized ScaleInstance response');
    }
    const scaleInstanceId = stringOf(scaleInstance, 'id');
    ownedScaleInstanceIds.add(scaleInstanceId);
    const scaleInstanceBase = `/patients/${patientId}/visits/${visitId}/scale-instances/${scaleInstanceId}`;
    const administrationBase = `${scaleInstanceBase}/patient-administration`;
    const sessionResponse = await staff
      .post(administrationBase)
      .send({ deviceMode: 'cross_device' })
      .expect(201);
    const patientAgent = request.agent(httpServer);
    await patientAgent
      .post('/patient-administration/enter')
      .send({ code: stringOf(bodyOf(sessionResponse), 'entryCode') })
      .expect(200);
    const preparationResponse = await staff
      .post(`${administrationBase}/preparation/confirm`)
      .send({ expectedRevision: 1, impactFactorCodes: [] })
      .expect(200);
    const evidenceResponse = await patientAgent
      .post('/patient-administration/current/evidence')
      .field(
        'expectedRevision',
        numberOf(bodyOf(preparationResponse), 'revision').toString(),
      )
      .field('evidenceType', 'audio')
      .field('durationMs', '1800')
      .attach('file', WEBM, {
        filename: 'de-identified-empty-visit-audio.webm',
        contentType: 'audio/webm',
      })
      .expect(201);
    await staff
      .post(`${administrationBase}/terminate`)
      .send({
        expectedRevision: numberOf(bodyOf(evidenceResponse), 'revision'),
        reason: 'Synthetic interrupted administration for empty visit',
      })
      .expect(200);

    const blockedVisitDelete = await staff
      .delete(`/patients/${patientId}/visits/${visitId}`)
      .expect(409);
    expect(bodyOf(blockedVisitDelete)).toEqual(
      expect.objectContaining({ code: 'VISIT_NOT_DELETABLE' }),
    );
    expect(
      await scaleInstanceModel.countDocuments({ _id: scaleInstanceId }),
    ).toBe(1);

    await staff.delete(scaleInstanceBase).expect(204);
    const detailResponse = await staff
      .get(`/patients/${patientId}/visits/${visitId}`)
      .expect(200);
    const detailBody = bodyOf(detailResponse);
    expect(detailBody.scaleInstances).toEqual([]);
    expect(detailBody.visitMaintenance).toEqual({
      canEdit: false,
      canDelete: true,
      canVoid: false,
      initializedScaleCount: 0,
    });
    expect(detailBody.visit).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        completedAt: null,
        lockedAt: null,
        voidedAt: null,
      }),
    );

    const deletedVisit = await staff
      .delete(`/patients/${patientId}/visits/${visitId}`)
      .expect(204);
    expect(deletedVisit.text).toBe('');
    const missingVisit = await staff
      .get(`/patients/${patientId}/visits/${visitId}`)
      .expect(404);
    expect(bodyOf(missingVisit)).toEqual(
      expect.objectContaining({ code: 'VISIT_NOT_FOUND' }),
    );
    await expect(
      patientModel.exists({ _id: new Types.ObjectId(patientId) }),
    ).resolves.not.toBeNull();
  });
});
