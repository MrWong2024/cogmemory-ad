import { createHash } from 'node:crypto';
import {
  MAX_PRIMARY_MEDIA_FILE_BYTES,
  MediaFileValidationError,
} from './media-file-validation';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';

export const ALLOWED_PATIENT_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
] as const;

export type AllowedPatientAudioMimeType =
  (typeof ALLOWED_PATIENT_AUDIO_MIME_TYPES)[number];

export type ValidatedPatientAudioFile = {
  detectedMimeType: AllowedPatientAudioMimeType;
  fileExtension: 'webm' | 'ogg' | 'm4a' | 'mp3';
  sizeBytes: number;
  checksum: string;
  checksumAlgorithm: 'sha256';
  sanitizedBuffer: Buffer;
};

function startsWith(buffer: Buffer, signature: readonly number[]): boolean {
  return (
    buffer.length >= signature.length &&
    signature.every((byte, index) => buffer[index] === byte)
  );
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0].trim().toLowerCase();
}

function isMpegFrame(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer[0] !== 0xff || (buffer[1] & 0xe0) !== 0xe0) {
    return false;
  }

  const versionBits = (buffer[1] >> 3) & 0x03;
  const layerBits = (buffer[1] >> 1) & 0x03;
  const bitrateIndex = (buffer[2] >> 4) & 0x0f;
  const sampleRateIndex = (buffer[2] >> 2) & 0x03;
  return (
    versionBits !== 0x01 &&
    layerBits !== 0x00 &&
    bitrateIndex !== 0x00 &&
    bitrateIndex !== 0x0f &&
    sampleRateIndex !== 0x03
  );
}

function detectMimeType(buffer: Buffer): AllowedPatientAudioMimeType | null {
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return 'audio/webm';
  }

  if (
    buffer.length >= 4 &&
    buffer.subarray(0, 4).toString('ascii') === 'OggS'
  ) {
    return 'audio/ogg';
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  ) {
    return 'audio/mp4';
  }

  if (
    (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'ID3') ||
    isMpegFrame(buffer)
  ) {
    return 'audio/mpeg';
  }

  return null;
}

function toFileExtension(
  mimeType: AllowedPatientAudioMimeType,
): 'webm' | 'ogg' | 'm4a' | 'mp3' {
  if (mimeType === 'audio/webm') {
    return 'webm';
  }
  if (mimeType === 'audio/ogg') {
    return 'ogg';
  }
  return mimeType === 'audio/mp4' ? 'm4a' : 'mp3';
}

export function validatePatientAudioFile(
  file: UploadedMemoryFile,
): ValidatedPatientAudioFile {
  const sizeBytes = file.buffer.length;
  if (sizeBytes === 0) {
    throw new MediaFileValidationError(
      'MEDIA_FILE_EMPTY',
      400,
      'Media file must not be empty',
    );
  }
  if (sizeBytes > MAX_PRIMARY_MEDIA_FILE_BYTES) {
    throw new MediaFileValidationError(
      'MEDIA_FILE_TOO_LARGE',
      413,
      'Media file is too large',
    );
  }

  const normalizedMimeType = normalizeMimeType(file.mimetype);
  if (
    !(ALLOWED_PATIENT_AUDIO_MIME_TYPES as readonly string[]).includes(
      normalizedMimeType,
    )
  ) {
    throw new MediaFileValidationError(
      'MEDIA_FILE_TYPE_NOT_ALLOWED',
      400,
      'Media file type is not allowed',
    );
  }

  const detectedMimeType = detectMimeType(file.buffer);
  if (!detectedMimeType || detectedMimeType !== normalizedMimeType) {
    throw new MediaFileValidationError(
      'MEDIA_FILE_SIGNATURE_INVALID',
      400,
      'Media file signature is invalid',
    );
  }

  const sanitizedBuffer = Buffer.from(file.buffer);
  return {
    detectedMimeType,
    fileExtension: toFileExtension(detectedMimeType),
    sizeBytes,
    checksum: createHash('sha256').update(sanitizedBuffer).digest('hex'),
    checksumAlgorithm: 'sha256',
    sanitizedBuffer,
  };
}
