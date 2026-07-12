import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
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
  ScoreResult,
  ScoreResultDocument,
} from '../src/modules/scoring/schemas/score-result.schema';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const PASSWORD = 'A22-Test-Password!';
const ACCOUNTS = {
  doctor: 'doctor-a22-test',
  admin: 'admin-a22-test',
  nurse: 'nurse-a22-test',
  research_assistant: 'research-a22-test',
  system: 'system-a22-test',
} as const;
const SUBJECT_PREFIX = 'SUBJ-A22-TEST-';
const VISIT_PREFIX = 'VISIT-A22-TEST-';
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
type SupertestApp = Parameters<typeof request.agent>[0];

type Fixture = {
  patientId: string;
  visitId: string;
  reportId: string;
  primaryScaleInstanceId: string;
};

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

function timestampValue(
  document: { get(path: string): unknown },
  path: string,
): string {
  const value = document.get(path);
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`Expected ${path} timestamp`);
  }
  return value.toISOString();
}

function immutableReportContent(document: ClinicalReportDocument) {
  const value = document.toObject();
  return {
    confirmation: value.confirmation,
    narrative: value.narrative,
    patientSnapshot: value.patientSnapshot,
    visitSnapshot: value.visitSnapshot,
    scaleTraces: value.scaleTraces,
    scoreSnapshots: value.scoreSnapshots,
    domainSnapshots: value.domainSnapshots,
  };
}

