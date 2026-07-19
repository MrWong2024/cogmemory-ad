import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  ASSESSMENT_STATUSES,
  AssessmentVisit,
  AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
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
  PATIENT_STATUSES,
  Patient,
  PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  CLINICAL_REPORT_STATUSES,
  ClinicalReport,
  ClinicalReportDocument,
} from '../src/modules/reports/schemas/clinical-report.schema';
import {
  ScoreResult,
  ScoreResultDocument,
} from '../src/modules/scoring/schemas/score-result.schema';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const DOCTOR_ACCOUNT = 'doctor-a27-history-test';
const NURSE_ACCOUNT = 'nurse-a27-history-test';
const RESEARCH_ACCOUNT = 'research-a27-history-test';
const ADMIN_ACCOUNT = 'admin-a27-history-test';
const SYSTEM_ACCOUNT = 'system-a27-history-test';
const TEST_ACCOUNTS = [
  DOCTOR_ACCOUNT,
  NURSE_ACCOUNT,
  RESEARCH_ACCOUNT,
  ADMIN_ACCOUNT,
  SYSTEM_ACCOUNT,
] as const;
const PASSWORD = 'A27-History-Test-Password!';
const SUBJECT_PREFIX = 'SUBJ-A27-HISTORY-';
const VISIT_PREFIX = 'VISIT-A27-HISTORY-';

