import type { ClinicalReportHistoryRecord } from '../services/reports.service';
import type { ClinicalReportVersionListItemResponse } from '../types/clinical-report-history-response.types';
import type { ClinicalReportHistoryLineageEvaluation } from './clinical-report-history-lineage';

export function mapClinicalReportVersionItem(input: {
  report: ClinicalReportHistoryRecord;
  evaluation: ClinicalReportHistoryLineageEvaluation;
}): ClinicalReportVersionListItemResponse {
  const lifecycle = input.evaluation.lifecycleByReportId.get(input.report.id)!;
  const correction =
    lifecycle.correction?.state === 'completed' ? lifecycle.correction : null;
  const archive = lifecycle.archive?.archiveId ? lifecycle.archive : null;
  const lock = lifecycle.lock?.lockId ? lifecycle.lock : null;
  const freeze = lifecycle.sourceFreeze;
  const replacementOf = lifecycle.replacementOf;
  return {
    id: input.report.id,
    reportCode: input.report.reportCode,
    reportVersion: input.report.reportVersion,
    reportType: input.report.reportType,
    status: input.report.status,
    source: input.report.source,
    qualityStatus: input.report.qualityStatus,
    isFinal: ['confirmed', 'archived', 'corrected'].includes(
      input.report.status,
    ),
    createdAt: new Date(input.report.createdAt!.getTime()),
    updatedAt: new Date(input.report.updatedAt!.getTime()),
    confirmedAt: lifecycle.confirmedAt
      ? new Date(lifecycle.confirmedAt.getTime())
      : null,
    lockedAt: lock ? new Date(lock.lockedAt.getTime()) : null,
    sourceFreezeStatus: freeze?.state ?? 'none',
    sourceFreezeCompletedAt:
      freeze?.state === 'completed' && freeze.completedAt
        ? new Date(freeze.completedAt.getTime())
        : null,
    archivedAt: archive ? new Date(archive.archivedAt.getTime()) : null,
    correctedAt:
      correction?.completedAt instanceof Date
        ? new Date(correction.completedAt.getTime())
        : null,
    voidedAt: input.report.voidedAt
      ? new Date(input.report.voidedAt.getTime())
      : null,
    correctionNo: correction?.correctionNo ?? null,
    correctionReason: correction?.correctionReason ?? null,
    changeSummary: correction?.changeSummary ?? null,
    previous: replacementOf
      ? {
          reportCode: replacementOf.previousReportCode,
          reportVersion: replacementOf.previousReportVersion,
        }
      : null,
    replacement: correction
      ? {
          reportCode: correction.replacementReportCode,
          reportVersion: correction.replacementReportVersion,
        }
      : null,
    isLatestVersion:
      input.report.reportVersion === input.evaluation.latestVersion,
  };
}
