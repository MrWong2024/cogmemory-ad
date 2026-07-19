import { ConflictException } from '@nestjs/common';
import type { ClinicalReportSummary } from '../services/reports.service';

export function assertReadableClinicalReport(
  report: ClinicalReportSummary,
  patientId: string,
  assessmentVisitId: string,
): void {
  if (
    report.patientId !== patientId ||
    report.assessmentVisitId !== assessmentVisitId ||
    !report.reportCode ||
    !report.createdAt ||
    !report.updatedAt ||
    !report.patientSnapshot ||
    !report.visitSnapshot ||
    report.scaleTraces.length < 1 ||
    report.scoreSnapshots.length < 1 ||
    report.domainSnapshots.length < 1 ||
    !report.narrative ||
    !report.aiDraft ||
    (['confirmed', 'archived', 'corrected'].includes(report.status) &&
      (!report.confirmation || !report.confirmation.confirmedAt))
  ) {
    throw new ConflictException({
      code: 'CLINICAL_REPORT_INCOMPLETE',
      message: 'Clinical report is incomplete',
    });
  }
}
