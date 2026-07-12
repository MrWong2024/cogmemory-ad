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
  Session,
  SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  Patient,
  PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  ClinicalReportDocument,
} from '../src/modules/reports/schemas/clinical-report.schema';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const PASSWORD = 'A25-Test-Password!';
const ACCOUNTS = {
  doctor: 'doctor-a25-test',
  admin: 'admin-a25-test',
  nurse: 'nurse-a25-test',
  research_assistant: 'research-a25-test',
  system: 'system-a25-test',
} as const;
const REASON = 'A25 de-identified correction reason';
const SUMMARY = 'A25 de-identified planned change scope';
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

describe('clinical report correction API (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let patientModel: Model<PatientDocument>;
  let visitModel: Model<AssessmentVisitDocument>;
  let reportModel: Model<ClinicalReportDocument>;
  let server: SupertestApp;
  let doctorAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  let nurseAgent: ReturnType<typeof request.agent>;
  let researchAgent: ReturnType<typeof request.agent>;
  let systemAgent: ReturnType<typeof request.agent>;
  let doctorId: Types.ObjectId;

  async function cleanup(): Promise<void> {
    const users = await userModel
      .find({ accountName: { $in: Object.values(ACCOUNTS) } })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }
    const patients = await patientModel
      .find({ subjectCode: /^SUBJ-A25-TEST-/ })
      .select({ _id: 1 })
      .exec();
    const patientIds = patients.map((patient) => patient._id);
    if (patientIds.length > 0) {
      await reportModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await visitModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await patientModel.deleteMany({ _id: { $in: patientIds } }).exec();
    }
    await userModel
      .deleteMany({ accountName: { $in: Object.values(ACCOUNTS) } })
      .exec();
  }

  async function createFixture(suffix: string, archived = true) {
    const patient = await patientModel.create({
      subjectCode: `SUBJ-A25-TEST-${suffix}`,
      displayName: 'A25 De-identified Subject',
      sourceType: 'clinical',
      sex: 'unknown',
      handedness: 'unknown',
      status: 'inactive',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    const visit = await visitModel.create({
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      visitCode: `VISIT-A25-TEST-${suffix}`,
      visitType: 'baseline',
      status: 'locked',
      assessmentDate: new Date('2026-07-01T08:00:00.000Z'),
      startedAt: new Date('2026-07-01T08:00:00.000Z'),
      completedAt: new Date('2026-07-01T09:00:00.000Z'),
      lockedAt: new Date('2026-07-01T09:10:00.000Z'),
      voidedAt: null,
      clinicalContext: null,
      metadata: null,
    });
    const instanceId = new Types.ObjectId();
    const scoreId = new Types.ObjectId();
    const domainId = new Types.ObjectId();
    const confirmedAt = new Date('2026-07-01T09:30:00.000Z');
    const lockedAt = new Date('2026-07-01T10:00:00.000Z');
    const freezeCompletedAt = new Date('2026-07-01T10:30:00.000Z');
    const archivedAt = new Date('2026-07-01T11:00:00.000Z');
    const freezeId = '22222222-2222-4222-8222-222222222222';
    const counts = {
      scaleInstanceCount: 1,
      itemResponseCount: 0,
      scoreResultCount: 1,
      cognitiveDomainResultCount: 1,
      mediaEvidenceCount: 0,
      totalSourceCount: 3,
    };
    const zeroCounts = {
      scaleInstanceCount: 0,
      itemResponseCount: 0,
      scoreResultCount: 0,
      cognitiveDomainResultCount: 0,
      mediaEvidenceCount: 0,
      totalSourceCount: 0,
    };
    const report = await reportModel.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      primaryScaleInstanceIds: [instanceId],
      scoreResultIds: [scoreId],
      cognitiveDomainResultIds: [domainId],
      mediaEvidenceIds: [],
      subjectCode: patient.subjectCode,
      reportCode: `RPT-A25-${suffix}`,
      reportType: 'cognitive_assessment',
      status: archived ? 'archived' : 'confirmed',
      reportVersion: 1,
      source: 'mixed',
      patientSnapshot: {
        subjectCode: patient.subjectCode,
        displayName: patient.displayName,
        sex: 'unknown',
        birthDate: null,
        educationYears: null,
      },
      visitSnapshot: {
        visitCode: visit.visitCode,
        visitType: 'baseline',
        assessmentDate: visit.assessmentDate,
        clinicalContext: null,
      },
      scaleTraces: [
        { scaleInstanceId: instanceId, scaleCode: 'moca', scaleVersion: '1.0' },
      ],
      scoreSnapshots: [
        {
          scoreResultId: scoreId,
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
          cognitiveDomainResultId: domainId,
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
        chiefSummary: 'A25 de-identified chief summary',
        scoreSummary: 'A25 de-identified score summary',
        domainSummary: 'A25 de-identified domain summary',
        evidenceSummary: 'A25 de-identified evidence summary',
        limitations: 'A25 de-identified limitation summary',
        doctorOpinion: 'A25 de-identified doctor opinion',
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: {
        confirmedAt,
        confirmedBy: doctorId,
        confirmedByName: 'A25 doctor Test Operator',
        confirmedByRole: 'doctor',
        confirmationNote: 'A25 de-identified confirmation note',
      },
      lockedAt,
      lockedBy: doctorId,
      archivedAt: archived ? archivedAt : null,
      archivedBy: archived ? doctorId : null,
      correctionRecords: [],
      voidedAt: null,
      voidedBy: null,
      auditLogRefs: [],
      qualityStatus: 'passed',
      qualityHints: null,
      metadata: {
        a20Generation: {
          version: 1,
          generationId: `generation-a25-${suffix}`,
          generatedAt: new Date('2026-07-01T09:00:00.000Z'),
          generatedBy: doctorId.toString(),
          generatedByName: 'A25 doctor Test Operator',
          generatedByRole: 'doctor',
          engineVersion: 'a20-clinical-report-draft-1.0',
          reportScope: 'explicit_primary_scale_instances',
          primaryScaleInstanceIds: [instanceId.toString()],
          scoreResultIds: [scoreId.toString()],
          cognitiveDomainResultIds: [domainId.toString()],
          mediaEvidenceCount: 0,
          aiUsed: false,
        },
        a21Submission: {
          version: 1,
          submissionId: `submission-a25-${suffix}`,
          submittedAt: new Date('2026-07-01T09:15:00.000Z'),
          submittedBy: doctorId.toString(),
          submittedByName: 'A25 doctor Test Operator',
          submittedByRole: 'doctor',
          submissionNote: 'A25 de-identified submission note',
        },
        a21Confirmation: {
          version: 1,
          confirmationId: `confirmation-a25-${suffix}`,
          confirmedAt,
          confirmedBy: doctorId.toString(),
          confirmedByName: 'A25 doctor Test Operator',
          confirmedByRole: 'doctor',
          confirmationNote: 'A25 de-identified confirmation note',
        },
        a22Lock: {
          version: 1,
          lockId: '11111111-1111-4111-8111-111111111111',
          lockedAt,
          lockedBy: doctorId.toString(),
          lockedByName: 'A25 doctor Test Operator',
          lockedByRole: 'doctor',
          lockNote: 'A25 de-identified lock note',
        },
        a23SourceFreeze: {
          version: 1,
          state: 'completed',
          freezeId,
          startedAt: new Date('2026-07-01T10:15:00.000Z'),
          sourceLockedAt: new Date('2026-07-01T10:15:00.000Z'),
          startedBy: doctorId.toString(),
          startedByName: 'A25 doctor Test Operator',
          startedByRole: 'doctor',
          freezeNote: 'A25 de-identified freeze note',
          scope: {
            scaleInstanceIds: [instanceId.toString()],
            itemResponseIds: [],
            scoreResultIds: [scoreId.toString()],
            cognitiveDomainResultIds: [domainId.toString()],
            mediaEvidenceIds: [],
          },
          expectedCounts: counts,
          completedCounts: counts,
          newlyFrozenCounts: counts,
          previouslyFrozenCounts: zeroCounts,
          completedAt: freezeCompletedAt,
          completedBy: doctorId.toString(),
          completedByName: 'A25 doctor Test Operator',
          completedByRole: 'doctor',
        },
        ...(archived
          ? {
              a24Archive: {
                version: 1,
                archiveId: '33333333-3333-4333-8333-333333333333',
                archivedAt,
                archivedBy: doctorId.toString(),
                archivedByName: 'A25 doctor Test Operator',
                archivedByRole: 'doctor',
                archiveNote: 'A25 de-identified archive note',
                sourceFreezeId: freezeId,
                sourceFreezeCompletedAt: freezeCompletedAt,
              },
            }
          : {}),
      },
    });
    return { patient, visit, report };
  }

  function correctionPath(fixture: Awaited<ReturnType<typeof createFixture>>) {
    return `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/${fixture.report._id.toString()}/corrections`;
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') throw new Error('E2E requires test');
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
    reportModel = app.get(getModelToken(ClinicalReport.name));
    await cleanup();
    const passwordHash = await authService.hashPassword(PASSWORD);
    for (const [role, accountName] of Object.entries(ACCOUNTS)) {
      await userModel.create({
        accountName,
        displayName: `A25 ${role} Test Operator`,
        staffCode: `STAFF-A25-${role.toUpperCase()}`,
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
    if (!doctor) throw new Error('Expected A25 doctor account');
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
      await cleanup();
      await app.close();
    }
  });

  it('enforces authentication, roles, strict confirmation and whitelist', async () => {
    const fixture = await createFixture('ACCESS');
    const updatedAt: unknown = fixture.report.get('updatedAt');
    if (!(updatedAt instanceof Date)) throw new Error('Expected updatedAt');
    const payload = {
      confirm: true,
      correctionReason: REASON,
      changeSummary: SUMMARY,
      expectedUpdatedAt: updatedAt.toISOString(),
    };
    const path = correctionPath(fixture);
    await request(server).post(path).send(payload).expect(401);
    await systemAgent.post(path).send(payload).expect(403);
    await nurseAgent.post(path).send(payload).expect(403);
    await researchAgent.post(path).send(payload).expect(403);
    for (const confirm of [undefined, false, 'true', 1]) {
      const response = await doctorAgent
        .post(path)
        .send({ ...payload, confirm })
        .expect(400);
      expect(body(response).code).toBe(
        'CLINICAL_REPORT_CORRECTION_CONFIRMATION_REQUIRED',
      );
    }
    for (const field of ['reportVersion', 'metadata', 'force', 'resume']) {
      await doctorAgent
        .post(path)
        .send({ ...payload, [field]: 'forged' })
        .expect(400);
    }
  });

  it('rejects a report that has not been archived', async () => {
    const fixture = await createFixture('NOT-ARCHIVED', false);
    const updatedAt: unknown = fixture.report.get('updatedAt');
    if (!(updatedAt instanceof Date)) throw new Error('Expected updatedAt');
    const response = await doctorAgent
      .post(correctionPath(fixture))
      .send({
        confirm: true,
        correctionReason: REASON,
        changeSummary: SUMMARY,
        expectedUpdatedAt: updatedAt.toISOString(),
      })
      .expect(409);
    expect(body(response).code).toBe('CLINICAL_REPORT_NOT_CORRECTABLE');
  });

  it('creates one replacement, returns latest and remains idempotent', async () => {
    const fixture = await createFixture('MAIN');
    const sourceBefore = fixture.report.toObject();
    const updatedAt: unknown = fixture.report.get('updatedAt');
    if (!(updatedAt instanceof Date)) throw new Error('Expected updatedAt');
    const path = correctionPath(fixture);
    const payload = {
      confirm: true,
      correctionReason: REASON,
      changeSummary: SUMMARY,
      expectedUpdatedAt: updatedAt.toISOString(),
    };
    const first = await doctorAgent.post(path).send(payload).expect(200);
    const firstBody = body(first);
    const source = record(firstBody.sourceReport, 'source report');
    const replacement = record(
      firstBody.replacementReport,
      'replacement report',
    );
    const receipt = record(firstBody.correctionReceipt, 'correction receipt');
    expect(source.status).toBe('corrected');
    expect(replacement).toEqual(
      expect.objectContaining({
        reportVersion: 2,
        status: 'draft',
        source: 'mixed',
        qualityStatus: 'needs_review',
        lockedAt: null,
        archivedAt: null,
      }),
    );
    expect(record(replacement.replacementOf, 'replacement lineage')).toEqual(
      expect.objectContaining({
        previousReportId: fixture.report._id.toString(),
        correctionReason: REASON,
        changeSummary: SUMMARY,
      }),
    );
    expect(receipt).toEqual(
      expect.objectContaining({
        state: 'completed',
        alreadyCreated: false,
        resumedExisting: false,
      }),
    );
    const replacementId = String(replacement.id);
    const persistedSource = await reportModel.findById(fixture.report._id);
    const persistedReplacement = await reportModel.findById(replacementId);
    expect(persistedSource?.status).toBe('corrected');
    expect(persistedSource?.correctionRecords).toHaveLength(1);
    expect(persistedSource?.archivedAt).toEqual(sourceBefore.archivedAt);
    expect(persistedSource?.lockedAt).toEqual(sourceBefore.lockedAt);
    expect(JSON.stringify(persistedSource?.narrative)).toBe(
      JSON.stringify(sourceBefore.narrative),
    );
    expect(persistedReplacement?.confirmation).toBeNull();
    expect(persistedReplacement?.correctionRecords).toHaveLength(0);
    expect(persistedReplacement?.auditLogRefs).toHaveLength(0);
    const latest = await doctorAgent
      .get(
        `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/latest`,
      )
      .expect(200);
    expect(record(body(latest).report, 'latest report').id).toBe(replacementId);
    const repeated = await adminAgent
      .post(path)
      .send({
        ...payload,
        correctionReason: 'must not overwrite original reason',
        changeSummary: 'must not overwrite original summary',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(200);
    expect(record(body(repeated).correctionReceipt, 'repeat receipt')).toEqual(
      expect.objectContaining({
        alreadyCreated: true,
        resumedExisting: false,
        correctionReason: REASON,
        changeSummary: SUMMARY,
      }),
    );
    expect(
      await reportModel.countDocuments({ patientId: fixture.patient._id }),
    ).toBe(2);
  });

  it('lets doctor/admin edit, submit and confirm replacement only', async () => {
    const fixture = await createFixture('A21');
    const sourceUpdatedAt: unknown = fixture.report.get('updatedAt');
    if (!(sourceUpdatedAt instanceof Date)) {
      throw new Error('Expected updatedAt');
    }
    const correction = await doctorAgent
      .post(correctionPath(fixture))
      .send({
        confirm: true,
        correctionReason: REASON,
        changeSummary: SUMMARY,
        expectedUpdatedAt: sourceUpdatedAt.toISOString(),
      })
      .expect(200);
    let replacement = record(
      body(correction).replacementReport,
      'replacement report',
    );
    const basePath = `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/${String(replacement.id)}`;
    await nurseAgent
      .patch(`${basePath}/draft`)
      .send({
        doctorOpinion: 'A25 de-identified corrected opinion',
        editNote: 'A25 de-identified edit note',
        expectedUpdatedAt: String(replacement.updatedAt),
      })
      .expect(403);
    const edit = await doctorAgent
      .patch(`${basePath}/draft`)
      .send({
        doctorOpinion: 'A25 de-identified corrected opinion',
        recommendationText: 'A25 de-identified corrected recommendation',
        editNote: 'A25 de-identified edit note',
        expectedUpdatedAt: String(replacement.updatedAt),
      })
      .expect(200);
    replacement = record(body(edit).report, 'edited replacement');
    const submit = await doctorAgent
      .post(`${basePath}/submit-confirmation`)
      .send({
        confirm: true,
        submissionNote: 'A25 de-identified replacement submission',
        expectedUpdatedAt: String(replacement.updatedAt),
      })
      .expect(200);
    replacement = record(body(submit).report, 'submitted replacement');
    const confirm = await adminAgent
      .post(`${basePath}/confirm`)
      .send({
        confirm: true,
        confirmationNote: 'A25 de-identified replacement confirmation',
        expectedUpdatedAt: String(replacement.updatedAt),
      })
      .expect(200);
    replacement = record(body(confirm).report, 'confirmed replacement');
    expect(replacement).toEqual(
      expect.objectContaining({
        status: 'confirmed',
        qualityStatus: 'passed',
        lockedAt: null,
        sourceFreeze: null,
        archivedAt: null,
        archive: null,
      }),
    );
    expect(replacement.replacementOf).not.toBeNull();
  });
});
