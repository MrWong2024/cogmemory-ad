'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import {
  AssessmentExecutionApiError,
  getScaleInstanceExecutionDetail,
  getScaleInstanceSubmissionReadiness,
  saveItemResponseDraft,
  submitScaleInstance,
} from '@/src/features/assessments/api/assessment-execution-api';
import {
  computeProvisionalScoreResult,
  getLatestProvisionalScoreResult,
  ProvisionalScoringApiError,
} from '@/src/features/assessments/api/provisional-scoring-api';
import {
  ItemResponseEditor,
  type ItemSaveFeedback,
} from '@/src/features/assessments/components/ItemResponseEditor';
import {
  ProvisionalScoringPanel,
  type ProvisionalScoreQueryStatus,
} from '@/src/features/assessments/components/ProvisionalScoringPanel';
import { ScaleExecutionGroupNavigation } from '@/src/features/assessments/components/ScaleExecutionGroupNavigation';
import { ScaleInstanceSubmissionPanel } from '@/src/features/assessments/components/ScaleInstanceSubmissionPanel';
import {
  assessmentOperatorRoleLabels,
  buildScaleExecutionGroupSections,
  getItemResponseSaveErrorMessage,
  getScaleExecutionReadOnlyReason,
  scaleAdministrationModeLabels,
  scaleInstanceStatusLabels,
} from '@/src/features/assessments/lib/assessment-execution-display';
import {
  buildItemResponseDraftRequest,
  createItemDraftState,
  itemDraftHasChanges,
  type ItemDraftState,
} from '@/src/features/assessments/lib/item-response-draft';
import {
  mediaDraftHasPendingContent,
  type ItemMediaDrafts,
  type MediaEvidenceDraft,
} from '@/src/features/assessments/types/media-evidence-draft';
import type {
  EvidenceRequirementState,
  SupportedMediaEvidenceType,
} from '@/src/features/assessments/types/media-evidence';
import type { ScaleInstanceExecutionDetailResponse } from '@/src/features/assessments/types/item-response-execution';
import { getProvisionalScoringApiErrorMessage } from '@/src/features/assessments/lib/provisional-scoring-display';
import { getScaleSubmissionApiErrorMessage } from '@/src/features/assessments/lib/scale-instance-submission-display';
import type { ScoreResultDetailResponse } from '@/src/features/assessments/types/provisional-scoring';
import type {
  ScaleInstanceSubmissionAudit,
  ScaleSubmissionIssue,
  ScaleSubmissionReadinessResponse,
} from '@/src/features/assessments/types/scale-instance-submission';
import { logout } from '@/src/features/auth/api/auth-api';
import {
  assessmentVisitStatusLabels,
  assessmentVisitTypeLabels,
  formatDateTime,
} from '@/src/features/patients/lib/patient-display';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

const mongoIdPattern = /^[a-f\d]{24}$/i;

const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const statusTones: Record<AssessmentVisitStatus, BadgeTone> = {
  draft: 'neutral',
  in_progress: 'info',
  completed: 'success',
  locked: 'warning',
  voided: 'warning',
};

const scoreQueryableInstanceStatuses = new Set<AssessmentVisitStatus>([
  'completed',
  'locked',
  'voided',
]);

const scoreComputableVisitStatuses = new Set<AssessmentVisitStatus>([
  'draft',
  'in_progress',
  'completed',
]);

type ExecutionDetailErrorState = {
  badge: string;
  title: string;
  description: string;
  canRetry: boolean;
};

function getExecutionDetailErrorState(
  error: AssessmentExecutionApiError,
): ExecutionDetailErrorState {
  if (error.kind === 'validation') {
    return {
      badge: '链接无效',
      title: '量表实例链接无效',
      description: '当前地址中的患者、访视或量表实例标识不符合要求。',
      canRetry: false,
    };
  }

  if (error.kind === 'patient_not_found') {
    return {
      badge: '患者不存在',
      title: '未找到该患者档案',
      description: '该患者档案可能已不存在，请返回患者列表重新选择。',
      canRetry: false,
    };
  }

  if (error.kind === 'visit_not_found') {
    return {
      badge: '访视不存在',
      title: '未找到该评估访视',
      description: '该访视可能不存在，或不属于当前患者。',
      canRetry: false,
    };
  }

  if (error.kind === 'scale_instance_not_found') {
    return {
      badge: '实例不存在',
      title: '未找到该量表实例',
      description: '该量表实例可能不存在，或不属于当前患者与访视。',
      canRetry: false,
    };
  }

  if (error.kind === 'scale_instance_configuration_unavailable') {
    return {
      badge: '配置不可用',
      title: '量表实例配置暂时不可用',
      description:
        '该量表实例的版本配置暂时不可用，当前无法进入施测记录。',
      canRetry: true,
    };
  }

  if (error.kind === 'forbidden') {
    return {
      badge: '无权限',
      title: '当前账号没有访问该量表实例的权限',
      description: '评估访问权限最终以后端校验结果为准。',
      canRetry: false,
    };
  }

  if (error.kind === 'service_unavailable') {
    return {
      badge: '连接异常',
      title: '评估服务暂时不可用',
      description: '暂时无法加载量表执行详情，请稍后重试。',
      canRetry: true,
    };
  }

  return {
    badge: '加载失败',
    title: '暂时无法加载量表执行详情',
    description: '请稍后重新加载。',
    canRetry: true,
  };
}

function createDraftMap(
  detail: ScaleInstanceExecutionDetailResponse,
): Record<string, ItemDraftState> {
  return Object.fromEntries(
    detail.itemResponses.map((item) => [item.id, createItemDraftState(item)]),
  );
}

function buildMediaDraftKey(
  itemResponseId: string,
  evidenceType: SupportedMediaEvidenceType,
): string {
  return `${itemResponseId}:${evidenceType}`;
}

