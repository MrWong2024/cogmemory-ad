'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/src/components/ui/Button';
import {
  formatMediaFileSize,
  mediaCaptureModeLabels,
} from '@/src/features/assessments/lib/media-evidence-display';
import { processPhotoEvidenceFile } from '@/src/features/assessments/lib/media-evidence-image';
import type { PhotoEvidenceDraft } from '@/src/features/assessments/types/media-evidence-draft';
import type { UploadMediaEvidenceInput } from '@/src/features/assessments/types/media-evidence';

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

const fileLabelClassName =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--cma-ring)] has-[:disabled]:pointer-events-none has-[:disabled]:opacity-55';

export function PhotoEvidenceCapture({
  disabled,
  disabledReason,
  draft,
  inputIdPrefix,
  isUploading,
  onDraftChange,
  onUpload,
}: {
  disabled: boolean;
  disabledReason: string | null;
  draft: PhotoEvidenceDraft | undefined;
  inputIdPrefix: string;
  isUploading: boolean;
  onDraftChange: (draft: PhotoEvidenceDraft | null) => void;
  onUpload: (input: UploadMediaEvidenceInput) => Promise<void>;
}) {
  const mountedRef = useRef(true);
  const processingVersionRef = useRef(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const draftBlob = draft?.blob;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      processingVersionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!draftBlob) {
      setPreviewUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(draftBlob);
    setPreviewUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [draftBlob]);

  const controlsDisabled = disabled || isProcessing || isUploading;

  async function handleFile(
    file: File,
    captureMode: PhotoEvidenceDraft['captureMode'],
  ) {
    const processingVersion = processingVersionRef.current + 1;
    processingVersionRef.current = processingVersion;
    onDraftChange(null);
    setProcessingError(null);
    setIsProcessing(true);

    try {
      const processed = await processPhotoEvidenceFile(file);

      if (
        !mountedRef.current ||
        processingVersionRef.current !== processingVersion
      ) {
        return;
      }

      onDraftChange({
        kind: 'photo',
        ...processed,
        captureMode,
        capturedAt: new Date().toISOString(),
        pageNo: 1,
        isColor: true,
        description: '',
        captureNote: '',
        operatorNote: '',
      });
    } catch (error: unknown) {
      if (
        mountedRef.current &&
        processingVersionRef.current === processingVersion
      ) {
        setProcessingError(
          error instanceof Error
            ? error.message
            : '图片处理失败，请重新选择。',
        );
      }
    } finally {
      if (
        mountedRef.current &&
        processingVersionRef.current === processingVersion
      ) {
        setIsProcessing(false);
      }
    }
  }

  function handleInputChange(
    event: React.ChangeEvent<HTMLInputElement>,
    captureMode: PhotoEvidenceDraft['captureMode'],
  ) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (file) {
      void handleFile(file, captureMode);
    }
  }

  function updateDraft(update: Partial<PhotoEvidenceDraft>) {
    if (draft) {
      onDraftChange({ ...draft, ...update });
    }
  }

  function handleUpload() {
    if (!draft) {
      return;
    }

    void onUpload({
      evidenceType: 'photo',
      captureMode: draft.captureMode,
      file: draft.blob,
      capturedAt: draft.capturedAt,
      sourceApp: 'CogMemory AD Web',
      captureNote: draft.captureNote,
      description: draft.description,
      operatorNote: draft.operatorNote,
      imageWidth: draft.width,
      imageHeight: draft.height,
      orientation: draft.orientation,
      ...(draft.captureMode === 'paper_scan'
        ? { pageNo: draft.pageNo }
        : {}),
      isColor: draft.isColor,
    });
  }

  return (
    <section className="grid gap-4 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
      <div>
        <h5 className="text-lg font-semibold text-[var(--cma-text-strong)]">
          图片证据采集
        </h5>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          所选源图只在本次浏览器处理调用中短暂使用；上传前统一在白色 Canvas 上重新编码为 JPEG。
        </p>
      </div>

      {disabledReason ? (
        <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--cma-warning)]">
          {disabledReason}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <label className={fileLabelClassName}>
          选择已有图片
          <input
            accept="image/*"
            className="sr-only"
            disabled={controlsDisabled}
            id={`${inputIdPrefix}-photo-upload`}
            onChange={(event) => handleInputChange(event, 'photo_upload')}
            type="file"
          />
        </label>
        <label className={fileLabelClassName}>
          拍摄 / 扫描纸笔结果
          <input
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={controlsDisabled}
            id={`${inputIdPrefix}-paper-scan`}
            onChange={(event) => handleInputChange(event, 'paper_scan')}
            type="file"
          />
        </label>
      </div>

      <p className="text-sm leading-6 text-[var(--cma-muted)]">
        移动端可通过后置摄像头提示拍摄；不支持 capture 的浏览器会退化为普通文件选择。本页不启用实时摄像头。
      </p>

      {isProcessing ? (
        <p aria-live="polite" role="status" className="text-[var(--cma-info)]">
          正在解码、移除原始元数据并生成受控 JPEG...
        </p>
      ) : null}

      {processingError ? (
        <p
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-3 py-2 text-sm leading-6 text-[var(--cma-danger)]"
          role="alert"
        >
          {processingError}
        </p>
      ) : null}

      {draft ? (
        <div className="grid gap-4">
          <div className="grid gap-4 rounded-md bg-[var(--cma-surface-muted)] p-4 lg:grid-cols-[minmax(0,320px)_1fr]">
            {previewUrl ? (
              // The signed-domain configuration is intentionally unchanged; this is a local object URL.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="待上传图片证据预览"
                className="max-h-72 w-full rounded-md border border-[var(--cma-line)] bg-white object-contain"
                src={previewUrl}
              />
            ) : null}
            <dl className="grid content-start gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  采集方式
                </dt>
                <dd>{mediaCaptureModeLabels[draft.captureMode]}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  处理后类型
                </dt>
                <dd>image/jpeg</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  处理后尺寸
                </dt>
                <dd>
                  {draft.width} × {draft.height}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  处理后大小
                </dt>
                <dd>{formatMediaFileSize(draft.sizeBytes)}</dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {draft.captureMode === 'paper_scan' ? (
              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor={`${inputIdPrefix}-page-no`}
                >
                  页码
                </label>
                <input
                  className={inputClassName}
                  disabled={controlsDisabled}
                  id={`${inputIdPrefix}-page-no`}
                  max="1000"
                  min="1"
                  onChange={(event) =>
                    updateDraft({
                      pageNo: Math.min(
                        1000,
                        Math.max(1, Number(event.target.value) || 1),
                      ),
                    })
                  }
                  type="number"
                  value={draft.pageNo}
                />
              </div>
            ) : null}
            <div className="flex items-center gap-3 self-end pb-2">
              <input
                checked={draft.isColor}
                className="h-5 w-5 accent-[var(--cma-primary)]"
                disabled={controlsDisabled}
                id={`${inputIdPrefix}-is-color`}
                onChange={(event) =>
                  updateDraft({ isColor: event.target.checked })
                }
                type="checkbox"
              />
              <label htmlFor={`${inputIdPrefix}-is-color`}>彩色图片</label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <label htmlFor={`${inputIdPrefix}-capture-note`}>采集说明</label>
              <textarea
                className={`${inputClassName} min-h-24 resize-y`}
                disabled={controlsDisabled}
                id={`${inputIdPrefix}-capture-note`}
                maxLength={1000}
                onChange={(event) =>
                  updateDraft({ captureNote: event.target.value })
                }
                value={draft.captureNote}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor={`${inputIdPrefix}-description`}>证据描述</label>
              <textarea
                className={`${inputClassName} min-h-24 resize-y`}
                disabled={controlsDisabled}
                id={`${inputIdPrefix}-description`}
                maxLength={2000}
                onChange={(event) =>
                  updateDraft({ description: event.target.value })
                }
                value={draft.description}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor={`${inputIdPrefix}-operator-note`}>
                媒体操作者备注
              </label>
              <textarea
                className={`${inputClassName} min-h-24 resize-y`}
                disabled={controlsDisabled}
                id={`${inputIdPrefix}-operator-note`}
                maxLength={4000}
                onChange={(event) =>
                  updateDraft({ operatorNote: event.target.value })
                }
                value={draft.operatorNote}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button disabled={controlsDisabled} onClick={handleUpload}>
              {isUploading ? '正在上传图片证据...' : '上传图片证据'}
            </Button>
            <Button
              disabled={isProcessing || isUploading}
              onClick={() => onDraftChange(null)}
              variant="secondary"
            >
              清除待上传图片
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
