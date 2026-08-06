import { createHash } from 'crypto';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';
import {
  MAX_PRIMARY_MEDIA_FILE_BYTES,
  MediaFileValidationError,
} from './media-file-validation';
import { validatePatientAudioFile } from './patient-audio-file-validation';

function file(buffer: Buffer, mimetype: string): UploadedMemoryFile {
  return {
    fieldname: 'file',
    originalname: 'patient-private-name-is-not-used.bin',
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

function expectCode(callback: () => unknown, code: string): void {
  try {
    callback();
    throw new Error('Expected patient audio validation to fail');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(MediaFileValidationError);
    expect((error as MediaFileValidationError).code).toBe(code);
  }
}

describe('validatePatientAudioFile', () => {
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
  const ogg = Buffer.from('OggS-patient-audio', 'ascii');
  const m4a = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypM4A ', 'ascii'),
  ]);
  const mp3Id3 = Buffer.from('ID3-patient-audio', 'ascii');
  const mp3Frame = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00]);

  it.each([
    ['audio/webm', webm, 'webm'],
    ['audio/ogg', ogg, 'ogg'],
    ['audio/mp4', m4a, 'm4a'],
    ['audio/mpeg', mp3Id3, 'mp3'],
    ['audio/mpeg', mp3Frame, 'mp3'],
  ])('accepts %s by signature and computes SHA-256', (mime, buffer, ext) => {
    const result = validatePatientAudioFile(file(buffer, mime));

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

  it('normalizes a browser codec MIME parameter', () => {
    const result = validatePatientAudioFile(
      file(webm, 'audio/webm;codecs=opus'),
    );

    expect(result.detectedMimeType).toBe('audio/webm');
    expect(result.fileExtension).toBe('webm');
  });

  it('rejects mismatched signatures and forbidden MIME types', () => {
    expectCode(
      () => validatePatientAudioFile(file(ogg, 'audio/webm')),
      'MEDIA_FILE_SIGNATURE_INVALID',
    );
    expectCode(
      () => validatePatientAudioFile(file(webm, 'audio/wav')),
      'MEDIA_FILE_TYPE_NOT_ALLOWED',
    );
  });

  it('rejects empty and oversized files', () => {
    expectCode(
      () => validatePatientAudioFile(file(Buffer.alloc(0), 'audio/webm')),
      'MEDIA_FILE_EMPTY',
    );
    expectCode(
      () =>
        validatePatientAudioFile(
          file(Buffer.alloc(MAX_PRIMARY_MEDIA_FILE_BYTES + 1), 'audio/webm'),
        ),
      'MEDIA_FILE_TOO_LARGE',
    );
  });
});
