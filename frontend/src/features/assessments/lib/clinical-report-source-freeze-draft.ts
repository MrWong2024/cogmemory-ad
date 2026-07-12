import {
  getClinicalReportFinalityWarning,
  getClinicalReportLockConsistencyWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
import type {
  ClinicalReport,
  ClinicalReportSourceFreezeResourceCounts,
  ClinicalReportSourceFreezeSummary,
  FreezeClinicalReportSourcesRequest,
} from '@/src/features/assessments/types/clinical-report';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

export const clinicalReportSourceFreezeLimits = {
  freezeNote: { min: 3, max: 2000 },
} as const;

export type ClinicalReportSourceFreezeDraft = {
  mode: 'start' | 'resume';
  reportId: string;
  baseUpdatedAt: string;
  freezeId: string | null;
  freezeNote: string;
  confirmed: boolean;
  stale: boolean;
  usesPersistedNote: boolean;
};

export type ClinicalReportSourceFreezeValidation = {
  valid: boolean;
  message: string | null;
};

const mongoIdPattern = /^[a-f\d]{24}$/;
const firstStartVisitStatuses = new Set<AssessmentVisitStatus>([
  'draft',
  'in_progress',
  'completed',
]);
const countKeys = [
  'scaleInstanceCount',
  'itemResponseCount',
  'scoreResultCount',
  'cognitiveDomainResultCount',
  'mediaEvidenceCount',
  'totalSourceCount',
] as const;
const sourceCountKeys = countKeys.slice(0, 5);

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeText(value: string): string {
  return value.trim();
}

function isSafeWriteIdentity(report: ClinicalReport): report is ClinicalReport & {
  updatedAt: string;
} {
  return (
    mongoIdPattern.test(normalizeId(report.id)) &&
    typeof report.updatedAt === 'string' &&
    report.updatedAt.trim().length > 0
  );
}

function isSafeIsoString(value: string | null): value is string {
  return Boolean(
    value &&
      value.includes('T') &&
      Number.isFinite(Date.parse(value)),
  );
}

function isSafeActor(
  actor: ClinicalReportSourceFreezeSummary['startedBy'] | null,
): boolean {
  return Boolean(
    actor &&
      actor.operatorId?.trim() &&
      actor.operatorName?.trim() &&
      (actor.operatorRole === 'doctor' || actor.operatorRole === 'admin'),
  );
}

export function isSafeClinicalReportSourceFreezeCounts(
  counts: ClinicalReportSourceFreezeResourceCounts | null,
): counts is ClinicalReportSourceFreezeResourceCounts {
  if (!counts) return false;
  if (
    countKeys.some(
      (key) => !Number.isSafeInteger(counts[key]) || counts[key] < 0,
    )
  ) {
    return false;
  }
  return (
    counts.totalSourceCount ===
    sourceCountKeys.reduce((total, key) => total + counts[key], 0)
  );
}

function sameCounts(
  left: ClinicalReportSourceFreezeResourceCounts,
  right: ClinicalReportSourceFreezeResourceCounts,
): boolean {
  return countKeys.every((key) => left[key] === right[key]);
}

function countsCompose(
  expected: ClinicalReportSourceFreezeResourceCounts,
  newlyFrozen: ClinicalReportSourceFreezeResourceCounts,
  previouslyFrozen: ClinicalReportSourceFreezeResourceCounts,
): boolean {
  return countKeys.every(
    (key) => newlyFrozen[key] + previouslyFrozen[key] === expected[key],
  );
}

export function getClinicalReportSourceFreezeConsistencyWarning(
  sourceFreeze: ClinicalReportSourceFreezeSummary | null,
): string | null {
  if (!sourceFreeze) return null;
  if (!sourceFreeze.freezeId.trim()) {
    return '来源冻结安全摘要缺少 freezeId。';
  }
  if (
    sourceFreeze.state !== 'in_progress' &&
    sourceFreeze.state !== 'completed'
  ) {
    return '来源冻结安全摘要包含未知状态。';
  }
  if (
    !isSafeIsoString(sourceFreeze.startedAt) ||
    !isSafeIsoString(sourceFreeze.sourceLockedAt)
  ) {
    return '来源冻结安全摘要中的开始时间或来源锁定时间无效。';
  }
  if (!isSafeActor(sourceFreeze.startedBy)) {
    return '来源冻结安全摘要中的发起人信息不完整。';
  }
  const noteLength = normalizeText(sourceFreeze.freezeNote).length;
  if (
    noteLength < clinicalReportSourceFreezeLimits.freezeNote.min ||
    noteLength > clinicalReportSourceFreezeLimits.freezeNote.max
  ) {
    return '来源冻结安全摘要中的首次说明不完整。';
  }
  if (
    !isSafeClinicalReportSourceFreezeCounts(sourceFreeze.expectedCounts) ||
    !isSafeClinicalReportSourceFreezeCounts(
      sourceFreeze.previouslyFrozenCounts,
    )
  ) {
    return '来源冻结安全摘要中的预期或此前冻结计数不完整或不一致。';
  }
  if (sourceFreeze.state === 'in_progress') {
    if (
      sourceFreeze.completedCounts !== null ||
      sourceFreeze.newlyFrozenCounts !== null ||
      sourceFreeze.completedAt !== null ||
      sourceFreeze.completedBy !== null
    ) {
      return '冻结未完成状态包含不应存在的完成字段。';
    }
    return null;
  }
  if (
    !isSafeClinicalReportSourceFreezeCounts(sourceFreeze.completedCounts) ||
    !isSafeClinicalReportSourceFreezeCounts(sourceFreeze.newlyFrozenCounts) ||
    !isSafeIsoString(sourceFreeze.completedAt) ||
    !isSafeActor(sourceFreeze.completedBy)
  ) {
    return '来源冻结已完成，但完成时间、操作者或完成计数不完整。';
  }
  if (!sameCounts(sourceFreeze.expectedCounts, sourceFreeze.completedCounts)) {
    return '来源冻结的预期计数与完成计数不一致。';
  }
  if (
    !countsCompose(
      sourceFreeze.expectedCounts,
      sourceFreeze.newlyFrozenCounts,
      sourceFreeze.previouslyFrozenCounts,
    )
  ) {
    return '来源冻结的本次新增与此前冻结计数不能组成预期计数。';
  }
  return null;
}

export function isSafeClinicalReportSourceFreeze(
  sourceFreeze: ClinicalReportSourceFreezeSummary | null,
): sourceFreeze is ClinicalReportSourceFreezeSummary {
  return (
    sourceFreeze !== null &&
    getClinicalReportSourceFreezeConsistencyWarning(sourceFreeze) === null
  );
}

export function isCompletedClinicalReportSourceFreeze(
  sourceFreeze: ClinicalReportSourceFreezeSummary | null,
): boolean {
  return (
    isSafeClinicalReportSourceFreeze(sourceFreeze) &&
    sourceFreeze.state === 'completed'
  );
}

export function getClinicalReportSourceFreezeStartEligibilityWarning(
  report: ClinicalReport,
  visitStatus: AssessmentVisitStatus | null,
): string | null {
  if (report.reportType !== 'cognitive_assessment' || report.reportVersion !== 1) {
    return '当前仅支持 cognitive_assessment version 1 报告来源冻结。';
  }
  if (report.status !== 'confirmed') return '只有已确认报告可以冻结来源。';
  if (report.source !== 'mixed') return '当前报告来源状态不满足来源冻结要求。';
  if (report.qualityStatus !== 'passed') {
    return '报告确认流程质量标记未通过，不能冻结来源。';
  }
  if (!report.isFinal) return '服务端尚未将当前报告标记为最终。';
  if (getClinicalReportFinalityWarning(report.status, report.isFinal)) {
    return '报告状态与最终性标记不一致，当前不能安全冻结来源。';
  }
  if (!report.lockedAt || !report.lock) return '请先完成报告自身不可逆锁定。';
  const lockWarning = getClinicalReportLockConsistencyWarning(report);
  if (lockWarning) return lockWarning;
  if (!report.lock.lockId?.trim()) {
    return '当前报告缺少受控锁定技术追溯号，不能安全冻结来源。';
  }
  if (report.archivedAt !== null || report.voidedAt !== null) {
    return '已归档或已作废报告不开放首次来源冻结。';
  }
  if (report.sourceFreeze !== null) {
    return report.sourceFreeze.state === 'in_progress'
      ? '服务端已存在来源冻结流程，请进入明确恢复操作。'
      : '报告来源链已经冻结完成。';
  }
  if (!visitStatus || !firstStartVisitStatuses.has(visitStatus)) {
    return '当前访视状态不允许首次发起来源冻结。';
  }
  if (!isSafeWriteIdentity(report)) {
    return '当前报告缺少安全的 updatedAt 并发基线。';
  }
  return null;
}

export function getClinicalReportSourceFreezeResumeEligibilityWarning(
  report: ClinicalReport,
): string | null {
  if (!isSafeWriteIdentity(report)) {
    return '当前报告缺少安全的 updatedAt 并发基线。';
  }
  if (!report.sourceFreeze || report.sourceFreeze.state !== 'in_progress') {
    return report.sourceFreeze?.state === 'completed'
      ? '报告来源链已经冻结完成。'
      : '当前没有可恢复的来源冻结流程。';
  }
  const warning = getClinicalReportSourceFreezeConsistencyWarning(
    report.sourceFreeze,
  );
  return warning
    ? '来源冻结安全摘要不完整或不一致；不能继续恢复，请联系管理员。'
    : null;
}

export function createClinicalReportSourceFreezeStartDraft(
  report: ClinicalReport,
): ClinicalReportSourceFreezeDraft | null {
  if (!isSafeWriteIdentity(report) || report.sourceFreeze !== null) return null;
  return {
    mode: 'start',
    reportId: normalizeId(report.id),
    baseUpdatedAt: report.updatedAt,
    freezeId: null,
    freezeNote: '',
    confirmed: false,
    stale: false,
    usesPersistedNote: false,
  };
}

export function createClinicalReportSourceFreezeResumeDraft(
  report: ClinicalReport,
): ClinicalReportSourceFreezeDraft | null {
  if (
    !isSafeWriteIdentity(report) ||
    getClinicalReportSourceFreezeResumeEligibilityWarning(report) !== null ||
    !report.sourceFreeze
  ) {
    return null;
  }
  return {
    mode: 'resume',
    reportId: normalizeId(report.id),
    baseUpdatedAt: report.updatedAt,
    freezeId: report.sourceFreeze.freezeId,
    freezeNote: report.sourceFreeze.freezeNote,
    confirmed: false,
    stale: false,
    usesPersistedNote: true,
  };
}

export function validateClinicalReportSourceFreezeDraft(
  draft: ClinicalReportSourceFreezeDraft,
): ClinicalReportSourceFreezeValidation {
  if (
    !mongoIdPattern.test(normalizeId(draft.reportId)) ||
    !draft.baseUpdatedAt.trim()
  ) {
    return { valid: false, message: '当前报告写入标识无效，请重新加载。' };
  }
  if (draft.stale) {
    return { valid: false, message: '来源冻结草稿已过期，请核对最新报告。' };
  }
  if (!draft.confirmed) {
    return { valid: false, message: '请勾选来源冻结确认。' };
  }
  const noteLength = normalizeText(draft.freezeNote).length;
  if (
    noteLength < clinicalReportSourceFreezeLimits.freezeNote.min ||
    noteLength > clinicalReportSourceFreezeLimits.freezeNote.max
  ) {
    return { valid: false, message: '来源冻结流程说明需为 3–2000 个字符。' };
  }
  if (draft.mode === 'start') {
    if (draft.usesPersistedNote || draft.freezeId !== null) {
      return { valid: false, message: '首次来源冻结草稿结构无效。' };
    }
  } else if (
    !draft.usesPersistedNote ||
    !draft.freezeId?.trim()
  ) {
    return { valid: false, message: '恢复流程缺少服务端 freezeId 或原始说明。' };
  }
  return { valid: true, message: null };
}

export function isClinicalReportSourceFreezeDirty(
  draft: ClinicalReportSourceFreezeDraft | null,
): boolean {
  return Boolean(
    draft?.mode === 'start' && normalizeText(draft.freezeNote).length > 0,
  );
}

export function clinicalReportSourceFreezeDraftMatchesReport(
  draft: ClinicalReportSourceFreezeDraft,
  report: ClinicalReport,
): boolean {
  if (
    !isSafeWriteIdentity(report) ||
    draft.reportId !== normalizeId(report.id) ||
    draft.baseUpdatedAt !== report.updatedAt
  ) {
    return false;
  }
  if (draft.mode === 'start') return report.sourceFreeze === null;
  return Boolean(
    report.sourceFreeze?.state === 'in_progress' &&
      report.sourceFreeze.freezeId === draft.freezeId &&
      report.sourceFreeze.freezeNote === draft.freezeNote &&
      getClinicalReportSourceFreezeConsistencyWarning(report.sourceFreeze) ===
        null,
  );
}

export function buildFreezeClinicalReportSourcesRequest(
  draft: ClinicalReportSourceFreezeDraft,
): FreezeClinicalReportSourcesRequest {
  return {
    confirm: true,
    freezeNote: normalizeText(draft.freezeNote),
    expectedUpdatedAt: draft.baseUpdatedAt,
  };
}

export function continueClinicalReportSourceFreezeDraftWithLatest(
  draft: ClinicalReportSourceFreezeDraft,
  report: ClinicalReport,
): ClinicalReportSourceFreezeDraft | null {
  if (!isSafeWriteIdentity(report)) return null;
  if (draft.mode === 'start') {
    if (report.sourceFreeze !== null) return null;
    return {
      ...draft,
      reportId: normalizeId(report.id),
      baseUpdatedAt: report.updatedAt,
      confirmed: false,
      stale: false,
    };
  }
  const next = createClinicalReportSourceFreezeResumeDraft(report);
  if (!next || next.freezeId !== draft.freezeId) return null;
  return next;
}
