import type {
  HandwritingDraft,
  HandwritingPoint,
  HandwritingStroke,
  HandwritingTrajectoryPayload,
} from '@/src/features/assessments/types/handwriting-evidence';
import type { HandwritingInputTool } from '@/src/features/assessments/types/media-evidence';

import { MAX_PRIMARY_MEDIA_FILE_BYTES } from '@/src/features/assessments/lib/media-evidence-image';

export const HANDWRITING_CANVAS_WIDTH = 1200;
export const HANDWRITING_CANVAS_HEIGHT = 800;
export const MAX_HANDWRITING_POINTS = 8000;
export const MAX_HANDWRITING_TRAJECTORY_BYTES = 2 * 1024 * 1024;

const COORDINATE_PRECISION = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundCoordinate(value: number): number {
  return Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

export function pointerTypeToInputTool(
  pointerType: string,
): HandwritingInputTool {
  if (pointerType === 'pen') {
    return 'stylus';
  }

  if (pointerType === 'touch') {
    return 'finger';
  }

  if (pointerType === 'mouse') {
    return 'mouse';
  }

  return 'unknown';
}

export function createHandwritingPoint(
  clientX: number,
  clientY: number,
  pressure: number,
  elapsedMs: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  canvasWidth: number,
  canvasHeight: number,
): HandwritingPoint | null {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !Number.isFinite(elapsedMs) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null;
  }

  const x = ((clientX - bounds.left) / bounds.width) * canvasWidth;
  const y = ((clientY - bounds.top) / bounds.height) * canvasHeight;
  const safePressure = Number.isFinite(pressure) ? pressure : 0;

  return {
    x: roundCoordinate(clamp(x, 0, canvasWidth)),
    y: roundCoordinate(clamp(y, 0, canvasHeight)),
    t: Math.max(0, Math.round(elapsedMs)),
    pressure: roundCoordinate(clamp(safePressure, 0, 1)),
  };
}

export function countHandwritingPoints(strokes: HandwritingStroke[]): number {
  return strokes.reduce((total, stroke) => total + stroke.points.length, 0);
}

export function getHandwritingInputTool(
  strokes: HandwritingStroke[],
): HandwritingInputTool {
  const tools = new Set(strokes.map((stroke) => stroke.tool));

  if (tools.has('stylus')) {
    return 'stylus';
  }

  if (tools.has('finger')) {
    return 'finger';
  }

  if (tools.has('mouse')) {
    return 'mouse';
  }

  return 'unknown';
}

export function getHandwritingDurationMs(
  strokes: HandwritingStroke[],
): number {
  return strokes.reduce(
    (duration, stroke) =>
      stroke.points.reduce(
        (strokeDuration, point) => Math.max(strokeDuration, point.t),
        duration,
      ),
    0,
  );
}

function normalizeTrajectoryPoint(
  point: HandwritingPoint,
  canvasWidth: number,
  canvasHeight: number,
): HandwritingPoint {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.t) ||
    !Number.isFinite(point.pressure)
  ) {
    throw new Error('手写轨迹包含无效数值，请清空后重新书写。');
  }

  return {
    x: roundCoordinate(clamp(point.x, 0, canvasWidth)),
    y: roundCoordinate(clamp(point.y, 0, canvasHeight)),
    t: Math.max(0, Math.round(point.t)),
    pressure: roundCoordinate(clamp(point.pressure, 0, 1)),
  };
}

export function buildHandwritingTrajectoryPayload(
  draft: HandwritingDraft,
): HandwritingTrajectoryPayload {
  const pointCount = countHandwritingPoints(draft.strokes);

  if (pointCount === 0) {
    throw new Error('空白画布不能生成手写证据。');
  }

  if (pointCount > MAX_HANDWRITING_POINTS) {
    throw new Error('手写轨迹超过 8000 点，请简化书写或清空重画。');
  }

  return {
    version: 1,
    coordinateSpace: {
      width: draft.canvasWidth,
      height: draft.canvasHeight,
    },
    strokes: draft.strokes.map((stroke) => ({
      tool: stroke.tool,
      points: stroke.points.map((point) =>
        normalizeTrajectoryPoint(point, draft.canvasWidth, draft.canvasHeight),
      ),
    })),
  };
}

export function createHandwritingTrajectoryBlob(
  draft: HandwritingDraft,
): Blob {
  const payload = buildHandwritingTrajectoryPayload(draft);
  const blob = new Blob([JSON.stringify(payload)], {
    type: 'application/json',
  });

  if (blob.size > MAX_HANDWRITING_TRAJECTORY_BYTES) {
    throw new Error(
      '手写轨迹超过 2 MiB 安全限制，请简化书写或清空重画。',
    );
  }

  return blob;
}

export function drawHandwritingCanvas(
  canvas: HTMLCanvasElement,
  strokes: HandwritingStroke[],
) {
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('当前浏览器无法创建手写画布。');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#17324d';
  context.fillStyle = '#17324d';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 5;

  for (const stroke of strokes) {
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      context.beginPath();
      context.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
      context.fill();
      continue;
    }

    if (stroke.points.length > 1) {
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (const point of stroke.points.slice(1)) {
        context.lineTo(point.x, point.y);
      }

      context.stroke();
    }
  }
}

export function createHandwritingPngBlob(
  canvas: HTMLCanvasElement,
  strokes: HandwritingStroke[],
): Promise<Blob> {
  if (countHandwritingPoints(strokes) === 0) {
    return Promise.reject(new Error('空白画布不能上传手写证据。'));
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0 || blob.type !== 'image/png') {
        reject(new Error('浏览器无法生成手写 PNG 图片。'));
        return;
      }

      if (blob.size > MAX_PRIMARY_MEDIA_FILE_BYTES) {
        reject(
          new Error('手写 PNG 超过 10 MiB 安全限制，请简化书写后重试。'),
        );
        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}
