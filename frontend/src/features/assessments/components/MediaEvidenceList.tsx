'use client';

import { useEffect, useState } from 'react';

import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { MediaEvidencePreview } from '@/src/features/assessments/components/MediaEvidencePreview';
import { formatDuration } from '@/src/features/assessments/lib/assessment-execution-display';
import {
  buildMediaEvidenceAccessCacheKey,
  formatMediaFileSize,
  handwritingInputToolLabels,
  handwritingTrajectoryFormatLabels,
  mediaCaptureModeLabels,
  mediaEvidenceStatusLabels,
  mediaEvidenceTypeLabels,
  mediaOperatorRoleLabels,
  mediaQualityStatusLabels,
  mediaStorageStatusLabels,
} from '@/src/features/assessments/lib/media-evidence-display';
import type {
  MediaEvidence,
  MediaEvidenceAccessAsset,
  MediaEvidenceAccessUrlResponse,
  MediaEvidenceStatus,
  SupportedMediaEvidenceType,
} from '@/src/features/assessments/types/media-evidence';
import { formatDateTime } from '@/src/features/patients/lib/patient-display';

const statusTones: Record<MediaEvidenceStatus, BadgeTone> = {
  pending: 'neutral',
  attached: 'success',
  locked: 'warning',
  voided: 'warning',
  deleted: 'warning',
};

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

function displayDimension(width: number | null, height: number | null): string {
  return width !== null && height !== null ? `${width} × ${height}` : '—';
}

function isSupportedType(
  evidence: MediaEvidence,
): evidence is MediaEvidence & {
  evidenceType: SupportedMediaEvidenceType;
} {
  return (
    evidence.evidenceType === 'photo' ||
    evidence.evidenceType === 'handwriting'
  );
}

