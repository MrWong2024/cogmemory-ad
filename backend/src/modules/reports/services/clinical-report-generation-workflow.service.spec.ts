import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { CognitiveDomainsService } from '../../cognitive-domains/services/cognitive-domains.service';
import { MediaEvidenceService } from '../../media/services/media-evidence.service';
import { PatientsService } from '../../patients/services/patients.service';
import { ScalesService } from '../../scales/services/scales.service';
import { ScoringService } from '../../scoring/services/scoring.service';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import { ReportsService } from './reports.service';
import { ClinicalReportGenerationWorkflowService } from './clinical-report-generation-workflow.service';

const ids = {
  patient: '507f1f77bcf86cd799439011',
  visit: '507f1f77bcf86cd799439012',
  instance: '507f1f77bcf86cd799439013',
  definition: '507f1f77bcf86cd799439014',
  version: '507f1f77bcf86cd799439015',
  score: '507f1f77bcf86cd799439016',
  domain: '507f1f77bcf86cd799439017',
  item: '507f1f77bcf86cd799439018',
  media: '507f1f77bcf86cd799439019',
  actor: '507f1f77bcf86cd799439020',
};
const now = new Date('2026-07-11T09:00:00.000Z');

function createFixtures() {
  const patient = {
    id: ids.patient,
    subjectCode: 'SUBJ-A20-TEST-001',
    displayName: '脱敏受试者',
    sourceType: 'clinical' as const,
    sex: 'unknown' as const,
    birthDate: null,
    educationYears: 12,
    handedness: 'unknown' as const,
    status: 'active' as const,
    tags: [],
    externalRefs: null,
    metadata: null,
  };
  const visit = {
    id: ids.visit,
    patientId: ids.patient,
    subjectCode: patient.subjectCode,
    visitCode: 'VISIT-A20-TEST-001',
    visitType: 'baseline' as const,
    status: 'completed' as const,
    assessmentDate: now,
    startedAt: null,
    completedAt: null,
    lockedAt: null,
    voidedAt: null,
    operatorSnapshot: {
      operatorId: ids.actor,
      operatorName: '脱敏医生',
      operatorRole: 'doctor' as const,
    },
    clinicalContext: null,
    metadata: null,
  };
  const instance = {
    id: ids.instance,
    assessmentVisitId: ids.visit,
    patientId: ids.patient,
    subjectCode: patient.subjectCode,
    scaleDefinitionId: ids.definition,
    scaleVersionId: ids.version,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'INST-A20-MOCA',
    instanceNo: 1,
    status: 'completed' as const,
    administrationMode: 'clinician_administered' as const,
    versionTrace: {
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
      sourceDocument: 'MMSE+MoCA.pdf',
    },
    startedAt: null,
    completedAt: now,
    lockedAt: null,
    voidedAt: null,
    durationMs: null,
    operatorSnapshot: null,
    progress: null,
    qualityControlSummary: null,
    metadata: null,
  };
  const definition = {
    id: ids.definition,
    code: 'moca',
    name: 'MoCA 脱敏量表',
    category: 'cognitive' as const,
    status: 'active' as const,
    currentVersionId: ids.version,
    sortOrder: 1,
    tags: [],
  };
  const version = {
    id: ids.version,
    scaleDefinitionId: ids.definition,
    scaleCode: 'moca',
    version: '1.0',
    crfVersion: 'crf-1',
    scoringRuleVersion: 'score-1',
    fieldEncodingVersion: 'field-1',
    sourceDocument: 'MMSE+MoCA.pdf',
    status: 'active' as const,
    totalScoreRange: { min: 0, max: 30 },
    groups: [],
    items: [
      {
        code: 'moca.item',
        title: '脱敏题目',
        order: 1,
        responseType: 'number' as const,
        scoreRange: { min: 0, max: 30 },
        countsTowardTotal: true,
        cognitiveDomainCodes: ['memory'],
        evidenceTypes: [],
        requiresTimer: false,
        supportsPhotoUpload: false,
        supportsHandwriting: false,
        requiresOperatorNote: false,
        scoringRule: null,
        qualityControlRule: null,
        reportingRule: null,
      },
    ],
    qualityControlRules: null,
    reportingRules: null,
    researchExportMappings: null,
    effectiveFrom: null,
    retiredAt: null,
  };
  const score = {
    id: ids.score,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: ids.instance,
    subjectCode: patient.subjectCode,
    scaleDefinitionId: ids.definition,
    scaleVersionId: ids.version,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: instance.instanceCode,
    scoreResultCode: 'SCR-A20-TEST-001',
    runNo: 1,
    status: 'confirmed' as const,
    scoringSource: 'mixed' as const,
    scoringMode: 'rule_based' as const,
    versionTrace: null,
    totalScore: {
      scoreValue: 20,
      maxScore: 30,
      minScore: 0,
      scorePercent: 66.67,
      scoredItemCount: 1,
      totalItemCount: 1,
      unscoredItemCount: 0,
      missingItemCount: 0,
      needsReviewItemCount: 0,
    },
    itemScores: [
      {
        itemResponseId: ids.item,
        itemCode: 'moca.item',
        itemOrder: 1,
        countsTowardTotal: true,
        includedInTotal: true,
        scoreValue: 20,
        maxScore: 30,
        minScore: 0,
        scoreStatus: 'manual_scored' as const,
        scoreSource: 'operator' as const,
        isMissing: false,
        cognitiveDomainCodes: ['memory'],
      },
    ],
    groupScores: [],
    computation: {
      computedAt: now,
      computedBy: null,
      inputItemCount: 1,
      includedItemCount: 1,
      excludedItemCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'reviewed' as const,
      reviewedAt: now,
      reviewerId: ids.actor,
    },
    qualityStatus: 'passed' as const,
    qualityHints: null,
    metadata: null,
    confirmedAt: now,
    lockedAt: null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const domain = {
    id: ids.domain,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: ids.instance,
    scoreResultId: ids.score,
    subjectCode: patient.subjectCode,
    scaleDefinitionId: ids.definition,
    scaleVersionId: ids.version,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: instance.instanceCode,
    domainResultCode: 'CDR-A20-TEST-001',
    runNo: 1,
    status: 'computed' as const,
    mappingSource: 'scale_config' as const,
    mappingMode: 'item_domain_codes' as const,
    versionTrace: { domainMappingVersion: 'a19-item-domain-codes-1.0' },
    domainScores: [
      {
        domainCode: 'memory',
        scoreValue: 20,
        maxScore: 30,
        minScore: 0,
        scorePercent: 66.67,
        weightedScore: 20,
        weightedMaxScore: 30,
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
        itemResponseId: ids.item,
        scoreResultId: ids.score,
        itemCode: 'moca.item',
        itemOrder: 1,
        domainCode: 'memory',
        weight: 1,
        countsTowardDomain: true,
        scoreValue: 20,
        maxScore: 30,
        weightedScore: 20,
        weightedMaxScore: 30,
        scoreStatus: 'manual_scored' as const,
        scoreSource: 'operator',
        isMissing: false,
      },
    ],
    mappingSnapshot: null,
    computation: {
      computedAt: now,
      computedBy: ids.actor,
      inputItemCount: 1,
      contributionCount: 1,
      domainCount: 1,
      includedContributionCount: 1,
      excludedContributionCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'not_required' as const,
      reviewedAt: null,
      reviewerId: null,
    },
    qualityStatus: 'unchecked' as const,
    qualityHints: null,
    metadata: null,
    confirmedAt: null,
    lockedAt: null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const media = {
    id: ids.media,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: ids.instance,
    itemResponseId: ids.item,
    subjectCode: patient.subjectCode,
    scaleDefinitionId: ids.definition,
    scaleVersionId: ids.version,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: instance.instanceCode,
    itemCode: 'moca.item',
    evidenceCode: 'EVD-A20-TEST-001',
    evidenceType: 'photo' as const,
    captureMode: 'photo_upload' as const,
    status: 'attached' as const,
    storageStatus: 'stored' as const,
    itemTitle: '脱敏题目',
    countsTowardTotal: true,
    cognitiveDomainCodes: ['memory'],
    itemSnapshot: null,
    versionTrace: null,
    storage: {
      storageDriver: 'fake' as const,
      objectKey: 'test/a20/internal',
      sizeBytes: 68,
      storedAt: now,
    },
    imageMetadata: null,
    handwritingTrace: null,
    captureContext: null,
    operatorSnapshot: null,
    qualityStatus: 'unchecked' as const,
    qualityHints: null,
    metadata: null,
    lockedAt: null,
    voidedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const report = {
    id: '507f1f77bcf86cd799439021',
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    primaryScaleInstanceIds: [ids.instance],
    scoreResultIds: [ids.score],
    cognitiveDomainResultIds: [ids.domain],
    mediaEvidenceIds: [ids.media],
    subjectCode: patient.subjectCode,
    reportCode: 'RPT-0123456789ABCDEF01234567',
    reportType: 'cognitive_assessment' as const,
    status: 'draft' as const,
    reportVersion: 1,
    source: 'system_draft' as const,
    patientSnapshot: {
      subjectCode: patient.subjectCode,
      displayName: patient.displayName,
      sex: patient.sex,
      birthDate: null,
      educationYears: 12,
    },
    visitSnapshot: {
      visitCode: visit.visitCode,
      visitType: visit.visitType,
      assessmentDate: now,
      clinicalContext: null,
    },
    scaleTraces: [{ scaleInstanceId: ids.instance, scaleCode: 'moca' }],
    scoreSnapshots: [
      {
        scoreResultId: ids.score,
        scaleCode: 'moca',
        totalScoreValue: 20,
        totalMaxScore: 30,
        totalMinScore: 0,
        scorePercent: 66.67,
        scoreDetails: null,
      },
    ],
    domainSnapshots: [
      {
        cognitiveDomainResultId: ids.domain,
        domainCode: 'memory',
        scoreValue: 20,
        maxScore: 30,
        scorePercent: 66.67,
        weightedScore: 20,
        weightedMaxScore: 30,
        itemCount: 1,
        needsReviewItemCount: 0,
      },
    ],
    evidenceSnapshots: [],
    narrative: { chiefSummary: '规则化草稿' },
    aiDraft: {
      aiAnalysisResultId: null,
      generatedAt: null,
      status: 'not_requested' as const,
      doctorEdited: false,
    },
    confirmation: null,
    lockedAt: null,
    lockedBy: null,
    archivedAt: null,
    archivedBy: null,
    correctionRecords: [],
    voidedAt: null,
    voidedBy: null,
    auditLogRefs: [],
    qualityStatus: 'unchecked' as const,
    qualityHints: null,
    metadata: {
      a20Generation: {
        version: 1,
        generatedAt: now,
        generatedBy: ids.actor,
        primaryScaleInstanceIds: [ids.instance],
        scoreResultIds: [ids.score],
        cognitiveDomainResultIds: [ids.domain],
        mediaEvidenceCount: 1,
        aiUsed: false,
      },
    },
    createdAt: now,
    updatedAt: now,
  };
  return {
    patient,
    visit,
    instance,
    definition,
    version,
    score,
    domain,
    media,
    report,
  };
}

describe('ClinicalReportGenerationWorkflowService', () => {
  let service: ClinicalReportGenerationWorkflowService;
  let fixtures: ReturnType<typeof createFixtures>;
  let patients: { findPatientById: jest.Mock };
  let assessments: {
    findVisitByPatientAndId: jest.Mock;
    findScaleInstanceByPatientVisitAndId: jest.Mock;
  };
  let scales: {
    findDefinitionByCode: jest.Mock;
    findVersionByScaleCodeAndVersion: jest.Mock;
  };
  let scoring: { findScoreResultByScaleInstanceAndRunNo: jest.Mock };
  let domains: { findDomainResultByScaleInstanceAndRunNo: jest.Mock };
  let media: { listEvidenceByScaleInstanceId: jest.Mock };
  let reports: {
    findReportByVisitTypeVersion: jest.Mock;
    findLatestReportByVisitId: jest.Mock;
    createVersionOneCognitiveAssessmentReport: jest.Mock;
    isDuplicateKeyError: jest.Mock;
  };

  beforeEach(async () => {
    fixtures = createFixtures();
    patients = {
      findPatientById: jest.fn().mockResolvedValue(fixtures.patient),
    };
    assessments = {
      findVisitByPatientAndId: jest.fn().mockResolvedValue(fixtures.visit),
      findScaleInstanceByPatientVisitAndId: jest
        .fn()
        .mockResolvedValue(fixtures.instance),
    };
    scales = {
      findDefinitionByCode: jest.fn().mockResolvedValue(fixtures.definition),
      findVersionByScaleCodeAndVersion: jest
        .fn()
        .mockResolvedValue(fixtures.version),
    };
    scoring = {
      findScoreResultByScaleInstanceAndRunNo: jest
        .fn()
        .mockResolvedValue(fixtures.score),
    };
    domains = {
      findDomainResultByScaleInstanceAndRunNo: jest
        .fn()
        .mockResolvedValue(fixtures.domain),
    };
    media = {
      listEvidenceByScaleInstanceId: jest
        .fn()
        .mockResolvedValue([fixtures.media]),
    };
    reports = {
      findReportByVisitTypeVersion: jest.fn().mockResolvedValue(null),
      findLatestReportByVisitId: jest.fn().mockResolvedValue(null),
      createVersionOneCognitiveAssessmentReport: jest
        .fn()
        .mockResolvedValue(fixtures.report),
      isDuplicateKeyError: jest.fn().mockReturnValue(false),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClinicalReportGenerationWorkflowService,
        ClinicalReportPublicMapper,
        { provide: PatientsService, useValue: patients },
        { provide: AssessmentsService, useValue: assessments },
        { provide: ScalesService, useValue: scales },
        { provide: ScoringService, useValue: scoring },
        { provide: CognitiveDomainsService, useValue: domains },
        { provide: MediaEvidenceService, useValue: media },
        { provide: ReportsService, useValue: reports },
      ],
    }).compile();
    service = moduleRef.get(ClinicalReportGenerationWorkflowService);
  });

  const actor = {
    id: ids.actor,
    accountName: 'doctor-a20-test',
    displayName: '脱敏医生',
    roles: ['admin', 'doctor'],
    permissions: [],
  };

  it('requires explicit confirmation and a valid unique scope', async () => {
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: false,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_GENERATION_CONFIRMATION_REQUIRED' },
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance, ids.instance.toUpperCase()],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns stable patient and visit not-found errors', async () => {
    patients.findPatientById.mockResolvedValueOnce(null);
    await expect(
      service.getLatestClinicalReport(ids.patient, ids.visit),
    ).rejects.toMatchObject({ response: { code: 'PATIENT_NOT_FOUND' } });
    assessments.findVisitByPatientAndId.mockResolvedValueOnce(null);
    await expect(
      service.getLatestClinicalReport(ids.patient, ids.visit),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns an existing same-scope report without re-reading sources', async () => {
    reports.findLatestReportByVisitId.mockResolvedValue(fixtures.report);
    const result = await service.generateClinicalReportDraft(
      ids.patient,
      ids.visit,
      actor,
      { confirm: true, primaryScaleInstanceIds: [ids.instance] },
    );
    expect(result.alreadyGenerated).toBe(true);
    expect(
      assessments.findScaleInstanceByPatientVisitAndId,
    ).not.toHaveBeenCalled();
    expect(
      scoring.findScoreResultByScaleInstanceAndRunNo,
    ).not.toHaveBeenCalled();
    expect(
      domains.findDomainResultByScaleInstanceAndRunNo,
    ).not.toHaveBeenCalled();
    expect(media.listEvidenceByScaleInstanceId).not.toHaveBeenCalled();
  });

  it('rejects different existing scope and voided reports', async () => {
    reports.findLatestReportByVisitId.mockResolvedValue({
      ...fixtures.report,
      primaryScaleInstanceIds: ['507f1f77bcf86cd799439099'],
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SCOPE_CONFLICT' },
    });
    reports.findLatestReportByVisitId.mockResolvedValue({
      ...fixtures.report,
      status: 'voided',
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({ response: { code: 'CLINICAL_REPORT_VOIDED' } });
  });

  it('enforces first-generation patient, visit and scale readiness', async () => {
    patients.findPatientById.mockResolvedValueOnce({
      ...fixtures.patient,
      status: 'inactive',
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({ response: { code: 'PATIENT_NOT_ACTIVE' } });
    assessments.findVisitByPatientAndId.mockResolvedValueOnce({
      ...fixtures.visit,
      status: 'locked',
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({ response: { code: 'VISIT_NOT_EDITABLE' } });
    assessments.findScaleInstanceByPatientVisitAndId.mockResolvedValueOnce({
      ...fixtures.instance,
      status: 'in_progress',
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_SCALE_NOT_READY' },
    });
  });

  it('rejects an instance whose bound historical version is unavailable', async () => {
    scales.findVersionByScaleCodeAndVersion.mockResolvedValueOnce({
      ...fixtures.version,
      id: '507f1f77bcf86cd799439099',
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE' },
    });
  });

  it.each([
    { status: 'needs_review', field: 'status' },
    { status: 'computed', field: 'status' },
    { status: 'voided', field: 'status' },
    { status: 'confirmed', field: 'confirmedAt', value: null },
    { status: 'confirmed', field: 'qualityStatus', value: 'unchecked' },
  ])('rejects a non-final source score: $field', async (scenario) => {
    scoring.findScoreResultByScaleInstanceAndRunNo.mockResolvedValueOnce({
      ...fixtures.score,
      status: scenario.status,
      ...(scenario.field !== 'status'
        ? { [scenario.field]: scenario.value }
        : {}),
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_SCORE_NOT_FINAL' },
    });
  });

  it('rejects score warnings and incomplete totals', async () => {
    scoring.findScoreResultByScaleInstanceAndRunNo.mockResolvedValueOnce({
      ...fixtures.score,
      computation: { ...fixtures.score.computation, warningCount: 1 },
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_SCORE_NOT_FINAL' },
    });
    scoring.findScoreResultByScaleInstanceAndRunNo.mockResolvedValueOnce({
      ...fixtures.score,
      totalScore: {
        ...fixtures.score.totalScore,
        unscoredItemCount: 1,
        scoredItemCount: 0,
      },
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_SCORE_NOT_FINAL' },
    });
  });

  it('accepts a locked final source score', async () => {
    scoring.findScoreResultByScaleInstanceAndRunNo.mockResolvedValueOnce({
      ...fixtures.score,
      status: 'locked',
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).resolves.toMatchObject({ alreadyGenerated: false });
  });

  it('requires a valid deterministic cognitive domain result', async () => {
    domains.findDomainResultByScaleInstanceAndRunNo.mockResolvedValueOnce(null);
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_REQUIRED' },
    });
    domains.findDomainResultByScaleInstanceAndRunNo.mockResolvedValueOnce({
      ...fixtures.domain,
      mappingMode: 'weighted_mapping',
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_INVALID' },
    });
  });

  it('rejects domain warnings and non-readable domain statuses', async () => {
    domains.findDomainResultByScaleInstanceAndRunNo.mockResolvedValueOnce({
      ...fixtures.domain,
      computation: { ...fixtures.domain.computation, warningCount: 1 },
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_INVALID' },
    });
    domains.findDomainResultByScaleInstanceAndRunNo.mockResolvedValueOnce({
      ...fixtures.domain,
      status: 'needs_review',
    });
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_DOMAIN_RESULT_INVALID' },
    });
  });

  it.each(['confirmed', 'locked'] as const)(
    'accepts a %s cognitive domain result for a draft report',
    async (status) => {
      domains.findDomainResultByScaleInstanceAndRunNo.mockResolvedValueOnce({
        ...fixtures.domain,
        status,
      });
      await expect(
        service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
          confirm: true,
          primaryScaleInstanceIds: [ids.instance],
        }),
      ).resolves.toMatchObject({ alreadyGenerated: false });
    },
  );

  it('filters pending and voided media but blocks invalid active media', async () => {
    media.listEvidenceByScaleInstanceId.mockResolvedValueOnce([
      { ...fixtures.media, status: 'pending' },
      { ...fixtures.media, id: '507f1f77bcf86cd799439090', status: 'voided' },
    ]);
    await service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
      confirm: true,
      primaryScaleInstanceIds: [ids.instance],
    });
    expect(
      reports.createVersionOneCognitiveAssessmentReport,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceSnapshots: [], mediaEvidenceIds: [] }),
    );
    media.listEvidenceByScaleInstanceId.mockResolvedValueOnce([
      { ...fixtures.media, storageStatus: 'missing' },
    ]);
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_MEDIA_INVALID' },
    });
    media.listEvidenceByScaleInstanceId.mockResolvedValueOnce([
      { ...fixtures.media, qualityStatus: 'unusable' },
    ]);
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_MEDIA_INVALID' },
    });
    media.listEvidenceByScaleInstanceId.mockResolvedValueOnce([
      {
        ...fixtures.media,
        storage: { ...fixtures.media.storage, objectKey: '' },
      },
    ]);
    await expect(
      service.generateClinicalReportDraft(ids.patient, ids.visit, actor, {
        confirm: true,
        primaryScaleInstanceIds: [ids.instance],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_SOURCE_MEDIA_INVALID' },
    });
  });

  it('creates a single safe draft and derives needs-review quality from media', async () => {
    media.listEvidenceByScaleInstanceId.mockResolvedValueOnce([
      { ...fixtures.media, qualityStatus: 'needs_review' },
    ]);
    const result = await service.generateClinicalReportDraft(
      ids.patient,
      ids.visit,
      actor,
      { confirm: true, primaryScaleInstanceIds: [ids.instance] },
    );
    expect(result.alreadyGenerated).toBe(false);
    expect(
      reports.createVersionOneCognitiveAssessmentReport,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: 'cognitive_assessment',
        reportVersion: 1,
        status: 'draft',
        source: 'system_draft',
        qualityStatus: 'needs_review',
      }),
    );
    expect(result.report).not.toHaveProperty('metadata');
  });

  it('recovers duplicate-key concurrency through the same scope boundary', async () => {
    const duplicate = { code: 11000 };
    reports.createVersionOneCognitiveAssessmentReport.mockRejectedValueOnce(
      duplicate,
    );
    reports.isDuplicateKeyError.mockImplementation(
      (error: unknown) => error === duplicate,
    );
    reports.findLatestReportByVisitId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fixtures.report);
    const result = await service.generateClinicalReportDraft(
      ids.patient,
      ids.visit,
      actor,
      { confirm: true, primaryScaleInstanceIds: [ids.instance] },
    );
    expect(result.alreadyGenerated).toBe(true);
  });

  it('latest is historical read-only and reports not found safely', async () => {
    reports.findLatestReportByVisitId.mockResolvedValueOnce(fixtures.report);
    const result = await service.getLatestClinicalReport(
      ids.patient,
      ids.visit,
    );
    expect(result.report.reportCode).toBe(fixtures.report.reportCode);
    reports.findLatestReportByVisitId.mockResolvedValueOnce(null);
    await expect(
      service.getLatestClinicalReport(ids.patient, ids.visit),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_NOT_FOUND' },
    });
  });
});
