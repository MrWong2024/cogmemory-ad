'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/src/components/ui/Button';
import { HandwritingEvidenceCanvas } from '@/src/features/assessments/components/HandwritingEvidenceCanvas';
import { MediaEvidenceList } from '@/src/features/assessments/components/MediaEvidenceList';
import { PhotoEvidenceCapture } from '@/src/features/assessments/components/PhotoEvidenceCapture';
import {
  getMediaEvidenceAccessUrl,
  listItemMediaEvidences,
  MediaEvidenceApiError,
  uploadItemMediaEvidence,
  voidItemMediaEvidence,
} from '@/src/features/assessments/api/media-evidence-api';
import {
  buildMediaEvidenceAccessCacheKey,
  getMediaEvidenceErrorMessage,
  isAccessUrlReusable,
  isMediaEvidenceActive,
  sortMediaEvidences,
} from '@/src/features/assessments/lib/media-evidence-display';
import type { ItemMediaDrafts } from '@/src/features/assessments/types/media-evidence-draft';
import type {
  EvidenceRequirementState,
  MediaEvidence,
  MediaEvidenceAccessAsset,
  MediaEvidenceAccessUrlResponse,
  SupportedMediaEvidenceType,
  UploadMediaEvidenceInput,
} from '@/src/features/assessments/types/media-evidence';
import type {
  ItemEvidenceRequirement,
  ItemResponseExecution,
} from '@/src/features/assessments/types/item-response-execution';

type MediaFeedback = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

function isSupportedRequirement(
  requirement: ItemEvidenceRequirement,
): requirement is ItemEvidenceRequirement & {
  evidenceType: SupportedMediaEvidenceType;
} {
  return (
    requirement.evidenceType === 'photo' ||
    requirement.evidenceType === 'handwriting'
  );
}

function mergeEvidence(
  items: MediaEvidence[] | null,
  evidence: MediaEvidence,
): MediaEvidence[] {
  return sortMediaEvidences([
    ...(items ?? []).filter((item) => item.id !== evidence.id),
    evidence,
  ]);
}

