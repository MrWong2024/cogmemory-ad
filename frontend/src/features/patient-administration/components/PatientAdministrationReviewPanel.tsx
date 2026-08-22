'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { ScaleSubmissionIssueList } from '@/src/features/assessments/components/ScaleSubmissionIssueList';
import {
  getInlineSubmissionIssueSnapshotLabel,
  type ScaleSubmissionIssueRouting,
} from '@/src/features/assessments/lib/scale-submission-issue-routing';
import { getStructuredManualFields } from '@/src/features/assessments/lib/item-response-draft';
import type { ItemResponseExecution } from '@/src/features/assessments/types/item-response-execution';
import {
  adoptPatientAdministrationEvidence,
  getMediaEvidenceAccessUrl,
  MediaEvidenceApiError,
  transcribeItemMediaEvidence,
} from '@/src/features/assessments/api/media-evidence-api';
import type { EvidenceRequirementState } from '@/src/features/assessments/types/media-evidence';
import {
  getPatientAdministrationReview,
  PatientAdministrationApiError,
} from '@/src/features/patient-administration/api/patient-administration-api';
import {
  formatPatientAdministrationDate,
  patientAdministrationImpactFactorLabels,
  patientAdministrationStatusLabels,
  patientAdministrationStatusTones,
} from '@/src/features/patient-administration/lib/patient-administration-display';
import { routePatientReviewReferences } from '@/src/features/patient-administration/lib/patient-review-reference-routing';
import {
  formatPatientAdministrationReviewDimensions,
  formatPatientAdministrationReviewFileSize,
  formatPatientAdministrationReviewFileType,
  getPatientEvidenceFormalAdoptionState,
  getPatientAdministrationReviewEvidenceStatusLabel,
  patientAdministrationHandwritingInputToolLabels,
} from '@/src/features/patient-administration/lib/patient-administration-review-display';
import type {
  PatientAdministrationControlEventAction,
  PatientAdministrationReviewEvidence,
  PatientAdministrationReviewItem,
  PatientAdministrationReviewResponse,
  PatientAdministrationReviewRun,
  PatientAdministrationReviewStep,
  PatientAdministrationReviewTranscription,
  PatientAdministrationRouteIds,
} from '@/src/features/patient-administration/types/patient-administration';

const responseModeLabels = {
  speech: '口头回答',
  writing: '书写',
  drawing: '绘图',
  staff_observation: '医护现场观察',
} as const;

const itemStatusLabels = {
  not_started: '未开始',
  in_progress: '草稿中',
  answered: '已完成草稿',
  scored: '已评分',
  locked: '已锁定',
  voided: '已作废',
} as const;

const evidenceTypeLabels = {
  audio: '患者录音',
  photo: '患者照片',
  handwriting: '患者手写 / 绘图',
} as const;

const captureModeLabels = {
  photo_upload: '照片上传',
  tablet_handwriting: '平板手写',
  paper_scan: '纸笔照片',
  browser_audio_recording: '浏览器录音',
  system_generated: '系统生成',
  imported: '导入',
  other: '其他',
} as const;

const eventLabels: Record<PatientAdministrationControlEventAction, string> = {
  entry_redeemed: '进入码已兑换',
  same_device_handoff: '同设备已安全交接',
  preparation_confirmed: '准备已确认',
  paused: '施测暂停',
  resumed: '施测恢复',
  device_reissued: '设备凭证已重签',
  terminated: '施测终止',
  expired: '施测过期',
  staff_takeover: '医护接管',
  step_redo: '步骤重做',
};

type EvidenceFeedback = {
  tone: 'success' | 'error';
  message: string;
};

type ViewerState = {
  evidenceType: PatientAdministrationReviewEvidence['evidenceType'];
  mediaEvidenceId: string;
  url: string;
};

type EvidenceAccessFeedback = {
  mediaEvidenceId: string;
  message: string;
};

export type PatientAdministrationReviewReferenceSlots = {
  itemSharedReference?: ReactNode;
  structuredSharedReference?: ReactNode;
  structuredFieldReferencesByCode?: Readonly<Record<string, ReactNode>>;
};

function reviewErrorMessage(error: PatientAdministrationApiError): string {
  if (error.kind === 'forbidden') {
    return '当前账号无权读取患者施测作答复核。';
  }
  if (error.kind === 'step_invalid' || error.kind === 'session_conflict') {
    return '患者施测事实不一致，无法安全生成复核摘要。请联系管理员核对数据。';
  }
  if (error.kind === 'service_unavailable') {
    return '复核摘要服务暂时不可用，请稍后手动刷新。';
  }
  return '复核摘要加载失败，请手动刷新后重试。';
}

function accessErrorMessage(error: MediaEvidenceApiError): string {
  if (error.kind === 'media_evidence_not_accessible') {
    return '该证据当前不可访问，请刷新复核摘要后核对状态。';
  }
  if (error.kind === 'media_storage_unavailable') {
    return '证据存储暂时不可用，请稍后重试。';
  }
  return '证据查看地址获取失败，请重试。';
}

