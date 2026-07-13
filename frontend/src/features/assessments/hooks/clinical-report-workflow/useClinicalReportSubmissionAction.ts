import { useCallback, useEffect } from 'react';

import { submitClinicalReportForConfirmation } from '@/src/features/assessments/api/clinical-report-api';
import {
  shouldProhibitClinicalReportWrite,
  shouldRefreshClinicalReportAfterError,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import type {
  ClinicalReportWorkflowCoordinator,
  UseClinicalReportWorkflowOptions,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import {
  buildSubmitClinicalReportForConfirmationRequest,
  createClinicalReportSubmissionDraft,
  isSafeClinicalReportWriteIdentity,
  normalizeClinicalReportText,
  validateClinicalReportSubmissionDraft,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';
import {
  canCurrentRolesWriteReplacement,
  isSafeCorrectionReplacement,
  isVersionOneReport,
} from '@/src/features/assessments/lib/clinical-report-correction-draft';

type SubmissionActionOptions = Pick<
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

function hasValidDoctorOpinion(report: ClinicalReport): boolean {
  const length = normalizeClinicalReportText(
    report.narrative?.doctorOpinion ?? '',
  ).length;
  return length >= 3 && length <= 4000;
}

function isSubmittableDraftReport(
  report: ClinicalReport | null,
  currentUserRoles: readonly string[],
): boolean {
  return Boolean(
    report &&
      report.status === 'draft' &&
      (isVersionOneReport(report) ||
        (isSafeCorrectionReplacement(report) &&
          canCurrentRolesWriteReplacement(currentUserRoles))) &&
      report.source === 'mixed' &&
      report.qualityStatus !== 'failed' &&
      report.lockedAt === null &&
      report.lock === null &&
      report.archivedAt === null &&
      report.archive === null &&
      report.voidedAt === null &&
      report.confirmation === null &&
      hasValidDoctorOpinion(report) &&
      isSafeClinicalReportWriteIdentity(report.id, report.updatedAt),
  );
}

export function useClinicalReportSubmissionAction({
  patientId,
  visitId,
  report,
  reportWriteBlocked,
  currentUserRoles,
  coordinator,
  hasLocalDraft,
}: SubmissionActionOptions) {
  const { state, setSubmissionDraft, setSubmissionError } = coordinator;
  const submissionDraft = state.submission.draft;
  const submissionDirty =
    normalizeClinicalReportText(submissionDraft?.submissionNote ?? '').length >
    0;
  const submissionValidation = submissionDraft
    ? validateClinicalReportSubmissionDraft(submissionDraft)
    : { valid: false, message: null };
  const submissionVersionMatches = Boolean(
    submissionDraft &&
      report &&
      submissionDraft.reportId === report.id.trim().toLowerCase() &&
      submissionDraft.baseUpdatedAt === report.updatedAt,
  );
  const canSubmit =
    state.activeMode === 'idle' &&
    state.writingAction === null &&
    !reportWriteBlocked &&
    !state.writeProhibited &&
    !hasLocalDraft &&
    isSubmittableDraftReport(report, currentUserRoles);
  const canConfirmSubmission = Boolean(
    submissionDraft &&
      submissionValidation.valid &&
      submissionDraft.confirmed &&
      !submissionDraft.stale &&
      submissionVersionMatches &&
      state.writingAction === null &&
      !reportWriteBlocked &&
      !state.writeProhibited &&
      isSubmittableDraftReport(report, currentUserRoles),
  );

  useEffect(() => {
    if (
      submissionDraft &&
      (!report ||
        submissionDraft.reportId !== report.id.trim().toLowerCase() ||
        submissionDraft.baseUpdatedAt !== report.updatedAt)
    ) {
      setSubmissionDraft((current) =>
        current && !current.stale
          ? { ...current, confirmed: false, stale: true }
          : current,
      );
    }
  }, [report, setSubmissionDraft, submissionDraft]);

  const openSubmit = useCallback(() => {
    if (!canSubmit || !report) return;
    const draft = createClinicalReportSubmissionDraft(report);
    if (!draft) return;
    coordinator.activateSubmission(draft);
  }, [canSubmit, coordinator, report]);

  const updateSubmissionNote = useCallback(
    (value: string) => {
      setSubmissionDraft((current) =>
        current
          ? { ...current, submissionNote: value, confirmed: false }
          : current,
      );
      setSubmissionError(null);
    },
    [setSubmissionDraft, setSubmissionError],
  );

  const setSubmissionConfirmed = useCallback(
    (confirmed: boolean) => {
      setSubmissionDraft((current) =>
        current ? { ...current, confirmed } : current,
      );
    },
    [setSubmissionDraft],
  );

  const continueSubmissionFromLatest = useCallback(() => {
    if (
      !report ||
      !isSubmittableDraftReport(report, currentUserRoles) ||
      !report.updatedAt
    ) {
      return;
    }
    setSubmissionDraft((current) =>
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
    setSubmissionError(null);
  }, [currentUserRoles, report, setSubmissionDraft, setSubmissionError]);

  const submitForConfirmation = useCallback(async () => {
    if (!submissionDraft || !canConfirmSubmission) return;
    await coordinator.execute({
      action: 'submit',
      pendingMessage: '正在提交报告待医生确认。',
      request: () =>
        submitClinicalReportForConfirmation(
          patientId,
          visitId,
          submissionDraft.reportId,
          buildSubmitClinicalReportForConfirmationRequest(submissionDraft),
        ),
      onSuccess: (response) => {
        coordinator.applyReportUpdate(response.report);
        coordinator.completeSubmission(
          response.submissionReceipt,
          response.submissionReceipt.alreadySubmitted
            ? '该报告此前已经提交，本次未重复写入。'
            : '报告已提交待医生或管理员确认。',
        );
      },
      onError: async (error) => {
        setSubmissionError(error);
        coordinator.setLiveMessage(null);
        if (shouldProhibitClinicalReportWrite('submit', error)) {
          coordinator.prohibitWrites();
        }
        if (shouldRefreshClinicalReportAfterError(error)) {
          setSubmissionDraft((current) =>
            current
              ? { ...current, confirmed: false, stale: true }
              : current,
          );
        }
        await coordinator.refreshAfterError(error);
      },
    });
  }, [
    canConfirmSubmission,
    coordinator,
    patientId,
    setSubmissionDraft,
    setSubmissionError,
    submissionDraft,
    visitId,
  ]);

  return {
    submissionDraft,
    submissionDirty,
    submissionValidation,
    submissionError: state.submission.error,
    submissionReceipt: state.submission.receipt,
    canSubmit,
    canConfirmSubmission,
    openSubmit,
    updateSubmissionNote,
    setSubmissionConfirmed,
    continueSubmissionFromLatest,
    submitForConfirmation,
  };
}
