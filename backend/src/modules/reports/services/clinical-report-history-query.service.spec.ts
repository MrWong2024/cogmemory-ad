import { ConflictException, NotFoundException } from '@nestjs/common';
import type {
  ClinicalReportHistoryRecord,
  ClinicalReportSummary,
} from './reports.service';
import { ClinicalReportHistoryQueryService } from './clinical-report-history-query.service';

describe('ClinicalReportHistoryQueryService', () => {
  const patientId = '507f1f77bcf86cd799439011';
  const visitId = '507f1f77bcf86cd799439012';
  const reportId = '507f1f77bcf86cd799439013';
  const patients = { findPatientHistoryIdentityById: jest.fn() };
  const assessments = { findAssessmentHistoryVisitIdentity: jest.fn() };
  const reports = {
    listClinicalReportHistoryRecords: jest.fn(),
    findReportByOwnership: jest.fn(),
  };
  const mapper = { toPublicReport: jest.fn() };
  let service: ClinicalReportHistoryQueryService;

  function light(
    overrides: Partial<ClinicalReportHistoryRecord> = {},
  ): ClinicalReportHistoryRecord {
    const at = new Date('2026-07-19T08:00:00.000Z');
    return {
      id: reportId,
      patientId,
      assessmentVisitId: visitId,
      reportCode: 'RPT-HISTORY-V1',
      reportType: 'cognitive_assessment',
      status: 'draft',
      reportVersion: 1,
      source: 'system_draft',
      qualityStatus: 'unchecked',
      confirmation: null,
      lockedAt: null,
      lockedBy: null,
      archivedAt: null,
      archivedBy: null,
      correctionRecords: [],
      voidedAt: null,
      metadata: null,
      createdAt: at,
      updatedAt: at,
      ...overrides,
    };
  }

  function readable(): ClinicalReportSummary {
    const at = new Date('2026-07-19T08:00:00.000Z');
    return {
      id: reportId,
      patientId,
      assessmentVisitId: visitId,
      primaryScaleInstanceIds: [],
      scoreResultIds: [],
      cognitiveDomainResultIds: [],
      mediaEvidenceIds: [],
      subjectCode: 'SUBJ-HISTORY',
      reportCode: 'RPT-HISTORY-V1',
      reportType: 'cognitive_assessment',
      status: 'draft',
      reportVersion: 1,
      source: 'system_draft',
      patientSnapshot: { birthDate: null, educationYears: null },
      visitSnapshot: { assessmentDate: at, clinicalContext: null },
      scaleTraces: [{ scaleInstanceId: null, scaleCode: 'moca' }],
      scoreSnapshots: [
        {
          scoreResultId: null,
          scaleCode: 'moca',
          totalScoreValue: 1,
          totalMaxScore: 2,
          totalMinScore: 0,
          scorePercent: 50,
          scoreDetails: null,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: null,
          domainCode: 'memory',
          scoreValue: 1,
          maxScore: 2,
          scorePercent: 50,
          weightedScore: null,
          weightedMaxScore: null,
          itemCount: 1,
          needsReviewItemCount: 0,
        },
      ],
      evidenceSnapshots: [],
      narrative: { chiefSummary: 'De-identified summary' },
      aiDraft: {
        aiAnalysisResultId: null,
        generatedAt: null,
        status: 'not_requested',
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
      qualityStatus: 'unchecked',
      qualityHints: null,
      metadata: null,
      createdAt: at,
      updatedAt: at,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    patients.findPatientHistoryIdentityById.mockResolvedValue({
      id: patientId,
    });
    assessments.findAssessmentHistoryVisitIdentity.mockResolvedValue({
      id: visitId,
      patientId,
    });
    reports.listClinicalReportHistoryRecords.mockResolvedValue([light()]);
    reports.findReportByOwnership.mockResolvedValue(readable());
    mapper.toPublicReport.mockReturnValue({ id: reportId });
    service = new ClinicalReportHistoryQueryService(
      patients as never,
      assessments as never,
      reports as never,
      mapper as never,
    );
  });

  it('validates the full collection before in-memory pagination', async () => {
    await expect(
      service.listVersions(patientId, visitId, { page: 2, pageSize: 20 }),
    ).resolves.toEqual({
      items: [],
      page: 2,
      pageSize: 20,
      total: 1,
      lineage: {
        status: 'valid',
        firstVersion: 1,
        latestVersion: 1,
        totalVersions: 1,
      },
    });
    expect(reports.listClinicalReportHistoryRecords).toHaveBeenCalledWith(
      patientId,
      [visitId],
    );
  });

  it('maps invalid lineage and unsafe base fields to distinct conflicts', async () => {
    reports.listClinicalReportHistoryRecords.mockResolvedValueOnce([
      light({ reportVersion: 2 }),
    ]);
    await expect(
      service.listVersions(patientId, visitId, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_HISTORY_LINEAGE_INVALID' },
    });
    reports.listClinicalReportHistoryRecords.mockResolvedValueOnce([
      light({ updatedAt: null }),
    ]);
    await expect(
      service.listVersions(patientId, visitId, { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('loads a historical detail by full ownership and reuses the public mapper', async () => {
    await expect(
      service.getHistoricalReport(patientId, visitId, reportId),
    ).resolves.toEqual({ report: { id: reportId } });
    expect(reports.findReportByOwnership).toHaveBeenCalledWith({
      reportId,
      patientId,
      assessmentVisitId: visitId,
    });
    expect(mapper.toPublicReport).toHaveBeenCalledTimes(1);
  });

  it('does not leak missing patient, visit, or report ownership', async () => {
    patients.findPatientHistoryIdentityById.mockResolvedValueOnce(null);
    await expect(
      service.getHistoricalReport(patientId, visitId, reportId),
    ).rejects.toBeInstanceOf(NotFoundException);
    assessments.findAssessmentHistoryVisitIdentity.mockResolvedValueOnce(null);
    await expect(
      service.getHistoricalReport(patientId, visitId, reportId),
    ).rejects.toMatchObject({ response: { code: 'VISIT_NOT_FOUND' } });
    reports.findReportByOwnership.mockResolvedValueOnce(null);
    await expect(
      service.getHistoricalReport(patientId, visitId, reportId),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_NOT_FOUND' },
    });
  });
});
