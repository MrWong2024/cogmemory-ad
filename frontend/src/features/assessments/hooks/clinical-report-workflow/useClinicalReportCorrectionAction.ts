import { useCallback, useEffect, useMemo } from 'react';

import { createClinicalReportCorrection } from '@/src/features/assessments/api/clinical-report-api';
import {
  shouldProhibitClinicalReportWrite,
  shouldRefreshClinicalReportAfterError,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import type {
  ClinicalReportWorkflowCoordinator,
  UseClinicalReportWorkflowOptions,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import {
  buildCreateClinicalReportCorrectionRequest,
  canCurrentRolesWriteReplacement,
  clinicalReportCorrectionDraftMatchesReport,
  continueClinicalReportCorrectionWithLatest as continueDraftWithLatest,
  createClinicalReportCorrectionDraft,
  createClinicalReportCorrectionResumeDraft,
  getClinicalReportCorrectionConsistencyWarning,
  getClinicalReportCorrectionResumeEligibilityWarning,
  getClinicalReportCorrectionStartEligibilityWarning,
  isClinicalReportCorrectionDirty,
  validateClinicalReportCorrectionDraft,
} from '@/src/features/assessments/lib/clinical-report-correction-draft';

type CorrectionActionOptions = Pick<
  UseClinicalReportWorkflowOptions,
  | 'patientId'
  | 'visitId'
  | 'report'
  | 'reportWriteBlocked'
  | 'currentUserRoles'
> & {
  coordinator: ClinicalReportWorkflowCoordinator;
  hasLocalDraft: boolean;
};

export function useClinicalReportCorrectionAction({
  patientId,
  visitId,
  report,
  reportWriteBlocked,
  currentUserRoles,
  coordinator,
  hasLocalDraft,
}: CorrectionActionOptions) {
  const { state, setCorrectionDraft, setCorrectionError } = coordinator;
  const correctionDraft = state.correction.draft;
  const roleCanCorrect = useMemo(
    () => canCurrentRolesWriteReplacement(currentUserRoles),
    [currentUserRoles],
  );
  const correctionDirty = isClinicalReportCorrectionDirty(correctionDraft);
  const correctionValidation = validateClinicalReportCorrectionDraft(correctionDraft);
  const correctionConsistencyWarning = report
    ? getClinicalReportCorrectionConsistencyWarning(report)
    : null;
  const correctionVersionMatches = Boolean(
    correctionDraft &&
      report &&
      clinicalReportCorrectionDraftMatchesReport(correctionDraft, report),
  );
  const canStartCorrection = Boolean(
    report &&
      state.activeMode === 'idle' &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      !hasLocalDraft &&
      roleCanCorrect &&
      correctionConsistencyWarning === null &&
      getClinicalReportCorrectionStartEligibilityWarning(report) === null,
  );
  const canResumeCorrection = Boolean(
    report &&
      state.activeMode === 'idle' &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      !hasLocalDraft &&
      roleCanCorrect &&
      correctionConsistencyWarning === null &&
      getClinicalReportCorrectionResumeEligibilityWarning(report) === null,
  );
  const canConfirmCorrection = Boolean(
    correctionDraft &&
      report &&
      correctionValidation.valid &&
      !correctionDraft.stale &&
      correctionVersionMatches &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      roleCanCorrect &&
      correctionConsistencyWarning === null &&
      (correctionDraft.mode === 'start'
        ? getClinicalReportCorrectionStartEligibilityWarning(report) === null
        : getClinicalReportCorrectionResumeEligibilityWarning(report) === null),
  );
  const canContinueCorrectionWithLatest = Boolean(
    correctionDraft?.mode === 'start' &&
      correctionDraft.stale &&
      report &&
      roleCanCorrect &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      correctionConsistencyWarning === null &&
      getClinicalReportCorrectionStartEligibilityWarning(report) === null,
  );
  const canDiscardLocalCorrectionAndResume = Boolean(
    correctionDraft?.mode === 'start' &&
      correctionDraft.stale &&
      report?.correction?.state === 'in_progress' &&
      roleCanCorrect &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      correctionConsistencyWarning === null &&
      getClinicalReportCorrectionResumeEligibilityWarning(report) === null,
  );

  const correctionBlockReason = useMemo(() => {
    if (!report) return '请先加载当前临床报告。';
    if (!roleCanCorrect) {
      return report.correction?.state === 'in_progress'
        ? '版本化更正尚未完成，等待医生或管理员明确继续。'
        : '版本化更正需由医生或管理员执行。';
    }
    if (correctionConsistencyWarning) return correctionConsistencyWarning;
    if (report.correction?.state === 'completed' || report.status === 'corrected') {
      return '源报告已由下一线性版本替代，不开放再次发起或恢复入口。';
    }
    if (report.replacementOf !== null) {
      return '当前是替代报告；来源关系仅用于追溯，不能从此处重复发起同一更正。';
    }
    const eligibilityWarning = report.correction?.state === 'in_progress'
      ? getClinicalReportCorrectionResumeEligibilityWarning(report)
      : getClinicalReportCorrectionStartEligibilityWarning(report);
    if (eligibilityWarning) return eligibilityWarning;
    if (reportWriteBlocked) return '当前存在其他访视或报告写操作，请等待完成。';
    if (state.writeProhibited) return '报告审计结构当前禁止继续安全写入。';
    if (state.activeMode !== 'idle' || hasLocalDraft) {
      return '请先保存或放弃当前报告本地草稿。';
    }
    if (state.writingAction !== null) return '当前正在执行报告写操作。';
    return null;
  }, [
    correctionConsistencyWarning,
    hasLocalDraft,
    report,
    reportWriteBlocked,
    roleCanCorrect,
    state.activeMode,
    state.writeProhibited,
    state.writingAction,
  ]);

  useEffect(() => {
    if (
      correctionDraft &&
      (!report || !clinicalReportCorrectionDraftMatchesReport(correctionDraft, report))
    ) {
      setCorrectionDraft((current) =>
        current && !current.stale
          ? { ...current, confirmed: false, stale: true }
          : current,
      );
    }
  }, [correctionDraft, report, setCorrectionDraft]);

  const openCorrection = useCallback(() => {
    if (!canStartCorrection || !report) return;
    const draft = createClinicalReportCorrectionDraft(report);
    if (draft) coordinator.activateCorrection(draft);
  }, [canStartCorrection, coordinator, report]);

  const openCorrectionResume = useCallback(() => {
    if (!canResumeCorrection || !report) return;
    const draft = createClinicalReportCorrectionResumeDraft(report);
    if (draft) coordinator.activateCorrection(draft);
  }, [canResumeCorrection, coordinator, report]);

  const updateCorrectionReason = useCallback(
    (value: string) => {
      setCorrectionDraft((current) =>
        current && current.mode === 'start' && !current.usesPersistedContent
          ? { ...current, correctionReason: value, confirmed: false }
          : current,
      );
      setCorrectionError(null);
    },
    [setCorrectionDraft, setCorrectionError],
  );

  const updateCorrectionChangeSummary = useCallback(
    (value: string) => {
      setCorrectionDraft((current) =>
        current && current.mode === 'start' && !current.usesPersistedContent
          ? { ...current, changeSummary: value, confirmed: false }
          : current,
      );
      setCorrectionError(null);
    },
    [setCorrectionDraft, setCorrectionError],
  );

  const setCorrectionConfirmed = useCallback(
    (confirmed: boolean) => {
      setCorrectionDraft((current) =>
        current ? { ...current, confirmed } : current,
      );
    },
    [setCorrectionDraft],
  );

  const continueCorrectionWithLatest = useCallback(() => {
    if (!report || !canContinueCorrectionWithLatest) return;
    setCorrectionDraft((current) =>
      current ? continueDraftWithLatest(current, report) : current,
    );
    setCorrectionError(null);
  }, [
    canContinueCorrectionWithLatest,
    report,
    setCorrectionDraft,
    setCorrectionError,
  ]);

  const discardLocalCorrectionAndResume = useCallback(() => {
    if (!report || !canDiscardLocalCorrectionAndResume) return;
    const draft = createClinicalReportCorrectionResumeDraft(report);
    if (!draft) return;
    setCorrectionDraft(draft);
    setCorrectionError(null);
    coordinator.setLiveMessage(
      '本地未提交说明已放弃；请核对服务端原始说明并明确确认继续同一更正流程。',
    );
  }, [
    canDiscardLocalCorrectionAndResume,
    coordinator,
    report,
    setCorrectionDraft,
    setCorrectionError,
  ]);

  const reloadLatestAfterCorrectionUncertainty = useCallback(async () => {
    setCorrectionDraft((current) =>
      current ? { ...current, confirmed: false, stale: true } : current,
    );
    await coordinator.refreshLatest();
  }, [coordinator, setCorrectionDraft]);

  const confirmCorrection = useCallback(async () => {
    if (!correctionDraft || !canConfirmCorrection) return;
    await coordinator.execute({
      action: 'correction',
      pendingMessage: '正在创建或恢复版本化更正；系统不会自动重试。',
      request: () =>
        createClinicalReportCorrection(
          patientId,
          visitId,
          correctionDraft.sourceReportId,
          buildCreateClinicalReportCorrectionRequest(correctionDraft),
        ),
      onSuccess: (response) => {
        coordinator.applyReportUpdate(response.replacementReport);
        const receipt = response.correctionReceipt;
        coordinator.completeCorrection(
          receipt,
          response.sourceReport,
          receipt.alreadyCreated
            ? '该替代报告此前已经创建，本次未重复写入。'
            : receipt.resumedExisting
              ? '已有版本化更正流程已恢复并完成。'
              : '版本化更正已创建，已进入替代报告草稿。',
        );
      },
      onError: async (error) => {
        setCorrectionError(error);
        coordinator.setLiveMessage(null);
        if (shouldProhibitClinicalReportWrite('correction', error)) {
          coordinator.prohibitWrites();
        }
        const uncertain = error.kind === 'service_unavailable' || error.kind === 'unknown';
        if (shouldRefreshClinicalReportAfterError(error) || uncertain) {
          setCorrectionDraft((current) =>
            current ? { ...current, confirmed: false, stale: true } : current,
          );
        } else {
          setCorrectionDraft((current) =>
            current ? { ...current, confirmed: false } : current,
          );
        }
        await coordinator.refreshAfterError(error);
      },
    });
  }, [
    canConfirmCorrection,
    coordinator,
    correctionDraft,
    patientId,
    setCorrectionDraft,
    setCorrectionError,
    visitId,
  ]);

  return {
    correctionDraft,
    correctionDirty,
    correctionValidation,
    correctionError: state.correction.error,
    correctionReceipt: state.correction.receipt,
    correctionSourceReport: state.correction.sourceReport,
    roleCanCorrect,
    canStartCorrection,
    canResumeCorrection,
    canConfirmCorrection,
    canContinueCorrectionWithLatest,
    canDiscardLocalCorrectionAndResume,
    correctionVersionMatches,
    correctionConsistencyWarning,
    correctionBlockReason,
    openCorrection,
    openCorrectionResume,
    cancelCorrection: coordinator.cancelCorrection,
    updateCorrectionReason,
    updateCorrectionChangeSummary,
    setCorrectionConfirmed,
    continueCorrectionWithLatest,
    discardLocalCorrectionAndResume,
    reloadLatestAfterCorrectionUncertainty,
    confirmCorrection,
  };
}
