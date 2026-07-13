'use client';

import { useClinicalReportArchiveAction } from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportArchiveAction';
import { useClinicalReportBeforeUnload } from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportBeforeUnload';
import { useClinicalReportConfirmationAction } from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportConfirmationAction';
import { useClinicalReportCorrectionAction } from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportCorrectionAction';
import { useClinicalReportEditAction } from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportEditAction';
import { useClinicalReportLockAction } from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportLockAction';
import { useClinicalReportSourceFreezeAction } from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportSourceFreezeAction';
import { useClinicalReportSubmissionAction } from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportSubmissionAction';
import { useClinicalReportWorkflowCoordinator } from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportWorkflowCoordinator';
import type {
  UseClinicalReportWorkflowOptions,
  UseClinicalReportWorkflowResult,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';
import { shouldWarnBeforeClinicalReportUnload } from '@/src/features/assessments/lib/clinical-report-workflow-draft';

export type {
  ClinicalReportWorkflowMode,
  ClinicalReportWritingAction,
  UseClinicalReportWorkflowOptions,
  UseClinicalReportWorkflowResult,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';

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
}: UseClinicalReportWorkflowOptions): UseClinicalReportWorkflowResult {
  const coordinator = useClinicalReportWorkflowCoordinator({
    patientId,
    visitId,
    onUnauthorized,
    onReportUpdated,
    refreshLatest,
  });
  const { state } = coordinator;
  const hasLocalDraft = Boolean(
    state.edit.draft ||
      state.submission.draft ||
      state.confirmation.draft ||
      state.lock.draft ||
      state.sourceFreeze.draft ||
      state.archive.draft ||
      state.correction.draft,
  );

  const edit = useClinicalReportEditAction({
    patientId,
    visitId,
    report,
    reportWriteBlocked,
    currentUserRoles,
    coordinator,
  });
  const submission = useClinicalReportSubmissionAction({
    patientId,
    visitId,
    report,
    reportWriteBlocked,
    currentUserRoles,
    coordinator,
    hasLocalDraft,
  });
  const confirmation = useClinicalReportConfirmationAction({
    patientId,
    visitId,
    report,
    reportWriteBlocked,
    currentUserRoles,
    coordinator,
    hasLocalDraft,
  });
  const lock = useClinicalReportLockAction({
    patientId,
    visitId,
    report,
    visitStatus,
    reportWriteBlocked,
    currentUserRoles,
    coordinator,
    hasLocalDraft,
  });
  const sourceFreeze = useClinicalReportSourceFreezeAction({
    patientId,
    visitId,
    report,
    visitStatus,
    reportWriteBlocked,
    currentUserRoles,
    coordinator,
    hasLocalDraft,
  });
  const archive = useClinicalReportArchiveAction({
    patientId,
    visitId,
    report,
    reportWriteBlocked,
    currentUserRoles,
    coordinator,
    hasLocalDraft,
  });
  const correction = useClinicalReportCorrectionAction({
    patientId,
    visitId,
    report,
    reportWriteBlocked,
    currentUserRoles,
    coordinator,
    hasLocalDraft,
  });

  const shouldWarnBeforeUnload =
    shouldWarnBeforeClinicalReportUnload({
      editDraft: edit.editDraft,
      submissionDraft: submission.submissionDraft,
      confirmationDraft: confirmation.confirmationDraft,
      lockDraft: lock.lockDraft,
    }) ||
    sourceFreeze.sourceFreezeDirty ||
    archive.archiveDirty ||
    correction.correctionDirty;
  useClinicalReportBeforeUnload(shouldWarnBeforeUnload);

  return {
    activeMode: state.activeMode,
    writingAction: state.writingAction,
    editDraft: edit.editDraft,
    submissionDraft: submission.submissionDraft,
    confirmationDraft: confirmation.confirmationDraft,
    lockDraft: lock.lockDraft,
    sourceFreezeDraft: sourceFreeze.sourceFreezeDraft,
    archiveDraft: archive.archiveDraft,
    correctionDraft: correction.correctionDraft,
    editDirty: edit.editDirty,
    submissionDirty: submission.submissionDirty,
    confirmationDirty: confirmation.confirmationDirty,
    lockDirty: lock.lockDirty,
    sourceFreezeDirty: sourceFreeze.sourceFreezeDirty,
    archiveDirty: archive.archiveDirty,
    correctionDirty: correction.correctionDirty,
    editValidation: edit.editValidation,
    submissionValidation: submission.submissionValidation,
    confirmationValidation: confirmation.confirmationValidation,
    lockValidation: lock.lockValidation,
    sourceFreezeValidation: sourceFreeze.sourceFreezeValidation,
    archiveValidation: archive.archiveValidation,
    correctionValidation: correction.correctionValidation,
    editError: edit.editError,
    submissionError: submission.submissionError,
    confirmationError: confirmation.confirmationError,
    lockError: lock.lockError,
    sourceFreezeError: sourceFreeze.sourceFreezeError,
    archiveError: archive.archiveError,
    correctionError: correction.correctionError,
    editReceipt: edit.editReceipt,
    submissionReceipt: submission.submissionReceipt,
    confirmationReceipt: confirmation.confirmationReceipt,
    lockReceipt: lock.lockReceipt,
    sourceFreezeReceipt: sourceFreeze.sourceFreezeReceipt,
    archiveReceipt: archive.archiveReceipt,
    correctionReceipt: correction.correctionReceipt,
    correctionSourceReport: correction.correctionSourceReport,
    liveMessage: state.liveMessage,
    writeProhibited: state.writeProhibited,
    canEdit: edit.canEdit,
    canSubmit: submission.canSubmit,
    canConfirm: confirmation.canConfirm,
    canLock: lock.canLock,
    canStartSourceFreeze: sourceFreeze.canStartSourceFreeze,
    canResumeSourceFreeze: sourceFreeze.canResumeSourceFreeze,
    canArchive: archive.canArchive,
    canStartCorrection: correction.canStartCorrection,
    canResumeCorrection: correction.canResumeCorrection,
    canSaveEdit: edit.canSaveEdit,
    canConfirmSubmission: submission.canConfirmSubmission,
    canConfirmReport: confirmation.canConfirmReport,
    canConfirmLock: lock.canConfirmLock,
    canConfirmSourceFreeze: sourceFreeze.canConfirmSourceFreeze,
    canConfirmArchive: archive.canConfirmArchive,
    canConfirmCorrection: correction.canConfirmCorrection,
    canContinueLockWithLatest: lock.canContinueLockWithLatest,
    canContinueSourceFreezeWithLatest:
      sourceFreeze.canContinueSourceFreezeWithLatest,
    canContinueArchiveWithLatest: archive.canContinueArchiveWithLatest,
    canDiscardLocalSourceFreezeAndResume:
      sourceFreeze.canDiscardLocalSourceFreezeAndResume,
    canContinueCorrectionWithLatest:
      correction.canContinueCorrectionWithLatest,
    canDiscardLocalCorrectionAndResume:
      correction.canDiscardLocalCorrectionAndResume,
    lockVersionMatches: lock.lockVersionMatches,
    sourceFreezeVersionMatches: sourceFreeze.sourceFreezeVersionMatches,
    archiveVersionMatches: archive.archiveVersionMatches,
    lockBlockReason: lock.lockBlockReason,
    sourceFreezeConsistencyWarning:
      sourceFreeze.sourceFreezeConsistencyWarning,
    sourceFreezeBlockReason: sourceFreeze.sourceFreezeBlockReason,
    archiveConsistencyWarning: archive.archiveConsistencyWarning,
    archiveBlockReason: archive.archiveBlockReason,
    correctionConsistencyWarning: correction.correctionConsistencyWarning,
    correctionBlockReason: correction.correctionBlockReason,
    correctionVersionMatches: correction.correctionVersionMatches,
    roleCanConfirm: confirmation.roleCanConfirm,
    roleCanLock: lock.roleCanLock,
    roleCanFreezeSources: sourceFreeze.roleCanFreezeSources,
    roleCanArchive: archive.roleCanArchive,
    roleCanCorrect: correction.roleCanCorrect,
    openEdit: edit.openEdit,
    openSubmit: submission.openSubmit,
    openConfirm: confirmation.openConfirm,
    openLock: lock.openLock,
    openSourceFreeze: sourceFreeze.openSourceFreeze,
    openSourceFreezeResume: sourceFreeze.openSourceFreezeResume,
    openArchive: archive.openArchive,
    openCorrection: correction.openCorrection,
    openCorrectionResume: correction.openCorrectionResume,
    cancelActive: coordinator.cancelActive,
    cancelSourceFreeze: coordinator.cancelSourceFreeze,
    cancelArchive: coordinator.cancelArchive,
    cancelCorrection: correction.cancelCorrection,
    updateEditDraft: edit.updateEditDraft,
    updateSubmissionNote: submission.updateSubmissionNote,
    setSubmissionConfirmed: submission.setSubmissionConfirmed,
    updateConfirmationNote: confirmation.updateConfirmationNote,
    setConfirmationConfirmed: confirmation.setConfirmationConfirmed,
    updateLockNote: lock.updateLockNote,
    setLockConfirmed: lock.setLockConfirmed,
    updateSourceFreezeNote: sourceFreeze.updateSourceFreezeNote,
    setSourceFreezeConfirmed: sourceFreeze.setSourceFreezeConfirmed,
    updateArchiveNote: archive.updateArchiveNote,
    setArchiveConfirmed: archive.setArchiveConfirmed,
    updateCorrectionReason: correction.updateCorrectionReason,
    updateCorrectionChangeSummary: correction.updateCorrectionChangeSummary,
    setCorrectionConfirmed: correction.setCorrectionConfirmed,
    continueEditFromLatest: edit.continueEditFromLatest,
    continueSubmissionFromLatest: submission.continueSubmissionFromLatest,
    continueConfirmationFromLatest:
      confirmation.continueConfirmationFromLatest,
    continueLockWithLatest: lock.continueLockWithLatest,
    continueSourceFreezeWithLatest:
      sourceFreeze.continueSourceFreezeWithLatest,
    continueArchiveWithLatest: archive.continueArchiveWithLatest,
    discardLocalSourceFreezeAndResume:
      sourceFreeze.discardLocalSourceFreezeAndResume,
    continueCorrectionWithLatest: correction.continueCorrectionWithLatest,
    discardLocalCorrectionAndResume:
      correction.discardLocalCorrectionAndResume,
    reloadLatestAfterSourceFreezeUncertainty:
      sourceFreeze.reloadLatestAfterSourceFreezeUncertainty,
    reloadLatestAfterArchiveUncertainty:
      archive.reloadLatestAfterArchiveUncertainty,
    reloadLatestAfterCorrectionUncertainty:
      correction.reloadLatestAfterCorrectionUncertainty,
    saveEdit: edit.saveEdit,
    submitForConfirmation: submission.submitForConfirmation,
    confirmReport: confirmation.confirmReport,
    confirmLock: lock.confirmLock,
    confirmSourceFreeze: sourceFreeze.confirmSourceFreeze,
    confirmArchive: archive.confirmArchive,
    confirmCorrection: correction.confirmCorrection,
  } satisfies UseClinicalReportWorkflowResult;
}

export type UseClinicalReportWorkflowValue = UseClinicalReportWorkflowResult;
