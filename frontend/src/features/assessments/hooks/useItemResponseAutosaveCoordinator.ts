'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AssessmentExecutionApiError,
  getScaleInstanceExecutionDetail,
  saveItemResponseDraft,
} from '@/src/features/assessments/api/assessment-execution-api';
import {
  ItemResponseAutosaveCoordinator,
  type ItemResponseAutosaveSnapshot,
  type ItemResponseAutosaveState,
  type ItemResponseAutosaveSummary,
} from '@/src/features/assessments/lib/item-response-autosave';
import type { ItemDraftState } from '@/src/features/assessments/lib/item-response-draft';
import type {
  ItemEvidenceRequirement,
  ItemResponseExecution,
  ScaleInstanceExecutionDetailResponse,
  UpdateItemResponseDraftResponse,
} from '@/src/features/assessments/types/item-response-execution';

const autosaveStates: ItemResponseAutosaveState[] = [
  'clean',
  'dirty',
  'invalid',
  'queued',
  'saving',
  'waiting_for_network',
  'reconciling',
  'conflict',
  'blocked',
];

function createEmptySummary(): ItemResponseAutosaveSummary {
  return {
    stateCounts: Object.fromEntries(
      autosaveStates.map((state) => [state, 0]),
    ) as Record<ItemResponseAutosaveState, number>,
    unsettledCount: 0,
    savingCount: 0,
    shouldBlockUnload: false,
  };
}

export type UseItemResponseAutosaveCoordinatorOptions = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  onItemResponseAccepted: (
    item: ItemResponseExecution,
    response: UpdateItemResponseDraftResponse | null,
  ) => void;
  onExecutionSummaryRefreshed: (
    detail: ScaleInstanceExecutionDetailResponse,
  ) => void;
  onUnauthorized: () => void;
};

export function useItemResponseAutosaveCoordinator(
  options: UseItemResponseAutosaveCoordinatorOptions,
) {
  const callbacksRef = useRef(options);
  const coordinatorRef = useRef<ItemResponseAutosaveCoordinator | null>(null);
  const [snapshots, setSnapshots] = useState<
    Record<string, ItemResponseAutosaveSnapshot>
  >({});
  const [summary, setSummary] =
    useState<ItemResponseAutosaveSummary>(createEmptySummary);
  const [displayNow, setDisplayNow] = useState(0);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  useEffect(() => {
    const coordinator = new ItemResponseAutosaveCoordinator({
        clock: {
          now: () => Date.now(),
          setTimeout: (callback, delayMs) =>
            window.setTimeout(callback, delayMs),
          clearTimeout: (handle) =>
            window.clearTimeout(handle as ReturnType<typeof window.setTimeout>),
        },
        isOnline: () =>
          typeof navigator === 'undefined' ? true : navigator.onLine,
        save: (itemResponseId, request) =>
          saveItemResponseDraft(
            callbacksRef.current.patientId,
            callbacksRef.current.visitId,
            callbacksRef.current.scaleInstanceId,
            itemResponseId,
            request,
          ),
        readLatest: (signal) =>
          getScaleInstanceExecutionDetail(
            callbacksRef.current.patientId,
            callbacksRef.current.visitId,
            callbacksRef.current.scaleInstanceId,
            { signal },
          ),
        getErrorKind: (error) =>
          error instanceof AssessmentExecutionApiError ? error.kind : 'unknown',
        onChange: (nextSnapshots, nextSummary) => {
          setSnapshots(nextSnapshots);
          setSummary(nextSummary);
        },
        onServerItemAccepted: (item, response) =>
          callbacksRef.current.onItemResponseAccepted(item, response),
        onExecutionSummaryRefreshed: (detail) =>
          callbacksRef.current.onExecutionSummaryRefreshed(detail),
        onUnauthorized: () => callbacksRef.current.onUnauthorized(),
      });
    coordinatorRef.current = coordinator;
    const handleOnline = () => coordinator.onNetworkChange(true);
    const handleOffline = () => coordinator.onNetworkChange(false);
    setDisplayNow(Date.now());
    const displayInterval = window.setInterval(() => {
      const now = Date.now();
      setDisplayNow(now);
      coordinator.checkpointRunningTimers(now);
    }, 1_000);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.clearInterval(displayInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      coordinator.stop();
      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null;
      }
    };
  }, [options.patientId, options.scaleInstanceId, options.visitId]);

  const initialize = useCallback(
    (items: ItemResponseExecution[]) =>
      coordinatorRef.current?.initialize(items),
    [],
  );
  const setWritesEnabled = useCallback(
    (enabled: boolean) => coordinatorRef.current?.setWritesEnabled(enabled),
    [],
  );
  const updateDraft = useCallback(
    (
      itemResponseId: string,
      draft: ItemDraftState,
      updateOptions: { immediate?: boolean } = {},
    ) =>
      coordinatorRef.current?.updateDraft(
        itemResponseId,
        draft,
        updateOptions,
      ),
    [],
  );
  const saveNow = useCallback(
    (itemResponseId: string) => coordinatorRef.current?.saveNow(itemResponseId),
    [],
  );
  const markAsAnswered = useCallback(
    (itemResponseId: string) =>
      coordinatorRef.current?.markAsAnswered(itemResponseId),
    [],
  );
  const flushQueued = useCallback(
    (itemResponseIds: readonly string[]) =>
      coordinatorRef.current?.flushQueued(itemResponseIds),
    [],
  );
  const notifyMediaRequirement = useCallback(
    (
      itemResponseId: string,
      requirement: ItemEvidenceRequirement,
      persisted: boolean,
    ) =>
      coordinatorRef.current?.notifyMediaRequirement(
        itemResponseId,
        requirement,
        persisted,
      ),
    [],
  );
  const retryServerCheck = useCallback(
    (itemResponseId: string) =>
      coordinatorRef.current?.retryServerCheck(itemResponseId),
    [],
  );
  const useServerConflictVersion = useCallback(
    (itemResponseId: string) =>
      coordinatorRef.current?.useServerConflictVersion(itemResponseId),
    [],
  );
  const useLocalConflictVersion = useCallback(
    (itemResponseId: string) =>
      coordinatorRef.current?.useLocalConflictVersion(itemResponseId),
    [],
  );

  return {
    snapshots,
    summary,
    displayNow,
    initialize,
    setWritesEnabled,
    updateDraft,
    saveNow,
    markAsAnswered,
    flushQueued,
    notifyMediaRequirement,
    retryServerCheck,
    useServerConflictVersion,
    useLocalConflictVersion,
  };
}
