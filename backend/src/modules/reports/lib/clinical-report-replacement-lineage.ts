import type { ClinicalReportSummary } from '../services/reports.service';
import type {
  ClinicalReportCorrectionMetadata,
  ClinicalReportReplacementMetadata,
} from '../types/clinical-report-correction.types';
import {
  resolveClinicalReportReplacementLineage,
  resolveExistingClinicalReportCorrection,
} from './clinical-report-correction';
import { resolveExistingClinicalReportArchive } from './clinical-report-archive';
import { resolveExistingClinicalReportLock } from './clinical-report-lock';
import { resolveExistingSourceFreeze } from './clinical-report-source-freeze';

export const CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID =
  'CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID' as const;

export class ClinicalReportReplacementLineageRuleError extends Error {
  readonly code = CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID;

  constructor() {
    super(CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID);
  }
}

function invalid(): never {
  throw new ClinicalReportReplacementLineageRuleError();
}

function sameDate(left: Date | null | undefined, right: Date): boolean {
  return left instanceof Date && left.getTime() === right.getTime();
}

function assertCorrectionRecordMatches(
  previousReport: ClinicalReportSummary,
  audit: ClinicalReportCorrectionMetadata,
): void {
  if (previousReport.correctionRecords.length !== 1) {
    invalid();
  }
  const record = previousReport.correctionRecords[0];
  if (
    record.correctionNo !== audit.correctionNo ||
    !sameDate(record.correctedAt, audit.completedAt!) ||
    record.correctedBy !== audit.completedBy ||
    record.correctedByName !== audit.completedByName ||
    record.reason !== audit.correctionReason ||
    record.changeSummary !== audit.changeSummary ||
    record.previousReportCode !== audit.previousReportCode ||
    record.replacementReportCode !== audit.replacementReportCode ||
    record.auditLogId !== null
  ) {
    invalid();
  }
}

function assertAuditMatchesLineage(
  currentReport: ClinicalReportSummary,
  previousReport: ClinicalReportSummary,
  audit: ClinicalReportCorrectionMetadata,
  lineage: ClinicalReportReplacementMetadata,
): void {
  if (
    audit.state !== 'completed' ||
    !audit.replacementReportId ||
    !audit.replacementCreatedAt ||
    !audit.completedAt ||
    !audit.completedBy ||
    !audit.completedByName ||
    !audit.completedByRole ||
    audit.correctionId !== lineage.correctionId ||
    audit.correctionNo !== lineage.correctionNo ||
    audit.previousReportCode !== previousReport.reportCode ||
    audit.previousReportVersion !== previousReport.reportVersion ||
    audit.replacementReportId !== currentReport.id ||
    audit.replacementReportCode !== currentReport.reportCode ||
    audit.replacementReportVersion !== currentReport.reportVersion ||
    !sameDate(audit.replacementCreatedAt, currentReport.createdAt!) ||
    lineage.previousReportId !== previousReport.id ||
    lineage.previousReportCode !== previousReport.reportCode ||
    lineage.previousReportVersion !== previousReport.reportVersion ||
    lineage.replacementReportCode !== currentReport.reportCode ||
    lineage.replacementReportVersion !== currentReport.reportVersion ||
    !sameDate(lineage.createdAt, currentReport.createdAt!) ||
    audit.startedBy !== lineage.createdBy ||
    audit.startedByName !== lineage.createdByName ||
    audit.startedByRole !== lineage.createdByRole ||
    audit.correctionReason !== lineage.correctionReason ||
    audit.changeSummary !== lineage.changeSummary ||
    audit.sourceArchiveId !== lineage.sourceArchiveId ||
    !sameDate(audit.sourceArchivedAt, lineage.sourceArchivedAt) ||
    audit.sourceFreezeId !== lineage.sourceFreezeId ||
    !sameDate(audit.sourceFreezeCompletedAt, lineage.sourceFreezeCompletedAt)
  ) {
    invalid();
  }
}

function assertSourceLifecycleAnchors(
  previousReport: ClinicalReportSummary,
  audit: ClinicalReportCorrectionMetadata,
): void {
  const lock = resolveExistingClinicalReportLock(previousReport);
  const freeze = resolveExistingSourceFreeze(previousReport);
  const archive = resolveExistingClinicalReportArchive(previousReport);
  if (
    !lock ||
    lock.lockId === null ||
    !freeze ||
    freeze.state !== 'completed' ||
    !freeze.completedAt ||
    !archive ||
    archive.archiveId === null ||
    archive.archiveId !== audit.sourceArchiveId ||
    !sameDate(archive.archivedAt, audit.sourceArchivedAt) ||
    freeze.freezeId !== audit.sourceFreezeId ||
    !sameDate(freeze.completedAt, audit.sourceFreezeCompletedAt) ||
    archive.sourceFreezeId !== audit.sourceFreezeId ||
    !sameDate(archive.sourceFreezeCompletedAt, audit.sourceFreezeCompletedAt)
  ) {
    invalid();
  }
}

export function assertClinicalReportReplacementLineageLink(input: {
  currentReport: ClinicalReportSummary;
  previousReport: ClinicalReportSummary | null;
}): void {
  const current = input.currentReport;
  if (current.reportVersion === 1) {
    return;
  }
  try {
    if (
      !Number.isSafeInteger(current.reportVersion) ||
      current.reportVersion < 2 ||
      !input.previousReport ||
      !current.createdAt
    ) {
      invalid();
    }
    const previous = input.previousReport;
    const lineage = resolveClinicalReportReplacementLineage(current);
    const correction = resolveExistingClinicalReportCorrection(previous);
    if (
      !lineage ||
      !correction ||
      !correction.completed ||
      previous.status !== 'corrected' ||
      previous.patientId !== current.patientId ||
      previous.assessmentVisitId !== current.assessmentVisitId ||
      previous.reportType !== current.reportType ||
      !Number.isSafeInteger(previous.reportVersion) ||
      previous.reportVersion !== current.reportVersion - 1
    ) {
      invalid();
    }
    assertAuditMatchesLineage(current, previous, correction.audit, lineage);
    assertCorrectionRecordMatches(previous, correction.audit);
    assertSourceLifecycleAnchors(previous, correction.audit);
  } catch (error: unknown) {
    if (error instanceof ClinicalReportReplacementLineageRuleError) {
      throw error;
    }
    invalid();
  }
}
