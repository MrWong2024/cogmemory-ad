import { useCallback, useEffect, useReducer, useRef } from 'react';

import { refreshClinicalReportLatestAtMostOnce, toClinicalReportApiError } from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import {
  clinicalReportWorkflowReducer,
  createClinicalReportWorkflowState,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.state';
import type {
  ClinicalReportWorkflowCoordinator,
  ClinicalReportWorkflowExecuteOptions,
  ClinicalReportWritingAction,
  UseClinicalReportWorkflowOptions,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow.types';

type CoordinatorOptions = Pick<
  UseClinicalReportWorkflowOptions,
  | 'patientId'
  | 'visitId'
  | 'onUnauthorized'
  | 'onReportUpdated'
  | 'refreshLatest'
>;

export function useClinicalReportWorkflowCoordinator({
  patientId,
  visitId,
  onUnauthorized,
  onReportUpdated,
  refreshLatest,
}: CoordinatorOptions): ClinicalReportWorkflowCoordinator {
  const mountedRef = useRef(true);
  const writingRef = useRef<ClinicalReportWritingAction>(null);
  const [state, dispatch] = useReducer(
    clinicalReportWorkflowReducer,
    undefined,
    createClinicalReportWorkflowState,
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    writingRef.current = null;
    dispatch({ type: 'RESET' });
  }, [patientId, visitId]);

  const setEditDraft = useCallback<
    ClinicalReportWorkflowCoordinator['setEditDraft']
  >((value) => dispatch({ type: 'SET_EDIT_DRAFT', value }), []);
  const setSubmissionDraft = useCallback<
    ClinicalReportWorkflowCoordinator['setSubmissionDraft']
  >((value) => dispatch({ type: 'SET_SUBMISSION_DRAFT', value }), []);
  const setConfirmationDraft = useCallback<
    ClinicalReportWorkflowCoordinator['setConfirmationDraft']
  >((value) => dispatch({ type: 'SET_CONFIRMATION_DRAFT', value }), []);
  const setLockDraft = useCallback<
    ClinicalReportWorkflowCoordinator['setLockDraft']
  >((value) => dispatch({ type: 'SET_LOCK_DRAFT', value }), []);
  const setSourceFreezeDraft = useCallback<
    ClinicalReportWorkflowCoordinator['setSourceFreezeDraft']
  >((value) => dispatch({ type: 'SET_SOURCE_FREEZE_DRAFT', value }), []);
  const setArchiveDraft = useCallback<
    ClinicalReportWorkflowCoordinator['setArchiveDraft']
  >((value) => dispatch({ type: 'SET_ARCHIVE_DRAFT', value }), []);
  const setEditError = useCallback<
    ClinicalReportWorkflowCoordinator['setEditError']
  >((error) => dispatch({ type: 'SET_EDIT_ERROR', error }), []);
  const setSubmissionError = useCallback<
    ClinicalReportWorkflowCoordinator['setSubmissionError']
  >((error) => dispatch({ type: 'SET_SUBMISSION_ERROR', error }), []);
  const setConfirmationError = useCallback<
    ClinicalReportWorkflowCoordinator['setConfirmationError']
  >((error) => dispatch({ type: 'SET_CONFIRMATION_ERROR', error }), []);
  const setLockError = useCallback<
    ClinicalReportWorkflowCoordinator['setLockError']
  >((error) => dispatch({ type: 'SET_LOCK_ERROR', error }), []);
  const setSourceFreezeError = useCallback<
    ClinicalReportWorkflowCoordinator['setSourceFreezeError']
  >((error) => dispatch({ type: 'SET_SOURCE_FREEZE_ERROR', error }), []);
  const setArchiveError = useCallback<
    ClinicalReportWorkflowCoordinator['setArchiveError']
  >((error) => dispatch({ type: 'SET_ARCHIVE_ERROR', error }), []);

  const activateEdit = useCallback<
    ClinicalReportWorkflowCoordinator['activateEdit']
  >((draft) => dispatch({ type: 'OPEN_EDIT', draft }), []);
  const activateSubmission = useCallback<
    ClinicalReportWorkflowCoordinator['activateSubmission']
  >((draft) => dispatch({ type: 'OPEN_SUBMISSION', draft }), []);
  const activateConfirmation = useCallback<
    ClinicalReportWorkflowCoordinator['activateConfirmation']
  >((draft) => dispatch({ type: 'OPEN_CONFIRMATION', draft }), []);
  const activateLock = useCallback<
    ClinicalReportWorkflowCoordinator['activateLock']
  >((draft) => dispatch({ type: 'OPEN_LOCK', draft }), []);
  const activateSourceFreeze = useCallback<
    ClinicalReportWorkflowCoordinator['activateSourceFreeze']
  >((draft) => dispatch({ type: 'OPEN_SOURCE_FREEZE', draft }), []);
  const activateArchive = useCallback<
    ClinicalReportWorkflowCoordinator['activateArchive']
  >((draft) => dispatch({ type: 'OPEN_ARCHIVE', draft }), []);

  const clearActionErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_ACTION_ERRORS' });
  }, []);
  const clearAllDrafts = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_DRAFTS' });
  }, []);
  const setLiveMessage = useCallback((message: string | null) => {
    dispatch({ type: 'SET_LIVE_MESSAGE', message });
  }, []);
  const prohibitWrites = useCallback(() => {
    dispatch({ type: 'SET_WRITE_PROHIBITED', prohibited: true });
  }, []);
  const completeEdit = useCallback<
    ClinicalReportWorkflowCoordinator['completeEdit']
  >((receipt, message) => {
    dispatch({ type: 'COMPLETE_EDIT', receipt, message });
  }, []);
  const completeSubmission = useCallback<
    ClinicalReportWorkflowCoordinator['completeSubmission']
  >((receipt, message) => {
    dispatch({ type: 'COMPLETE_SUBMISSION', receipt, message });
  }, []);
  const completeConfirmation = useCallback<
    ClinicalReportWorkflowCoordinator['completeConfirmation']
  >((receipt, message) => {
    dispatch({ type: 'COMPLETE_CONFIRMATION', receipt, message });
  }, []);
  const completeLock = useCallback<
    ClinicalReportWorkflowCoordinator['completeLock']
  >((receipt, message) => {
    dispatch({ type: 'COMPLETE_LOCK', receipt, message });
  }, []);
  const completeSourceFreeze = useCallback<
    ClinicalReportWorkflowCoordinator['completeSourceFreeze']
  >((receipt, message) => {
    dispatch({ type: 'COMPLETE_SOURCE_FREEZE', receipt, message });
  }, []);
  const completeArchive = useCallback<
    ClinicalReportWorkflowCoordinator['completeArchive']
  >((receipt, message) => {
    dispatch({ type: 'COMPLETE_ARCHIVE', receipt, message });
  }, []);
  const cancelActive = useCallback(() => {
    if (writingRef.current !== null) return;
    dispatch({ type: 'CANCEL_ALL' });
  }, []);
  const cancelSourceFreeze = useCallback(() => {
    if (writingRef.current !== null) return;
    dispatch({ type: 'CANCEL_SOURCE_FREEZE' });
  }, []);
  const cancelArchive = useCallback(() => {
    if (writingRef.current !== null) return;
    dispatch({ type: 'CANCEL_ARCHIVE' });
  }, []);

  const applyReportUpdate = useCallback(
    (report: Parameters<typeof onReportUpdated>[0]) => {
      onReportUpdated(report);
    },
    [onReportUpdated],
  );

  const refreshAfterError = useCallback(
    async (error: Parameters<typeof refreshClinicalReportLatestAtMostOnce>[0]) => {
      await refreshClinicalReportLatestAtMostOnce(error, refreshLatest);
    },
    [refreshLatest],
  );

  const execute = useCallback(
    async <Response,>({
      action,
      pendingMessage,
      request,
      onSuccess,
      onError,
    }: ClinicalReportWorkflowExecuteOptions<Response>): Promise<void> => {
      if (
        !mountedRef.current ||
        writingRef.current !== null ||
        stateRef.current.writingAction !== null
      ) {
        return;
      }
      writingRef.current = action;
      dispatch({ type: 'BEGIN_WRITE', action, message: pendingMessage });
      try {
        const response = await request();
        if (!mountedRef.current) return;
        onSuccess(response);
      } catch (requestError: unknown) {
        if (!mountedRef.current) return;
        const error = toClinicalReportApiError(requestError);
        if (error.kind === 'unauthenticated') {
          onUnauthorized();
          return;
        }
        await onError(error);
      } finally {
        writingRef.current = null;
        if (mountedRef.current) dispatch({ type: 'FINISH_WRITE' });
      }
    },
    [onUnauthorized],
  );

  return {
    state,
    setEditDraft,
    setSubmissionDraft,
    setConfirmationDraft,
    setLockDraft,
    setSourceFreezeDraft,
    setArchiveDraft,
    setEditError,
    setSubmissionError,
    setConfirmationError,
    setLockError,
    setSourceFreezeError,
    setArchiveError,
    activateEdit,
    activateSubmission,
    activateConfirmation,
    activateLock,
    activateSourceFreeze,
    activateArchive,
    cancelActive,
    cancelSourceFreeze,
    cancelArchive,
    clearActionErrors,
    clearAllDrafts,
    setLiveMessage,
    prohibitWrites,
    completeEdit,
    completeSubmission,
    completeConfirmation,
    completeLock,
    completeSourceFreeze,
    completeArchive,
    execute,
    applyReportUpdate,
    refreshAfterError,
    refreshLatest,
  };
}
