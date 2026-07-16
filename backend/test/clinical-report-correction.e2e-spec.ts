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
  let instanceModel: Model<ScaleInstanceDocument>;
  let itemModel: Model<ItemResponseDocument>;
  let scoreModel: Model<ScoreResultDocument>;
  let domainModel: Model<CognitiveDomainResultDocument>;
  let mediaModel: Model<MediaEvidenceDocument>;
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
      await domainModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await scoreModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await mediaModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await itemModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await instanceModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await visitModel.deleteMany({ patientId: { $in: patientIds } }).exec();
      await patientModel.deleteMany({ _id: { $in: patientIds } }).exec();
    }
    await userModel
      .deleteMany({ accountName: { $in: Object.values(ACCOUNTS) } })
      .exec();
  }

  async function createFixture(
    suffix: string,
    archived = true,
    lifecycleReady = false,
  ) {
    const patient = await patientModel.create({
      subjectCode: `SUBJ-A25-TEST-${suffix}`,
      displayName: 'A25 De-identified Subject',
      sourceType: 'clinical',
      sex: 'unknown',
      handedness: 'unknown',
      status: lifecycleReady ? 'active' : 'inactive',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    const visit = await visitModel.create({
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      visitCode: `VISIT-A25-TEST-${suffix}`,
      visitType: 'baseline',
      status: lifecycleReady ? 'completed' : 'locked',
      assessmentDate: new Date('2026-07-01T08:00:00.000Z'),
      startedAt: new Date('2026-07-01T08:00:00.000Z'),
      completedAt: new Date('2026-07-01T09:00:00.000Z'),
      lockedAt: lifecycleReady ? null : new Date('2026-07-01T09:10:00.000Z'),
      voidedAt: null,
      clinicalContext: null,
      metadata: null,
    });
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const confirmedAt = new Date('2026-07-01T09:30:00.000Z');
    const lockedAt = new Date('2026-07-01T10:00:00.000Z');
    const sourceLockedAt = new Date('2026-07-01T10:15:00.000Z');
    const freezeCompletedAt = new Date('2026-07-01T10:30:00.000Z');
    const archivedAt = new Date('2026-07-01T11:00:00.000Z');
    const freezeId = '22222222-2222-4222-8222-222222222222';
    const sourcesLocked = !lifecycleReady;
    const instance = await instanceModel.create({
      assessmentVisitId: visit._id,
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: `INST-A26-${suffix}`,
      instanceNo: 1,
      status: sourcesLocked ? 'locked' : 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-a26-test',
        scoringRuleVersion: 'score-a26-test',
        fieldEncodingVersion: 'field-a26-test',
        sourceDocument: 'a26-test-source',
      },
      completedAt: new Date('2026-07-01T09:00:00.000Z'),
      lockedAt: sourcesLocked ? sourceLockedAt : null,
      voidedAt: null,
      metadata: { submission: { submissionId: `a26-${suffix}` } },
    });
    const item = await itemModel.create({
      assessmentVisitId: visit._id,
      scaleInstanceId: instance._id,
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: instance.instanceCode,
      itemCode: 'moca.a26.test.item',
      itemOrder: 1,
      responseType: 'text',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['memory'],
      itemConfigSnapshot: null,
      versionTrace: { scaleVersion: '1.0' },
      status: sourcesLocked ? 'locked' : 'answered',
      answerSource: 'clinician_recorded',
      rawResponse: 'de-identified test response',
      structuredResponse: null,
      isMissing: false,
      stepResults: [],
      promptResponses: [],
      evidenceRefs: [],
      lockedAt: sourcesLocked ? sourceLockedAt : null,
      voidedAt: null,
    });
    const evidenceStorage = {
      storageDriver: 'fake',
      bucket: 'a26-test-bucket',
      objectKey: `cogmemory_ad/a26/${suffix}/evidence.png`,
      objectPrefix: `cogmemory_ad/a26/${suffix}`,
      mimeType: 'image/png',
      fileExtension: 'png',
      sizeBytes: 128,
      checksum: `a26-checksum-${suffix}`,
      checksumAlgorithm: 'sha256',
      storedAt: new Date('2026-07-01T08:30:00.000Z'),
    };
    const evidenceId = new Types.ObjectId();
    const evidence = await mediaModel.create({
      _id: evidenceId,
      patientId: patient._id,
      assessmentVisitId: visit._id,
      scaleInstanceId: instance._id,
      itemResponseId: item._id,
      subjectCode: patient.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: instance.instanceCode,
      itemCode: item.itemCode,
      evidenceCode: `EVD-A26-${suffix}`,
      evidenceType: 'photo',
      captureMode: 'photo_upload',
      status: sourcesLocked ? 'locked' : 'attached',
      storageStatus: 'stored',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['memory'],
      itemSnapshot: { itemCode: item.itemCode },
      versionTrace: { scaleVersion: '1.0' },
      storage: evidenceStorage,
      qualityStatus: 'acceptable',
      lockedAt: sourcesLocked ? sourceLockedAt : null,
      voidedAt: null,
      deletedAt: null,
    });
    const score = await scoreModel.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      scaleInstanceId: instance._id,
      subjectCode: patient.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: instance.instanceCode,
      scoreResultCode: `SCR-A26-${suffix}`,
      runNo: 1,
      status: sourcesLocked ? 'locked' : 'confirmed',
      scoringSource: 'manual',
      scoringMode: 'manual_summary',
      versionTrace: { scaleVersion: '1.0' },
      totalScore: {
        scoreValue: 1,
        maxScore: 1,
        minScore: 0,
        scorePercent: 100,
        scoredItemCount: 1,
        totalItemCount: 1,
        unscoredItemCount: 0,
        missingItemCount: 0,
        needsReviewItemCount: 0,
      },
      itemScores: [
        {
          itemResponseId: item._id,
          itemCode: item.itemCode,
          itemOrder: 1,
          countsTowardTotal: true,
          includedInTotal: true,
          scoreValue: 1,
          maxScore: 1,
          minScore: 0,
          scoreStatus: 'manual_scored',
          scoreSource: 'operator',
          isMissing: false,
          cognitiveDomainCodes: ['memory'],
        },
      ],
      groupScores: [],
      computation: { warningCount: 0 },
      review: { reviewStatus: 'reviewed' },
      qualityStatus: 'passed',
      confirmedAt,
      lockedAt: sourcesLocked ? sourceLockedAt : null,
      voidedAt: null,
    });
    const domain = await domainModel.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      scaleInstanceId: instance._id,
      scoreResultId: score._id,
      subjectCode: patient.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: instance.instanceCode,
      domainResultCode: `CDR-A26-${suffix}`,
      runNo: 1,
      status: 'computed',
      mappingSource: 'scale_config',
      mappingMode: 'item_domain_codes',
      versionTrace: { scaleVersion: '1.0' },
      domainScores: [
        {
          domainCode: 'memory',
          scoreValue: 1,
          maxScore: 1,
          minScore: 0,
          scorePercent: 100,
          itemCount: 1,
          scoredItemCount: 1,
          unscoredItemCount: 0,
          missingItemCount: 0,
          needsReviewItemCount: 0,
          excludedItemCount: 0,
        },
      ],
      itemContributions: [
        {
          itemResponseId: item._id,
          scoreResultId: score._id,
          itemCode: item.itemCode,
          itemOrder: 1,
          domainCode: 'memory',
          weight: 1,
          countsTowardDomain: true,
          scoreValue: 1,
          maxScore: 1,
          weightedScore: 1,
          weightedMaxScore: 1,
          scoreStatus: 'manual_scored',
          scoreSource: 'operator',
          isMissing: false,
        },
      ],
      mappingSnapshot: {
        mappingVersion: 'a19-item-domain-codes-1.0',
        mappingSource: 'scale_config',
        domainCodes: ['memory'],
        mappingRules: null,
      },
      computation: {
        computedAt: new Date('2026-07-01T09:20:00.000Z'),
        warningCount: 0,
      },
      review: { reviewStatus: 'not_required' },
      qualityStatus: 'unchecked',
      lockedAt: sourcesLocked ? sourceLockedAt : null,
      voidedAt: null,
    });
    const counts = {
      scaleInstanceCount: 1,
      itemResponseCount: 1,
      scoreResultCount: 1,
      cognitiveDomainResultCount: 1,
      mediaEvidenceCount: 1,
      totalSourceCount: 5,
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
      primaryScaleInstanceIds: [instance._id],
      scoreResultIds: [score._id],
      cognitiveDomainResultIds: [domain._id],
      mediaEvidenceIds: [evidenceId],
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
        {
          scaleInstanceId: instance._id,
          scaleCode: 'moca',
          scaleVersion: '1.0',
        },
      ],
      scoreSnapshots: [
        {
          scoreResultId: score._id,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          totalScoreValue: 1,
          totalMaxScore: 1,
          totalMinScore: 0,
          scorePercent: 100,
          scoreStatus: 'confirmed',
          qualityStatus: 'passed',
          scoreDetails: null,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: domain._id,
          scaleCode: 'moca',
          domainCode: 'memory',
          scoreValue: 1,
          maxScore: 1,
          scorePercent: 100,
          weightedScore: 1,
          weightedMaxScore: 1,
          itemCount: 1,
          needsReviewItemCount: 0,
        },
      ],
      evidenceSnapshots: [
        {
          mediaEvidenceId: evidenceId,
          itemResponseId: item._id,
          scaleCode: 'moca',
          itemCode: item.itemCode,
          evidenceType: 'photo',
          captureMode: 'photo_upload',
          qualityStatus: 'passed',
          storageObjectKey: evidenceStorage.objectKey,
        },
      ],
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
      lockedAt: sourcesLocked ? lockedAt : null,
      lockedBy: sourcesLocked ? doctorId : null,
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
          primaryScaleInstanceIds: [instance._id.toString()],
          scoreResultIds: [score._id.toString()],
          cognitiveDomainResultIds: [domain._id.toString()],
          mediaEvidenceCount: 1,
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
        ...(sourcesLocked
          ? {
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
                startedAt: sourceLockedAt,
                sourceLockedAt,
                startedBy: doctorId.toString(),
                startedByName: 'A25 doctor Test Operator',
                startedByRole: 'doctor',
                freezeNote: 'A25 de-identified freeze note',
                scope: {
                  scaleInstanceIds: [instance._id.toString()],
                  itemResponseIds: [item._id.toString()],
                  scoreResultIds: [score._id.toString()],
                  cognitiveDomainResultIds: [domain._id.toString()],
                  mediaEvidenceIds: [evidenceId.toString()],
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
            }
          : {}),
        ...(archived && sourcesLocked
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
    return {
      patient,
      visit,
      instance,
      item,
      score,
      domain,
      evidence,
      evidenceId,
      report,
    };
  }

  function correctionPath(fixture: Awaited<ReturnType<typeof createFixture>>) {
    return `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/${fixture.report._id.toString()}/corrections`;
  }

  function reportPath(
    patientId: string,
    visitId: string,
    reportId: string,
  ): string {
    return `/patients/${patientId}/visits/${visitId}/clinical-reports/${reportId}`;
  }

  async function createConfirmedReplacement(input: {
    patientId: string;
    visitId: string;
    reportId: string;
    expectedUpdatedAt: string;
  }): Promise<{
    report: Record<string, unknown>;
    sourceReport: Record<string, unknown>;
    basePath: string;
  }> {
    const sourcePath = reportPath(
      input.patientId,
      input.visitId,
      input.reportId,
    );
    const correction = await doctorAgent
      .post(`${sourcePath}/corrections`)
      .send({
        confirm: true,
        correctionReason: REASON,
        changeSummary: SUMMARY,
        expectedUpdatedAt: input.expectedUpdatedAt,
      })
      .expect(200);
    const sourceReport = record(
      body(correction).sourceReport,
      'corrected source report',
    );
    let replacement = record(
      body(correction).replacementReport,
      'replacement report',
    );
    const basePath = reportPath(
      input.patientId,
      input.visitId,
      String(replacement.id),
    );
    const edit = await doctorAgent.patch(`${basePath}/draft`).send({
      doctorOpinion: `A26 V${String(replacement.reportVersion)} de-identified corrected opinion`,
      recommendationText: `A26 V${String(replacement.reportVersion)} de-identified corrected recommendation`,
      editNote: 'A26 de-identified correction edit',
      expectedUpdatedAt: String(replacement.updatedAt),
    });
    if (edit.status !== 200) {
      throw new Error(
        `Expected replacement edit success, received ${edit.status} ${String(body(edit).code)}`,
      );
    }
    replacement = record(body(edit).report, 'edited replacement');
    const submit = await doctorAgent
      .post(`${basePath}/submit-confirmation`)
      .send({
        confirm: true,
        submissionNote: 'A26 de-identified replacement submission',
        expectedUpdatedAt: String(replacement.updatedAt),
      })
      .expect(200);
    replacement = record(body(submit).report, 'submitted replacement');
    const confirmation = await adminAgent
      .post(`${basePath}/confirm`)
      .send({
        confirm: true,
        confirmationNote: 'A26 de-identified replacement confirmation',
        expectedUpdatedAt: String(replacement.updatedAt),
      })
      .expect(200);
    replacement = record(body(confirmation).report, 'confirmed replacement');
    return { report: replacement, sourceReport, basePath };
  }

  function sourceFact(document: { get(path: string): unknown }) {
    const lockedAt = document.get('lockedAt');
    const updatedAt = document.get('updatedAt');
    return {
      status: document.get('status'),
      lockedAt:
        lockedAt instanceof Date ? lockedAt.toISOString() : (lockedAt ?? null),
      updatedAt:
        updatedAt instanceof Date
          ? updatedAt.toISOString()
          : (updatedAt ?? null),
      metadata: JSON.stringify(document.get('metadata') ?? null),
    };
  }

  async function readSourceFacts(
    fixture: Awaited<ReturnType<typeof createFixture>>,
  ) {
    const [instance, item, score, domain, evidence] = await Promise.all([
      instanceModel.findById(fixture.instance._id).exec(),
      itemModel.findById(fixture.item._id).exec(),
      scoreModel.findById(fixture.score._id).exec(),
      domainModel.findById(fixture.domain._id).exec(),
      mediaModel.findById(fixture.evidenceId).exec(),
    ]);
    if (!instance || !item || !score || !domain || !evidence) {
      throw new Error('Expected A26 source fixtures');
    }
    return {
      instance: sourceFact(instance),
      item: sourceFact(item),
      score: sourceFact(score),
      domain: sourceFact(domain),
      evidence: sourceFact(evidence),
    };
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
    instanceModel = app.get(getModelToken(ScaleInstance.name));
    itemModel = app.get(getModelToken(ItemResponse.name));
    scoreModel = app.get(getModelToken(ScoreResult.name));
    domainModel = app.get(getModelToken(CognitiveDomainResult.name));
    mediaModel = app.get(getModelToken(MediaEvidence.name));
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

  it('keeps the V1 lock, freeze and archive lifecycle unchanged', async () => {
    const fixture = await createFixture('A26-V1', false, true);
    const initialUpdatedAt: unknown = fixture.report.get('updatedAt');
    if (!(initialUpdatedAt instanceof Date)) {
      throw new Error('Expected V1 report updatedAt');
    }
    const basePath = reportPath(
      fixture.patient._id.toString(),
      fixture.visit._id.toString(),
      fixture.report._id.toString(),
    );
    const lock = await doctorAgent
      .post(`${basePath}/lock`)
      .send({
        confirm: true,
        lockNote: 'A26 V1 de-identified lock note',
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
      })
      .expect(200);
    let report = record(body(lock).report, 'V1 locked report');
    expect(
      record(body(lock).lockReceipt, 'V1 lock receipt').alreadyLocked,
    ).toBe(false);
    const freeze = await doctorAgent
      .post(`${basePath}/freeze-sources`)
      .send({
        confirm: true,
        freezeNote: 'A26 V1 de-identified freeze note',
        expectedUpdatedAt: String(report.updatedAt),
      })
      .expect(200);
    report = record(body(freeze).report, 'V1 source-frozen report');
    const freezeReceipt = record(
      body(freeze).sourceFreezeReceipt,
      'V1 source freeze receipt',
    );
    expect(freezeReceipt).toEqual(
      expect.objectContaining({
        alreadyFrozen: false,
        resumedExisting: false,
      }),
    );
    expect(
      record(freezeReceipt.newlyFrozenCounts, 'V1 newly frozen counts')
        .totalSourceCount,
    ).toBe(5);
    const archive = await doctorAgent
      .post(`${basePath}/archive`)
      .send({
        confirm: true,
        archiveNote: 'A26 V1 de-identified archive note',
        expectedUpdatedAt: String(report.updatedAt),
      })
      .expect(200);
    report = record(body(archive).report, 'V1 archived report');
    expect(report).toEqual(
      expect.objectContaining({ reportVersion: 1, status: 'archived' }),
    );
    expect(
      record(body(archive).archiveReceipt, 'V1 archive receipt')
        .alreadyArchived,
    ).toBe(false);
  });

  it('runs V2 and V3 lifecycles without rewriting shared frozen sources', async () => {
    const fixture = await createFixture('A26-CHAIN');
    const sourceUpdatedAt: unknown = fixture.report.get('updatedAt');
    if (!(sourceUpdatedAt instanceof Date)) {
      throw new Error('Expected archived V1 updatedAt');
    }
    const sourceFactsBefore = await readSourceFacts(fixture);
    const v2 = await createConfirmedReplacement({
      patientId: fixture.patient._id.toString(),
      visitId: fixture.visit._id.toString(),
      reportId: fixture.report._id.toString(),
      expectedUpdatedAt: sourceUpdatedAt.toISOString(),
    });
    expect(v2.report).toEqual(
      expect.objectContaining({ reportVersion: 2, status: 'confirmed' }),
    );
    await visitModel
      .updateOne(
        { _id: fixture.visit._id },
        {
          $set: {
            status: 'voided',
            voidedAt: new Date('2026-07-02T08:00:00.000Z'),
          },
        },
      )
      .exec();
    const sourceAfterCorrection = await reportModel
      .findById(fixture.report._id)
      .exec();
    if (!sourceAfterCorrection) {
      throw new Error('Expected corrected V1 source report');
    }
    const sourceAfterCorrectionUpdatedAt: unknown =
      sourceAfterCorrection.get('updatedAt');
    const sourceLifecycleFacts = {
      status: sourceAfterCorrection.status,
      lockedAt: sourceAfterCorrection.lockedAt,
      archivedAt: sourceAfterCorrection.archivedAt,
      updatedAt: sourceAfterCorrectionUpdatedAt,
      metadata: JSON.stringify(sourceAfterCorrection.metadata),
      correctionRecords: JSON.stringify(
        sourceAfterCorrection.correctionRecords,
      ),
    };

    const freezeBeforeLock = await doctorAgent
      .post(`${v2.basePath}/freeze-sources`)
      .send({
        confirm: true,
        freezeNote: 'A26 V2 freeze before lock',
        expectedUpdatedAt: String(v2.report.updatedAt),
      })
      .expect(409);
    expect(body(freezeBeforeLock).code).toBe(
      'CLINICAL_REPORT_NOT_SOURCE_FREEZABLE',
    );
    const v2LockPayload = {
      confirm: true,
      lockNote: 'A26 V2 de-identified lock note',
      expectedUpdatedAt: String(v2.report.updatedAt),
    };
    await nurseAgent
      .post(`${v2.basePath}/lock`)
      .send(v2LockPayload)
      .expect(403);
    await researchAgent
      .post(`${v2.basePath}/lock`)
      .send(v2LockPayload)
      .expect(403);
    const staleLock = await doctorAgent
      .post(`${v2.basePath}/lock`)
      .send({ ...v2LockPayload, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' })
      .expect(409);
    expect(body(staleLock).code).toBe('CLINICAL_REPORT_LOCK_CONFLICT');
    const v2Lock = await doctorAgent
      .post(`${v2.basePath}/lock`)
      .send(v2LockPayload)
      .expect(200);
    let v2Report = record(body(v2Lock).report, 'V2 locked report');
    const v2LockReceipt = record(body(v2Lock).lockReceipt, 'V2 lock receipt');
    expect(v2LockReceipt.alreadyLocked).toBe(false);
    const repeatedLock = await adminAgent
      .post(`${v2.basePath}/lock`)
      .send({
        confirm: true,
        lockNote: 'must not replace V2 lock note',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(200);
    expect(record(body(repeatedLock).lockReceipt, 'replayed V2 lock')).toEqual({
      ...v2LockReceipt,
      alreadyLocked: true,
    });
    expect(
      record(body(repeatedLock).report, 'replayed V2 report').updatedAt,
    ).toBe(v2Report.updatedAt);

    const archiveBeforeFreeze = await doctorAgent
      .post(`${v2.basePath}/archive`)
      .send({
        confirm: true,
        archiveNote: 'A26 V2 archive before freeze',
        expectedUpdatedAt: String(v2Report.updatedAt),
      })
      .expect(409);
    expect(body(archiveBeforeFreeze).code).toBe(
      'CLINICAL_REPORT_NOT_ARCHIVABLE',
    );
    const v2Freeze = await doctorAgent
      .post(`${v2.basePath}/freeze-sources`)
      .send({
        confirm: true,
        freezeNote: 'A26 V2 de-identified freeze note',
        expectedUpdatedAt: String(v2Report.updatedAt),
      })
      .expect(200);
    v2Report = record(body(v2Freeze).report, 'V2 source-frozen report');
    const v2FreezeReceipt = record(
      body(v2Freeze).sourceFreezeReceipt,
      'V2 source freeze receipt',
    );
    expect(
      record(
        v2FreezeReceipt.previouslyFrozenCounts,
        'V2 previously frozen counts',
      ).totalSourceCount,
    ).toBe(5);
    expect(
      record(v2FreezeReceipt.newlyFrozenCounts, 'V2 newly frozen counts')
        .totalSourceCount,
    ).toBe(0);
    const repeatedFreeze = await adminAgent
      .post(`${v2.basePath}/freeze-sources`)
      .send({
        confirm: true,
        freezeNote: 'must not replace V2 freeze note',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(200);
    expect(
      record(body(repeatedFreeze).sourceFreezeReceipt, 'replayed V2 freeze'),
    ).toEqual({
      ...v2FreezeReceipt,
      alreadyFrozen: true,
      resumedExisting: false,
    });
    expect(
      record(body(repeatedFreeze).report, 'replayed frozen V2').updatedAt,
    ).toBe(v2Report.updatedAt);
    expect(await readSourceFacts(fixture)).toEqual(sourceFactsBefore);

    const staleArchive = await doctorAgent
      .post(`${v2.basePath}/archive`)
      .send({
        confirm: true,
        archiveNote: 'A26 stale V2 archive note',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(409);
    expect(body(staleArchive).code).toBe('CLINICAL_REPORT_ARCHIVE_CONFLICT');
    const v2Archive = await doctorAgent
      .post(`${v2.basePath}/archive`)
      .send({
        confirm: true,
        archiveNote: 'A26 V2 de-identified archive note',
        expectedUpdatedAt: String(v2Report.updatedAt),
      })
      .expect(200);
    v2Report = record(body(v2Archive).report, 'V2 archived report');
    const v2ArchiveReceipt = record(
      body(v2Archive).archiveReceipt,
      'V2 archive receipt',
    );
    expect(v2Report).toEqual(
      expect.objectContaining({ reportVersion: 2, status: 'archived' }),
    );
    const repeatedArchive = await adminAgent
      .post(`${v2.basePath}/archive`)
      .send({
        confirm: true,
        archiveNote: 'must not replace V2 archive note',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(200);
    expect(
      record(body(repeatedArchive).archiveReceipt, 'replayed V2 archive'),
    ).toEqual({ ...v2ArchiveReceipt, alreadyArchived: true });
    expect(
      record(body(repeatedArchive).report, 'replayed archived V2').updatedAt,
    ).toBe(v2Report.updatedAt);
    const sourceAfterV2Lifecycle = await reportModel
      .findById(fixture.report._id)
      .exec();
    if (!sourceAfterV2Lifecycle) {
      throw new Error('Expected V1 after V2 lifecycle');
    }
    const sourceAfterV2LifecycleUpdatedAt: unknown =
      sourceAfterV2Lifecycle.get('updatedAt');
    expect({
      status: sourceAfterV2Lifecycle.status,
      lockedAt: sourceAfterV2Lifecycle.lockedAt,
      archivedAt: sourceAfterV2Lifecycle.archivedAt,
      updatedAt: sourceAfterV2LifecycleUpdatedAt,
      metadata: JSON.stringify(sourceAfterV2Lifecycle.metadata),
      correctionRecords: JSON.stringify(
        sourceAfterV2Lifecycle.correctionRecords,
      ),
    }).toEqual(sourceLifecycleFacts);

    const v3 = await createConfirmedReplacement({
      patientId: fixture.patient._id.toString(),
      visitId: fixture.visit._id.toString(),
      reportId: String(v2Report.id),
      expectedUpdatedAt: String(v2Report.updatedAt),
    });
    expect(v3.report).toEqual(
      expect.objectContaining({ reportVersion: 3, status: 'confirmed' }),
    );
    const historicalV2Archive = await doctorAgent
      .post(`${v2.basePath}/archive`)
      .send({
        confirm: true,
        archiveNote: 'must preserve historical V2 archive',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(200);
    expect(
      record(
        body(historicalV2Archive).archiveReceipt,
        'historical V2 archive receipt',
      ),
    ).toEqual({ ...v2ArchiveReceipt, alreadyArchived: true });

    const v3Lock = await doctorAgent
      .post(`${v3.basePath}/lock`)
      .send({
        confirm: true,
        lockNote: 'A26 V3 de-identified lock note',
        expectedUpdatedAt: String(v3.report.updatedAt),
      })
      .expect(200);
    let v3Report = record(body(v3Lock).report, 'V3 locked report');
    const v3Freeze = await doctorAgent
      .post(`${v3.basePath}/freeze-sources`)
      .send({
        confirm: true,
        freezeNote: 'A26 V3 de-identified freeze note',
        expectedUpdatedAt: String(v3Report.updatedAt),
      })
      .expect(200);
    v3Report = record(body(v3Freeze).report, 'V3 source-frozen report');
    expect(
      record(
        record(body(v3Freeze).sourceFreezeReceipt, 'V3 freeze receipt')
          .previouslyFrozenCounts,
        'V3 previously frozen counts',
      ).totalSourceCount,
    ).toBe(5);
    const v3Archive = await doctorAgent
      .post(`${v3.basePath}/archive`)
      .send({
        confirm: true,
        archiveNote: 'A26 V3 de-identified archive note',
        expectedUpdatedAt: String(v3Report.updatedAt),
      })
      .expect(200);
    expect(record(body(v3Archive).report, 'V3 archived report')).toEqual(
      expect.objectContaining({ reportVersion: 3, status: 'archived' }),
    );
    expect(await readSourceFacts(fixture)).toEqual(sourceFactsBefore);
  });

  it('rejects incomplete V2 replacement lineage with the stable conflict', async () => {
    const fixture = await createFixture('A26-BAD-LINEAGE');
    const updatedAt: unknown = fixture.report.get('updatedAt');
    if (!(updatedAt instanceof Date)) {
      throw new Error('Expected source updatedAt');
    }
    const correction = await doctorAgent
      .post(correctionPath(fixture))
      .send({
        confirm: true,
        correctionReason: REASON,
        changeSummary: SUMMARY,
        expectedUpdatedAt: updatedAt.toISOString(),
      })
      .expect(200);
    const replacement = record(
      body(correction).replacementReport,
      'incomplete-lineage replacement',
    );
    await reportModel
      .updateOne(
        { _id: new Types.ObjectId(String(replacement.id)) },
        { $unset: { 'metadata.a25CorrectionReplacement': 1 } },
      )
      .exec();
    const response = await doctorAgent
      .post(
        `${reportPath(
          fixture.patient._id.toString(),
          fixture.visit._id.toString(),
          String(replacement.id),
        )}/lock`,
      )
      .send({
        confirm: true,
        lockNote: 'A26 invalid lineage lock attempt',
        expectedUpdatedAt: String(replacement.updatedAt),
      })
      .expect(409);
    expect(body(response).code).toBe(
      'CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID',
    );
  });
});
