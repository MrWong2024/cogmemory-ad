import type { HandwritingDraft } from '@/src/features/assessments/types/handwriting-evidence';
import type {
  SupportedMediaEvidenceType,
  UploadMediaCaptureMode,
} from '@/src/features/assessments/types/media-evidence';

export type PhotoEvidenceDraft = {
  kind: 'photo';
  blob: Blob;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/jpeg';
  orientation: 'portrait' | 'landscape' | 'square';
  captureMode: Extract<
    UploadMediaCaptureMode,
    'photo_upload' | 'paper_scan'
  >;
  capturedAt: string;
  pageNo: number;
  isColor: boolean;
  description: string;
  captureNote: string;
  operatorNote: string;
};

export type HandwritingEvidenceDraft = HandwritingDraft & {
  kind: 'handwriting';
};

export type MediaEvidenceDraft =
  | PhotoEvidenceDraft
  | HandwritingEvidenceDraft;

export type ItemMediaDrafts = Partial<
  Record<SupportedMediaEvidenceType, MediaEvidenceDraft>
>;

export function mediaDraftHasPendingContent(
  draft: MediaEvidenceDraft,
): boolean {
  return draft.kind === 'photo' ? draft.blob.size > 0 : draft.strokes.length > 0;
}