type SupertestApp = Parameters<typeof request.agent>[0];

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

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} array`);
  return value;
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, nested]) => {
      keys.add(key);
      collectKeys(nested, keys);
    });
  }
  return keys;
}

describe('clinical history read APIs (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let instanceModel: Model<ScaleInstanceDocument>;
  let scoreModel: Model<ScoreResultDocument>;
  let domainModel: Model<CognitiveDomainResultDocument>;
  let reportModel: Model<ClinicalReportDocument>;
  let doctorAgent: ReturnType<typeof request.agent>;
  let nurseAgent: ReturnType<typeof request.agent>;
  let researchAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let server: SupertestApp;
  let ready = false;

  async function cleanup(): Promise<void> {
    const users = await userModel
      .find({ accountName: { $in: TEST_ACCOUNTS } })
      .select({ _id: 1 })
      .lean()
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }
    const patients = await patientModel
      .find({ subjectCode: new RegExp(`^${SUBJECT_PREFIX}`) })
      .select({ _id: 1 })
      .lean()
      .exec();
    const patientIds = patients.map((patient) => patient._id);
    if (patientIds.length > 0) {
      await reportModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await domainModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await scoreModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await instanceModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await visitModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await patientModel.deleteMany({ _id: { $in: patientIds } }).exec();
    }
    await userModel.deleteMany({ accountName: { $in: TEST_ACCOUNTS } }).exec();
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
      config.get<string>('llm.provider') !== 'stub'
    ) {
      throw new Error('E2E external service isolation is not active');
    }
    authService = app.get(AuthService);
    userModel = app.get(getModelToken(User.name));
    sessionModel = app.get(getModelToken(Session.name));
    patientModel = app.get(getModelToken(Patient.name));
    visitModel = app.get(getModelToken(AssessmentVisit.name));
    instanceModel = app.get(getModelToken(ScaleInstance.name));
    scoreModel = app.get(getModelToken(ScoreResult.name));
    domainModel = app.get(getModelToken(CognitiveDomainResult.name));
    reportModel = app.get(getModelToken(ClinicalReport.name));
    ready = true;
    await cleanup();
    const passwordHash = await authService.hashPassword(PASSWORD);
    await userModel.create([
      {
        accountName: DOCTOR_ACCOUNT,
        displayName: 'A27 History Doctor',
        passwordHash,
        roles: ['doctor'],
        permissions: [],
        userType: 'doctor',
        status: 'active',
      },
      {
        accountName: NURSE_ACCOUNT,
        displayName: 'A27 History Nurse',
        passwordHash,
        roles: ['nurse'],
        permissions: [],
        userType: 'nurse',
        status: 'active',
      },
      {
        accountName: RESEARCH_ACCOUNT,
        displayName: 'A27 History Research',
        passwordHash,
        roles: ['research_assistant'],
        permissions: [],
        userType: 'research_assistant',
        status: 'active',
      },
      {
        accountName: ADMIN_ACCOUNT,
        displayName: 'A27 History Admin',
        passwordHash,
        roles: ['admin'],
        permissions: [],
        userType: 'admin',
        status: 'active',
      },
      {
        accountName: SYSTEM_ACCOUNT,
        displayName: 'A27 History System',
        passwordHash,
        roles: ['system'],
        permissions: [],
        userType: 'system',
        status: 'active',
      },
    ]);
    server = app.getHttpServer() as SupertestApp;
    doctorAgent = request.agent(server);
    nurseAgent = request.agent(server);
    researchAgent = request.agent(server);
    adminAgent = request.agent(server);
    systemAgent = request.agent(server);
    await doctorAgent
      .post('/auth/login')
      .send({ accountName: DOCTOR_ACCOUNT, password: PASSWORD })
      .expect(201);
    await nurseAgent
      .post('/auth/login')
      .send({ accountName: NURSE_ACCOUNT, password: PASSWORD })
      .expect(201);
    await researchAgent
      .post('/auth/login')
      .send({ accountName: RESEARCH_ACCOUNT, password: PASSWORD })
      .expect(201);
    await adminAgent
      .post('/auth/login')
      .send({ accountName: ADMIN_ACCOUNT, password: PASSWORD })
      .expect(201);
    await systemAgent
      .post('/auth/login')
      .send({ accountName: SYSTEM_ACCOUNT, password: PASSWORD })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      if (ready) await cleanup();
      await app.close();
    }
  });

  async function createFixture(suffix = 'MAIN') {
    const patientId = new Types.ObjectId();
    const visitId =
      suffix === 'MAIN'
        ? new Types.ObjectId('507f1f77bcf86cd799439081')
        : new Types.ObjectId();
    const olderVisitId =
      suffix === 'MAIN'
        ? new Types.ObjectId('507f1f77bcf86cd799439080')
        : new Types.ObjectId();
    const instanceId = new Types.ObjectId();
    const retiredInstanceId = new Types.ObjectId();
    const scoreId = new Types.ObjectId();
    const domainId = new Types.ObjectId();
    const reportId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const at = new Date('2026-07-19T08:00:00.000Z');
    const subjectCode = `${SUBJECT_PREFIX}${suffix}`;
    await patientModel.create({
      _id: patientId,
      subjectCode,
      displayName: 'A27 De-identified Subject',
      status: 'inactive',
    });
    await visitModel.create([
      {
        _id: olderVisitId,
        patientId,
        subjectCode,
        visitCode: `${VISIT_PREFIX}${suffix}-OLDER`,
        visitType: 'follow_up',
        status: 'voided',
        assessmentDate: at,
        voidedAt: at,
      },
      {
        _id: visitId,
        patientId,
        subjectCode,
        visitCode: `${VISIT_PREFIX}${suffix}-MAIN`,
        visitType: 'baseline',
        status: 'locked',
        assessmentDate: at,
        startedAt: at,
        completedAt: at,
        lockedAt: at,
      },
    ]);
    await instanceModel.create({
      _id: instanceId,
      patientId,
      assessmentVisitId: visitId,
      subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0.0',
      instanceCode: `SI-A27-HISTORY-${suffix}-MAIN`,
      instanceNo: 1,
      status: 'locked',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-1',
        scoringRuleVersion: 'score-1',
        fieldEncodingVersion: 'field-1',
      },
      startedAt: at,
      completedAt: at,
      lockedAt: at,
      durationMs: 60000,
    });
    await instanceModel.create({
      _id: retiredInstanceId,
      patientId,
      assessmentVisitId: olderVisitId,
      subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'retired_a27',
      scaleVersion: '0.9.0',
      instanceCode: `SI-A27-HISTORY-${suffix}-RETIRED`,
      instanceNo: 1,
      status: 'voided',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-retired',
        scoringRuleVersion: 'score-retired',
        fieldEncodingVersion: 'field-retired',
      },
      voidedAt: at,
    });
    await scoreModel.create({
      _id: scoreId,
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: instanceId,
      subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0.0',
      instanceCode: `SI-A27-HISTORY-${suffix}-MAIN`,
      scoreResultCode: `SCR-A27-HISTORY-${suffix}-MAIN`,
      runNo: 1,
      status: 'locked',
      scoringSource: 'auto_rule',
      scoringMode: 'rule_based',
      versionTrace: {
        scaleVersion: '1.0.0',
        crfVersion: 'crf-1',
        scoringRuleVersion: 'score-1',
        fieldEncodingVersion: 'field-1',
      },
      totalScore: {
        scoreValue: 24,
        minScore: 0,
        maxScore: 30,
        scorePercent: 80,
      },
      review: { reviewStatus: 'reviewed', reviewedAt: at },
      qualityStatus: 'passed',
      confirmedAt: at,
      lockedAt: at,
    });
    await domainModel.create({
      _id: domainId,
      patientId,
      assessmentVisitId: visitId,
      scaleInstanceId: instanceId,
      scoreResultId: scoreId,
      subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0.0',
      instanceCode: `SI-A27-HISTORY-${suffix}-MAIN`,
      domainResultCode: `DOM-A27-HISTORY-${suffix}-MAIN`,
      runNo: 1,
      status: 'locked',
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
      versionTrace: {
        scaleVersion: '1.0.0',
        crfVersion: 'crf-1',
        scoringRuleVersion: 'score-1',
        fieldEncodingVersion: 'field-1',
        domainMappingVersion: 'domain-1',
      },
      domainScores: [
        {
          domainCode: 'memory',
          scoreValue: 4,
          minScore: 0,
          maxScore: 5,
          scorePercent: 80,
          itemCount: 2,
        },
      ],
      mappingSnapshot: {
        mappingVersion: 'domain-1',
        domainCodes: ['memory'],
      },
      computation: { computedAt: at, warningCount: 0 },
      qualityStatus: 'passed',
    });
    await reportModel.create({
      _id: reportId,
      patientId,
      assessmentVisitId: visitId,
      primaryScaleInstanceIds: [instanceId],
      scoreResultIds: [scoreId],
      cognitiveDomainResultIds: [domainId],
      mediaEvidenceIds: [],
      subjectCode,
      reportCode: `RPT-A27-HISTORY-${suffix}-V1`,
      reportType: 'cognitive_assessment',
      status: 'draft',
      reportVersion: 1,
      source: 'system_draft',
      patientSnapshot: {
        subjectCode,
        displayName: 'A27 De-identified Subject',
        sex: 'unknown',
      },
      visitSnapshot: {
        visitCode: `${VISIT_PREFIX}${suffix}-MAIN`,
        visitType: 'baseline',
        assessmentDate: at,
      },
      scaleTraces: [
        {
          scaleInstanceId: instanceId,
          scaleCode: 'moca',
          scaleVersion: '1.0.0',
        },
      ],
      scoreSnapshots: [
        {
          scoreResultId: scoreId,
          scaleCode: 'moca',
          totalScoreValue: 24,
          totalMinScore: 0,
          totalMaxScore: 30,
          scorePercent: 80,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: domainId,
          scaleCode: 'moca',
          domainCode: 'memory',
          scoreValue: 4,
          maxScore: 5,
          scorePercent: 80,
          itemCount: 2,
        },
      ],
      evidenceSnapshots: [],
      narrative: { chiefSummary: 'A27 de-identified history summary' },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      qualityStatus: 'unchecked',
      metadata: null,
    });
    return {
      patientId: patientId.toString(),
      visitId: visitId.toString(),
      olderVisitId: olderVisitId.toString(),
      instanceId: instanceId.toString(),
      retiredInstanceId: retiredInstanceId.toString(),
      scoreId: scoreId.toString(),
      domainId: domainId.toString(),
      reportId: reportId.toString(),
    };
  }

  it('enforces authentication, roles, DTOs, and ownership errors', async () => {
    const fakePatient = '507f1f77bcf86cd799439071';
    const fakeVisit = '507f1f77bcf86cd799439072';
    const fakeReport = '507f1f77bcf86cd799439073';
    await request(server)
      .get(`/patients/${fakePatient}/assessment-history`)
      .expect(401);
    await systemAgent
      .get(`/patients/${fakePatient}/assessment-history`)
      .expect(403);
    await request(server)
      .get(`/patients/${fakePatient}/visits/${fakeVisit}/clinical-reports`)
      .expect(401);
    await systemAgent
      .get(`/patients/${fakePatient}/visits/${fakeVisit}/clinical-reports`)
      .expect(403);
    await request(server)
      .get(
        `/patients/${fakePatient}/visits/${fakeVisit}/clinical-reports/${fakeReport}`,
      )
      .expect(401);
    await systemAgent
      .get(
        `/patients/${fakePatient}/visits/${fakeVisit}/clinical-reports/${fakeReport}`,
      )
      .expect(403);
    const invalidRange = await doctorAgent
      .get(`/patients/${fakePatient}/assessment-history`)
      .query({
        dateFrom: '2026-07-20T00:00:00.000Z',
        dateTo: '2026-07-19T00:00:00.000Z',
      })
      .expect(400);
    expect(body(invalidRange).code).toBe('INVALID_DATE_RANGE');
    await doctorAgent
      .get(`/patients/${fakePatient}/assessment-history`)
      .query({ sort: 'assessmentDate' })
      .expect(400);
    const patientMissing = await doctorAgent
      .get(
        `/patients/${fakePatient}/visits/${fakeVisit}/clinical-reports/${fakeReport}`,
      )
      .expect(404);
    expect(body(patientMissing).code).toBe('PATIENT_NOT_FOUND');
    const fixture = await createFixture('OWNERSHIP');
    const visitMissing = await doctorAgent
      .get(
        `/patients/${fixture.patientId}/visits/${fakeVisit}/clinical-reports/${fakeReport}`,
      )
      .expect(404);
    expect(body(visitMissing).code).toBe('VISIT_NOT_FOUND');
    const reportMissing = await doctorAgent
      .get(
        `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports/${fakeReport}`,
      )
      .expect(404);
    expect(body(reportMissing).code).toBe('CLINICAL_REPORT_NOT_FOUND');
    await reportModel
      .updateOne(
        { _id: fixture.reportId },
        { $set: { reportType: 'follow_up' } },
      )
      .exec();
    const typeMismatch = await doctorAgent
      .get(
        `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports/${fixture.reportId}`,
      )
      .expect(404);
    expect(body(typeMismatch).code).toBe('CLINICAL_REPORT_NOT_FOUND');
  });

  it('returns stable, filtered, private and read-only history and report reads', async () => {
    const fixture = await createFixture();
    const before = await Promise.all([
      patientModel
        .findById(fixture.patientId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      visitModel
        .findById(fixture.visitId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      instanceModel
        .findById(fixture.instanceId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      scoreModel
        .findById(fixture.scoreId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      domainModel
        .findById(fixture.domainId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      reportModel
        .findById(fixture.reportId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
    ]);
    const historyResponse = await doctorAgent
      .get(`/patients/${fixture.patientId}/assessment-history`)
      .expect(200);
    const history = body(historyResponse);
    expect(history.total).toBe(2);
    const historyItems = array(history.items, 'history items');
    expect(record(historyItems[0], 'latest history item').visit).toEqual(
      expect.objectContaining({ id: fixture.visitId }),
    );
    const mainScales = array(
      record(historyItems[0], 'main history item').scaleSummaries,
      'scale summaries',
    );
    expect(record(mainScales[0], 'scale summary').scoreSummary).toEqual(
      expect.objectContaining({
        availability: 'available',
        totalScoreValue: 24,
      }),
    );
    expect(record(mainScales[0], 'scale summary').domainSummary).toEqual(
      expect.objectContaining({ availability: 'available', domainCount: 1 }),
    );
    const at = '2026-07-19T08:00:00.000Z';
    const dateBoundary = body(
      await doctorAgent
        .get(`/patients/${fixture.patientId}/assessment-history`)
        .query({ dateFrom: at, dateTo: at })
        .expect(200),
    );
    expect(dateBoundary.total).toBe(2);
    const visitTypeFiltered = body(
      await doctorAgent
        .get(`/patients/${fixture.patientId}/assessment-history`)
        .query({ visitType: 'follow_up' })
        .expect(200),
    );
    expect(visitTypeFiltered.total).toBe(1);
    expect(
      record(
        array(visitTypeFiltered.items, 'visit type items')[0],
        'visit type item',
      ).visit,
    ).toEqual(expect.objectContaining({ id: fixture.olderVisitId }));
    const statusFiltered = body(
      await doctorAgent
        .get(`/patients/${fixture.patientId}/assessment-history`)
        .query({ status: 'voided' })
        .expect(200),
    );
    expect(statusFiltered.total).toBe(1);
    const filtered = body(
      await doctorAgent
        .get(`/patients/${fixture.patientId}/assessment-history`)
        .query({ scaleCode: ' MOCA ', page: 1, pageSize: 1 })
        .expect(200),
    );
    expect(filtered.total).toBe(1);
    expect(array(filtered.items, 'filtered items')).toHaveLength(1);
    const retiredFiltered = body(
      await doctorAgent
        .get(`/patients/${fixture.patientId}/assessment-history`)
        .query({ scaleCode: ' RETIRED_A27 ' })
        .expect(200),
    );
    expect(retiredFiltered.total).toBe(1);
    expect(
      record(array(retiredFiltered.items, 'retired items')[0], 'retired item')
        .visit,
    ).toEqual(expect.objectContaining({ id: fixture.olderVisitId }));
    const outOfRange = body(
      await doctorAgent
        .get(`/patients/${fixture.patientId}/assessment-history`)
        .query({ page: 10, pageSize: 20 })
        .expect(200),
    );
    expect(outOfRange).toEqual(
      expect.objectContaining({ items: [], total: 2, page: 10, pageSize: 20 }),
    );
    const versions = body(
      await doctorAgent
        .get(
          `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports`,
        )
        .expect(200),
    );
    expect(versions).toEqual(
      expect.objectContaining({
        total: 1,
        lineage: {
          status: 'valid',
          firstVersion: 1,
          latestVersion: 1,
          totalVersions: 1,
        },
      }),
    );
    const versionItem = record(array(versions.items, 'versions')[0], 'version');
    expect(versionItem).toEqual(
      expect.objectContaining({
        id: fixture.reportId,
        reportVersion: 1,
        isLatestVersion: true,
      }),
    );
    const allowedAgents = [doctorAgent, nurseAgent, researchAgent, adminAgent];
    for (const agent of allowedAgents) {
      await agent
        .get(`/patients/${fixture.patientId}/assessment-history`)
        .expect(200);
      await agent
        .get(
          `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports`,
        )
        .expect(200);
      await agent
        .get(
          `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports/${fixture.reportId}`,
        )
        .expect(200);
    }
    await doctorAgent
      .get(
        `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports/latest`,
      )
      .expect(200);
    const detail = body(
      await doctorAgent
        .get(
          `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports/${fixture.reportId}`,
        )
        .expect(200),
    );
    expect(record(detail.report, 'historical report').id).toBe(
      fixture.reportId,
    );
    const forbidden = [
      'patientId',
      'assessmentVisitId',
      'scoreResultId',
      'domainResultId',
      'metadata',
      'itemScores',
      'domainScores',
      'narrative',
      'previousReportId',
      'replacementReportId',
    ];
    const listKeys = collectKeys({ history, versions });
    forbidden.forEach((key) => expect(listKeys.has(key)).toBe(false));
    const after = await Promise.all([
      patientModel
        .findById(fixture.patientId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      visitModel
        .findById(fixture.visitId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      instanceModel
        .findById(fixture.instanceId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      scoreModel
        .findById(fixture.scoreId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      domainModel
        .findById(fixture.domainId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      reportModel
        .findById(fixture.reportId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
    ]);
    expect(after).toEqual(before);
  });

  it('reads every historical state and distinguishes incomplete from invalid lineage', async () => {
    const fixture = await createFixture('STATES');
    const route = `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports/${fixture.reportId}`;
    for (const patientStatus of PATIENT_STATUSES) {
      await patientModel
        .updateOne(
          { _id: fixture.patientId },
          { $set: { status: patientStatus } },
        )
        .exec();
      await doctorAgent.get(route).expect(200);
    }
    for (const visitStatus of ASSESSMENT_STATUSES) {
      await visitModel
        .updateOne({ _id: fixture.visitId }, { $set: { status: visitStatus } })
        .exec();
      await doctorAgent.get(route).expect(200);
    }
    const confirmedAt = new Date('2026-07-19T08:00:00.000Z');
    for (const reportStatus of CLINICAL_REPORT_STATUSES) {
      const confirmation = ['confirmed', 'archived', 'corrected'].includes(
        reportStatus,
      )
        ? { confirmedAt }
        : null;
      await reportModel
        .updateOne(
          { _id: fixture.reportId },
          { $set: { status: reportStatus, confirmation } },
        )
        .exec();
      const response = await doctorAgent.get(route).expect(200);
      expect(record(body(response).report, 'state report').status).toBe(
        reportStatus,
      );
    }
    await reportModel
      .updateOne(
        { _id: fixture.reportId },
        {
          $set: {
            status: 'draft',
            confirmation: null,
            reportVersion: 2,
          },
        },
      )
      .exec();
    const invalidLineage = await doctorAgent
      .get(
        `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports`,
      )
      .expect(409);
    expect(body(invalidLineage).code).toBe(
      'CLINICAL_REPORT_HISTORY_LINEAGE_INVALID',
    );
    await reportModel
      .updateOne(
        { _id: fixture.reportId },
        { $set: { reportVersion: 1, reportCode: '' } },
      )
      .exec();
    const incomplete = await doctorAgent
      .get(
        `/patients/${fixture.patientId}/visits/${fixture.visitId}/clinical-reports`,
      )
      .expect(409);
    expect(body(incomplete).code).toBe('CLINICAL_REPORT_INCOMPLETE');
  });
});
