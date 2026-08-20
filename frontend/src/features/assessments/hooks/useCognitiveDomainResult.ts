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
  liveMessage: string | null;
  canCompute: boolean;
  computeBlockReason: string | null;
  localBlockReason: string | null;
  dependencyMessage: string;
  canRefreshSourceScore: boolean;
  refreshLatest: () => Promise<CognitiveDomainResultDetailResponse | null>;
  refreshSourceScoreResult: () => void;
  compute: () => Promise<void>;
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

export function getCognitiveDomainDependencyMessage(
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
      return '当前尚无来源评分，请先完成评分并最终确认评分结果。';
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
    return '当前评分结果尚未最终确认，暂不能生成认知域分析。';
  }

  return '来源评分和实例状态允许查询已有认知域结果。';
}

type CognitiveDomainComputeBlockInput = {
  localBlockReason: string | null;
  sourceScoreResult: SourceScoreResult | null;
  dependencyMessage: string;
  scaleInstanceStatus: AssessmentVisitStatus | null;
  visitStatus: AssessmentVisitStatus | null;
  status: CognitiveDomainLatestStatus;
  computeProhibitedReason: string | null;
};

export function getCognitiveDomainComputeBlockReason({
  localBlockReason,
  sourceScoreResult,
  dependencyMessage,
  scaleInstanceStatus,
  visitStatus,
  status,
  computeProhibitedReason,
}: CognitiveDomainComputeBlockInput): string | null {
  if (localBlockReason) {
    return localBlockReason;
  }
  if (!sourceScoreResult) {
    return dependencyMessage;
  }
  if (!computableSourceScoreStatuses.has(sourceScoreResult.status)) {
    return sourceScoreResult.status === 'voided'
      ? '来源评分已作废，只能查看已有认知域结果。'
      : '来源评分尚未达到可用于认知域分析的最终状态。';
  }
  if (!sourceScoreResult.isFinal) {
    return '来源评分尚未最终确认，不能生成认知域结果。';
  }
  if (scaleInstanceStatus !== 'completed') {
    return '当前量表实例状态不允许生成新的认知域结果。';
  }
  if (!visitStatus || !computableVisitStatuses.has(visitStatus)) {
    return '当前访视状态不允许生成认知域结果。';
  }
  if (status !== 'not_found') {
    return status === 'loaded'
      ? '当前已有认知域结果，现阶段不支持重新生成。'
      : '请先完成认知域结果加载。';
  }
  return computeProhibitedReason;
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
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [computeProhibitedReason, setComputeProhibitedReason] = useState<
    string | null
  >(null);

  const dependencyMessage = getCognitiveDomainDependencyMessage(
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
    setAlreadyComputedReceipt(null);
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
      if (error.kind === 'cognitive_domain_result_not_found') {
        setStatus('not_found');
        setLatestError(null);
        setLiveMessage(null);
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
    return getCognitiveDomainComputeBlockReason({
      localBlockReason,
      sourceScoreResult,
      dependencyMessage,
      scaleInstanceStatus,
      visitStatus,
      status,
      computeProhibitedReason,
    });
  }, [
    computeProhibitedReason,
    dependencyMessage,
    localBlockReason,
    scaleInstanceStatus,
    sourceScoreResult,
    status,
    visitStatus,
  ]);

  const canCompute = computeBlockReason === null && !computing;

  const compute = useCallback(async () => {
    if (computingRef.current || !canCompute) {
      return;
    }

    computingRef.current = true;
    setComputing(true);
    setComputeError(null);
    setLiveMessage('正在生成认知域结果。');

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
      setLiveMessage(
        alreadyComputed
          ? '该量表已有认知域结果，本次未重复生成。'
          : '认知域结果已生成。',
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
    canCompute,
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
    liveMessage,
    canCompute,
    computeBlockReason,
    localBlockReason,
    dependencyMessage,
    canRefreshSourceScore,
    refreshLatest,
    refreshSourceScoreResult: onRefreshSourceScoreResult,
    compute,
  };
}
