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

const PASSWORD = 'A24-Test-Password!';
const ACCOUNTS = {
  doctor: 'doctor-a24-test',
  admin: 'admin-a24-test',
  nurse: 'nurse-a24-test',
  research_assistant: 'research-a24-test',
  system: 'system-a24-test',
} as const;
const SUBJECT_PREFIX = 'SUBJ-A24-TEST-';
const VISIT_PREFIX = 'VISIT-A24-TEST-';
const ARCHIVE_NOTE = 'A24 de-identified archive note';
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

describe('clinical report archive API (e2e)', () => {
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
      .find({ subjectCode: /^SUBJ-A24-TEST-/ })
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

  async function createFixture(
    suffix: string,
    options: {
      reportStatus?:
        | 'draft'
        | 'pending_confirmation'
        | 'confirmed'
        | 'archived'
        | 'corrected';
      locked?: boolean;
      sourceFreezeState?: 'missing' | 'in_progress' | 'completed';
      historicalArchive?: boolean;
      patientStatus?: 'active' | 'inactive';
      visitStatus?: 'completed' | 'locked';
    } = {},
  ) {
    const patient = await patientModel.create({
      subjectCode: `${SUBJECT_PREFIX}${suffix}`,
      displayName: 'A24 De-identified Subject',
      sourceType: 'clinical',
      sex: 'unknown',
      handedness: 'unknown',
      status: options.patientStatus ?? 'inactive',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    const visit = await visitModel.create({
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      visitCode: `${VISIT_PREFIX}${suffix}`,
      visitType: 'baseline',
      status: options.visitStatus ?? 'locked',
      assessmentDate: new Date('2026-07-01T08:00:00.000Z'),
      startedAt: new Date('2026-07-01T08:00:00.000Z'),
      completedAt: new Date('2026-07-01T09:00:00.000Z'),
      lockedAt: new Date('2026-07-01T09:10:00.000Z'),
      voidedAt: null,
      clinicalContext: null,
      metadata: null,
    });
    const scaleInstanceId = new Types.ObjectId();
    const scoreResultId = new Types.ObjectId();
    const domainResultId = new Types.ObjectId();
    const lockedAt = new Date('2026-07-01T10:00:00.000Z');
    const confirmedAt = new Date('2026-07-01T09:30:00.000Z');
    const sourceFreezeCompletedAt = new Date('2026-07-01T10:30:00.000Z');
    const sourceFreezeState = options.sourceFreezeState ?? 'completed';
    const metadata: Record<string, unknown> = {
      a20Generation: {
        version: 1,
        generationId: `generation-a24-${suffix}`,
        generatedAt: new Date('2026-07-01T09:00:00.000Z'),
        generatedBy: doctorId.toString(),
        generatedByName: 'A24 doctor Test Operator',
        generatedByRole: 'doctor',
        engineVersion: 'a20-clinical-report-draft-1.0',
        reportScope: 'explicit_primary_scale_instances',
        primaryScaleInstanceIds: [scaleInstanceId.toString()],
        scoreResultIds: [scoreResultId.toString()],
        cognitiveDomainResultIds: [domainResultId.toString()],
        mediaEvidenceCount: 0,
        aiUsed: false,
      },
      a21Submission: {
        version: 1,
        submissionId: `submission-a24-${suffix}`,
        submittedAt: new Date('2026-07-01T09:15:00.000Z'),
        submittedBy: doctorId.toString(),
        submittedByName: 'A24 doctor Test Operator',
        submittedByRole: 'doctor',
        submissionNote: 'A24 de-identified submission note',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: `confirmation-a24-${suffix}`,
        confirmedAt,
        confirmedBy: doctorId.toString(),
        confirmedByName: 'A24 doctor Test Operator',
        confirmedByRole: 'doctor',
        confirmationNote: 'A24 de-identified confirmation note',
      },
      a22Lock: {
        version: 1,
        lockId: '11111111-1111-4111-8111-111111111111',
        lockedAt,
        lockedBy: doctorId.toString(),
        lockedByName: 'A24 doctor Test Operator',
        lockedByRole: 'doctor',
        lockNote: 'A24 de-identified lock note',
      },
      futureNamespace: { preserved: true },
    };
    if (sourceFreezeState !== 'missing') {
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
      metadata.a23SourceFreeze = {
        version: 1,
        state: sourceFreezeState,
        freezeId: '22222222-2222-4222-8222-222222222222',
        startedAt: new Date('2026-07-01T10:15:00.000Z'),
        sourceLockedAt: new Date('2026-07-01T10:15:00.000Z'),
        startedBy: doctorId.toString(),
        startedByName: 'A24 doctor Test Operator',
        startedByRole: 'doctor',
        freezeNote: 'A24 de-identified freeze note',
        scope: {
          scaleInstanceIds: [scaleInstanceId.toString()],
          itemResponseIds: [],
          scoreResultIds: [scoreResultId.toString()],
          cognitiveDomainResultIds: [domainResultId.toString()],
          mediaEvidenceIds: [],
        },
        expectedCounts: counts,
        previouslyFrozenCounts: zeroCounts,
        ...(sourceFreezeState === 'completed'
          ? {
              completedCounts: counts,
              newlyFrozenCounts: counts,
              completedAt: sourceFreezeCompletedAt,
              completedBy: doctorId.toString(),
              completedByName: 'A24 doctor Test Operator',
              completedByRole: 'doctor',
            }
          : {}),
      };
    }
    const historicalArchivedAt = new Date('2026-07-01T11:00:00.000Z');
    const report = await reportModel.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      primaryScaleInstanceIds: [scaleInstanceId],
      scoreResultIds: [scoreResultId],
      cognitiveDomainResultIds: [domainResultId],
      mediaEvidenceIds: [],
      subjectCode: patient.subjectCode,
      reportCode: `RPT-A24-${suffix}`,
      reportType: 'cognitive_assessment',
      status: options.reportStatus ?? 'confirmed',
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
        { scaleInstanceId, scaleCode: 'moca', scaleVersion: '1.0' },
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
        chiefSummary: 'A24 de-identified chief summary',
        scoreSummary: 'A24 de-identified score summary',
        domainSummary: 'A24 de-identified domain summary',
        evidenceSummary: 'A24 de-identified evidence summary',
        limitations: 'A24 de-identified limitation summary',
        doctorOpinion: 'A24 de-identified doctor opinion',
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: {
        confirmedAt,
        confirmedBy: doctorId,
        confirmedByName: 'A24 doctor Test Operator',
        confirmedByRole: 'doctor',
        confirmationNote: 'A24 de-identified confirmation note',
      },
      lockedAt: options.locked === false ? null : lockedAt,
      lockedBy: options.locked === false ? null : doctorId,
      archivedAt: options.historicalArchive ? historicalArchivedAt : null,
      archivedBy: options.historicalArchive ? doctorId : null,
      correctionRecords: [],
      voidedAt: null,
      voidedBy: null,
      auditLogRefs: [],
      qualityStatus: 'passed',
      qualityHints: null,
      metadata,
    });
    return { patient, visit, report };
  }

  function archivePath(fixture: Awaited<ReturnType<typeof createFixture>>) {
    return `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/${fixture.report._id.toString()}/archive`;
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
    reportModel = app.get(getModelToken(ClinicalReport.name));
    await cleanup();
    const passwordHash = await authService.hashPassword(PASSWORD);
    for (const [role, accountName] of Object.entries(ACCOUNTS)) {
      await userModel.create({
        accountName,
        displayName: `A24 ${role} Test Operator`,
        staffCode: `STAFF-A24-${role.toUpperCase()}`,
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
    if (!doctor) throw new Error('Expected A24 doctor account');
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

  it('enforces authentication, roles, confirmation and body whitelist', async () => {
    const fixture = await createFixture('ACCESS');
    const path = archivePath(fixture);
    const updatedAt: unknown = fixture.report.get('updatedAt');
    if (!(updatedAt instanceof Date)) throw new Error('Expected updatedAt');
    const payload = {
      confirm: true,
      archiveNote: ARCHIVE_NOTE,
      expectedUpdatedAt: updatedAt.toISOString(),
    };
    await request(server).post(path).send(payload).expect(401);
    await systemAgent.post(path).send(payload).expect(403);
    await nurseAgent.post(path).send(payload).expect(403);
    await researchAgent.post(path).send(payload).expect(403);
    for (const confirm of [undefined, false, 'true']) {
      const response = await doctorAgent
        .post(path)
        .send({ ...payload, confirm })
        .expect(400);
      expect(body(response).code).toBe(
        'CLINICAL_REPORT_ARCHIVE_CONFIRMATION_REQUIRED',
      );
    }
    await doctorAgent
      .post(path)
      .send({ confirm: true, expectedUpdatedAt: updatedAt.toISOString() })
      .expect(400);
    await doctorAgent
      .post(path)
      .send({ confirm: true, archiveNote: ARCHIVE_NOTE })
      .expect(400);
    for (const field of [
      'status',
      'archivedAt',
      'archivedBy',
      'metadata',
      'force',
      'unarchive',
    ]) {
      await doctorAgent
        .post(path)
        .send({ ...payload, [field]: 'forged' })
        .expect(400);
    }
  });

  it('rejects draft, pending, unlocked and unfinished source-freeze reports', async () => {
    for (const [suffix, options] of [
      ['DRAFT', { reportStatus: 'draft' as const }],
      ['PENDING', { reportStatus: 'pending_confirmation' as const }],
      ['UNLOCKED', { locked: false }],
      ['NOFREEZE', { sourceFreezeState: 'missing' as const }],
      ['INPROGRESS', { sourceFreezeState: 'in_progress' as const }],
    ] as const) {
      const fixture = await createFixture(suffix, options);
      const updatedAt: unknown = fixture.report.get('updatedAt');
      if (!(updatedAt instanceof Date)) throw new Error('Expected updatedAt');
      const response = await doctorAgent
        .post(archivePath(fixture))
        .send({
          confirm: true,
          archiveNote: ARCHIVE_NOTE,
          expectedUpdatedAt: updatedAt.toISOString(),
        })
        .expect(409);
      expect(body(response).code).toBe('CLINICAL_REPORT_NOT_ARCHIVABLE');
    }
  });

  it('archives once, preserves frozen facts, maps latest and is idempotent', async () => {
    const fixture = await createFixture('MAIN');
    const path = archivePath(fixture);
    const before = fixture.report.toObject();
    const expectedUpdatedAt: unknown = fixture.report.get('updatedAt');
    if (!(expectedUpdatedAt instanceof Date)) {
      throw new Error('Expected updatedAt');
    }
    const first = await doctorAgent
      .post(path)
      .send({
        confirm: true,
        archiveNote: ARCHIVE_NOTE,
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(200);
    const firstBody = body(first);
    const report = record(firstBody.report, 'report');
    const archive = record(report.archive, 'archive');
    const receipt = record(firstBody.archiveReceipt, 'archive receipt');
    expect(report).toEqual(
      expect.objectContaining({ status: 'archived', isFinal: true }),
    );
    expect(typeof report.archivedAt).toBe('string');
    expect(archive).toEqual(
      expect.objectContaining({
        archiveNote: ARCHIVE_NOTE,
        sourceFreezeId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    expect(typeof archive.archiveId).toBe('string');
    expect(typeof archive.sourceFreezeCompletedAt).toBe('string');
    expect(receipt).toEqual(
      expect.objectContaining({
        archiveId: archive.archiveId,
        archivedAt: report.archivedAt,
        archiveNote: ARCHIVE_NOTE,
        alreadyArchived: false,
      }),
    );
    expect(report).not.toHaveProperty('metadata');
    expect(report).not.toHaveProperty('archivedBy');
    expect(report).not.toHaveProperty('primaryScaleInstanceIds');
    expect(report).not.toHaveProperty('scoreResultIds');
    expect(report).not.toHaveProperty('cognitiveDomainResultIds');
    const persisted = await reportModel.findById(fixture.report._id).exec();
    if (!persisted) throw new Error('Expected archived report');
    const after = persisted.toObject();
    expect(persisted.status).toBe('archived');
    expect(after.lockedAt).toEqual(before.lockedAt);
    expect(after.lockedBy).toEqual(before.lockedBy);
    expect(after.confirmation).toEqual(before.confirmation);
    expect(after.narrative).toEqual(before.narrative);
    expect(after.scaleTraces).toEqual(before.scaleTraces);
    expect(after.scoreSnapshots).toEqual(before.scoreSnapshots);
    expect(after.domainSnapshots).toEqual(before.domainSnapshots);
    expect(after.primaryScaleInstanceIds).toEqual(
      before.primaryScaleInstanceIds,
    );
    const metadata = after.metadata as Record<string, unknown>;
    expect(metadata.a20Generation).toEqual(
      (before.metadata as Record<string, unknown>).a20Generation,
    );
    expect(metadata.a22Lock).toEqual(
      (before.metadata as Record<string, unknown>).a22Lock,
    );
    expect(metadata.a23SourceFreeze).toEqual(
      (before.metadata as Record<string, unknown>).a23SourceFreeze,
    );
    expect(metadata.futureNamespace).toEqual({ preserved: true });
    const persistedUpdatedAt: unknown = after.updatedAt;
    if (!(persistedUpdatedAt instanceof Date)) {
      throw new Error('Expected updatedAt');
    }
    const latest = await doctorAgent
      .get(
        `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/latest`,
      )
      .expect(200);
    expect(record(body(latest).report, 'latest report')).toEqual(
      expect.objectContaining({
        status: 'archived',
        archivedAt: report.archivedAt,
        archive,
      }),
    );
    const repeated = await doctorAgent
      .post(path)
      .send({
        confirm: true,
        archiveNote: 'A24 new note must not overwrite',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(200);
    expect(record(body(repeated).archiveReceipt, 'repeat receipt')).toEqual(
      expect.objectContaining({
        archiveId: receipt.archiveId,
        archivedAt: receipt.archivedAt,
        archiveNote: ARCHIVE_NOTE,
        alreadyArchived: true,
      }),
    );
    const afterRepeat = await reportModel.findById(fixture.report._id).exec();
    expect(afterRepeat?.get('updatedAt')).toEqual(persistedUpdatedAt);
    expect(afterRepeat?.metadata).toEqual(after.metadata);

    const unchangedPatient = await patientModel
      .findById(fixture.patient._id)
      .exec();
    const unchangedVisit = await visitModel.findById(fixture.visit._id).exec();
    expect(unchangedPatient?.status).toBe('inactive');
    expect(unchangedVisit?.status).toBe('locked');

    await patientModel
      .updateOne({ _id: fixture.patient._id }, { $set: { status: 'active' } })
      .exec();
    await visitModel
      .updateOne({ _id: fixture.visit._id }, { $set: { status: 'completed' } })
      .exec();

    await doctorAgent
      .post(
        `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/generate`,
      )
      .send({
        confirm: true,
        primaryScaleInstanceIds: before.primaryScaleInstanceIds.map((id) =>
          id.toString(),
        ),
      })
      .expect(200)
      .expect((response: Response) => {
        expect(body(response).alreadyGenerated).toBe(true);
      });
    await doctorAgent
      .post(path.replace('/archive', '/confirm'))
      .send({
        confirm: true,
        confirmationNote: 'A24 idempotent confirmation note',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(200)
      .expect((response: Response) => {
        expect(
          record(body(response).confirmationReceipt, 'confirmation receipt')
            .alreadyConfirmed,
        ).toBe(true);
      });
    await doctorAgent
      .post(path.replace('/archive', '/lock'))
      .send({
        confirm: true,
        lockNote: 'A24 idempotent lock note',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(200)
      .expect((response: Response) => {
        expect(
          record(body(response).lockReceipt, 'lock receipt').alreadyLocked,
        ).toBe(true);
      });
    await doctorAgent
      .post(path.replace('/archive', '/freeze-sources'))
      .send({
        confirm: true,
        freezeNote: 'A24 idempotent freeze note',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(200)
      .expect((response: Response) => {
        expect(
          record(body(response).sourceFreezeReceipt, 'source freeze receipt')
            .alreadyFrozen,
        ).toBe(true);
      });
    const afterLegacyIdempotency = await reportModel
      .findById(fixture.report._id)
      .exec();
    expect(afterLegacyIdempotency?.status).toBe('archived');
    expect(afterLegacyIdempotency?.metadata).toEqual(after.metadata);
    expect(afterLegacyIdempotency?.get('updatedAt')).toEqual(
      persistedUpdatedAt,
    );
  });

  it('returns optimistic conflict and supports historical corrected fallback', async () => {
    const conflict = await createFixture('CONFLICT');
    const oldUpdatedAt: unknown = conflict.report.get('updatedAt');
    if (!(oldUpdatedAt instanceof Date)) throw new Error('Expected updatedAt');
    await reportModel
      .updateOne(
        { _id: conflict.report._id },
        { $set: { operatorNote: 'A24 concurrent test marker' } },
      )
      .exec();
    const conflictResponse = await doctorAgent
      .post(archivePath(conflict))
      .send({
        confirm: true,
        archiveNote: ARCHIVE_NOTE,
        expectedUpdatedAt: oldUpdatedAt.toISOString(),
      })
      .expect(409);
    expect(body(conflictResponse).code).toBe(
      'CLINICAL_REPORT_ARCHIVE_CONFLICT',
    );

    const historical = await createFixture('HISTORICAL', {
      reportStatus: 'corrected',
      historicalArchive: true,
    });
    const historicalUpdatedAt: unknown = historical.report.get('updatedAt');
    if (!(historicalUpdatedAt instanceof Date)) {
      throw new Error('Expected updatedAt');
    }
    const response = await doctorAgent
      .post(archivePath(historical))
      .send({
        confirm: true,
        archiveNote: 'A24 fallback request note',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(200);
    expect(record(body(response).archiveReceipt, 'fallback receipt')).toEqual(
      expect.objectContaining({
        archiveId: null,
        sourceFreezeId: null,
        sourceFreezeCompletedAt: null,
        alreadyArchived: true,
      }),
    );
    const unchanged = await reportModel.findById(historical.report._id).exec();
    expect(unchanged?.get('updatedAt')).toEqual(historicalUpdatedAt);
    expect(
      (unchanged?.metadata as Record<string, unknown>).a24Archive,
    ).toBeUndefined();
  });

  it('allows admin to archive a ready report', async () => {
    const fixture = await createFixture('ADMIN', {
      patientStatus: 'active',
      visitStatus: 'completed',
    });
    const expectedUpdatedAt: unknown = fixture.report.get('updatedAt');
    if (!(expectedUpdatedAt instanceof Date)) {
      throw new Error('Expected updatedAt');
    }
    const response = await adminAgent
      .post(archivePath(fixture))
      .send({
        confirm: true,
        archiveNote: 'A24 de-identified admin archive note',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(200);
    const receipt = record(body(response).archiveReceipt, 'admin receipt');
    expect(receipt.alreadyArchived).toBe(false);
    expect(record(receipt.archivedBy, 'admin actor').operatorRole).toBe(
      'admin',
    );
  });
});