function getItemMediaDrafts(
  mediaDrafts: Record<string, MediaEvidenceDraft | undefined>,
  itemResponseId: string,
): ItemMediaDrafts {
  const photo = mediaDrafts[buildMediaDraftKey(itemResponseId, 'photo')];
  const handwriting =
    mediaDrafts[buildMediaDraftKey(itemResponseId, 'handwriting')];

  return {
    ...(photo?.kind === 'photo' ? { photo } : {}),
    ...(handwriting?.kind === 'handwriting' ? { handwriting } : {}),
  };
}

function getItemMediaWritingTypes(
  writingKeys: ReadonlySet<string>,
  itemResponseId: string,
): ReadonlySet<SupportedMediaEvidenceType> {
  const types = new Set<SupportedMediaEvidenceType>();

  if (writingKeys.has(buildMediaDraftKey(itemResponseId, 'photo'))) {
    types.add('photo');
  }

  if (writingKeys.has(buildMediaDraftKey(itemResponseId, 'handwriting'))) {
    types.add('handwriting');
  }

  return types;
}

export function ScaleInstanceExecutionPage({
  patientId,
  scaleInstanceId,
  visitId,
}: {
  patientId: string;
  scaleInstanceId: string;
  visitId: string;
}) {
  const router = useRouter();
  const mountedRef = useRef(true);
  const savingItemIdsRef = useRef(new Set<string>());
  const mediaWritingKeysRef = useRef(new Set<string>());
  const readinessControllerRef = useRef<AbortController | null>(null);
  const scoreResultControllerRef = useRef<AbortController | null>(null);
  const readinessRef = useRef<ScaleSubmissionReadinessResponse | null>(null);
  const localBlockersRef = useRef({
    unsavedAnswerItemCount: 0,
    pendingMediaItemCount: 0,
  });
  const submittingRef = useRef(false);
  const computingScoreRef = useRef(false);
  const idsAreValid =
    mongoIdPattern.test(patientId) &&
    mongoIdPattern.test(visitId) &&
    mongoIdPattern.test(scaleInstanceId);
  const [detail, setDetail] =
    useState<ScaleInstanceExecutionDetailResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ItemDraftState>>({});
  const [mediaDrafts, setMediaDrafts] = useState<
    Record<string, MediaEvidenceDraft | undefined>
  >({});
  const [mediaWritingKeys, setMediaWritingKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [feedbacks, setFeedbacks] = useState<
    Record<string, ItemSaveFeedback | undefined>
  >({});
  const [savingItemIds, setSavingItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [detailError, setDetailError] =
    useState<AssessmentExecutionApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [activeGroupCode, setActiveGroupCode] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [readiness, setReadiness] =
    useState<ScaleSubmissionReadinessResponse | null>(null);
  const [readinessError, setReadinessError] =
    useState<AssessmentExecutionApiError | null>(null);
  const [isReadinessLoading, setIsReadinessLoading] = useState(false);
  const [readinessStale, setReadinessStale] = useState(false);
  const [submissionReceipt, setSubmissionReceipt] =
    useState<ScaleInstanceSubmissionAudit | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [pendingFocusItemId, setPendingFocusItemId] = useState<string | null>(
    null,
  );
  const [pendingFocusSource, setPendingFocusSource] = useState<
    'submission' | 'scoring' | null
  >(null);
  const [scoreResult, setScoreResult] =
    useState<ScoreResultDetailResponse | null>(null);
  const [scoreQueryStatus, setScoreQueryStatus] =
    useState<ProvisionalScoreQueryStatus>('idle');
  const [scoreQueryError, setScoreQueryError] = useState<string | null>(null);
  const [scoreConfirmationVisible, setScoreConfirmationVisible] =
    useState(false);
  const [isComputingScore, setIsComputingScore] = useState(false);
  const [scoreComputationError, setScoreComputationError] = useState<
    string | null
  >(null);
  const [scoreComputationStatus, setScoreComputationStatus] = useState<
    string | null
  >(null);
  const [scoreAlreadyComputed, setScoreAlreadyComputed] = useState<
    boolean | null
  >(null);

  const loadLatestScoreResult = useCallback(async () => {
    scoreResultControllerRef.current?.abort();
    const controller = new AbortController();
    scoreResultControllerRef.current = controller;
    setScoreQueryStatus('loading');
    setScoreQueryError(null);

    try {
      const response = await getLatestProvisionalScoreResult(
        patientId,
        visitId,
        scaleInstanceId,
        { signal: controller.signal },
      );

      if (controller.signal.aborted || !mountedRef.current) {
        return null;
      }

      setScoreResult(response);
      setScoreQueryStatus('loaded');
      setScoreConfirmationVisible(false);
      setDetail((current) =>
        current
          ? {
              ...current,
              scaleInstance: response.scaleInstance,
            }
          : current,
      );
      return response;
    } catch (requestError: unknown) {
      if (controller.signal.aborted || !mountedRef.current) {
        return null;
      }

      const error =
        requestError instanceof ProvisionalScoringApiError
          ? requestError
          : new ProvisionalScoringApiError('unknown');

      if (error.kind === 'unauthenticated') {
        setScoreConfirmationVisible(false);
        router.replace('/login');
        return null;
      }

      setScoreResult(null);
      setScoreConfirmationVisible(false);

      if (error.kind === 'score_result_not_found') {
        setScoreQueryStatus('no_result');
        setScoreQueryError(null);
      } else if (error.kind === 'forbidden') {
        setScoreQueryStatus('forbidden');
        setScoreQueryError(getProvisionalScoringApiErrorMessage(error.kind));
      } else {
        setScoreQueryStatus('error');
        setScoreQueryError(getProvisionalScoringApiErrorMessage(error.kind));
      }

      return null;
    } finally {
      if (scoreResultControllerRef.current === controller) {
        scoreResultControllerRef.current = null;
      }
    }
  }, [patientId, router, scaleInstanceId, visitId]);

  const loadSubmissionReadiness = useCallback(async () => {
    readinessControllerRef.current?.abort();
    const controller = new AbortController();
    readinessControllerRef.current = controller;
    setIsReadinessLoading(true);
    setReadinessError(null);

    try {
      const response = await getScaleInstanceSubmissionReadiness(
        patientId,
        visitId,
        scaleInstanceId,
        { signal: controller.signal },
      );

      if (controller.signal.aborted || !mountedRef.current) {
        return null;
      }

      readinessRef.current = response;
      setReadiness(response);
      setReadinessStale(false);
      setConfirmationVisible(false);
      setDetail((current) =>
        current
          ? {
              ...current,
              scaleInstance: response.scaleInstance,
            }
          : current,
      );
      return response;
    } catch (requestError: unknown) {
      if (controller.signal.aborted || !mountedRef.current) {
        return null;
      }

      const error =
        requestError instanceof AssessmentExecutionApiError
          ? requestError
          : new AssessmentExecutionApiError('unknown');

      if (error.kind === 'unauthenticated') {
        router.replace('/login');
        return null;
      }

      setReadinessError(error);
      return null;
    } finally {
      if (readinessControllerRef.current === controller) {
        readinessControllerRef.current = null;
      }

      if (!controller.signal.aborted && mountedRef.current) {
        setIsReadinessLoading(false);
      }
    }
  }, [patientId, router, scaleInstanceId, visitId]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      readinessControllerRef.current?.abort();
      readinessControllerRef.current = null;
      scoreResultControllerRef.current?.abort();
      scoreResultControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!idsAreValid) {
      readinessControllerRef.current?.abort();
      scoreResultControllerRef.current?.abort();
      readinessRef.current = null;
      setDetail(null);
      setDrafts({});
      setMediaDrafts({});
      setReadiness(null);
      setReadinessError(null);
      setIsReadinessLoading(false);
      setSubmissionReceipt(null);
      setScoreResult(null);
      setScoreQueryStatus('idle');
      setScoreQueryError(null);
      setScoreConfirmationVisible(false);
      setScoreComputationError(null);
      setScoreComputationStatus(null);
      setScoreAlreadyComputed(null);
      setDetailError(new AssessmentExecutionApiError('validation', 400));
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    readinessControllerRef.current?.abort();
    scoreResultControllerRef.current?.abort();
    readinessRef.current = null;
    setIsLoading(true);
    setDetailError(null);
    setReadiness(null);
    setReadinessError(null);
    setIsReadinessLoading(false);
    setReadinessStale(false);
    setSubmissionReceipt(null);
    setSubmissionError(null);
    setSubmissionStatus(null);
    setConfirmationVisible(false);
    setScoreResult(null);
    setScoreQueryStatus('idle');
    setScoreQueryError(null);
    setScoreConfirmationVisible(false);
    setScoreComputationError(null);
    setScoreComputationStatus(null);
    setScoreAlreadyComputed(null);

    void getScaleInstanceExecutionDetail(
      patientId,
      visitId,
      scaleInstanceId,
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        const sections = buildScaleExecutionGroupSections(
          response.groups,
          response.itemResponses,
        );
        setDetail(response);
        setDrafts(createDraftMap(response));
        setMediaDrafts({});
        setFeedbacks({});
        setActiveGroupCode(sections[0]?.code ?? '');
        void loadSubmissionReadiness();
        if (scoreQueryableInstanceStatuses.has(response.scaleInstance.status)) {
          void loadLatestScoreResult();
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (
          requestError instanceof AssessmentExecutionApiError &&
          requestError.kind === 'unauthenticated'
        ) {
          router.replace('/login');
          return;
        }

        setDetail(null);
        setDrafts({});
        setMediaDrafts({});
        setDetailError(
          requestError instanceof AssessmentExecutionApiError
            ? requestError
            : new AssessmentExecutionApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    idsAreValid,
    loadLatestScoreResult,
    loadSubmissionReadiness,
    patientId,
    retryKey,
    router,
    scaleInstanceId,
    visitId,
  ]);

  const sections = useMemo(
    () =>
      detail
        ? buildScaleExecutionGroupSections(detail.groups, detail.itemResponses)
        : [],
    [detail],
  );
  const activeSection =
    sections.find((section) => section.code === activeGroupCode) ?? sections[0];
  const effectiveActiveGroupCode = activeSection?.code ?? '';
  const unsavedAnswerItemCount = useMemo(() => {
    if (!detail) {
      return 0;
    }

    return detail.itemResponses.filter((item) => {
      const draft = drafts[item.id];
      return draft ? itemDraftHasChanges(item, draft) : false;
    }).length;
  }, [detail, drafts]);
  const pendingMediaItemCount = useMemo(() => {
    if (!detail) {
      return 0;
    }

    return detail.itemResponses.filter((item) =>
      (['photo', 'handwriting'] as const).some((evidenceType) => {
        const mediaDraft =
          mediaDrafts[buildMediaDraftKey(item.id, evidenceType)];
        return mediaDraft ? mediaDraftHasPendingContent(mediaDraft) : false;
      }),
    ).length;
  }, [detail, mediaDrafts]);

  useEffect(() => {
    localBlockersRef.current = {
      unsavedAnswerItemCount,
      pendingMediaItemCount,
    };
  }, [pendingMediaItemCount, unsavedAnswerItemCount]);

  useEffect(() => {
    if (!pendingFocusItemId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(
        `submission-item-${pendingFocusItemId}`,
      );

      if (!element) {
        if (pendingFocusSource === 'scoring') {
          setScoreComputationStatus('未能定位该题目，请重新加载量表后再试。');
        } else {
          setSubmissionStatus('未能定位该题目，请重新加载量表后再试。');
        }
        setPendingFocusItemId(null);
        setPendingFocusSource(null);
        return;
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element.focus({ preventScroll: true });
      setPendingFocusItemId(null);
      setPendingFocusSource(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeGroupCode, pendingFocusItemId, pendingFocusSource]);

  useEffect(() => {
    if (
      unsavedAnswerItemCount > 0 ||
      pendingMediaItemCount > 0 ||
      savingItemIds.size > 0 ||
      mediaWritingKeys.size > 0 ||
      isSubmitting ||
      detail?.scaleInstance.status !== 'completed' ||
      !scoreComputableVisitStatuses.has(detail?.visit.status ?? 'voided') ||
      scoreQueryStatus !== 'no_result'
    ) {
      setScoreConfirmationVisible(false);
    }
  }, [
    detail?.scaleInstance.status,
    detail?.visit.status,
    isSubmitting,
    mediaWritingKeys.size,
    pendingMediaItemCount,
    savingItemIds.size,
    scoreQueryStatus,
    unsavedAnswerItemCount,
  ]);

  useEffect(() => {
    if (
      detail?.scaleInstance.status === 'completed' &&
      !submissionReceipt &&
      (unsavedAnswerItemCount > 0 ||
        pendingMediaItemCount > 0 ||
        savingItemIds.size > 0 ||
        mediaWritingKeys.size > 0)
    ) {
      setSubmissionStatus(
        '实例已被其他操作完成，本地未保存内容无法继续提交；这些内容不会被静默清除。',
      );
    }
  }, [
    detail?.scaleInstance.status,
    mediaWritingKeys.size,
    pendingMediaItemCount,
    savingItemIds.size,
    submissionReceipt,
    unsavedAnswerItemCount,
  ]);

  useEffect(() => {
    if (unsavedAnswerItemCount === 0 && pendingMediaItemCount === 0) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingMediaItemCount, unsavedAnswerItemCount]);

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      await logout();
    } catch {
      // The login page will confirm the final server-side session state.
    } finally {
      if (mountedRef.current) {
        router.replace('/login');
      }
    }
  }

  function markReadinessStale() {
    if (readinessRef.current) {
      setReadinessStale(true);
    }
    setConfirmationVisible(false);
    setSubmissionError(null);
  }

  function handleDraftChange(itemResponseId: string, draft: ItemDraftState) {
    if (submittingRef.current) {
      return;
    }

    setDrafts((current) => ({ ...current, [itemResponseId]: draft }));
    setFeedbacks((current) => ({
      ...current,
      [itemResponseId]: undefined,
    }));
  }

  function handleMediaDraftChange(
    itemResponseId: string,
    evidenceType: SupportedMediaEvidenceType,
    mediaDraft: MediaEvidenceDraft | null,
  ) {
    if (submittingRef.current) {
      return;
    }

    const key = buildMediaDraftKey(itemResponseId, evidenceType);
    setMediaDrafts((current) => {
      const next = { ...current };

      if (mediaDraft) {
        next[key] = mediaDraft;
      } else {
        delete next[key];
      }

      return next;
    });
  }

  function handleEvidenceRequirementChange(
    itemResponseId: string,
    requirement: EvidenceRequirementState,
  ) {
    setDetail((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        itemResponses: current.itemResponses.map((item) =>
          item.id === itemResponseId
            ? {
                ...item,
                evidenceRequirements: item.evidenceRequirements.map(
                  (currentRequirement) =>
                    currentRequirement.evidenceType ===
                    requirement.evidenceType
                      ? {
                          ...currentRequirement,
                          status: requirement.status,
                          attached: requirement.attached,
                        }
                      : currentRequirement,
                ),
              }
            : item,
        ),
      };
    });
  }

  function handleEvidencePersisted() {
    if (!mountedRef.current) {
      return;
    }

    markReadinessStale();
  }

  function handleBeginMediaWrite(
    itemResponseId: string,
    evidenceType: SupportedMediaEvidenceType,
  ): boolean {
    const key = buildMediaDraftKey(itemResponseId, evidenceType);

    if (submittingRef.current || mediaWritingKeysRef.current.has(key)) {
      return false;
    }

    mediaWritingKeysRef.current.add(key);
    setMediaWritingKeys(new Set(mediaWritingKeysRef.current));
    return true;
  }

  function handleEndMediaWrite(
    itemResponseId: string,
    evidenceType: SupportedMediaEvidenceType,
  ) {
    const key = buildMediaDraftKey(itemResponseId, evidenceType);
    mediaWritingKeysRef.current.delete(key);

    if (mountedRef.current) {
      setMediaWritingKeys(new Set(mediaWritingKeysRef.current));
    }
  }

  async function handleSaveItem(
    itemResponseId: string,
    markAsAnswered: boolean,
  ) {
    if (
      !detail ||
      submittingRef.current ||
      savingItemIdsRef.current.has(itemResponseId)
    ) {
      return;
    }

    const item = detail.itemResponses.find(
      (candidate) => candidate.id === itemResponseId,
    );
    const draft = drafts[itemResponseId];

    if (!item || !draft) {
      return;
    }

    const buildResult = buildItemResponseDraftRequest(
      item,
      draft,
      markAsAnswered,
    );

    if (!buildResult.ok) {
      setFeedbacks((current) => ({
        ...current,
        [itemResponseId]: { kind: 'error', message: buildResult.message },
      }));
      return;
    }

    if (!buildResult.hasChanges) {
      setDrafts((current) => ({
        ...current,
        [itemResponseId]: createItemDraftState(item),
      }));
      setFeedbacks((current) => ({
        ...current,
        [itemResponseId]: {
          kind: 'info',
          message: '没有需要保存的更改。',
        },
      }));
      return;
    }

    savingItemIdsRef.current.add(itemResponseId);
    setSavingItemIds((current) => new Set([...current, itemResponseId]));
    setFeedbacks((current) => ({
      ...current,
      [itemResponseId]: undefined,
    }));

    try {
      const response = await saveItemResponseDraft(
        patientId,
        visitId,
        scaleInstanceId,
        itemResponseId,
        buildResult.input,
      );

      if (!mountedRef.current) {
        return;
      }

      setDetail((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          scaleInstance: {
            ...current.scaleInstance,
            progress: {
              totalItemCount: response.progress.totalItemCount,
              answeredItemCount: Math.max(
                current.scaleInstance.progress.answeredItemCount,
                response.progress.answeredItemCount,
              ),
            },
          },
          itemResponses: current.itemResponses.map((currentItem) =>
            currentItem.id === itemResponseId
              ? response.itemResponse
              : currentItem,
          ),
        };
      });
      setDrafts((current) => ({
        ...current,
        [itemResponseId]: createItemDraftState(response.itemResponse),
      }));
      setFeedbacks((current) => ({
        ...current,
        [itemResponseId]: {
          kind: 'success',
          message: markAsAnswered
            ? '本题草稿已保存，并由服务端标记为本题完成。'
            : '本题草稿已保存。',
        },
      }));
      markReadinessStale();
    } catch (requestError: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const error =
        requestError instanceof AssessmentExecutionApiError
          ? requestError
          : new AssessmentExecutionApiError('unknown');

      if (error.kind === 'unauthenticated') {
        router.replace('/login');
        return;
      }

      setFeedbacks((current) => ({
        ...current,
        [itemResponseId]: {
          kind: 'error',
          message: getItemResponseSaveErrorMessage(error.kind),
        },
      }));
    } finally {
      savingItemIdsRef.current.delete(itemResponseId);

      if (mountedRef.current) {
        setSavingItemIds((current) => {
          const next = new Set(current);
          next.delete(itemResponseId);
          return next;
        });
      }
    }
  }

  function locateItemResponse(
    itemResponseId: string,
    source: 'submission' | 'scoring',
  ) {
    const section = sections.find((candidate) =>
      candidate.itemResponses.some((item) => item.id === itemResponseId),
    );

    if (!section) {
      if (source === 'scoring') {
        setScoreComputationStatus('未能定位该题目，请重新加载量表后再试。');
      } else {
        setSubmissionStatus('未能定位该题目，请重新加载量表后再试。');
      }
      return;
    }

    if (source === 'scoring') {
      setScoreComputationStatus(null);
    } else {
      setSubmissionStatus(null);
    }
    setActiveGroupCode(section.code);
    setPendingFocusSource(source);
    setPendingFocusItemId(itemResponseId);
  }

  function handleLocateSubmissionIssue(issue: ScaleSubmissionIssue) {
    if (issue.itemResponseId) {
      locateItemResponse(issue.itemResponseId, 'submission');
    }
  }

  function hasLocalSubmissionBlockers(): boolean {
    return (
      localBlockersRef.current.unsavedAnswerItemCount > 0 ||
      localBlockersRef.current.pendingMediaItemCount > 0 ||
      savingItemIdsRef.current.size > 0 ||
      mediaWritingKeysRef.current.size > 0
    );
  }

  function hasLocalScoreBlockers(): boolean {
    return hasLocalSubmissionBlockers() || submittingRef.current;
  }

  async function handlePrepareSubmission() {
    if (submittingRef.current) {
      return;
    }

    setConfirmationVisible(false);
    setSubmissionError(null);
    setSubmissionStatus(null);
    const latest = await loadSubmissionReadiness();

    if (!latest || !mountedRef.current) {
      return;
    }

    if (hasLocalSubmissionBlockers()) {
      setSubmissionStatus(
        '服务器检查已更新，但本地仍有尚未保存或正在写入的内容，请先完成保存或上传。',
      );
      return;
    }

    if (
      latest.ready &&
      latest.canSubmitNow &&
      latest.blockingIssues.length === 0
    ) {
      setConfirmationVisible(true);
      setSubmissionStatus(
        latest.warnings.length > 0
          ? `服务器检查已通过；当前有 ${latest.warnings.length} 条不阻断警告，请核对后确认。`
          : '服务器检查已通过，可以进行正式提交确认。',
      );
      return;
    }

    setSubmissionStatus('当前尚未满足正式提交条件，请处理阻断问题后重新检查。');
  }

  async function handleConfirmSubmission() {
    const latest = readinessRef.current;

    if (
      submittingRef.current ||
      !latest ||
      readinessStale ||
      hasLocalSubmissionBlockers() ||
      !latest.ready ||
      !latest.canSubmitNow ||
      latest.blockingIssues.length > 0
    ) {
      setConfirmationVisible(false);
      setSubmissionError(
        '当前提交依据已变化，请保存本地内容并重新检查提交条件。',
      );
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionError(null);
    setSubmissionStatus(null);

    try {
      const response = await submitScaleInstance(
        patientId,
        visitId,
        scaleInstanceId,
        { confirm: true },
      );

      if (!mountedRef.current) {
        return;
      }

      readinessRef.current = response.readiness;
      setDetail((current) =>
        current
          ? {
              ...current,
              scaleInstance: response.scaleInstance,
            }
          : current,
      );
      setReadiness(response.readiness);
      setReadinessError(null);
      setReadinessStale(false);
      setSubmissionReceipt(response.submission);
      setConfirmationVisible(false);
      setSubmissionStatus(
        response.submission.alreadySubmitted
          ? '服务器确认该量表实例此前已经提交，本次没有重复写入。'
          : '量表实例已正式提交并切换为只读；本次提交未自动执行评分，访视状态未改变。',
      );

      if (hasLocalSubmissionBlockers()) {
        setSubmissionStatus(
          '量表实例已完成；当前仍有本地未保存内容，无法继续保存，且这些内容没有被静默清除。',
        );
      }

      if (scoreQueryableInstanceStatuses.has(response.scaleInstance.status)) {
        void loadLatestScoreResult();
      }
    } catch (requestError: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const error =
        requestError instanceof AssessmentExecutionApiError
          ? requestError
          : new AssessmentExecutionApiError('unknown');

      if (error.kind === 'unauthenticated') {
        router.replace('/login');
        return;
      }

      setSubmissionError(getScaleSubmissionApiErrorMessage(error.kind));

      const refreshKinds = new Set<AssessmentExecutionApiError['kind']>([
        'scale_instance_not_ready',
        'scale_instance_submission_conflict',
        'scale_instance_not_submittable',
        'scale_instance_submission_audit_unavailable',
      ]);

      if (refreshKinds.has(error.kind)) {
        setConfirmationVisible(false);
        await loadSubmissionReadiness();
      } else if (
        error.kind === 'scale_instance_start_time_invalid' ||
        error.kind === 'scale_instance_submission_confirmation_required'
      ) {
        setConfirmationVisible(false);
      } else if (
        error.kind === 'scale_instance_submission_failed' ||
        error.kind === 'service_unavailable' ||
        error.kind === 'unknown'
      ) {
        setReadinessStale(true);
      }
    } finally {
      submittingRef.current = false;

      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  function getScoreComputeBlockReason(): string | null {
    if (!detail) {
      return '量表执行详情尚未加载完成。';
    }
    if (detail.scaleInstance.status !== 'completed') {
      return '只有已完成的量表实例可以首次计算阶段性评分。';
    }
    if (!scoreComputableVisitStatuses.has(detail.visit.status)) {
      return '当前访视状态不允许首次生成评分结果。';
    }
    if (unsavedAnswerItemCount > 0 || pendingMediaItemCount > 0) {
      return '存在本地未保存作答或未上传媒体，请先处理或离开这些本地内容；系统不会静默清除。';
    }
    if (savingItemIds.size > 0 || mediaWritingKeys.size > 0) {
      return '当前仍有题目保存或媒体写请求，请等待完成后再计算。';
    }
    if (isSubmitting) {
      return '当前正在正式提交量表实例，请等待提交完成后再计算。';
    }
    return null;
  }

  function handlePrepareScoreComputation() {
    setScoreComputationError(null);
    setScoreComputationStatus(null);

    const blockReason = getScoreComputeBlockReason();
    if (
      computingScoreRef.current ||
      scoreQueryStatus !== 'no_result' ||
      blockReason
    ) {
      setScoreConfirmationVisible(false);
      if (blockReason) {
        setScoreComputationStatus(blockReason);
      }
      return;
    }

    setScoreConfirmationVisible(true);
  }

  async function handleConfirmScoreComputation() {
    const blockReason = getScoreComputeBlockReason();

    if (
      computingScoreRef.current ||
      scoreQueryStatus !== 'no_result' ||
      blockReason ||
      hasLocalScoreBlockers()
    ) {
      setScoreConfirmationVisible(false);
      setScoreComputationError(
        blockReason ?? '当前评分依据已变化，请重新加载最新评分结果。',
      );
      return;
    }

    computingScoreRef.current = true;
    setIsComputingScore(true);
    setScoreConfirmationVisible(false);
    setScoreComputationError(null);
    setScoreComputationStatus(null);
    setScoreAlreadyComputed(null);

    try {
      const response = await computeProvisionalScoreResult(
        patientId,
        visitId,
        scaleInstanceId,
        { confirm: true },
      );

      if (!mountedRef.current) {
        return;
      }

      const nextResult: ScoreResultDetailResponse = {
        scale: response.scale,
        scaleInstance: response.scaleInstance,
        scoreResult: response.scoreResult,
        reviewQueue: response.reviewQueue,
      };
      setScoreResult(nextResult);
      setScoreQueryStatus('loaded');
      setScoreQueryError(null);
      setScoreAlreadyComputed(response.alreadyComputed);
      setDetail((current) =>
        current
          ? {
              ...current,
              scaleInstance: response.scaleInstance,
            }
          : current,
      );
    } catch (requestError: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const error =
        requestError instanceof ProvisionalScoringApiError
          ? requestError
          : new ProvisionalScoringApiError('unknown');

      if (error.kind === 'unauthenticated') {
        router.replace('/login');
        return;
      }

      setScoreComputationError(
        getProvisionalScoringApiErrorMessage(error.kind),
      );

      if (
        error.kind === 'score_computation_conflict' ||
        error.kind === 'score_result_voided'
      ) {
        await loadLatestScoreResult();
      } else if (error.kind === 'forbidden') {
        setScoreQueryStatus('forbidden');
      } else if (error.kind === 'score_result_incomplete') {
        setScoreQueryStatus('error');
        setScoreQueryError(getProvisionalScoringApiErrorMessage(error.kind));
      }
    } finally {
      computingScoreRef.current = false;

      if (mountedRef.current) {
        setIsComputingScore(false);
      }
    }
  }

  if (isLoading && !detail) {
    return (
      <Card aria-live="polite" role="status">
        <CardHeader>
          <CardTitle>正在加载量表执行详情</CardTitle>
          <CardDescription>
            正在读取访视、量表分组、安全题目与当前草稿，请稍候。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (detailError || !detail) {
    const error = detailError ?? new AssessmentExecutionApiError('unknown');
    const state = getExecutionDetailErrorState(error);
    const canReturnToVisit =
      mongoIdPattern.test(patientId) && mongoIdPattern.test(visitId);

    return (
      <Card role="alert">
        <CardHeader>
          <Badge tone="warning">{state.badge}</Badge>
          <CardTitle>{state.title}</CardTitle>
          <CardDescription>{state.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {state.canRetry ? (
            <Button onClick={() => setRetryKey((value) => value + 1)}>
              重新加载
            </Button>
          ) : null}
          {canReturnToVisit ? (
            <Link
              className={secondaryLinkClassName}
              href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`}
            >
              返回访视详情
            </Link>
          ) : null}
          <Link className={secondaryLinkClassName} href="/patients">
            返回患者列表
          </Link>
          <Link className={secondaryLinkClassName} href="/dashboard">
            返回工作台
          </Link>
          {error.kind === 'forbidden' ? (
            <Button
              disabled={isSigningOut}
              onClick={() => void handleSignOut()}
              variant="secondary"
            >
              {isSigningOut ? '正在退出...' : '退出登录'}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const { scale, scaleInstance, visit } = detail;
  const readOnlyReason = getScaleExecutionReadOnlyReason(
    visit.status,
    scaleInstance.status,
  );
  const effectiveReadOnlyReason = isSubmitting
    ? '正在正式提交量表，暂时不能修改记录。'
    : readOnlyReason;
  const scoreComputeBlockReason = getScoreComputeBlockReason();
  const canComputeScore =
    scoreQueryStatus === 'no_result' &&
    scoreComputeBlockReason === null &&
    !isComputingScore;
  const progressPercent =
    scaleInstance.progress.totalItemCount > 0
      ? Math.min(
          100,
          Math.round(
            (scaleInstance.progress.answeredItemCount /
              scaleInstance.progress.totalItemCount) *
              100,
          ),
        )
      : 0;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--cma-line)] pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">量表施测执行</Badge>
            {readOnlyReason ? <Badge tone="warning">只读查看</Badge> : null}
            {isSubmitting ? <Badge tone="warning">正在正式提交</Badge> : null}
            <Badge tone={unsavedAnswerItemCount > 0 ? 'warning' : 'success'}>
              未保存作答：{unsavedAnswerItemCount} 题
            </Badge>
            <Badge tone={pendingMediaItemCount > 0 ? 'warning' : 'success'}>
              未上传证据：{pendingMediaItemCount} 题
            </Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
            {scale.name}
            {scale.shortName ? `（${scale.shortName}）` : ''}
          </h1>
          <p className="mt-2 text-lg leading-8 text-[var(--cma-muted)]">
            患者 / 受试者编号：{visit.subjectCode} · 访视：
            {visit.visitCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className={secondaryLinkClassName}
            href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`}
          >
            返回访视详情
          </Link>
          <Link
            className={secondaryLinkClassName}
            href={`/patients/${encodeURIComponent(patientId)}`}
          >
            返回患者详情
          </Link>
          <Link className={secondaryLinkClassName} href="/dashboard">
            返回工作台
          </Link>
        </div>
      </header>

      <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-5 py-4 text-base leading-7 text-[var(--cma-info)]">
        核心认知量表应由医护或研究人员陪伴或监督完成。当前支持阶段性评分计算和待人工复核结果展示；人工评分确认、认知域、报告与 AI 仍未实现。
      </p>

      {readOnlyReason ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-5 py-4 text-base leading-7 text-[var(--cma-warning)]"
          role="status"
        >
          {readOnlyReason} 历史安全草稿不会隐藏，所有编辑和保存操作已禁用。
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader className="border-b border-[var(--cma-line)]">
            <CardTitle>访视信息</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  访视编号
                </dt>
                <dd className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                  {visit.visitCode}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  访视类型 / 状态
                </dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-base text-[var(--cma-text-strong)]">
                  {assessmentVisitTypeLabels[visit.visitType]}
                  <Badge tone={statusTones[visit.status]}>
                    {assessmentVisitStatusLabels[visit.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  评估时间
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {formatDateTime(visit.assessmentDate)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-[var(--cma-line)]">
            <CardTitle>量表与版本</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  量表编码 / 版本
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {scale.code.toUpperCase()} ·{' '}
                  {scale.displayVersion
                    ? `${scale.displayVersion}（${scale.version}）`
                    : scale.version}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  CRF 版本
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {scale.crfVersion || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  来源文档
                </dt>
                <dd className="mt-1 break-words text-base text-[var(--cma-text-strong)]">
                  {scale.sourceDocument || '—'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-[var(--cma-line)]">
            <CardTitle>实例与进度</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  实例编号 / 状态
                </dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-base text-[var(--cma-text-strong)]">
                  {scaleInstance.instanceCode} · 第 {scaleInstance.instanceNo} 份
                  <Badge tone={statusTones[scaleInstance.status]}>
                    {scaleInstanceStatusLabels[scaleInstance.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  施测方式
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {scaleAdministrationModeLabels[
                    scaleInstance.administrationMode
                  ]}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  操作者
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {scaleInstance.operatorSnapshot?.operatorName || '未记录'}
                  {scaleInstance.operatorSnapshot?.operatorRole
                    ? `（${
                        assessmentOperatorRoleLabels[
                          scaleInstance.operatorSnapshot.operatorRole
                        ]
                      }）`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  当前真实进度
                </dt>
                <dd className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                  {scaleInstance.progress.answeredItemCount} /{' '}
                  {scaleInstance.progress.totalItemCount}（{progressPercent}%）
                </dd>
                <div
                  aria-label="量表题目完成进度"
                  aria-valuemax={scaleInstance.progress.totalItemCount}
                  aria-valuemin={0}
                  aria-valuenow={scaleInstance.progress.answeredItemCount}
                  className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--cma-surface-muted)]"
                  role="progressbar"
                >
                  <div
                    className="h-full bg-[var(--cma-primary)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <ScaleInstanceSubmissionPanel
        activeAnswerWriteCount={savingItemIds.size}
        activeMediaWriteCount={mediaWritingKeys.size}
        completedAt={scaleInstance.completedAt}
        confirmationVisible={confirmationVisible}
        localUnsavedAnswerCount={unsavedAnswerItemCount}
        onConfirmSubmit={() => void handleConfirmSubmission()}
        onLocateIssue={handleLocateSubmissionIssue}
        onPrepareSubmit={() => void handlePrepareSubmission()}
        onRefresh={() => {
          setSubmissionError(null);
          setSubmissionStatus(null);
          setConfirmationVisible(false);
          void loadSubmissionReadiness();
        }}
        pendingMediaCount={pendingMediaItemCount}
        readOnlyReason={readOnlyReason}
        readiness={readiness}
        readinessError={
          readinessError
            ? getScaleSubmissionApiErrorMessage(readinessError.kind)
            : null
        }
        readinessLoading={isReadinessLoading}
        readinessStale={readinessStale}
        statusMessage={submissionStatus}
        submissionError={submissionError}
        submissionReceipt={submissionReceipt}
        submitting={isSubmitting}
      />

      <ProvisionalScoringPanel
        alreadyComputed={scoreAlreadyComputed}
        canCompute={canComputeScore}
        canLocateItem={(itemResponseId) =>
          sections.some((section) =>
            section.itemResponses.some((item) => item.id === itemResponseId),
          )
        }
        computationError={scoreComputationError}
        computationStatus={isComputingScore ? 'computing' : 'idle'}
        computeBlockReason={scoreComputeBlockReason}
        confirmationVisible={scoreConfirmationVisible}
        instanceStatus={scaleInstance.status}
        onConfirmCompute={() => void handleConfirmScoreComputation()}
        onLocateItem={(itemResponseId) =>
          locateItemResponse(itemResponseId, 'scoring')
        }
        onPrepareCompute={handlePrepareScoreComputation}
        onRefresh={() => {
          setScoreComputationError(null);
          setScoreComputationStatus(null);
          setScoreAlreadyComputed(null);
          setScoreConfirmationVisible(false);
          void loadLatestScoreResult();
        }}
        queryError={scoreQueryError}
        queryStatus={scoreQueryStatus}
        result={scoreResult}
        statusMessage={scoreComputationStatus}
        visitStatus={visit.status}
      />

      <Card>
        <CardHeader className="border-b border-[var(--cma-line)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>量表分组导航</CardTitle>
              <CardDescription>
                分组与题目均按服务端顺序展示；切换分组不会清除本地未保存输入。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                tone={unsavedAnswerItemCount > 0 ? 'warning' : 'success'}
              >
                未保存作答：{unsavedAnswerItemCount}
              </Badge>
              <Badge tone={pendingMediaItemCount > 0 ? 'warning' : 'success'}>
                未上传证据：{pendingMediaItemCount}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {sections.length > 0 ? (
            <ScaleExecutionGroupNavigation
              activeGroupCode={effectiveActiveGroupCode}
              onSelectGroup={setActiveGroupCode}
              sections={sections}
            />
          ) : (
            <p className="py-6 text-center text-base text-[var(--cma-muted)]">
              当前量表没有可展示的安全分组或题目。
            </p>
          )}
        </CardContent>
      </Card>

      {activeSection ? (
        <section className="grid gap-5" key={activeSection.code}>
          <header className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-5">
            <p className="text-sm font-semibold text-[var(--cma-primary)]">
              当前分组
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-[var(--cma-text-strong)]">
              {activeSection.title}
            </h2>
            {activeSection.description ? (
              <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
                {activeSection.description}
              </p>
            ) : null}
            {activeSection.instruction ? (
              <div className="mt-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4">
                <h3 className="font-semibold text-[var(--cma-info)]">
                  分组指导语
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-lg leading-8 text-[var(--cma-text-strong)]">
                  {activeSection.instruction}
                </p>
              </div>
            ) : null}
            {activeSection.cognitiveDomainCodes.length > 0 ? (
              <p className="mt-3 text-sm leading-6 text-[var(--cma-muted)]">
                认知域编码：{activeSection.cognitiveDomainCodes.join('、')}
              </p>
            ) : null}
          </header>

          {activeSection.itemResponses.length > 0 ? (
            activeSection.itemResponses.map((item) => {
              const draft = drafts[item.id];

              if (!draft) {
                return null;
              }

              return (
                <div
                  aria-label={`第 ${item.itemOrder} 题定位区域`}
                  className="scroll-mt-4 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--cma-ring)]"
                  id={`submission-item-${item.id}`}
                  key={item.id}
                  tabIndex={-1}
                >
                  <ItemResponseEditor
                    draft={draft}
                    feedback={feedbacks[item.id] ?? null}
                    isDirty={itemDraftHasChanges(item, draft)}
                    isSaving={savingItemIds.has(item.id)}
                    item={item}
                    mediaDrafts={getItemMediaDrafts(mediaDrafts, item.id)}
                    mediaWritingTypes={getItemMediaWritingTypes(
                      mediaWritingKeys,
                      item.id,
                    )}
                    onChange={(nextDraft) =>
                      handleDraftChange(item.id, nextDraft)
                    }
                    onEvidenceRequirementChange={(requirement) =>
                      handleEvidenceRequirementChange(item.id, requirement)
                    }
                    onEvidencePersisted={handleEvidencePersisted}
                    onEndMediaWrite={(evidenceType) =>
                      handleEndMediaWrite(item.id, evidenceType)
                    }
                    onMediaDraftChange={(evidenceType, mediaDraft) =>
                      handleMediaDraftChange(
                        item.id,
                        evidenceType,
                        mediaDraft ?? null,
                      )
                    }
                    onTryBeginMediaWrite={(evidenceType) =>
                      handleBeginMediaWrite(item.id, evidenceType)
                    }
                    onSave={(markAsAnswered) =>
                      handleSaveItem(item.id, markAsAnswered)
                    }
                    pageReadOnlyReason={effectiveReadOnlyReason}
                    patientId={patientId}
                    scaleInstanceId={scaleInstanceId}
                    visitId={visitId}
                  />
                </div>
              );
            })
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>该分组暂无题目</CardTitle>
                <CardDescription>
                  服务端当前未返回属于该分组的安全题目。
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </section>
      ) : null}
    </div>
  );
}
