import type {
  ClinicalReportWorkflowState,
  ClinicalReportWorkflowStateAction,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';

export function createClinicalReportWorkflowState(): ClinicalReportWorkflowState {
  return {
    activeMode: 'idle',
    writingAction: null,
    edit: { draft: null, error: null, receipt: null },
    submission: { draft: null, error: null, receipt: null },
    confirmation: { draft: null, error: null, receipt: null },
    lock: { draft: null, error: null, receipt: null },
    sourceFreeze: { draft: null, error: null, receipt: null },
    archive: { draft: null, error: null, receipt: null },
    correction: {
      draft: null,
      error: null,
      receipt: null,
      sourceReport: null,
    },
    liveMessage: null,
    writeProhibited: false,
  };
}

function clearDrafts(
  state: ClinicalReportWorkflowState,
): ClinicalReportWorkflowState {
  return {
    ...state,
    edit: { ...state.edit, draft: null },
    submission: { ...state.submission, draft: null },
    confirmation: { ...state.confirmation, draft: null },
    lock: { ...state.lock, draft: null },
    sourceFreeze: { ...state.sourceFreeze, draft: null },
    archive: { ...state.archive, draft: null },
    correction: { ...state.correction, draft: null },
  };
}

function clearErrors(
  state: ClinicalReportWorkflowState,
): ClinicalReportWorkflowState {
  return {
    ...state,
    edit: { ...state.edit, error: null },
    submission: { ...state.submission, error: null },
    confirmation: { ...state.confirmation, error: null },
    lock: { ...state.lock, error: null },
    sourceFreeze: { ...state.sourceFreeze, error: null },
    archive: { ...state.archive, error: null },
    correction: { ...state.correction, error: null },
    liveMessage: null,
  };
}

function prepareOpen(
  state: ClinicalReportWorkflowState,
): ClinicalReportWorkflowState {
  return clearDrafts(clearErrors(state));
}

function resolveValue<Value>(
  current: Value,
  value: Value | ((previous: Value) => Value),
): Value {
  return typeof value === 'function'
    ? (value as (previous: Value) => Value)(current)
    : value;
}

export function clinicalReportWorkflowReducer(
  state: ClinicalReportWorkflowState,
  action: ClinicalReportWorkflowStateAction,
): ClinicalReportWorkflowState {
  switch (action.type) {
    case 'RESET':
      return createClinicalReportWorkflowState();
    case 'OPEN_EDIT': {
      const next = prepareOpen(state);
      return {
        ...next,
        activeMode: 'edit',
        edit: { ...next.edit, draft: action.draft },
      };
    }
    case 'OPEN_SUBMISSION': {
      const next = prepareOpen(state);
      return {
        ...next,
        activeMode: 'submit',
        submission: { ...next.submission, draft: action.draft },
      };
    }
    case 'OPEN_CONFIRMATION': {
      const next = prepareOpen(state);
      return {
        ...next,
        activeMode: 'confirm',
        confirmation: { ...next.confirmation, draft: action.draft },
      };
    }
    case 'OPEN_LOCK': {
      const next = prepareOpen(state);
      return {
        ...next,
        activeMode: 'lock',
        lock: { ...next.lock, draft: action.draft },
      };
    }
    case 'OPEN_SOURCE_FREEZE': {
      const next = prepareOpen(state);
      return {
        ...next,
        activeMode: 'source_freeze',
        sourceFreeze: { ...next.sourceFreeze, draft: action.draft },
      };
    }
    case 'OPEN_ARCHIVE': {
      const next = prepareOpen(state);
      return {
        ...next,
        activeMode: 'archive',
        archive: { ...next.archive, draft: action.draft },
      };
    }
    case 'OPEN_CORRECTION': {
      const next = prepareOpen(state);
      return {
        ...next,
        activeMode: 'correction',
        correction: { ...next.correction, draft: action.draft },
      };
    }
    case 'CANCEL_ALL':
      return {
        ...clearDrafts(clearErrors(state)),
        activeMode: 'idle',
      };
    case 'CANCEL_SOURCE_FREEZE':
      return {
        ...state,
        activeMode: 'idle',
        sourceFreeze: { ...state.sourceFreeze, draft: null, error: null },
        liveMessage: null,
      };
    case 'CANCEL_ARCHIVE':
      return {
        ...state,
        activeMode: 'idle',
        archive: { ...state.archive, draft: null, error: null },
        liveMessage: null,
      };
    case 'CANCEL_CORRECTION':
      return {
        ...state,
        activeMode: 'idle',
        correction: { ...state.correction, draft: null, error: null },
        liveMessage: null,
      };
    case 'CLEAR_ACTION_ERRORS':
      return clearErrors(state);
    case 'CLEAR_ALL_DRAFTS':
      return clearDrafts(state);
    case 'SET_EDIT_DRAFT':
      return {
        ...state,
        edit: {
          ...state.edit,
          draft: resolveValue(state.edit.draft, action.value),
        },
      };
    case 'SET_SUBMISSION_DRAFT':
      return {
        ...state,
        submission: {
          ...state.submission,
          draft: resolveValue(state.submission.draft, action.value),
        },
      };
    case 'SET_CONFIRMATION_DRAFT':
      return {
        ...state,
        confirmation: {
          ...state.confirmation,
          draft: resolveValue(state.confirmation.draft, action.value),
        },
      };
    case 'SET_LOCK_DRAFT':
      return {
        ...state,
        lock: {
          ...state.lock,
          draft: resolveValue(state.lock.draft, action.value),
        },
      };
    case 'SET_SOURCE_FREEZE_DRAFT':
      return {
        ...state,
        sourceFreeze: {
          ...state.sourceFreeze,
          draft: resolveValue(state.sourceFreeze.draft, action.value),
        },
      };
    case 'SET_ARCHIVE_DRAFT':
      return {
        ...state,
        archive: {
          ...state.archive,
          draft: resolveValue(state.archive.draft, action.value),
        },
      };
    case 'SET_CORRECTION_DRAFT':
      return {
        ...state,
        correction: {
          ...state.correction,
          draft: resolveValue(state.correction.draft, action.value),
        },
      };
    case 'SET_EDIT_ERROR':
      return { ...state, edit: { ...state.edit, error: action.error } };
    case 'SET_SUBMISSION_ERROR':
      return {
        ...state,
        submission: { ...state.submission, error: action.error },
      };
    case 'SET_CONFIRMATION_ERROR':
      return {
        ...state,
        confirmation: { ...state.confirmation, error: action.error },
      };
    case 'SET_LOCK_ERROR':
      return { ...state, lock: { ...state.lock, error: action.error } };
    case 'SET_SOURCE_FREEZE_ERROR':
      return {
        ...state,
        sourceFreeze: { ...state.sourceFreeze, error: action.error },
      };
    case 'SET_ARCHIVE_ERROR':
      return { ...state, archive: { ...state.archive, error: action.error } };
    case 'SET_CORRECTION_ERROR':
      return {
        ...state,
        correction: { ...state.correction, error: action.error },
      };
    case 'SET_LIVE_MESSAGE':
      return { ...state, liveMessage: action.message };
    case 'SET_WRITE_PROHIBITED':
      return { ...state, writeProhibited: action.prohibited };
    case 'BEGIN_WRITE': {
      const next = {
        ...state,
        writingAction: action.action,
        liveMessage: action.message,
      };
      switch (action.action) {
        case 'edit':
          return { ...next, edit: { ...next.edit, error: null } };
        case 'submit':
          return {
            ...next,
            submission: { ...next.submission, error: null },
          };
        case 'confirm':
          return {
            ...next,
            confirmation: { ...next.confirmation, error: null },
          };
        case 'lock':
          return { ...next, lock: { ...next.lock, error: null } };
        case 'source_freeze':
          return {
            ...next,
            sourceFreeze: { ...next.sourceFreeze, error: null },
          };
        case 'archive':
          return { ...next, archive: { ...next.archive, error: null } };
        case 'correction':
          return {
            ...next,
            correction: { ...next.correction, error: null },
          };
      }
    }
    case 'FINISH_WRITE':
      return { ...state, writingAction: null };
    case 'COMPLETE_EDIT':
      return {
        ...state,
        activeMode: 'idle',
        edit: { draft: null, error: null, receipt: action.receipt },
        liveMessage: action.message,
      };
    case 'COMPLETE_SUBMISSION':
      return {
        ...state,
        activeMode: 'idle',
        edit: { ...state.edit, draft: null },
        submission: { draft: null, error: null, receipt: action.receipt },
        liveMessage: action.message,
      };
    case 'COMPLETE_CONFIRMATION':
      return {
        ...state,
        activeMode: 'idle',
        confirmation: { draft: null, error: null, receipt: action.receipt },
        liveMessage: action.message,
      };
    case 'COMPLETE_LOCK':
      return {
        ...state,
        activeMode: 'idle',
        lock: { draft: null, error: null, receipt: action.receipt },
        liveMessage: action.message,
      };
    case 'COMPLETE_SOURCE_FREEZE':
      return {
        ...state,
        activeMode: 'idle',
        sourceFreeze: { draft: null, error: null, receipt: action.receipt },
        liveMessage: action.message,
      };
    case 'COMPLETE_ARCHIVE':
      return {
        ...state,
        activeMode: 'idle',
        archive: { draft: null, error: null, receipt: action.receipt },
        liveMessage: action.message,
      };
    case 'COMPLETE_CORRECTION':
      return {
        ...state,
        activeMode: 'idle',
        correction: {
          draft: null,
          error: null,
          receipt: action.receipt,
          sourceReport: action.sourceReport,
        },
        liveMessage: action.message,
      };
  }
}
