import { createHash } from 'crypto';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';

export const MAX_HANDWRITING_TRAJECTORY_BYTES = 2 * 1024 * 1024;
export const MAX_HANDWRITING_TRAJECTORY_DEPTH = 10;
export const MAX_HANDWRITING_TRAJECTORY_ARRAY_ITEMS = 10000;
export const MAX_HANDWRITING_TRAJECTORY_OBJECT_KEYS = 100;
export const MAX_HANDWRITING_TRAJECTORY_NODES = 50000;
export const MAX_HANDWRITING_TRAJECTORY_STRING_LENGTH = 2000;

export type HandwritingTrajectoryJsonValue =
  | null
  | boolean
  | number
  | string
  | HandwritingTrajectoryJsonValue[]
  | { [key: string]: HandwritingTrajectoryJsonValue };

export type ValidatedHandwritingTrajectory = {
  normalizedValue: HandwritingTrajectoryJsonValue;
  normalizedBuffer: Buffer;
  sizeBytes: number;
  checksum: string;
  checksumAlgorithm: 'sha256';
};

export class HandwritingTrajectoryValidationError extends Error {
  readonly code = 'MEDIA_TRAJECTORY_INVALID';

  constructor(message = 'Handwriting trajectory is invalid') {
    super(message);
    this.name = 'HandwritingTrajectoryValidationError';
  }
}

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function fail(): never {
  throw new HandwritingTrajectoryValidationError();
}

function normalizeValue(
  value: unknown,
  depth: number,
  state: { nodeCount: number },
): HandwritingTrajectoryJsonValue {
  if (depth > MAX_HANDWRITING_TRAJECTORY_DEPTH) {
    fail();
  }

  state.nodeCount += 1;

  if (state.nodeCount > MAX_HANDWRITING_TRAJECTORY_NODES) {
    fail();
  }

  if (value === null || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fail();
  }

  if (typeof value === 'string') {
    return value.length <= MAX_HANDWRITING_TRAJECTORY_STRING_LENGTH
      ? value
      : fail();
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_HANDWRITING_TRAJECTORY_ARRAY_ITEMS) {
      fail();
    }

    return value.map((item) => normalizeValue(item, depth + 1, state));
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail();
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length > MAX_HANDWRITING_TRAJECTORY_OBJECT_KEYS) {
    fail();
  }

  const normalized: { [key: string]: HandwritingTrajectoryJsonValue } = {};

  for (const key of keys) {
    if (
      DANGEROUS_KEYS.has(key) ||
      key.length > MAX_HANDWRITING_TRAJECTORY_STRING_LENGTH
    ) {
      fail();
    }

    normalized[key] = normalizeValue(record[key], depth + 1, state);
  }

  return normalized;
}

export function validateHandwritingTrajectoryJson(
  file: UploadedMemoryFile,
): ValidatedHandwritingTrajectory {
  if (
    file.mimetype !== 'application/json' ||
    file.buffer.length === 0 ||
    file.buffer.length > MAX_HANDWRITING_TRAJECTORY_BYTES
  ) {
    fail();
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(file.buffer.toString('utf8')) as unknown;
  } catch {
    fail();
  }

  const normalizedValue = normalizeValue(parsed, 0, { nodeCount: 0 });
  const normalizedBuffer = Buffer.from(JSON.stringify(normalizedValue), 'utf8');

  if (normalizedBuffer.length > MAX_HANDWRITING_TRAJECTORY_BYTES) {
    fail();
  }

  return {
    normalizedValue,
    normalizedBuffer,
    sizeBytes: normalizedBuffer.length,
    checksum: createHash('sha256').update(normalizedBuffer).digest('hex'),
    checksumAlgorithm: 'sha256',
  };
}
