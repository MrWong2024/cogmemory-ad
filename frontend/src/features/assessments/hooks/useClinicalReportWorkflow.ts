'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ClinicalReportApiError,
  confirmClinicalReport,
  submitClinicalReportForConfirmation,
  updateClinicalReportDraft,
} from '@/src/features/assessments/api/clinical-report-api';
import {
  buildConfirmClinicalReportRequest,
  buildSubmitClinicalReportForConfirmationRequest,
  buildUpdateClinicalReportDraftRequest,
  createClinicalReportConfirmationDraft,
  createClinicalReportEditDraft,
  createClinicalReportSubmissionDraft,
  hasClinicalReportNarrativeChange,
  isClinicalReportEditDirty,
  isSafeClinicalReportWriteIdentity,
  normalizeClinicalReportText,
  shouldWarnBeforeClinicalReportUnload,
  validateClinicalReportConfirmationDraft,
  validateClinicalReportEditDraft,
  validateClinicalReportSubmissionDraft,
  type ClinicalReportConfirmationDraft,
  type ClinicalReportEditDraft,
  type ClinicalReportSubmissionDraft,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import type {
  ClinicalReport,
  ClinicalReportEditReceipt,
  ConfirmClinicalReportReceipt,
  SubmitClinicalReportReceipt,
} from '@/src/features/assessments/types/clinical-report';

export type ClinicalReportWorkflowMode = 'idle' | 'edit' | 'submit' | 'confirm';
export type ClinicalReportWritingAction = Exclude<
  ClinicalReportWorkflowMode,
  'idle'
> | null;

type UseClinicalReportWorkflowOptions = {
  patientId: string;
  visitId: string;
  report: ClinicalReport | null;
  currentUserRoles: string[];
  reportWriteBlocked: boolean;
  onUnauthorized: () => void;
  onReportUpdated: (report: ClinicalReport) => void;
  refreshLatest: () => Promise<ClinicalReport | null>;
};

const refreshAfterActionErrors = new Set<ClinicalReportApiError['kind']>([
  'clinical_report_not_editable',
  'clinical_report_edit_conflict',
  'clinical_report_submission_conflict',
  'clinical_report_not_ready_for_submission',
  'clinical_report_confirmation_conflict',
  'clinical_report_not_ready_for_confirmation',
  'clinical_report_voided',
  'clinical_report_not_found',
]);

function toClinicalReportApiError(error: unknown): ClinicalReportApiError {
  return error instanceof ClinicalReportApiError
    ? error
    : new ClinicalReportApiError('unknown');
}

function isEditableDraftReport(report: ClinicalReport | null): boolean {
  return Boolean(
    report &&
      report.status === 'draft' &&
      report.reportType === 'cognitive_assessment' &&
      report.reportVersion === 1 &&
      (report.source === 'system_draft' || report.source === 'mixed') &&
      report.lockedAt === null &&
      report.archivedAt === null &&
      report.voidedAt === null &&
      report.confirmation === null &&
      isSafeClinicalReportWriteIdentity(report.id, report.updatedAt),
  );
}

function hasValidDoctorOpinion(report: ClinicalReport): boolean {
  const length = normalizeClinicalReportText(
    report.narrative?.doctorOpinion ?? '',
  ).length;
  return length >= 3 && length <= 4000;
}

function isSubmittableDraftReport(report: ClinicalReport | null): boolean {
  return Boolean(
    report &&
      report.status === 'draft' &&
      report.source === 'mixed' &&
      report.qualityStatus !== 'failed' &&
      hasValidDoctorOpinion(report) &&
      isSafeClinicalReportWriteIdentity(report.id, report.updatedAt),
  );
}

function isConfirmableReport(report: ClinicalReport | null): boolean {
  return Boolean(
    report &&
      report.status === 'pending_confirmation' &&
      report.submission !== null &&
      report.qualityStatus !== 'failed' &&
      isSafeClinicalReportWriteIdentity(report.id, report.updatedAt),
  );
}

export function useClinicalReportWorkflow({
  patientId,
  visitId,
  report,
  currentUserRoles,
  reportWriteBlocked,
  onUnauthorized,
  onReportUpdated,
  refreshLatest,
}: UseClinicalReportWorkflowOptions) {
  const mountedRef = useRef(true);
  const writingRef = useRef<ClinicalReportWritingAction>(null);
  const [activeMode, setActiveMode] =
    useState<ClinicalReportWorkflowMode>('idle');
  const [writingAction, setWritingAction] =
    useState<ClinicalReportWritingAction>(null);
  const [editDraft, setEditDraft] =
    useState<ClinicalReportEditDraft | null>(null);
  const [submissionDraft, setSubmissionDraft] =
    useState<ClinicalReportSubmissionDraft | null>(null);
  const [confirmationDraft, setConfirmationDraft] =
    useState<ClinicalReportConfirmationDraft | null>(null);
  const [editError, setEditError] = useState<ClinicalReportApiError | null>(
    null,
  );
  const [submissionError, setSubmissionError] =
    useState<ClinicalReportApiError | null>(null);
  const [confirmationError, setConfirmationError] =
    useState<ClinicalReportApiError | null>(null);
  const [editReceipt, setEditReceipt] =
    useState<ClinicalReportEditReceipt | null>(null);
  const [submissionReceipt, setSubmissionReceipt] =
    useState<SubmitClinicalReportReceipt | null>(null);
  const [confirmationReceipt, setConfirmationReceipt] =
    useState<ConfirmClinicalReportReceipt | null>(null);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [writeProhibited, setWriteProhibited] = useState(false);

  const roleCanConfirm = useMemo(
    () =>
      currentUserRoles.some((role) => role === 'doctor' || role === 'admin'),
    [currentUserRoles],
  );

  const editDirty = isClinicalReportEditDirty(editDraft);
  const submissionDirty =
    normalizeClinicalReportText(submissionDraft?.submissionNote ?? '').length >
    0;
  const confirmationDirty =
    normalizeClinicalReportText(confirmationDraft?.confirmationNote ?? '')
      .length > 0;
  const hasLocalDraft = Boolean(editDraft || submissionDraft || confirmationDraft);

  const canEdit =
    activeMode === 'idle' &&
    writingAction === null &&
    !reportWriteBlocked &&
    !writeProhibited &&
    isEditableDraftReport(report);
  const canSubmit =
    activeMode === 'idle' &&
    writingAction === null &&
    !reportWriteBlocked &&
    !writeProhibited &&
    !hasLocalDraft &&
    isSubmittableDraftReport(report);
  const canConfirm =
    activeMode === 'idle' &&
    writingAction === null &&
    !reportWriteBlocked &&
    !writeProhibited &&
    !hasLocalDraft &&
    roleCanConfirm &&
    isConfirmableReport(report);

  const editValidation = editDraft
    ? validateClinicalReportEditDraft(editDraft)
    : { valid: false, message: null };
  const submissionValidation = submissionDraft
    ? validateClinicalReportSubmissionDraft(submissionDraft)
    : { valid: false, message: null };
  const confirmationValidation = confirmationDraft
    ? validateClinicalReportConfirmationDraft(confirmationDraft)
    : { valid: false, message: null };

  const editVersionMatches = Boolean(
    editDraft &&
      report &&
      editDraft.reportId === report.id.trim().toLowerCase() &&
      editDraft.baseUpdatedAt === report.updatedAt,
  );
  const submissionVersionMatches = Boolean(
    submissionDraft &&
      report &&
      submissionDraft.reportId === report.id.trim().toLowerCase() &&
      submissionDraft.baseUpdatedAt === report.updatedAt,
  );
  const confirmationVersionMatches = Boolean(
    confirmationDraft &&
      report &&
      confirmationDraft.reportId === report.id.trim().toLowerCase() &&
      confirmationDraft.baseUpdatedAt === report.updatedAt,
  );

  const canSaveEdit = Boolean(
    editDraft &&
      editValidation.valid &&
      hasClinicalReportNarrativeChange(editDraft) &&
      !editDraft.stale &&
      editVersionMatches &&
      writingAction === null &&
      !reportWriteBlocked &&
      !writeProhibited &&
      isEditableDraftReport(report),
  );
  const canConfirmSubmission = Boolean(
    submissionDraft &&
      submissionValidation.valid &&
      submissionDraft.confirmed &&
      !submissionDraft.stale &&
      submissionVersionMatches &&
      writingAction === null &&
      !reportWriteBlocked &&
      !writeProhibited &&
      isSubmittableDraftReport(report),
  );
  const canConfirmReport = Boolean(
    confirmationDraft &&
      confirmationValidation.valid &&
      confirmationDraft.confirmed &&
      !confirmationDraft.stale &&
      confirmationVersionMatches &&
      writingAction === null &&
      !reportWriteBlocked &&
      !writeProhibited &&
      roleCanConfirm &&
      isConfirmableReport(report),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setActiveMode('idle');
    setWritingAction(null);
    writingRef.current = null;
    setEditDraft(null);
    setSubmissionDraft(null);
    setConfirmationDraft(null);
    setEditError(null);
    setSubmissionError(null);
    setConfirmationError(null);
    setEditReceipt(null);
    setSubmissionReceipt(null);
    setConfirmationReceipt(null);
    setLiveMessage(null);
    setWriteProhibited(false);
  }, [patientId, visitId]);

  useEffect(() => {
    if (
      editDraft &&
      (!report ||
        editDraft.reportId !== report.id.trim().toLowerCase() ||
        editDraft.baseUpdatedAt !== report.updatedAt)
    ) {
      setEditDraft((current) =>
        current && !current.stale ? { ...current, stale: true } : current,
      );
    }
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
  }, [confirmationDraft, editDraft, report, submissionDraft]);

  useEffect(() => {
    const shouldWarn = shouldWarnBeforeClinicalReportUnload({
      editDraft,
      submissionDraft,
      confirmationDraft,
    });
    if (!shouldWarn) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [confirmationDraft, editDraft, submissionDraft]);

  const clearActionErrors = useCallback(() => {
    setEditError(null);
    setSubmissionError(null);
    setConfirmationError(null);
    setLiveMessage(null);
  }, []);

  const openEdit = useCallback(() => {
    if (!canEdit || !report) return;
    const draft = createClinicalReportEditDraft(report);
    if (!draft) return;
    clearActionErrors();
    setEditDraft(draft);
    setSubmissionDraft(null);
    setConfirmationDraft(null);
    setActiveMode('edit');
  }, [canEdit, clearActionErrors, report]);

  const openSubmit = useCallback(() => {
    if (!canSubmit || !report) return;
    const draft = createClinicalReportSubmissionDraft(report);
    if (!draft) return;
    clearActionErrors();
    setEditDraft(null);
    setSubmissionDraft(draft);
    setConfirmationDraft(null);
    setActiveMode('submit');
  }, [canSubmit, clearActionErrors, report]);

  const openConfirm = useCallback(() => {
    if (!canConfirm || !report) return;
    const draft = createClinicalReportConfirmationDraft(report);
    if (!draft) return;
    clearActionErrors();
    setEditDraft(null);
    setSubmissionDraft(null);
    setConfirmationDraft(draft);
    setActiveMode('confirm');
  }, [canConfirm, clearActionErrors, report]);

  const cancelActive = useCallback(() => {
    if (writingRef.current !== null) return;
    setEditDraft(null);
    setSubmissionDraft(null);
    setConfirmationDraft(null);
    setActiveMode('idle');
    clearActionErrors();
  }, [clearActionErrors]);

  const updateEditDraft = useCallback(
    (field: 'doctorOpinion' | 'recommendationText' | 'editNote', value: string) => {
      setEditDraft((current) =>
        current ? { ...current, [field]: value } : current,
      );
      setEditError(null);
    },
    [],
  );

  const updateSubmissionNote = useCallback((value: string) => {
    setSubmissionDraft((current) =>
      current ? { ...current, submissionNote: value, confirmed: false } : current,
    );
    setSubmissionError(null);
  }, []);

  const setSubmissionConfirmed = useCallback((confirmed: boolean) => {
    setSubmissionDraft((current) =>
      current ? { ...current, confirmed } : current,
    );
  }, []);

  const updateConfirmationNote = useCallback((value: string) => {
    setConfirmationDraft((current) =>
      current
        ? { ...current, confirmationNote: value, confirmed: false }
        : current,
    );
    setConfirmationError(null);
  }, []);

  const setConfirmationConfirmed = useCallback((confirmed: boolean) => {
    setConfirmationDraft((current) =>
      current ? { ...current, confirmed } : current,
    );
  }, []);

  const continueEditFromLatest = useCallback(() => {
    if (!report || !isEditableDraftReport(report) || !report.updatedAt) return;
    setEditDraft((current) =>
      current
        ? {
            ...current,
            reportId: report.id.trim().toLowerCase(),
            baseUpdatedAt: report.updatedAt ?? current.baseUpdatedAt,
            baseDoctorOpinion: normalizeClinicalReportText(
              report.narrative?.doctorOpinion ?? '',
            ),
            baseRecommendationText: normalizeClinicalReportText(
              report.narrative?.recommendationText ?? '',
            ),
            stale: false,
          }
        : current,
    );
    setEditError(null);
  }, [report]);

  const continueSubmissionFromLatest = useCallback(() => {
    if (!report || !isSubmittableDraftReport(report) || !report.updatedAt) return;
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
  }, [report]);

  const continueConfirmationFromLatest = useCallback(() => {
    if (
      !report ||
      !roleCanConfirm ||
      !isConfirmableReport(report) ||
      !report.updatedAt
    )
      return;
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
  }, [report, roleCanConfirm]);

  const refreshOnceAfterError = useCallback(
    async (error: ClinicalReportApiError) => {
      if (!refreshAfterActionErrors.has(error.kind)) return;
      await refreshLatest();
    },
    [refreshLatest],
  );

  const saveEdit = useCallback(async () => {
    if (!editDraft || !canSaveEdit || writingRef.current !== null) return;
    writingRef.current = 'edit';
    setWritingAction('edit');
    setEditError(null);
    setLiveMessage('正在保存受控报告编辑。');
    try {
      const response = await updateClinicalReportDraft(
        patientId,
        visitId,
        editDraft.reportId,
        buildUpdateClinicalReportDraftRequest(editDraft),
      );
      if (!mountedRef.current) return;
      onReportUpdated(response.report);
      setEditReceipt(response.editReceipt);
      setEditDraft(null);
      setActiveMode('idle');
      setLiveMessage('医生意见与临床人员建议已保存。');
    } catch (requestError: unknown) {
      if (!mountedRef.current) return;
      const error = toClinicalReportApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      setEditError(error);
      setLiveMessage(null);
      if (
        error.kind === 'clinical_report_edit_audit_limit_reached' ||
        error.kind === 'clinical_report_metadata_unsupported'
      ) {
        setWriteProhibited(true);
      }
      if (refreshAfterActionErrors.has(error.kind)) {
        setEditDraft((current) =>
          current ? { ...current, stale: true } : current,
        );
      }
      await refreshOnceAfterError(error);
    } finally {
      writingRef.current = null;
      if (mountedRef.current) setWritingAction(null);
    }
  }, [
    canSaveEdit,
    editDraft,
    onReportUpdated,
    onUnauthorized,
    patientId,
    refreshOnceAfterError,
    visitId,
  ]);

  const submitForConfirmation = useCallback(async () => {
    if (
      !submissionDraft ||
      !canConfirmSubmission ||
      writingRef.current !== null
    )
      return;
    writingRef.current = 'submit';
    setWritingAction('submit');
    setSubmissionError(null);
    setLiveMessage('正在提交报告待医生确认。');
    try {
      const response = await submitClinicalReportForConfirmation(
        patientId,
        visitId,
        submissionDraft.reportId,
        buildSubmitClinicalReportForConfirmationRequest(submissionDraft),
      );
      if (!mountedRef.current) return;
      onReportUpdated(response.report);
      setSubmissionReceipt(response.submissionReceipt);
      setEditDraft(null);
      setSubmissionDraft(null);
      setActiveMode('idle');
      setLiveMessage(
        response.submissionReceipt.alreadySubmitted
          ? '该报告此前已经提交，本次未重复写入。'
          : '报告已提交待医生或管理员确认。',
      );
    } catch (requestError: unknown) {
      if (!mountedRef.current) return;
      const error = toClinicalReportApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      setSubmissionError(error);
      setLiveMessage(null);
      if (error.kind === 'clinical_report_metadata_unsupported') {
        setWriteProhibited(true);
      }
      if (refreshAfterActionErrors.has(error.kind)) {
        setSubmissionDraft((current) =>
          current
            ? { ...current, confirmed: false, stale: true }
            : current,
        );
      }
      await refreshOnceAfterError(error);
    } finally {
      writingRef.current = null;
      if (mountedRef.current) setWritingAction(null);
    }
  }, [
    canConfirmSubmission,
    onReportUpdated,
    onUnauthorized,
    patientId,
    refreshOnceAfterError,
    submissionDraft,
    visitId,
  ]);

  const confirmReport = useCallback(async () => {
    if (
      !confirmationDraft ||
      !canConfirmReport ||
      writingRef.current !== null
    )
      return;
    writingRef.current = 'confirm';
    setWritingAction('confirm');
    setConfirmationError(null);
    setLiveMessage('正在完成医生或管理员最终确认。');
    try {
      const response = await confirmClinicalReport(
        patientId,
        visitId,
        confirmationDraft.reportId,
        buildConfirmClinicalReportRequest(confirmationDraft),
      );
      if (!mountedRef.current) return;
      onReportUpdated(response.report);
      setConfirmationReceipt(response.confirmationReceipt);
      setConfirmationDraft(null);
      setActiveMode('idle');
      setLiveMessage(
        response.confirmationReceipt.alreadyConfirmed
          ? '该报告此前已经确认，本次未重复写入。'
          : '报告已完成医生或管理员确认，并进入只读状态。',
      );
    } catch (requestError: unknown) {
      if (!mountedRef.current) return;
      const error = toClinicalReportApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      setConfirmationError(error);
      setLiveMessage(null);
      if (error.kind === 'clinical_report_metadata_unsupported') {
        setWriteProhibited(true);
      }
      if (refreshAfterActionErrors.has(error.kind)) {
        setConfirmationDraft((current) =>
          current
            ? { ...current, confirmed: false, stale: true }
            : current,
        );
      }
      await refreshOnceAfterError(error);
    } finally {
      writingRef.current = null;
      if (mountedRef.current) setWritingAction(null);
    }
  }, [
    canConfirmReport,
    confirmationDraft,
    onReportUpdated,
    onUnauthorized,
    patientId,
    refreshOnceAfterError,
    visitId,
  ]);

  return {
    activeMode,
    writingAction,
    editDraft,
    submissionDraft,
    confirmationDraft,
    editDirty,
    submissionDirty,
    confirmationDirty,
    editValidation,
    submissionValidation,
    confirmationValidation,
    editError,
    submissionError,
    confirmationError,
    editReceipt,
    submissionReceipt,
    confirmationReceipt,
    liveMessage,
    writeProhibited,
    canEdit,
    canSubmit,
    canConfirm,
    canSaveEdit,
    canConfirmSubmission,
    canConfirmReport,
    roleCanConfirm,
    openEdit,
    openSubmit,
    openConfirm,
    cancelActive,
    updateEditDraft,
    updateSubmissionNote,
    setSubmissionConfirmed,
    updateConfirmationNote,
    setConfirmationConfirmed,
    continueEditFromLatest,
    continueSubmissionFromLatest,
    continueConfirmationFromLatest,
    saveEdit,
    submitForConfirmation,
    confirmReport,
  };
}

export type UseClinicalReportWorkflowValue = ReturnType<
  typeof useClinicalReportWorkflow
>;
