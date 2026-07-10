import { createHash } from 'crypto';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';
import {
  HandwritingTrajectoryValidationError,
  validateHandwritingTrajectoryJson,
} from './handwriting-trajectory-json';

function trajectoryFile(
  content: string | Buffer,
  mimetype = 'application/json',
): UploadedMemoryFile {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return {
    fieldname: 'trajectory',
    originalname: 'client-trajectory.json',
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

function expectInvalid(file: UploadedMemoryFile): void {
  expect(() => validateHandwritingTrajectoryJson(file)).toThrow(
    HandwritingTrajectoryValidationError,
  );
}

describe('validateHandwritingTrajectoryJson', () => {
  it('parses, clones, normalizes and hashes safe JSON', () => {
    const result = validateHandwritingTrajectoryJson(
      trajectoryFile(' { "strokes" : [ [ { "x": 1, "y": 2 } ] ] } '),
    );

    expect(result.normalizedValue).toEqual({
      strokes: [[{ x: 1, y: 2 }]],
    });
    expect(result.normalizedBuffer.toString('utf8')).toBe(
      '{"strokes":[[{"x":1,"y":2}]]}',
    );
    expect(result.sizeBytes).toBe(result.normalizedBuffer.length);
    expect(result.checksumAlgorithm).toBe('sha256');
    expect(result.checksum).toBe(
      createHash('sha256').update(result.normalizedBuffer).digest('hex'),
    );
  });

  it('rejects empty, oversized, non-JSON and non-JSON MIME files', () => {
    expectInvalid(trajectoryFile(''));
    expectInvalid(trajectoryFile(Buffer.alloc(2 * 1024 * 1024 + 1)));
    expectInvalid(trajectoryFile('{bad json'));
    expectInvalid(trajectoryFile('{}', 'application/octet-stream'));
  });

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects dangerous key %s',
    (key) => {
      expectInvalid(trajectoryFile(`{"${key}":null}`));
    },
  );

  it('rejects non-finite numbers, excessive depth and long strings', () => {
    expectInvalid(trajectoryFile('1e400'));
    expectInvalid(trajectoryFile(`${'['.repeat(11)}0${']'.repeat(11)}`));
    expectInvalid(trajectoryFile(JSON.stringify('x'.repeat(2001))));
  });

  it('rejects excessive arrays, object keys and total nodes', () => {
    expectInvalid(trajectoryFile(JSON.stringify(Array(10001).fill(0))));

    const tooManyKeys = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`k${index}`, index]),
    );
    expectInvalid(trajectoryFile(JSON.stringify(tooManyKeys)));

    const tooManyNodes = {
      a: Array(10000).fill(0),
      b: Array(10000).fill(0),
      c: Array(10000).fill(0),
      d: Array(10000).fill(0),
      e: Array(10000).fill(0),
    };
    expectInvalid(trajectoryFile(JSON.stringify(tooManyNodes)));
  });
});