export function MediaEvidenceList({
  accessErrors,
  accesses,
  items,
  loadingAccessKeys,
  onRequestAccess,
  onVoid,
  readOnlyReason,
  writingTypes,
}: {
  accessErrors: Record<string, string | undefined>;
  accesses: Record<string, MediaEvidenceAccessUrlResponse | undefined>;
  items: MediaEvidence[];
  loadingAccessKeys: ReadonlySet<string>;
  onRequestAccess: (
    evidence: MediaEvidence,
    asset: MediaEvidenceAccessAsset,
  ) => void;
  onVoid: (evidence: MediaEvidence, reason: string) => void;
  readOnlyReason: string | null;
  writingTypes: ReadonlySet<SupportedMediaEvidenceType>;
}) {
  const [confirmingEvidenceId, setConfirmingEvidenceId] = useState<
    string | null
  >(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidValidationError, setVoidValidationError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (
      confirmingEvidenceId &&
      !items.some(
        (evidence) =>
          evidence.id === confirmingEvidenceId &&
          evidence.status === 'attached',
      )
    ) {
      setConfirmingEvidenceId(null);
      setVoidReason('');
      setVoidValidationError(null);
    }
  }, [confirmingEvidenceId, items]);

  function submitVoid(evidence: MediaEvidence) {
    const normalizedReason = voidReason.trim();

    if (normalizedReason.length < 3 || normalizedReason.length > 1000) {
      setVoidValidationError('作废原因必须为 3–1000 个字符。');
      return;
    }

    setVoidValidationError(null);
    onVoid(evidence, normalizedReason);
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md bg-[var(--cma-surface-muted)] px-4 py-5 text-center text-base text-[var(--cma-muted)]">
        当前题目尚无媒体证据历史记录。
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {items.map((evidence) => {
        const primaryKey = buildMediaEvidenceAccessCacheKey(
          evidence.id,
          'primary',
        );
        const trajectoryKey = buildMediaEvidenceAccessCacheKey(
          evidence.id,
          'trajectory',
        );
        const loadingAssets = new Set<MediaEvidenceAccessAsset>();

        if (loadingAccessKeys.has(primaryKey)) {
          loadingAssets.add('primary');
        }

        if (loadingAccessKeys.has(trajectoryKey)) {
          loadingAssets.add('trajectory');
        }

        const isWriting =
          isSupportedType(evidence) && writingTypes.has(evidence.evidenceType);
        const canVoid =
          evidence.status === 'attached' &&
          isSupportedType(evidence) &&
          !readOnlyReason;
        const isConfirming = confirmingEvidenceId === evidence.id;

        return (
          <article
            className="grid gap-4 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4"
            key={evidence.id}
          >
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h6 className="font-semibold text-[var(--cma-text-strong)]">
                  {mediaEvidenceTypeLabels[evidence.evidenceType]} ·{' '}
                  {evidence.evidenceCode}
                </h6>
                <p className="mt-1 text-sm text-[var(--cma-muted)]">
                  {mediaCaptureModeLabels[evidence.captureMode]}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={statusTones[evidence.status]}>
                  {mediaEvidenceStatusLabels[evidence.status]}
                </Badge>
                <Badge>{mediaStorageStatusLabels[evidence.storageStatus]}</Badge>
              </div>
            </header>

            <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  文件类型
                </dt>
                <dd className="mt-1 break-words">
                  {evidence.file?.mimeType || '—'}
                  {evidence.file?.fileExtension
                    ? `（.${evidence.file.fileExtension}）`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  文件大小
                </dt>
                <dd className="mt-1">
                  {formatMediaFileSize(evidence.file?.sizeBytes ?? null)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  图片尺寸
                </dt>
                <dd className="mt-1">
                  {displayDimension(
                    evidence.imageMetadata?.width ?? null,
                    evidence.imageMetadata?.height ?? null,
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  页码 / 色彩
                </dt>
                <dd className="mt-1">
                  {evidence.imageMetadata?.pageNo ?? '—'} /{' '}
                  {evidence.imageMetadata?.isColor === null ||
                  evidence.imageMetadata?.isColor === undefined
                    ? '—'
                    : evidence.imageMetadata.isColor
                      ? '彩色'
                      : '非彩色'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  捕获时间
                </dt>
                <dd className="mt-1">
                  {formatDateTime(
                    evidence.captureContext?.capturedAt ??
                      evidence.imageMetadata?.capturedAt ??
                      null,
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  上传 / 存储时间
                </dt>
                <dd className="mt-1">
                  {formatDateTime(
                    evidence.captureContext?.uploadedAt ??
                      evidence.file?.storedAt ??
                      null,
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  操作者
                </dt>
                <dd className="mt-1">
                  {evidence.operatorSnapshot?.operatorName || '未记录'}
                  {evidence.operatorSnapshot?.operatorRole
                    ? `（${mediaOperatorRoleLabels[evidence.operatorSnapshot.operatorRole]}）`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  质量状态
                </dt>
                <dd className="mt-1">
                  {mediaQualityStatusLabels[evidence.qualityStatus]}
                </dd>
              </div>
            </dl>

            {evidence.handwritingTrace ? (
              <dl className="grid gap-x-5 gap-y-3 rounded-md bg-[var(--cma-surface-muted)] p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    手写轨迹
                  </dt>
                  <dd className="mt-1">
                    {evidence.handwritingTrace.hasTrajectory
                      ? handwritingTrajectoryFormatLabels[
                          evidence.handwritingTrace.trajectoryFormat
                        ]
                      : '未附轨迹'}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    笔数 / 时长
                  </dt>
                  <dd className="mt-1">
                    {evidence.handwritingTrace.strokeCount ?? '—'} /{' '}
                    {formatDuration(evidence.handwritingTrace.durationMs)}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    逻辑画布
                  </dt>
                  <dd className="mt-1">
                    {displayDimension(
                      evidence.handwritingTrace.canvasWidth,
                      evidence.handwritingTrace.canvasHeight,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--cma-muted)]">
                    输入工具 / 设备
                  </dt>
                  <dd className="mt-1">
                    {handwritingInputToolLabels[
                      evidence.handwritingTrace.inputTool
                    ]}
                    {evidence.handwritingTrace.deviceType
                      ? ` / ${evidence.handwritingTrace.deviceType}`
                      : ''}
                  </dd>
                </div>
              </dl>
            ) : null}

            <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  采集说明
                </dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {evidence.captureContext?.captureNote || '—'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  证据描述
                </dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {evidence.description || '—'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  媒体操作者备注
                </dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {evidence.operatorNote || '—'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  创建时间
                </dt>
                <dd className="mt-1">{formatDateTime(evidence.createdAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  锁定时间
                </dt>
                <dd className="mt-1">{formatDateTime(evidence.lockedAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--cma-muted)]">
                  作废时间
                </dt>
                <dd className="mt-1">{formatDateTime(evidence.voidedAt)}</dd>
              </div>
            </dl>

            <MediaEvidencePreview
              accessErrors={{
                primary: accessErrors[primaryKey],
                trajectory: accessErrors[trajectoryKey],
              }}
              evidence={evidence}
              loadingAssets={loadingAssets}
              onRequestAccess={(asset) => onRequestAccess(evidence, asset)}
              primaryAccess={accesses[primaryKey]}
              trajectoryAccess={accesses[trajectoryKey]}
            />

            {canVoid ? (
              <div className="border-t border-[var(--cma-line)] pt-4">
                {!isConfirming ? (
                  <Button
                    disabled={isWriting}
                    onClick={() => {
                      setConfirmingEvidenceId(evidence.id);
                      setVoidReason('');
                      setVoidValidationError(null);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    作废此证据
                  </Button>
                ) : (
                  <div className="grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4">
                    <p className="text-sm leading-6 text-[var(--cma-warning)]">
                      作废不会物理删除文件或历史记录。作废后可重新上传同类型证据。
                    </p>
                    <label
                      className="font-semibold text-[var(--cma-text-strong)]"
                      htmlFor={`void-reason-${evidence.id}`}
                    >
                      作废原因（必填，3–1000 字符）
                    </label>
                    <textarea
                      className={`${inputClassName} min-h-24 resize-y`}
                      disabled={isWriting}
                      id={`void-reason-${evidence.id}`}
                      maxLength={1000}
                      onChange={(event) => setVoidReason(event.target.value)}
                      value={voidReason}
                    />
                    {voidValidationError ? (
                      <p className="text-sm text-[var(--cma-danger)]" role="alert">
                        {voidValidationError}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <Button
                        disabled={isWriting}
                        onClick={() => submitVoid(evidence)}
                        size="sm"
                      >
                        {isWriting ? '正在作废证据...' : '确认作废证据'}
                      </Button>
                      <Button
                        disabled={isWriting}
                        onClick={() => {
                          setConfirmingEvidenceId(null);
                          setVoidReason('');
                          setVoidValidationError(null);
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