export function MediaEvidencePanel({
  drafts,
  item,
  onDraftChange,
  onEndWrite,
  onRequirementChange,
  onTryBeginWrite,
  pageReadOnlyReason,
  patientId,
  scaleInstanceId,
  visitId,
  writingTypes,
}: {
  drafts: ItemMediaDrafts;
  item: ItemResponseExecution;
  onDraftChange: (
    evidenceType: SupportedMediaEvidenceType,
    draft: ItemMediaDrafts[SupportedMediaEvidenceType] | null,
  ) => void;
  onEndWrite: (evidenceType: SupportedMediaEvidenceType) => void;
  onRequirementChange: (requirement: EvidenceRequirementState) => void;
  onTryBeginWrite: (evidenceType: SupportedMediaEvidenceType) => boolean;
  pageReadOnlyReason: string | null;
  patientId: string;
  scaleInstanceId: string;
  visitId: string;
  writingTypes: ReadonlySet<SupportedMediaEvidenceType>;
}) {
  const router = useRouter();
  const mountedRef = useRef(true);
  const onRequirementChangeRef = useRef(onRequirementChange);
  const accessControllersRef = useRef(new Map<string, AbortController>());
  const supportedRequirements = useMemo(
    () => item.evidenceRequirements.filter(isSupportedRequirement),
    [item.evidenceRequirements],
  );
  const [items, setItems] = useState<MediaEvidence[] | null>(null);
  const [listError, setListError] = useState<MediaEvidenceApiError | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [listRetryKey, setListRetryKey] = useState(0);
  const [feedbacks, setFeedbacks] = useState<
    Partial<Record<SupportedMediaEvidenceType, MediaFeedback>>
  >({});
  const [accesses, setAccesses] = useState<
    Record<string, MediaEvidenceAccessUrlResponse | undefined>
  >({});
  const [accessErrors, setAccessErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [loadingAccessKeys, setLoadingAccessKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());

  useEffect(() => {
    onRequirementChangeRef.current = onRequirementChange;
  }, [onRequirementChange]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      accessControllersRef.current.forEach((controller) => controller.abort());
      accessControllersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (supportedRequirements.length === 0) {
      setItems(null);
      setListError(null);
      setIsListLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsListLoading(true);
    setListError(null);

    void listItemMediaEvidences(
      patientId,
      visitId,
      scaleInstanceId,
      item.id,
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        const nextItems = sortMediaEvidences(response.items);
        setItems(nextItems);

        supportedRequirements.forEach((requirement) => {
          const hasActiveEvidence = nextItems.some(
            (evidence) =>
              evidence.evidenceType === requirement.evidenceType &&
              isMediaEvidenceActive(evidence),
          );

          if (hasActiveEvidence && !requirement.attached) {
            onRequirementChangeRef.current({
              evidenceType: requirement.evidenceType,
              status: 'attached',
              attached: true,
            });
          }
        });
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const error =
          requestError instanceof MediaEvidenceApiError
            ? requestError
            : new MediaEvidenceApiError('unknown');

        if (error.kind === 'unauthenticated') {
          router.replace('/login');
          return;
        }

        setItems(null);
        setListError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsListLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    item.id,
    listRetryKey,
    patientId,
    router,
    scaleInstanceId,
    supportedRequirements,
    visitId,
  ]);

  function setTypeFeedback(
    evidenceType: SupportedMediaEvidenceType,
    feedback: MediaFeedback | undefined,
  ) {
    if (mountedRef.current) {
      setFeedbacks((current) => ({ ...current, [evidenceType]: feedback }));
    }
  }

  async function handleUpload(
    evidenceType: SupportedMediaEvidenceType,
    input: UploadMediaEvidenceInput,
  ) {
    if (writingTypes.has(evidenceType) || !onTryBeginWrite(evidenceType)) {
      return;
    }

    setTypeFeedback(evidenceType, undefined);

    try {
      const response = await uploadItemMediaEvidence(
        patientId,
        visitId,
        scaleInstanceId,
        item.id,
        input,
      );

      onRequirementChange(response.evidenceRequirement);
      onDraftChange(evidenceType, null);

      if (mountedRef.current) {
        setItems((current) => mergeEvidence(current, response.mediaEvidence));
        setTypeFeedback(evidenceType, {
          kind: 'success',
          message:
            evidenceType === 'photo'
              ? '图片证据已上传。'
              : '手写证据已上传。',
        });
      }
    } catch (requestError: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const error =
        requestError instanceof MediaEvidenceApiError
          ? requestError
          : new MediaEvidenceApiError('unknown');

      if (error.kind === 'unauthenticated') {
        router.replace('/login');
        return;
      }

      setTypeFeedback(evidenceType, {
        kind: 'error',
        message: getMediaEvidenceErrorMessage(error.kind),
      });

      if (error.kind === 'media_evidence_already_attached') {
        onRequirementChange({
          evidenceType,
          status: 'attached',
          attached: true,
        });
        setListRetryKey((value) => value + 1);
      }
    } finally {
      onEndWrite(evidenceType);
    }
  }

  function clearEvidenceAccess(mediaEvidenceId: string) {
    if (!mountedRef.current) {
      return;
    }

    setAccesses((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !key.startsWith(`${mediaEvidenceId}:`),
        ),
      ),
    );
    setAccessErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !key.startsWith(`${mediaEvidenceId}:`),
        ),
      ),
    );
  }

  async function handleVoid(evidence: MediaEvidence, reason: string) {
    if (
      (evidence.evidenceType !== 'photo' &&
        evidence.evidenceType !== 'handwriting') ||
      writingTypes.has(evidence.evidenceType) ||
      !onTryBeginWrite(evidence.evidenceType)
    ) {
      return;
    }

    const evidenceType = evidence.evidenceType;
    setTypeFeedback(evidenceType, undefined);

    try {
      const response = await voidItemMediaEvidence(
        patientId,
        visitId,
        scaleInstanceId,
        item.id,
        evidence.id,
        reason,
      );

      onRequirementChange(response.evidenceRequirement);

      if (mountedRef.current) {
        setItems((current) => mergeEvidence(current, response.mediaEvidence));
        clearEvidenceAccess(evidence.id);
        setTypeFeedback(evidenceType, {
          kind: 'success',
          message:
            '媒体证据已作废，历史记录仍保留，现在可以重新上传。',
        });
      }
    } catch (requestError: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const error =
        requestError instanceof MediaEvidenceApiError
          ? requestError
          : new MediaEvidenceApiError('unknown');

      if (error.kind === 'unauthenticated') {
        router.replace('/login');
        return;
      }

      setTypeFeedback(evidenceType, {
        kind: 'error',
        message: getMediaEvidenceErrorMessage(error.kind),
      });

      if (
        error.kind === 'media_evidence_not_voidable' ||
        error.kind === 'media_evidence_not_found'
      ) {
        setListRetryKey((value) => value + 1);
      }
    } finally {
      onEndWrite(evidenceType);
    }
  }

  function requestAccess(
    evidence: MediaEvidence,
    asset: MediaEvidenceAccessAsset,
  ) {
    const key = buildMediaEvidenceAccessCacheKey(evidence.id, asset);

    if (isAccessUrlReusable(accesses[key])) {
      return;
    }

    accessControllersRef.current.get(key)?.abort();
    const controller = new AbortController();
    accessControllersRef.current.set(key, controller);
    setAccessErrors((current) => ({ ...current, [key]: undefined }));
    setLoadingAccessKeys((current) => new Set([...current, key]));

    void getMediaEvidenceAccessUrl(
      patientId,
      visitId,
      scaleInstanceId,
      item.id,
      evidence.id,
      asset,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!controller.signal.aborted && mountedRef.current) {
          setAccesses((current) => ({ ...current, [key]: response }));
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted || !mountedRef.current) {
          return;
        }

        const error =
          requestError instanceof MediaEvidenceApiError
            ? requestError
            : new MediaEvidenceApiError('unknown');

        if (error.kind === 'unauthenticated') {
          router.replace('/login');
          return;
        }

        setAccessErrors((current) => ({
          ...current,
          [key]: getMediaEvidenceErrorMessage(error.kind),
        }));
      })
      .finally(() => {
        accessControllersRef.current.delete(key);

        if (!controller.signal.aborted && mountedRef.current) {
          setLoadingAccessKeys((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }
      });
  }

  if (supportedRequirements.length === 0) {
    return null;
  }

  const itemReadOnlyReason =
    item.status === 'scored'
      ? '本题已进入计分状态，媒体证据仅供查看。'
      : item.status === 'locked'
        ? '本题已锁定，媒体证据仅供查看。'
        : item.status === 'voided'
          ? '本题已作废，媒体证据仅供查看。'
          : null;
  const readOnlyReason = pageReadOnlyReason ?? itemReadOnlyReason;

  return (
    <div className="mt-4 grid gap-4 border-t border-[var(--cma-line)] pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="text-lg font-semibold text-[var(--cma-text-strong)]">
            当前媒体证据
          </h5>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            列表按题目按需加载；上传、预览和作废不会保存或改变文字作答草稿。
          </p>
        </div>
        <Button
          disabled={isListLoading}
          onClick={() => setListRetryKey((value) => value + 1)}
          size="sm"
          variant="secondary"
        >
          {isListLoading ? '正在加载证据...' : '重新加载证据列表'}
        </Button>
      </div>

      {isListLoading && !items ? (
        <p aria-live="polite" role="status" className="text-[var(--cma-info)]">
          正在加载当前题目的媒体证据历史...
        </p>
      ) : null}

      {listError ? (
        <div
          className="grid gap-3 rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
          role="alert"
        >
          <p>{getMediaEvidenceErrorMessage(listError.kind)}</p>
          {listError.kind !== 'forbidden' ? (
            <Button
              onClick={() => setListRetryKey((value) => value + 1)}
              size="sm"
              variant="secondary"
            >
              重试加载证据
            </Button>
          ) : null}
        </div>
      ) : null}

      {items ? (
        <MediaEvidenceList
          accessErrors={accessErrors}
          accesses={accesses}
          items={items}
          loadingAccessKeys={loadingAccessKeys}
          onRequestAccess={requestAccess}
          onVoid={(evidence, reason) => void handleVoid(evidence, reason)}
          readOnlyReason={readOnlyReason}
          writingTypes={writingTypes}
        />
      ) : null}

      {supportedRequirements.map((requirement) => {
        const activeEvidence = items?.some(
          (evidence) =>
            evidence.evidenceType === requirement.evidenceType &&
            isMediaEvidenceActive(evidence),
        );
        const hasCurrentEvidence =
          requirement.attached || activeEvidence === true;
        const disabledReason = readOnlyReason
          ? readOnlyReason
          : isListLoading
            ? '证据列表加载完成前暂不开放上传。'
            : listError
              ? '请先成功加载证据列表，再进行上传。'
              : hasCurrentEvidence
                ? '已有当前有效证据；如需重传，请先作废 attached 证据。'
                : null;
        const captureDisabled = Boolean(disabledReason);
        const feedback = feedbacks[requirement.evidenceType];

        return (
          <div className="grid gap-3" key={requirement.evidenceType}>
            {feedback ? (
              <p
                aria-live={feedback.kind === 'success' ? 'polite' : undefined}
                className={
                  feedback.kind === 'success'
                    ? 'rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-3 text-sm text-[var(--cma-success)]'
                    : feedback.kind === 'info'
                      ? 'rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-sm text-[var(--cma-info)]'
                      : 'rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-sm text-[var(--cma-danger)]'
                }
                role={feedback.kind === 'error' ? 'alert' : 'status'}
              >
                {feedback.message}
              </p>
            ) : null}

            {requirement.evidenceType === 'photo' ? (
              <PhotoEvidenceCapture
                disabled={captureDisabled}
                disabledReason={disabledReason}
                draft={drafts.photo?.kind === 'photo' ? drafts.photo : undefined}
                inputIdPrefix={`${item.id}-photo-evidence`}
                isUploading={writingTypes.has('photo')}
                onDraftChange={(draft) => onDraftChange('photo', draft)}
                onUpload={(input) => handleUpload('photo', input)}
              />
            ) : (
              <HandwritingEvidenceCanvas
                disabled={captureDisabled}
                disabledReason={disabledReason}
                draft={
                  drafts.handwriting?.kind === 'handwriting'
                    ? drafts.handwriting
                    : undefined
                }
                inputIdPrefix={`${item.id}-handwriting-evidence`}
                isUploading={writingTypes.has('handwriting')}
                onDraftChange={(draft) => onDraftChange('handwriting', draft)}
                onUpload={(input) => handleUpload('handwriting', input)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
