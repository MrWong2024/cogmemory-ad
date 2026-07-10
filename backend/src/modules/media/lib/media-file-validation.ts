import { createHash } from 'crypto';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';

export const MAX_PRIMARY_MEDIA_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_PRIMARY_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedPrimaryMediaMimeType =
  (typeof ALLOWED_PRIMARY_MEDIA_MIME_TYPES)[number];

export type ValidatedPrimaryMediaFile = {
  detectedMimeType: AllowedPrimaryMediaMimeType;
  fileExtension: 'jpg' | 'png' | 'webp';
  sizeBytes: number;
  checksum: string;
  checksumAlgorithm: 'sha256';
  sanitizedBuffer: Buffer;
};

export class MediaFileValidationError extends Error {
  constructor(
    readonly code:
      | 'MEDIA_FILE_EMPTY'
      | 'MEDIA_FILE_TOO_LARGE'
      | 'MEDIA_FILE_TYPE_NOT_ALLOWED'
      | 'MEDIA_FILE_SIGNATURE_INVALID'
      | 'MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED',
    readonly statusCode: 400 | 413,
    message: string,
  ) {
    super(message);
    this.name = 'MediaFileValidationError';
  }
}

function startsWith(buffer: Buffer, signature: readonly number[]): boolean {
  return (
    buffer.length >= signature.length &&
    signature.every((byte, index) => buffer[index] === byte)
  );
}

function detectMimeType(buffer: Buffer): AllowedPrimaryMediaMimeType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

function jpegContainsEmbeddedMetadata(buffer: Buffer): boolean {
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (
      marker === 0x00 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd8)
    ) {
      continue;
    }

    if (offset + 2 > buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);

    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break;
    }

    if (marker === 0xe1) {
      const payload = buffer.subarray(offset + 2, offset + segmentLength);
      const text = payload.toString('utf8').toLowerCase();

      if (
        startsWith(payload, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]) ||
        text.includes('http://ns.adobe.com/xap/1.0/') ||
        text.includes('<x:xmpmeta')
      ) {
        return true;
      }
    }

    offset += segmentLength;
  }

  return false;
}

function pngContainsEmbeddedMetadata(buffer: Buffer): boolean {
  const forbiddenChunkTypes = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;

    if (chunkEnd > buffer.length) {
      break;
    }

    const chunkType = buffer.subarray(offset + 4, offset + 8).toString('ascii');

    if (forbiddenChunkTypes.has(chunkType)) {
      return true;
    }

    offset = chunkEnd;
  }

  return false;
}

function webpContainsEmbeddedMetadata(buffer: Buffer): boolean {
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.subarray(offset, offset + 4).toString('ascii');
    const dataLength = buffer.readUInt32LE(offset + 4);

    if (chunkType === 'EXIF' || chunkType === 'XMP ') {
      return true;
    }

    const paddedLength = dataLength + (dataLength % 2);
    const nextOffset = offset + 8 + paddedLength;

    if (nextOffset <= offset || nextOffset > buffer.length) {
      break;
    }

    offset = nextOffset;
  }

  return false;
}

function containsEmbeddedMetadata(
  buffer: Buffer,
  mimeType: AllowedPrimaryMediaMimeType,
): boolean {
  if (mimeType === 'image/jpeg') {
    return jpegContainsEmbeddedMetadata(buffer);
  }

  if (mimeType === 'image/png') {
    return pngContainsEmbeddedMetadata(buffer);
  }

  return webpContainsEmbeddedMetadata(buffer);
}

function toFileExtension(
  mimeType: AllowedPrimaryMediaMimeType,
): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/jpeg') {
    return 'jpg';
  }

  return mimeType === 'image/png' ? 'png' : 'webp';
}

export function validatePrimaryMediaFile(
  file: UploadedMemoryFile,
): ValidatedPrimaryMediaFile {
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

  if (
    !(ALLOWED_PRIMARY_MEDIA_MIME_TYPES as readonly string[]).includes(
      file.mimetype,
    )
  ) {
    throw new MediaFileValidationError(
      'MEDIA_FILE_TYPE_NOT_ALLOWED',
      400,
      'Media file type is not allowed',
    );
  }

  const detectedMimeType = detectMimeType(file.buffer);

  if (!detectedMimeType || detectedMimeType !== file.mimetype) {
    throw new MediaFileValidationError(
      'MEDIA_FILE_SIGNATURE_INVALID',
      400,
      'Media file signature is invalid',
    );
  }

  if (containsEmbeddedMetadata(file.buffer, detectedMimeType)) {
    throw new MediaFileValidationError(
      'MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED',
      400,
      'Embedded image metadata is not allowed',
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
