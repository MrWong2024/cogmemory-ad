import {
  getClinicalReportFinalityWarning,
  getClinicalReportLockConsistencyWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
import {
  getClinicalReportSourceFreezeConsistencyWarning,
  isCompletedClinicalReportSourceFreeze,
} from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import { getClinicalReportLifecycleTargetWarning } from '@/src/features/assessments/lib/clinical-report-lifecycle-target';
import type {
  ArchiveClinicalReportRequest,
  ClinicalReport,
  ClinicalReportArchiveSummary,
  ClinicalReportWorkflowActor,
} from '@/src/features/assessments/types/clinical-report';

export const clinicalReportArchiveLimits = {
  archiveNote: { min: 3, max: 2000 },
} as const;

export type ClinicalReportArchiveDraft = {
  reportId: string;
  baseUpdatedAt: string;
  baseStatus: 'confirmed';
  baseLockedAt: string;
  baseLockId: string;
  baseSourceFreezeId: string;
  baseSourceFreezeCompletedAt: string;
  baseArchivedAt: null;
  archiveNote: string;
  confirmed: boolean;
  stale: boolean;
};

export type ClinicalReportArchiveValidation = {
  valid: boolean;
  message: string | null;
};

const mongoIdPattern = /^[a-f\d]{24}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const archivedStatuses = new Set(['archived', 'corrected']);

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeText(value: string): string {
  return value.trim();
}

function isSafeIsoString(value: string | null | undefined): value is string {
  return Boolean(
    value && value.includes('T') && Number.isFinite(Date.parse(value)),
  );
}

function isSafeArchiveActor(actor: ClinicalReportWorkflowActor): boolean {
  return Boolean(
    actor.operatorId &&
      mongoIdPattern.test(normalizeId(actor.operatorId)) &&
      actor.operatorName?.trim() &&
      (actor.operatorRole === 'doctor' || actor.operatorRole === 'admin'),
  );
}

function isSafeHistoricalArchive(
  archive: ClinicalReportArchiveSummary,
): boolean {
  return (
    archive.archiveId === null &&
    archive.sourceFreezeId === null &&
    archive.sourceFreezeCompletedAt === null &&
    (archive.archivedBy.operatorRole === 'unknown' ||
      !archive.archivedBy.operatorName?.trim())
  );
}

export function getClinicalReportArchiveConsistencyWarning(
  report: ClinicalReport,
): string | null {
  const statusIsArchived = archivedStatuses.has(report.status);

  if (!statusIsArchived) {
    if (report.archivedAt !== null || report.archive !== null) {
      return '报告状态与归档时间或安全归档摘要不一致；当前不能归档或继续其他写操作，请联系管理员。';
    }
    return null;
  }

  if (!isSafeIsoString(report.archivedAt)) {
    return '报告状态为 archived / corrected，但顶层 archivedAt 缺失或无效；系统不会自行补齐归档时间。';
  }
  if (report.archive === null) {
    return '报告已存在归档事实，但当前安全响应未提供归档审计摘要；系统不会猜测归档人、说明或冻结锚点。';
  }
  if (!isSafeIsoString(report.archive.archivedAt)) {
    return '安全归档摘要中的 archivedAt 缺失或无效。';
  }
  if (report.archive.archivedAt !== report.archivedAt) {
    return '顶层 archivedAt 与安全归档摘要时间不一致；系统不会自行选择或覆盖时间。';
  }

  if (report.archive.archiveId === null) {
    if (!isSafeHistoricalArchive(report.archive)) {
      return '历史归档摘要包含不一致的操作者或来源冻结锚点；系统不会猜测缺失审计信息。';
    }
    const noteLength = normalizeText(report.archive.archiveNote ?? '').length;
    if (
      noteLength > 0 &&
      (noteLength < clinicalReportArchiveLimits.archiveNote.min ||
        noteLength > clinicalReportArchiveLimits.archiveNote.max)
    ) {
      return '历史归档摘要中的流程说明长度不安全。';
    }
    return null;
  }

  if (!uuidPattern.test(report.archive.archiveId)) {
    return '安全归档摘要中的归档追溯号无效。';
  }
  if (!isSafeArchiveActor(report.archive.archivedBy)) {
    return '安全归档摘要中的归档人信息不完整。';
  }
  const noteLength = normalizeText(report.archive.archiveNote ?? '').length;
  if (
    noteLength < clinicalReportArchiveLimits.archiveNote.min ||
    noteLength > clinicalReportArchiveLimits.archiveNote.max
  ) {
    return '安全归档摘要中的归档流程说明不完整。';
  }
  if (
    !report.archive.sourceFreezeId ||
    !uuidPattern.test(report.archive.sourceFreezeId) ||
    !isSafeIsoString(report.archive.sourceFreezeCompletedAt)
  ) {
    return '安全归档摘要缺少完整的来源冻结锚点。';
  }
  const sourceFreezeWarning = getClinicalReportSourceFreezeConsistencyWarning(
    report.sourceFreeze,
  );
  if (
    sourceFreezeWarning ||
    !isCompletedClinicalReportSourceFreeze(report.sourceFreeze) ||
    report.sourceFreeze?.freezeId !== report.archive.sourceFreezeId ||
    report.sourceFreeze?.completedAt !==
      report.archive.sourceFreezeCompletedAt
  ) {
    return '归档摘要与当前 completed 来源冻结锚点不一致；系统不会猜测哪一份审计信息正确。';
  }
  return null;
}

export function isClinicalReportArchived(report: ClinicalReport): boolean {
  return (
    archivedStatuses.has(report.status) &&
    typeof report.archivedAt === 'string' &&
    report.archivedAt.trim().length > 0
  );
}

export function isSafeClinicalReportArchive(report: ClinicalReport): boolean {
  return (
    isClinicalReportArchived(report) &&
    getClinicalReportArchiveConsistencyWarning(report) === null
  );
}

export function getClinicalReportArchiveEligibilityWarning(
  report: ClinicalReport,
): string | null {
  const lifecycleWarning = getClinicalReportLifecycleTargetWarning(report);
  if (lifecycleWarning) return lifecycleWarning;
  const archiveWarning = getClinicalReportArchiveConsistencyWarning(report);
  if (archiveWarning) return archiveWarning;
  if (report.status !== 'confirmed') return '只有已确认报告可以归档。';
  if (report.source !== 'mixed') return '当前报告来源状态不满足归档要求。';
  if (report.qualityStatus !== 'passed') {
    return '报告确认流程质量标记未通过，不能归档。';
  }
  if (!report.isFinal) return '服务端尚未将当前报告标记为最终。';
  if (getClinicalReportFinalityWarning(report.status, report.isFinal)) {
    return '报告状态与最终性标记不一致，当前不能安全归档。';
  }
  if (
    !report.confirmation?.confirmedAt ||
    !isSafeIsoString(report.confirmation.confirmedAt) ||
    !report.confirmation.confirmationId?.trim() ||
    !report.confirmation.confirmedByName?.trim() ||
    (report.confirmation.confirmedByRole !== 'doctor' &&
      report.confirmation.confirmedByRole !== 'admin') ||
    normalizeText(report.confirmation.confirmationNote ?? '').length < 3 ||
    normalizeText(report.confirmation.confirmationNote ?? '').length > 2000
  ) {
    return '当前报告缺少完整的医生或管理员确认摘要。';
  }
  if (!report.lockedAt || !report.lock) {
    return '请先完成报告自身不可逆锁定。';
  }
  const lockWarning = getClinicalReportLockConsistencyWarning(report);
  if (lockWarning) return lockWarning;
  if (
    !isSafeIsoString(report.lockedAt) ||
    !report.lock.lockId ||
    !uuidPattern.test(report.lock.lockId) ||
    !report.lock.lockedBy ||
    !isSafeArchiveActor(report.lock.lockedBy) ||
    normalizeText(report.lock.lockNote ?? '').length < 3 ||
    normalizeText(report.lock.lockNote ?? '').length > 2000
  ) {
    return '当前报告缺少完整一致的受控锁定摘要。';
  }
  const sourceFreezeWarning = getClinicalReportSourceFreezeConsistencyWarning(
    report.sourceFreeze,
  );
  if (sourceFreezeWarning) return sourceFreezeWarning;
  if (!isCompletedClinicalReportSourceFreeze(report.sourceFreeze)) {
    return report.sourceFreeze?.state === 'in_progress'
      ? '报告来源冻结尚未完成，不能归档。'
      : '请先完成报告来源链冻结。';
  }
  if (!report.sourceFreeze || !uuidPattern.test(report.sourceFreeze.freezeId)) {
    return '当前来源冻结摘要缺少安全的冻结锚点。';
  }
  if (report.archivedAt !== null || report.archive !== null) {
    return '当前报告已存在归档事实或归档摘要，不开放首次归档。';
  }
  if (report.voidedAt !== null) return '已作废报告不开放归档。';
  if (
    !mongoIdPattern.test(normalizeId(report.id)) ||
    !isSafeIsoString(report.updatedAt)
  ) {
    return '当前报告缺少安全的 updatedAt 并发基线。';
  }
  return null;
}

export function isClinicalReportArchivable(report: ClinicalReport): boolean {
  return getClinicalReportArchiveEligibilityWarning(report) === null;
}

export function createClinicalReportArchiveDraft(
  report: ClinicalReport,
): ClinicalReportArchiveDraft | null {
  if (
    !isClinicalReportArchivable(report) ||
    !report.updatedAt ||
    !report.lockedAt ||
    !report.lock?.lockId ||
    !report.sourceFreeze?.completedAt
  ) {
    return null;
  }
  return {
    reportId: normalizeId(report.id),
    baseUpdatedAt: report.updatedAt,
    baseStatus: 'confirmed',
    baseLockedAt: report.lockedAt,
    baseLockId: report.lock.lockId,
    baseSourceFreezeId: report.sourceFreeze.freezeId,
    baseSourceFreezeCompletedAt: report.sourceFreeze.completedAt,
    baseArchivedAt: null,
    archiveNote: '',
    confirmed: false,
    stale: false,
  };
}

export function clinicalReportArchiveDraftMatchesReport(
  draft: ClinicalReportArchiveDraft,
  report: ClinicalReport,
): boolean {
  return Boolean(
    isClinicalReportArchivable(report) &&
      report.updatedAt &&
      report.lockedAt &&
      report.lock?.lockId &&
      report.sourceFreeze?.completedAt &&
      draft.reportId === normalizeId(report.id) &&
      draft.baseUpdatedAt === report.updatedAt &&
      draft.baseStatus === report.status &&
      draft.baseLockedAt === report.lockedAt &&
      draft.baseLockId === report.lock.lockId &&
      draft.baseSourceFreezeId === report.sourceFreeze.freezeId &&
      draft.baseSourceFreezeCompletedAt === report.sourceFreeze.completedAt &&
      draft.baseArchivedAt === report.archivedAt
  );
}

export function validateClinicalReportArchiveDraft(
  draft: ClinicalReportArchiveDraft,
  report: ClinicalReport | null,
): ClinicalReportArchiveValidation {
  if (
    !mongoIdPattern.test(normalizeId(draft.reportId)) ||
    !isSafeIsoString(draft.baseUpdatedAt)
  ) {
    return { valid: false, message: '当前报告写入标识无效，请重新加载。' };
  }
  if (draft.stale || !report || !clinicalReportArchiveDraftMatchesReport(draft, report)) {
    return { valid: false, message: '归档草稿已过期，请重新核对最新报告。' };
  }
  if (!draft.confirmed) {
    return { valid: false, message: '请勾选不可撤销归档确认。' };
  }
  const noteLength = normalizeText(draft.archiveNote).length;
  if (
    noteLength < clinicalReportArchiveLimits.archiveNote.min ||
    noteLength > clinicalReportArchiveLimits.archiveNote.max
  ) {
    return { valid: false, message: '归档流程说明需为 3–2000 个字符。' };
  }
  return { valid: true, message: null };
}

export function isClinicalReportArchiveDirty(
  draft: ClinicalReportArchiveDraft | null,
): boolean {
  return normalizeText(draft?.archiveNote ?? '').length > 0;
}

export function buildArchiveClinicalReportRequest(
  draft: ClinicalReportArchiveDraft,
): ArchiveClinicalReportRequest {
  return {
    confirm: true,
    archiveNote: normalizeText(draft.archiveNote),
    expectedUpdatedAt: draft.baseUpdatedAt,
  };
}

export function continueClinicalReportArchiveDraftWithLatest(
  draft: ClinicalReportArchiveDraft,
  report: ClinicalReport,
): ClinicalReportArchiveDraft | null {
  const next = createClinicalReportArchiveDraft(report);
  if (!next) return null;
  return {
    ...next,
    archiveNote: draft.archiveNote,
  };
}
