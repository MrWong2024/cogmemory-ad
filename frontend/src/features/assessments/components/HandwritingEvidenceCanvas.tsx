'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/src/components/ui/Button';
import {
  countHandwritingPoints,
  createHandwritingPngBlob,
  createHandwritingPoint,
  createHandwritingTrajectoryBlob,
  drawHandwritingCanvas,
  getHandwritingDurationMs,
  getHandwritingInputTool,
  HANDWRITING_CANVAS_HEIGHT,
  HANDWRITING_CANVAS_WIDTH,
  MAX_HANDWRITING_POINTS,
  pointerTypeToInputTool,
} from '@/src/features/assessments/lib/handwriting-evidence';
import { handwritingInputToolLabels } from '@/src/features/assessments/lib/media-evidence-display';
import type { HandwritingEvidenceDraft } from '@/src/features/assessments/types/media-evidence-draft';
import type { UploadMediaEvidenceInput } from '@/src/features/assessments/types/media-evidence';

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)] disabled:text-[var(--cma-muted)]';

function createEmptyDraft(startedAtMs: number): HandwritingEvidenceDraft {
  return {
    kind: 'handwriting',
    strokes: [],
    canvasWidth: HANDWRITING_CANVAS_WIDTH,
    canvasHeight: HANDWRITING_CANVAS_HEIGHT,
    drawingStartedAtMs: startedAtMs,
    description: '',
    captureNote: '',
    operatorNote: '',
    includeTrajectory: true,
  };
}

