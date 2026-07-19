import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
    listPatientFollowUpTrendVisits: jest.fn(),
    listPatientFollowUpTrendScaleInstances: jest.fn(),
  };
  const scoring = { listAssessmentHistoryScoreResults: jest.fn() };
  const domains = { listAssessmentHistoryDomainResults: jest.fn() };
  const reports = { listClinicalReportHistoryRecords: jest.fn() };
  const catalog = { getAvailableScaleOption: jest.fn() };
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
    catalog.getAvailableScaleOption.mockReturnValue({
      code: 'moca',
      name: 'Montreal Cognitive Assessment',
      shortName: 'MoCA',
    });
    assessments.listPatientFollowUpTrendVisits.mockResolvedValue([]);
    assessments.listPatientFollowUpTrendScaleInstances.mockResolvedValue([]);
    service = new ClinicalHistoryQueryService(
      patients as never,
      assessments as never,
      scoring as never,
      domains as never,
      reports as never,
      catalog as never,
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

  it('returns an empty trend without downstream batch reads', async () => {
    const result = await service.getPatientFollowUpTrend(patientId, {
      scaleCode: 'moca',
      maxPoints: 50,
    });
    expect(result).toMatchObject({
      scale: { scaleCode: 'moca', displayName: 'MoCA' },
      range: { pointCount: 0 },
      points: [],
    });
    expect(catalog.getAvailableScaleOption).toHaveBeenCalledTimes(1);
    expect(assessments.listPatientFollowUpTrendVisits).toHaveBeenCalledWith(
      patientId,
      { limit: 51 },
    );
    expect(
      assessments.listPatientFollowUpTrendScaleInstances,
    ).not.toHaveBeenCalled();
    expect(scoring.listAssessmentHistoryScoreResults).not.toHaveBeenCalled();
    expect(domains.listAssessmentHistoryDomainResults).not.toHaveBeenCalled();
  });

  it('uses one batch per source and preserves every Visit as a point', async () => {
    const secondVisitId = '507f1f77bcf86cd799439099';
    assessments.listPatientFollowUpTrendVisits.mockResolvedValue([
      {
        id: visitId,
        patientId,
        visitCode: 'VIS-TREND-1',
        visitType: 'baseline',
        status: 'completed',
        assessmentDate: new Date('2026-07-01T00:00:00.000Z'),
      },
      {
        id: secondVisitId,
        patientId,
        visitCode: 'VIS-TREND-2',
        visitType: 'follow_up',
        status: 'completed',
        assessmentDate: new Date('2026-07-02T00:00:00.000Z'),
      },
    ]);
    const result = await service.getPatientFollowUpTrend(patientId, {
      scaleCode: 'moca',
      maxPoints: 50,
    });
    expect(result.range.pointCount).toBe(2);
    expect(result.points.map((point) => point.dataStatus)).toEqual([
      'source_missing',
      'source_missing',
    ]);
    expect(
      assessments.listPatientFollowUpTrendScaleInstances,
    ).toHaveBeenCalledTimes(1);
    expect(scoring.listAssessmentHistoryScoreResults).toHaveBeenCalledTimes(1);
    expect(domains.listAssessmentHistoryDomainResults).toHaveBeenCalledTimes(1);
    expect(reports.listClinicalReportHistoryRecords).not.toHaveBeenCalled();
  });

  it('returns stable trend errors for date, patient, catalog and range', async () => {
    await expect(
      service.getPatientFollowUpTrend(patientId, {
        scaleCode: 'moca',
        maxPoints: 50,
        dateFrom: new Date('2026-07-20T00:00:00.000Z'),
        dateTo: new Date('2026-07-19T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    patients.findPatientHistoryIdentityById.mockResolvedValueOnce(null);
    await expect(
      service.getPatientFollowUpTrend(patientId, {
        scaleCode: 'moca',
        maxPoints: 50,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    catalog.getAvailableScaleOption.mockImplementationOnce(() => {
      throw new NotFoundException({ code: 'SCALE_NOT_AVAILABLE' });
    });
    await expect(
      service.getPatientFollowUpTrend(patientId, {
        scaleCode: 'unknown',
        maxPoints: 50,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    assessments.listPatientFollowUpTrendVisits.mockResolvedValueOnce(
      Array.from({ length: 3 }, (_, index) => ({
        id: `507f1f77bcf86cd7994390${index + 20}`,
        patientId,
        visitCode: `VIS-${index}`,
        visitType: 'follow_up',
        status: 'completed',
        assessmentDate: new Date(`2026-07-0${index + 1}T00:00:00.000Z`),
      })),
    );
    await expect(
      service.getPatientFollowUpTrend(patientId, {
        scaleCode: 'moca',
        maxPoints: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
