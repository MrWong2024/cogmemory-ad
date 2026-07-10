import { createHash } from 'crypto';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';
import {
  MediaFileValidationError,
  validatePrimaryMediaFile,
} from './media-file-validation';

function file(buffer: Buffer, mimetype: string): UploadedMemoryFile {
  return {
    fieldname: 'file',
    originalname: 'client-name-is-not-used.bin',
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

function pngChunk(type: string, data = Buffer.alloc(0)): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([
    length,
    Buffer.from(type, 'ascii'),
    data,
    Buffer.alloc(4),
  ]);
}

function expectCode(callback: () => unknown, code: string): void {
  try {
    callback();
    throw new Error('Expected media file validation to fail');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(MediaFileValidationError);
    expect((error as MediaFileValidationError).code).toBe(code);
  }
}

describe('validatePrimaryMediaFile', () => {
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'jpg'],
    ['image/png', Buffer.concat([pngSignature, pngChunk('IEND')]), 'png'],
    [
      'image/webp',
      Buffer.concat([
        Buffer.from('RIFF', 'ascii'),
        Buffer.alloc(4),
        Buffer.from('WEBPVP8 ', 'ascii'),
        Buffer.alloc(4),
      ]),
      'webp',
    ],
  ])('accepts %s by magic bytes and computes SHA-256', (mime, buffer, ext) => {
    const result = validatePrimaryMediaFile(file(buffer, mime));

    expect(result.detectedMimeType).toBe(mime);
    expect(result.fileExtension).toBe(ext);
    expect(result.sizeBytes).toBe(buffer.length);
    expect(result.checksumAlgorithm).toBe('sha256');
    expect(result.checksum).toBe(
      createHash('sha256').update(buffer).digest('hex'),
    );
    expect(result.sanitizedBuffer).toEqual(buffer);
    expect(result.sanitizedBuffer).not.toBe(buffer);
  });

  it('rejects empty and oversized files', () => {
    expectCode(
      () => validatePrimaryMediaFile(file(Buffer.alloc(0), 'image/png')),
      'MEDIA_FILE_EMPTY',
    );
    expectCode(
      () =>
        validatePrimaryMediaFile(
          file(Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png'),
        ),
      'MEDIA_FILE_TOO_LARGE',
    );
  });

  it.each(['image/svg+xml', 'application/pdf', 'image/heic', 'image/heif'])(
    'rejects forbidden MIME %s',
    (mime) => {
      expectCode(
        () => validatePrimaryMediaFile(file(Buffer.from('<svg/>'), mime)),
        'MEDIA_FILE_TYPE_NOT_ALLOWED',
      );
    },
  );

  it('rejects spoofed and mismatched signatures', () => {
    expectCode(
      () =>
        validatePrimaryMediaFile(
          file(Buffer.from('%PDF-1.7', 'ascii'), 'image/png'),
        ),
      'MEDIA_FILE_SIGNATURE_INVALID',
    );
    expectCode(
      () =>
        validatePrimaryMediaFile(
          file(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/png'),
        ),
      'MEDIA_FILE_SIGNATURE_INVALID',
    );
  });

  it('rejects JPEG EXIF and XMP metadata', () => {
    const exif = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08]),
      Buffer.from('Exif\0\0', 'binary'),
      Buffer.from([0xff, 0xd9]),
    ]);
    const xmpPayload = Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>');
    const length = Buffer.alloc(2);
    length.writeUInt16BE(xmpPayload.length + 2);
    const xmp = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
      length,
      xmpPayload,
      Buffer.from([0xff, 0xd9]),
    ]);

    for (const buffer of [exif, xmp]) {
      expectCode(
        () => validatePrimaryMediaFile(file(buffer, 'image/jpeg')),
        'MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED',
      );
    }
  });

  it.each(['eXIf', 'tEXt', 'zTXt', 'iTXt'])(
    'rejects PNG %s metadata chunks',
    (chunkType) => {
      const buffer = Buffer.concat([
        pngSignature,
        pngChunk(chunkType, Buffer.from('private')),
        pngChunk('IEND'),
      ]);
      expectCode(
        () => validatePrimaryMediaFile(file(buffer, 'image/png')),
        'MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED',
      );
    },
  );

  it.each(['EXIF', 'XMP '])('rejects WebP %s chunks', (chunkType) => {
    const buffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.alloc(4),
      Buffer.from('WEBP', 'ascii'),
      Buffer.from(chunkType, 'ascii'),
      Buffer.alloc(4),
    ]);
    expectCode(
      () => validatePrimaryMediaFile(file(buffer, 'image/webp')),
      'MEDIA_FILE_EMBEDDED_METADATA_NOT_ALLOWED',
    );
  });
});
