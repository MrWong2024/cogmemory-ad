import type { Dispatch, SetStateAction } from 'react';

import type { ClinicalReportApiError } from '@/src/features/assessments/api/clinical-report-api';
import type { ClinicalReportArchiveDraft } from '@/src/features/assessments/lib/clinical-report-archive-draft';
import type {
  ClinicalReportCorrectionValidation,
  CorrectionDraft,
} from '@/src/features/assessments/lib/clinical-report-correction-draft';
import type { ClinicalReportSourceFreezeDraft } from '@/src/features/assessments/lib/clinical-report-source-freeze-draft';
import type {
  ClinicalReportConfirmationDraft,
  ClinicalReportEditDraft,
  ClinicalReportLockDraft,
  ClinicalReportSubmissionDraft,
  ClinicalReportWorkflowValidation,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import type {
  ArchiveClinicalReportReceipt,
  ClinicalReport,
  ClinicalReportEditReceipt,
  CreateClinicalReportCorrectionReceipt,
  ConfirmClinicalReportReceipt,
  FreezeClinicalReportSourcesReceipt,
  LockClinicalReportReceipt,
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
  | 'archive'
  | 'correction';

export type ClinicalReportWritingAction = Exclude<
  ClinicalReportWorkflowMode,
  'idle'
> | null;

export type UseClinicalReportWorkflowOptions = {
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

export type ClinicalReportWorkflowState = {
  activeMode: ClinicalReportWorkflowMode;
  writingAction: ClinicalReportWritingAction;
  edit: {
    draft: ClinicalReportEditDraft | null;
    error: ClinicalReportApiError | null;
    receipt: ClinicalReportEditReceipt | null;
  };
  submission: {
    draft: ClinicalReportSubmissionDraft | null;
    error: ClinicalReportApiError | null;
    receipt: SubmitClinicalReportReceipt | null;
  };
  confirmation: {
    draft: ClinicalReportConfirmationDraft | null;
    error: ClinicalReportApiError | null;
    receipt: ConfirmClinicalReportReceipt | null;
  };
  lock: {
    draft: ClinicalReportLockDraft | null;
    error: ClinicalReportApiError | null;
    receipt: LockClinicalReportReceipt | null;
  };
  sourceFreeze: {
    draft: ClinicalReportSourceFreezeDraft | null;
    error: ClinicalReportApiError | null;
    receipt: FreezeClinicalReportSourcesReceipt | null;
  };
  archive: {
    draft: ClinicalReportArchiveDraft | null;
    error: ClinicalReportApiError | null;
    receipt: ArchiveClinicalReportReceipt | null;
  };
  correction: {
    draft: CorrectionDraft | null;
    error: ClinicalReportApiError | null;
    receipt: CreateClinicalReportCorrectionReceipt | null;
    sourceReport: ClinicalReport | null;
  };
  liveMessage: string | null;
  writeProhibited: boolean;
};

export type ClinicalReportWorkflowStateAction =
  | { type: 'RESET' }
  | {
      type: 'OPEN_EDIT';
      draft: ClinicalReportEditDraft;
    }
  | {
      type: 'OPEN_SUBMISSION';
      draft: ClinicalReportSubmissionDraft;
    }
  | {
      type: 'OPEN_CONFIRMATION';
      draft: ClinicalReportConfirmationDraft;
    }
  | { type: 'OPEN_LOCK'; draft: ClinicalReportLockDraft }
  | {
      type: 'OPEN_SOURCE_FREEZE';
      draft: ClinicalReportSourceFreezeDraft;
    }
  | { type: 'OPEN_ARCHIVE'; draft: ClinicalReportArchiveDraft }
  | { type: 'OPEN_CORRECTION'; draft: CorrectionDraft }
  | { type: 'CANCEL_ALL' }
  | { type: 'CANCEL_SOURCE_FREEZE' }
  | { type: 'CANCEL_ARCHIVE' }
  | { type: 'CANCEL_CORRECTION' }
  | { type: 'CLEAR_ACTION_ERRORS' }
  | { type: 'CLEAR_ALL_DRAFTS' }
  | {
      type: 'SET_EDIT_DRAFT';
      value: SetStateAction<ClinicalReportEditDraft | null>;
    }
  | {
      type: 'SET_SUBMISSION_DRAFT';
      value: SetStateAction<ClinicalReportSubmissionDraft | null>;
    }
  | {
      type: 'SET_CONFIRMATION_DRAFT';
      value: SetStateAction<ClinicalReportConfirmationDraft | null>;
    }
  | {
      type: 'SET_LOCK_DRAFT';
      value: SetStateAction<ClinicalReportLockDraft | null>;
    }
  | {
      type: 'SET_SOURCE_FREEZE_DRAFT';
      value: SetStateAction<ClinicalReportSourceFreezeDraft | null>;
    }
  | {
      type: 'SET_ARCHIVE_DRAFT';
      value: SetStateAction<ClinicalReportArchiveDraft | null>;
    }
  | {
      type: 'SET_CORRECTION_DRAFT';
      value: SetStateAction<CorrectionDraft | null>;
    }
  | { type: 'SET_EDIT_ERROR'; error: ClinicalReportApiError | null }
  | {
      type: 'SET_SUBMISSION_ERROR';
      error: ClinicalReportApiError | null;
    }
  | {
      type: 'SET_CONFIRMATION_ERROR';
      error: ClinicalReportApiError | null;
    }
  | { type: 'SET_LOCK_ERROR'; error: ClinicalReportApiError | null }
  | {
      type: 'SET_SOURCE_FREEZE_ERROR';
      error: ClinicalReportApiError | null;
    }
  | { type: 'SET_ARCHIVE_ERROR'; error: ClinicalReportApiError | null }
  | { type: 'SET_CORRECTION_ERROR'; error: ClinicalReportApiError | null }
  | { type: 'SET_LIVE_MESSAGE'; message: string | null }
  | { type: 'SET_WRITE_PROHIBITED'; prohibited: boolean }
  | {
      type: 'BEGIN_WRITE';
      action: Exclude<ClinicalReportWritingAction, null>;
      message: string;
    }
  | { type: 'FINISH_WRITE' }
  | {
      type: 'COMPLETE_EDIT';
      receipt: ClinicalReportEditReceipt;
      message: string;
    }
  | {
      type: 'COMPLETE_SUBMISSION';
      receipt: SubmitClinicalReportReceipt;
      message: string;
    }
  | {
      type: 'COMPLETE_CONFIRMATION';
      receipt: ConfirmClinicalReportReceipt;
      message: string;
    }
  | {
      type: 'COMPLETE_LOCK';
      receipt: LockClinicalReportReceipt;
      message: string;
    }
  | {
      type: 'COMPLETE_SOURCE_FREEZE';
      receipt: FreezeClinicalReportSourcesReceipt;
      message: string;
    }
  | {
      type: 'COMPLETE_ARCHIVE';
      receipt: ArchiveClinicalReportReceipt;
      message: string;
    }
  | {
      type: 'COMPLETE_CORRECTION';
      receipt: CreateClinicalReportCorrectionReceipt;
      sourceReport: ClinicalReport;
      message: string;
    };

export type ClinicalReportWorkflowActionSetters = {
  setEditDraft: Dispatch<SetStateAction<ClinicalReportEditDraft | null>>;
  setSubmissionDraft: Dispatch<
    SetStateAction<ClinicalReportSubmissionDraft | null>
  >;
  setConfirmationDraft: Dispatch<
    SetStateAction<ClinicalReportConfirmationDraft | null>
  >;
  setLockDraft: Dispatch<SetStateAction<ClinicalReportLockDraft | null>>;
  setSourceFreezeDraft: Dispatch<
    SetStateAction<ClinicalReportSourceFreezeDraft | null>
  >;
  setArchiveDraft: Dispatch<SetStateAction<ClinicalReportArchiveDraft | null>>;
  setCorrectionDraft: Dispatch<SetStateAction<CorrectionDraft | null>>;
  setEditError: (error: ClinicalReportApiError | null) => void;
  setSubmissionError: (error: ClinicalReportApiError | null) => void;
  setConfirmationError: (error: ClinicalReportApiError | null) => void;
  setLockError: (error: ClinicalReportApiError | null) => void;
  setSourceFreezeError: (error: ClinicalReportApiError | null) => void;
  setArchiveError: (error: ClinicalReportApiError | null) => void;
  setCorrectionError: (error: ClinicalReportApiError | null) => void;
};

export type ClinicalReportWorkflowExecuteOptions<Response> = {
  action: Exclude<ClinicalReportWritingAction, null>;
  pendingMessage: string;
  request: () => Promise<Response>;
  onSuccess: (response: Response) => void;
  onError: (error: ClinicalReportApiError) => Promise<void> | void;
};

export type ClinicalReportWorkflowCoordinator =
  ClinicalReportWorkflowActionSetters & {
    state: ClinicalReportWorkflowState;
    activateEdit: (draft: ClinicalReportEditDraft) => void;
    activateSubmission: (draft: ClinicalReportSubmissionDraft) => void;
    activateConfirmation: (draft: ClinicalReportConfirmationDraft) => void;
    activateLock: (draft: ClinicalReportLockDraft) => void;
    activateSourceFreeze: (draft: ClinicalReportSourceFreezeDraft) => void;
    activateArchive: (draft: ClinicalReportArchiveDraft) => void;
    activateCorrection: (draft: CorrectionDraft) => void;
    cancelActive: () => void;
    cancelSourceFreeze: () => void;
    cancelArchive: () => void;
    cancelCorrection: () => void;
    clearActionErrors: () => void;
    clearAllDrafts: () => void;
    setLiveMessage: (message: string | null) => void;
    prohibitWrites: () => void;
    completeEdit: (receipt: ClinicalReportEditReceipt, message: string) => void;
    completeSubmission: (
      receipt: SubmitClinicalReportReceipt,
      message: string,
    ) => void;
    completeConfirmation: (
      receipt: ConfirmClinicalReportReceipt,
      message: string,
    ) => void;
    completeLock: (receipt: LockClinicalReportReceipt, message: string) => void;
    completeSourceFreeze: (
      receipt: FreezeClinicalReportSourcesReceipt,
      message: string,
    ) => void;
    completeArchive: (
      receipt: ArchiveClinicalReportReceipt,
      message: string,
    ) => void;
    completeCorrection: (
      receipt: CreateClinicalReportCorrectionReceipt,
      sourceReport: ClinicalReport,
      message: string,
    ) => void;
    execute: <Response>(
      options: ClinicalReportWorkflowExecuteOptions<Response>,
    ) => Promise<void>;
    applyReportUpdate: (report: ClinicalReport) => void;
    refreshAfterError: (error: ClinicalReportApiError) => Promise<void>;
    refreshLatest: () => Promise<ClinicalReport | null>;
  };

export type UseClinicalReportWorkflowResult = {
  activeMode: ClinicalReportWorkflowMode;
  writingAction: ClinicalReportWritingAction;
  editDraft: ClinicalReportEditDraft | null;
  submissionDraft: ClinicalReportSubmissionDraft | null;
  confirmationDraft: ClinicalReportConfirmationDraft | null;
  lockDraft: ClinicalReportLockDraft | null;
  sourceFreezeDraft: ClinicalReportSourceFreezeDraft | null;
  archiveDraft: ClinicalReportArchiveDraft | null;
  correctionDraft: CorrectionDraft | null;
  editDirty: boolean;
  submissionDirty: boolean;
  confirmationDirty: boolean;
  lockDirty: boolean;
  sourceFreezeDirty: boolean;
  archiveDirty: boolean;
  correctionDirty: boolean;
  editValidation: ClinicalReportWorkflowValidation;
  submissionValidation: ClinicalReportWorkflowValidation;
  confirmationValidation: ClinicalReportWorkflowValidation;
  lockValidation: ClinicalReportWorkflowValidation;
  sourceFreezeValidation: ClinicalReportWorkflowValidation;
  archiveValidation: ClinicalReportWorkflowValidation;
  correctionValidation: ClinicalReportCorrectionValidation;
  editError: ClinicalReportApiError | null;
  submissionError: ClinicalReportApiError | null;
  confirmationError: ClinicalReportApiError | null;
  lockError: ClinicalReportApiError | null;
  sourceFreezeError: ClinicalReportApiError | null;
  archiveError: ClinicalReportApiError | null;
  correctionError: ClinicalReportApiError | null;
  editReceipt: ClinicalReportEditReceipt | null;
  submissionReceipt: SubmitClinicalReportReceipt | null;
  confirmationReceipt: ConfirmClinicalReportReceipt | null;
  lockReceipt: LockClinicalReportReceipt | null;
  sourceFreezeReceipt: FreezeClinicalReportSourcesReceipt | null;
  archiveReceipt: ArchiveClinicalReportReceipt | null;
  correctionReceipt: CreateClinicalReportCorrectionReceipt | null;
  correctionSourceReport: ClinicalReport | null;
  liveMessage: string | null;
  writeProhibited: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  canConfirm: boolean;
  canLock: boolean;
  canStartSourceFreeze: boolean;
  canResumeSourceFreeze: boolean;
  canArchive: boolean;
  canStartCorrection: boolean;
  canResumeCorrection: boolean;
  canSaveEdit: boolean;
  canConfirmSubmission: boolean;
  canConfirmReport: boolean;
  canConfirmLock: boolean;
  canConfirmSourceFreeze: boolean;
  canConfirmArchive: boolean;
  canConfirmCorrection: boolean;
  canContinueLockWithLatest: boolean;
  canContinueSourceFreezeWithLatest: boolean;
  canContinueArchiveWithLatest: boolean;
  canDiscardLocalSourceFreezeAndResume: boolean;
  canContinueCorrectionWithLatest: boolean;
  canDiscardLocalCorrectionAndResume: boolean;
  lockVersionMatches: boolean;
  sourceFreezeVersionMatches: boolean;
  archiveVersionMatches: boolean;
  lockBlockReason: string | null;
  sourceFreezeConsistencyWarning: string | null;
  sourceFreezeBlockReason: string | null;
  archiveConsistencyWarning: string | null;
  archiveBlockReason: string | null;
  correctionConsistencyWarning: string | null;
  correctionBlockReason: string | null;
  correctionVersionMatches: boolean;
  roleCanConfirm: boolean;
  roleCanLock: boolean;
  roleCanFreezeSources: boolean;
  roleCanArchive: boolean;
  roleCanCorrect: boolean;
  openEdit: () => void;
  openSubmit: () => void;
  openConfirm: () => void;
  openLock: () => void;
  openSourceFreeze: () => void;
  openSourceFreezeResume: () => void;
  openArchive: () => void;
  openCorrection: () => void;
  openCorrectionResume: () => void;
  cancelActive: () => void;
  cancelSourceFreeze: () => void;
  cancelArchive: () => void;
  cancelCorrection: () => void;
  updateEditDraft: (
    field: 'doctorOpinion' | 'recommendationText' | 'editNote',
    value: string,
  ) => void;
  updateSubmissionNote: (value: string) => void;
  setSubmissionConfirmed: (confirmed: boolean) => void;
  updateConfirmationNote: (value: string) => void;
  setConfirmationConfirmed: (confirmed: boolean) => void;
  updateLockNote: (value: string) => void;
  setLockConfirmed: (confirmed: boolean) => void;
  updateSourceFreezeNote: (value: string) => void;
  setSourceFreezeConfirmed: (confirmed: boolean) => void;
  updateArchiveNote: (value: string) => void;
  setArchiveConfirmed: (confirmed: boolean) => void;
  updateCorrectionReason: (value: string) => void;
  updateCorrectionChangeSummary: (value: string) => void;
  setCorrectionConfirmed: (confirmed: boolean) => void;
  continueEditFromLatest: () => void;
  continueSubmissionFromLatest: () => void;
  continueConfirmationFromLatest: () => void;
  continueLockWithLatest: () => void;
  continueSourceFreezeWithLatest: () => void;
  continueArchiveWithLatest: () => void;
  discardLocalSourceFreezeAndResume: () => void;
  continueCorrectionWithLatest: () => void;
  discardLocalCorrectionAndResume: () => void;
  reloadLatestAfterSourceFreezeUncertainty: () => Promise<void>;
  reloadLatestAfterArchiveUncertainty: () => Promise<void>;
  reloadLatestAfterCorrectionUncertainty: () => Promise<void>;
  saveEdit: () => Promise<void>;
  submitForConfirmation: () => Promise<void>;
  confirmReport: () => Promise<void>;
  confirmLock: () => Promise<void>;
  confirmSourceFreeze: () => Promise<void>;
  confirmArchive: () => Promise<void>;
  confirmCorrection: () => Promise<void>;
};
