import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClinicalHistoryQueryService } from './clinical-history-query.service';

describe('ClinicalHistoryQueryService', () => {
  const patientId = '507f1f77bcf86cd799439011';
  const visitId = '507f1f77bcf86cd799439012';
  const instanceId = '507f1f77bcf86cd799439013';
  const patients = { findPatientHistoryIdentityById: jest.fn() };
  const assessments = {
    listPatientVisitIdsByScaleCode: jest.fn(),
    listPatientAssessmentHistoryVisits: jest.fn(),
    listAssessmentHistoryScaleInstances: jest.fn(),
  };
  const scoring = { listAssessmentHistoryScoreResults: jest.fn() };
  const domains = { listAssessmentHistoryDomainResults: jest.fn() };
  const reports = { listClinicalReportHistoryRecords: jest.fn() };
  let service: ClinicalHistoryQueryService;

  beforeEach(() => {
    jest.clearAllMocks();
    patients.findPatientHistoryIdentityById.mockResolvedValue({
      id: patientId,
    });
    assessments.listPatientVisitIdsByScaleCode.mockResolvedValue([visitId]);
    assessments.listPatientAssessmentHistoryVisits.mockResolvedValue({
      items: [
        {
          id: visitId,
          patientId,
          visitCode: 'VIS-HISTORY-1',
          visitType: 'baseline',
          status: 'locked',
          assessmentDate: new Date('2026-07-19T08:00:00.000Z'),
          startedAt: null,
          completedAt: null,
          lockedAt: null,
          voidedAt: null,
        },
      ],
      total: 1,
    });
    assessments.listAssessmentHistoryScaleInstances.mockResolvedValue([
      {
        id: instanceId,
        patientId,
        assessmentVisitId: visitId,
        scaleCode: 'moca',
        scaleVersion: '1',
        instanceCode: 'SI-HISTORY-1',
        instanceNo: 1,
        status: 'completed',
        administrationMode: 'clinician_administered',
        versionTrace: null,
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        voidedAt: null,
        durationMs: null,
      },
    ]);
    scoring.listAssessmentHistoryScoreResults.mockResolvedValue([]);
    domains.listAssessmentHistoryDomainResults.mockResolvedValue([]);
    reports.listClinicalReportHistoryRecords.mockResolvedValue([]);
    service = new ClinicalHistoryQueryService(
      patients as never,
      assessments as never,
      scoring as never,
      domains as never,
      reports as never,
    );
  });

  it('filters scaleCode before pagination and uses one batch per source', async () => {
    const result = await service.listPatientAssessmentHistory(patientId, {
      page: 1,
      pageSize: 20,
      scaleCode: 'moca',
    });
    expect(assessments.listPatientVisitIdsByScaleCode).toHaveBeenCalledTimes(1);
    expect(assessments.listPatientAssessmentHistoryVisits).toHaveBeenCalledWith(
      patientId,
      expect.objectContaining({ visitIds: [visitId] }),
    );
    expect(
      assessments.listPatientAssessmentHistoryVisits,
    ).toHaveBeenCalledTimes(1);
    expect(
      assessments.listAssessmentHistoryScaleInstances,
    ).toHaveBeenCalledTimes(1);
    expect(scoring.listAssessmentHistoryScoreResults).toHaveBeenCalledTimes(1);
    expect(domains.listAssessmentHistoryDomainResults).toHaveBeenCalledTimes(1);
    expect(reports.listClinicalReportHistoryRecords).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(result.items[0].scaleSummaries[0].scoreSummary).toBeNull();
    expect(result.items[0].scaleSummaries[0].domainSummary).toBeNull();
  });

  it('returns an out-of-range page without downstream source queries', async () => {
    assessments.listPatientAssessmentHistoryVisits.mockResolvedValue({
      items: [],
      total: 3,
    });
    await expect(
      service.listPatientAssessmentHistory(patientId, {
        page: 5,
        pageSize: 20,
      }),
    ).resolves.toEqual({ items: [], page: 5, pageSize: 20, total: 3 });
    expect(
      assessments.listAssessmentHistoryScaleInstances,
    ).not.toHaveBeenCalled();
    expect(reports.listClinicalReportHistoryRecords).not.toHaveBeenCalled();
  });

  it('rejects an inverted date range and a missing patient', async () => {
    await expect(
      service.listPatientAssessmentHistory(patientId, {
        page: 1,
        pageSize: 20,
        dateFrom: new Date('2026-07-20T00:00:00.000Z'),
        dateTo: new Date('2026-07-19T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    patients.findPatientHistoryIdentityById.mockResolvedValueOnce(null);
    await expect(
      service.listPatientAssessmentHistory(patientId, {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
