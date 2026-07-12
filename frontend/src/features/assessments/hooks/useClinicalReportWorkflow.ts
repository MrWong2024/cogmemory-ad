'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ClinicalReportApiError,
  archiveClinicalReport,
  confirmClinicalReport,
  freezeClinicalReportSources,
  lockClinicalReport,
  submitClinicalReportForConfirmation,
  updateClinicalReportDraft,
} from '@/src/features/assessments/api/clinical-report-api';
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
  type ClinicalReportArchiveDraft,
} from '@/src/features/assessments/lib/clinical-report-archive-draft';
import {
  getClinicalReportFinalityWarning,
  getClinicalReportLockConsistencyWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
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
  type ClinicalReportSourceFreezeDraft,
} from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import {
  buildConfirmClinicalReportRequest,
  buildLockClinicalReportRequest,
  buildSubmitClinicalReportForConfirmationRequest,
  buildUpdateClinicalReportDraftRequest,
  createClinicalReportConfirmationDraft,
  createClinicalReportEditDraft,
  createClinicalReportLockDraft,
  createClinicalReportSubmissionDraft,
  continueClinicalReportLockDraftWithLatest,
  hasClinicalReportNarrativeChange,
  isClinicalReportEditDirty,
  isClinicalReportLockDirty,
  isSafeClinicalReportWriteIdentity,
  normalizeClinicalReportText,
  shouldWarnBeforeClinicalReportUnload,
  validateClinicalReportConfirmationDraft,
  validateClinicalReportEditDraft,
  validateClinicalReportLockDraft,
  validateClinicalReportSubmissionDraft,
  type ClinicalReportConfirmationDraft,
  type ClinicalReportEditDraft,
  type ClinicalReportLockDraft,
  type ClinicalReportSubmissionDraft,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import type {
  ArchiveClinicalReportReceipt,
  ClinicalReport,
  ClinicalReportEditReceipt,
  FreezeClinicalReportSourcesReceipt,
  LockClinicalReportReceipt,
  ConfirmClinicalReportReceipt,
  SubmitClinicalReportReceipt,
} from '@/src/features/assessments/types/clinical-report';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

export type ClinicalReportWorkflowMode =
  | 'idle'
  | 'edit'
  | 'submit'
  | 'confirm'
  | 'lock'
  | 'source_freeze'
  | 'archive';
export type ClinicalReportWritingAction = Exclude<
  ClinicalReportWorkflowMode,
  'idle'
> | null;

type UseClinicalReportWorkflowOptions = {
  patientId: string;
  visitId: string;
  report: ClinicalReport | null;
  visitStatus: AssessmentVisitStatus | null;
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
  'clinical_report_not_lockable',
  'clinical_report_lock_conflict',
  'clinical_report_not_source_freezable',
  'clinical_report_source_freeze_conflict',
  'clinical_report_source_freeze_incomplete',
  'clinical_report_source_freeze_failed',
  'clinical_report_not_archivable',
  'clinical_report_archive_conflict',
  'clinical_report_archive_failed',
]);

