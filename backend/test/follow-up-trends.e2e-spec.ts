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
  type AssessmentStatus,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ScaleInstance,
  ScaleInstanceDocument,
  type ScaleAdministrationMode,
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
  Patient,
  PatientDocument,
  type PatientStatus,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  ClinicalReportDocument,
} from '../src/modules/reports/schemas/clinical-report.schema';
import {
  ScoreResult,
  ScoreResultDocument,
  type ScoreQualityStatus,
  type ScoreResultStatus,
} from '../src/modules/scoring/schemas/score-result.schema';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const ACCOUNTS = {
  doctor: 'doctor-a28-trend-test',
  nurse: 'nurse-a28-trend-test',
  research: 'research-a28-trend-test',
  admin: 'admin-a28-trend-test',
  system: 'system-a28-trend-test',
} as const;
const TEST_ACCOUNTS = Object.values(ACCOUNTS);
const PASSWORD = 'A28-Trend-Test-Password!';
const SUBJECT_PREFIX = 'SUBJ-A28-TREND-';
const VISIT_PREFIX = 'VISIT-A28-TREND-';

type SupertestApp = Parameters<typeof request.agent>[0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseBody(response: Response): Record<string, unknown> {
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

describe('follow-up trends read API (e2e)', () => {
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
        accountName: ACCOUNTS.doctor,
        displayName: 'A28 Trend Doctor',
        passwordHash,
        roles: ['doctor'],
        permissions: [],
        userType: 'doctor',
        status: 'active',
      },
      {
        accountName: ACCOUNTS.nurse,
        displayName: 'A28 Trend Nurse',
        passwordHash,
        roles: ['nurse'],
        permissions: [],
        userType: 'nurse',
        status: 'active',
      },
      {
        accountName: ACCOUNTS.research,
        displayName: 'A28 Trend Research',
        passwordHash,
        roles: ['research_assistant'],
        permissions: [],
        userType: 'research_assistant',
        status: 'active',
      },
      {
        accountName: ACCOUNTS.admin,
        displayName: 'A28 Trend Admin',
        passwordHash,
        roles: ['admin'],
        permissions: [],
        userType: 'admin',
        status: 'active',
      },
      {
        accountName: ACCOUNTS.system,
        displayName: 'A28 Trend System',
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
    const agents = [
      [doctorAgent, ACCOUNTS.doctor],
      [nurseAgent, ACCOUNTS.nurse],
      [researchAgent, ACCOUNTS.research],
      [adminAgent, ACCOUNTS.admin],
      [systemAgent, ACCOUNTS.system],
    ] as const;
    for (const [agent, accountName] of agents) {
      await agent
        .post('/auth/login')
        .send({ accountName, password: PASSWORD })
        .expect(201);
    }
  });

  afterAll(async () => {
    if (app) {
      if (ready) await cleanup();
      await app.close();
    }
  });

  async function createPatient(
    suffix: string,
    status: PatientStatus = 'inactive',
  ) {
    const patientId = new Types.ObjectId();
    const subjectCode = `${SUBJECT_PREFIX}${suffix}`;
    await patientModel.create({
      _id: patientId,
      subjectCode,
      displayName: 'A28 De-identified Subject',
      status,
    });
    return { patientId, subjectCode };
  }

  async function createVisit(input: {
    patientId: Types.ObjectId;
    subjectCode: string;
    suffix: string;
    assessmentDate: Date;
    status?: AssessmentStatus;
    id?: Types.ObjectId;
  }) {
    const visitId = input.id ?? new Types.ObjectId();
    await visitModel.create({
      _id: visitId,
      patientId: input.patientId,
      subjectCode: input.subjectCode,
      visitCode: `${VISIT_PREFIX}${input.suffix}`,
      visitType: 'follow_up',
      status: input.status ?? 'completed',
      assessmentDate: input.assessmentDate,
      completedAt: input.assessmentDate,
      voidedAt: input.status === 'voided' ? input.assessmentDate : null,
    });
    return visitId;
  }

  async function createFinalSource(input: {
    patientId: Types.ObjectId;
    subjectCode: string;
    visitId: Types.ObjectId;
    suffix: string;
    scoreValue: number;
    instanceNo?: number;
    instanceStatus?: AssessmentStatus;
    scoreStatus?: ScoreResultStatus;
    scoreQuality?: ScoreQualityStatus;
    traceVersion?: string;
    administrationMode?: ScaleAdministrationMode;
    scoreMin?: number;
    scoreMax?: number;
    domainMappingVersion?: string;
    domainScores?: Array<{
      domainCode: string;
      domainTitle?: string;
      scoreValue: number;
      minScore: number;
      maxScore: number;
      weightedScore?: number | null;
      weightedMaxScore?: number | null;
    }>;
    withDomain?: boolean;
  }) {
    const instanceId = new Types.ObjectId();
    const scoreId = new Types.ObjectId();
    const domainId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const traceVersion = input.traceVersion ?? '1';
    const instanceStatus = input.instanceStatus ?? 'locked';
    const scoreStatus = input.scoreStatus ?? 'locked';
    const scoreMin = input.scoreMin ?? 0;
    const scoreMax = input.scoreMax ?? 30;
    const at = new Date('2026-07-19T08:00:00.000Z');
    await instanceModel.create({
      _id: instanceId,
      patientId: input.patientId,
      assessmentVisitId: input.visitId,
      subjectCode: input.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: traceVersion,
      instanceCode: `SI-A28-TREND-${input.suffix}-${input.instanceNo ?? 1}`,
      instanceNo: input.instanceNo ?? 1,
      status: instanceStatus,
      administrationMode: input.administrationMode ?? 'clinician_administered',
      versionTrace: {
        crfVersion: `crf-${traceVersion}`,
        scoringRuleVersion: `score-${traceVersion}`,
        fieldEncodingVersion: `field-${traceVersion}`,
      },
      completedAt: instanceStatus === 'locked' ? at : null,
      lockedAt: instanceStatus === 'locked' ? at : null,
      voidedAt: instanceStatus === 'voided' ? at : null,
      durationMs: 60000,
    });
    await scoreModel.create({
      _id: scoreId,
      patientId: input.patientId,
      assessmentVisitId: input.visitId,
      scaleInstanceId: instanceId,
      subjectCode: input.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: traceVersion,
      instanceCode: `SI-A28-TREND-${input.suffix}-${input.instanceNo ?? 1}`,
      scoreResultCode: `SCR-A28-TREND-${input.suffix}-${input.instanceNo ?? 1}`,
      runNo: 1,
      status: scoreStatus,
      scoringSource: 'auto_rule',
      scoringMode: 'rule_based',
      versionTrace: {
        scaleVersion: traceVersion,
        crfVersion: `crf-${traceVersion}`,
        scoringRuleVersion: `score-${traceVersion}`,
        fieldEncodingVersion: `field-${traceVersion}`,
      },
      totalScore: {
        scoreValue: input.scoreValue,
        minScore: scoreMin,
        maxScore: scoreMax,
        scorePercent:
          ((input.scoreValue - scoreMin) / (scoreMax - scoreMin)) * 100,
      },
      review: { reviewStatus: 'reviewed', reviewedAt: at },
      qualityStatus: input.scoreQuality ?? 'passed',
      confirmedAt: ['confirmed', 'locked'].includes(scoreStatus) ? at : null,
      lockedAt: scoreStatus === 'locked' ? at : null,
      voidedAt: scoreStatus === 'voided' ? at : null,
    });
    if (input.withDomain !== false) {
      const mappingVersion = input.domainMappingVersion ?? 'domain-1';
      const domainCodes: string[] = input.domainScores
        ? input.domainScores.map((domainScore) => domainScore.domainCode)
        : ['memory'];
      await domainModel.create({
        _id: domainId,
        patientId: input.patientId,
        assessmentVisitId: input.visitId,
        scaleInstanceId: instanceId,
        scoreResultId: scoreId,
        subjectCode: input.subjectCode,
        scaleDefinitionId: definitionId,
        scaleVersionId: versionId,
        scaleCode: 'moca',
        scaleVersion: traceVersion,
        instanceCode: `SI-A28-TREND-${input.suffix}-${input.instanceNo ?? 1}`,
        domainResultCode: `DOM-A28-TREND-${input.suffix}-${input.instanceNo ?? 1}`,
        runNo: 1,
        status: 'locked',
        mappingSource: 'scale_config',
        mappingMode: 'item_domain_codes',
        versionTrace: {
          scaleVersion: traceVersion,
          crfVersion: `crf-${traceVersion}`,
          scoringRuleVersion: `score-${traceVersion}`,
          fieldEncodingVersion: `field-${traceVersion}`,
          domainMappingVersion: mappingVersion,
        },
        domainScores: (
          input.domainScores ?? [
            {
              domainCode: 'memory',
              domainTitle: 'Memory',
              scoreValue: input.scoreValue / 2,
              minScore: 0,
              maxScore: 15,
            },
          ]
        ).map((domainScore) => ({
          ...domainScore,
          scorePercent:
            ((domainScore.scoreValue - domainScore.minScore) /
              (domainScore.maxScore - domainScore.minScore)) *
            100,
          itemCount: 2,
        })),
        mappingSnapshot: {
          mappingVersion,
          domainCodes,
        },
        computation: { computedAt: at, warningCount: 0 },
        qualityStatus: 'passed',
      });
    }
    return { instanceId, scoreId, domainId };
  }

  it('enforces auth, roles, DTOs, patient and catalog errors for all read roles', async () => {
    const fixture = await createPatient('ACCESS', 'archived');
    const route = `/patients/${fixture.patientId.toString()}/follow-up-trends`;
    await request(server).get(route).query({ scaleCode: 'moca' }).expect(401);
    await systemAgent.get(route).query({ scaleCode: 'moca' }).expect(403);
    for (const agent of [doctorAgent, nurseAgent, researchAgent, adminAgent]) {
      const response = await agent
        .get(route)
        .query({ scaleCode: ' MoCA ' })
        .expect(200);
      const body = responseBody(response);
      expect(record(body.scale, 'scale').scaleCode).toBe('moca');
      expect(record(body.range, 'range').pointCount).toBe(0);
      expect(body.points).toEqual([]);
    }
    await doctorAgent.get(route).expect(400);
    await doctorAgent
      .get(route)
      .query({ scaleCode: 'moca', maxPoints: 1 })
      .expect(400);
    await doctorAgent
      .get(route)
      .query({ scaleCode: 'moca', sort: 'assessmentDate' })
      .expect(400);
    const invalidRange = await doctorAgent
      .get(route)
      .query({
        scaleCode: 'moca',
        dateFrom: '2026-07-20T00:00:00.000Z',
        dateTo: '2026-07-19T00:00:00.000Z',
      })
      .expect(400);
    expect(responseBody(invalidRange).code).toBe('INVALID_DATE_RANGE');
    const patientMissing = await doctorAgent
      .get('/patients/507f1f77bcf86cd799439099/follow-up-trends')
      .query({ scaleCode: 'moca' })
      .expect(404);
    expect(responseBody(patientMissing).code).toBe('PATIENT_NOT_FOUND');
    const scaleMissing = await doctorAgent
      .get(route)
      .query({ scaleCode: 'retired-a28' })
      .expect(404);
    expect(responseBody(scaleMissing).code).toBe('SCALE_NOT_AVAILABLE');
  });

  it('preserves every Visit with stable ordering, status priority and maxPoints', async () => {
    const fixture = await createPatient('STATUS');
    const older = await createVisit({
      ...fixture,
      suffix: 'STATUS-VOIDED',
      assessmentDate: new Date('2026-07-01T00:00:00.000Z'),
      status: 'voided',
    });
    const lower = await createVisit({
      ...fixture,
      suffix: 'STATUS-MISSING',
      assessmentDate: new Date('2026-07-02T00:00:00.000Z'),
      id: new Types.ObjectId('507f1f77bcf86cd799439080'),
    });
    const higher = await createVisit({
      ...fixture,
      suffix: 'STATUS-AMBIGUOUS',
      assessmentDate: new Date('2026-07-02T00:00:00.000Z'),
      id: new Types.ObjectId('507f1f77bcf86cd799439081'),
    });
    const later = await createVisit({
      ...fixture,
      suffix: 'STATUS-NOT-FINAL',
      assessmentDate: new Date('2026-07-03T00:00:00.000Z'),
    });
    await createFinalSource({
      ...fixture,
      visitId: higher,
      suffix: 'STATUS-AMBIGUOUS',
      scoreValue: 20,
      instanceNo: 1,
    });
    await createFinalSource({
      ...fixture,
      visitId: higher,
      suffix: 'STATUS-AMBIGUOUS',
      scoreValue: 21,
      instanceNo: 2,
    });
    await createFinalSource({
      ...fixture,
      visitId: later,
      suffix: 'STATUS-NOT-FINAL',
      scoreValue: 20,
      instanceStatus: 'in_progress',
    });
    const route = `/patients/${fixture.patientId.toString()}/follow-up-trends`;
    const response = responseBody(
      await doctorAgent
        .get(route)
        .query({ scaleCode: 'moca', maxPoints: 4 })
        .expect(200),
    );
    const points = array(response.points, 'trend points').map((point) =>
      record(point, 'trend point'),
    );
    expect(points.map((point) => record(point.visit, 'visit').id)).toEqual([
      older.toString(),
      lower.toString(),
      higher.toString(),
      later.toString(),
    ]);
    expect(points.map((point) => point.dataStatus)).toEqual([
      'source_voided',
      'source_missing',
      'source_ambiguous',
      'source_not_final',
    ]);
    expect(record(response.range, 'range').pointCount).toBe(4);
    const boundary = responseBody(
      await doctorAgent
        .get(route)
        .query({
          scaleCode: 'moca',
          dateFrom: '2026-07-02T00:00:00.000Z',
          dateTo: '2026-07-02T00:00:00.000Z',
          maxPoints: 2,
        })
        .expect(200),
    );
    expect(array(boundary.points, 'boundary points')).toHaveLength(2);
    const tooLarge = await doctorAgent
      .get(route)
      .query({ scaleCode: 'moca', maxPoints: 3 })
      .expect(409);
    expect(responseBody(tooLarge).code).toBe('FOLLOW_UP_TREND_RANGE_TOO_LARGE');
    expect(responseBody(tooLarge).points).toBeUndefined();

    const sourceFixture = await createPatient('SOURCE');
    const sourceVisits: Types.ObjectId[] = [];
    for (let index = 0; index < 5; index += 1) {
      sourceVisits.push(
        await createVisit({
          ...sourceFixture,
          suffix: `SOURCE-${index + 1}`,
          assessmentDate: new Date(`2026-08-0${index + 1}T00:00:00.000Z`),
        }),
      );
    }
    const missingScore = await createFinalSource({
      ...sourceFixture,
      visitId: sourceVisits[0],
      suffix: 'SOURCE-MISSING-SCORE',
      scoreValue: 20,
    });
    await domainModel.deleteOne({ _id: missingScore.domainId }).exec();
    await scoreModel.deleteOne({ _id: missingScore.scoreId }).exec();
    await createFinalSource({
      ...sourceFixture,
      visitId: sourceVisits[1],
      suffix: 'SOURCE-NOT-FINAL-SCORE',
      scoreValue: 20,
      scoreStatus: 'needs_review',
    });
    await createFinalSource({
      ...sourceFixture,
      visitId: sourceVisits[2],
      suffix: 'SOURCE-VOIDED-SCORE',
      scoreValue: 20,
      scoreStatus: 'voided',
    });
    await createFinalSource({
      ...sourceFixture,
      visitId: sourceVisits[3],
      suffix: 'SOURCE-INCOMPLETE-SCORE',
      scoreValue: 20,
      scoreQuality: 'failed',
    });
    await createFinalSource({
      ...sourceFixture,
      visitId: sourceVisits[4],
      suffix: 'SOURCE-MISSING-DOMAIN',
      scoreValue: 20,
      withDomain: false,
    });
    const sourceResponse = responseBody(
      await doctorAgent
        .get(`/patients/${sourceFixture.patientId.toString()}/follow-up-trends`)
        .query({ scaleCode: 'moca', maxPoints: 5 })
        .expect(200),
    );
    const sourcePoints = array(sourceResponse.points, 'source points').map(
      (point) => record(point, 'source point'),
    );
    expect(sourcePoints.map((point) => point.dataStatus)).toEqual([
      'source_missing',
      'source_not_final',
      'source_voided',
      'source_incomplete',
      'available',
    ]);
    expect(sourcePoints[4].score).not.toBeNull();
    expect(sourcePoints[4].domains).toEqual([]);
  });

  it('returns exact adjacent deltas, independent domains and a private read-only response', async () => {
    const fixture = await createPatient('COMPARE');
    const visits: Types.ObjectId[] = [];
    for (let index = 0; index < 9; index += 1) {
      visits.push(
        await createVisit({
          ...fixture,
          suffix: `COMPARE-${index + 1}`,
          assessmentDate: new Date(`2026-07-0${index + 1}T00:00:00.000Z`),
        }),
      );
    }
    const sources = [
      await createFinalSource({
        ...fixture,
        visitId: visits[0],
        suffix: 'COMPARE-1',
        scoreValue: 20,
      }),
      await createFinalSource({
        ...fixture,
        visitId: visits[1],
        suffix: 'COMPARE-2',
        scoreValue: 22,
      }),
      await createFinalSource({
        ...fixture,
        visitId: visits[2],
        suffix: 'COMPARE-3',
        scoreValue: 23,
        traceVersion: '2',
      }),
      await createFinalSource({
        ...fixture,
        visitId: visits[3],
        suffix: 'COMPARE-4',
        scoreValue: 24,
        traceVersion: '2',
        administrationMode: 'paper_import',
      }),
      await createFinalSource({
        ...fixture,
        visitId: visits[4],
        suffix: 'COMPARE-5',
        scoreValue: 25,
        traceVersion: '2',
        administrationMode: 'paper_import',
        scoreMax: 40,
      }),
      await createFinalSource({
        ...fixture,
        visitId: visits[5],
        suffix: 'COMPARE-6',
        scoreValue: 26,
        traceVersion: '2',
        administrationMode: 'paper_import',
        scoreMax: 40,
        domainMappingVersion: 'domain-2',
        domainScores: [
          {
            domainCode: 'memory',
            domainTitle: 'Memory',
            scoreValue: 13,
            minScore: 0,
            maxScore: 15,
            weightedScore: 6,
            weightedMaxScore: 10,
          },
          {
            domainCode: 'attention',
            domainTitle: 'Attention',
            scoreValue: 4,
            minScore: 0,
            maxScore: 5,
          },
        ],
      }),
      await createFinalSource({
        ...fixture,
        visitId: visits[6],
        suffix: 'COMPARE-7',
        scoreValue: 27,
        traceVersion: '2',
        administrationMode: 'paper_import',
        scoreMax: 40,
        domainMappingVersion: 'domain-2',
        domainScores: [
          {
            domainCode: 'memory',
            domainTitle: 'Renamed title is not a comparison key',
            scoreValue: 13.5,
            minScore: 0,
            maxScore: 20,
            weightedScore: 7,
            weightedMaxScore: 12,
          },
          {
            domainCode: 'attention',
            domainTitle: 'Attention renamed',
            scoreValue: 4.5,
            minScore: 0,
            maxScore: 5,
          },
        ],
      }),
      await createFinalSource({
        ...fixture,
        visitId: visits[8],
        suffix: 'COMPARE-9',
        scoreValue: 28,
        traceVersion: '2',
        administrationMode: 'paper_import',
        scoreMax: 40,
        domainMappingVersion: 'domain-2',
        domainScores: [
          {
            domainCode: 'memory',
            scoreValue: 14,
            minScore: 0,
            maxScore: 20,
            weightedScore: 8,
            weightedMaxScore: 12,
          },
          {
            domainCode: 'attention',
            scoreValue: 5,
            minScore: 0,
            maxScore: 5,
          },
        ],
      }),
    ];
    const reportId = new Types.ObjectId();
    await reportModel.create({
      _id: reportId,
      patientId: fixture.patientId,
      assessmentVisitId: visits[0],
      primaryScaleInstanceIds: [sources[0].instanceId],
      scoreResultIds: [sources[0].scoreId],
      cognitiveDomainResultIds: [sources[0].domainId],
      mediaEvidenceIds: [],
      subjectCode: fixture.subjectCode,
      reportCode: 'RPT-A28-TREND-COMPARE-V1',
      reportType: 'cognitive_assessment',
      status: 'draft',
      reportVersion: 1,
      source: 'system_draft',
      patientSnapshot: {
        subjectCode: fixture.subjectCode,
        displayName: 'A28 De-identified Subject',
        sex: 'unknown',
      },
      visitSnapshot: {
        visitCode: `${VISIT_PREFIX}COMPARE-1`,
        visitType: 'follow_up',
        assessmentDate: new Date('2026-07-01T00:00:00.000Z'),
      },
      scaleTraces: [
        {
          scaleInstanceId: sources[0].instanceId,
          scaleCode: 'moca',
          scaleVersion: '1',
        },
      ],
      scoreSnapshots: [
        {
          scoreResultId: sources[0].scoreId,
          scaleCode: 'moca',
          totalScoreValue: 20,
          totalMinScore: 0,
          totalMaxScore: 30,
          scorePercent: (20 / 30) * 100,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: sources[0].domainId,
          scaleCode: 'moca',
          domainCode: 'memory',
          scoreValue: 10,
          maxScore: 15,
          scorePercent: (10 / 15) * 100,
          itemCount: 2,
        },
      ],
      evidenceSnapshots: [],
      narrative: { chiefSummary: 'A28 de-identified regression summary' },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      qualityStatus: 'unchecked',
      metadata: null,
    });
    const collectionsBefore = (
      await connection.db.listCollections({}, { nameOnly: true }).toArray()
    )
      .map((collection) => collection.name)
      .sort();
    const before = await Promise.all([
      patientModel
        .findById(fixture.patientId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      visitModel
        .find({ patientId: fixture.patientId })
        .select({ updatedAt: 1 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      instanceModel
        .find({ patientId: fixture.patientId })
        .select({ updatedAt: 1 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      scoreModel
        .find({ patientId: fixture.patientId })
        .select({ updatedAt: 1 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      domainModel
        .find({ patientId: fixture.patientId })
        .select({ updatedAt: 1 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
    ]);
    const route = `/patients/${fixture.patientId.toString()}/follow-up-trends`;
    const response = responseBody(
      await doctorAgent.get(route).query({ scaleCode: 'moca' }).expect(200),
    );
    const points = array(response.points, 'comparison points').map((point) =>
      record(point, 'comparison point'),
    );
    expect(record(points[0].comparisonToPrevious, 'first comparison')).toEqual(
      expect.objectContaining({ status: 'first_point' }),
    );
    const secondComparison = record(
      points[1].comparisonToPrevious,
      'second comparison',
    );
    expect(secondComparison).toEqual(
      expect.objectContaining({ status: 'comparable', scoreDelta: 2 }),
    );
    expect(secondComparison.scorePercentDelta).toBeCloseTo((2 / 30) * 100, 12);
    expect(secondComparison.scorePercentDelta).not.toBe(6.67);
    expect(record(points[2].comparisonToPrevious, 'third comparison')).toEqual(
      expect.objectContaining({
        status: 'not_comparable',
        reasons: [
          'scale_version_changed',
          'crf_version_changed',
          'scoring_rule_version_changed',
          'field_encoding_version_changed',
        ],
      }),
    );
    expect(record(points[3].comparisonToPrevious, 'fourth comparison')).toEqual(
      expect.objectContaining({
        status: 'not_comparable',
        reasons: ['administration_mode_changed'],
      }),
    );
    expect(record(points[4].comparisonToPrevious, 'fifth comparison')).toEqual(
      expect.objectContaining({
        status: 'not_comparable',
        reasons: ['score_range_changed'],
      }),
    );
    const sixthDomainComparison = record(
      record(points[5].comparisonToPrevious, 'sixth comparison').domainDeltas,
      'sixth domain deltas',
    );
    expect(sixthDomainComparison).toEqual(
      expect.objectContaining({
        status: 'not_comparable',
        reasons: ['domain_mapping_version_changed', 'domain_set_changed'],
      }),
    );
    const seventhDomainComparison = record(
      record(points[6].comparisonToPrevious, 'seventh comparison').domainDeltas,
      'seventh domain deltas',
    );
    expect(seventhDomainComparison).toEqual(
      expect.objectContaining({
        status: 'partially_comparable',
        reasons: ['domain_range_changed'],
      }),
    );
    expect(
      array(seventhDomainComparison.items, 'seventh domain items').map(
        (item) => {
          const value = record(item, 'seventh domain item');
          return [value.domainCode, value.status];
        },
      ),
    ).toEqual([
      ['attention', 'comparable'],
      ['memory', 'not_comparable'],
    ]);
    expect(points[7].dataStatus).toBe('source_missing');
    expect(record(points[8].comparisonToPrevious, 'ninth comparison')).toEqual(
      expect.objectContaining({
        status: 'unavailable',
        reasons: ['source_missing'],
        scoreDelta: null,
      }),
    );
    expect(record(points[8].score, 'ninth score').totalScoreValue).toBe(28);
    expect(array(points[8].domains, 'ninth domains')).toHaveLength(2);
    const forbidden = [
      'patientId',
      'subjectCode',
      'instanceNo',
      'scoreResultId',
      'domainResultId',
      'scaleDefinitionId',
      'scaleVersionId',
      'metadata',
      'qualityHints',
      'reviewer',
      'reviewNote',
      'itemScores',
      'groupScores',
      'itemContributions',
      'narrative',
      'risk',
      'probability',
      'diagnosis',
    ];
    const keys = collectKeys(response);
    forbidden.forEach((key) => expect(keys.has(key)).toBe(false));
    await doctorAgent
      .get(`/patients/${fixture.patientId.toString()}/assessment-history`)
      .expect(200);
    await doctorAgent
      .get(
        `/patients/${fixture.patientId.toString()}/visits/${visits[0].toString()}/clinical-reports`,
      )
      .expect(200);
    await doctorAgent
      .get(
        `/patients/${fixture.patientId.toString()}/visits/${visits[0].toString()}/clinical-reports/${reportId.toString()}`,
      )
      .expect(200);
    await doctorAgent
      .get(
        `/patients/${fixture.patientId.toString()}/visits/${visits[0].toString()}/clinical-reports/latest`,
      )
      .expect(200);
    const after = await Promise.all([
      patientModel
        .findById(fixture.patientId)
        .select({ updatedAt: 1 })
        .lean()
        .exec(),
      visitModel
        .find({ patientId: fixture.patientId })
        .select({ updatedAt: 1 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      instanceModel
        .find({ patientId: fixture.patientId })
        .select({ updatedAt: 1 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      scoreModel
        .find({ patientId: fixture.patientId })
        .select({ updatedAt: 1 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
      domainModel
        .find({ patientId: fixture.patientId })
        .select({ updatedAt: 1 })
        .sort({ _id: 1 })
        .lean()
        .exec(),
    ]);
    expect(after).toEqual(before);
    const collectionsAfter = (
      await connection.db.listCollections({}, { nameOnly: true }).toArray()
    )
      .map((collection) => collection.name)
      .sort();
    expect(collectionsAfter).toEqual(collectionsBefore);
    expect(sources).toHaveLength(8);
  });
});