function transcriptionErrorMessage(error: MediaEvidenceApiError): string {
  if (error.kind === 'media_transcription_unavailable') {
    return '辅助转写服务暂时不可用；这不会阻断人工复核或正式提交。';
  }
  if (error.kind === 'media_transcription_not_allowed') {
    return '该录音当前不允许转写，请刷新摘要并核对证据状态。';
  }
  if (error.kind === 'media_transcription_conflict') {
    return '转写状态已变化，本次请求未自动重试；请手动刷新后核对。';
  }
  return '辅助转写失败；本次请求未自动重试，可稍后明确重试。';
}

function adoptionErrorMessage(error: MediaEvidenceApiError): string {
  if (error.kind === 'media_evidence_not_adoptable') {
    return '该患者证据已不满足采用条件，请刷新摘要并核对当前服务端事实。';
  }
  if (error.kind === 'media_evidence_already_attached') {
    return '该题已有同类型正式证据，未重复采用。';
  }
  if (
    error.kind === 'scale_instance_not_editable' ||
    error.kind === 'item_response_not_editable'
  ) {
    return '量表或题目已不可编辑，不能再采用患者证据。';
  }
  return '患者证据采用失败；没有自动重试，也没有创建替代证据。';
}

function transcriptionSummary(
  transcription: PatientAdministrationReviewTranscription | null,
): string {
  if (!transcription || transcription.status === 'not_requested') {
    return '尚未请求辅助转写';
  }
  if (transcription.status === 'processing') return '辅助转写处理中';
  if (transcription.status === 'failed') {
    return transcription.errorCode
      ? `辅助转写失败（${transcription.errorCode}）`
      : '辅助转写失败';
  }
  return transcription.text || '辅助转写已完成，但未返回可展示文本';
}

function durationLabel(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs)) return '时长未记录';
  return `${(durationMs / 1000).toFixed(1)} 秒`;
}

