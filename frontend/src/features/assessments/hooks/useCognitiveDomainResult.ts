'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CognitiveDomainApiError,
  computeCognitiveDomainResult,
  getLatestCognitiveDomainResult,
} from '@/src/features/assessments/api/cognitive-domain-api';
import { getCognitiveDomainApiErrorMessage } from '@/src/features/assessments/lib/cognitive-domain-display';
import type { CognitiveDomainResultDetailResponse } from '@/src/features/assessments/types/cognitive-domain-result';
import type { ProvisionalScoreResult } from '@/src/features/assessments/types/provisional-scoring';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

export type CognitiveDomainLatestStatus =
  | 'idle'
  | 'waiting_for_score'
  | 'loading'
  | 'not_found'
  | 'loaded'
  | 'forbidden'
  | 'error';

export type CognitiveDomainSourceScoreQueryStatus =
  | 'idle'
  | 'loading'
  | 'no_result'
  | 'loaded'
  | 'forbidden'
  | 'error';

type SourceScoreResult = Pick<
  ProvisionalScoreResult,
  'id' | 'status' | 'isFinal'
>;

type UseCognitiveDomainResultOptions = {
  patientId: string;
  visitId: string;
  scaleInstanceId: string;
  visitStatus: AssessmentVisitStatus | null;
  scaleInstanceStatus: AssessmentVisitStatus | null;
  sourceScoreResult: SourceScoreResult | null;
  sourceScoreQueryStatus: CognitiveDomainSourceScoreQueryStatus;
  localBlockReason: string | null;
  onUnauthorized: () => void;
  onRefreshSourceScoreResult: () => void;
};

export type UseCognitiveDomainResultValue = {
  detail: CognitiveDomainResultDetailResponse | null;
  status: CognitiveDomainLatestStatus;
  latestError: CognitiveDomainApiError | null;
  computeError: CognitiveDomainApiError | null;
  computing: boolean;
  alreadyComputedReceipt: boolean | null;
  confirmationOpen: boolean;
  confirmationChecked: boolean;
  liveMessage: string | null;
  canPrepareCompute: boolean;
  computeBlockReason: string | null;
  dependencyMessage: string;
  canRefreshSourceScore: boolean;
  refreshLatest: () => Promise<CognitiveDomainResultDetailResponse | null>;
  refreshSourceScoreResult: () => void;
  prepareCompute: () => void;
  cancelCompute: () => void;
  setConfirmationChecked: (checked: boolean) => void;
  confirmCompute: () => Promise<void>;
};

const queryableInstanceStatuses = new Set<AssessmentVisitStatus>([
  'completed',
  'locked',
  'voided',
]);

const queryableSourceScoreStatuses = new Set([
  'confirmed',
  'locked',
  'voided',
]);

const computableSourceScoreStatuses = new Set(['confirmed', 'locked']);

const computableVisitStatuses = new Set<AssessmentVisitStatus>([
  'draft',
  'in_progress',
  'completed',
]);

function toCognitiveDomainApiError(error: unknown): CognitiveDomainApiError {
  return error instanceof CognitiveDomainApiError
    ? error
    : new CognitiveDomainApiError('unknown');
}

function getDependencyMessage(
  sourceScoreResult: SourceScoreResult | null,
  sourceScoreQueryStatus: CognitiveDomainSourceScoreQueryStatus,
  scaleInstanceStatus: AssessmentVisitStatus | null,
): string {
  if (!scaleInstanceStatus) {
    return '量表执行详情尚未加载，认知域结果需要等待实例与评分事实。';
  }

  if (!queryableInstanceStatuses.has(scaleInstanceStatus)) {
    return '量表实例尚未完成，当前不会查询认知域结果。';
  }

  if (!sourceScoreResult) {
    if (sourceScoreQueryStatus === 'loading') {
      return '正在等待来源评分结果加载，当前不会查询认知域结果。';
    }
    if (sourceScoreQueryStatus === 'no_result') {
      return '当前尚无来源评分，请先完成阶段性评分、人工复核和显式确认。';
    }
    if (sourceScoreQueryStatus === 'forbidden') {
      return '当前账号无法取得来源评分，因此不会查询认知域结果。';
    }
    if (sourceScoreQueryStatus === 'error') {
      return '来源评分查询失败，当前不会将该状态误显示为认知域尚未计算。';
    }
    return '认知域结果依赖已经取得并最终确认的来源评分。';
  }

  if (!queryableSourceScoreStatuses.has(sourceScoreResult.status)) {
    return '当前来源评分尚未确认；draft、computed 或 needs_review 状态不会查询认知域结果。';
  }

  return '来源评分和实例状态允许查询已有认知域结果。';
}