describe('clinical report lock API (e2e)', () => {
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
  let server: SupertestApp;
  let doctorAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  let nurseAgent: ReturnType<typeof request.agent>;
  let researchAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let doctorId: Types.ObjectId;
  let modelsReady = false;

  async function cleanup(): Promise<void> {
    const users = await userModel
      .find({ accountName: { $in: Object.values(ACCOUNTS) } })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }
    const visits = await visitModel
      .find({ visitCode: /^VISIT-A22-TEST-/ })
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
    if (visitIds.length > 0) {
      await reportModel
        .deleteMany({ assessmentVisitId: { $in: visitIds } })
        .exec();
    }
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
    if (visitIds.length > 0) {
      await visitModel.deleteMany({ _id: { $in: visitIds } }).exec();
    }
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A22-TEST-/ }).exec();
    await userModel
      .deleteMany({ accountName: { $in: Object.values(ACCOUNTS) } })
      .exec();
  }

  async function createFixture(
    suffix: string,
    options: {
      patientStatus?: 'active' | 'inactive' | 'archived';
      visitStatus?: 'draft' | 'in_progress' | 'completed' | 'locked' | 'voided';
      reportStatus?:
        | 'draft'
        | 'pending_confirmation'
        | 'confirmed'
        | 'archived'
        | 'corrected'
        | 'voided';
    } = {},
  ): Promise<Fixture> {
    const patient = await patientModel.create({
      subjectCode: `${SUBJECT_PREFIX}${suffix}`,
      displayName: 'A22 De-identified Subject',
      sourceType: 'clinical',
      sex: 'unknown',
      handedness: 'unknown',
      status: options.patientStatus ?? 'active',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    const visit = await visitModel.create({
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      visitCode: `${VISIT_PREFIX}${suffix}`,
      visitType: 'baseline',
      status: options.visitStatus ?? 'completed',
      assessmentDate: new Date('2026-07-01T08:00:00.000Z'),
      startedAt: new Date('2026-07-01T08:00:00.000Z'),
      completedAt: new Date('2026-07-01T09:00:00.000Z'),
      lockedAt:
        options.visitStatus === 'locked'
          ? new Date('2026-07-01T10:00:00.000Z')
          : null,
      voidedAt:
        options.visitStatus === 'voided'
          ? new Date('2026-07-01T10:00:00.000Z')
          : null,
      clinicalContext: null,
      metadata: null,
    });
    const primaryScaleInstanceId = new Types.ObjectId();
    const scoreResultId = new Types.ObjectId();
    const domainResultId = new Types.ObjectId();
    const confirmedAt = new Date('2026-07-01T11:00:00.000Z');
    const reportStatus = options.reportStatus ?? 'confirmed';
    const report = await reportModel.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      primaryScaleInstanceIds: [primaryScaleInstanceId],
      scoreResultIds: [scoreResultId],
      cognitiveDomainResultIds: [domainResultId],
      mediaEvidenceIds: [],
      subjectCode: patient.subjectCode,
      reportCode: `RPT-${suffix}`,
      reportType: 'cognitive_assessment',
      status: reportStatus,
      reportVersion: 1,
      source: 'mixed',
      patientSnapshot: {
        subjectCode: patient.subjectCode,
        displayName: 'A22 De-identified Subject',
        sex: 'unknown',
        birthDate: null,
        educationYears: null,
      },
      visitSnapshot: {
        visitCode: visit.visitCode,
        visitType: 'baseline',
        assessmentDate: visit.assessmentDate,
        operatorName: 'A22 Test Doctor',
        operatorRole: 'doctor',
        clinicalContext: null,
      },
      scaleTraces: [
        { scaleInstanceId: primaryScaleInstanceId, scaleCode: 'moca' },
      ],
      scoreSnapshots: [
        {
          scoreResultId,
          scaleCode: 'moca',
          totalScoreValue: 20,
          totalMaxScore: 30,
          totalMinScore: 0,
          scorePercent: 66.67,
          scoreStatus: 'confirmed',
          qualityStatus: 'passed',
          scoreDetails: null,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: domainResultId,
          scaleCode: 'moca',
          domainCode: 'memory',
          scoreValue: 4,
          maxScore: 5,
          scorePercent: 80,
          weightedScore: 4,
          weightedMaxScore: 5,
          itemCount: 1,
          needsReviewItemCount: 0,
        },
      ],
      evidenceSnapshots: [],
      narrative: {
        chiefSummary: 'A22 de-identified rule summary',
        scoreSummary: 'A22 de-identified score summary',
        domainSummary: 'A22 de-identified domain summary',
        evidenceSummary: 'A22 de-identified evidence summary',
        limitations: 'A22 de-identified limitation summary',
        doctorOpinion: 'A22 de-identified clinician opinion',
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: {
        confirmedAt,
        confirmedBy: doctorId,
        confirmedByName: 'A22 Test Doctor',
        confirmedByRole: 'doctor',
        confirmationNote: 'A22 de-identified confirmation note',
      },
      lockedAt: null,
      lockedBy: null,
      archivedAt: null,
      archivedBy: null,
      correctionRecords: [],
      voidedAt: reportStatus === 'voided' ? confirmedAt : null,
      voidedBy: null,
      auditLogRefs: [],
      qualityStatus: 'passed',
      qualityHints: null,
      metadata: {
        a20Generation: {
          version: 1,
          generationId: `generation-${suffix}`,
          generatedAt: new Date('2026-07-01T09:30:00.000Z'),
          generatedBy: doctorId.toString(),
          generatedByName: 'A22 Test Doctor',
          generatedByRole: 'doctor',
          engineVersion: 'a20-clinical-report-draft-1.0',
          reportScope: 'explicit_primary_scale_instances',
          primaryScaleInstanceIds: [primaryScaleInstanceId.toString()],
          scoreResultIds: [scoreResultId.toString()],
          cognitiveDomainResultIds: [domainResultId.toString()],
          mediaEvidenceCount: 0,
          aiUsed: false,
        },
        a21Submission: {
          version: 1,
          submissionId: `submission-${suffix}`,
          submittedAt: new Date('2026-07-01T10:00:00.000Z'),
          submittedBy: doctorId.toString(),
          submittedByName: 'A22 Test Doctor',
          submittedByRole: 'doctor',
          submissionNote: 'A22 de-identified submission note',
        },
        a21Confirmation: {
          version: 1,
          confirmationId: `confirmation-${suffix}`,
          confirmedAt,
          confirmedBy: doctorId.toString(),
          confirmedByName: 'A22 Test Doctor',
          confirmedByRole: 'doctor',
          confirmationNote: 'A22 de-identified confirmation note',
        },
        futureNamespace: { preserved: true },
      },
    });
    return {
      patientId: patient._id.toString(),
      visitId: visit._id.toString(),
      reportId: report._id.toString(),
      primaryScaleInstanceId: primaryScaleInstanceId.toString(),
    };
  }

  function instancePath(fixture: Fixture): string {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/scale-instances/${fixture.primaryScaleInstanceId}`;
  }

  async function createHttpFixture(suffix: string): Promise<Fixture> {
    const patientResponse = await doctorAgent
      .post('/patients')
      .send({
        subjectCode: `${SUBJECT_PREFIX}${suffix}`,
        displayName: 'A22 De-identified HTTP Subject',
        sex: 'unknown',
        educationYears: 12,
      })
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
    const instanceResponse = body(
      await doctorAgent
        .post(`/patients/${patientId}/visits/${visitId}/scale-instances`)
        .send({ scaleCode: 'moca' })
        .expect(201),
    );
    const primaryScaleInstanceId = stringValue(
      record(instanceResponse.scaleInstance, 'scale instance').id,
      'scale instance id',
    );
    const fixture = {
      patientId,
      visitId,
      reportId: '',
      primaryScaleInstanceId,
    };
    await completeAndSubmitHttpFixture(fixture);
    await createConfirmedScoreForHttpFixture(fixture);
    await doctorAgent
      .post(`${instancePath(fixture)}/cognitive-domain-results/compute`)
      .send({ confirm: true })
      .expect(200);
    const reportBasePath = `/patients/${patientId}/visits/${visitId}/clinical-reports`;
    const generated = record(
      body(
        await doctorAgent
          .post(`${reportBasePath}/generate`)
          .send({
            confirm: true,
            primaryScaleInstanceIds: [primaryScaleInstanceId],
          })
          .expect(200),
      ).report,
      'generated report',
    );
    fixture.reportId = stringValue(generated.id, 'report id');
    const edited = record(
      body(
        await doctorAgent
          .patch(`${reportBasePath}/${fixture.reportId}/draft`)
          .send({
            doctorOpinion: 'A22 de-identified HTTP clinician opinion',
            editNote: 'A22 de-identified HTTP edit note',
            expectedUpdatedAt: generated.updatedAt,
          })
          .expect(200),
      ).report,
      'edited report',
    );
    const submitted = record(
      body(
        await doctorAgent
          .post(`${reportBasePath}/${fixture.reportId}/submit-confirmation`)
          .send({
            confirm: true,
            submissionNote: 'A22 de-identified HTTP submission note',
            expectedUpdatedAt: edited.updatedAt,
          })
          .expect(200),
      ).report,
      'submitted report',
    );
    const confirmed = record(
      body(
        await doctorAgent
          .post(`${reportBasePath}/${fixture.reportId}/confirm`)
          .send({
            confirm: true,
            confirmationNote: 'A22 de-identified HTTP confirmation note',
            expectedUpdatedAt: submitted.updatedAt,
          })
          .expect(200),
      ).report,
      'confirmed report',
    );
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.lockedAt).toBeNull();
    return fixture;
  }

  async function completeAndSubmitHttpFixture(fixture: Fixture): Promise<void> {
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
          operatorNote: 'A22 de-identified HTTP operator note',
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
            filename: 'a22-test.png',
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

  async function createConfirmedScoreForHttpFixture(
    fixture: Fixture,
  ): Promise<void> {
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
        'review target',
      );
      const itemResponseId = stringValue(
        target.itemResponseId,
        'review item response id',
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
            reviewNote: 'A22 de-identified HTTP score review',
            expectedUpdatedAt: scoreResult.updatedAt,
          })
          .expect(200),
      );
      scoreResult = record(response.scoreResult, 'reviewed score result');
    }
    await doctorAgent
      .post(`${instancePath(fixture)}/score-results/${scoreResultId}/confirm`)
      .send({
        confirm: true,
        reviewNote: 'A22 de-identified HTTP score confirmation',
        expectedUpdatedAt: scoreResult.updatedAt,
      })
      .expect(200);
  }

  function lockPath(fixture: Fixture): string {
    return `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports/${fixture.reportId}/lock`;
  }

  async function currentReport(fixture: Fixture) {
    const report = await reportModel.findById(fixture.reportId).exec();
    if (!report) throw new Error('Expected stored clinical report');
    return report;
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
    domainModel = app.get(getModelToken(CognitiveDomainResult.name));
    reportModel = app.get(getModelToken(ClinicalReport.name));
    modelsReady = true;
    await cleanup();
    const passwordHash = await authService.hashPassword(PASSWORD);
    for (const [role, accountName] of Object.entries(ACCOUNTS)) {
      await userModel.create({
        accountName,
        displayName: `A22 ${role} Test Operator`,
        staffCode: `STAFF-A22-${role.toUpperCase()}`,
        email: `${accountName}@example.test`,
        passwordHash,
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        metadata: null,
      });
    }
    const doctor = await userModel.findOne({ accountName: ACCOUNTS.doctor });
    if (!doctor) throw new Error('Expected A22 doctor account');
    doctorId = doctor._id;
    server = app.getHttpServer() as SupertestApp;
    doctorAgent = request.agent(server);
    adminAgent = request.agent(server);
    nurseAgent = request.agent(server);
    researchAgent = request.agent(server);
    systemAgent = request.agent(server);
    for (const [agent, accountName] of [
      [doctorAgent, ACCOUNTS.doctor],
      [adminAgent, ACCOUNTS.admin],
      [nurseAgent, ACCOUNTS.nurse],
      [researchAgent, ACCOUNTS.research_assistant],
      [systemAgent, ACCOUNTS.system],
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

  it('enforces authentication and doctor/admin roles', async () => {
    const path =
      '/patients/507f1f77bcf86cd799439011/visits/507f1f77bcf86cd799439012/clinical-reports/507f1f77bcf86cd799439013/lock';
    const payload = {
      confirm: true,
      lockNote: 'A22 de-identified lock note',
      expectedUpdatedAt: '2026-07-12T08:00:00.000Z',
    };
    await request(server).post(path).send(payload).expect(401);
    await systemAgent.post(path).send(payload).expect(403);
    await nurseAgent.post(path).send(payload).expect(403);
    await researchAgent.post(path).send(payload).expect(403);
  });

  it('locks once, returns safe public audit, and repeats idempotently', async () => {
    const fixture = await createFixture('MAIN');
    const basePath = `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports`;
    const latestBefore = record(
      body(await doctorAgent.get(`${basePath}/latest`).expect(200)).report,
      'latest report before lock',
    );
    expect(latestBefore.status).toBe('confirmed');
    expect(latestBefore.isFinal).toBe(true);
    expect(latestBefore.lockedAt).toBeNull();
    expect(latestBefore.lock).toBeNull();
    const expectedUpdatedAt = stringValue(
      latestBefore.updatedAt,
      'report updatedAt',
    );
    const path = lockPath(fixture);
    await doctorAgent
      .post(path)
      .send({
        lockNote: 'A22 de-identified lock note',
        expectedUpdatedAt,
      })
      .expect(400)
      .expect((response) => {
        expect(body(response).code).toBe(
          'CLINICAL_REPORT_LOCK_CONFIRMATION_REQUIRED',
        );
      });
    await doctorAgent
      .post(path)
      .send({
        confirm: false,
        lockNote: 'A22 de-identified lock note',
        expectedUpdatedAt,
      })
      .expect(400);
    await doctorAgent
      .post(path)
      .send({
        confirm: 'true',
        lockNote: 'A22 de-identified lock note',
        expectedUpdatedAt,
      })
      .expect(400)
      .expect((response) => {
        expect(body(response).code).toBe(
          'CLINICAL_REPORT_LOCK_CONFIRMATION_REQUIRED',
        );
      });
    await doctorAgent
      .post(path)
      .send({
        confirm: true,
        lockNote: 'A22 de-identified lock note',
        expectedUpdatedAt,
        status: 'confirmed',
        lockedBy: doctorId.toString(),
        metadata: {},
      })
      .expect(400);

    const before = await currentReport(fixture);
    const originalContent = immutableReportContent(before);
    const lockedBody = body(
      await doctorAgent
        .post(path)
        .send({
          confirm: true,
          lockNote: '  A22 de-identified lock note  ',
          expectedUpdatedAt,
        })
        .expect(200),
    );
    const locked = record(lockedBody.report, 'locked report');
    const receipt = record(lockedBody.lockReceipt, 'lock receipt');
    expect(locked.status).toBe('confirmed');
    expect(locked.qualityStatus).toBe('passed');
    expect(locked.isFinal).toBe(true);
    expect(typeof locked.lockedAt).toBe('string');
    expect(record(locked.lock, 'lock summary')).toEqual(
      expect.objectContaining({
        lockId: receipt.lockId,
        lockedAt: receipt.lockedAt,
        lockNote: 'A22 de-identified lock note',
      }),
    );
    expect(receipt.alreadyLocked).toBe(false);
    const serialized = JSON.stringify(lockedBody);
    expect(serialized).not.toContain('metadata');
    expect(locked).not.toHaveProperty('lockedBy');

    const repeated = record(
      body(
        await doctorAgent
          .post(path)
          .send({
            confirm: true,
            lockNote: 'must not replace original note',
            expectedUpdatedAt,
          })
          .expect(200),
      ).lockReceipt,
      'repeated lock receipt',
    );
    expect(repeated).toEqual({ ...receipt, alreadyLocked: true });
    const latestAfter = record(
      body(await doctorAgent.get(`${basePath}/latest`).expect(200)).report,
      'latest report after lock',
    );
    expect(latestAfter.lock).toEqual(locked.lock);

    const stored = await currentReport(fixture);
    expect(stored.status).toBe('confirmed');
    expect(stored.qualityStatus).toBe('passed');
    expect(immutableReportContent(stored)).toEqual(originalContent);
    expect(record(stored.metadata?.a22Lock, 'stored A22 audit')).toEqual(
      expect.objectContaining({
        lockId: receipt.lockId,
        lockNote: 'A22 de-identified lock note',
        lockedBy: doctorId.toString(),
        lockedByRole: 'doctor',
      }),
    );
    expect(stored.metadata?.futureNamespace).toEqual({ preserved: true });
  });

  it('returns stable state, ownership and optimistic concurrency errors', async () => {
    const draft = await createFixture('DRAFT', { reportStatus: 'draft' });
    const draftReport = await currentReport(draft);
    await doctorAgent
      .post(lockPath(draft))
      .send({
        confirm: true,
        lockNote: 'A22 draft state test',
        expectedUpdatedAt: timestampValue(draftReport, 'updatedAt'),
      })
      .expect(409)
      .expect((response) => {
        expect(body(response).code).toBe('CLINICAL_REPORT_NOT_LOCKABLE');
      });

    const inactive = await createFixture('INACTIVE', {
      patientStatus: 'inactive',
    });
    const inactiveReport = await currentReport(inactive);
    await doctorAgent
      .post(lockPath(inactive))
      .send({
        confirm: true,
        lockNote: 'A22 inactive patient test',
        expectedUpdatedAt: timestampValue(inactiveReport, 'updatedAt'),
      })
      .expect(409)
      .expect((response) => {
        expect(body(response).code).toBe('PATIENT_NOT_ACTIVE');
      });

    const lockedVisit = await createFixture('LOCKED-VISIT', {
      visitStatus: 'locked',
    });
    const lockedVisitReport = await currentReport(lockedVisit);
    await doctorAgent
      .post(lockPath(lockedVisit))
      .send({
        confirm: true,
        lockNote: 'A22 locked visit test',
        expectedUpdatedAt: timestampValue(lockedVisitReport, 'updatedAt'),
      })
      .expect(409)
      .expect((response) => {
        expect(body(response).code).toBe('VISIT_NOT_EDITABLE');
      });

    const conflict = await createFixture('CONFLICT');
    const conflictReport = await currentReport(conflict);
    const staleUpdatedAt = timestampValue(conflictReport, 'updatedAt');
    await reportModel
      .updateOne(
        { _id: conflict.reportId },
        { $set: { operatorNote: 'A22 concurrent test marker' } },
      )
      .exec();
    await doctorAgent
      .post(lockPath(conflict))
      .send({
        confirm: true,
        lockNote: 'A22 conflict test',
        expectedUpdatedAt: staleUpdatedAt,
      })
      .expect(409)
      .expect((response) => {
        expect(body(response).code).toBe('CLINICAL_REPORT_LOCK_CONFLICT');
      });

    const other = await createFixture('OTHER');
    await doctorAgent
      .post(
        `/patients/${other.patientId}/visits/${other.visitId}/clinical-reports/${conflict.reportId}/lock`,
      )
      .send({
        confirm: true,
        lockNote: 'A22 ownership test',
        expectedUpdatedAt: staleUpdatedAt,
      })
      .expect(404);
  });

  it('allows admin to perform a first lock', async () => {
    const fixture = await createFixture('ADMIN');
    const report = await currentReport(fixture);
    const response = body(
      await adminAgent
        .post(lockPath(fixture))
        .send({
          confirm: true,
          lockNote: 'A22 admin lock test',
          expectedUpdatedAt: timestampValue(report, 'updatedAt'),
        })
        .expect(200),
    );
    expect(
      record(
        record(response.lockReceipt, 'admin receipt').lockedBy,
        'admin actor',
      ).operatorRole,
    ).toBe('admin');
  });

  it('locks a report created through the A12-A21 public HTTP chain', async () => {
    const fixture = await createHttpFixture('HTTP-CHAIN');
    const before = await currentReport(fixture);
    const response = body(
      await doctorAgent
        .post(lockPath(fixture))
        .send({
          confirm: true,
          lockNote: 'A22 de-identified full-chain lock note',
          expectedUpdatedAt: timestampValue(before, 'updatedAt'),
        })
        .expect(200),
    );
    const locked = record(response.report, 'full-chain locked report');
    expect(locked.status).toBe('confirmed');
    expect(locked.qualityStatus).toBe('passed');
    expect(locked.isFinal).toBe(true);
    expect(
      record(response.lockReceipt, 'full-chain receipt').alreadyLocked,
    ).toBe(false);
  });
});
