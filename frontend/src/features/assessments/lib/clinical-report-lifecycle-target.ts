import type {
  ClinicalReport,
  ClinicalReportReplacementLineage,
  ClinicalReportWorkflowActor,
} from '@/src/features/assessments/types/clinical-report';

const mongoIdPattern = /^[a-f\d]{24}$/i;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClinicalReportLifecycleTarget =
  | { kind: 'version_one'; reportVersion: 1 }
  | { kind: 'replacement'; reportVersion: number };

function isSafeIsoString(value: string | null | undefined): value is string {
  return Boolean(value && value.includes('T') && Number.isFinite(Date.parse(value)));
}

function isSafeActor(actor: ClinicalReportWorkflowActor | null): boolean {
  return Boolean(
    actor &&
      actor.operatorId &&
      mongoIdPattern.test(actor.operatorId.trim()) &&
      actor.operatorName?.trim() &&
      (actor.operatorRole === 'doctor' || actor.operatorRole === 'admin'),
  );
}

function isSafeText(value: string, min: number, max: number): boolean {
  const length = value.trim().length;
  return length >= min && length <= max;
}

function isSafePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

// This validates only the public replacement summary needed for a safe UI gate.
// The backend remains authoritative for the complete bidirectional lineage.
export function isSafeClinicalReportReplacementLineage(
  lineage: ClinicalReportReplacementLineage | null,
  report?: ClinicalReport,
): lineage is ClinicalReportReplacementLineage {
  if (
    !lineage ||
    !uuidPattern.test(lineage.correctionId) ||
    !isSafePositiveInteger(lineage.correctionNo) ||
    !mongoIdPattern.test(lineage.previousReportId) ||
    !lineage.previousReportCode.trim() ||
    !isSafePositiveInteger(lineage.previousReportVersion) ||
    !lineage.replacementReportCode.trim() ||
    !isSafePositiveInteger(lineage.replacementReportVersion) ||
    lineage.replacementReportVersion !== lineage.previousReportVersion + 1 ||
    lineage.correctionNo !== lineage.replacementReportVersion - 1 ||
    !isSafeIsoString(lineage.createdAt) ||
    !isSafeActor(lineage.createdBy) ||
    !isSafeText(lineage.correctionReason, 3, 2000) ||
    !isSafeText(lineage.changeSummary, 3, 4000) ||
    !uuidPattern.test(lineage.sourceArchiveId) ||
    !isSafeIsoString(lineage.sourceArchivedAt) ||
    !uuidPattern.test(lineage.sourceFreezeId) ||
    !isSafeIsoString(lineage.sourceFreezeCompletedAt)
  ) {
    return false;
  }

  return (
    !report ||
    (report.id !== lineage.previousReportId &&
      report.reportCode === lineage.replacementReportCode &&
      report.reportVersion === lineage.replacementReportVersion)
  );
}

export function isVersionOneReport(report: ClinicalReport): boolean {
  return (
    report.reportType === 'cognitive_assessment' &&
    report.reportVersion === 1 &&
    report.replacementOf === null
  );
}

export function getClinicalReportLifecycleTarget(
  report: ClinicalReport,
): ClinicalReportLifecycleTarget | null {
  if (isVersionOneReport(report)) {
    return { kind: 'version_one', reportVersion: 1 };
  }
  if (
    report.reportType === 'cognitive_assessment' &&
    Number.isSafeInteger(report.reportVersion) &&
    report.reportVersion >= 2 &&
    isSafeClinicalReportReplacementLineage(report.replacementOf, report)
  ) {
    return { kind: 'replacement', reportVersion: report.reportVersion };
  }
  return null;
}

export function getClinicalReportLifecycleTargetWarning(
  report: ClinicalReport,
): string | null {
  return getClinicalReportLifecycleTarget(report)
    ? null
    : '当前报告类型或版本关系摘要不完整或不一致，不能开放不可逆生命周期操作；请重新加载报告或联系管理员核查。';
}