export function HandwritingEvidenceCanvas({
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
  draft: HandwritingEvidenceDraft | undefined;
  inputIdPrefix: string;
  isUploading: boolean;
  onDraftChange: (draft: HandwritingEvidenceDraft | null) => void;
  onUpload: (input: UploadMediaEvidenceInput) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftRef = useRef<HandwritingEvidenceDraft | undefined>(draft);
  const activePointerIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const draftStrokes = draft?.strokes;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    try {
      drawHandwritingCanvas(canvas, draftStrokes ?? []);
    } catch (error: unknown) {
      setCanvasError(
        error instanceof Error
          ? error.message
          : '手写画布初始化失败，请刷新页面后重试。',
      );
    }
  }, [draftStrokes]);

  const strokes = draft?.strokes ?? [];
  const pointCount = countHandwritingPoints(strokes);
  const inputTool = getHandwritingInputTool(strokes);
  const controlsDisabled = disabled || isUploading || isPreparing;

  function commitDraft(nextDraft: HandwritingEvidenceDraft | null) {
    draftRef.current = nextDraft ?? undefined;
    onDraftChange(nextDraft);
  }

  function pointFromEvent(
    event: React.PointerEvent<HTMLCanvasElement>,
    currentDraft: HandwritingEvidenceDraft,
  ) {
    const now = performance.now();

    return createHandwritingPoint(
      event.clientX,
      event.clientY,
      event.pressure,
      now - currentDraft.drawingStartedAtMs,
      event.currentTarget.getBoundingClientRect(),
      currentDraft.canvasWidth,
      currentDraft.canvasHeight,
    );
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (controlsDisabled || activePointerIdRef.current !== null) {
      return;
    }

    event.preventDefault();
    const currentDraft =
      draftRef.current ?? createEmptyDraft(performance.now());

    if (countHandwritingPoints(currentDraft.strokes) >= MAX_HANDWRITING_POINTS) {
      setCanvasError('手写轨迹已达到 8000 点上限，请简化书写或清空重画。');
      return;
    }

    const point = pointFromEvent(event, currentDraft);

    if (!point) {
      setCanvasError('无法读取当前指针坐标，请重试。');
      return;
    }

    const nextDraft: HandwritingEvidenceDraft = {
      ...currentDraft,
      strokes: [
        ...currentDraft.strokes,
        {
          tool: pointerTypeToInputTool(event.pointerType),
          points: [point],
        },
      ],
    };
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCanvasError(null);
    commitDraft(nextDraft);
  }

  function appendPointerPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const currentDraft = draftRef.current;

    if (!currentDraft) {
      return;
    }

    if (countHandwritingPoints(currentDraft.strokes) >= MAX_HANDWRITING_POINTS) {
      setCanvasError('手写轨迹已达到 8000 点上限，请简化书写或清空重画。');
      activePointerIdRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      return;
    }

    const point = pointFromEvent(event, currentDraft);

    if (!point || currentDraft.strokes.length === 0) {
      return;
    }

    const lastStroke = currentDraft.strokes[currentDraft.strokes.length - 1];
    const lastPoint = lastStroke.points[lastStroke.points.length - 1];

    if (
      lastPoint &&
      lastPoint.x === point.x &&
      lastPoint.y === point.y &&
      lastPoint.t === point.t
    ) {
      return;
    }

    commitDraft({
      ...currentDraft,
      strokes: currentDraft.strokes.map((stroke, index) =>
        index === currentDraft.strokes.length - 1
          ? { ...stroke, points: [...stroke.points, point] }
          : stroke,
      ),
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current === event.pointerId) {
      event.preventDefault();
      appendPointerPoint(event);
    }
  }

  function finishPointer(
    event: React.PointerEvent<HTMLCanvasElement>,
    includeFinalPoint: boolean,
  ) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();

    if (includeFinalPoint) {
      appendPointerPoint(event);
    }

    activePointerIdRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function updateDraft(update: Partial<HandwritingEvidenceDraft>) {
    const currentDraft = draftRef.current;

    if (currentDraft) {
      commitDraft({ ...currentDraft, ...update });
    }
  }

  function handleUndo() {
    const currentDraft = draftRef.current;

    if (!currentDraft || currentDraft.strokes.length === 0) {
      return;
    }

    const nextStrokes = currentDraft.strokes.slice(0, -1);
    commitDraft(
      nextStrokes.length === 0
        ? null
        : { ...currentDraft, strokes: nextStrokes },
    );
    setCanvasError(null);
  }

  async function handleUpload() {
    const currentDraft = draftRef.current;
    const canvas = canvasRef.current;

    if (!currentDraft || !canvas || currentDraft.strokes.length === 0) {
      setCanvasError('请至少完成一笔有效书写后再上传。');
      return;
    }

    setIsPreparing(true);
    setCanvasError(null);

    try {
      const file = await createHandwritingPngBlob(
        canvas,
        currentDraft.strokes,
      );
      const trajectory = currentDraft.includeTrajectory
        ? createHandwritingTrajectoryBlob(currentDraft)
        : undefined;
      const uploadInput: UploadMediaEvidenceInput = {
        evidenceType: 'handwriting',
        captureMode: 'tablet_handwriting',
        file,
        ...(trajectory
          ? { trajectory, trajectoryFormat: 'strokes' as const }
          : {}),
        capturedAt: new Date().toISOString(),
        sourceApp: 'CogMemory AD Web',
        captureNote: currentDraft.captureNote,
        description: currentDraft.description,
        operatorNote: currentDraft.operatorNote,
        imageWidth: currentDraft.canvasWidth,
        imageHeight: currentDraft.canvasHeight,
        isColor: false,
        strokeCount: currentDraft.strokes.length,
        trajectoryDurationMs: getHandwritingDurationMs(currentDraft.strokes),
        canvasWidth: currentDraft.canvasWidth,
        canvasHeight: currentDraft.canvasHeight,
        deviceType: 'browser-canvas',
        inputTool: getHandwritingInputTool(currentDraft.strokes),
      };

      await onUpload(uploadInput);
    } catch (error: unknown) {
      if (mountedRef.current) {
        setCanvasError(
          error instanceof Error
            ? error.message
            : '手写证据生成失败，请重试。',
        );
      }
    } finally {
      if (mountedRef.current) {
        setIsPreparing(false);
      }
    }
  }

  return (
    <section className="grid gap-4 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface)] p-4">
      <div>
        <h5 className="text-lg font-semibold text-[var(--cma-text-strong)]">
          手写画布与上传前最终预览
        </h5>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          可使用触控笔、手指或鼠标连续书写。画布使用固定 1200 × 800 逻辑坐标，窄屏仅缩放显示。
        </p>
      </div>

      {disabledReason ? (
        <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--cma-warning)]">
          {disabledReason}
        </p>
      ) : null}

      <canvas
        aria-describedby={`${inputIdPrefix}-canvas-status`}
        aria-label="手写证据画布"
        className="h-auto w-full rounded-md border border-[var(--cma-line-strong)] bg-white shadow-inner disabled:opacity-60"
        height={HANDWRITING_CANVAS_HEIGHT}
        onPointerCancel={(event) => finishPointer(event, false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event, true)}
        ref={canvasRef}
        style={{
          aspectRatio: `${HANDWRITING_CANVAS_WIDTH} / ${HANDWRITING_CANVAS_HEIGHT}`,
          touchAction: 'none',
        }}
        width={HANDWRITING_CANVAS_WIDTH}
      />

      <div
        className="grid gap-2 rounded-md bg-[var(--cma-surface-muted)] p-3 text-sm text-[var(--cma-text-strong)] sm:grid-cols-2 lg:grid-cols-4"
        id={`${inputIdPrefix}-canvas-status`}
      >
        <span>当前笔数：{strokes.length}</span>
        <span>当前点数：{pointCount} / {MAX_HANDWRITING_POINTS}</span>
        <span>输入工具：{handwritingInputToolLabels[inputTool]}</span>
        <span>{strokes.length > 0 ? '存在待上传内容' : '画布为空'}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={controlsDisabled || strokes.length === 0}
          onClick={handleUndo}
          variant="secondary"
        >
          撤销上一笔
        </Button>
        <Button
          disabled={isUploading || isPreparing || strokes.length === 0}
          onClick={() => {
            activePointerIdRef.current = null;
            commitDraft(null);
            setCanvasError(null);
          }}
          variant="secondary"
        >
          清空全部
        </Button>
      </div>

      {strokes.length > 0 ? (
        <div className="grid gap-4">
          <div className="flex items-start gap-3">
            <input
              checked={draft?.includeTrajectory ?? true}
              className="mt-1 h-5 w-5 accent-[var(--cma-primary)]"
              disabled={controlsDisabled}
              id={`${inputIdPrefix}-include-trajectory`}
              onChange={(event) =>
                updateDraft({ includeTrajectory: event.target.checked })
              }
              type="checkbox"
            />
            <div>
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor={`${inputIdPrefix}-include-trajectory`}
              >
                同时上传规范化 strokes 轨迹
              </label>
              <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
                默认开启；轨迹只包含逻辑坐标、相对用时、压力和输入工具，不包含患者或路由标识。
              </p>
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
                value={draft?.captureNote ?? ''}
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
                value={draft?.description ?? ''}
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
                value={draft?.operatorNote ?? ''}
              />
            </div>
          </div>

          <Button disabled={controlsDisabled} onClick={() => void handleUpload()}>
            {isPreparing
              ? '正在生成 PNG 与轨迹...'
              : isUploading
                ? '正在上传手写证据...'
                : '上传手写证据'}
          </Button>
        </div>
      ) : null}

      {canvasError ? (
        <p
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-3 py-2 text-sm leading-6 text-[var(--cma-danger)]"
          role="alert"
        >
          {canvasError}
        </p>
      ) : null}
    </section>
  );
}