export function useCognitiveDomainResult({
  patientId,
  visitId,
  scaleInstanceId,
  visitStatus,
  scaleInstanceStatus,
  sourceScoreResult,
  sourceScoreQueryStatus,
  localBlockReason,
  onUnauthorized,
  onRefreshSourceScoreResult,
}: UseCognitiveDomainResultOptions): UseCognitiveDomainResultValue {
  const mountedRef = useRef(true);
  const latestControllerRef = useRef<AbortController | null>(null);
  const computingRef = useRef(false);
  const [detail, setDetail] =
    useState<CognitiveDomainResultDetailResponse | null>(null);
  const [status, setStatus] = useState<CognitiveDomainLatestStatus>('idle');
  const [latestError, setLatestError] =
    useState<CognitiveDomainApiError | null>(null);
  const [computeError, setComputeError] =
    useState<CognitiveDomainApiError | null>(null);
  const [computing, setComputing] = useState(false);
  const [alreadyComputedReceipt, setAlreadyComputedReceipt] = useState<
    boolean | null
  >(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationChecked, setConfirmationCheckedState] = useState(false);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [computeProhibitedReason, setComputeProhibitedReason] = useState<
    string | null
  >(null);

  const dependencyMessage = getDependencyMessage(
    sourceScoreResult,
    sourceScoreQueryStatus,
    scaleInstanceStatus,
  );
  const sourceScoreResultId = sourceScoreResult?.id ?? null;
  const sourceScoreResultStatus = sourceScoreResult?.status ?? null;
  const sourceScoreResultIsFinal = sourceScoreResult?.isFinal ?? false;
  const shouldQueryLatest =
    scaleInstanceStatus !== null &&
    queryableInstanceStatuses.has(scaleInstanceStatus) &&
    sourceScoreResult !== null &&
    queryableSourceScoreStatuses.has(sourceScoreResult.status);

  const refreshLatest = useCallback(async () => {
    latestControllerRef.current?.abort();
    const controller = new AbortController();
    latestControllerRef.current = controller;
    setStatus('loading');
    setLatestError(null);
    setLiveMessage('正在加载认知域结果。');

    try {
      const response = await getLatestCognitiveDomainResult(
        patientId,
        visitId,
        scaleInstanceId,
        { signal: controller.signal },
      );

      if (controller.signal.aborted || !mountedRef.current) {
        return null;
      }

      setDetail(response);
      setStatus('loaded');
      setConfirmationOpen(false);
      setConfirmationCheckedState(false);
      setLiveMessage('认知域结果已加载。');
      return response;
    } catch (requestError: unknown) {
      if (controller.signal.aborted || !mountedRef.current) {
        return null;
      }

      const error = toCognitiveDomainApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return null;
      }

      setDetail(null);
      setConfirmationOpen(false);
      setConfirmationCheckedState(false);
      if (error.kind === 'cognitive_domain_result_not_found') {
        setStatus('not_found');
        setLatestError(null);
        setLiveMessage('当前尚未计算认知域结果。');
      } else if (error.kind === 'forbidden') {
        setStatus('forbidden');
        setLatestError(error);
        setLiveMessage(null);
      } else if (error.kind === 'score_result_not_found') {
        setStatus('waiting_for_score');
        setLatestError(error);
        setLiveMessage(null);
      } else {
        setStatus('error');
        setLatestError(error);
        setLiveMessage(null);
      }
      return null;
    } finally {
      if (latestControllerRef.current === controller) {
        latestControllerRef.current = null;
      }
    }
  }, [onUnauthorized, patientId, scaleInstanceId, visitId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      latestControllerRef.current?.abort();
      latestControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    latestControllerRef.current?.abort();
    setDetail(null);
    setLatestError(null);
    setComputeError(null);
    setAlreadyComputedReceipt(null);
    setConfirmationOpen(false);
    setConfirmationCheckedState(false);
    setLiveMessage(null);
    setComputeProhibitedReason(null);

    if (!shouldQueryLatest) {
      setStatus('waiting_for_score');
      return;
    }

    void refreshLatest();
  }, [
    patientId,
    refreshLatest,
    scaleInstanceId,
    scaleInstanceStatus,
    shouldQueryLatest,
    sourceScoreResultId,
    sourceScoreResultIsFinal,
    sourceScoreResultStatus,
    visitId,
  ]);

  const computeBlockReason = useMemo(() => {
    if (!sourceScoreResult) {
      return dependencyMessage;
    }
    if (!computableSourceScoreStatuses.has(sourceScoreResult.status)) {
      return sourceScoreResult.status === 'voided'
        ? '来源评分已作废，只能查询已有历史认知域结果。'
        : '来源评分必须为 confirmed 或 locked 才能首次计算认知域结果。';
    }
    if (!sourceScoreResult.isFinal) {
      return '来源评分尚未满足服务端最终性事实，不能首次计算认知域结果。';
    }
    if (scaleInstanceStatus !== 'completed') {
      return '只有 completed 量表实例可以首次计算认知域结果；locked 或 voided 实例仅可查询历史结果。';
    }
    if (!visitStatus || !computableVisitStatuses.has(visitStatus)) {
      return '当前访视状态不允许首次计算认知域结果。';
    }
    if (status !== 'not_found') {
      return status === 'loaded'
        ? '当前已有认知域结果，A19 不支持重新计算。'
        : '请先完成认知域最新结果查询。';
    }
    if (computeProhibitedReason) {
      return computeProhibitedReason;
    }
    if (localBlockReason) {
      return localBlockReason;
    }
    return null;
  }, [
    computeProhibitedReason,
    dependencyMessage,
    localBlockReason,
    scaleInstanceStatus,
    sourceScoreResult,
    status,
    visitStatus,
  ]);

  const canPrepareCompute = computeBlockReason === null && !computing;

  const prepareCompute = useCallback(() => {
    if (!canPrepareCompute) {
      return;
    }
    setComputeError(null);
    setConfirmationCheckedState(false);
    setConfirmationOpen(true);
  }, [canPrepareCompute]);

  const cancelCompute = useCallback(() => {
    if (computingRef.current) {
      return;
    }
    setConfirmationOpen(false);
    setConfirmationCheckedState(false);
  }, []);

  const setConfirmationChecked = useCallback((checked: boolean) => {
    if (!computingRef.current) {
      setConfirmationCheckedState(checked);
    }
  }, []);

  const confirmCompute = useCallback(async () => {
    if (
      computingRef.current ||
      !confirmationOpen ||
      !confirmationChecked ||
      !canPrepareCompute
    ) {
      return;
    }

    computingRef.current = true;
    setComputing(true);
    setComputeError(null);
    setLiveMessage('正在计算认知域结果。');

    try {
      const response = await computeCognitiveDomainResult(
        patientId,
        visitId,
        scaleInstanceId,
        { confirm: true },
      );

      if (!mountedRef.current) {
        return;
      }

      const {
        alreadyComputed,
        scale,
        scaleInstance,
        sourceScoreResult: responseSourceScoreResult,
        cognitiveDomainResult,
      } = response;
      setDetail({
        scale,
        scaleInstance,
        sourceScoreResult: responseSourceScoreResult,
        cognitiveDomainResult,
      });
      setStatus('loaded');
      setLatestError(null);
      setAlreadyComputedReceipt(alreadyComputed);
      setConfirmationOpen(false);
      setConfirmationCheckedState(false);
      setLiveMessage(
        alreadyComputed
          ? '该实例此前已经生成认知域结果，本次未重复计算。'
          : '认知域结果计算完成；结果尚未独立确认。',
      );
    } catch (requestError: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const error = toCognitiveDomainApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }

      setComputeError(error);
      setComputeProhibitedReason(getCognitiveDomainApiErrorMessage(error.kind));
      setConfirmationOpen(false);
      setConfirmationCheckedState(false);
      setLiveMessage(null);

      if (error.kind === 'forbidden') {
        setStatus('forbidden');
      } else if (
        error.kind === 'cognitive_domain_result_incomplete'
      ) {
        setStatus('error');
        setLatestError(error);
      } else if (
        error.kind === 'cognitive_domain_computation_conflict' ||
        error.kind === 'cognitive_domain_result_voided'
      ) {
        await refreshLatest();
      }
    } finally {
      computingRef.current = false;
      if (mountedRef.current) {
        setComputing(false);
      }
    }
  }, [
    canPrepareCompute,
    confirmationChecked,
    confirmationOpen,
    onUnauthorized,
    patientId,
    refreshLatest,
    scaleInstanceId,
    visitId,
  ]);

  const canRefreshSourceScore =
    computeError?.kind === 'cognitive_domain_source_score_not_final' ||
    computeError?.kind === 'cognitive_domain_source_score_invalid' ||
    computeError?.kind === 'score_result_not_found';

  return {
    detail,
    status,
    latestError,
    computeError,
    computing,
    alreadyComputedReceipt,
    confirmationOpen,
    confirmationChecked,
    liveMessage,
    canPrepareCompute,
    computeBlockReason,
    dependencyMessage,
    canRefreshSourceScore,
    refreshLatest,
    refreshSourceScoreResult: onRefreshSourceScoreResult,
    prepareCompute,
    cancelCompute,
    setConfirmationChecked,
    confirmCompute,
  };
}
