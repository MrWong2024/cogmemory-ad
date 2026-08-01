import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { requireInitialized } from './support/e2e-initialization';
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
  type MediaStorageSnapshot,
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
import {
  User,
  UserDocument,
  type UserType,
} from '../src/modules/users/schemas/user.schema';

jest.setTimeout(30000);

const PASSWORD = 'A23-Test-Password!';
const ACCOUNTS = {
  doctor: 'doctor-a23-test',
  admin: 'admin-a23-test',
  nurse: 'nurse-a23-test',
  research_assistant: 'research-a23-test',
  system: 'system-a23-test',
} as const;
const ACCOUNT_ENTRIES = [
  ['doctor', ACCOUNTS.doctor],
  ['admin', ACCOUNTS.admin],
  ['nurse', ACCOUNTS.nurse],
  ['research_assistant', ACCOUNTS.research_assistant],
  ['system', ACCOUNTS.system],
] as const satisfies readonly (readonly [UserType, string])[];
const SUBJECT_PREFIX = 'SUBJ-A23-TEST-';
const VISIT_PREFIX = 'VISIT-A23-TEST-';
type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;

type FixtureOptions = {
  includeSecondTargetItemResponse?: boolean;
  includeOutsideItemResponse?: boolean;
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

function sourceCounts(itemResponseCount: number) {
  return {
    scaleInstanceCount: 1,
    itemResponseCount,
    scoreResultCount: 1,
    cognitiveDomainResultCount: 1,
    mediaEvidenceCount: 1,
    totalSourceCount: itemResponseCount + 4,
  };
}

function expectProtectedReportFactsUnchanged(
  before: ClinicalReportDocument,
  after: ClinicalReportDocument,
): void {
  const beforeFacts = record(before.toObject(), 'before report facts');
  const afterFacts = record(after.toObject(), 'after report facts');
  delete beforeFacts.updatedAt;
  delete afterFacts.updatedAt;
  const beforeMetadata = record(beforeFacts.metadata, 'before report metadata');
  const afterMetadata = {
    ...record(afterFacts.metadata, 'after report metadata'),
  };
  delete afterMetadata.a23SourceFreeze;
  afterFacts.metadata = afterMetadata;
  expect(afterFacts).toEqual({ ...beforeFacts, metadata: beforeMetadata });
}

describe('clinical report source freeze API (e2e)', () => {
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
  let adminId: Types.ObjectId;

  async function cleanup(): Promise<number> {
    const users = await userModel
      .find({ accountName: { $in: Object.values(ACCOUNTS) } })
      .select({ _id: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    if (userIds.length > 0) {
      await sessionModel.deleteMany({ userId: { $in: userIds } }).exec();
    }
    const visits = await visitModel
      .find({ visitCode: /^VISIT-A23-TEST-/ })
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
      await domainModel
        .deleteMany({ assessmentVisitId: { $in: visitIds } })
        .exec();
      await scoreModel
        .deleteMany({ assessmentVisitId: { $in: visitIds } })
        .exec();
      await mediaModel
        .deleteMany({ assessmentVisitId: { $in: visitIds } })
        .exec();
      await itemModel
        .deleteMany({ assessmentVisitId: { $in: visitIds } })
        .exec();
      await instanceModel.deleteMany({ _id: { $in: instanceIds } }).exec();
      await visitModel.deleteMany({ _id: { $in: visitIds } }).exec();
    }
    await patientModel.deleteMany({ subjectCode: /^SUBJ-A23-TEST-/ }).exec();
    await userModel
      .deleteMany({ accountName: { $in: Object.values(ACCOUNTS) } })
      .exec();
    const residualCounts = await Promise.all([
      userIds.length > 0
        ? sessionModel.countDocuments({ userId: { $in: userIds } }).exec()
        : Promise.resolve(0),
      userModel
        .countDocuments({ accountName: { $in: Object.values(ACCOUNTS) } })
        .exec(),
      patientModel.countDocuments({ subjectCode: /^SUBJ-A23-TEST-/ }).exec(),
      visitModel.countDocuments({ visitCode: /^VISIT-A23-TEST-/ }).exec(),
      instanceModel.countDocuments({ subjectCode: /^SUBJ-A23-TEST-/ }).exec(),
      itemModel.countDocuments({ subjectCode: /^SUBJ-A23-TEST-/ }).exec(),
      scoreModel.countDocuments({ subjectCode: /^SUBJ-A23-TEST-/ }).exec(),
      domainModel.countDocuments({ subjectCode: /^SUBJ-A23-TEST-/ }).exec(),
      mediaModel.countDocuments({ subjectCode: /^SUBJ-A23-TEST-/ }).exec(),
      reportModel.countDocuments({ subjectCode: /^SUBJ-A23-TEST-/ }).exec(),
    ]);
    return residualCounts.reduce((total, count) => total + count, 0);
  }

  async function createFixture(suffix: string, options: FixtureOptions = {}) {
    const patient = await patientModel.create({
      subjectCode: `${SUBJECT_PREFIX}${suffix}`,
      displayName: 'A23 De-identified Subject',
      sourceType: 'clinical',
      sex: 'unknown',
      handedness: 'unknown',
      status: 'active',
      tags: [],
      externalRefs: null,
      metadata: null,
    });
    const visit = await visitModel.create({
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      visitCode: `${VISIT_PREFIX}${suffix}`,
      visitType: 'baseline',
      status: 'completed',
      assessmentDate: new Date('2026-07-01T08:00:00.000Z'),
      startedAt: new Date('2026-07-01T08:00:00.000Z'),
      completedAt: new Date('2026-07-01T09:00:00.000Z'),
      lockedAt: null,
      voidedAt: null,
      clinicalContext: null,
      metadata: null,
    });
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const instance = await instanceModel.create({
      assessmentVisitId: visit._id,
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      scaleDefinitionId: definitionId,
      scaleVersionId: versionId,
      scaleCode: 'moca',
      scaleVersion: '1.0',
      instanceCode: `INST-A23-${suffix}`,
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: 'crf-a23-test',
        scoringRuleVersion: 'score-a23-test',
        fieldEncodingVersion: 'field-a23-test',
        sourceDocument: 'a23-test-source',
      },
      completedAt: new Date('2026-07-01T09:00:00.000Z'),
      lockedAt: null,
      voidedAt: null,
      metadata: { submission: { submissionId: 'a23-test-submission' } },
    });
    const outsideDefinitionId = new Types.ObjectId();
    const outsideVersionId = new Types.ObjectId();
    const outsideInstance = await instanceModel.create({
      assessmentVisitId: visit._id,
      patientId: patient._id,
      subjectCode: patient.subjectCode,
      scaleDefinitionId: outsideDefinitionId,
      scaleVersionId: outsideVersionId,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      instanceCode: `INST-A23-OUTSIDE-${suffix}`,
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      completedAt: new Date('2026-07-01T09:00:00.000Z'),
      lockedAt: null,
      voidedAt: null,
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
      itemCode: 'moca.a23.test.item',
      itemOrder: 1,
      responseType: 'text',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['memory'],
      itemConfigSnapshot: null,
      versionTrace: { scaleVersion: '1.0' },
      status: 'answered',
      answerSource: 'clinician_recorded',
      rawResponse: 'de-identified test response',
      structuredResponse: null,
      isMissing: false,
      stepResults: [],
      promptResponses: [],
      evidenceRefs: [],
      lockedAt: null,
      voidedAt: null,
    });
    const targetItems = [item];
    if (options.includeSecondTargetItemResponse) {
      targetItems.push(
        await itemModel.create({
          assessmentVisitId: visit._id,
          scaleInstanceId: instance._id,
          patientId: patient._id,
          subjectCode: patient.subjectCode,
          scaleDefinitionId: definitionId,
          scaleVersionId: versionId,
          scaleCode: 'moca',
          scaleVersion: '1.0',
          instanceCode: instance.instanceCode,
          itemCode: 'moca.a23.test.item.2',
          itemOrder: 2,
          responseType: 'text',
          countsTowardTotal: true,
          cognitiveDomainCodes: ['attention'],
          itemConfigSnapshot: null,
          versionTrace: { scaleVersion: '1.0' },
          status: 'answered',
          answerSource: 'clinician_recorded',
          rawResponse: 'second de-identified test response',
          structuredResponse: null,
          isMissing: false,
          stepResults: [],
          promptResponses: [],
          evidenceRefs: [],
          lockedAt: null,
          voidedAt: null,
        }),
      );
    }
    const outsideItem = options.includeOutsideItemResponse
      ? await itemModel.create({
          assessmentVisitId: visit._id,
          scaleInstanceId: outsideInstance._id,
          patientId: patient._id,
          subjectCode: patient.subjectCode,
          scaleDefinitionId: outsideDefinitionId,
          scaleVersionId: outsideVersionId,
          scaleCode: 'mmse',
          scaleVersion: '1.0',
          instanceCode: outsideInstance.instanceCode,
          itemCode: 'mmse.a23.outside.item',
          itemOrder: 1,
          responseType: 'text',
          countsTowardTotal: true,
          cognitiveDomainCodes: ['orientation'],
          itemConfigSnapshot: null,
          versionTrace: { scaleVersion: '1.0' },
          status: 'answered',
          answerSource: 'clinician_recorded',
          rawResponse: 'outside de-identified test response',
          structuredResponse: null,
          isMissing: false,
          stepResults: [],
          promptResponses: [],
          evidenceRefs: [],
          lockedAt: null,
          voidedAt: null,
        })
      : null;
    const evidenceStorage = {
      storageDriver: 'fake',
      bucket: 'a23-test-bucket',
      objectKey: `cogmemory_ad/a23/${suffix}/evidence.png`,
      objectPrefix: `cogmemory_ad/a23/${suffix}`,
      mimeType: 'image/png',
      fileExtension: 'png',
      sizeBytes: 128,
      checksum: `a23-checksum-${suffix}`,
      checksumAlgorithm: 'sha256',
      storedAt: new Date('2026-07-01T08:30:00.000Z'),
    } satisfies MediaStorageSnapshot;
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
      evidenceCode: `EVD-A23-${suffix}`,
      evidenceType: 'photo',
      captureMode: 'photo_upload',
      status: 'attached',
      storageStatus: 'stored',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['memory'],
      itemSnapshot: { itemCode: item.itemCode },
      versionTrace: { scaleVersion: '1.0' },
      storage: evidenceStorage,
      qualityStatus: 'acceptable',
      lockedAt: null,
      voidedAt: null,
      deletedAt: null,
    });
    const unreferencedEvidenceId = new Types.ObjectId();
    const unreferencedEvidence = await mediaModel.create({
      _id: unreferencedEvidenceId,
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
      evidenceCode: `EVD-A23-UNREFERENCED-${suffix}`,
      evidenceType: 'photo',
      captureMode: 'photo_upload',
      status: 'attached',
      storageStatus: 'stored',
      countsTowardTotal: true,
      cognitiveDomainCodes: ['memory'],
      itemSnapshot: { itemCode: item.itemCode },
      versionTrace: { scaleVersion: '1.0' },
      storage: {
        ...evidenceStorage,
        objectKey: `cogmemory_ad/a23/${suffix}/unreferenced.png`,
        checksum: `a23-unreferenced-checksum-${suffix}`,
      },
      qualityStatus: 'acceptable',
      lockedAt: null,
      voidedAt: null,
      deletedAt: null,
    });
    const confirmedAt = new Date('2026-07-01T10:00:00.000Z');
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
      scoreResultCode: `SCR-A23-${suffix}`,
      runNo: 1,
      status: 'confirmed',
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
      lockedAt: null,
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
      domainResultCode: `CDR-A23-${suffix}`,
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
        computedAt: new Date('2026-07-01T10:30:00.000Z'),
        warningCount: 0,
      },
      review: { reviewStatus: 'not_required' },
      qualityStatus: 'unchecked',
      lockedAt: null,
      voidedAt: null,
    });
    const lockTime = new Date('2026-07-01T12:00:00.000Z');
    const report = await reportModel.create({
      patientId: patient._id,
      assessmentVisitId: visit._id,
      primaryScaleInstanceIds: [instance._id],
      scoreResultIds: [score._id],
      cognitiveDomainResultIds: [domain._id],
      mediaEvidenceIds: [evidenceId],
      subjectCode: patient.subjectCode,
      reportCode: `RPT-A23-${suffix}`,
      reportType: 'cognitive_assessment',
      status: 'confirmed',
      reportVersion: 1,
      source: 'mixed',
      patientSnapshot: { subjectCode: patient.subjectCode },
      visitSnapshot: {
        visitCode: visit.visitCode,
        visitType: visit.visitType,
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
        chiefSummary: 'A23 de-identified summary',
        scoreSummary: 'A23 de-identified score summary',
        domainSummary: 'A23 de-identified domain summary',
        evidenceSummary: 'A23 de-identified evidence summary',
        limitations: 'A23 de-identified limitations',
        doctorOpinion: 'A23 de-identified opinion',
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: {
        confirmedAt,
        confirmedBy: doctorId,
        confirmedByName: 'A23 doctor Test Operator',
        confirmedByRole: 'doctor',
        confirmationNote: 'A23 de-identified confirmation note',
      },
      lockedAt: lockTime,
      lockedBy: doctorId,
      archivedAt: null,
      correctionRecords: [],
      voidedAt: null,
      auditLogRefs: [],
      qualityStatus: 'passed',
      metadata: {
        a20Generation: {
          version: 1,
          generationId: 'generation-a23-test',
          generatedAt: new Date('2026-07-01T09:30:00.000Z'),
          generatedBy: doctorId.toString(),
          generatedByName: 'A23 doctor Test Operator',
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
          submissionId: 'submission-a23-test',
          submittedAt: new Date('2026-07-01T11:00:00.000Z'),
          submittedBy: doctorId.toString(),
          submittedByName: 'A23 doctor Test Operator',
          submittedByRole: 'doctor',
          submissionNote: 'A23 de-identified submission note',
        },
        a21Confirmation: {
          version: 1,
          confirmationId: 'confirmation-a23-test',
          confirmedAt,
          confirmedBy: doctorId.toString(),
          confirmedByName: 'A23 doctor Test Operator',
          confirmedByRole: 'doctor',
          confirmationNote: 'A23 de-identified confirmation note',
        },
        a22Lock: {
          version: 1,
          lockId: '22222222-2222-4222-8222-222222222222',
          lockedAt: lockTime,
          lockedBy: doctorId.toString(),
          lockedByName: 'A23 doctor Test Operator',
          lockedByRole: 'doctor',
          lockNote: 'A23 de-identified lock note',
        },
      },
    });
    return {
      patient,
      visit,
      instance,
      outsideInstance,
      item,
      targetItems,
      outsideItem,
      evidence,
      evidenceId,
      unreferencedEvidence,
      unreferencedEvidenceId,
      score,
      domain,
      report,
    };
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
    if (databaseName !== 'cogmemory_ad_test') {
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
    for (const [role, accountName] of ACCOUNT_ENTRIES) {
      await userModel.create({
        accountName,
        displayName: `A23 ${role} Test Operator`,
        staffCode: `STAFF-A23-${role.toUpperCase()}`,
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
    const admin = await userModel.findOne({ accountName: ACCOUNTS.admin });
    if (!doctor) throw new Error('Expected A23 doctor account');
    if (!admin) throw new Error('Expected A23 admin account');
    doctorId = doctor._id;
    adminId = admin._id;
    server = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
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
      expect(await cleanup()).toBe(0);
      await app.close();
      expect(connection.readyState).toBe(0);
    }
  });

  it('enforces authentication and doctor/admin roles', async () => {
    const path =
      '/patients/507f1f77bcf86cd799439011/visits/507f1f77bcf86cd799439012/clinical-reports/507f1f77bcf86cd799439013/freeze-sources';
    const payload = {
      confirm: true,
      freezeNote: 'A23 de-identified freeze note',
      expectedUpdatedAt: '2026-07-12T08:00:00.000Z',
    };
    await request(server).post(path).send(payload).expect(401);
    await systemAgent.post(path).send(payload).expect(403);
    await nurseAgent.post(path).send(payload).expect(403);
    await researchAgent.post(path).send(payload).expect(403);
  });

  it('freezes the exact report source chain and is idempotent', async () => {
    const fixture = await createFixture('MAIN');
    const path = `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/${fixture.report._id.toString()}/freeze-sources`;
    const expectedUpdatedAt: unknown = fixture.report.get('updatedAt');
    if (!(expectedUpdatedAt instanceof Date)) {
      throw new Error('Expected report updatedAt');
    }
    await doctorAgent
      .post(path)
      .send({
        freezeNote: 'A23 de-identified freeze note',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(400)
      .expect((response: Response) => {
        expect(body(response)).toEqual(
          expect.objectContaining({
            code: 'CLINICAL_REPORT_SOURCE_FREEZE_CONFIRMATION_REQUIRED',
          }),
        );
      });
    await doctorAgent
      .post(path)
      .send({
        confirm: true,
        freezeNote: 'A23 de-identified freeze note',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
        metadata: {},
      })
      .expect(400);
    const first = await doctorAgent
      .post(path)
      .send({
        confirm: true,
        freezeNote: 'A23 de-identified freeze note',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(200);
    const firstBody = body(first);
    const firstReceipt = record(
      firstBody.sourceFreezeReceipt,
      'source freeze receipt',
    );
    const firstReport = record(firstBody.report, 'report');
    const firstSourceFreeze = record(firstReport.sourceFreeze, 'source freeze');
    expect(firstReport.status).toBe('confirmed');
    expect(firstSourceFreeze.state).toBe('completed');
    expect(firstReceipt.state).toBe('completed');
    expect(firstReceipt.alreadyFrozen).toBe(false);
    expect(firstReceipt.resumedExisting).toBe(false);
    expect(firstBody).not.toHaveProperty('metadata');
    expect(firstReceipt).not.toHaveProperty('scope');
    const [
      instance,
      item,
      score,
      domain,
      evidence,
      unreferencedEvidence,
      outside,
      patient,
      visit,
      report,
    ] = await Promise.all([
      instanceModel.findById(fixture.instance._id).exec(),
      itemModel.findById(fixture.item._id).exec(),
      scoreModel.findById(fixture.score._id).exec(),
      domainModel.findById(fixture.domain._id).exec(),
      mediaModel.findById(fixture.evidenceId).exec(),
      mediaModel.findById(fixture.unreferencedEvidenceId).exec(),
      instanceModel.findById(fixture.outsideInstance._id).exec(),
      patientModel.findById(fixture.patient._id).exec(),
      visitModel.findById(fixture.visit._id).exec(),
      reportModel.findById(fixture.report._id).exec(),
    ]);
    expect(instance).toEqual(expect.objectContaining({ status: 'locked' }));
    expect(item).toEqual(expect.objectContaining({ status: 'locked' }));
    expect(score).toEqual(expect.objectContaining({ status: 'locked' }));
    expect(domain).toEqual(expect.objectContaining({ status: 'computed' }));
    expect(evidence).toEqual(expect.objectContaining({ status: 'locked' }));
    expect(instance?.lockedAt).toBeInstanceOf(Date);
    expect(item?.lockedAt).toBeInstanceOf(Date);
    expect(score?.lockedAt).toBeInstanceOf(Date);
    expect(domain?.lockedAt).toBeInstanceOf(Date);
    expect(evidence?.lockedAt).toBeInstanceOf(Date);
    expect(evidence?.storageStatus).toBe('stored');
    expect(evidence?.storage?.objectKey).toBe(
      `cogmemory_ad/a23/MAIN/evidence.png`,
    );
    expect(unreferencedEvidence?.status).toBe('attached');
    expect(unreferencedEvidence?.lockedAt).toBeNull();
    expect(outside?.status).toBe('completed');
    expect(patient?.status).toBe('active');
    expect(visit?.status).toBe('completed');
    expect(report?.status).toBe('confirmed');
    expect(report?.lockedAt?.toISOString()).toBe(
      fixture.report.lockedAt?.toISOString(),
    );
    const repeat = await doctorAgent
      .post(path)
      .send({
        confirm: true,
        freezeNote: 'A23 different retry note',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(200);
    const repeatReceipt = record(
      body(repeat).sourceFreezeReceipt,
      'source freeze receipt',
    );
    expect(repeatReceipt).toEqual(
      expect.objectContaining({
        freezeId: firstReceipt.freezeId,
        freezeNote: 'A23 de-identified freeze note',
        alreadyFrozen: true,
        resumedExisting: false,
      }),
    );
    const latest = await doctorAgent
      .get(
        `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/latest`,
      )
      .expect(200);
    const latestReport = record(body(latest).report, 'report');
    expect(latestReport.sourceFreeze).toEqual(firstReport.sourceFreeze);
  });

  it('freezes every ItemResponse in the report scale-instance scope and leaves outside items unchanged', async () => {
    const fixture = await createFixture('MULTI', {
      includeSecondTargetItemResponse: true,
      includeOutsideItemResponse: true,
    });
    if (!fixture.outsideItem) throw new Error('Expected outside item response');
    expect(fixture.targetItems).toHaveLength(2);
    const [beforePatient, beforeVisit, beforeOutside, beforeOutsideItem] =
      await Promise.all([
        patientModel.findById(fixture.patient._id).lean().exec(),
        visitModel.findById(fixture.visit._id).lean().exec(),
        instanceModel.findById(fixture.outsideInstance._id).lean().exec(),
        itemModel.findById(fixture.outsideItem._id).lean().exec(),
      ]);
    const beforeReport = await reportModel.findById(fixture.report._id).exec();
    const expectedUpdatedAt: unknown = fixture.report.get('updatedAt');
    if (!beforeReport || !(expectedUpdatedAt instanceof Date)) {
      throw new Error('Expected complete multi-item fixture');
    }

    const response = await doctorAgent
      .post(
        `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/${fixture.report._id.toString()}/freeze-sources`,
      )
      .send({
        confirm: true,
        freezeNote: 'A23 multi-item de-identified freeze note',
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      })
      .expect(200);
    const responseBody = body(response);
    const receipt = record(
      responseBody.sourceFreezeReceipt,
      'multi-item source freeze receipt',
    );
    const expectedCounts = sourceCounts(fixture.targetItems.length);
    for (const field of [
      'expectedCounts',
      'completedCounts',
      'newlyFrozenCounts',
    ]) {
      expect(receipt[field]).toEqual(expectedCounts);
    }
    expect(receipt.previouslyFrozenCounts).toEqual({
      scaleInstanceCount: 0,
      itemResponseCount: 0,
      scoreResultCount: 0,
      cognitiveDomainResultCount: 0,
      mediaEvidenceCount: 0,
      totalSourceCount: 0,
    });
    const sourceLockedAt = String(receipt.sourceLockedAt);
    expect(Number.isFinite(Date.parse(sourceLockedAt))).toBe(true);
    const targetItems = await itemModel
      .find({ scaleInstanceId: fixture.instance._id })
      .sort({ itemOrder: 1 })
      .exec();
    expect(targetItems).toHaveLength(2);
    for (const item of targetItems) {
      expect(item.status).toBe('locked');
      expect(item.lockedAt?.toISOString()).toBe(sourceLockedAt);
    }
    expect(
      await itemModel.findById(fixture.outsideItem._id).lean().exec(),
    ).toEqual(beforeOutsideItem);
    expect(
      await instanceModel.findById(fixture.outsideInstance._id).lean().exec(),
    ).toEqual(beforeOutside);
    expect(
      await patientModel.findById(fixture.patient._id).lean().exec(),
    ).toEqual(beforePatient);
    expect(await visitModel.findById(fixture.visit._id).lean().exec()).toEqual(
      beforeVisit,
    );
    const afterReport = await reportModel.findById(fixture.report._id).exec();
    if (!afterReport) throw new Error('Expected frozen multi-item report');
    expectProtectedReportFactsUnchanged(beforeReport, afterReport);
    expect(record(responseBody.report, 'public report').status).toBe(
      'confirmed',
    );
    expect(responseBody).not.toHaveProperty('metadata');
    expect(receipt).not.toHaveProperty('scope');
    const serializedResponse = JSON.stringify(responseBody);
    for (const item of [...fixture.targetItems, fixture.outsideItem]) {
      expect(serializedResponse).not.toContain(item._id.toString());
    }
  });

  it('creates one source-freeze fact under two concurrent authenticated HTTP requests', async () => {
    const fixture = await createFixture('CONCURRENT');
    const expectedUpdatedAt: unknown = fixture.report.get('updatedAt');
    const beforeReport = await reportModel.findById(fixture.report._id).exec();
    const [
      beforePatient,
      beforeVisit,
      beforeOutside,
      beforeUnreferenced,
      beforeEvidence,
    ] = await Promise.all([
      patientModel.findById(fixture.patient._id).lean().exec(),
      visitModel.findById(fixture.visit._id).lean().exec(),
      instanceModel.findById(fixture.outsideInstance._id).lean().exec(),
      mediaModel.findById(fixture.unreferencedEvidenceId).lean().exec(),
      mediaModel.findById(fixture.evidenceId).lean().exec(),
    ]);
    if (!beforeReport || !(expectedUpdatedAt instanceof Date)) {
      throw new Error('Expected complete concurrent fixture');
    }
    expect(
      record(beforeReport.metadata, 'initial report metadata'),
    ).not.toHaveProperty('a23SourceFreeze');
    const path = `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/${fixture.report._id.toString()}/freeze-sources`;
    const doctorNote = 'A23 concurrent doctor de-identified note';
    const adminNote = 'A23 concurrent admin de-identified note';
    const doctorRequest = doctorAgent.post(path).send({
      confirm: true,
      freezeNote: doctorNote,
      expectedUpdatedAt: expectedUpdatedAt.toISOString(),
    });
    const adminRequest = adminAgent.post(path).send({
      confirm: true,
      freezeNote: adminNote,
      expectedUpdatedAt: expectedUpdatedAt.toISOString(),
    });
    const [doctorResponse, adminResponse] = await Promise.all([
      doctorRequest,
      adminRequest,
    ]);
    expect(doctorResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
    const contenders = [
      {
        role: 'doctor' as const,
        note: doctorNote,
        actorId: doctorId.toString(),
        response: doctorResponse,
      },
      {
        role: 'admin' as const,
        note: adminNote,
        actorId: adminId.toString(),
        response: adminResponse,
      },
    ].map((entry) => ({
      ...entry,
      receipt: record(
        body(entry.response).sourceFreezeReceipt,
        `${entry.role} source freeze receipt`,
      ),
    }));
    const firstStarts = contenders.filter(
      ({ receipt }) =>
        receipt.alreadyFrozen === false && receipt.resumedExisting === false,
    );
    expect(firstStarts).toHaveLength(1);
    const winner = firstStarts[0];
    const loser = contenders.find((entry) => entry.role !== winner?.role);
    if (!winner || !loser) throw new Error('Expected one concurrent winner');
    expect(
      (loser.receipt.alreadyFrozen === true &&
        loser.receipt.resumedExisting === false) ||
        (loser.receipt.alreadyFrozen === false &&
          loser.receipt.resumedExisting === true),
    ).toBe(true);
    const winnerActor = record(winner.receipt.startedBy, 'winner actor');
    expect(winner.receipt.freezeNote).toBe(winner.note);
    expect(winnerActor.operatorId).toBe(winner.actorId);
    expect(winnerActor.operatorRole).toBe(winner.role);
    expect(loser.receipt.freezeNote).toBe(winner.note);
    expect(loser.receipt.freezeNote).not.toBe(loser.note);
    for (const field of [
      'freezeId',
      'state',
      'startedAt',
      'sourceLockedAt',
      'startedBy',
      'completedAt',
      'completedBy',
      'freezeNote',
      'expectedCounts',
      'completedCounts',
      'newlyFrozenCounts',
      'previouslyFrozenCounts',
    ]) {
      expect(loser.receipt[field]).toEqual(winner.receipt[field]);
    }
    expect(
      record(body(loser.response).report, 'loser report').sourceFreeze,
    ).toEqual(
      record(body(winner.response).report, 'winner report').sourceFreeze,
    );

    const persisted = await reportModel.findById(fixture.report._id).exec();
    if (!persisted) throw new Error('Expected concurrent frozen report');
    expectProtectedReportFactsUnchanged(beforeReport, persisted);
    const persistedMetadata = record(persisted.metadata, 'persisted metadata');
    const audit = record(persistedMetadata.a23SourceFreeze, 'persisted audit');
    expect(audit).toEqual(
      expect.objectContaining({
        version: 1,
        state: 'completed',
        freezeId: winner.receipt.freezeId,
        startedBy: winner.actorId,
        startedByRole: winner.role,
        completedBy: winner.actorId,
        completedByRole: winner.role,
        freezeNote: winner.note,
        expectedCounts: sourceCounts(1),
        completedCounts: sourceCounts(1),
        newlyFrozenCounts: sourceCounts(1),
      }),
    );
    expect(JSON.stringify(audit)).not.toContain(loser.note);
    expect(
      Object.keys(persistedMetadata).filter((key) =>
        key.toLowerCase().includes('a23'),
      ),
    ).toEqual(['a23SourceFreeze']);
    expect(
      await reportModel.countDocuments({
        reportCode: fixture.report.reportCode,
      }),
    ).toBe(1);
    expect(
      await reportModel.countDocuments({
        _id: fixture.report._id,
        'metadata.a23SourceFreeze.freezeId': winner.receipt.freezeId,
        'metadata.a23SourceFreeze.state': 'completed',
      }),
    ).toBe(1);
    const [instance, item, score, domain, evidence] = await Promise.all([
      instanceModel.findById(fixture.instance._id).exec(),
      itemModel.findById(fixture.item._id).exec(),
      scoreModel.findById(fixture.score._id).exec(),
      domainModel.findById(fixture.domain._id).exec(),
      mediaModel.findById(fixture.evidenceId).exec(),
    ]);
    const sourceLockedAt = String(winner.receipt.sourceLockedAt);
    for (const source of [instance, item, score, evidence]) {
      expect(source?.status).toBe('locked');
      expect(source?.lockedAt?.toISOString()).toBe(sourceLockedAt);
    }
    expect(domain?.status).toBe('computed');
    expect(domain?.lockedAt?.toISOString()).toBe(sourceLockedAt);
    expect(evidence?.storageStatus).toBe(beforeEvidence?.storageStatus);
    expect(JSON.stringify(evidence?.storage)).toBe(
      JSON.stringify(beforeEvidence?.storage),
    );
    expect(
      await patientModel.findById(fixture.patient._id).lean().exec(),
    ).toEqual(beforePatient);
    expect(await visitModel.findById(fixture.visit._id).lean().exec()).toEqual(
      beforeVisit,
    );
    expect(
      await instanceModel.findById(fixture.outsideInstance._id).lean().exec(),
    ).toEqual(beforeOutside);
    expect(
      await mediaModel.findById(fixture.unreferencedEvidenceId).lean().exec(),
    ).toEqual(beforeUnreferenced);
    for (const entry of contenders) {
      const serialized = JSON.stringify(body(entry.response));
      expect(serialized).not.toContain('metadata');
      expect(entry.receipt).not.toHaveProperty('scope');
      for (const sourceId of [
        fixture.item._id,
        fixture.score._id,
        fixture.domain._id,
        fixture.evidenceId,
      ]) {
        expect(serialized).not.toContain(sourceId.toString());
      }
    }
  });

  it('allows admin to freeze a separate locked report', async () => {
    const fixture = await createFixture('ADMIN');
    const updatedAt: unknown = fixture.report.get('updatedAt');
    if (!(updatedAt instanceof Date)) {
      throw new Error('Expected report updatedAt');
    }
    await adminAgent
      .post(
        `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/${fixture.report._id.toString()}/freeze-sources`,
      )
      .send({
        confirm: true,
        freezeNote: 'A23 admin de-identified freeze note',
        expectedUpdatedAt: updatedAt.toISOString(),
      })
      .expect(200);
  });

  it('resumes an in-progress audit using the persisted scope and original note', async () => {
    const fixture = await createFixture('RESUME');
    const sourceLockedAt = new Date('2026-07-12T09:00:00.000Z');
    const freezeId = '33333333-3333-4333-8333-333333333333';
    const zeroCounts = {
      scaleInstanceCount: 0,
      itemResponseCount: 0,
      scoreResultCount: 0,
      cognitiveDomainResultCount: 0,
      mediaEvidenceCount: 0,
      totalSourceCount: 0,
    };
    await reportModel
      .updateOne(
        { _id: fixture.report._id },
        {
          $set: {
            'metadata.a23SourceFreeze': {
              version: 1,
              freezeId,
              state: 'in_progress',
              startedAt: sourceLockedAt,
              sourceLockedAt,
              startedBy: doctorId.toString(),
              startedByName: 'A23 Original Test Operator',
              startedByRole: 'doctor',
              freezeNote: 'A23 original de-identified recovery note',
              scope: {
                scaleInstanceIds: [fixture.instance._id.toString()],
                itemResponseIds: [fixture.item._id.toString()],
                scoreResultIds: [fixture.score._id.toString()],
                cognitiveDomainResultIds: [fixture.domain._id.toString()],
                mediaEvidenceIds: [fixture.evidenceId.toString()],
              },
              expectedCounts: {
                scaleInstanceCount: 1,
                itemResponseCount: 1,
                scoreResultCount: 1,
                cognitiveDomainResultCount: 1,
                mediaEvidenceCount: 1,
                totalSourceCount: 5,
              },
              previouslyFrozenCounts: zeroCounts,
            },
          },
        },
      )
      .exec();
    await instanceModel
      .updateOne(
        { _id: fixture.instance._id },
        { $set: { status: 'locked', lockedAt: sourceLockedAt } },
      )
      .exec();

    const response = await doctorAgent
      .post(
        `/patients/${fixture.patient._id.toString()}/visits/${fixture.visit._id.toString()}/clinical-reports/${fixture.report._id.toString()}/freeze-sources`,
      )
      .send({
        confirm: true,
        freezeNote: 'A23 retry note must be ignored',
        expectedUpdatedAt: '2026-07-01T00:00:00.000Z',
      })
      .expect(200);
    const receipt = record(
      body(response).sourceFreezeReceipt,
      'source freeze receipt',
    );
    expect(receipt.freezeId).toBe(freezeId);
    expect(receipt.freezeNote).toBe('A23 original de-identified recovery note');
    expect(receipt.resumedExisting).toBe(true);
    expect(receipt.alreadyFrozen).toBe(false);
    const persisted = await reportModel.findById(fixture.report._id).exec();
    const persistedMetadata = record(persisted?.metadata, 'report metadata');
    const persistedAudit = record(
      persistedMetadata.a23SourceFreeze,
      'source freeze audit',
    );
    expect(persistedAudit.state).toBe('completed');
    expect(persistedAudit.freezeId).toBe(freezeId);
    expect(persistedAudit.startedByName).toBe('A23 Original Test Operator');
    expect(persistedAudit.completedByName).toBe('A23 Original Test Operator');
  });
});
