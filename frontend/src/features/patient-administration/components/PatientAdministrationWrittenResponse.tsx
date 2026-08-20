'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/src/components/ui/Button';
import type {
  PatientAdministrationEvidenceUploadInput,
  PatientAdministrationHandwritingInputTool,
  PatientAdministrationResponseMode,
} from '@/src/features/patient-administration/types/patient-administration';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type InputMode = 'canvas' | 'photo';

type ImageDimensions = { width: number; height: number };

function pointerTypeToInputTool(
  pointerType: string,
): PatientAdministrationHandwritingInputTool {
  if (pointerType === 'pen') return 'stylus';
  if (pointerType === 'touch') return 'finger';
  if (pointerType === 'mouse') return 'mouse';
  return 'unknown';
}

async function readImageDimensions(blob: Blob): Promise<ImageDimensions | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return null;
  }
}

type Props = {
  disabled: boolean;
  responseMode: Extract<PatientAdministrationResponseMode, 'writing' | 'drawing'>;
  onBusyChange: (busy: boolean) => void;
  onUpload: (
    input: Omit<PatientAdministrationEvidenceUploadInput, 'expectedRevision'>,
  ) => Promise<boolean>;
};

export function PatientAdministrationWrittenResponse({
  disabled,
  responseMode,
  onBusyChange,
  onUpload,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const strokeCountRef = useRef(0);
  const handwritingStartedAtRef = useRef<number | null>(null);
  const handwritingLastInkAtRef = useRef<number | null>(null);
  const handwritingInputToolRef =
    useRef<PatientAdministrationHandwritingInputTool | null>(null);
  const photoUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const [mode, setMode] = useState<InputMode>('canvas');
  const [hasInk, setHasInk] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoDimensions, setPhotoDimensions] =
    useState<ImageDimensions | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#172033';
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = 8;
    }
    activePointerRef.current = null;
    strokeCountRef.current = 0;
    handwritingStartedAtRef.current = null;
    handwritingLastInkAtRef.current = null;
    handwritingInputToolRef.current = null;
    setHasInk(false);
  }

  function clearPhoto() {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    setPhotoUrl(null);
    setPhoto(null);
    setPhotoDimensions(null);
  }

  useEffect(() => {
    mountedRef.current = true;
    resetCanvas();
    return () => {
      mountedRef.current = false;
      savingRef.current = false;
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
      onBusyChange(false);
    };
  }, [onBusyChange]);

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * CANVAS_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * CANVAS_HEIGHT,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || uploading || saved || activePointerRef.current !== null) return;
    event.preventDefault();
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = canvasPoint(event);
    const now = Date.now();
    const inputTool = pointerTypeToInputTool(event.pointerType);
    activePointerRef.current = event.pointerId;
    strokeCountRef.current += 1;
    handwritingStartedAtRef.current ??= now;
    handwritingLastInkAtRef.current = now;
    handwritingInputToolRef.current =
      handwritingInputToolRef.current === null
        ? inputTool
        : handwritingInputToolRef.current === inputTool
          ? inputTool
          : 'unknown';
    event.currentTarget.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.1, point.y + 0.1);
    context.stroke();
    setHasInk(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = canvasPoint(event);
    handwritingLastInkAtRef.current = Date.now();
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function finishPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function selectMode(nextMode: InputMode) {
    if (uploading || saved) return;
    setMode(nextMode);
    setError(null);
    if (nextMode === 'canvas') clearPhoto();
    else resetCanvas();
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    clearPhoto();
    setError(null);
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    const mimeType = selected.type.toLowerCase();
    if (!PHOTO_TYPES.includes(mimeType) || selected.size > MAX_FILE_BYTES) {
      setError('照片格式或大小不符合要求，请选择 JPEG、PNG 或 WebP 图片。');
      return;
    }
    const blob = selected.slice(0, selected.size, mimeType);
    const dimensions = await readImageDimensions(blob);
    if (!mountedRef.current) return;
    const url = URL.createObjectURL(blob);
    photoUrlRef.current = url;
    setPhoto(blob);
    setPhotoDimensions(dimensions);
    setPhotoUrl(url);
  }

  function canvasBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvasRef.current?.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas unavailable'));
      }, 'image/png');
    });
  }

  async function saveContent() {
    if (savingRef.current || disabled || uploading || saved) return;
    if ((mode === 'canvas' && !hasInk) || (mode === 'photo' && !photo)) {
      setError(mode === 'canvas' ? '请先完成有效书写或绘图。' : '请先选择照片。');
      return;
    }
    savingRef.current = true;
    setUploading(true);
    onBusyChange(true);
    setError(null);
    try {
      const file = mode === 'canvas' ? await canvasBlob() : photo;
      if (!mountedRef.current) return;
      if (!file || file.size > MAX_FILE_BYTES) {
        setError('本题内容大小不符合要求，请清空后重试。');
        return;
      }
      const canvas = canvasRef.current;
      const handwritingDurationMs =
        handwritingStartedAtRef.current !== null &&
        handwritingLastInkAtRef.current !== null
          ? Math.max(
              0,
              handwritingLastInkAtRef.current -
                handwritingStartedAtRef.current,
            )
          : 0;
      const uploaded = await onUpload({
        file,
        evidenceType: mode === 'canvas' ? 'handwriting' : 'photo',
        capturedAt: new Date().toISOString(),
        ...(mode === 'canvas'
          ? {
              imageWidth: canvas?.width ?? CANVAS_WIDTH,
              imageHeight: canvas?.height ?? CANVAS_HEIGHT,
              strokeCount: strokeCountRef.current,
              trajectoryDurationMs: handwritingDurationMs,
              canvasWidth: canvas?.width ?? CANVAS_WIDTH,
              canvasHeight: canvas?.height ?? CANVAS_HEIGHT,
              inputTool: handwritingInputToolRef.current ?? 'unknown',
            }
          : photoDimensions
            ? {
                imageWidth: photoDimensions.width,
                imageHeight: photoDimensions.height,
              }
            : {}),
      });
      if (uploaded && mountedRef.current) {
        clearPhoto();
        resetCanvas();
        setSaved(true);
      }
    } catch {
      if (mountedRef.current) setError('本题内容未能生成，请重试。');
    } finally {
      savingRef.current = false;
      if (mountedRef.current) {
        setUploading(false);
        onBusyChange(false);
      }
    }
  }

  const actionName = responseMode === 'writing' ? '书写' : '绘图';

  return (
    <section className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4" aria-labelledby="written-response-title">
      <div>
        <h3 className="text-xl font-semibold" id="written-response-title">完成本题{actionName}</h3>
        <p className="mt-1 text-base leading-7 text-[var(--cma-muted)]">
          可直接在屏幕上完成，也可在纸上完成后选择照片。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-12 items-center gap-3 rounded-md border border-[var(--cma-line)] p-3">
          <input checked={mode === 'canvas'} disabled={uploading || saved} name="patient-written-mode" onChange={() => selectMode('canvas')} type="radio" />
          屏幕{actionName}
        </label>
        <label className="flex min-h-12 items-center gap-3 rounded-md border border-[var(--cma-line)] p-3">
          <input checked={mode === 'photo'} disabled={uploading || saved} name="patient-written-mode" onChange={() => selectMode('photo')} type="radio" />
          纸笔完成后选择照片
        </label>
      </div>

      {mode === 'canvas' ? (
        <div className="grid gap-3">
          <canvas
            aria-label={`本题${actionName}画布`}
            className="h-auto w-full rounded-md border border-[var(--cma-line-strong)] bg-white shadow-inner"
            height={CANVAS_HEIGHT}
            onPointerCancel={finishPointer}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointer}
            ref={canvasRef}
            style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`, touchAction: 'none' }}
            width={CANVAS_WIDTH}
          />
          <Button className="w-fit" disabled={disabled || uploading || saved || !hasInk} onClick={resetCanvas} variant="secondary">清空全部</Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <label className="grid gap-2 font-semibold">
            选择本题照片
            <input accept="image/jpeg,image/png,image/webp" className="min-h-12 rounded-md border border-[var(--cma-line-strong)] bg-white p-2" disabled={disabled || uploading || saved} onChange={handlePhotoChange} type="file" />
          </label>
          {photoUrl ? (
            // The patient-selected photo is a short-lived local Blob URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="本题待保存照片预览" className="max-h-96 w-full rounded-md border border-[var(--cma-line)] object-contain" src={photoUrl} />
          ) : null}
        </div>
      )}

      {saved ? <p className="rounded-md bg-[var(--cma-success-soft)] px-4 py-3 font-semibold text-[var(--cma-success)]" role="status">本题内容已保存</p> : null}
      {!saved ? (
        <Button className="min-h-12 sm:w-fit" disabled={disabled || uploading || (mode === 'canvas' ? !hasInk : !photo)} onClick={() => void saveContent()} size="lg">
          {uploading ? '正在保存…' : '保存本题内容'}
        </Button>
      ) : null}
      {error ? <p className="text-[var(--cma-danger)]" role="alert">{error}</p> : null}
    </section>
  );
}
