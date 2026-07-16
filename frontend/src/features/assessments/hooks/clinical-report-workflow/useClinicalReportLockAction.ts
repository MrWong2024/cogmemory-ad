import { useCallback, useEffect, useMemo } from 'react';

import { lockClinicalReport } from '@/src/features/assessments/api/clinical-report-api';
import {
  shouldProhibitClinicalReportWrite,
  shouldRefreshClinicalReportAfterError,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import type {
  ClinicalReportWorkflowCoordinator,
  UseClinicalReportWorkflowOptions,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import {
  getClinicalReportFinalityWarning,
  getClinicalReportLockConsistencyWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
import {
  getClinicalReportLifecycleTarget,
  getClinicalReportLifecycleTargetWarning,
} from '@/src/features/assessments/lib/clinical-report-lifecycle-target';
import {
  buildLockClinicalReportRequest,
  continueClinicalReportLockDraftWithLatest,
  createClinicalReportLockDraft,
  isClinicalReportLockDirty,
  isSafeClinicalReportWriteIdentity,
  validateClinicalReportLockDraft,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

type LockActionOptions = Pick<
  UseClinicalReportWorkflowOptions,
  | 'patientId'
  | 'visitId'
  | 'report'
  | 'visitStatus'
  | 'reportWriteBlocked'
  | 'currentUserRoles'
> & {
  coordinator: ClinicalReportWorkflowCoordinator;
  hasLocalDraft: boolean;
};

const lockableVisitStatuses = new Set<AssessmentVisitStatus>([
  'draft',
  'in_progress',
  'completed',
]);

function isLockableReport(
  report: ClinicalReport | null,
  visitStatus: AssessmentVisitStatus | null,
): boolean {
  if (!report) return false;
  const lifecycleTarget = getClinicalReportLifecycleTarget(report);
  return Boolean(
    lifecycleTarget &&
      report.status === 'confirmed' &&
      report.source === 'mixed' &&
      report.qualityStatus === 'passed' &&
      report.isFinal === true &&
      report.confirmation !== null &&
      Boolean(report.confirmation.confirmedAt) &&
      (report.confirmation.confirmedByRole === 'doctor' ||
        report.confirmation.confirmedByRole === 'admin') &&
      report.lockedAt === null &&
      report.lock === null &&
      report.archivedAt === null &&
      report.archive === null &&
      report.voidedAt === null &&
      (lifecycleTarget.kind === 'replacement' ||
        (visitStatus !== null && lockableVisitStatuses.has(visitStatus))) &&
      getClinicalReportFinalityWarning(report.status, report.isFinal) === null &&
      getClinicalReportLockConsistencyWarning(report) === null &&
      isSafeClinicalReportWriteIdentity(report.id, report.updatedAt),
  );
}

export function useClinicalReportLockAction({
  patientId,
  visitId,
  report,
  visitStatus,
  reportWriteBlocked,
  currentUserRoles,
  coordinator,
  hasLocalDraft,
}: LockActionOptions) {
  const { state, setLockDraft, setLockError } = coordinator;
  const lockDraft = state.lock.draft;
  const roleCanLock = useMemo(
    () =>
      currentUserRoles.some((role) => role === 'doctor' || role === 'admin'),
    [currentUserRoles],
  );
  const lockDirty = isClinicalReportLockDirty(lockDraft);
  const lockValidation = lockDraft
    ? validateClinicalReportLockDraft(lockDraft)
    : { valid: false, message: null };
  const lockVersionMatches = Boolean(
    lockDraft &&
      report &&
      lockDraft.reportId === report.id.trim().toLowerCase() &&
      lockDraft.baseUpdatedAt === report.updatedAt &&
      report.status === 'confirmed' &&
      report.lockedAt === null,
  );
  const canLock =
    state.activeMode === 'idle' &&
    state.writingAction === null &&
    !reportWriteBlocked &&
    !state.writeProhibited &&
    !hasLocalDraft &&
    roleCanLock &&
    isLockableReport(report, visitStatus);
  const canConfirmLock = Boolean(
    lockDraft &&
      lockValidation.valid &&
      !lockDraft.stale &&
      lockVersionMatches &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      roleCanLock &&
      isLockableReport(report, visitStatus),
  );
  const canContinueLockWithLatest = Boolean(
    lockDraft &&
      lockDraft.stale &&
      roleCanLock &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      isLockableReport(report, visitStatus),
  );

  const lockBlockReason = useMemo(() => {
    if (!report) return '请先加载当前临床报告。';
    if (!roleCanLock) return '报告锁定需由医生或管理员执行。';
    if (report.lockedAt !== null) {
      return '当前报告已经锁定，不能重复开放锁定入口。';
    }
    const consistencyWarning = getClinicalReportLockConsistencyWarning(report);
    if (consistencyWarning) return consistencyWarning;
    if (getClinicalReportFinalityWarning(report.status, report.isFinal)) {
      return '报告状态与最终性标记不一致，当前不能安全锁定。';
    }
    const lifecycleTarget = getClinicalReportLifecycleTarget(report);
    const lifecycleWarning = getClinicalReportLifecycleTargetWarning(report);
    if (!lifecycleTarget) return lifecycleWarning;
    if (report.status !== 'confirmed') return '只有已确认报告可以执行锁定。';
    if (report.source !== 'mixed') return '当前报告来源状态不满足锁定要求。';
    if (report.qualityStatus !== 'passed') {
      return '报告流程质量标记未通过，不能锁定。';
    }
    if (!report.isFinal) return '服务端尚未将当前报告标记为最终，不能锁定。';
    if (
      !report.confirmation?.confirmedAt ||
      (report.confirmation.confirmedByRole !== 'doctor' &&
        report.confirmation.confirmedByRole !== 'admin')
    ) {
      return '当前报告缺少完整的医生或管理员确认摘要。';
    }
    if (report.lock !== null) return '锁定字段不一致，当前不能继续写入。';
    if (report.archivedAt !== null || report.voidedAt !== null) {
      return '已归档或已作废报告不开放首次锁定。';
    }
    if (
      lifecycleTarget.kind === 'version_one' &&
      (!visitStatus || !lockableVisitStatuses.has(visitStatus))
    ) {
      return '当前访视状态不允许首次锁定报告。';
    }
    if (!isSafeClinicalReportWriteIdentity(report.id, report.updatedAt)) {
      return '当前报告缺少安全的 updatedAt 并发基线。';
    }
    if (reportWriteBlocked) return '当前存在其他访视或报告写操作，请等待完成。';
    if (state.writeProhibited) return '报告审计结构当前禁止继续安全写入。';
    if (state.activeMode !== 'idle' || hasLocalDraft) {
      return '请先保存或放弃当前报告本地草稿。';
    }
    if (state.writingAction !== null) return '当前正在执行报告写操作。';
    return null;
  }, [
    hasLocalDraft,
    report,
    reportWriteBlocked,
    roleCanLock,
    state.activeMode,
    state.writeProhibited,
    state.writingAction,
    visitStatus,
  ]);

  useEffect(() => {
    if (
      lockDraft &&
      (!report ||
        lockDraft.reportId !== report.id.trim().toLowerCase() ||
        lockDraft.baseUpdatedAt !== report.updatedAt ||
        report.lockedAt !== null ||
        report.lock !== null ||
        report.status !== 'confirmed' ||
        report.isFinal !== true ||
        getClinicalReportLockConsistencyWarning(report) !== null)
    ) {
      setLockDraft((current) =>
        current && !current.stale
          ? { ...current, confirmed: false, stale: true }
          : current,
      );
    }
  }, [lockDraft, report, setLockDraft]);

  const openLock = useCallback(() => {
    if (!canLock || !report) return;
    const draft = createClinicalReportLockDraft(report);
    if (!draft) return;
    coordinator.activateLock(draft);
  }, [canLock, coordinator, report]);

  const updateLockNote = useCallback(
    (value: string) => {
      setLockDraft((current) =>
        current ? { ...current, lockNote: value, confirmed: false } : current,
      );
      setLockError(null);
    },
    [setLockDraft, setLockError],
  );

  const setLockConfirmed = useCallback(
    (confirmed: boolean) => {
      setLockDraft((current) =>
        current ? { ...current, confirmed } : current,
      );
    },
    [setLockDraft],
  );

  const continueLockWithLatest = useCallback(() => {
    if (!report || !canContinueLockWithLatest) return;
    setLockDraft((current) =>
      current
        ? continueClinicalReportLockDraftWithLatest(current, report)
        : current,
    );
    setLockError(null);
  }, [canContinueLockWithLatest, report, setLockDraft, setLockError]);

  const confirmLock = useCallback(async () => {
    if (!lockDraft || !canConfirmLock) return;
    await coordinator.execute({
      action: 'lock',
      pendingMessage: '正在不可逆锁定报告。',
      request: () =>
        lockClinicalReport(
          patientId,
          visitId,
          lockDraft.reportId,
          buildLockClinicalReportRequest(lockDraft),
        ),
      onSuccess: (response) => {
        coordinator.applyReportUpdate(response.report);
        coordinator.completeLock(
          response.lockReceipt,
          response.lockReceipt.alreadyLocked
            ? '该报告此前已经锁定，本次未重复写入。'
            : '报告已确认并完成不可逆锁定。',
        );
      },
      onError: async (error) => {
        setLockError(error);
        coordinator.setLiveMessage(null);
        if (shouldProhibitClinicalReportWrite('lock', error)) {
          coordinator.prohibitWrites();
        }
        if (shouldRefreshClinicalReportAfterError(error)) {
          setLockDraft((current) =>
            current
              ? { ...current, confirmed: false, stale: true }
              : current,
          );
        }
        await coordinator.refreshAfterError(error);
      },
    });
  }, [
    canConfirmLock,
    coordinator,
    lockDraft,
    patientId,
    setLockDraft,
    setLockError,
    visitId,
  ]);

  return {
    lockDraft,
    lockDirty,
    lockValidation,
    lockError: state.lock.error,
    lockReceipt: state.lock.receipt,
    roleCanLock,
    canLock,
    canConfirmLock,
    canContinueLockWithLatest,
    lockVersionMatches,
    lockBlockReason,
    openLock,
    updateLockNote,
    setLockConfirmed,
    continueLockWithLatest,
    confirmLock,
  };
}
