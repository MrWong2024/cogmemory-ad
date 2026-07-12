// backend/src/modules/reports/services/reports.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  ClinicalReport,
  ClinicalReportSchema,
  ReportAiDraftSnapshotSchema,
  ReportConfirmationSnapshotSchema,
  ReportCorrectionRecordSchema,
  ReportDomainSnapshotSchema,
  ReportEvidenceSnapshotSchema,
  ReportNarrativeSnapshotSchema,
  ReportPatientSnapshotSchema,
  ReportScaleTraceSnapshotSchema,
  ReportScoreSnapshotSchema,
  ReportVisitSnapshotSchema,
} from '../schemas/clinical-report.schema';
import { ReportsService } from './reports.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createReportFixture(overrides: Record<string, unknown> = {}) {
  const scaleInstanceId = new Types.ObjectId();
  const scoreResultId = new Types.ObjectId();
  const domainResultId = new Types.ObjectId();
  const mediaEvidenceId = new Types.ObjectId();
  const itemResponseId = new Types.ObjectId();
  const aiAnalysisResultId = new Types.ObjectId();
  const confirmedBy = new Types.ObjectId();
  const lockedBy = new Types.ObjectId();
  const archivedBy = new Types.ObjectId();
  const correctedBy = new Types.ObjectId();
  const voidedBy = new Types.ObjectId();
  const auditLogId = new Types.ObjectId();

  return {
    _id: new Types.ObjectId(),
    patientId: new Types.ObjectId(),
    assessmentVisitId: new Types.ObjectId(),
    primaryScaleInstanceIds: [scaleInstanceId],
    scoreResultIds: [scoreResultId],
    cognitiveDomainResultIds: [domainResultId],
    mediaEvidenceIds: [mediaEvidenceId],
    subjectCode: 'SUBJ-TEST-001',
    reportCode: 'RPT-TEST-001',
    reportNo: 'NO-TEST-001',
    reportType: 'cognitive_assessment',
    status: 'pending_confirmation',
    reportVersion: 1,
    source: 'manual',
    patientSnapshot: {
      subjectCode: 'SUBJ-TEST-001',
      displayName: 'Sample Subject',
      sex: 'unknown',
      birthDate: null,
      educationYears: 12,
    },
    visitSnapshot: {
      visitCode: 'VISIT-TEST-001',
      visitType: 'baseline',
      assessmentDate: new Date('2026-01-09T08:00:00.000Z'),
      operatorName: 'Sample Operator',
      operatorRole: 'doctor',
      clinicalContext: { source: 'unit-test' },
    },
    scaleTraces: [
      {
        scaleInstanceId,
        scaleCode: 'moca',
        scaleVersion: '1.0',
        crfVersion: 'crf-test-1',
        scoringRuleVersion: 'score-test-1',
        fieldEncodingVersion: 'field-test-1',
        domainMappingVersion: 'domain-map-test-1',
        sourceDocument: 'source-test',
      },
    ],
    scoreSnapshots: [
      {
        scoreResultId,
        scaleCode: 'moca',
        scaleName: 'MoCA sample',
        scaleVersion: '1.0',
        totalScoreValue: 24,
        totalMaxScore: 30,
        totalMinScore: 0,
        scorePercent: 80,
        scoreStatus: 'computed',
        qualityStatus: 'passed',
        summary: 'De-identified score summary',
        scoreDetails: { source: 'unit-test' },
      },
    ],
    domainSnapshots: [
      {
        cognitiveDomainResultId: domainResultId,
        scaleCode: 'moca',
        domainCode: 'memory',
        domainTitle: 'Memory sample',
        scoreValue: 3,
        maxScore: 5,
        scorePercent: 60,
        weightedScore: 3,
        weightedMaxScore: 5,
        itemCount: 5,
        needsReviewItemCount: 1,
        summary: 'De-identified domain summary',
      },
    ],
    evidenceSnapshots: [
      {
        mediaEvidenceId,
        itemResponseId,
        scaleCode: 'moca',
        itemCode: 'moca.visuospatial.clock',
        itemTitle: 'Clock drawing sample',
        evidenceType: 'handwriting',
        captureMode: 'tablet_handwriting',
        storageObjectKey: 'test-object-key/evidence-001',
        qualityStatus: 'needs_review',
        summary: 'De-identified evidence summary',
      },
    ],
    narrative: {
      chiefSummary: 'De-identified chief summary',
      scoreSummary: 'De-identified score summary',
      domainSummary: 'De-identified domain summary',
      evidenceSummary: 'De-identified evidence summary',
      trendSummary: 'Trend placeholder only',
      recommendationText: 'Clinician-editable recommendation sample',
      doctorOpinion: 'Clinician sample opinion',
      limitations: 'De-identified limitation note',
    },
    aiDraft: {
      aiAnalysisResultId,
      provider: 'placeholder',
      model: 'draft-placeholder',
      generatedAt: new Date('2026-01-09T09:00:00.000Z'),
      draftText: 'Draft placeholder for clinician review',
      status: 'generated',
      doctorEdited: true,
      note: 'AI placeholder only',
    },
    confirmation: {
      confirmedAt: new Date('2026-01-09T10:00:00.000Z'),
      confirmedBy,
      confirmedByName: 'Sample Doctor',
      confirmedByRole: 'doctor',
      confirmationNote: 'De-identified confirmation note',
      signatureText: 'Signature summary placeholder',
    },
    lockedAt: new Date('2026-01-09T10:05:00.000Z'),
    lockedBy,
    archivedAt: new Date('2026-01-10T08:00:00.000Z'),
    archivedBy,
    correctionRecords: [
      {
        correctionNo: 1,
        correctedAt: new Date('2026-01-11T08:00:00.000Z'),
        correctedBy,
        correctedByName: 'Sample Doctor',
        reason: 'De-identified correction reason',
        changeSummary: 'De-identified change summary',
        previousReportCode: 'RPT-TEST-001',
        replacementReportCode: 'RPT-TEST-002',
        auditLogId,
      },
    ],
    voidedAt: null,
    voidedBy,
    voidReason: 'De-identified void reason',
    auditLogRefs: [auditLogId],
    qualityStatus: 'passed',
    qualityHints: { needsReview: false },
    operatorNote: 'De-identified operator note',
    metadata: { source: 'unit-test' },
    createdAt: new Date('2026-01-09T08:00:00.000Z'),
    updatedAt: new Date('2026-01-10T08:00:00.000Z'),
    internalMarker: 'not returned',
    ...overrides,
  };
}

