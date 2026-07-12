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

const DOCTOR_ACCOUNT = 'doctor-a21-test';
const SYSTEM_ACCOUNT = 'system-a21-test';
const NURSE_ACCOUNT = 'nurse-a21-test';
const RESEARCH_ACCOUNT = 'research-a21-test';
const ADMIN_ACCOUNT = 'admin-a21-test';
const PASSWORD = 'A21-Test-Password!';
const SUBJECT_PREFIX = 'SUBJ-A21-TEST-';
const VISIT_PREFIX = 'VISIT-A21-TEST-';
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

describe('clinical report review APIs (e2e)', () => {
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
  let nurseAgent: ReturnType<typeof request.agent>;
  let researchAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  let server: SupertestApp;
  let modelsReady = false;

  function instancePath(fixture: Fixture): string {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${fixture.scaleInstanceId}`;
  }

  function reportBasePath(fixture: Pick<Fixture, 'patientId' | 'visitId'>) {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports`;
  }

  async function cleanup(removeScaleCatalog = false): Promise<void> {
    const users = await userModel
      .find({
        accountName: {
          $in: [
            DOCTOR_ACCOUNT,
            SYSTEM_ACCOUNT,
            NURSE_ACCOUNT,
            RESEARCH_ACCOUNT,
            ADMIN_ACCOUNT,
          ],
        },
      })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0)
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    const visits = await visitModel
      .find({ visitCode: /^VISIT-A21-TEST-/ })
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
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A21-TEST-/ }).exec();
    await userModel
      .deleteMany({
        accountName: {
          $in: [
            DOCTOR_ACCOUNT,
            SYSTEM_ACCOUNT,
            NURSE_ACCOUNT,
            RESEARCH_ACCOUNT,
            ADMIN_ACCOUNT,
          ],
        },
      })
      .exec();
    if (removeScaleCatalog) {
      await versionModel
        .deleteMany({ scaleCode: { $in: ['mmse', 'moca'] } })
        .exec();
      const definitions = await definitionModel
        .find({ code: { $in: ['mmse', 'moca'] } })
        .select({ _id: 1 })
        .exec();
      const definitionIds = definitions.map((definition) => definition._id);
      if (definitionIds.length > 0) {
        await definitionModel
          .deleteMany({ _id: { $in: definitionIds } })
          .exec();
      }
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
        displayName: 'A21 De-identified Subject',
        sex: 'unknown',
        educationYears: 12,
        notes: 'A21 source note must not enter report narrative',
      })
      .expect(201);
    const patientId = stringValue(body(patientResponse).id, 'patient id');
    const visitResponse = await doctorAgent
      .post(`/patients/${patientId}/visits`)
      .send({
        visitCode: `${VISIT_PREFIX}${suffix}`,
        assessmentDate: '2026-07-01T08:00:00.000Z',
        notes: 'A21 visit note must not enter report narrative',
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
    const detailResponse = await doctorAgent.get(instancePath(fixture));
    if (detailResponse.status !== 200) {
      throw new Error(
        `Scale detail setup failed: ${String(body(detailResponse).code)}`,
      );
    }
    const detail = body(detailResponse);
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
          operatorNote: 'A21 source operator note must not enter narrative',
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
            'A21 media description must not enter narrative',
          )
          .attach('file', VALID_PNG, {
            filename: 'a21-test.png',
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
            reviewNote: 'A21 de-identified manual review',
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
          reviewNote: 'A21 de-identified score confirmation',
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
    await cleanup(true);
    const passwordHash = await authService.hashPassword(PASSWORD);
    await userModel.create({
      accountName: DOCTOR_ACCOUNT,
      displayName: 'A21 Doctor Test Operator',
      staffCode: 'STAFF-A21-TEST',
      email: 'doctor-a21-test@example.test',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
      metadata: null,
    });
    for (const [accountName, role] of [
      [NURSE_ACCOUNT, 'nurse'],
      [RESEARCH_ACCOUNT, 'research_assistant'],
      [ADMIN_ACCOUNT, 'admin'],
    ] as const) {
      await userModel.create({
        accountName,
        displayName: `A21 ${role} Test Operator`,
        staffCode: `STAFF-A21-${role.toUpperCase()}`,
        email: `${accountName}@example.test`,
        passwordHash,
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        metadata: null,
      });
    }
    await userModel.create({
      accountName: SYSTEM_ACCOUNT,
      displayName: 'A21 System Test Operator',
      staffCode: 'SYSTEM-A21-TEST',
      email: 'system-a21-test@example.test',
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
    nurseAgent = request.agent(server);
    researchAgent = request.agent(server);
    adminAgent = request.agent(server);
    await doctorAgent
      .post('/auth/login')
      .send({ accountName: DOCTOR_ACCOUNT, password: PASSWORD })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({ accountName: SYSTEM_ACCOUNT, password: PASSWORD })
      .expect(201);
    for (const [agent, accountName] of [
      [nurseAgent, NURSE_ACCOUNT],
      [researchAgent, RESEARCH_ACCOUNT],
      [adminAgent, ADMIN_ACCOUNT],
    ] as const) {
      await agent
        .post('/auth/login')
        .send({ accountName, password: PASSWORD })
        .expect(201);
    }
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
    const resourcePath = `${reportBasePath(fixture)}/${fixture.scaleInstanceId}`;
    await request(server).patch(`${resourcePath}/draft`).send({}).expect(401);
    await request(server)
      .post(`${resourcePath}/submit-confirmation`)
      .send({})
      .expect(401);
    await request(server).post(`${resourcePath}/confirm`).send({}).expect(401);
    await systemAgent.patch(`${resourcePath}/draft`).send({}).expect(403);
    await systemAgent
      .post(`${resourcePath}/submit-confirmation`)
      .send({})
      .expect(403);
    await systemAgent.post(`${resourcePath}/confirm`).send({}).expect(403);
  });

  it('edits, submits and confirms one controlled report without changing sources', async () => {
    const fixture = await createFixture('REVIEW-MAIN');
    await completeAndSubmit(fixture);
    await createConfirmedScore(fixture);
    await createDomainResult(fixture);
    const basePath = reportBasePath(fixture);
    const generatedBody = body(
      await doctorAgent
        .post(`${basePath}/generate`)
        .send({
          confirm: true,
          primaryScaleInstanceIds: [fixture.scaleInstanceId],
        })
        .expect(200),
    );
    const generated = record(generatedBody.report, 'generated report');
    const reportId = stringValue(generated.id, 'report id');
    const draftPath = `${basePath}/${reportId}/draft`;
    const submitPath = `${basePath}/${reportId}/submit-confirmation`;
    const confirmPath = `${basePath}/${reportId}/confirm`;
    const generatedUpdatedAt = stringValue(
      generated.updatedAt,
      'generated report updatedAt',
    );
    const originalNarrative = record(
      generated.narrative,
      'generated narrative',
    );
    const originalScaleTraces = generated.scaleTraces;
    const originalScoreSnapshots = generated.scoreSnapshots;
    const originalDomainSnapshots = generated.domainSnapshots;
    const sourceBefore = await instanceModel.findById(fixture.scaleInstanceId);
    const itemCountBefore = await itemModel.countDocuments({
      scaleInstanceId: fixture.scaleInstanceId,
    });
    const scoreBefore = await scoreModel.findOne({
      scaleInstanceId: fixture.scaleInstanceId,
      runNo: 1,
    });
    const domainBefore = await domainModel.findOne({
      scaleInstanceId: fixture.scaleInstanceId,
      runNo: 1,
    });

    await doctorAgent
      .patch(draftPath)
      .send({ doctorOpinion: '脱敏测试意见', editNote: '脱敏修改依据' })
      .expect(400);
    await doctorAgent
      .patch(draftPath)
      .send({
        doctorOpinion: 'ab',
        editNote: '脱敏修改依据',
        expectedUpdatedAt: generatedUpdatedAt,
      })
      .expect(400);
    await doctorAgent
      .patch(draftPath)
      .send({
        doctorOpinion: '脱敏测试意见',
        editNote: '脱敏修改依据',
        expectedUpdatedAt: generatedUpdatedAt,
        status: 'confirmed',
        metadata: {},
      })
      .expect(400);

    const editedBody = body(
      await doctorAgent
        .patch(draftPath)
        .send({
          doctorOpinion: '  脱敏测试意见  ',
          recommendationText: '  通用测试建议  ',
          editNote: '  脱敏修改依据  ',
          expectedUpdatedAt: generatedUpdatedAt,
        })
        .expect(200),
    );
    const edited = record(editedBody.report, 'edited report');
    const editReceipt = record(editedBody.editReceipt, 'edit receipt');
    expect(edited.source).toBe('mixed');
    expect(record(edited.narrative, 'edited narrative')).toEqual({
      ...originalNarrative,
      doctorOpinion: '脱敏测试意见',
      recommendationText: '通用测试建议',
    });
    expect(edited.scaleTraces).toEqual(originalScaleTraces);
    expect(edited.scoreSnapshots).toEqual(originalScoreSnapshots);
    expect(edited.domainSnapshots).toEqual(originalDomainSnapshots);
    expect(editReceipt.changedFields).toEqual([
      'doctorOpinion',
      'recommendationText',
    ]);
    const editedUpdatedAt = stringValue(edited.updatedAt, 'edited updatedAt');

    const editConflict = body(
      await doctorAgent
        .patch(draftPath)
        .send({
          doctorOpinion: '第二次脱敏测试意见',
          editNote: '脱敏并发测试',
          expectedUpdatedAt: generatedUpdatedAt,
        })
        .expect(409),
    );
    expect(editConflict.code).toBe('CLINICAL_REPORT_EDIT_CONFLICT');
    const noChange = body(
      await doctorAgent
        .patch(draftPath)
        .send({
          doctorOpinion: ' 脱敏测试意见 ',
          recommendationText: ' 通用测试建议 ',
          editNote: '不产生事件',
          expectedUpdatedAt: editedUpdatedAt,
        })
        .expect(409),
    );
    expect(noChange.code).toBe('CLINICAL_REPORT_EDIT_NO_CHANGES');

    await doctorAgent
      .post(submitPath)
      .send({
        submissionNote: '脱敏提交说明',
        expectedUpdatedAt: editedUpdatedAt,
      })
      .expect(400);
    const submittedBody = body(
      await doctorAgent
        .post(submitPath)
        .send({
          confirm: true,
          submissionNote: '脱敏提交说明',
          expectedUpdatedAt: editedUpdatedAt,
        })
        .expect(200),
    );
    const submitted = record(submittedBody.report, 'submitted report');
    const submissionReceipt = record(
      submittedBody.submissionReceipt,
      'submission receipt',
    );
    expect(submitted.status).toBe('pending_confirmation');
    expect(submissionReceipt.alreadySubmitted).toBe(false);
    const submittedUpdatedAt = stringValue(
      submitted.updatedAt,
      'submitted updatedAt',
    );
    const repeatedSubmission = record(
      body(
        await doctorAgent
          .post(submitPath)
          .send({
            confirm: true,
            submissionNote: '不会覆盖原提交说明',
            expectedUpdatedAt: editedUpdatedAt,
          })
          .expect(200),
      ).submissionReceipt,
      'repeated submission receipt',
    );
    expect(repeatedSubmission.alreadySubmitted).toBe(true);
    expect(repeatedSubmission.submissionId).toBe(
      submissionReceipt.submissionId,
    );
    await doctorAgent
      .patch(draftPath)
      .send({
        doctorOpinion: '不可编辑',
        editNote: '状态边界测试',
        expectedUpdatedAt: submittedUpdatedAt,
      })
      .expect(409);
    await nurseAgent
      .post(confirmPath)
      .send({
        confirm: true,
        confirmationNote: '无权限',
        expectedUpdatedAt: submittedUpdatedAt,
      })
      .expect(403);
    await researchAgent
      .post(confirmPath)
      .send({
        confirm: true,
        confirmationNote: '无权限',
        expectedUpdatedAt: submittedUpdatedAt,
      })
      .expect(403);
    await doctorAgent
      .post(confirmPath)
      .send({
        confirmationNote: '脱敏确认说明',
        expectedUpdatedAt: submittedUpdatedAt,
      })
      .expect(400);
    const confirmationConflict = body(
      await doctorAgent
        .post(confirmPath)
        .send({
          confirm: true,
          confirmationNote: '脱敏确认说明',
          expectedUpdatedAt: editedUpdatedAt,
        })
        .expect(409),
    );
    expect(confirmationConflict.code).toBe(
      'CLINICAL_REPORT_CONFIRMATION_CONFLICT',
    );

    const confirmedBody = body(
      await doctorAgent
        .post(confirmPath)
        .send({
          confirm: true,
          confirmationNote: '脱敏确认说明',
          expectedUpdatedAt: submittedUpdatedAt,
        })
        .expect(200),
    );
    const confirmed = record(confirmedBody.report, 'confirmed report');
    const confirmationReceipt = record(
      confirmedBody.confirmationReceipt,
      'confirmation receipt',
    );
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.qualityStatus).toBe('passed');
    expect(confirmed.isFinal).toBe(true);
    expect(confirmed.lockedAt).toBeNull();
    expect(record(confirmed.confirmation, 'confirmation').confirmedByRole).toBe(
      'doctor',
    );
    expect(confirmationReceipt.alreadyConfirmed).toBe(false);
    const repeatedConfirmation = record(
      body(
        await doctorAgent
          .post(confirmPath)
          .send({
            confirm: true,
            confirmationNote: '不会覆盖原确认说明',
            expectedUpdatedAt: submittedUpdatedAt,
          })
          .expect(200),
      ).confirmationReceipt,
      'repeated confirmation receipt',
    );
    expect(repeatedConfirmation.alreadyConfirmed).toBe(true);
    expect(repeatedConfirmation.confirmationId).toBe(
      confirmationReceipt.confirmationId,
    );
    const latest = record(
      body(await doctorAgent.get(`${basePath}/latest`).expect(200)).report,
      'latest report',
    );
    const publicKeys = collectKeys(latest);
    expect(publicKeys.has('metadata')).toBe(false);
    expect(publicKeys.has('previousValues')).toBe(false);
    expect(publicKeys.has('nextValues')).toBe(false);
    expect(publicKeys.has('signatureText')).toBe(false);

    const stored = await reportModel.findById(reportId);
    expect(documentValue(stored, 'lockedAt')).toBeNull();
    expect(documentValue(stored, 'primaryScaleInstanceIds')).toEqual(
      expect.arrayContaining([expect.objectContaining({})]),
    );
    expect(
      (await instanceModel.findById(fixture.scaleInstanceId))?.status,
    ).toBe(sourceBefore?.status);
    expect(
      await itemModel.countDocuments({
        scaleInstanceId: fixture.scaleInstanceId,
      }),
    ).toBe(itemCountBefore);
    expect(
      documentValue(await scoreModel.findById(scoreBefore?._id), 'updatedAt'),
    ).toEqual(documentValue(scoreBefore, 'updatedAt'));
    expect(
      documentValue(await domainModel.findById(domainBefore?._id), 'updatedAt'),
    ).toEqual(documentValue(domainBefore, 'updatedAt'));
  });

  it('allows admin confirmation on a separately prepared report', async () => {
    const fixture = await createFixture('REVIEW-ADMIN');
    await completeAndSubmit(fixture);
    await createConfirmedScore(fixture);
    await createDomainResult(fixture);
    const basePath = reportBasePath(fixture);
    const generated = record(
      body(
        await doctorAgent
          .post(`${basePath}/generate`)
          .send({
            confirm: true,
            primaryScaleInstanceIds: [fixture.scaleInstanceId],
          })
          .expect(200),
      ).report,
      'admin generated report',
    );
    const reportId = stringValue(generated.id, 'admin report id');
    const edited = record(
      body(
        await doctorAgent
          .patch(`${basePath}/${reportId}/draft`)
          .send({
            doctorOpinion: '脱敏管理员确认测试意见',
            editNote: '脱敏管理员流程测试',
            expectedUpdatedAt: generated.updatedAt,
          })
          .expect(200),
      ).report,
      'admin edited report',
    );
    const submitted = record(
      body(
        await doctorAgent
          .post(`${basePath}/${reportId}/submit-confirmation`)
          .send({
            confirm: true,
            submissionNote: '脱敏管理员提交说明',
            expectedUpdatedAt: edited.updatedAt,
          })
          .expect(200),
      ).report,
      'admin submitted report',
    );
    const confirmed = record(
      body(
        await adminAgent
          .post(`${basePath}/${reportId}/confirm`)
          .send({
            confirm: true,
            confirmationNote: '脱敏管理员确认说明',
            expectedUpdatedAt: submitted.updatedAt,
          })
          .expect(200),
      ).report,
      'admin confirmed report',
    );
    expect(
      record(confirmed.confirmation, 'admin confirmation').confirmedByRole,
    ).toBe('admin');
  });
});
