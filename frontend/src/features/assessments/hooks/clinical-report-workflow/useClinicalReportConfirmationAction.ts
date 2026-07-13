import { useCallback, useEffect, useMemo } from 'react';

import { confirmClinicalReport } from '@/src/features/assessments/api/clinical-report-api';
import {
  shouldProhibitClinicalReportWrite,
  shouldRefreshClinicalReportAfterError,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import type {
  ClinicalReportWorkflowCoordinator,
  UseClinicalReportWorkflowOptions,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import {
  buildConfirmClinicalReportRequest,
  createClinicalReportConfirmationDraft,
  isSafeClinicalReportWriteIdentity,
  normalizeClinicalReportText,
  validateClinicalReportConfirmationDraft,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';
import {
  isSafeCorrectionReplacement,
  isVersionOneReport,
} from '@/src/features/assessments/lib/clinical-report-correction-draft';

type ConfirmationActionOptions = Pick<
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

function isConfirmableReport(report: ClinicalReport | null): boolean {
  return Boolean(
    report &&
      report.status === 'pending_confirmation' &&
      (isVersionOneReport(report) || isSafeCorrectionReplacement(report)) &&
      report.submission !== null &&
      report.qualityStatus !== 'failed' &&
      report.lockedAt === null &&
      report.lock === null &&
      report.archivedAt === null &&
      report.archive === null &&
      report.voidedAt === null &&
      isSafeClinicalReportWriteIdentity(report.id, report.updatedAt),
  );
}

export function useClinicalReportConfirmationAction({
  patientId,
  visitId,
  report,
  reportWriteBlocked,
  currentUserRoles,
  coordinator,
  hasLocalDraft,
}: ConfirmationActionOptions) {
  const { state, setConfirmationDraft, setConfirmationError } = coordinator;
  const confirmationDraft = state.confirmation.draft;
  const roleCanConfirm = useMemo(
    () =>
      currentUserRoles.some((role) => role === 'doctor' || role === 'admin'),
    [currentUserRoles],
  );
  const confirmationDirty =
    normalizeClinicalReportText(
      confirmationDraft?.confirmationNote ?? '',
    ).length > 0;
  const confirmationValidation = confirmationDraft
    ? validateClinicalReportConfirmationDraft(confirmationDraft)
    : { valid: false, message: null };
  const confirmationVersionMatches = Boolean(
    confirmationDraft &&
      report &&
      confirmationDraft.reportId === report.id.trim().toLowerCase() &&
      confirmationDraft.baseUpdatedAt === report.updatedAt,
  );
  const canConfirm =
    state.activeMode === 'idle' &&
    state.writingAction === null &&
    !reportWriteBlocked &&
    !state.writeProhibited &&
    !hasLocalDraft &&
    roleCanConfirm &&
    isConfirmableReport(report);
  const canConfirmReport = Boolean(
    confirmationDraft &&
      confirmationValidation.valid &&
      confirmationDraft.confirmed &&
      !confirmationDraft.stale &&
      confirmationVersionMatches &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      roleCanConfirm &&
      isConfirmableReport(report),
  );

  useEffect(() => {
    if (
      confirmationDraft &&
      (!report ||
        confirmationDraft.reportId !== report.id.trim().toLowerCase() ||
        confirmationDraft.baseUpdatedAt !== report.updatedAt)
    ) {
      setConfirmationDraft((current) =>
        current && !current.stale
          ? { ...current, confirmed: false, stale: true }
          : current,
      );
    }
  }, [confirmationDraft, report, setConfirmationDraft]);

  const openConfirm = useCallback(() => {
    if (!canConfirm || !report) return;
    const draft = createClinicalReportConfirmationDraft(report);
    if (!draft) return;
    coordinator.activateConfirmation(draft);
  }, [canConfirm, coordinator, report]);

  const updateConfirmationNote = useCallback(
    (value: string) => {
      setConfirmationDraft((current) =>
        current
          ? { ...current, confirmationNote: value, confirmed: false }
          : current,
      );
      setConfirmationError(null);
    },
    [setConfirmationDraft, setConfirmationError],
  );

  const setConfirmationConfirmed = useCallback(
    (confirmed: boolean) => {
      setConfirmationDraft((current) =>
        current ? { ...current, confirmed } : current,
      );
    },
    [setConfirmationDraft],
  );

  const continueConfirmationFromLatest = useCallback(() => {
    if (
      !report ||
      !roleCanConfirm ||
      !isConfirmableReport(report) ||
      !report.updatedAt
    ) {
      return;
    }
    setConfirmationDraft((current) =>
      current
        ? {
            ...current,
            reportId: report.id.trim().toLowerCase(),
            baseUpdatedAt: report.updatedAt ?? current.baseUpdatedAt,
            confirmed: false,
            stale: false,
          }
        : current,
    );
    setConfirmationError(null);
  }, [report, roleCanConfirm, setConfirmationDraft, setConfirmationError]);

  const confirmReport = useCallback(async () => {
    if (!confirmationDraft || !canConfirmReport) return;
    await coordinator.execute({
      action: 'confirm',
      pendingMessage: '正在完成医生或管理员最终确认。',
      request: () =>
        confirmClinicalReport(
          patientId,
          visitId,
          confirmationDraft.reportId,
          buildConfirmClinicalReportRequest(confirmationDraft),
        ),
      onSuccess: (response) => {
        coordinator.applyReportUpdate(response.report);
        coordinator.completeConfirmation(
          response.confirmationReceipt,
          response.confirmationReceipt.alreadyConfirmed
            ? '该报告此前已经确认，本次未重复写入。'
            : '报告已完成医生或管理员确认，并进入只读状态。',
        );
      },
      onError: async (error) => {
        setConfirmationError(error);
        coordinator.setLiveMessage(null);
        if (shouldProhibitClinicalReportWrite('confirm', error)) {
          coordinator.prohibitWrites();
        }
        if (shouldRefreshClinicalReportAfterError(error)) {
          setConfirmationDraft((current) =>
            current
              ? { ...current, confirmed: false, stale: true }
              : current,
          );
        }
        await coordinator.refreshAfterError(error);
      },
    });
  }, [
    canConfirmReport,
    confirmationDraft,
    coordinator,
    patientId,
    setConfirmationDraft,
    setConfirmationError,
    visitId,
  ]);

  return {
    confirmationDraft,
    confirmationDirty,
    confirmationValidation,
    confirmationError: state.confirmation.error,
    confirmationReceipt: state.confirmation.receipt,
    roleCanConfirm,
    canConfirm,
    canConfirmReport,
    openConfirm,
    updateConfirmationNote,
    setConfirmationConfirmed,
    continueConfirmationFromLatest,
    confirmReport,
  };
}
