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
  ClinicalReport,
  ClinicalReportDocument,
} from '../src/modules/reports/schemas/clinical-report.schema';
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

const DOCTOR_ACCOUNT = 'doctor-a20-test';
const SYSTEM_ACCOUNT = 'system-a20-test';
const PASSWORD = 'A20-Test-Password!';
const SUBJECT_PREFIX = 'SUBJ-A20-TEST-';
const VISIT_PREFIX = 'VISIT-A20-TEST-';
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

function documentValue(
  document: { get(path: string): unknown } | null,
  path: string,
): unknown {
  return document?.get(path);
}

describe('clinical report draft APIs (e2e)', () => {
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
  let reportModel: Model<ClinicalReportDocument>;
  let definitionModel: Model<ScaleDefinitionDocument>;
  let versionModel: Model<ScaleVersionDocument>;
  let doctorAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let server: SupertestApp;
  let modelsReady = false;

  function instancePath(fixture: Fixture): string {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${fixture.scaleInstanceId}`;
  }

  function reportBasePath(fixture: Pick<Fixture, 'patientId' | 'visitId'>) {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports`;
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
      .find({ visitCode: /^VISIT-A20-TEST-/ })
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
    if (visitIds.length > 0)
      await reportModel
        .deleteMany({ assessmentVisitId: { $in: visitIds } })
        .exec();
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
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A20-TEST-/ }).exec();
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
    scaleCode = 'moca',
  ): Promise<Fixture> {
    const patientResponse = await doctorAgent
      .post('/patients')
      .send({
        subjectCode: `${SUBJECT_PREFIX}${suffix}`,
        displayName: 'A20 De-identified Subject',
        sex: 'unknown',
        educationYears: 12,
        notes: 'A20 source note must not enter report narrative',
      })
      .expect(201);
    const patientId = stringValue(body(patientResponse).id, 'patient id');
    const visitResponse = await doctorAgent
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: `${VISIT_PREFIX}${suffix}`,
        assessmentDate: '2026-07-01T08:00:00.000Z',
        notes: 'A20 visit note must not enter report narrative',
      })
      .expect(201);
    const visitId = stringValue(body(visitResponse).id, 'visit id');
    const scaleInstanceId = await initializeScale(
      patientId,
      visitId,
      scaleCode,
    );
    return { patientId, visitId, scaleInstanceId };
  }

  async function initializeScale(
    patientId: string,
    visitId: string,
    scaleCode: string,
  ): Promise<string> {
    const response = await doctorAgent
      .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
      .send({ scaleCode })
      .expect(201);
    return stringValue(
      record(body(response).scaleInstance, 'scale instance').id,
      'scale instance id',
    );
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
          operatorNote: 'A20 source operator note must not enter narrative',
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
          .field(
            'description',
            'A20 media description must not enter narrative',
          )
          .attach('file', VALID_PNG, {
            filename: 'a20-test.png',
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

  async function createConfirmedScore(fixture: Fixture): Promise<string> {
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
            reviewNote: 'A20 de-identified manual review',
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
          reviewNote: 'A20 de-identified score confirmation',
          expectedUpdatedAt: stringValue(
            scoreResult.updatedAt,
            'score updatedAt',
          ),
        })
        .expect(200),
    );
    expect(record(confirmed.scoreResult, 'confirmed score').status).toBe(
      'confirmed',
    );
    return scoreResultId;
  }

  async function createDomainResult(fixture: Fixture): Promise<string> {
    const response = body(
      await doctorAgent
        .post(`${instancePath(fixture)}/cognitive-domain-results/compute`)
        .send({ confirm: true })
        .expect(200),
    );
    return stringValue(
      record(response.cognitiveDomainResult, 'domain result').id,
      'domain result id',
    );
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
    reportModel = app.get(getModelToken(ClinicalReport.name));
    definitionModel = app.get(getModelToken(ScaleDefinition.name));
    versionModel = app.get(getModelToken(ScaleVersion.name));
    modelsReady = true;
    await cleanup();
    const passwordHash = await authService.hashPassword(PASSWORD);
    await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A20 Doctor Test Operator',
      staffCode: 'STAFF-A20-TEST',
      email: 'doctor-a20-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A20 System Test Operator',
      staffCode: 'SYSTEM-A20-TEST',
      email: 'system-a20-test@example.test',
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

  it('enforces authentication and clinical workflow roles', async () => {
    const fixture = {
      patientId: '507f1f77bcf86cd799439021',
      visitId: '507f1f77bcf86cd799439022',
      scaleInstanceId: '507f1f77bcf86cd799439023',
    };
    await request(server)
      .get(`${reportBasePath(fixture)}/latest`)
      .expect(401);
    await request(server)
      .post(`${reportBasePath(fixture)}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [fixture.scaleInstanceId],
      })
      .expect(401);
    await systemAgent.get(`${reportBasePath(fixture)}/latest`).expect(403);
    await systemAgent
      .post(`${reportBasePath(fixture)}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [fixture.scaleInstanceId],
      })
      .expect(403);
  });

  it('rejects cross-visit scope ownership without revealing the instance', async () => {
    const target = await createFixture('CROSS-A');
    const other = await createFixture('CROSS-B');
    const response = await doctorAgent
      .post(`${reportBasePath(target)}/generate`)
      .send({ confirm: true, primaryScaleInstanceIds: [other.scaleInstanceId] })
      .expect(404);
    expect(body(response).code).toBe('SCALE_INSTANCE_NOT_FOUND');
  });

  it('creates, safely reads and idempotently preserves an A20 report', async () => {
    const fixture = await createFixture('MAIN');
    const basePath = reportBasePath(fixture);
    const missing = await doctorAgent.get(`${basePath}/latest`).expect(404);
    expect(body(missing).code).toBe('CLINICAL_REPORT_NOT_FOUND');

    const confirmationMissing = await doctorAgent
      .post(`${basePath}/generate`)
      .send({ primaryScaleInstanceIds: [fixture.scaleInstanceId] })
      .expect(400);
    expect(body(confirmationMissing).code).toBe(
      'CLINICAL_REPORT_GENERATION_CONFIRMATION_REQUIRED',
    );
    const confirmationFalse = await doctorAgent
      .post(`${basePath}/generate`)
      .send({
        confirm: false,
        primaryScaleInstanceIds: [fixture.scaleInstanceId],
      })
      .expect(400);
    expect(body(confirmationFalse).code).toBe(
      'CLINICAL_REPORT_GENERATION_CONFIRMATION_REQUIRED',
    );
    await doctorAgent
      .post(`${basePath}/generate`)
      .send({ confirm: true, primaryScaleInstanceIds: [] })
      .expect(400);
    await doctorAgent
      .post(`${basePath}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [
          fixture.scaleInstanceId,
          fixture.scaleInstanceId.toUpperCase(),
        ],
      })
      .expect(400);
    await doctorAgent
      .post(`${basePath}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [fixture.scaleInstanceId],
        status: 'confirmed',
        narrative: {},
        metadata: {},
        useAi: true,
        force: true,
      })
      .expect(400);

    const scaleNotReady = await doctorAgent
      .post(`${basePath}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [fixture.scaleInstanceId],
      })
      .expect(409);
    expect(body(scaleNotReady).code).toBe(
      'CLINICAL_REPORT_SOURCE_SCALE_NOT_READY',
    );
    await completeAndSubmit(fixture);
    const scoreNotFinal = await doctorAgent
      .post(`${basePath}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [fixture.scaleInstanceId],
      })
      .expect(409);
    expect(body(scoreNotFinal).code).toBe(
      'CLINICAL_REPORT_SOURCE_SCORE_NOT_FINAL',
    );
    const scoreResultId = await createConfirmedScore(fixture);
    const domainRequired = await doctorAgent
      .post(`${basePath}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [fixture.scaleInstanceId],
      })
      .expect(409);
    expect(body(domainRequired).code).toBe(
      'CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_REQUIRED',
    );
    const domainResultId = await createDomainResult(fixture);

    const sourceInstanceBefore = await instanceModel
      .findById(fixture.scaleInstanceId)
      .select({ updatedAt: 1 })
      .lean()
      .exec();
    const sourceScoreBefore = await scoreModel
      .findById(scoreResultId)
      .select({ updatedAt: 1 })
      .lean()
      .exec();
    const sourceDomainBefore = await domainModel
      .findById(domainResultId)
      .select({ updatedAt: 1 })
      .lean()
      .exec();
    const mediaBefore = await mediaModel
      .find({ scaleInstanceId: fixture.scaleInstanceId })
      .select({ _id: 1, updatedAt: 1 })
      .sort({ _id: 1 })
      .lean()
      .exec();

    const generatedResponse = await doctorAgent
      .post(`${basePath}/generate`)
      .send({
        confirm: true,
        primaryScaleInstanceIds: [fixture.scaleInstanceId],
      })
      .expect(200);
    const generated = body(generatedResponse);
    expect(generated.alreadyGenerated).toBe(false);
    const report = record(generated.report, 'report');
    expect(report.reportCode).toMatch(/^RPT-[A-F0-9]{24}$/);
    expect(report.reportType).toBe('cognitive_assessment');
    expect(report.reportVersion).toBe(1);
    expect(report.status).toBe('draft');
    expect(report.source).toBe('system_draft');
    expect(report.qualityStatus).toBe('unchecked');
    expect(report.isFinal).toBe(false);
    expect(record(report.patientSnapshot, 'patient snapshot')).toEqual({
      subjectCode: 'SUBJ-A20-TEST-MAIN',
      displayName: 'A20 De-identified Subject',
      sex: 'unknown',
      birthDate: null,
      educationYears: 12,
    });
    expect(record(report.visitSnapshot, 'visit snapshot')).not.toHaveProperty(
      'clinicalContext',
    );
    expect(arrayValue(report.scaleTraces, 'scale traces')).toHaveLength(1);
    expect(arrayValue(report.scoreSnapshots, 'score snapshots')).toHaveLength(
      1,
    );
    expect(
      arrayValue(report.domainSnapshots, 'domain snapshots').length,
    ).toBeGreaterThan(0);
    expect(
      arrayValue(report.evidenceSnapshots, 'evidence snapshots').length,
    ).toBeGreaterThan(0);
    const narrative = record(report.narrative, 'narrative');
    expect(Object.keys(narrative).sort()).toEqual(
      [
        'chiefSummary',
        'domainSummary',
        'evidenceSummary',
        'limitations',
        'scoreSummary',
      ].sort(),
    );
    const narrativeText = JSON.stringify(narrative);
    expect(narrativeText).not.toContain('must not enter');
    expect(narrativeText).toContain('未使用 AI');
    const generation = record(report.generation, 'generation');
    expect(generation).toEqual(
      expect.objectContaining({
        includedScaleInstanceCount: 1,
        scoreResultCount: 1,
        cognitiveDomainResultCount: 1,
        aiUsed: false,
      }),
    );
    const forbiddenKeys = [
      'patientId',
      'assessmentVisitId',
      'primaryScaleInstanceIds',
      'scoreResultIds',
      'cognitiveDomainResultIds',
      'mediaEvidenceIds',
      'scoreResultId',
      'scoreDetails',
      'cognitiveDomainResultId',
      'mediaEvidenceId',
      'itemResponseId',
      'storageObjectKey',
      'clinicalContext',
      'metadata',
      'qualityHints',
      'draftText',
      'signatureText',
    ];
    const publicKeys = collectKeys(report);
    forbiddenKeys.forEach((key) => expect(publicKeys.has(key)).toBe(false));

    const stored = await reportModel
      .findOne({ assessmentVisitId: fixture.visitId, reportVersion: 1 })
      .exec();
    expect(stored).not.toBeNull();
    expect(stored?.reportType).toBe('cognitive_assessment');
    expect(stored?.status).toBe('draft');
    expect(stored?.source).toBe('system_draft');
    expect(stored?.visitSnapshot?.clinicalContext).toBeNull();
    expect(stored?.scoreSnapshots[0]?.scoreDetails).toBeNull();
    expect(stored?.evidenceSnapshots[0]?.storageObjectKey).toBeTruthy();
    expect(stored?.aiDraft).toEqual(
      expect.objectContaining({ status: 'not_requested', doctorEdited: false }),
    );
    expect(stored?.confirmation).toBeNull();
    expect(stored?.correctionRecords).toEqual([]);
    const storedMetadata = record(stored?.metadata, 'stored metadata');
    expect(record(storedMetadata.a20Generation, 'generation metadata')).toEqual(
      expect.objectContaining({
        engineVersion: 'a20-clinical-report-draft-1.0',
        reportScope: 'explicit_primary_scale_instances',
        aiUsed: false,
      }),
    );

    const latest = body(
      await doctorAgent.get(`${basePath}/latest`).expect(200),
    );
    expect(record(latest.report, 'latest report').reportCode).toBe(
      report.reportCode,
    );
    const originalCreatedAt = documentValue(stored, 'createdAt');
    const originalNarrative = JSON.stringify(
      documentValue(stored, 'narrative'),
    );
    const duplicate = body(
      await doctorAgent
        .post(`${basePath}/generate`)
        .send({
          confirm: true,
          primaryScaleInstanceIds: [fixture.scaleInstanceId.toUpperCase()],
        })
        .expect(200),
    );
    expect(duplicate.alreadyGenerated).toBe(true);
    const storedAfterDuplicate = await reportModel.findById(stored?._id).exec();
    expect(documentValue(storedAfterDuplicate, 'createdAt')).toEqual(
      originalCreatedAt,
    );
    expect(
      JSON.stringify(documentValue(storedAfterDuplicate, 'narrative')),
    ).toBe(originalNarrative);
    expect(
      await reportModel.countDocuments({ assessmentVisitId: fixture.visitId }),
    ).toBe(1);

    const mmseInstanceId = await initializeScale(
      fixture.patientId,
      fixture.visitId,
      'mmse',
    );
    const mmseFixture = { ...fixture, scaleInstanceId: mmseInstanceId };
    await completeAndSubmit(mmseFixture);
    await createConfirmedScore(mmseFixture);
    await createDomainResult(mmseFixture);
    const scopeConflict = await doctorAgent
      .post(`${basePath}/generate`)
      .send({ confirm: true, primaryScaleInstanceIds: [mmseInstanceId] })
      .expect(409);
    expect(body(scopeConflict).code).toBe('CLINICAL_REPORT_SCOPE_CONFLICT');

    expect(
      await instanceModel
        .findById(fixture.scaleInstanceId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
    ).toEqual(sourceInstanceBefore);
    expect(
      await scoreModel
        .findById(scoreResultId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
    ).toEqual(sourceScoreBefore);
    expect(
      await domainModel
        .findById(domainResultId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
    ).toEqual(sourceDomainBefore);
    expect(
      await mediaModel
        .find({ scaleInstanceId: fixture.scaleInstanceId })
        .select({ _id: 1, updatedAt: 1 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
    ).toEqual(mediaBefore);

    await patientModel.updateOne(
      { _id: fixture.patientId },
      { $set: { status: 'inactive' } },
    );
    await visitModel.updateOne(
      { _id: fixture.visitId },
      { $set: { status: 'locked', lockedAt: new Date() } },
    );
    await doctorAgent.get(`${basePath}/latest`).expect(200);
    const historicalDuplicate = body(
      await doctorAgent
        .post(`${basePath}/generate`)
        .send({
          confirm: true,
          primaryScaleInstanceIds: [fixture.scaleInstanceId],
        })
        .expect(200),
    );
    expect(historicalDuplicate.alreadyGenerated).toBe(true);
  });
});
