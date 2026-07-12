import { useCallback, useEffect, useMemo } from 'react';

import { freezeClinicalReportSources } from '@/src/features/assessments/api/clinical-report-api';
import {
  shouldProhibitClinicalReportWrite,
  shouldRefreshClinicalReportAfterError,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import type {
  ClinicalReportWorkflowCoordinator,
  UseClinicalReportWorkflowOptions,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import {
  buildFreezeClinicalReportSourcesRequest,
  clinicalReportSourceFreezeDraftMatchesReport,
  continueClinicalReportSourceFreezeDraftWithLatest,
  createClinicalReportSourceFreezeResumeDraft,
  createClinicalReportSourceFreezeStartDraft,
  getClinicalReportSourceFreezeConsistencyWarning,
  getClinicalReportSourceFreezeResumeEligibilityWarning,
  getClinicalReportSourceFreezeStartEligibilityWarning,
  isClinicalReportSourceFreezeDirty,
  validateClinicalReportSourceFreezeDraft,
} from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';

type SourceFreezeActionOptions = Pick<
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

export function useClinicalReportSourceFreezeAction({
  patientId,
  visitId,
  report,
  visitStatus,
  reportWriteBlocked,
  currentUserRoles,
  coordinator,
  hasLocalDraft,
}: SourceFreezeActionOptions) {
  const { state, setSourceFreezeDraft, setSourceFreezeError } = coordinator;
  const sourceFreezeDraft = state.sourceFreeze.draft;
  const roleCanFreezeSources = useMemo(
    () =>
      currentUserRoles.some((role) => role === 'doctor' || role === 'admin'),
    [currentUserRoles],
  );
  const sourceFreezeDirty = isClinicalReportSourceFreezeDirty(
    sourceFreezeDraft,
  );
  const sourceFreezeValidation = sourceFreezeDraft
    ? validateClinicalReportSourceFreezeDraft(sourceFreezeDraft)
    : { valid: false, message: null };
  const sourceFreezeConsistencyWarning = report
    ? getClinicalReportSourceFreezeConsistencyWarning(report.sourceFreeze)
    : null;
  const sourceFreezeVersionMatches = Boolean(
    sourceFreezeDraft &&
      report &&
      clinicalReportSourceFreezeDraftMatchesReport(sourceFreezeDraft, report),
  );
  const canStartSourceFreeze = Boolean(
    report &&
      state.activeMode === 'idle' &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      !hasLocalDraft &&
      roleCanFreezeSources &&
      sourceFreezeConsistencyWarning === null &&
      getClinicalReportSourceFreezeStartEligibilityWarning(
        report,
        visitStatus,
      ) === null,
  );
  const canResumeSourceFreeze = Boolean(
    report &&
      state.activeMode === 'idle' &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      !hasLocalDraft &&
      roleCanFreezeSources &&
      sourceFreezeConsistencyWarning === null &&
      getClinicalReportSourceFreezeResumeEligibilityWarning(report) === null,
  );
  const canConfirmSourceFreeze = Boolean(
    sourceFreezeDraft &&
      report &&
      sourceFreezeValidation.valid &&
      !sourceFreezeDraft.stale &&
      sourceFreezeVersionMatches &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      roleCanFreezeSources &&
      sourceFreezeConsistencyWarning === null &&
      (sourceFreezeDraft.mode === 'start'
        ? getClinicalReportSourceFreezeStartEligibilityWarning(
            report,
            visitStatus,
          ) === null
        : getClinicalReportSourceFreezeResumeEligibilityWarning(report) ===
          null),
  );
  const canContinueSourceFreezeWithLatest = Boolean(
    sourceFreezeDraft &&
      sourceFreezeDraft.stale &&
      report &&
      roleCanFreezeSources &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      sourceFreezeConsistencyWarning === null &&
      (sourceFreezeDraft.mode === 'start'
        ? report.sourceFreeze === null &&
          getClinicalReportSourceFreezeStartEligibilityWarning(
            report,
            visitStatus,
          ) === null
        : report.sourceFreeze?.state === 'in_progress' &&
          report.sourceFreeze.freezeId === sourceFreezeDraft.freezeId &&
          getClinicalReportSourceFreezeResumeEligibilityWarning(report) ===
            null),
  );
  const canDiscardLocalSourceFreezeAndResume = Boolean(
    sourceFreezeDraft?.mode === 'start' &&
      sourceFreezeDraft.stale &&
      report?.sourceFreeze?.state === 'in_progress' &&
      roleCanFreezeSources &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      sourceFreezeConsistencyWarning === null &&
      getClinicalReportSourceFreezeResumeEligibilityWarning(report) === null,
  );

  const sourceFreezeBlockReason = useMemo(() => {
    if (!report) return '请先加载当前临床报告。';
    if (!roleCanFreezeSources) {
      return report.sourceFreeze?.state === 'in_progress'
        ? '来源冻结尚未完成，等待医生或管理员明确继续。'
        : '来源冻结需由医生或管理员执行。';
    }
    if (sourceFreezeConsistencyWarning) {
      return '来源冻结安全摘要不完整或不一致；不能继续写入，请联系管理员。';
    }
    if (report.sourceFreeze?.state === 'completed') {
      return '报告来源链冻结已经完成，不开放再次冻结或恢复入口。';
    }
    const eligibilityWarning = report.sourceFreeze
      ? getClinicalReportSourceFreezeResumeEligibilityWarning(report)
      : getClinicalReportSourceFreezeStartEligibilityWarning(
          report,
          visitStatus,
        );
    if (eligibilityWarning) return eligibilityWarning;
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
    roleCanFreezeSources,
    sourceFreezeConsistencyWarning,
    state.activeMode,
    state.writeProhibited,
    state.writingAction,
    visitStatus,
  ]);

  useEffect(() => {
    if (
      sourceFreezeDraft &&
      (!report ||
        !clinicalReportSourceFreezeDraftMatchesReport(
          sourceFreezeDraft,
          report,
        ))
    ) {
      setSourceFreezeDraft((current) =>
        current && !current.stale
          ? { ...current, confirmed: false, stale: true }
          : current,
      );
    }
  }, [report, setSourceFreezeDraft, sourceFreezeDraft]);

  const openSourceFreeze = useCallback(() => {
    if (!canStartSourceFreeze || !report) return;
    const draft = createClinicalReportSourceFreezeStartDraft(report);
    if (!draft) return;
    coordinator.activateSourceFreeze(draft);
  }, [canStartSourceFreeze, coordinator, report]);

  const openSourceFreezeResume = useCallback(() => {
    if (!canResumeSourceFreeze || !report) return;
    const draft = createClinicalReportSourceFreezeResumeDraft(report);
    if (!draft) return;
    coordinator.activateSourceFreeze(draft);
  }, [canResumeSourceFreeze, coordinator, report]);

  const updateSourceFreezeNote = useCallback(
    (value: string) => {
      setSourceFreezeDraft((current) =>
        current && current.mode === 'start' && !current.usesPersistedNote
          ? { ...current, freezeNote: value, confirmed: false }
          : current,
      );
      setSourceFreezeError(null);
    },
    [setSourceFreezeDraft, setSourceFreezeError],
  );

  const setSourceFreezeConfirmed = useCallback(
    (confirmed: boolean) => {
      setSourceFreezeDraft((current) =>
        current ? { ...current, confirmed } : current,
      );
    },
    [setSourceFreezeDraft],
  );

  const continueSourceFreezeWithLatest = useCallback(() => {
    if (!report || !canContinueSourceFreezeWithLatest) return;
    setSourceFreezeDraft((current) =>
      current
        ? continueClinicalReportSourceFreezeDraftWithLatest(current, report)
        : current,
    );
    setSourceFreezeError(null);
  }, [
    canContinueSourceFreezeWithLatest,
    report,
    setSourceFreezeDraft,
    setSourceFreezeError,
  ]);

  const discardLocalSourceFreezeAndResume = useCallback(() => {
    if (!report || !canDiscardLocalSourceFreezeAndResume) return;
    const draft = createClinicalReportSourceFreezeResumeDraft(report);
    if (!draft) return;
    setSourceFreezeDraft(draft);
    setSourceFreezeError(null);
    coordinator.setLiveMessage(
      '本地未提交说明已放弃；请重新核对服务端原说明并明确确认恢复。',
    );
  }, [
    canDiscardLocalSourceFreezeAndResume,
    coordinator,
    report,
    setSourceFreezeDraft,
    setSourceFreezeError,
  ]);

  const reloadLatestAfterSourceFreezeUncertainty = useCallback(async () => {
    setSourceFreezeDraft((current) =>
      current ? { ...current, confirmed: false, stale: true } : current,
    );
    await coordinator.refreshLatest();
  }, [coordinator, setSourceFreezeDraft]);

  const confirmSourceFreeze = useCallback(async () => {
    if (!sourceFreezeDraft || !canConfirmSourceFreeze) return;
    await coordinator.execute({
      action: 'source_freeze',
      pendingMessage: '正在执行来源链冻结；页面不显示虚假逐项实时进度。',
      request: () =>
        freezeClinicalReportSources(
          patientId,
          visitId,
          sourceFreezeDraft.reportId,
          buildFreezeClinicalReportSourcesRequest(sourceFreezeDraft),
        ),
      onSuccess: (response) => {
        coordinator.applyReportUpdate(response.report);
        coordinator.completeSourceFreeze(
          response.sourceFreezeReceipt,
          response.sourceFreezeReceipt.alreadyFrozen
            ? '该报告的来源链此前已经冻结，本次未重复写入。'
            : response.sourceFreezeReceipt.resumedExisting
              ? '已有来源冻结流程已恢复并完成。'
              : '报告来源链冻结已完成。',
        );
      },
      onError: async (error) => {
        setSourceFreezeError(error);
        coordinator.setLiveMessage(null);
        if (shouldProhibitClinicalReportWrite('source_freeze', error)) {
          coordinator.prohibitWrites();
        }
        if (shouldRefreshClinicalReportAfterError(error)) {
          setSourceFreezeDraft((current) =>
            current
              ? { ...current, confirmed: false, stale: true }
              : current,
          );
        } else {
          setSourceFreezeDraft((current) =>
            current ? { ...current, confirmed: false } : current,
          );
        }
        await coordinator.refreshAfterError(error);
      },
    });
  }, [
    canConfirmSourceFreeze,
    coordinator,
    patientId,
    setSourceFreezeDraft,
    setSourceFreezeError,
    sourceFreezeDraft,
    visitId,
  ]);

  return {
    sourceFreezeDraft,
    sourceFreezeDirty,
    sourceFreezeValidation,
    sourceFreezeError: state.sourceFreeze.error,
    sourceFreezeReceipt: state.sourceFreeze.receipt,
    roleCanFreezeSources,
    canStartSourceFreeze,
    canResumeSourceFreeze,
    canConfirmSourceFreeze,
    canContinueSourceFreezeWithLatest,
    canDiscardLocalSourceFreezeAndResume,
    sourceFreezeVersionMatches,
    sourceFreezeConsistencyWarning,
    sourceFreezeBlockReason,
    openSourceFreeze,
    openSourceFreezeResume,
    updateSourceFreezeNote,
    setSourceFreezeConfirmed,
    continueSourceFreezeWithLatest,
    discardLocalSourceFreezeAndResume,
    reloadLatestAfterSourceFreezeUncertainty,
    confirmSourceFreeze,
  };
}