export function PatientAdministrationReviewPanel({
  evidenceRequirementsByItem,
  formalItems,
  issueRouting,
  onEvidenceAdopted,
  onUnauthorized,
  patientId,
  readinessStale,
  readOnlyReason,
  renderFormalEditor,
  scaleInstanceId,
  visitId,
}: {
  evidenceRequirementsByItem: Record<string, EvidenceRequirementState[]>;
  formalItems: ItemResponseExecution[];
  issueRouting: ScaleSubmissionIssueRouting | null;
  onEvidenceAdopted: (
    itemResponseId: string,
    requirement: EvidenceRequirementState,
  ) => void;
  onUnauthorized: () => void;
  patientId: string;
  readinessStale: boolean;
  readOnlyReason: string | null;
  renderFormalEditor: (
    item: ItemResponseExecution,
    references: PatientAdministrationReviewReferenceSlots,
  ) => ReactNode;
  scaleInstanceId: string;
  visitId: string;
}) {
  const ids = useMemo<PatientAdministrationRouteIds>(
    () => ({ patientId, visitId, scaleInstanceId }),
    [patientId, scaleInstanceId, visitId],
  );
  const mountedRef = useRef(true);
  const reviewControllerRef = useRef<AbortController | null>(null);
  const accessControllerRef = useRef<AbortController | null>(null);
  const [review, setReview] =
    useState<PatientAdministrationReviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [viewerLoadingId, setViewerLoadingId] = useState<string | null>(null);
  const [accessFeedback, setAccessFeedback] =
    useState<EvidenceAccessFeedback | null>(null);
  const [transcribingIds, setTranscribingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const transcribingIdsRef = useRef(new Set<string>());
  const [adoptingIds, setAdoptingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const adoptingIdsRef = useRef(new Set<string>());
  const [feedbacks, setFeedbacks] = useState<
    Record<string, EvidenceFeedback | undefined>
  >({});

  const clearViewer = useCallback(() => {
    accessControllerRef.current?.abort();
    accessControllerRef.current = null;
    setViewer(null);
    setViewerLoadingId(null);
    setAccessFeedback(null);
  }, []);

  const loadReview = useCallback(async () => {
    reviewControllerRef.current?.abort();
    const controller = new AbortController();
    reviewControllerRef.current = controller;
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await getPatientAdministrationReview(
        ids,
        controller.signal,
      );
      if (controller.signal.aborted || !mountedRef.current) return;
      setReview(response);
      setIsEmpty(false);
    } catch (requestError: unknown) {
      if (controller.signal.aborted || !mountedRef.current) return;
      const error =
        requestError instanceof PatientAdministrationApiError
          ? requestError
          : new PatientAdministrationApiError('unknown');
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      if (error.kind === 'session_not_found') {
        setReview(null);
        setIsEmpty(true);
        setLoadError(null);
        return;
      }
      setReview(null);
      setIsEmpty(false);
      setLoadError(reviewErrorMessage(error));
    } finally {
      if (reviewControllerRef.current === controller) {
        reviewControllerRef.current = null;
      }
      if (!controller.signal.aborted && mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [ids, onUnauthorized]);

  useEffect(() => {
    mountedRef.current = true;
    void loadReview();
    return () => {
      mountedRef.current = false;
      reviewControllerRef.current?.abort();
      reviewControllerRef.current = null;
      accessControllerRef.current?.abort();
      accessControllerRef.current = null;
    };
  }, [loadReview]);

  useEffect(() => {
    clearViewer();
    setFeedbacks({});
    transcribingIdsRef.current.clear();
    adoptingIdsRef.current.clear();
    setTranscribingIds(new Set());
    setAdoptingIds(new Set());
  }, [clearViewer, patientId, scaleInstanceId, visitId]);

  const reviewItemsByFormalItemId = useMemo(() => {
    const matched = new Map<string, PatientAdministrationReviewItem>();
    if (!review) {
      return matched;
    }

    const reviewItemsById = new Map(
      review.items.map((item) => [item.itemResponseId, item]),
    );
    const reviewItemsByCode = new Map<
      string,
      PatientAdministrationReviewItem | null
    >();
    const formalItemCodeCounts = new Map<string, number>();
    review.items.forEach((item) => {
      reviewItemsByCode.set(
        item.itemCode,
        reviewItemsByCode.has(item.itemCode) ? null : item,
      );
    });
    formalItems.forEach((item) => {
      formalItemCodeCounts.set(
        item.itemCode,
        (formalItemCodeCounts.get(item.itemCode) ?? 0) + 1,
      );
    });

    formalItems.forEach((formalItem) => {
      const reviewItem =
        reviewItemsById.get(formalItem.id) ??
        (formalItemCodeCounts.get(formalItem.itemCode) === 1
          ? reviewItemsByCode.get(formalItem.itemCode)
          : null) ??
        null;
      if (reviewItem) {
        matched.set(formalItem.id, reviewItem);
      }
    });
    return matched;
  }, [formalItems, review]);
  const stepCount = (review?.items ?? []).reduce(
    (count, item) => count + item.steps.length,
    0,
  );
  const orderedItems = formalItems.map((formalItem) => {
    const reviewItem = reviewItemsByFormalItemId.get(formalItem.id);
    return {
      ...(reviewItem ?? {
        itemResponseId: formalItem.id,
        itemCode: formalItem.itemCode,
        itemTitle: formalItem.itemTitle,
        status: formalItem.status,
        draftRevision: formalItem.draftRevision,
        steps: [],
      }),
      itemResponseId: formalItem.id,
      itemCode: formalItem.itemCode,
      itemTitle: formalItem.itemTitle,
      status: formalItem.status,
      formalItem,
      hasReviewFacts: Boolean(reviewItem),
    };
  });

  function setEvidenceFeedback(
    mediaEvidenceId: string,
    feedback: EvidenceFeedback | undefined,
  ) {
    setFeedbacks((current) => ({ ...current, [mediaEvidenceId]: feedback }));
  }

  function updateTranscription(
    mediaEvidenceId: string,
    transcription: PatientAdministrationReviewTranscription,
  ) {
    setReview((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => ({
              ...item,
              steps: item.steps.map((step) => ({
                ...step,
                runs: step.runs.map((run) => ({
                  ...run,
                  evidence: run.evidence.map((evidence) =>
                    evidence.mediaEvidenceId === mediaEvidenceId
                      ? { ...evidence, transcription }
                      : evidence,
                  ),
                })),
              })),
            })),
          }
        : current,
    );
  }

  async function handleOpenEvidence(
    itemResponseId: string,
    evidence: PatientAdministrationReviewEvidence,
  ) {
    accessControllerRef.current?.abort();
    const controller = new AbortController();
    accessControllerRef.current = controller;
    setViewer(null);
    setViewerLoadingId(evidence.mediaEvidenceId);
    setAccessFeedback(null);
    try {
      const response = await getMediaEvidenceAccessUrl(
        patientId,
        visitId,
        scaleInstanceId,
        itemResponseId,
        evidence.mediaEvidenceId,
        'primary',
        { signal: controller.signal },
      );
      if (controller.signal.aborted || !mountedRef.current) return;
      setViewer({
        evidenceType: evidence.evidenceType,
        mediaEvidenceId: evidence.mediaEvidenceId,
        url: response.url,
      });
    } catch (requestError: unknown) {
      if (controller.signal.aborted || !mountedRef.current) return;
      const error =
        requestError instanceof MediaEvidenceApiError
          ? requestError
          : new MediaEvidenceApiError('unknown');
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      setAccessFeedback({
        mediaEvidenceId: evidence.mediaEvidenceId,
        message: accessErrorMessage(error),
      });
    } finally {
      if (accessControllerRef.current === controller) {
        accessControllerRef.current = null;
      }
      if (!controller.signal.aborted && mountedRef.current) {
        setViewerLoadingId(null);
      }
    }
  }

  async function handleTranscribe(
    itemResponseId: string,
    evidence: PatientAdministrationReviewEvidence,
  ) {
    const evidenceId = evidence.mediaEvidenceId;
    if (transcribingIdsRef.current.has(evidenceId)) return;
    transcribingIdsRef.current.add(evidenceId);
    setTranscribingIds(new Set(transcribingIdsRef.current));
    setEvidenceFeedback(evidenceId, undefined);
    try {
      const response = await transcribeItemMediaEvidence(
        patientId,
        visitId,
        scaleInstanceId,
        itemResponseId,
        evidenceId,
      );
      if (!mountedRef.current) return;
      updateTranscription(evidenceId, response.transcription);
      setEvidenceFeedback(evidenceId, {
        tone: response.transcription.status === 'succeeded' ? 'success' : 'error',
        message:
          response.transcription.status === 'succeeded'
            ? '辅助转写候选已返回；它没有写入正式答案。'
            : '辅助转写未成功；可在需要时明确重试。',
      });
    } catch (requestError: unknown) {
      if (!mountedRef.current) return;
      const error =
        requestError instanceof MediaEvidenceApiError
          ? requestError
          : new MediaEvidenceApiError('unknown');
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      setEvidenceFeedback(evidenceId, {
        tone: 'error',
        message: transcriptionErrorMessage(error),
      });
    } finally {
      transcribingIdsRef.current.delete(evidenceId);
      if (mountedRef.current) {
        setTranscribingIds(new Set(transcribingIdsRef.current));
      }
    }
  }

  async function handleAdopt(
    itemResponseId: string,
    evidence: PatientAdministrationReviewEvidence,
  ) {
    const evidenceId = evidence.mediaEvidenceId;
    if (adoptingIdsRef.current.has(evidenceId)) return;
    adoptingIdsRef.current.add(evidenceId);
    setAdoptingIds(new Set(adoptingIdsRef.current));
    setEvidenceFeedback(evidenceId, undefined);
    try {
      const response = await adoptPatientAdministrationEvidence(
        patientId,
        visitId,
        scaleInstanceId,
        itemResponseId,
        evidenceId,
      );
      if (!mountedRef.current) return;
      onEvidenceAdopted(itemResponseId, response.evidenceRequirement);
      setEvidenceFeedback(evidenceId, {
        tone: 'success',
        message:
          '已采用同一个患者证据并更新正式证据要求；没有复制文件，也没有形成或确认答案。',
      });
    } catch (requestError: unknown) {
      if (!mountedRef.current) return;
      const error =
        requestError instanceof MediaEvidenceApiError
          ? requestError
          : new MediaEvidenceApiError('unknown');
      if (error.kind === 'unauthenticated') {
        onUnauthorized();
        return;
      }
      setEvidenceFeedback(evidenceId, {
        tone: 'error',
        message: adoptionErrorMessage(error),
      });
    } finally {
      adoptingIdsRef.current.delete(evidenceId);
      if (mountedRef.current) {
        setAdoptingIds(new Set(adoptingIdsRef.current));
      }
    }
  }

  function canAdoptEvidence(
    run: PatientAdministrationReviewRun,
    evidence: PatientAdministrationReviewEvidence,
    adoptionState: ReturnType<typeof getPatientEvidenceFormalAdoptionState>,
  ): boolean {
    if (
      review?.session.status !== 'completed' ||
      readOnlyReason ||
      !run.capture ||
      run.capture.invalidatedAt ||
      !['photo', 'handwriting'].includes(evidence.evidenceType) ||
      evidence.status !== 'attached' ||
      evidence.storageStatus !== 'stored'
    ) {
      return false;
    }
    return adoptionState === 'available';
  }

  function renderEvidence(
    itemResponseId: string,
    run: PatientAdministrationReviewRun,
    evidence: PatientAdministrationReviewEvidence,
  ) {
    const feedback = feedbacks[evidence.mediaEvidenceId];
    const currentAccessFeedback =
      accessFeedback?.mediaEvidenceId === evidence.mediaEvidenceId
        ? accessFeedback
        : null;
    const currentViewer =
      viewer?.mediaEvidenceId === evidence.mediaEvidenceId ? viewer : null;
    const transcription = evidence.transcription;
    const canTranscribe =
      !readOnlyReason &&
      review?.session.status === 'completed' &&
      Boolean(run.capture && !run.capture.invalidatedAt) &&
      evidence.evidenceType === 'audio' &&
      evidence.status === 'attached' &&
      evidence.storageStatus === 'stored' &&
      transcription?.status !== 'succeeded' &&
      transcription?.status !== 'processing';
    const adoptionState = getPatientEvidenceFormalAdoptionState(
      evidenceRequirementsByItem[itemResponseId] ?? [],
      evidence,
    );
    const adoptable = canAdoptEvidence(run, evidence, adoptionState);

    return (
      <div
        className="grid gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4"
        data-testid={`patient-administration-review-evidence-${evidence.mediaEvidenceId}`}
        key={evidence.mediaEvidenceId}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{evidenceTypeLabels[evidence.evidenceType]}</Badge>
          <span className="text-sm text-[var(--cma-muted)]">
            {captureModeLabels[evidence.captureMode]} ·{' '}
            {getPatientAdministrationReviewEvidenceStatusLabel(evidence)}
          </span>
        </div>
        <p className="text-sm leading-6 text-[var(--cma-muted)]">
          上传时间：{formatPatientAdministrationDate(evidence.uploadedAt)}
          {evidence.evidenceType === 'audio'
            ? ` · ${durationLabel(evidence.audioMetadata?.durationMs ?? null)}`
            : ''}
        </p>
        {evidence.evidenceType === 'photo' ||
        evidence.evidenceType === 'handwriting' ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">
                文件类型
              </dt>
              <dd className="mt-1 text-[var(--cma-text-strong)]">
                {formatPatientAdministrationReviewFileType(evidence.file)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">
                文件大小
              </dt>
              <dd className="mt-1 text-[var(--cma-text-strong)]">
                {formatPatientAdministrationReviewFileSize(
                  evidence.file?.sizeBytes,
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--cma-muted)]">
                图片尺寸
              </dt>
              <dd className="mt-1 text-[var(--cma-text-strong)]">
                {formatPatientAdministrationReviewDimensions(
                  evidence.imageMetadata?.width,
                  evidence.imageMetadata?.height,
                )}
              </dd>
            </div>
            {evidence.evidenceType === 'handwriting' &&
            evidence.handwritingTrace ? (
              <>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    画布尺寸
                  </dt>
                  <dd className="mt-1 text-[var(--cma-text-strong)]">
                    {formatPatientAdministrationReviewDimensions(
                      evidence.handwritingTrace.canvasWidth,
                      evidence.handwritingTrace.canvasHeight,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    笔画数
                  </dt>
                  <dd className="mt-1 text-[var(--cma-text-strong)]">
                    {evidence.handwritingTrace.strokeCount ?? '未记录'}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    书写时长
                  </dt>
                  <dd className="mt-1 text-[var(--cma-text-strong)]">
                    {durationLabel(evidence.handwritingTrace.durationMs)}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    输入方式
                  </dt>
                  <dd className="mt-1 text-[var(--cma-text-strong)]">
                    {
                      patientAdministrationHandwritingInputToolLabels[
                        evidence.handwritingTrace.inputTool
                      ]
                    }
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        ) : null}
        {evidence.evidenceType === 'audio' ? (
          <div className="rounded-md bg-[var(--cma-info-soft)] p-3">
            <p className="font-semibold text-[var(--cma-text-strong)]">
              辅助转写
            </p>
            <p
              className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]"
              data-testid="patient-administration-transcription-candidate"
            >
              {transcriptionSummary(transcription)}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--cma-warning)]">
              辅助转写候选，请医护核对后填写下方正式作答。
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid={`patient-administration-review-view-${evidence.mediaEvidenceId}`}
            disabled={viewerLoadingId === evidence.mediaEvidenceId}
            onClick={() => void handleOpenEvidence(itemResponseId, evidence)}
            size="sm"
            variant="secondary"
          >
            {viewerLoadingId === evidence.mediaEvidenceId
              ? '正在获取查看地址...'
              : '查看原始证据'}
          </Button>
          {evidence.evidenceType === 'audio' ? (
            <Button
              data-testid={`patient-administration-review-transcribe-${evidence.mediaEvidenceId}`}
              disabled={!canTranscribe || transcribingIds.has(evidence.mediaEvidenceId)}
              onClick={() => void handleTranscribe(itemResponseId, evidence)}
              size="sm"
              variant="secondary"
            >
              {transcribingIds.has(evidence.mediaEvidenceId)
                ? '正在辅助转写...'
                : transcription?.status === 'failed'
                  ? '重试辅助转写'
                  : transcription?.status === 'succeeded'
                    ? '辅助转写已完成'
                  : '生成辅助转写'}
            </Button>
          ) : null}
          {['photo', 'handwriting'].includes(evidence.evidenceType) ? (
            <Button
              data-testid={`patient-administration-review-adopt-${evidence.mediaEvidenceId}`}
              disabled={!adoptable || adoptingIds.has(evidence.mediaEvidenceId)}
              onClick={() => void handleAdopt(itemResponseId, evidence)}
              size="sm"
              variant="secondary"
            >
              {adoptingIds.has(evidence.mediaEvidenceId)
                ? '正在采用患者证据...'
                : adoptionState === 'adopted'
                  ? '患者证据已采用'
                  : adoptionState === 'occupied'
                    ? '该题已有同类型正式证据'
                    : '采用到正式题目证据'}
            </Button>
          ) : null}
        </div>
        {currentAccessFeedback ? (
          <p
            className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-sm leading-6 text-[var(--cma-danger)]"
            role="alert"
          >
            {currentAccessFeedback.message}
          </p>
        ) : null}
        {currentViewer ? (
          <section
            aria-label="患者原始证据查看器"
            className="grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface-muted)] p-5"
            data-testid="patient-administration-review-viewer"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
                原始证据查看器
              </h3>
              <Button
                data-testid="patient-administration-review-viewer-close"
                onClick={clearViewer}
                size="sm"
                variant="secondary"
              >
                关闭查看器
              </Button>
            </div>
            {currentViewer.evidenceType === 'audio' ? (
              <audio
                className="w-full"
                controls
                data-testid="patient-administration-review-audio"
                preload="none"
                src={currentViewer.url}
              >
                当前浏览器不支持音频播放。
              </audio>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- signed clinical evidence URL is memory-only and is not an optimizable public asset.
              <img
                alt="患者原始书写或照片证据"
                className="h-auto max-h-[70vh] w-full object-contain"
                data-testid="patient-administration-review-image"
                src={currentViewer.url}
              />
            )}
          </section>
        ) : null}
        {feedback ? (
          <p
            className={
              feedback.tone === 'success'
                ? 'text-sm leading-6 text-[var(--cma-success)]'
                : 'text-sm leading-6 text-[var(--cma-danger)]'
            }
            role="status"
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    );
  }

  function renderStepReference(
    itemResponseId: string,
    step: PatientAdministrationReviewStep,
  ) {
    const validCaptureCount = step.runs.filter(
      (run) => run.capture !== null && run.capture.invalidatedAt === null,
    ).length;
    const evidenceCount = step.runs.reduce(
      (count, run) => count + run.evidence.length,
      0,
    );
    const succeededTranscriptionCount = step.runs.reduce(
      (count, run) =>
        count +
        run.evidence.filter(
          (evidence) => evidence.transcription?.status === 'succeeded',
        ).length,
      0,
    );
    const hasRedoHistory =
      step.runs.length > 1 ||
      step.runs.some((run) =>
        Boolean(run.stepRun > 1 || run.capture?.invalidatedAt),
      );

    return (
      <details
        className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)]"
        data-testid={`patient-administration-review-step-${step.stepKey}`}
        key={step.stepKey}
      >
        <summary className="cursor-pointer px-4 py-3 text-[var(--cma-text-strong)]">
          <span className="ml-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">
            <span className="font-semibold">
              第 {step.order} 步 · {responseModeLabels[step.responseMode]}
            </span>
            <span className="text-sm text-[var(--cma-muted)]">
              {step.runs.length === 0
                ? '无采集运行'
                : `${step.runs.length} 次运行`}{' '}
              · {validCaptureCount} 个有效采集 · {evidenceCount} 条证据 ·{' '}
              {succeededTranscriptionCount} 条辅助转写已完成
            </span>
            {hasRedoHistory ? <Badge tone="warning">含重做记录</Badge> : null}
          </span>
        </summary>
        <div className="grid gap-3 border-t border-[var(--cma-line)] px-4 pb-4 pt-3">
          {step.runs.length === 0 ? (
            <p className="text-sm text-[var(--cma-muted)]">
              当前步骤尚无采集运行事实。
            </p>
          ) : (
            step.runs.map((run) => (
              <div
                className="grid gap-3 border-l-2 border-[var(--cma-line-strong)] pl-4"
                key={run.stepRun}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-[var(--cma-text-strong)]">
                    第 {run.stepRun} 次运行
                  </span>
                  {run.capture ? (
                    <>
                      <Badge
                        tone={run.capture.invalidatedAt ? 'warning' : 'success'}
                      >
                        {run.capture.invalidatedAt
                          ? '已作废 / 已重做'
                          : '有效采集'}
                      </Badge>
                      <span className="text-[var(--cma-muted)]">
                        {run.capture.capturedBy === 'patient'
                          ? '患者采集'
                          : '医护采集'}{' '}
                        ·{' '}
                        {formatPatientAdministrationDate(
                          run.capture.capturedAt,
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--cma-muted)]">无采集摘要</span>
                  )}
                </div>
                {run.capture?.invalidatedReason ? (
                  <p className="text-sm leading-6 text-[var(--cma-warning)]">
                    作废 / 重做原因：{run.capture.invalidatedReason}
                  </p>
                ) : null}
                {run.capture?.staffObservation ? (
                  <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-3">
                    <p className="text-sm font-semibold text-[var(--cma-muted)]">
                      现场医护观察
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
                      {run.capture.staffObservation}
                    </p>
                  </div>
                ) : null}
                {run.evidence.length > 0 ? (
                  <div className="grid gap-3">
                    {run.evidence.map((evidence) =>
                      renderEvidence(itemResponseId, run, evidence),
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--cma-muted)]">
                    本次运行没有媒体证据。
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </details>
    );
  }

  function renderStepReferenceGroup(
    itemResponseId: string,
    steps: readonly PatientAdministrationReviewStep[],
  ): ReactNode | undefined {
    if (steps.length === 0) {
      return undefined;
    }

    return (
      <div className="grid gap-3">
        {[...steps]
          .sort((left, right) => left.order - right.order)
          .map((step) => renderStepReference(itemResponseId, step))}
      </div>
    );
  }

  return (
    <Card data-testid="patient-administration-review-panel">
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>医护复核与正式作答</CardTitle>
            <CardDescription className="mt-2">
              按正式题目合并患者施测事实、原始证据、辅助转写、提交检查问题与既有正式作答编辑器。
            </CardDescription>
          </div>
          <Button
            disabled={isLoading}
            onClick={() => {
              clearViewer();
              void loadReview();
            }}
            variant="secondary"
          >
            {isLoading ? '正在刷新复核摘要...' : '刷新复核摘要'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 pt-5">
        {isLoading && !review ? (
          <p className="text-base text-[var(--cma-muted)]" role="status">
            正在加载患者施测复核摘要...
          </p>
        ) : null}

        {isEmpty ? (
          <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
            <p className="font-semibold text-[var(--cma-text-strong)]">
              尚无可复核的患者施测记录
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
              可在患者施测完成后手动刷新；页面不会轮询该接口。
            </p>
          </div>
        ) : null}

        {loadError ? (
          <p
            className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-base leading-7 text-[var(--cma-danger)]"
            role="alert"
          >
            {loadError}
          </p>
        ) : null}

        {review ? (
          <>
            <section
              aria-labelledby="patient-administration-review-session-heading"
              className="grid gap-4 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className="text-xl font-semibold text-[var(--cma-text-strong)]"
                  id="patient-administration-review-session-heading"
                >
                  施测会话摘要
                </h3>
                <Badge tone={patientAdministrationStatusTones[review.session.status]}>
                  {patientAdministrationStatusLabels[review.session.status]}
                </Badge>
                <Badge tone="neutral">{stepCount} 个施测步骤</Badge>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">准备确认</dt>
                  <dd className="mt-1 text-[var(--cma-text-strong)]">
                    {formatPatientAdministrationDate(
                      review.session.preparationConfirmedAt,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">开始</dt>
                  <dd className="mt-1 text-[var(--cma-text-strong)]">
                    {formatPatientAdministrationDate(review.session.startedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">完成</dt>
                  <dd className="mt-1 text-[var(--cma-text-strong)]">
                    {formatPatientAdministrationDate(review.session.completedAt)}
                  </dd>
                </div>
                {review.session.terminatedAt ? (
                  <div>
                    <dt className="font-semibold text-[var(--cma-muted)]">终止</dt>
                    <dd className="mt-1 text-[var(--cma-text-strong)]">
                      {formatPatientAdministrationDate(review.session.terminatedAt)}
                    </dd>
                  </div>
                ) : null}
                {review.session.expiredAt ? (
                  <div>
                    <dt className="font-semibold text-[var(--cma-muted)]">过期</dt>
                    <dd className="mt-1 text-[var(--cma-text-strong)]">
                      {formatPatientAdministrationDate(review.session.expiredAt)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {review.session.impactFactorCodes.length > 0 ||
              review.session.impactFactorNote ? (
                <div>
                <p className="text-sm font-semibold text-[var(--cma-muted)]">
                  影响因素
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {review.session.impactFactorCodes.map((code) => (
                    <Badge key={code} tone="warning">
                      {patientAdministrationImpactFactorLabels.find(
                        (candidate) => candidate.code === code,
                      )?.label ?? code}
                    </Badge>
                  ))}
                </div>
                {review.session.impactFactorNote ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--cma-text-strong)]">
                    {review.session.impactFactorNote}
                  </p>
                ) : null}
                </div>
              ) : null}
              {review.reviewEvents.length > 0 ? (
                <div>
                <h4 className="font-semibold text-[var(--cma-text-strong)]">
                  复核相关控制事件
                </h4>
                <ul className="mt-2 grid gap-2 text-sm leading-6 text-[var(--cma-muted)]">
                  {review.reviewEvents.map((event, index) => (
                    <li key={`${event.action}-${event.occurredAt}-${index}`}>
                      {eventLabels[event.action]} ·{' '}
                      {formatPatientAdministrationDate(event.occurredAt)}
                      {event.operatorSnapshot?.operatorName
                        ? ` · ${event.operatorSnapshot.operatorName}`
                        : ''}
                      {event.reason ? ` · ${event.reason}` : ''}
                    </li>
                  ))}
                </ul>
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        {readOnlyReason ? (
          <p
            className="rounded-md border border-[var(--cma-warning)] bg-[var(--cma-warning-soft)] p-4 text-sm leading-6 text-[var(--cma-warning)]"
            role="status"
          >
            {readOnlyReason} 复核摘要和原始证据仍可读取，但辅助转写与证据采用已禁用。
          </p>
        ) : null}

            <section aria-labelledby="patient-administration-review-items-heading">
              <h3
                className="text-xl font-semibold text-[var(--cma-text-strong)]"
                id="patient-administration-review-items-heading"
              >
                当前分组逐题工作区
              </h3>
              <div className="mt-4 grid gap-4">
                {orderedItems.map((item) => {
                  const itemIssues =
                    issueRouting?.inlineByItemResponseId.get(
                      item.itemResponseId,
                    );
                  const hasInlineIssues = Boolean(
                    itemIssues &&
                      (itemIssues.blockingIssues.length > 0 ||
                        itemIssues.warnings.length > 0),
                  );
                  const structuredManualFields = getStructuredManualFields(
                    item.formalItem.config,
                  );
                  const referenceRouting = routePatientReviewReferences(
                    structuredManualFields,
                    item.steps,
                  );
                  const sharedReference = renderStepReferenceGroup(
                    item.itemResponseId,
                    referenceRouting.sharedSteps,
                  );
                  const reviewReferences: PatientAdministrationReviewReferenceSlots =
                    structuredManualFields
                      ? {
                          structuredSharedReference: sharedReference,
                          structuredFieldReferencesByCode: Object.fromEntries(
                            Object.entries(
                              referenceRouting.fieldSpecificStepsByCode,
                            ).map(([fieldCode, steps]) => [
                              fieldCode,
                              renderStepReferenceGroup(
                                item.itemResponseId,
                                steps,
                              ),
                            ]),
                          ),
                        }
                      : { itemSharedReference: sharedReference };

                  return (
                  <article
                    aria-label={`第 ${item.formalItem.itemOrder} 题复核与正式作答`}
                    className="grid scroll-mt-4 gap-4 rounded-md border border-[var(--cma-line-strong)] p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--cma-ring)]"
                    data-testid={`patient-administration-review-item-${item.itemCode}`}
                    id={`submission-item-${item.itemResponseId}`}
                    key={item.itemResponseId}
                    tabIndex={-1}
                  >
                    <header className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--cma-primary)]">
                          第 {item.formalItem.itemOrder} 题
                        </p>
                        <h4 className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                          {item.itemTitle || '未命名项目'}
                        </h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={item.status === 'answered' ? 'success' : 'warning'}>
                          {itemStatusLabels[item.status]}
                        </Badge>
                      </div>
                    </header>
                    {hasInlineIssues && itemIssues ? (
                      <section
                        aria-label="本题提交检查问题"
                        className="grid gap-2 border-l-2 border-[var(--cma-line-strong)] pl-3"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <h5 className="font-semibold text-[var(--cma-text-strong)]">
                            本题待处理
                          </h5>
                          <p
                            className={
                              readinessStale
                                ? 'text-sm font-semibold text-[var(--cma-warning)]'
                                : 'text-sm text-[var(--cma-muted)]'
                            }
                          >
                            {getInlineSubmissionIssueSnapshotLabel(
                              readinessStale,
                            )}
                          </p>
                        </div>
                        {itemIssues.blockingIssues.length > 0 ? (
                          <div className="grid gap-1">
                            <h6 className="text-sm font-semibold text-[var(--cma-danger)]">
                              阻断
                            </h6>
                            <ScaleSubmissionIssueList
                              compact
                              inlineActionable
                              issues={itemIssues.blockingIssues}
                              onLocateIssue={() => undefined}
                              severity="blocking"
                              showLocateActions={false}
                              suppressItemIdentity
                            />
                          </div>
                        ) : null}
                        {itemIssues.warnings.length > 0 ? (
                          <div className="grid gap-1">
                            <h6 className="text-sm font-semibold text-[var(--cma-warning)]">
                              提醒
                            </h6>
                            <ScaleSubmissionIssueList
                              compact
                              issues={itemIssues.warnings}
                              onLocateIssue={() => undefined}
                              severity="warning"
                              showLocateActions={false}
                              suppressItemIdentity
                            />
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                    {!item.hasReviewFacts ? (
                      <p
                        className={
                          loadError || (review && !isLoading)
                            ? 'rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-sm leading-6 text-[var(--cma-danger)]'
                            : 'rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4 text-sm leading-6 text-[var(--cma-muted)]'
                        }
                        role={loadError || (review && !isLoading) ? 'alert' : 'status'}
                      >
                        {isLoading
                          ? '患者施测事实正在加载；下方正式作答仍可编辑。'
                          : isEmpty
                            ? '尚无可用患者施测事实；下方正式作答仍可编辑。'
                            : loadError
                              ? '患者施测事实暂不可用；下方正式作答仍可编辑。'
                              : '该正式题目未能匹配患者施测事实；请刷新复核摘要，正式作答仍可编辑。'}
                      </p>
                    ) : null}
                    {renderFormalEditor(item.formalItem, reviewReferences)}
                  </article>
                  );
                })}
              </div>
            </section>
      </CardContent>
    </Card>
  );
}
