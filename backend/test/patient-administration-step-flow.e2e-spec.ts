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
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';
import { requireInitialized } from './support/e2e-initialization';

jest.setTimeout(120_000);

const TEST_PREFIX = 'B2-STEP-FLOW';
const ACCOUNT_NAME = 'doctor-b2-step-flow';
const PASSWORD = 'B2-Step-Flow-Password!';
const SUBJECT_CODE = `SUBJ-${TEST_PREFIX}`;
const VISIT_CODE = `VISIT-${TEST_PREFIX}`;
const AUDIO_PREFIX = 'B2-AUDIO:';
const IMAGE_PREFIX = 'B2-IMAGE:';

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;
type TestAgent = ReturnType<typeof request.agent>;

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

function jsonSnapshot(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe('patient administration 19-step flow APIs (e2e)', () => {
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
  let scaleDefinitionModel: Model<ScaleDefinitionDocument>;
  let scaleVersionModel: Model<ScaleVersionDocument>;
  let mmseDefinition: ScaleDefinitionDocument;
  let mmseVersion: ScaleVersionDocument;
  let ownsMmseDefinition = false;
  let ownsMmseVersion = false;
  let modelsReady = false;
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
      .find({ subjectCode: SUBJECT_CODE })
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
      patientModel.countDocuments({ subjectCode: SUBJECT_CODE }),
      visitModel.countDocuments({ visitCode: VISIT_CODE }),
      instanceIds.length > 0
        ? scaleInstanceModel.countDocuments({ _id: { $in: instanceIds } })
        : Promise.resolve(0),
      instanceIds.length > 0
        ? itemResponseModel.countDocuments({
            scaleInstanceId: { $in: instanceIds },
          })
        : Promise.resolve(0),
      instanceIds.length > 0
        ? administrationSessionModel.countDocuments({
            scaleInstanceId: { $in: instanceIds },
          })
        : Promise.resolve(0),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error('B2 E2E requires NODE_ENV=test and standard_test');
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
                role: assetKey.endsWith('-stimulus') ? 'stimulus' : 'guidance',
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
          reviewedBy: 'B2 E2E in-memory stub',
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
            throw new Error(`Unexpected E2E asset ${assetKey}`);
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
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    const configService = app.get(ConfigService);
    if (
      connection.name !== 'cogmemory_ad_test' ||
      configService.get<string>('app.env') !== 'test' ||
      configService.get<string>('storage.driver') !== 'fake' ||
      configService.get<string>('llm.provider') !== 'stub'
    ) {
      throw new Error('B2 E2E isolation is not active');
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

    const user = await userModel.create({
      accountName: ACCOUNT_NAME,
      displayName: 'B2 Step Flow Doctor',
      staffCode: 'STAFF-B2-STEP-FLOW',
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

  it('executes all 19 steps with secure assets, capture, redo, takeover, replay, and CAS', async () => {
    const patient = await patientModel.create({
      subjectCode: SUBJECT_CODE,
      displayName: 'De-identified B2 subject',
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['b2-step-flow'],
      externalRefs: null,
      metadata: null,
    });
    const visit = await visitModel.create({
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      visitCode: VISIT_CODE,
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
    const initializeResponse = await staff
      .post(
        `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances`,
      )
      .send({
        scaleCode: 'mmse',
        scaleVersion: '1.0',
        administrationMode: 'supervised_patient_input',
      })
      .expect(201);
    const initializeBody = bodyOf(initializeResponse);
    expect(numberOf(initializeBody, 'createdItemResponseCount')).toBe(11);
    const initializedInstance = initializeBody.scaleInstance;
    if (!isRecord(initializedInstance)) {
      throw new Error('Expected initialized scale instance');
    }
    const scaleInstanceId = stringOf(initializedInstance, 'id');
    ownedScaleInstanceIds.add(scaleInstanceId);
    const base = `/patients/${patient._id.toString()}/visits/${visit._id.toString()}/scale-instances/${scaleInstanceId}/patient-administration`;

    const scaleSnapshot = jsonSnapshot(
      await scaleInstanceModel.findById(scaleInstanceId).lean().exec(),
    );
    const itemSnapshot = jsonSnapshot(
      await itemResponseModel
        .find({ scaleInstanceId: new Types.ObjectId(scaleInstanceId) })
        .sort({ itemOrder: 1 })
        .lean()
        .exec(),
    );

    const createResponse = await staff.post(base).send({}).expect(201);
    const createBody = bodyOf(createResponse);
    const sessionId = stringOf(createBody, 'id');
    const patientAgent = request.agent(httpServer);
    await patientAgent
      .post('/patient-administration/enter')
      .send({ code: stringOf(createBody, 'entryCode') })
      .expect(200);
    const confirmed = await staff
      .post(`${base}/preparation/confirm`)
      .send({ expectedRevision: 1, impactFactorCodes: [] })
      .expect(200);
    let revision = numberOf(bodyOf(confirmed), 'revision');
    expect(revision).toBe(2);

    async function currentStep(expectedOrder?: number) {
      const response = await patientAgent
        .get('/patient-administration/current')
        .expect(200);
      const body = bodyOf(response);
      const current = body.currentStep;
      if (!isRecord(current)) {
        throw new Error('Expected active current step');
      }
      if (expectedOrder !== undefined) {
        expect(numberOf(current, 'order')).toBe(expectedOrder);
      }
      expect(body).toEqual(
        expect.objectContaining({ status: 'active', revision }),
      );
      return current;
    }

    async function playAudio(assetKey: string): Promise<void> {
      const response = await patientAgent
        .post(`/patient-administration/current/audio/${assetKey}/play`)
        .send({ expectedRevision: revision })
        .expect(200);
      expect(response.headers['content-type']).toMatch(/^audio\/mpeg/);
      expect(response.headers['cache-control']).toBe(
        'private, no-store, max-age=0',
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.body).toEqual(Buffer.from(`${AUDIO_PREFIX}${assetKey}`));
      revision = Number(response.headers['x-patient-administration-revision']);
      expect(Number.isSafeInteger(revision)).toBe(true);
    }

    async function playCurrentAudioAssets(step: Record<string, unknown>) {
      for (const value of arrayOf(step, 'assets')) {
        if (!isRecord(value)) {
          throw new Error('Expected asset metadata object');
        }
        if (value.kind === 'audio') {
          await playAudio(stringOf(value, 'assetKey'));
        }
      }
    }

    async function patientComplete(): Promise<Record<string, unknown>> {
      const response = await patientAgent
        .post('/patient-administration/current/complete')
        .send({ expectedRevision: revision })
        .expect(200);
      const body = bodyOf(response);
      revision = numberOf(body, 'revision');
      return body;
    }

    async function staffComplete(
      observation: string,
    ): Promise<Record<string, unknown>> {
      const response = await staff
        .post(`${base}/current/complete`)
        .send({ expectedRevision: revision, staffObservation: observation })
        .expect(200);
      const body = bodyOf(response);
      revision = numberOf(body, 'revision');
      return body;
    }

    async function advanceNormally(order: number): Promise<void> {
      const step = await currentStep(order);
      await playCurrentAudioAssets(step);
      if (step.advanceBy === 'patient') {
        await patientComplete();
      } else if (step.advanceBy === 'staff') {
        await staffComplete(`Observed MMSE step ${order}`);
      } else {
        throw new Error('Unexpected advanceBy value');
      }
    }

    const first = await currentStep(1);
    expect(Object.keys(first).sort()).toEqual(
      [
        'advanceBy',
        'assets',
        'order',
        'patientText',
        'responseMode',
        'stepKey',
      ].sort(),
    );
    expect(first).not.toHaveProperty('assetKeys');
    for (const value of arrayOf(first, 'assets')) {
      if (!isRecord(value)) {
        throw new Error('Expected safe first-step asset');
      }
      expect(Object.keys(value).sort()).toEqual(
        ['assetKey', 'kind', 'mimeType', 'role'].sort(),
      );
    }
    expect(JSON.stringify(first).toLowerCase()).not.toMatch(
      /filepath|sha256|spokentext|packagekey|sourcepdf/,
    );

    await patientAgent
      .post('/patient-administration/current/complete')
      .send({ expectedRevision: revision, stepKey: 'forged-step' })
      .expect(400);
    await patientAgent
      .post(
        '/patient-administration/current/audio/mmse-orientation-intro-guidance/play',
      )
      .send({ expectedRevision: revision, assetKey: 'forged-asset' })
      .expect(400);
    const beforeDenied = await administrationSessionModel
      .findById(sessionId)
      .lean()
      .exec();
    expect(beforeDenied?.revision).toBe(revision);

    const deniedFuture = await patientAgent
      .get('/patient-administration/current/assets/mmse-drawing-stimulus')
      .expect(403);
    expect(bodyOf(deniedFuture)).toEqual(
      expect.objectContaining({
        code: 'PATIENT_ADMINISTRATION_ASSET_NOT_ALLOWED',
      }),
    );
    expect(stringOf(bodyOf(deniedFuture), 'message')).not.toMatch(
      /filepath|sha256|spokentext|packagekey/i,
    );
    await patientAgent
      .get(
        '/patient-administration/current/assets/mmse-orientation-intro-guidance',
      )
      .expect(403);
    await patientAgent
      .post('/patient-administration/current/complete')
      .send({ expectedRevision: revision })
      .expect(409)
      .expect((response: Response) => {
        expect(bodyOf(response)).toEqual(
          expect.objectContaining({
            code: 'PATIENT_ADMINISTRATION_STEP_INVALID',
          }),
        );
      });

    const firstAsset = 'mmse-orientation-intro-guidance';
    const concurrentAudio = await Promise.all([
      patientAgent
        .post(`/patient-administration/current/audio/${firstAsset}/play`)
        .send({ expectedRevision: revision }),
      patientAgent
        .post(`/patient-administration/current/audio/${firstAsset}/play`)
        .send({ expectedRevision: revision }),
    ]);
    expect(concurrentAudio.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const audioWinner = concurrentAudio.find(
      (response) => response.status === 200,
    );
    if (!audioWinner) {
      throw new Error('Expected one audio CAS winner');
    }
    revision = Number(audioWinner.headers['x-patient-administration-revision']);
    const afterAudioRace = await administrationSessionModel
      .findById(sessionId)
      .exec();
    expect(
      afterAudioRace?.playbackFacts.find(
        (fact) => fact.stepKey === stringOf(first, 'stepKey'),
      )?.playCount,
    ).toBe(1);
    await playAudio('mmse-orientation-year-guidance');
    await patientComplete();

    const second = await currentStep(2);
    await playCurrentAudioAssets(second);
    const concurrentCompletion = await Promise.all([
      patientAgent
        .post('/patient-administration/current/complete')
        .send({ expectedRevision: revision }),
      patientAgent
        .post('/patient-administration/current/complete')
        .send({ expectedRevision: revision }),
    ]);
    expect(
      concurrentCompletion.map((response) => response.status).sort(),
    ).toEqual([200, 409]);
    const completionWinner = concurrentCompletion.find(
      (response) => response.status === 200,
    );
    if (!completionWinner) {
      throw new Error('Expected one completion CAS winner');
    }
    revision = numberOf(bodyOf(completionWinner), 'revision');
    const afterCompletionRace = await administrationSessionModel
      .findById(sessionId)
      .exec();
    expect(
      afterCompletionRace?.stepCaptures.filter(
        (capture) => capture.stepKey === stringOf(second, 'stepKey'),
      ),
    ).toHaveLength(1);

    const staleRevision = revision - 1;
    await patientAgent
      .post('/patient-administration/current/complete')
      .send({ expectedRevision: staleRevision })
      .expect(409);
    expect(
      (await administrationSessionModel.findById(sessionId).lean().exec())
        ?.revision,
    ).toBe(revision);

    for (let order = 3; order <= 10; order += 1) {
      await advanceNormally(order);
    }

    const immediateRecall = await currentStep(11);
    const recallAssets = arrayOf(immediateRecall, 'assets').map((value) => {
      if (!isRecord(value)) {
        throw new Error('Expected immediate-recall asset');
      }
      return value;
    });
    const guidanceKey = stringOf(recallAssets[0], 'assetKey');
    const stimulusKey = stringOf(recallAssets[1], 'assetKey');
    await playAudio(guidanceKey);
    const concurrentStimulus = await Promise.all([
      patientAgent
        .post(`/patient-administration/current/audio/${stimulusKey}/play`)
        .send({ expectedRevision: revision }),
      patientAgent
        .post(`/patient-administration/current/audio/${stimulusKey}/play`)
        .send({ expectedRevision: revision }),
    ]);
    expect(
      concurrentStimulus.map((response) => response.status).sort(),
    ).toEqual([200, 409]);
    const stimulusWinner = concurrentStimulus.find(
      (response) => response.status === 200,
    );
    const stimulusLoser = concurrentStimulus.find(
      (response) => response.status === 409,
    );
    if (!stimulusWinner || !stimulusLoser) {
      throw new Error('Expected one first-stimulus CAS winner and loser');
    }
    revision = Number(
      stimulusWinner.headers['x-patient-administration-revision'],
    );
    expect(stimulusLoser.headers['content-type']).toMatch(/^application\/json/);
    expect(bodyOf(stimulusLoser)).toEqual(
      expect.objectContaining({
        code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
      }),
    );
    await patientAgent
      .post(`/patient-administration/current/audio/${stimulusKey}/play`)
      .send({ expectedRevision: revision })
      .expect(403);

    const pausedForReplay = await staff
      .post(`${base}/pause`)
      .send({ expectedRevision: revision, reason: 'technical audio pause' })
      .expect(200);
    revision = numberOf(bodyOf(pausedForReplay), 'revision');
    await staff
      .post(`${base}/current/audio/${guidanceKey}/replay-authorize`)
      .send({ expectedRevision: revision, reason: 'not a stimulus' })
      .expect(403);
    const authorized = await staff
      .post(`${base}/current/audio/${stimulusKey}/replay-authorize`)
      .send({
        expectedRevision: revision,
        reason: 'speaker interruption during first stimulus',
      })
      .expect(200);
    revision = numberOf(bodyOf(authorized), 'revision');
    await staff
      .post(`${base}/current/audio/${stimulusKey}/replay-authorize`)
      .send({ expectedRevision: revision, reason: 'must not stack' })
      .expect(409);
    await patientAgent
      .post(`/patient-administration/current/audio/${stimulusKey}/play`)
      .send({ expectedRevision: revision })
      .expect(409);
    const resumedAfterReplay = await staff
      .post(`${base}/resume`)
      .send({ expectedRevision: revision, reason: 'technical issue resolved' })
      .expect(200);
    revision = numberOf(bodyOf(resumedAfterReplay), 'revision');
    const concurrentReplay = await Promise.all([
      patientAgent
        .post(`/patient-administration/current/audio/${stimulusKey}/play`)
        .send({ expectedRevision: revision }),
      patientAgent
        .post(`/patient-administration/current/audio/${stimulusKey}/play`)
        .send({ expectedRevision: revision }),
    ]);
    expect(concurrentReplay.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const replayWinner = concurrentReplay.find(
      (response) => response.status === 200,
    );
    if (!replayWinner) {
      throw new Error('Expected one authorized replay CAS winner');
    }
    revision = Number(
      replayWinner.headers['x-patient-administration-revision'],
    );
    await patientAgent
      .post(`/patient-administration/current/audio/${stimulusKey}/play`)
      .send({ expectedRevision: revision })
      .expect(403);
    await patientComplete();

    const step12 = await currentStep(12);
    const step12Audio = arrayOf(step12, 'assets').find(
      (asset) => isRecord(asset) && asset.kind === 'audio',
    );
    if (!isRecord(step12Audio)) {
      throw new Error('Expected step 12 audio');
    }
    const step12AudioKey = stringOf(step12Audio, 'assetKey');
    const pausePlayRace = await Promise.all([
      staff
        .post(`${base}/pause`)
        .send({ expectedRevision: revision, reason: 'pause/play race' }),
      patientAgent
        .post(`/patient-administration/current/audio/${step12AudioKey}/play`)
        .send({ expectedRevision: revision }),
    ]);
    expect(pausePlayRace.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const pauseRaceWinner = pausePlayRace.find(
      (response) => response.status === 200,
    );
    if (!pauseRaceWinner) {
      throw new Error('Expected one pause/play CAS winner');
    }
    if (pauseRaceWinner.headers['content-type']?.startsWith('audio/mpeg')) {
      revision = Number(
        pauseRaceWinner.headers['x-patient-administration-revision'],
      );
      const pauseAfterPlay = await staff
        .post(`${base}/pause`)
        .send({ expectedRevision: revision, reason: 'pause after play won' })
        .expect(200);
      revision = numberOf(bodyOf(pauseAfterPlay), 'revision');
    } else {
      revision = numberOf(bodyOf(pauseRaceWinner), 'revision');
    }
    const resumeAfterPauseRace = await staff
      .post(`${base}/resume`)
      .send({ expectedRevision: revision, reason: 'resume after CAS race' })
      .expect(200);
    revision = numberOf(bodyOf(resumeAfterPauseRace), 'revision');
    const step12Fact = (
      await administrationSessionModel.findById(sessionId).exec()
    )?.playbackFacts.find(
      (fact) =>
        fact.stepKey === stringOf(step12, 'stepKey') &&
        fact.assetKey === step12AudioKey,
    );
    if (!step12Fact) {
      await playAudio(step12AudioKey);
    }
    await patientComplete();
    await advanceNormally(13);

    const staffStep14 = await currentStep(14);
    await playCurrentAudioAssets(staffStep14);
    await patientAgent
      .post('/patient-administration/current/complete')
      .send({ expectedRevision: revision })
      .expect(409);
    await staffComplete('Named objects observed by staff');

    const firstRunStep15 = await currentStep(15);
    await playCurrentAudioAssets(firstRunStep15);
    await patientComplete();
    await currentStep(16);
    const pausedForRedo = await staff
      .post(`${base}/pause`)
      .send({ expectedRevision: revision, reason: 'review previous capture' })
      .expect(200);
    revision = numberOf(bodyOf(pausedForRedo), 'revision');
    const [redone, stalePatientCompletion] = await Promise.all([
      staff.post(`${base}/redo-last`).send({
        expectedRevision: revision,
        reason: 'repeat direct previous instruction',
      }),
      patientAgent
        .post('/patient-administration/current/complete')
        .send({ expectedRevision: revision }),
    ]);
    expect(redone.status).toBe(200);
    expect(stalePatientCompletion.status).toBe(409);
    revision = numberOf(bodyOf(redone), 'revision');
    expect(stringOf(bodyOf(redone), 'currentStepKey')).toBe(
      stringOf(firstRunStep15, 'stepKey'),
    );
    const afterRedo = await administrationSessionModel
      .findById(sessionId)
      .exec();
    const invalidatedStep15 = afterRedo?.stepCaptures.find(
      (capture) =>
        capture.stepKey === stringOf(firstRunStep15, 'stepKey') &&
        capture.invalidatedAt,
    );
    expect(invalidatedStep15).toEqual(
      expect.objectContaining({
        stepRun: 1,
        invalidatedReason: 'repeat direct previous instruction',
      }),
    );
    expect(
      invalidatedStep15 && isRecord(invalidatedStep15)
        ? invalidatedStep15._id
        : undefined,
    ).toBeUndefined();
    const resumedForRedo = await staff
      .post(`${base}/resume`)
      .send({ expectedRevision: revision, reason: 'redo ready' })
      .expect(200);
    revision = numberOf(bodyOf(resumedForRedo), 'revision');
    const secondRunStep15 = await currentStep(15);
    await playCurrentAudioAssets(secondRunStep15);
    await patientComplete();
    const afterSecondRun = await administrationSessionModel
      .findById(sessionId)
      .exec();
    expect(
      afterSecondRun?.stepCaptures.find(
        (capture) =>
          capture.stepKey === stringOf(secondRunStep15, 'stepKey') &&
          !capture.invalidatedAt,
      )?.stepRun,
    ).toBe(2);

    const staffStep16 = await currentStep(16);
    expect(arrayOf(staffStep16, 'assets')).toEqual([]);
    await staffComplete('Reading instruction observed by staff');
    const staffStep17 = await currentStep(17);
    await playCurrentAudioAssets(staffStep17);
    await staffComplete('Three-step command observed by staff');

    const takeoverStep18 = await currentStep(18);
    const pausedForTakeover = await staff
      .post(`${base}/pause`)
      .send({ expectedRevision: revision, reason: 'patient asks for help' })
      .expect(200);
    revision = numberOf(bodyOf(pausedForTakeover), 'revision');
    const takenOver = await staff
      .post(`${base}/current/takeover`)
      .send({
        expectedRevision: revision,
        reason: 'staff assistance required',
        staffObservation: 'Expression captured by staff',
      })
      .expect(200);
    revision = numberOf(bodyOf(takenOver), 'revision');
    expect(stringOf(bodyOf(takenOver), 'currentStepKey')).not.toBe(
      stringOf(takeoverStep18, 'stepKey'),
    );
    const resumedAfterTakeover = await staff
      .post(`${base}/resume`)
      .send({ expectedRevision: revision, reason: 'continue final step' })
      .expect(200);
    revision = numberOf(bodyOf(resumedAfterTakeover), 'revision');

    const finalStep = await currentStep(19);
    const finalAssets = arrayOf(finalStep, 'assets').map((value) => {
      if (!isRecord(value)) {
        throw new Error('Expected final-step asset');
      }
      return value;
    });
    const finalAudio = finalAssets.find((asset) => asset.kind === 'audio');
    const finalImage = finalAssets.find((asset) => asset.kind === 'image');
    if (!finalAudio || !finalImage) {
      throw new Error('Expected final audio and image assets');
    }
    const finalAudioKey = stringOf(finalAudio, 'assetKey');
    const finalImageKey = stringOf(finalImage, 'assetKey');
    expect(finalImage.role).toBeNull();
    await patientAgent
      .post(`/patient-administration/current/audio/${finalImageKey}/play`)
      .send({ expectedRevision: revision })
      .expect(403);
    await patientAgent
      .get(`/patient-administration/current/assets/${finalAudioKey}`)
      .expect(403);
    const beforeImageRevision = revision;
    const imageResponse = await patientAgent
      .get(`/patient-administration/current/assets/${finalImageKey}`)
      .expect(200);
    expect(imageResponse.headers['content-type']).toMatch(/^image\/png/);
    expect(imageResponse.headers['cache-control']).toBe(
      'private, no-store, max-age=0',
    );
    expect(imageResponse.body).toEqual(
      Buffer.from(`${IMAGE_PREFIX}${finalImageKey}`),
    );
    expect(
      (await administrationSessionModel.findById(sessionId).lean().exec())
        ?.revision,
    ).toBe(beforeImageRevision);
    await playAudio(finalAudioKey);
    const finalResponse = await patientAgent
      .post('/patient-administration/current/complete')
      .send({ expectedRevision: revision })
      .expect(200);
    const finalBody = bodyOf(finalResponse);
    revision = numberOf(finalBody, 'revision');
    expect(finalBody).toEqual(
      expect.objectContaining({
        status: 'completed',
        revision,
        currentStep: null,
      }),
    );
    const clearedCookies: unknown = finalResponse.headers['set-cookie'];
    let clearedCookieHeader = '';
    if (typeof clearedCookies === 'string') {
      clearedCookieHeader = clearedCookies;
    } else if (
      Array.isArray(clearedCookies) &&
      clearedCookies.every((value) => typeof value === 'string')
    ) {
      clearedCookieHeader = clearedCookies.join(';');
    }
    expect(clearedCookieHeader).toMatch(
      /cogmemory_ad_patient_session=.*(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/i,
    );
    await patientAgent.get('/patient-administration/current').expect(401);

    const storedFinal = await administrationSessionModel
      .findById(sessionId)
      .select('+entryCodeHash +sessionTokenHash')
      .exec();
    expect(storedFinal).toEqual(
      expect.objectContaining({ status: 'completed', revision }),
    );
    expect(storedFinal?.entryCodeHash).toBeUndefined();
    expect(storedFinal?.entryCodeExpiresAt).toBeUndefined();
    expect(storedFinal?.sessionTokenHash).toBeUndefined();
    expect(storedFinal?.stepCaptures).toHaveLength(20);
    expect(
      storedFinal?.stepCaptures.filter((capture) => !capture.invalidatedAt),
    ).toHaveLength(19);
    expect(storedFinal?.controlEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'paused',
        'resumed',
        'step_redo',
        'staff_takeover',
      ]),
    );

    expect(
      jsonSnapshot(
        await scaleInstanceModel.findById(scaleInstanceId).lean().exec(),
      ),
    ).toEqual(scaleSnapshot);
    expect(
      jsonSnapshot(
        await itemResponseModel
          .find({ scaleInstanceId: new Types.ObjectId(scaleInstanceId) })
          .sort({ itemOrder: 1 })
          .lean()
          .exec(),
      ),
    ).toEqual(itemSnapshot);
  });
});
