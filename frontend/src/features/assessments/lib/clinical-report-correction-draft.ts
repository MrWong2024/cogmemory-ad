import {
  getClinicalReportFinalityWarning,
  getClinicalReportLockConsistencyWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
import {
  getClinicalReportArchiveConsistencyWarning,
  isSafeClinicalReportArchive,
} from '@/src/features/assessments/lib/clinical-report-archive-draft';
import {
  getClinicalReportSourceFreezeConsistencyWarning,
  isCompletedClinicalReportSourceFreeze,
} from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import { isSafeClinicalReportReplacementLineage } from '@/src/features/assessments/lib/clinical-report-lifecycle-target';
import type {
  ClinicalReport,
  ClinicalReportCorrectionSummary,
  ClinicalReportWorkflowActor,
  CreateClinicalReportCorrectionRequest,
} from '@/src/features/assessments/types/clinical-report';

export {
  isSafeClinicalReportReplacementLineage,
  isVersionOneReport,
} from '@/src/features/assessments/lib/clinical-report-lifecycle-target';

const mongoIdPattern = /^[a-f\d]{24}$/i;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const clinicalReportCorrectionLimits = {
  correctionReason: { min: 3, max: 2000 },
  changeSummary: { min: 3, max: 4000 },
} as const;

export type CorrectionDraft = {
  mode: 'start' | 'resume';
  sourceReportId: string;
  baseUpdatedAt: string;
  correctionId: string | null;
  correctionReason: string;
  changeSummary: string;
  confirmed: boolean;
  stale: boolean;
  usesPersistedContent: boolean;
};

export type ClinicalReportCorrectionValidation = {
  correctionReason: string | null;
  changeSummary: string | null;
  confirmation: string | null;
  valid: boolean;
};

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

function isSafeCorrectionText(value: string, min: number, max: number): boolean {
  const length = value.trim().length;
  return length >= min && length <= max;
}

function isSafePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isSafeCorrectionSummary(
  correction: ClinicalReportCorrectionSummary,
  report: ClinicalReport,
): boolean {
  if (
    !uuidPattern.test(correction.correctionId) ||
    !isSafePositiveInteger(correction.correctionNo) ||
    !isSafeIsoString(correction.startedAt) ||
    !isSafeActor(correction.startedBy) ||
    !isSafeCorrectionText(
      correction.correctionReason,
      clinicalReportCorrectionLimits.correctionReason.min,
      clinicalReportCorrectionLimits.correctionReason.max,
    ) ||
    !isSafeCorrectionText(
      correction.changeSummary,
      clinicalReportCorrectionLimits.changeSummary.min,
      clinicalReportCorrectionLimits.changeSummary.max,
    ) ||
    correction.previousReportCode !== report.reportCode ||
    correction.previousReportVersion !== report.reportVersion ||
    correction.replacementReportVersion !== report.reportVersion + 1 ||
    correction.correctionNo !== correction.replacementReportVersion - 1 ||
    !correction.replacementReportCode.trim()
  ) {
    return false;
  }

  if (correction.state === 'in_progress') {
    return (
      report.status === 'archived' &&
      (correction.replacementReportId === null ||
        mongoIdPattern.test(correction.replacementReportId)) &&
      correction.completedAt === null &&
      correction.completedBy === null
    );
  }

  return (
    correction.state === 'completed' &&
    report.status === 'corrected' &&
    correction.replacementReportId !== null &&
    mongoIdPattern.test(correction.replacementReportId) &&
    isSafeIsoString(correction.completedAt) &&
    isSafeActor(correction.completedBy)
  );
}

export function canCurrentRolesWriteReplacement(roles: readonly string[]): boolean {
  return roles.includes('doctor') || roles.includes('admin');
}

export function isSafeCorrectionReplacement(report: ClinicalReport): boolean {
  return (
    report.reportType === 'cognitive_assessment' &&
    isSafePositiveInteger(report.reportVersion) &&
    report.reportVersion >= 2 &&
    report.source === 'mixed' &&
    report.correction === null &&
    isSafeClinicalReportReplacementLineage(report.replacementOf, report) &&
    report.lockedAt === null &&
    report.lock === null &&
    report.sourceFreeze === null &&
    report.archivedAt === null &&
    report.archive === null &&
    report.voidedAt === null
  );
}

export function getClinicalReportCorrectionConsistencyWarning(
  report: ClinicalReport,
): string | null {
  if (report.replacementOf !== null) {
    return isSafeClinicalReportReplacementLineage(report.replacementOf, report)
      ? null
      : '替代报告的版本来源关系不完整或不一致，不能继续写入。';
  }
  if (report.correction === null) return null;
  return isSafeCorrectionSummary(report.correction, report)
    ? null
    : '版本化更正安全摘要不完整或不一致，不能启动、恢复或确认完成状态。';
}

export function getClinicalReportCorrectionStartEligibilityWarning(
  report: ClinicalReport,
): string | null {
  if (report.reportType !== 'cognitive_assessment') {
    return '当前仅支持认知评估临床报告的版本化更正。';
  }
  if (!isSafePositiveInteger(report.reportVersion)) {
    return '当前报告版本号无效，不能安全创建下一线性版本。';
  }
  if (report.status !== 'archived') return '只有已归档报告可以发起版本化更正。';
  if (report.source !== 'mixed' || report.qualityStatus !== 'passed') {
    return '当前报告来源或质量状态不满足版本化更正要求。';
  }
  if (!report.isFinal || getClinicalReportFinalityWarning(report.status, report.isFinal)) {
    return '报告状态与最终性标记不一致，不能安全发起更正。';
  }
  if (
    !report.confirmation ||
    !report.confirmation.confirmationId ||
    !uuidPattern.test(report.confirmation.confirmationId) ||
    !isSafeIsoString(report.confirmation.confirmedAt) ||
    !report.confirmation.confirmedByName?.trim() ||
    (report.confirmation.confirmedByRole !== 'doctor' &&
      report.confirmation.confirmedByRole !== 'admin') ||
    !isSafeCorrectionText(report.confirmation.confirmationNote ?? '', 3, 2000)
  ) {
    return '当前归档报告缺少完整且安全的医生或管理员确认摘要。';
  }
  const lockWarning = getClinicalReportLockConsistencyWarning(report);
  if (lockWarning) return lockWarning;
  if (
    !isSafeIsoString(report.lockedAt) ||
    !report.lock ||
    !report.lock.lockId ||
    !uuidPattern.test(report.lock.lockId) ||
    report.lock.lockedAt !== report.lockedAt ||
    !isSafeActor(report.lock.lockedBy) ||
    !isSafeCorrectionText(report.lock.lockNote ?? '', 3, 2000)
  ) {
    return '当前归档报告缺少完整且一致的锁定锚点。';
  }
  const freezeWarning = getClinicalReportSourceFreezeConsistencyWarning(report.sourceFreeze);
  if (freezeWarning || !isCompletedClinicalReportSourceFreeze(report.sourceFreeze)) {
    return freezeWarning ?? '当前归档报告缺少已完成的安全来源冻结摘要。';
  }
  const archiveWarning = getClinicalReportArchiveConsistencyWarning(report);
  if (archiveWarning || !isSafeClinicalReportArchive(report)) {
    return archiveWarning ?? '当前报告归档摘要不完整，不能安全发起更正。';
  }
  if (
    !report.archive?.archiveId ||
    report.archive.sourceFreezeId !== report.sourceFreeze?.freezeId ||
    report.archive.sourceFreezeCompletedAt !== report.sourceFreeze?.completedAt
  ) {
    return '归档摘要与来源冻结锚点不一致，不能安全发起更正。';
  }
  if (report.correction !== null || report.replacementOf !== null) {
    return '当前报告已存在更正编排或替代来源关系。';
  }
  if (report.voidedAt !== null) return '已作废报告不能发起版本化更正。';
  if (!mongoIdPattern.test(report.id) || !isSafeIsoString(report.updatedAt)) {
    return '当前报告缺少安全写入标识或更新时间。';
  }
  return null;
}

export function getClinicalReportCorrectionResumeEligibilityWarning(
  report: ClinicalReport,
): string | null {
  if (report.status !== 'archived' || report.correction?.state !== 'in_progress') {
    return '当前报告没有可显式恢复的版本化更正流程。';
  }
  if (report.replacementOf !== null || report.voidedAt !== null) {
    return '当前报告关系或状态不允许恢复版本化更正。';
  }
  if (!mongoIdPattern.test(report.id) || !isSafeIsoString(report.updatedAt)) {
    return '当前报告缺少安全写入标识或更新时间。';
  }
  return getClinicalReportCorrectionConsistencyWarning(report);
}

export function createClinicalReportCorrectionDraft(
  report: ClinicalReport,
): CorrectionDraft | null {
  if (getClinicalReportCorrectionStartEligibilityWarning(report)) return null;
  return {
    mode: 'start',
    sourceReportId: report.id,
    baseUpdatedAt: report.updatedAt as string,
    correctionId: null,
    correctionReason: '',
    changeSummary: '',
    confirmed: false,
    stale: false,
    usesPersistedContent: false,
  };
}

export function createClinicalReportCorrectionResumeDraft(
  report: ClinicalReport,
): CorrectionDraft | null {
  if (getClinicalReportCorrectionResumeEligibilityWarning(report)) return null;
  const correction = report.correction;
  if (!correction) return null;
  return {
    mode: 'resume',
    sourceReportId: report.id,
    baseUpdatedAt: report.updatedAt as string,
    correctionId: correction.correctionId,
    correctionReason: correction.correctionReason,
    changeSummary: correction.changeSummary,
    confirmed: false,
    stale: false,
    usesPersistedContent: true,
  };
}

export function validateClinicalReportCorrectionDraft(
  draft: CorrectionDraft | null,
): ClinicalReportCorrectionValidation {
  if (!draft) {
    return {
      correctionReason: null,
      changeSummary: null,
      confirmation: null,
      valid: false,
    };
  }
  const reasonLength = draft.correctionReason.trim().length;
  const summaryLength = draft.changeSummary.trim().length;
  const correctionReason = reasonLength < clinicalReportCorrectionLimits.correctionReason.min
    ? '更正原因至少需要 3 个字符。'
    : reasonLength > clinicalReportCorrectionLimits.correctionReason.max
      ? '更正原因不能超过 2000 个字符。'
      : null;
  const changeSummary = summaryLength < clinicalReportCorrectionLimits.changeSummary.min
    ? '计划变更摘要至少需要 3 个字符。'
    : summaryLength > clinicalReportCorrectionLimits.changeSummary.max
      ? '计划变更摘要不能超过 4000 个字符。'
      : null;
  const confirmation = draft.confirmed
    ? null
    : '请明确确认版本化更正边界后再继续。';
  return {
    correctionReason,
    changeSummary,
    confirmation,
    valid: !draft.stale && !correctionReason && !changeSummary && !confirmation,
  };
}

export function isClinicalReportCorrectionDirty(
  draft: CorrectionDraft | null,
): boolean {
  return Boolean(
    draft &&
      draft.mode === 'start' &&
      !draft.usesPersistedContent &&
      (draft.correctionReason.trim() || draft.changeSummary.trim()),
  );
}

export function buildCreateClinicalReportCorrectionRequest(
  draft: CorrectionDraft,
): CreateClinicalReportCorrectionRequest {
  return {
    confirm: true,
    correctionReason: draft.correctionReason.trim(),
    changeSummary: draft.changeSummary.trim(),
    expectedUpdatedAt: draft.baseUpdatedAt,
  };
}

export function clinicalReportCorrectionDraftMatchesReport(
  draft: CorrectionDraft,
  report: ClinicalReport,
): boolean {
  return (
    draft.sourceReportId === report.id &&
    draft.baseUpdatedAt === report.updatedAt &&
    (draft.mode === 'start'
      ? report.correction === null && draft.correctionId === null
      : report.correction?.state === 'in_progress' &&
        draft.correctionId === report.correction.correctionId)
  );
}

export function continueClinicalReportCorrectionWithLatest(
  draft: CorrectionDraft,
  report: ClinicalReport,
): CorrectionDraft | null {
  if (draft.mode !== 'start' || getClinicalReportCorrectionStartEligibilityWarning(report)) {
    return null;
  }
  return {
    ...draft,
    sourceReportId: report.id,
    baseUpdatedAt: report.updatedAt as string,
    correctionId: null,
    confirmed: false,
    stale: false,
  };
}
