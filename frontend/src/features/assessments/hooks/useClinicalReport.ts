'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ClinicalReportApiError,
  generateClinicalReport,
  getLatestClinicalReport,
} from '@/src/features/assessments/api/clinical-report-api';
import { getClinicalReportApiErrorMessage } from '@/src/features/assessments/lib/clinical-report-display';
import type { ScaleInstanceListItem } from '@/src/features/assessments/types/assessment-execution';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

export type ClinicalReportLatestStatus =
  | 'idle'
  | 'loading'
  | 'not_found'
  | 'loaded'
  | 'forbidden'
  | 'error';

type UseClinicalReportOptions = {
  patientId: string;
  visitId: string;
  enabled: boolean;
  visitStatus: AssessmentVisitStatus | null;
  scaleInstances: ScaleInstanceListItem[];
  externalWriteBlockReason: string | null;
  onUnauthorized: () => void;
};

export type UseClinicalReportValue = {
  report: ClinicalReport | null;
  status: ClinicalReportLatestStatus;
  latestError: ClinicalReportApiError | null;
  generateError: ClinicalReportApiError | null;
  generating: boolean;
  alreadyGeneratedReceipt: boolean | null;
  selectedScaleInstanceIds: string[];
  confirmationOpen: boolean;
  confirmationChecked: boolean;
  liveMessage: string | null;
  eligibleScaleInstances: ScaleInstanceListItem[];
  canPrepareGenerate: boolean;
  generateBlockReason: string | null;
  toggleScaleInstance: (scaleInstanceId: string) => void;
  selectAllEligible: () => void;
  clearSelection: () => void;
  prepareGenerate: () => void;
  cancelGenerate: () => void;
  setConfirmationChecked: (checked: boolean) => void;
  confirmGenerate: () => Promise<void>;
  refreshLatest: () => Promise<ClinicalReport | null>;
};

const mongoIdPattern = /^[a-f\d]{24}$/;
const selectableStatuses = new Set<AssessmentVisitStatus>([
  'completed',
  'locked',
]);
const generatableVisitStatuses = new Set<AssessmentVisitStatus>([
  'draft',
  'in_progress',
  'completed',
]);