describe('ClinicalReport schema', () => {
  it('defines collection and indexes', () => {
    expect(ClinicalReportSchema.get('collection')).toBe('clinical_reports');
    expect(ClinicalReportSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ reportCode: 1 }, expect.objectContaining({ unique: true })],
        [
          { assessmentVisitId: 1, reportType: 1, reportVersion: -1 },
          expect.any(Object),
        ],
        [{ patientId: 1, createdAt: -1 }, expect.any(Object)],
        [{ subjectCode: 1, createdAt: -1 }, expect.any(Object)],
        [{ status: 1, updatedAt: -1 }, expect.any(Object)],
        [{ reportType: 1, status: 1 }, expect.any(Object)],
        [{ 'scoreSnapshots.scaleCode': 1 }, expect.any(Object)],
        [{ 'domainSnapshots.domainCode': 1 }, expect.any(Object)],
        [{ qualityStatus: 1, updatedAt: -1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines explicit ObjectId, primitive, nullable and Mixed field types', () => {
    expect(ClinicalReportSchema.path('patientId')?.instance).toBe('ObjectId');
    expect(ClinicalReportSchema.path('assessmentVisitId')?.instance).toBe(
      'ObjectId',
    );
    expect(ClinicalReportSchema.path('primaryScaleInstanceIds')?.instance).toBe(
      'Array',
    );
    expect(ClinicalReportSchema.path('scoreResultIds')?.instance).toBe('Array');
    expect(
      ClinicalReportSchema.path('cognitiveDomainResultIds')?.instance,
    ).toBe('Array');
    expect(ClinicalReportSchema.path('mediaEvidenceIds')?.instance).toBe(
      'Array',
    );
    expect(ClinicalReportSchema.path('subjectCode')?.instance).toBe('String');
    expect(ClinicalReportSchema.path('reportCode')?.instance).toBe('String');
    expect(ClinicalReportSchema.path('reportType')?.instance).toBe('String');
    expect(ClinicalReportSchema.path('status')?.instance).toBe('String');
    expect(ClinicalReportSchema.path('reportVersion')?.instance).toBe('Number');
    expect(ClinicalReportSchema.path('source')?.instance).toBe('String');
    expect(ClinicalReportSchema.path('lockedAt')?.instance).toBe('Date');
    expect(ClinicalReportSchema.path('lockedBy')?.instance).toBe('ObjectId');
    expect(ClinicalReportSchema.path('archivedAt')?.instance).toBe('Date');
    expect(ClinicalReportSchema.path('archivedBy')?.instance).toBe('ObjectId');
    expect(ClinicalReportSchema.path('voidedAt')?.instance).toBe('Date');
    expect(ClinicalReportSchema.path('voidedBy')?.instance).toBe('ObjectId');
    expect(ClinicalReportSchema.path('auditLogRefs')?.instance).toBe('Array');
    expect(ClinicalReportSchema.path('qualityStatus')?.instance).toBe('String');
    expect(ClinicalReportSchema.path('qualityHints')?.instance).toBe('Mixed');
    expect(ClinicalReportSchema.path('metadata')?.instance).toBe('Mixed');

    expect(ReportPatientSnapshotSchema.path('sex')?.instance).toBe('String');
    expect(ReportPatientSnapshotSchema.path('birthDate')?.instance).toBe(
      'Date',
    );
    expect(ReportPatientSnapshotSchema.path('educationYears')?.instance).toBe(
      'Number',
    );
    expect(ReportVisitSnapshotSchema.path('visitType')?.instance).toBe(
      'String',
    );
    expect(ReportVisitSnapshotSchema.path('assessmentDate')?.instance).toBe(
      'Date',
    );
    expect(ReportVisitSnapshotSchema.path('operatorRole')?.instance).toBe(
      'String',
    );
    expect(ReportVisitSnapshotSchema.path('clinicalContext')?.instance).toBe(
      'Mixed',
    );
    expect(
      ReportScaleTraceSnapshotSchema.path('scaleInstanceId')?.instance,
    ).toBe('ObjectId');
    expect(ReportScaleTraceSnapshotSchema.path('scaleCode')?.instance).toBe(
      'String',
    );
    expect(ReportScoreSnapshotSchema.path('scoreResultId')?.instance).toBe(
      'ObjectId',
    );
    expect(ReportScoreSnapshotSchema.path('scaleCode')?.instance).toBe(
      'String',
    );
    expect(ReportScoreSnapshotSchema.path('totalScoreValue')?.instance).toBe(
      'Number',
    );
    expect(ReportScoreSnapshotSchema.path('totalMaxScore')?.instance).toBe(
      'Number',
    );
    expect(ReportScoreSnapshotSchema.path('totalMinScore')?.instance).toBe(
      'Number',
    );
    expect(ReportScoreSnapshotSchema.path('scorePercent')?.instance).toBe(
      'Number',
    );
    expect(ReportScoreSnapshotSchema.path('scoreStatus')?.instance).toBe(
      'String',
    );
    expect(ReportScoreSnapshotSchema.path('qualityStatus')?.instance).toBe(
      'String',
    );
    expect(ReportScoreSnapshotSchema.path('scoreDetails')?.instance).toBe(
      'Mixed',
    );
    expect(
      ReportDomainSnapshotSchema.path('cognitiveDomainResultId')?.instance,
    ).toBe('ObjectId');
    expect(ReportDomainSnapshotSchema.path('scoreValue')?.instance).toBe(
      'Number',
    );
    expect(ReportDomainSnapshotSchema.path('maxScore')?.instance).toBe(
      'Number',
    );
    expect(ReportDomainSnapshotSchema.path('scorePercent')?.instance).toBe(
      'Number',
    );
    expect(ReportDomainSnapshotSchema.path('weightedScore')?.instance).toBe(
      'Number',
    );
    expect(ReportDomainSnapshotSchema.path('weightedMaxScore')?.instance).toBe(
      'Number',
    );
    expect(ReportDomainSnapshotSchema.path('itemCount')?.instance).toBe(
      'Number',
    );
    expect(
      ReportDomainSnapshotSchema.path('needsReviewItemCount')?.instance,
    ).toBe('Number');
    expect(ReportEvidenceSnapshotSchema.path('mediaEvidenceId')?.instance).toBe(
      'ObjectId',
    );
    expect(ReportEvidenceSnapshotSchema.path('itemResponseId')?.instance).toBe(
      'ObjectId',
    );
    expect(ReportEvidenceSnapshotSchema.path('evidenceType')?.instance).toBe(
      'String',
    );
    expect(ReportEvidenceSnapshotSchema.path('captureMode')?.instance).toBe(
      'String',
    );
    expect(ReportEvidenceSnapshotSchema.path('qualityStatus')?.instance).toBe(
      'String',
    );
    expect(
      ReportAiDraftSnapshotSchema.path('aiAnalysisResultId')?.instance,
    ).toBe('ObjectId');
    expect(ReportAiDraftSnapshotSchema.path('generatedAt')?.instance).toBe(
      'Date',
    );
    expect(ReportAiDraftSnapshotSchema.path('status')?.instance).toBe('String');
    expect(ReportAiDraftSnapshotSchema.path('doctorEdited')?.instance).toBe(
      'Boolean',
    );
    expect(ReportConfirmationSnapshotSchema.path('confirmedAt')?.instance).toBe(
      'Date',
    );
    expect(ReportConfirmationSnapshotSchema.path('confirmedBy')?.instance).toBe(
      'ObjectId',
    );
    expect(
      ReportConfirmationSnapshotSchema.path('confirmedByRole')?.instance,
    ).toBe('String');
    expect(ReportCorrectionRecordSchema.path('correctionNo')?.instance).toBe(
      'Number',
    );
    expect(ReportCorrectionRecordSchema.path('correctedAt')?.instance).toBe(
      'Date',
    );
    expect(ReportCorrectionRecordSchema.path('correctedBy')?.instance).toBe(
      'ObjectId',
    );
    expect(ReportCorrectionRecordSchema.path('auditLogId')?.instance).toBe(
      'ObjectId',
    );
  });

  it('keeps embedded schemas without nested _id fields', () => {
    expect(ReportPatientSnapshotSchema.get('_id')).toBe(false);
    expect(ReportVisitSnapshotSchema.get('_id')).toBe(false);
    expect(ReportScaleTraceSnapshotSchema.get('_id')).toBe(false);
    expect(ReportScoreSnapshotSchema.get('_id')).toBe(false);
    expect(ReportDomainSnapshotSchema.get('_id')).toBe(false);
    expect(ReportEvidenceSnapshotSchema.get('_id')).toBe(false);
    expect(ReportNarrativeSnapshotSchema.get('_id')).toBe(false);
    expect(ReportAiDraftSnapshotSchema.get('_id')).toBe(false);
    expect(ReportConfirmationSnapshotSchema.get('_id')).toBe(false);
    expect(ReportCorrectionRecordSchema.get('_id')).toBe(false);
  });
});

describe('ReportsService', () => {
  let service: ReportsService;
  let clinicalReportModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    clinicalReportModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getModelToken(ClinicalReport.name),
          useValue: clinicalReportModel,
        },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes report code', () => {
    expect(service.normalizeReportCode('  rpt-test-001  ')).toBe(
      'RPT-TEST-001',
    );
  });

  it('returns null when report code is empty or report is not found', async () => {
    await expect(service.findReportByCode('   ')).resolves.toBeNull();
    expect(clinicalReportModel.findOne).not.toHaveBeenCalled();

    clinicalReportModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findReportByCode('RPT-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(clinicalReportModel.findOne).toHaveBeenCalledWith({
      reportCode: 'RPT-UNKNOWN-001',
    });
  });

  it('maps report output instead of returning raw documents', async () => {
    const reportId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const scaleInstanceId = new Types.ObjectId();
    const scoreResultId = new Types.ObjectId();
    const domainResultId = new Types.ObjectId();
    const mediaEvidenceId = new Types.ObjectId();
    const itemResponseId = new Types.ObjectId();
    const auditLogId = new Types.ObjectId();
    const rawReport = createReportFixture({
      _id: reportId,
      patientId,
      assessmentVisitId: visitId,
      primaryScaleInstanceIds: [scaleInstanceId],
      scoreResultIds: [scoreResultId],
      cognitiveDomainResultIds: [domainResultId],
      mediaEvidenceIds: [mediaEvidenceId],
      reportCode: 'RPT-TEST-002',
      scaleTraces: [
        {
          scaleInstanceId,
          scaleCode: 'moca',
          scaleVersion: '1.0',
        },
      ],
      scoreSnapshots: [
        {
          scoreResultId,
          scaleCode: 'moca',
          totalScoreValue: 25,
          totalMaxScore: 30,
          totalMinScore: 0,
          scorePercent: 83.33333333333334,
          scoreStatus: 'computed',
          qualityStatus: 'passed',
          scoreDetails: { source: 'unit-test' },
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: domainResultId,
          domainCode: 'memory',
          scoreValue: 4,
          maxScore: 5,
          itemCount: 5,
        },
      ],
      evidenceSnapshots: [
        {
          mediaEvidenceId,
          itemResponseId,
          evidenceType: 'handwriting',
          captureMode: 'tablet_handwriting',
          qualityStatus: 'needs_review',
        },
      ],
      correctionRecords: [
        {
          correctionNo: 1,
          correctedAt: new Date('2026-01-11T08:00:00.000Z'),
          correctedBy: new Types.ObjectId(),
          correctedByName: 'Sample Doctor',
          reason: 'De-identified correction reason',
          changeSummary: 'De-identified change summary',
          previousReportCode: 'RPT-TEST-001',
          replacementReportCode: 'RPT-TEST-002',
          auditLogId,
        },
      ],
      auditLogRefs: [auditLogId],
    });
    clinicalReportModel.findOne.mockReturnValue(createExecQuery(rawReport));

    const result = await service.findReportByCode(' rpt-test-002 ');

    expect(result).toEqual(
      expect.objectContaining({
        id: reportId.toString(),
        patientId: patientId.toString(),
        assessmentVisitId: visitId.toString(),
        primaryScaleInstanceIds: [scaleInstanceId.toString()],
        scoreResultIds: [scoreResultId.toString()],
        cognitiveDomainResultIds: [domainResultId.toString()],
        mediaEvidenceIds: [mediaEvidenceId.toString()],
        subjectCode: 'SUBJ-TEST-001',
        reportCode: 'RPT-TEST-002',
        reportType: 'cognitive_assessment',
        status: 'pending_confirmation',
        reportVersion: 1,
        source: 'manual',
        qualityStatus: 'passed',
        auditLogRefs: [auditLogId.toString()],
      }),
    );
    expect(result?.patientSnapshot).toEqual(
      expect.objectContaining({
        subjectCode: 'SUBJ-TEST-001',
        displayName: 'Sample Subject',
        sex: 'unknown',
        educationYears: 12,
      }),
    );
    expect(result?.visitSnapshot).toEqual(
      expect.objectContaining({
        visitCode: 'VISIT-TEST-001',
        visitType: 'baseline',
        operatorRole: 'doctor',
        clinicalContext: { source: 'unit-test' },
      }),
    );
    expect(result?.scaleTraces[0]).toEqual(
      expect.objectContaining({
        scaleInstanceId: scaleInstanceId.toString(),
        scaleCode: 'moca',
      }),
    );
    expect(result?.scoreSnapshots[0]).toEqual(
      expect.objectContaining({
        scoreResultId: scoreResultId.toString(),
        scaleCode: 'moca',
        totalScoreValue: 25,
        scoreDetails: { source: 'unit-test' },
      }),
    );
    expect(result?.domainSnapshots[0]).toEqual(
      expect.objectContaining({
        cognitiveDomainResultId: domainResultId.toString(),
        domainCode: 'memory',
      }),
    );
    expect(result?.evidenceSnapshots[0]).toEqual(
      expect.objectContaining({
        mediaEvidenceId: mediaEvidenceId.toString(),
        itemResponseId: itemResponseId.toString(),
      }),
    );
    expect(result?.narrative).toEqual(
      expect.objectContaining({
        doctorOpinion: 'Clinician sample opinion',
      }),
    );
    expect(result?.aiDraft).toEqual(
      expect.objectContaining({
        provider: 'placeholder',
        status: 'generated',
        doctorEdited: true,
      }),
    );
    expect(result?.confirmation).toEqual(
      expect.objectContaining({
        confirmedByRole: 'doctor',
      }),
    );
    expect(result?.correctionRecords[0]).toEqual(
      expect.objectContaining({
        correctionNo: 1,
        auditLogId: auditLogId.toString(),
      }),
    );
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(clinicalReportModel.findOne).toHaveBeenCalledWith({
      reportCode: 'RPT-TEST-002',
    });
  });

  it('finds latest report by visit id ordered by report version and createdAt', async () => {
    const assessmentVisitId = new Types.ObjectId();
    const sort = jest
      .fn()
      .mockReturnValue(
        createExecQuery(
          createReportFixture({ assessmentVisitId, reportVersion: 2 }),
        ),
      );
    clinicalReportModel.findOne.mockReturnValue({ sort });

    const result = await service.findLatestReportByVisitId(assessmentVisitId);

    expect(clinicalReportModel.findOne).toHaveBeenCalledWith({
      assessmentVisitId,
    });
    expect(sort).toHaveBeenCalledWith({ reportVersion: -1, createdAt: -1 });
    expect(result).toEqual(
      expect.objectContaining({
        assessmentVisitId: assessmentVisitId.toString(),
        reportVersion: 2,
      }),
    );
  });

  it('finds a report by visit, type and version', async () => {
    const assessmentVisitId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery(
        createReportFixture({
          assessmentVisitId,
          reportType: 'cognitive_assessment',
          reportVersion: 1,
        }),
      ),
    );
    clinicalReportModel.findOne.mockReturnValue({ sort });

    const result = await service.findReportByVisitTypeVersion(
      assessmentVisitId,
      'cognitive_assessment',
      1,
    );

    expect(clinicalReportModel.findOne).toHaveBeenCalledWith({
      assessmentVisitId,
      reportType: 'cognitive_assessment',
      reportVersion: 1,
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result?.createdAt).toEqual(new Date('2026-01-09T08:00:00.000Z'));
  });

  it('uses complete ownership for direct report lookup', async () => {
    const reportId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    clinicalReportModel.findOne.mockReturnValue(
      createExecQuery(
        createReportFixture({
          _id: reportId,
          patientId,
          assessmentVisitId: visitId,
        }),
      ),
    );

    await service.findReportByOwnership({
      reportId: reportId.toString(),
      patientId: patientId.toString(),
      assessmentVisitId: visitId.toString(),
    });

    expect(clinicalReportModel.findOne).toHaveBeenCalledWith({
      _id: reportId,
      patientId,
      assessmentVisitId: visitId,
      reportType: 'cognitive_assessment',
      reportVersion: 1,
    });
  });

  it('atomically edits only narrative, source and metadata', async () => {
    const reportId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const expectedUpdatedAt = new Date('2026-07-12T08:00:00.000Z');
    clinicalReportModel.findOneAndUpdate.mockReturnValue(
      createExecQuery(
        createReportFixture({
          _id: reportId,
          patientId,
          assessmentVisitId: visitId,
          status: 'draft',
          source: 'mixed',
        }),
      ),
    );
    const narrative = {
      chiefSummary: 'system',
      scoreSummary: 'system',
      domainSummary: 'system',
      evidenceSummary: 'system',
      limitations: 'system',
      doctorOpinion: 'controlled edit',
    };
    const metadata = { a20Generation: {}, a21Edits: {} };

    await service.updateDraftNarrativeIfUnmodified({
      reportId: reportId.toString(),
      patientId: patientId.toString(),
      assessmentVisitId: visitId.toString(),
      expectedUpdatedAt,
      narrative,
      metadata,
    });

    expect(clinicalReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: reportId,
        patientId,
        assessmentVisitId: visitId,
        reportType: 'cognitive_assessment',
        reportVersion: 1,
        status: 'draft',
        updatedAt: expectedUpdatedAt,
      },
      { $set: { narrative, source: 'mixed', metadata } },
      { new: true, runValidators: true },
    );
  });

  it('atomically submits and confirms with distinct allowed states', async () => {
    const reportId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const visitId = new Types.ObjectId();
    const actorId = new Types.ObjectId();
    const expectedUpdatedAt = new Date('2026-07-12T08:00:00.000Z');
    clinicalReportModel.findOneAndUpdate.mockReturnValue(
      createExecQuery(createReportFixture()),
    );
    const ownership = {
      reportId: reportId.toString(),
      patientId: patientId.toString(),
      assessmentVisitId: visitId.toString(),
      expectedUpdatedAt,
    };

    await service.submitForConfirmationIfUnmodified({
      ...ownership,
      metadata: { a21Submission: {} },
    });
    await service.confirmReportIfUnmodified({
      ...ownership,
      confirmation: {
        version: 1,
        confirmationId: 'confirmation-a21-test',
        confirmedAt: expectedUpdatedAt,
        confirmedBy: actorId.toString(),
        confirmedByName: 'A21 Test Doctor',
        confirmedByRole: 'doctor',
        confirmationNote: 'De-identified confirmation',
      },
      metadata: { a21Confirmation: {} },
    });

    expect(clinicalReportModel.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      {
        _id: reportId,
        patientId,
        assessmentVisitId: visitId,
        reportType: 'cognitive_assessment',
        reportVersion: 1,
        status: 'draft',
        updatedAt: expectedUpdatedAt,
      },
      {
        $set: {
          status: 'pending_confirmation',
          metadata: { a21Submission: {} },
        },
      },
      { new: true, runValidators: true },
    );
    expect(clinicalReportModel.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      {
        _id: reportId,
        patientId,
        assessmentVisitId: visitId,
        reportType: 'cognitive_assessment',
        reportVersion: 1,
        status: 'pending_confirmation',
        updatedAt: expectedUpdatedAt,
      },
      {
        $set: {
          status: 'confirmed',
          confirmation: {
            confirmedAt: expectedUpdatedAt,
            confirmedBy: actorId,
            confirmedByName: 'A21 Test Doctor',
            confirmedByRole: 'doctor',
            confirmationNote: 'De-identified confirmation',
          },
          qualityStatus: 'passed',
          metadata: { a21Confirmation: {} },
        },
      },
      { new: true, runValidators: true },
    );
  });

  it('creates one complete version-one cognitive assessment document', async () => {
    const patientId = new Types.ObjectId().toString();
    const assessmentVisitId = new Types.ObjectId().toString();
    const scaleInstanceId = new Types.ObjectId().toString();
    const scoreResultId = new Types.ObjectId().toString();
    const cognitiveDomainResultId = new Types.ObjectId().toString();
    const generatedBy = new Types.ObjectId().toString();
    clinicalReportModel.create.mockResolvedValue(
      createReportFixture({
        patientId: new Types.ObjectId(patientId),
        assessmentVisitId: new Types.ObjectId(assessmentVisitId),
        primaryScaleInstanceIds: [new Types.ObjectId(scaleInstanceId)],
        scoreResultIds: [new Types.ObjectId(scoreResultId)],
        cognitiveDomainResultIds: [new Types.ObjectId(cognitiveDomainResultId)],
        mediaEvidenceIds: [],
        reportCode: 'RPT-0123456789ABCDEF01234567',
        status: 'draft',
        source: 'system_draft',
      }),
    );

    const result = await service.createVersionOneCognitiveAssessmentReport({
      patientId,
      assessmentVisitId,
      primaryScaleInstanceIds: [scaleInstanceId],
      scoreResultIds: [scoreResultId],
      cognitiveDomainResultIds: [cognitiveDomainResultId],
      mediaEvidenceIds: [],
      subjectCode: 'SUBJ-A20-TEST-001',
      reportCode: 'RPT-0123456789ABCDEF01234567',
      reportType: 'cognitive_assessment',
      status: 'draft',
      reportVersion: 1,
      source: 'system_draft',
      patientSnapshot: {
        subjectCode: 'SUBJ-A20-TEST-001',
        birthDate: null,
        educationYears: 12,
      },
      visitSnapshot: {
        visitCode: 'VISIT-A20-TEST-001',
        assessmentDate: new Date('2026-07-11T08:00:00.000Z'),
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
          scoreDetails: null,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId,
          scaleCode: 'moca',
          domainCode: 'memory',
          scoreValue: 4,
          maxScore: 5,
          scorePercent: 80,
          weightedScore: 4,
          weightedMaxScore: 5,
          itemCount: 5,
          needsReviewItemCount: 0,
        },
      ],
      evidenceSnapshots: [],
      narrative: { chiefSummary: '规则化草稿' },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: null,
      lockedAt: null,
      archivedAt: null,
      correctionRecords: [],
      voidedAt: null,
      auditLogRefs: [],
      qualityStatus: 'unchecked',
      qualityHints: null,
      metadata: {
        a20Generation: {
          version: 1,
          generationId: 'generation-a20-test',
          generatedAt: new Date('2026-07-11T09:00:00.000Z'),
          generatedBy,
          generatedByName: '脱敏医生',
          generatedByRole: 'doctor',
          engineVersion: 'a20-clinical-report-draft-1.0',
          reportScope: 'explicit_primary_scale_instances',
          primaryScaleInstanceIds: [scaleInstanceId],
          scoreResultIds: [scoreResultId],
          cognitiveDomainResultIds: [cognitiveDomainResultId],
          mediaEvidenceCount: 0,
          aiUsed: false,
        },
      },
    });

    expect(clinicalReportModel.create).toHaveBeenCalledTimes(1);
    expect(clinicalReportModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reportVersion: 1,
        status: 'draft',
        source: 'system_draft',
        confirmation: null,
        correctionRecords: [],
      }),
    );
    expect(result.reportCode).toBe('RPT-0123456789ABCDEF01234567');
  });

  it('recognizes duplicate key errors without leaking database details', () => {
    expect(service.isDuplicateKeyError({ code: 11000, keyPattern: {} })).toBe(
      true,
    );
    expect(service.isDuplicateKeyError(new Error('not duplicate'))).toBe(false);
  });

  it('lists reports by visit id ordered by report version and createdAt', async () => {
    const assessmentVisitId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createReportFixture({
          assessmentVisitId,
          reportCode: 'RPT-TEST-003',
        }),
      ]),
    );
    clinicalReportModel.find.mockReturnValue({ sort });

    const result = await service.listReportsByVisitId(assessmentVisitId);

    expect(clinicalReportModel.find).toHaveBeenCalledWith({
      assessmentVisitId,
    });
    expect(sort).toHaveBeenCalledWith({ reportVersion: 1, createdAt: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        assessmentVisitId: assessmentVisitId.toString(),
        reportCode: 'RPT-TEST-003',
      }),
    );
  });

  it('lists reports by patient id ordered by newest createdAt first', async () => {
    const patientId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createReportFixture({
          patientId,
          reportCode: 'RPT-TEST-004',
        }),
      ]),
    );
    clinicalReportModel.find.mockReturnValue({ sort });

    const result = await service.listReportsByPatientId(patientId);

    expect(clinicalReportModel.find).toHaveBeenCalledWith({ patientId });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        patientId: patientId.toString(),
        reportCode: 'RPT-TEST-004',
      }),
    );
  });

  it('lists reports by status ordered by updatedAt', async () => {
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createReportFixture({
          reportCode: 'RPT-TEST-005',
          status: 'confirmed',
        }),
      ]),
    );
    clinicalReportModel.find.mockReturnValue({ sort });

    const result = await service.listReportsByStatus(' CONFIRMED ');

    expect(clinicalReportModel.find).toHaveBeenCalledWith({
      status: 'confirmed',
    });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(result[0]).toEqual(
      expect.objectContaining({
        reportCode: 'RPT-TEST-005',
        status: 'confirmed',
      }),
    );
  });

  it('lists confirmed reports by patient id using confirmed, archived and corrected statuses only', async () => {
    const patientId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        createReportFixture({
          patientId,
          reportCode: 'RPT-TEST-006',
          status: 'archived',
        }),
      ]),
    );
    clinicalReportModel.find.mockReturnValue({ sort });

    const result = await service.listConfirmedReportsByPatientId(patientId);

    expect(clinicalReportModel.find).toHaveBeenCalledWith({
      patientId,
      status: { $in: ['confirmed', 'archived', 'corrected'] },
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result[0]).toEqual(
      expect.objectContaining({
        patientId: patientId.toString(),
        reportCode: 'RPT-TEST-006',
        status: 'archived',
      }),
    );
  });

  it('does not query when object id or status inputs are invalid', async () => {
    await expect(
      service.findLatestReportByVisitId('not-object-id'),
    ).resolves.toBeNull();
    await expect(
      service.listReportsByVisitId('not-object-id'),
    ).resolves.toEqual([]);
    await expect(
      service.listReportsByPatientId('not-object-id'),
    ).resolves.toEqual([]);
    await expect(
      service.listReportsByStatus('invalid-status'),
    ).resolves.toEqual([]);
    await expect(
      service.listConfirmedReportsByPatientId('not-object-id'),
    ).resolves.toEqual([]);
    expect(clinicalReportModel.findOne).not.toHaveBeenCalled();
    expect(clinicalReportModel.find).not.toHaveBeenCalled();
  });

  it('validates allowed report status transitions without database writes', () => {
    expect(
      service.canTransitionReportStatus('draft', 'pending_confirmation'),
    ).toBe(true);
    expect(
      service.canTransitionReportStatus('pending_confirmation', 'confirmed'),
    ).toBe(true);
    expect(service.canTransitionReportStatus('confirmed', 'archived')).toBe(
      true,
    );
    expect(service.canTransitionReportStatus('confirmed', 'corrected')).toBe(
      true,
    );
    expect(service.canTransitionReportStatus('archived', 'corrected')).toBe(
      true,
    );
    expect(service.canTransitionReportStatus('draft', 'voided')).toBe(true);
    expect(
      service.canTransitionReportStatus('pending_confirmation', 'voided'),
    ).toBe(true);
    expect(service.canTransitionReportStatus('confirmed', 'voided')).toBe(true);
    expect(service.canTransitionReportStatus('corrected', 'draft')).toBe(false);
    expect(service.canTransitionReportStatus('voided', 'draft')).toBe(false);
    expect(service.canTransitionReportStatus('draft', 'confirmed')).toBe(false);
    expect(service.canTransitionReportStatus('archived', 'voided')).toBe(false);
    expect(clinicalReportModel.find).not.toHaveBeenCalled();
    expect(clinicalReportModel.findOne).not.toHaveBeenCalled();
  });

  it('returns stable allowed transition lists', () => {
    expect(service.getAllowedReportStatusTransitions('draft')).toEqual([
      'pending_confirmation',
      'voided',
    ]);
    expect(
      service.getAllowedReportStatusTransitions('pending_confirmation'),
    ).toEqual(['draft', 'confirmed', 'voided']);
    expect(service.getAllowedReportStatusTransitions('confirmed')).toEqual([
      'archived',
      'corrected',
      'voided',
    ]);
    expect(service.getAllowedReportStatusTransitions('archived')).toEqual([
      'corrected',
    ]);
    expect(service.getAllowedReportStatusTransitions('corrected')).toEqual([]);
    expect(service.getAllowedReportStatusTransitions('voided')).toEqual([]);
  });
});
