import { useCallback, useEffect, useMemo } from 'react';

import { archiveClinicalReport } from '@/src/features/assessments/api/clinical-report-api';
import {
  shouldProhibitClinicalReportWrite,
  shouldRefreshClinicalReportAfterError,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import type {
  ClinicalReportWorkflowCoordinator,
  UseClinicalReportWorkflowOptions,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import {
  buildArchiveClinicalReportRequest,
  clinicalReportArchiveDraftMatchesReport,
  continueClinicalReportArchiveDraftWithLatest,
  createClinicalReportArchiveDraft,
  getClinicalReportArchiveConsistencyWarning,
  getClinicalReportArchiveEligibilityWarning,
  isClinicalReportArchiveDirty,
  isClinicalReportArchivable,
  validateClinicalReportArchiveDraft,
} from '@/src/features/assessments/lib/clinical-report-archive-draft';

type ArchiveActionOptions = Pick<
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

export function useClinicalReportArchiveAction({
  patientId,
  visitId,
  report,
  reportWriteBlocked,
  currentUserRoles,
  coordinator,
  hasLocalDraft,
}: ArchiveActionOptions) {
  const { state, setArchiveDraft, setArchiveError } = coordinator;
  const archiveDraft = state.archive.draft;
  const roleCanArchive = useMemo(
    () =>
      currentUserRoles.some((role) => role === 'doctor' || role === 'admin'),
    [currentUserRoles],
  );
  const archiveDirty = isClinicalReportArchiveDirty(archiveDraft);
  const archiveValidation = archiveDraft
    ? validateClinicalReportArchiveDraft(archiveDraft, report)
    : { valid: false, message: null };
  const archiveConsistencyWarning = report
    ? getClinicalReportArchiveConsistencyWarning(report)
    : null;
  const archiveVersionMatches = Boolean(
    archiveDraft &&
      report &&
      clinicalReportArchiveDraftMatchesReport(archiveDraft, report),
  );
  const canArchive = Boolean(
    report &&
      state.activeMode === 'idle' &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      !hasLocalDraft &&
      roleCanArchive &&
      archiveConsistencyWarning === null &&
      isClinicalReportArchivable(report),
  );
  const canConfirmArchive = Boolean(
    archiveDraft &&
      report &&
      archiveValidation.valid &&
      !archiveDraft.stale &&
      archiveVersionMatches &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      roleCanArchive &&
      archiveConsistencyWarning === null &&
      isClinicalReportArchivable(report),
  );
  const canContinueArchiveWithLatest = Boolean(
    archiveDraft &&
      archiveDraft.stale &&
      report &&
      roleCanArchive &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      archiveConsistencyWarning === null &&
      isClinicalReportArchivable(report),
  );

  const archiveBlockReason = useMemo(() => {
    if (!report) return '请先加载当前临床报告。';
    if (archiveConsistencyWarning) return archiveConsistencyWarning;
    if (report.status === 'archived' || report.status === 'corrected') {
      return '当前报告已存在归档事实，不开放再次归档。';
    }
    if (!roleCanArchive) {
      return report.status === 'confirmed' &&
        report.sourceFreeze?.state === 'completed'
        ? '报告归档需由医生或管理员执行。'
        : '当前账号不具备报告归档操作权限。';
    }
    const eligibilityWarning = getClinicalReportArchiveEligibilityWarning(
      report,
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
    archiveConsistencyWarning,
    hasLocalDraft,
    report,
    reportWriteBlocked,
    roleCanArchive,
    state.activeMode,
    state.writeProhibited,
    state.writingAction,
  ]);

  useEffect(() => {
    if (
      archiveDraft &&
      (!report ||
        !clinicalReportArchiveDraftMatchesReport(archiveDraft, report))
    ) {
      setArchiveDraft((current) =>
        current && !current.stale
          ? { ...current, confirmed: false, stale: true }
          : current,
      );
    }
  }, [archiveDraft, report, setArchiveDraft]);

  const openArchive = useCallback(() => {
    if (!canArchive || !report) return;
    const draft = createClinicalReportArchiveDraft(report);
    if (!draft) return;
    coordinator.activateArchive(draft);
  }, [canArchive, coordinator, report]);

  const updateArchiveNote = useCallback(
    (value: string) => {
      setArchiveDraft((current) =>
        current
          ? { ...current, archiveNote: value, confirmed: false }
          : current,
      );
      setArchiveError(null);
    },
    [setArchiveDraft, setArchiveError],
  );

  const setArchiveConfirmed = useCallback(
    (confirmed: boolean) => {
      setArchiveDraft((current) =>
        current ? { ...current, confirmed } : current,
      );
    },
    [setArchiveDraft],
  );

  const continueArchiveWithLatest = useCallback(() => {
    if (!report || !canContinueArchiveWithLatest) return;
    setArchiveDraft((current) =>
      current
        ? continueClinicalReportArchiveDraftWithLatest(current, report)
        : current,
    );
    setArchiveError(null);
  }, [canContinueArchiveWithLatest, report, setArchiveDraft, setArchiveError]);

  const reloadLatestAfterArchiveUncertainty = useCallback(async () => {
    setArchiveDraft((current) =>
      current ? { ...current, confirmed: false, stale: true } : current,
    );
    await coordinator.refreshLatest();
  }, [coordinator, setArchiveDraft]);

  const confirmArchive = useCallback(async () => {
    if (!archiveDraft || !canConfirmArchive) return;
    await coordinator.execute({
      action: 'archive',
      pendingMessage: '正在归档报告。',
      request: () =>
        archiveClinicalReport(
          patientId,
          visitId,
          archiveDraft.reportId,
          buildArchiveClinicalReportRequest(archiveDraft),
        ),
      onSuccess: (response) => {
        coordinator.applyReportUpdate(response.report);
        coordinator.completeArchive(
          response.archiveReceipt,
          response.archiveReceipt.alreadyArchived
            ? '该报告此前已经归档，本次未重复写入。'
            : '报告已完成归档。',
        );
      },
      onError: async (error) => {
        setArchiveError(error);
        coordinator.setLiveMessage(null);
        if (shouldProhibitClinicalReportWrite('archive', error)) {
          coordinator.prohibitWrites();
        }
        if (
          shouldRefreshClinicalReportAfterError(error) ||
          error.kind === 'service_unavailable' ||
          error.kind === 'unknown'
        ) {
          setArchiveDraft((current) =>
            current
              ? { ...current, confirmed: false, stale: true }
              : current,
          );
        } else {
          setArchiveDraft((current) =>
            current ? { ...current, confirmed: false } : current,
          );
        }
        await coordinator.refreshAfterError(error);
      },
    });
  }, [
    archiveDraft,
    canConfirmArchive,
    coordinator,
    patientId,
    setArchiveDraft,
    setArchiveError,
    visitId,
  ]);

  return {
    archiveDraft,
    archiveDirty,
    archiveValidation,
    archiveError: state.archive.error,
    archiveReceipt: state.archive.receipt,
    roleCanArchive,
    canArchive,
    canConfirmArchive,
    canContinueArchiveWithLatest,
    archiveVersionMatches,
    archiveConsistencyWarning,
    archiveBlockReason,
    openArchive,
    updateArchiveNote,
    setArchiveConfirmed,
    continueArchiveWithLatest,
    reloadLatestAfterArchiveUncertainty,
    confirmArchive,
  };
}