export function compareClinicalReportScaleInstances(
  left: ScaleInstanceListItem,
  right: ScaleInstanceListItem,
): number {
  return (
    left.scaleCode.localeCompare(right.scaleCode) ||
    left.instanceNo - right.instanceNo ||
    left.id.localeCompare(right.id)
  );
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function toClinicalReportApiError(error: unknown): ClinicalReportApiError {
  return error instanceof ClinicalReportApiError
    ? error
    : new ClinicalReportApiError('unknown');
}

export function useClinicalReport({
  patientId,
  visitId,
  enabled,
  visitStatus,
  scaleInstances,
  externalWriteBlockReason,
  onUnauthorized,
}: UseClinicalReportOptions): UseClinicalReportValue {
  const mountedRef = useRef(true);
  const latestControllerRef = useRef<AbortController | null>(null);
  const generatingRef = useRef(false);
  const [report, setReport] = useState<ClinicalReport | null>(null);
  const [status, setStatus] = useState<ClinicalReportLatestStatus>('idle');
  const [latestError, setLatestError] =
    useState<ClinicalReportApiError | null>(null);
  const [generateError, setGenerateError] =
    useState<ClinicalReportApiError | null>(null);
  const [generating, setGenerating] = useState(false);
  const [alreadyGeneratedReceipt, setAlreadyGeneratedReceipt] = useState<
    boolean | null
  >(null);
  const [selectedScaleInstanceIds, setSelectedScaleInstanceIds] = useState<
    string[]
  >([]);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationChecked, setConfirmationCheckedState] = useState(false);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [generateProhibitedReason, setGenerateProhibitedReason] = useState<
    string | null
  >(null);

  const eligibleScaleInstances = useMemo(
    () =>
      scaleInstances
        .filter((instance) => {
          const id = normalizeId(instance.id);
          return (
            selectableStatuses.has(instance.status) && mongoIdPattern.test(id)
          );
        })
        .sort(compareClinicalReportScaleInstances),
    [scaleInstances],
  );

  const eligibleIdKey = eligibleScaleInstances
    .map((instance) => normalizeId(instance.id))
    .join(':');

  const closeConfirmation = useCallback(() => {
    setConfirmationOpen(false);
    setConfirmationCheckedState(false);
  }, []);

  const refreshLatest = useCallback(async () => {
    latestControllerRef.current?.abort();
    const controller = new AbortController();
    latestControllerRef.current = controller;
    setStatus('loading');
    setLatestError(null);
    setLiveMessage('正在加载最新临床报告。');

    try {
      const response = await getLatestClinicalReport(patientId, visitId, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current) {
        return null;
      }

      setReport(response.report);
      setStatus('loaded');
      setSelectedScaleInstanceIds([]);
      closeConfirmation();
      setLiveMessage('最新临床报告已加载。');
      return response.report;
    } catch (requestError: unknown) {
      if (controller.signal.aborted || !mountedRef.current) {
        return null;
      }

      const error = toClinicalReportApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return null;
      }
      if (error.kind === 'clinical_report_not_found') {
        setReport(null);
        setStatus('not_found');
        setLatestError(null);
        setLiveMessage('当前访视尚未生成临床报告草稿。');
      } else if (error.kind === 'forbidden') {
        setReport(null);
        setStatus('forbidden');
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
  }, [closeConfirmation, onUnauthorized, patientId, visitId]);

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
    setReport(null);
    setLatestError(null);
    setGenerateError(null);
    setAlreadyGeneratedReceipt(null);
    setSelectedScaleInstanceIds([]);
    closeConfirmation();
    setLiveMessage(null);
    setGenerateProhibitedReason(null);

    if (!enabled) {
      setStatus('idle');
      return;
    }
    void refreshLatest();
  }, [closeConfirmation, enabled, patientId, refreshLatest, visitId]);

  useEffect(() => {
    if (selectedScaleInstanceIds.length === 0) {
      return;
    }
    const eligibleIds = new Set(
      eligibleScaleInstances.map((instance) => normalizeId(instance.id)),
    );
    const nextSelection = selectedScaleInstanceIds.filter((id) =>
      eligibleIds.has(id),
    );
    if (nextSelection.length === selectedScaleInstanceIds.length) {
      return;
    }

    setSelectedScaleInstanceIds(nextSelection);
    closeConfirmation();
    setGenerateError(null);
    setAlreadyGeneratedReceipt(null);
    setLiveMessage('报告候选范围已随访视实例状态变化，请重新核对。');
  }, [
    closeConfirmation,
    eligibleIdKey,
    eligibleScaleInstances,
    selectedScaleInstanceIds,
  ]);

  const resetAfterScopeChange = useCallback(() => {
    closeConfirmation();
    setGenerateError(null);
    setAlreadyGeneratedReceipt(null);
    setGenerateProhibitedReason(null);
    setLiveMessage(null);
  }, [closeConfirmation]);

  const toggleScaleInstance = useCallback(
    (scaleInstanceId: string) => {
      if (generatingRef.current || report) {
        return;
      }
      const normalizedId = normalizeId(scaleInstanceId);
      if (
        !eligibleScaleInstances.some(
          (instance) => normalizeId(instance.id) === normalizedId,
        )
      ) {
        return;
      }

      setSelectedScaleInstanceIds((current) => {
        if (current.includes(normalizedId)) {
          return current.filter((id) => id !== normalizedId);
        }
        return current.length < 10 ? [...current, normalizedId] : current;
      });
      resetAfterScopeChange();
    },
    [eligibleScaleInstances, report, resetAfterScopeChange],
  );

  const selectAllEligible = useCallback(() => {
    if (generatingRef.current || report) {
      return;
    }
    setSelectedScaleInstanceIds(
      eligibleScaleInstances
        .slice(0, 10)
        .map((instance) => normalizeId(instance.id)),
    );
    resetAfterScopeChange();
  }, [eligibleScaleInstances, report, resetAfterScopeChange]);

  const clearSelection = useCallback(() => {
    if (generatingRef.current || report) {
      return;
    }
    setSelectedScaleInstanceIds([]);
    resetAfterScopeChange();
  }, [report, resetAfterScopeChange]);

  const generateBlockReason = useMemo(() => {
    if (status !== 'not_found') {
      if (status === 'loaded') {
        return '当前已有报告，A20 不支持修改范围或重生成。';
      }
      if (status === 'forbidden') {
        return '当前账号没有生成临床报告的权限。';
      }
      return '请先完成最新临床报告查询。';
    }
    if (!visitStatus || !generatableVisitStatuses.has(visitStatus)) {
      return '当前访视状态不允许首次生成报告草稿。';
    }
    if (selectedScaleInstanceIds.length < 1) {
      return '请明确选择至少 1 个可纳入量表实例。';
    }
    if (selectedScaleInstanceIds.length > 10) {
      return '报告范围最多包含 10 个量表实例。';
    }
    if (new Set(selectedScaleInstanceIds).size !== selectedScaleInstanceIds.length) {
      return '报告范围包含重复实例，请重新选择。';
    }
    const eligibleIds = new Set(
      eligibleScaleInstances.map((instance) => normalizeId(instance.id)),
    );
    if (
      selectedScaleInstanceIds.some(
        (id) => !mongoIdPattern.test(id) || !eligibleIds.has(id),
      )
    ) {
      return '报告范围包含无效或已失效的量表实例，请重新核对。';
    }
    if (externalWriteBlockReason) {
      return externalWriteBlockReason;
    }
    if (generateProhibitedReason) {
      return generateProhibitedReason;
    }
    return null;
  }, [
    eligibleScaleInstances,
    externalWriteBlockReason,
    generateProhibitedReason,
    selectedScaleInstanceIds,
    status,
    visitStatus,
  ]);

  const canPrepareGenerate = generateBlockReason === null && !generating;

  const prepareGenerate = useCallback(() => {
    if (!canPrepareGenerate) {
      return;
    }
    setGenerateError(null);
    setConfirmationCheckedState(false);
    setConfirmationOpen(true);
  }, [canPrepareGenerate]);

  const cancelGenerate = useCallback(() => {
    if (!generatingRef.current) {
      closeConfirmation();
    }
  }, [closeConfirmation]);

  const setConfirmationChecked = useCallback((checked: boolean) => {
    if (!generatingRef.current) {
      setConfirmationCheckedState(checked);
    }
  }, []);

  const confirmGenerate = useCallback(async () => {
    if (
      generatingRef.current ||
      !confirmationOpen ||
      !confirmationChecked ||
      !canPrepareGenerate
    ) {
      return;
    }

    const selectedIds = new Set(selectedScaleInstanceIds);
    const requestIds = eligibleScaleInstances
      .filter((instance) => selectedIds.has(normalizeId(instance.id)))
      .map((instance) => normalizeId(instance.id));

    generatingRef.current = true;
    setGenerating(true);
    setGenerateError(null);
    setLiveMessage('正在生成规则化报告草稿。');

    try {
      const response = await generateClinicalReport(patientId, visitId, {
        confirm: true,
        primaryScaleInstanceIds: requestIds,
      });
      if (!mountedRef.current) {
        return;
      }

      setReport(response.report);
      setStatus('loaded');
      setLatestError(null);
      setAlreadyGeneratedReceipt(response.alreadyGenerated);
      setSelectedScaleInstanceIds([]);
      closeConfirmation();
      setGenerateError(null);
      setGenerateProhibitedReason(null);
      setLiveMessage(
        response.alreadyGenerated
          ? '该访视此前已经生成相同范围的报告，本次未重复生成。'
          : '规则化临床报告草稿已生成；当前仍为 draft，尚未经医生确认。',
      );
    } catch (requestError: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const error = toClinicalReportApiError(requestError);
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }

      setGenerateError(error);
      setConfirmationCheckedState(false);
      setLiveMessage(null);

      if (error.kind === 'forbidden') {
        setStatus('forbidden');
      } else if (error.kind === 'clinical_report_scope_invalid') {
        closeConfirmation();
      } else if (error.kind === 'clinical_report_incomplete') {
        closeConfirmation();
        setStatus('error');
        setLatestError(error);
        setGenerateProhibitedReason(getClinicalReportApiErrorMessage(error.kind));
      } else if (
        error.kind === 'clinical_report_scope_conflict' ||
        error.kind === 'clinical_report_voided' ||
        error.kind === 'clinical_report_generation_conflict'
      ) {
        closeConfirmation();
        if (
          error.kind === 'clinical_report_scope_conflict' ||
          error.kind === 'clinical_report_voided'
        ) {
          setGenerateProhibitedReason(
            getClinicalReportApiErrorMessage(error.kind),
          );
        }
        await refreshLatest();
      }
    } finally {
      generatingRef.current = false;
      if (mountedRef.current) {
        setGenerating(false);
      }
    }
  }, [
    canPrepareGenerate,
    closeConfirmation,
    confirmationChecked,
    confirmationOpen,
    eligibleScaleInstances,
    onUnauthorized,
    patientId,
    refreshLatest,
    selectedScaleInstanceIds,
    visitId,
  ]);

  return {
    report,
    status,
    latestError,
    generateError,
    generating,
    alreadyGeneratedReceipt,
    selectedScaleInstanceIds,
    confirmationOpen,
    confirmationChecked,
    liveMessage,
    eligibleScaleInstances,
    canPrepareGenerate,
    generateBlockReason,
    toggleScaleInstance,
    selectAllEligible,
    clearSelection,
    prepareGenerate,
    cancelGenerate,
    setConfirmationChecked,
    confirmGenerate,
    refreshLatest,
  };
}