const lockableVisitStatuses = new Set<AssessmentVisitStatus>([
  'draft',
  'in_progress',
  'completed',
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
      report.lock === null &&
      report.archivedAt === null &&
      report.archive === null &&
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

function isConfirmableReport(report: ClinicalReport | null): boolean {
  return Boolean(
    report &&
      report.status === 'pending_confirmation' &&
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

function isLockableReport(
  report: ClinicalReport | null,
  visitStatus: AssessmentVisitStatus | null,
): boolean {
  return Boolean(
    report &&
      report.reportType === 'cognitive_assessment' &&
      report.reportVersion === 1 &&
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
      visitStatus !== null &&
      lockableVisitStatuses.has(visitStatus) &&
      getClinicalReportFinalityWarning(report.status, report.isFinal) === null &&
      getClinicalReportLockConsistencyWarning(report) === null &&
      isSafeClinicalReportWriteIdentity(report.id, report.updatedAt),
  );
}

export function useClinicalReportWorkflow({
  patientId,
  visitId,
  report,
  visitStatus,
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
  const [lockDraft, setLockDraft] =
    useState<ClinicalReportLockDraft | null>(null);
  const [sourceFreezeDraft, setSourceFreezeDraft] =
    useState<ClinicalReportSourceFreezeDraft | null>(null);
  const [archiveDraft, setArchiveDraft] =
    useState<ClinicalReportArchiveDraft | null>(null);
  const [editError, setEditError] = useState<ClinicalReportApiError | null>(
    null,
  );
  const [submissionError, setSubmissionError] =
    useState<ClinicalReportApiError | null>(null);
  const [confirmationError, setConfirmationError] =
    useState<ClinicalReportApiError | null>(null);
  const [lockError, setLockError] = useState<ClinicalReportApiError | null>(
    null,
  );
  const [sourceFreezeError, setSourceFreezeError] =
    useState<ClinicalReportApiError | null>(null);
  const [archiveError, setArchiveError] =
    useState<ClinicalReportApiError | null>(null);
  const [editReceipt, setEditReceipt] =
    useState<ClinicalReportEditReceipt | null>(null);
  const [submissionReceipt, setSubmissionReceipt] =
    useState<SubmitClinicalReportReceipt | null>(null);
  const [confirmationReceipt, setConfirmationReceipt] =
    useState<ConfirmClinicalReportReceipt | null>(null);
  const [lockReceipt, setLockReceipt] =
    useState<LockClinicalReportReceipt | null>(null);
  const [sourceFreezeReceipt, setSourceFreezeReceipt] =
    useState<FreezeClinicalReportSourcesReceipt | null>(null);
  const [archiveReceipt, setArchiveReceipt] =
    useState<ArchiveClinicalReportReceipt | null>(null);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [writeProhibited, setWriteProhibited] = useState(false);

  const roleCanConfirm = useMemo(
    () =>
      currentUserRoles.some((role) => role === 'doctor' || role === 'admin'),
    [currentUserRoles],
  );
  const roleCanLock = roleCanConfirm;
  const roleCanFreezeSources = roleCanConfirm;
  const roleCanArchive = roleCanConfirm;

  const editDirty = isClinicalReportEditDirty(editDraft);
  const submissionDirty =
    normalizeClinicalReportText(submissionDraft?.submissionNote ?? '').length >
    0;
  const confirmationDirty =
    normalizeClinicalReportText(confirmationDraft?.confirmationNote ?? '')
      .length > 0;
  const lockDirty = isClinicalReportLockDirty(lockDraft);
  const sourceFreezeDirty = isClinicalReportSourceFreezeDirty(sourceFreezeDraft);
  const archiveDirty = isClinicalReportArchiveDirty(archiveDraft);
  const hasLocalDraft = Boolean(
    editDraft ||
      submissionDraft ||
      confirmationDraft ||
      lockDraft ||
      sourceFreezeDraft ||
      archiveDraft,
  );

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
  const canLock =
    activeMode === 'idle' &&
    writingAction === null &&
    !reportWriteBlocked &&
    !writeProhibited &&
    !hasLocalDraft &&
    roleCanLock &&
    isLockableReport(report, visitStatus);
  const sourceFreezeConsistencyWarning = report
    ? getClinicalReportSourceFreezeConsistencyWarning(report.sourceFreeze)
    : null;
  const canStartSourceFreeze = Boolean(
    report &&
      activeMode === 'idle' &&
      writingAction === null &&
      !reportWriteBlocked &&
      !writeProhibited &&
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
      activeMode === 'idle' &&
      writingAction === null &&
      !reportWriteBlocked &&
      !writeProhibited &&
      !hasLocalDraft &&
      roleCanFreezeSources &&
      sourceFreezeConsistencyWarning === null &&
      getClinicalReportSourceFreezeResumeEligibilityWarning(report) === null,
  );
  const archiveConsistencyWarning = report
    ? getClinicalReportArchiveConsistencyWarning(report)
    : null;
  const canArchive = Boolean(
    report &&
      activeMode === 'idle' &&
      writingAction === null &&
      !reportWriteBlocked &&
      !writeProhibited &&
      !hasLocalDraft &&
      roleCanArchive &&
      archiveConsistencyWarning === null &&
      isClinicalReportArchivable(report),
  );

  const editValidation = editDraft
    ? validateClinicalReportEditDraft(editDraft)
    : { valid: false, message: null };
  const submissionValidation = submissionDraft
    ? validateClinicalReportSubmissionDraft(submissionDraft)
    : { valid: false, message: null };
  const confirmationValidation = confirmationDraft
    ? validateClinicalReportConfirmationDraft(confirmationDraft)
    : { valid: false, message: null };
  const lockValidation = lockDraft
    ? validateClinicalReportLockDraft(lockDraft)
    : { valid: false, message: null };
  const sourceFreezeValidation = sourceFreezeDraft
    ? validateClinicalReportSourceFreezeDraft(sourceFreezeDraft)
    : { valid: false, message: null };
  const archiveValidation = archiveDraft
    ? validateClinicalReportArchiveDraft(archiveDraft, report)
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
  const lockVersionMatches = Boolean(
    lockDraft &&
      report &&
      lockDraft.reportId === report.id.trim().toLowerCase() &&
      lockDraft.baseUpdatedAt === report.updatedAt &&
      report.status === 'confirmed' &&
      report.lockedAt === null,
  );
  const sourceFreezeVersionMatches = Boolean(
    sourceFreezeDraft &&
      report &&
      clinicalReportSourceFreezeDraftMatchesReport(sourceFreezeDraft, report),
  );
  const archiveVersionMatches = Boolean(
    archiveDraft &&
      report &&
      clinicalReportArchiveDraftMatchesReport(archiveDraft, report),
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
  const canConfirmLock = Boolean(
    lockDraft &&
      lockValidation.valid &&
      !lockDraft.stale &&
      lockVersionMatches &&
      writingAction === null &&
      !reportWriteBlocked &&
      !writeProhibited &&
      roleCanLock &&
      isLockableReport(report, visitStatus),
  );
  const canConfirmSourceFreeze = Boolean(
    sourceFreezeDraft &&
      report &&
      sourceFreezeValidation.valid &&
      !sourceFreezeDraft.stale &&
      sourceFreezeVersionMatches &&
      writingAction === null &&
      !reportWriteBlocked &&
      !writeProhibited &&
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
  const canConfirmArchive = Boolean(
    archiveDraft &&
      report &&
      archiveValidation.valid &&
      !archiveDraft.stale &&
      archiveVersionMatches &&
      writingAction === null &&
      !reportWriteBlocked &&
      !writeProhibited &&
      roleCanArchive &&
      archiveConsistencyWarning === null &&
      isClinicalReportArchivable(report),
  );
  const canContinueLockWithLatest = Boolean(
    lockDraft &&
      lockDraft.stale &&
      roleCanLock &&
      !reportWriteBlocked &&
      !writeProhibited &&
      isLockableReport(report, visitStatus),
  );
  const canContinueSourceFreezeWithLatest = Boolean(
    sourceFreezeDraft &&
      sourceFreezeDraft.stale &&
      report &&
      roleCanFreezeSources &&
      !reportWriteBlocked &&
      !writeProhibited &&
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
  const canContinueArchiveWithLatest = Boolean(
    archiveDraft &&
      archiveDraft.stale &&
      report &&
      roleCanArchive &&
      !reportWriteBlocked &&
      !writeProhibited &&
      archiveConsistencyWarning === null &&
      isClinicalReportArchivable(report),
  );
  const lockBlockReason = useMemo(() => {
    if (!report) return '请先加载当前临床报告。';
    if (!roleCanLock) return '报告锁定需由医生或管理员执行。';
    if (report.lockedAt !== null) return '当前报告已经锁定，不能重复开放锁定入口。';
    const consistencyWarning = getClinicalReportLockConsistencyWarning(report);
    if (consistencyWarning) return consistencyWarning;
    if (getClinicalReportFinalityWarning(report.status, report.isFinal)) {
      return '报告状态与最终性标记不一致，当前不能安全锁定。';
    }
    if (report.reportType !== 'cognitive_assessment' || report.reportVersion !== 1) {
      return '当前仅支持 cognitive_assessment version 1 报告锁定。';
    }
    if (report.status !== 'confirmed') return '只有已确认报告可以执行锁定。';
    if (report.source !== 'mixed') return '当前报告来源状态不满足锁定要求。';
    if (report.qualityStatus !== 'passed') return '报告流程质量标记未通过，不能锁定。';
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
    if (!visitStatus || !lockableVisitStatuses.has(visitStatus)) {
      return '当前访视状态不允许首次锁定报告。';
    }
    if (!isSafeClinicalReportWriteIdentity(report.id, report.updatedAt)) {
      return '当前报告缺少安全的 updatedAt 并发基线。';
    }
    if (reportWriteBlocked) return '当前存在其他访视或报告写操作，请等待完成。';
    if (writeProhibited) return '报告审计结构当前禁止继续安全写入。';
    if (activeMode !== 'idle' || hasLocalDraft) {
      return '请先保存或放弃当前报告本地草稿。';
    }
    if (writingAction !== null) return '当前正在执行报告写操作。';
    return null;
  }, [
    activeMode,
    hasLocalDraft,
    report,
    reportWriteBlocked,
    roleCanLock,
    visitStatus,
    writeProhibited,
    writingAction,
  ]);
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
    if (writeProhibited) return '报告审计结构当前禁止继续安全写入。';
    if (activeMode !== 'idle' || hasLocalDraft) {
      return '请先保存或放弃当前报告本地草稿。';
    }
    if (writingAction !== null) return '当前正在执行报告写操作。';
    return null;
  }, [
    activeMode,
    hasLocalDraft,
    report,
    reportWriteBlocked,
    roleCanFreezeSources,
    sourceFreezeConsistencyWarning,
    visitStatus,
    writeProhibited,
    writingAction,
  ]);
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
    const eligibilityWarning = getClinicalReportArchiveEligibilityWarning(report);
    if (eligibilityWarning) return eligibilityWarning;
    if (reportWriteBlocked) return '当前存在其他访视或报告写操作，请等待完成。';
    if (writeProhibited) return '报告审计结构当前禁止继续安全写入。';
    if (activeMode !== 'idle' || hasLocalDraft) {
      return '请先保存或放弃当前报告本地草稿。';
    }
    if (writingAction !== null) return '当前正在执行报告写操作。';
    return null;
  }, [
    activeMode,
    archiveConsistencyWarning,
    hasLocalDraft,
    report,
    reportWriteBlocked,
    roleCanArchive,
    writeProhibited,
    writingAction,
  ]);
  const canDiscardLocalSourceFreezeAndResume = Boolean(
    sourceFreezeDraft?.mode === 'start' &&
      sourceFreezeDraft.stale &&
      report?.sourceFreeze?.state === 'in_progress' &&
      roleCanFreezeSources &&
      !reportWriteBlocked &&
      !writeProhibited &&
      sourceFreezeConsistencyWarning === null &&
      getClinicalReportSourceFreezeResumeEligibilityWarning(report) === null,
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
    setLockDraft(null);
    setSourceFreezeDraft(null);
    setArchiveDraft(null);
    setEditError(null);
    setSubmissionError(null);
    setConfirmationError(null);
    setLockError(null);
    setSourceFreezeError(null);
    setArchiveError(null);
    setEditReceipt(null);
    setSubmissionReceipt(null);
    setConfirmationReceipt(null);
    setLockReceipt(null);
    setSourceFreezeReceipt(null);
    setArchiveReceipt(null);
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
  }, [
    archiveDraft,
    confirmationDraft,
    editDraft,
    lockDraft,
    report,
    sourceFreezeDraft,
    submissionDraft,
  ]);

  useEffect(() => {
    const shouldWarn = shouldWarnBeforeClinicalReportUnload({
      editDraft,
      submissionDraft,
      confirmationDraft,
      lockDraft,
    });
    if (!shouldWarn && !sourceFreezeDirty && !archiveDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [
    archiveDirty,
    confirmationDraft,
    editDraft,
    lockDraft,
    sourceFreezeDirty,
    submissionDraft,
  ]);

  const clearActionErrors = useCallback(() => {
    setEditError(null);
    setSubmissionError(null);
    setConfirmationError(null);
    setLockError(null);
    setSourceFreezeError(null);
    setArchiveError(null);
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
    setLockDraft(null);
    setSourceFreezeDraft(null);
    setArchiveDraft(null);
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
    setLockDraft(null);
    setSourceFreezeDraft(null);
    setArchiveDraft(null);
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
    setLockDraft(null);
    setSourceFreezeDraft(null);
    setArchiveDraft(null);
    setActiveMode('confirm');
  }, [canConfirm, clearActionErrors, report]);

  const openLock = useCallback(() => {
    if (!canLock || !report) return;
    const draft = createClinicalReportLockDraft(report);
    if (!draft) return;
    clearActionErrors();
    setEditDraft(null);
    setSubmissionDraft(null);
    setConfirmationDraft(null);
    setLockDraft(draft);
    setSourceFreezeDraft(null);
    setArchiveDraft(null);
    setActiveMode('lock');
  }, [canLock, clearActionErrors, report]);

  const openSourceFreeze = useCallback(() => {
    if (!canStartSourceFreeze || !report) return;
    const draft = createClinicalReportSourceFreezeStartDraft(report);
    if (!draft) return;
    clearActionErrors();
    setEditDraft(null);
    setSubmissionDraft(null);
    setConfirmationDraft(null);
    setLockDraft(null);
    setSourceFreezeDraft(draft);
    setArchiveDraft(null);
    setActiveMode('source_freeze');
  }, [canStartSourceFreeze, clearActionErrors, report]);

  const openSourceFreezeResume = useCallback(() => {
    if (!canResumeSourceFreeze || !report) return;
    const draft = createClinicalReportSourceFreezeResumeDraft(report);
    if (!draft) return;
    clearActionErrors();
    setEditDraft(null);
    setSubmissionDraft(null);
    setConfirmationDraft(null);
    setLockDraft(null);
    setSourceFreezeDraft(draft);
    setArchiveDraft(null);
    setActiveMode('source_freeze');
  }, [canResumeSourceFreeze, clearActionErrors, report]);

  const openArchive = useCallback(() => {
    if (!canArchive || !report) return;
    const draft = createClinicalReportArchiveDraft(report);
    if (!draft) return;
    clearActionErrors();
    setEditDraft(null);
    setSubmissionDraft(null);
    setConfirmationDraft(null);
    setLockDraft(null);
    setSourceFreezeDraft(null);
    setArchiveDraft(draft);
    setActiveMode('archive');
  }, [canArchive, clearActionErrors, report]);

  const cancelActive = useCallback(() => {
    if (writingRef.current !== null) return;
    setEditDraft(null);
    setSubmissionDraft(null);
    setConfirmationDraft(null);
    setLockDraft(null);
    setSourceFreezeDraft(null);
    setArchiveDraft(null);
    setActiveMode('idle');
    clearActionErrors();
  }, [clearActionErrors]);

  const cancelSourceFreeze = useCallback(() => {
    if (writingRef.current !== null) return;
    setSourceFreezeDraft(null);
    setSourceFreezeError(null);
    setActiveMode('idle');
    setLiveMessage(null);
  }, []);

  const cancelArchive = useCallback(() => {
    if (writingRef.current !== null) return;
    setArchiveDraft(null);
    setArchiveError(null);
    setActiveMode('idle');
    setLiveMessage(null);
  }, []);

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

  const updateLockNote = useCallback((value: string) => {
    setLockDraft((current) =>
      current ? { ...current, lockNote: value, confirmed: false } : current,
    );
    setLockError(null);
  }, []);

  const setLockConfirmed = useCallback((confirmed: boolean) => {
    setLockDraft((current) =>
      current ? { ...current, confirmed } : current,
    );
  }, []);

  const updateSourceFreezeNote = useCallback((value: string) => {
    setSourceFreezeDraft((current) =>
      current && current.mode === 'start' && !current.usesPersistedNote
        ? { ...current, freezeNote: value, confirmed: false }
        : current,
    );
    setSourceFreezeError(null);
  }, []);

  const setSourceFreezeConfirmed = useCallback((confirmed: boolean) => {
    setSourceFreezeDraft((current) =>
      current ? { ...current, confirmed } : current,
    );
  }, []);

  const updateArchiveNote = useCallback((value: string) => {
    setArchiveDraft((current) =>
      current ? { ...current, archiveNote: value, confirmed: false } : current,
    );
    setArchiveError(null);
  }, []);

  const setArchiveConfirmed = useCallback((confirmed: boolean) => {
    setArchiveDraft((current) =>
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

  const continueLockWithLatest = useCallback(() => {
    if (!report || !canContinueLockWithLatest) return;
    setLockDraft((current) =>
      current
        ? continueClinicalReportLockDraftWithLatest(current, report)
        : current,
    );
    setLockError(null);
  }, [canContinueLockWithLatest, report]);

  const continueSourceFreezeWithLatest = useCallback(() => {
    if (!report || !canContinueSourceFreezeWithLatest) return;
    setSourceFreezeDraft((current) =>
      current
        ? continueClinicalReportSourceFreezeDraftWithLatest(current, report)
        : current,
    );
    setSourceFreezeError(null);
  }, [canContinueSourceFreezeWithLatest, report]);

  const continueArchiveWithLatest = useCallback(() => {
    if (!report || !canContinueArchiveWithLatest) return;
    setArchiveDraft((current) =>
      current
        ? continueClinicalReportArchiveDraftWithLatest(current, report)
        : current,
    );
    setArchiveError(null);
  }, [canContinueArchiveWithLatest, report]);

  const discardLocalSourceFreezeAndResume = useCallback(() => {
    if (!report || !canDiscardLocalSourceFreezeAndResume) return;
    const draft = createClinicalReportSourceFreezeResumeDraft(report);
    if (!draft) return;
    setSourceFreezeDraft(draft);
    setSourceFreezeError(null);
    setLiveMessage(
      '本地未提交说明已放弃；请重新核对服务端原说明并明确确认恢复。',
    );
  }, [canDiscardLocalSourceFreezeAndResume, report]);

  const reloadLatestAfterSourceFreezeUncertainty = useCallback(async () => {
    setSourceFreezeDraft((current) =>
      current ? { ...current, confirmed: false, stale: true } : current,
    );
    await refreshLatest();
  }, [refreshLatest]);

  const reloadLatestAfterArchiveUncertainty = useCallback(async () => {
    setArchiveDraft((current) =>
      current ? { ...current, confirmed: false, stale: true } : current,
    );
    await refreshLatest();
  }, [refreshLatest]);

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

  const confirmLock = useCallback(async () => {
    if (!lockDraft || !canConfirmLock || writingRef.current !== null) return;
    writingRef.current = 'lock';
    setWritingAction('lock');
    setLockError(null);
    setLiveMessage('正在不可逆锁定报告。');
    try {
      const response = await lockClinicalReport(
        patientId,
        visitId,
        lockDraft.reportId,
        buildLockClinicalReportRequest(lockDraft),
      );
      if (!mountedRef.current) return;
      onReportUpdated(response.report);
      setLockReceipt(response.lockReceipt);
      setLockDraft(null);
      setActiveMode('idle');
      setLiveMessage(
        response.lockReceipt.alreadyLocked
          ? '该报告此前已经锁定，本次未重复写入。'
          : '报告已确认并完成不可逆锁定。',
      );
    } catch (requestError: unknown) {
      if (!mountedRef.current) return;
      const error = toClinicalReportApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      setLockError(error);
      setLiveMessage(null);
      if (
        error.kind === 'clinical_report_metadata_unsupported' ||
        error.kind === 'clinical_report_lock_audit_unavailable'
      ) {
        setWriteProhibited(true);
      }
      if (refreshAfterActionErrors.has(error.kind)) {
        setLockDraft((current) =>
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
    canConfirmLock,
    lockDraft,
    onReportUpdated,
    onUnauthorized,
    patientId,
    refreshOnceAfterError,
    visitId,
  ]);

  const confirmSourceFreeze = useCallback(async () => {
    if (
      !sourceFreezeDraft ||
      !canConfirmSourceFreeze ||
      writingRef.current !== null
    ) {
      return;
    }
    writingRef.current = 'source_freeze';
    setWritingAction('source_freeze');
    setSourceFreezeError(null);
    setLiveMessage('正在执行来源链冻结；页面不显示虚假逐项实时进度。');
    try {
      const response = await freezeClinicalReportSources(
        patientId,
        visitId,
        sourceFreezeDraft.reportId,
        buildFreezeClinicalReportSourcesRequest(sourceFreezeDraft),
      );
      if (!mountedRef.current) return;
      onReportUpdated(response.report);
      setSourceFreezeReceipt(response.sourceFreezeReceipt);
      setSourceFreezeDraft(null);
      setActiveMode('idle');
      setLiveMessage(
        response.sourceFreezeReceipt.alreadyFrozen
          ? '该报告的来源链此前已经冻结，本次未重复写入。'
          : response.sourceFreezeReceipt.resumedExisting
            ? '已有来源冻结流程已恢复并完成。'
            : '报告来源链冻结已完成。',
      );
    } catch (requestError: unknown) {
      if (!mountedRef.current) return;
      const error = toClinicalReportApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      setSourceFreezeError(error);
      setLiveMessage(null);
      if (
        error.kind === 'clinical_report_metadata_unsupported' ||
        error.kind === 'clinical_report_source_freeze_scope_invalid' ||
        error.kind === 'clinical_report_source_freeze_input_invalid' ||
        error.kind === 'clinical_report_source_freeze_audit_unavailable'
      ) {
        setWriteProhibited(true);
      }
      if (refreshAfterActionErrors.has(error.kind)) {
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
      await refreshOnceAfterError(error);
    } finally {
      writingRef.current = null;
      if (mountedRef.current) setWritingAction(null);
    }
  }, [
    canConfirmSourceFreeze,
    onReportUpdated,
    onUnauthorized,
    patientId,
    refreshOnceAfterError,
    sourceFreezeDraft,
    visitId,
  ]);

  const confirmArchive = useCallback(async () => {
    if (
      !archiveDraft ||
      !canConfirmArchive ||
      writingRef.current !== null
    ) {
      return;
    }
    writingRef.current = 'archive';
    setWritingAction('archive');
    setArchiveError(null);
    setLiveMessage('正在归档报告。');
    try {
      const response = await archiveClinicalReport(
        patientId,
        visitId,
        archiveDraft.reportId,
        buildArchiveClinicalReportRequest(archiveDraft),
      );
      if (!mountedRef.current) return;
      onReportUpdated(response.report);
      setArchiveReceipt(response.archiveReceipt);
      setArchiveDraft(null);
      setActiveMode('idle');
      setLiveMessage(
        response.archiveReceipt.alreadyArchived
          ? '该报告此前已经归档，本次未重复写入。'
          : '报告已完成归档。',
      );
    } catch (requestError: unknown) {
      if (!mountedRef.current) return;
      const error = toClinicalReportApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      setArchiveError(error);
      setLiveMessage(null);
      if (
        error.kind === 'clinical_report_metadata_unsupported' ||
        error.kind === 'clinical_report_archive_audit_unavailable'
      ) {
        setWriteProhibited(true);
      }
      if (
        refreshAfterActionErrors.has(error.kind) ||
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
      await refreshOnceAfterError(error);
    } finally {
      writingRef.current = null;
      if (mountedRef.current) setWritingAction(null);
    }
  }, [
    archiveDraft,
    canConfirmArchive,
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
    lockDraft,
    sourceFreezeDraft,
    archiveDraft,
    editDirty,
    submissionDirty,
    confirmationDirty,
    lockDirty,
    sourceFreezeDirty,
    archiveDirty,
    editValidation,
    submissionValidation,
    confirmationValidation,
    lockValidation,
    sourceFreezeValidation,
    archiveValidation,
    editError,
    submissionError,
    confirmationError,
    lockError,
    sourceFreezeError,
    archiveError,
    editReceipt,
    submissionReceipt,
    confirmationReceipt,
    lockReceipt,
    sourceFreezeReceipt,
    archiveReceipt,
    liveMessage,
    writeProhibited,
    canEdit,
    canSubmit,
    canConfirm,
    canLock,
    canStartSourceFreeze,
    canResumeSourceFreeze,
    canArchive,
    canSaveEdit,
    canConfirmSubmission,
    canConfirmReport,
    canConfirmLock,
    canConfirmSourceFreeze,
    canConfirmArchive,
    canContinueLockWithLatest,
    canContinueSourceFreezeWithLatest,
    canContinueArchiveWithLatest,
    canDiscardLocalSourceFreezeAndResume,
    lockVersionMatches,
    sourceFreezeVersionMatches,
    archiveVersionMatches,
    lockBlockReason,
    sourceFreezeConsistencyWarning,
    sourceFreezeBlockReason,
    archiveConsistencyWarning,
    archiveBlockReason,
    roleCanConfirm,
    roleCanLock,
    roleCanFreezeSources,
    roleCanArchive,
    openEdit,
    openSubmit,
    openConfirm,
    openLock,
    openSourceFreeze,
    openSourceFreezeResume,
    openArchive,
    cancelActive,
    cancelSourceFreeze,
    cancelArchive,
    updateEditDraft,
    updateSubmissionNote,
    setSubmissionConfirmed,
    updateConfirmationNote,
    setConfirmationConfirmed,
    updateLockNote,
    setLockConfirmed,
    updateSourceFreezeNote,
    setSourceFreezeConfirmed,
    updateArchiveNote,
    setArchiveConfirmed,
    continueEditFromLatest,
    continueSubmissionFromLatest,
    continueConfirmationFromLatest,
    continueLockWithLatest,
    continueSourceFreezeWithLatest,
    continueArchiveWithLatest,
    discardLocalSourceFreezeAndResume,
    reloadLatestAfterSourceFreezeUncertainty,
    reloadLatestAfterArchiveUncertainty,
    saveEdit,
    submitForConfirmation,
    confirmReport,
    confirmLock,
    confirmSourceFreeze,
    confirmArchive,
  };
}

export type UseClinicalReportWorkflowValue = ReturnType<
  typeof useClinicalReportWorkflow
>;
