import type { ClinicalReportHistoryRecord } from '../services/reports.service';
import { evaluateClinicalReportHistoryLineage } from './clinical-report-history-lineage';
import { mapClinicalReportVersionItem } from './clinical-report-version.mapper';

describe('clinical report version safe mapper', () => {
  it('maps only the version-list contract for a valid V1 draft', () => {
    const at = new Date('2026-07-19T08:00:00.000Z');
    const report: ClinicalReportHistoryRecord = {
      id: '507f1f77bcf86cd799439011',
      patientId: '507f1f77bcf86cd799439012',
      assessmentVisitId: '507f1f77bcf86cd799439013',
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
    };
    const evaluation = evaluateClinicalReportHistoryLineage({
      reports: [report],
      patientId: report.patientId,
      assessmentVisitId: report.assessmentVisitId,
    });
    const result = mapClinicalReportVersionItem({ report, evaluation });
    expect(result).toMatchObject({
      isFinal: false,
      sourceFreezeStatus: 'none',
      previous: null,
      replacement: null,
      isLatestVersion: true,
    });
    expect(Object.keys(result).sort()).toEqual(
      [
        'id',
        'reportCode',
        'reportVersion',
        'reportType',
        'status',
        'source',
        'qualityStatus',
        'isFinal',
        'createdAt',
        'updatedAt',
        'confirmedAt',
        'lockedAt',
        'sourceFreezeStatus',
        'sourceFreezeCompletedAt',
        'archivedAt',
        'correctedAt',
        'voidedAt',
        'correctionNo',
        'correctionReason',
        'changeSummary',
        'previous',
        'replacement',
        'isLatestVersion',
      ].sort(),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /previousReportId|replacementReportId|correctionId|metadata|narrative/,
    );
  });
});
