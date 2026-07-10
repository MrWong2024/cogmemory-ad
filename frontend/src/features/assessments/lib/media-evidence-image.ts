export const MAX_PRIMARY_MEDIA_FILE_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_LONG_EDGE = 2560;
export const PHOTO_INITIAL_JPEG_QUALITY = 0.9;

const PHOTO_MIN_LONG_EDGE = 1280;
const JPEG_QUALITIES = [0.9, 0.85, 0.8, 0.75, 0.72] as const;
const DIMENSION_FACTORS = [1, 0.9, 0.8, 0.7, 0.5] as const;

export type ProcessedPhotoEvidence = {
  blob: Blob;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/jpeg';
  orientation: 'portrait' | 'landscape' | 'square';
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

function getOrientation(
  width: number,
  height: number,
): ProcessedPhotoEvidence['orientation'] {
  if (width === height) {
    return 'square';
  }

  return width > height ? 'landscape' : 'portrait';
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('所选图片无法由浏览器安全解码。'));
    image.src = url;
  });
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (file.size === 0) {
    throw new Error('所选图片内容为空，请重新选择。');
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);

      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close(),
        };
      }

      bitmap.close();
    } catch {
      // The HTMLImageElement fallback below covers browsers with partial support.
    }
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadHtmlImage(objectUrl);

    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error('所选图片没有有效尺寸，请重新选择。');
    }

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error: unknown) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function calculateInitialDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  const scale = Math.min(1, PHOTO_MAX_LONG_EDGE / longEdge);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function buildDimensionCandidates(
  width: number,
  height: number,
): Array<{ width: number; height: number }> {
  const longEdge = Math.max(width, height);
  const candidates: Array<{ width: number; height: number }> = [];
  const seen = new Set<string>();

  for (const factor of DIMENSION_FACTORS) {
    const targetLongEdge = Math.min(
      longEdge,
      Math.max(Math.min(PHOTO_MIN_LONG_EDGE, longEdge), Math.round(longEdge * factor)),
    );
    const scale = targetLongEdge / longEdge;
    const candidate = {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
    const key = `${candidate.width}:${candidate.height}`;

    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(candidate);
    }
  }

  return candidates;
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('浏览器无法生成安全 JPEG 图片。'));
          return;
        }

        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

function drawOnWhiteCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('当前浏览器无法创建图片处理画布。');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  return canvas;
}

export async function processPhotoEvidenceFile(
  file: File,
): Promise<ProcessedPhotoEvidence> {
  const decoded = await decodeImage(file);

  try {
    const initial = calculateInitialDimensions(decoded.width, decoded.height);
    const candidates = buildDimensionCandidates(initial.width, initial.height);

    for (const dimensions of candidates) {
      const canvas = drawOnWhiteCanvas(
        decoded.source,
        dimensions.width,
        dimensions.height,
      );

      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToJpegBlob(canvas, quality);

        if (
          blob.size > 0 &&
          blob.size <= MAX_PRIMARY_MEDIA_FILE_BYTES &&
          blob.type === 'image/jpeg'
        ) {
          return {
            blob,
            width: dimensions.width,
            height: dimensions.height,
            sizeBytes: blob.size,
            mimeType: 'image/jpeg',
            orientation: getOrientation(dimensions.width, dimensions.height),
          };
        }
      }
    }
  } finally {
    decoded.cleanup();
  }

  throw new Error(
    '处理后的图片仍超过 10 MiB 安全限制，请重新拍摄或先裁减图片。',
  );
}
