import type { ItemResponseDraftJsonValue } from '../types/item-response-execution-response.types';

const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const MAX_STRING_LENGTH = 4000;
const MAX_SERIALIZED_BYTES = 32768;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class ItemResponseDraftJsonValidationError extends Error {
  constructor() {
    super('Item response draft JSON value is invalid');
    this.name = 'ItemResponseDraftJsonValidationError';
  }
}

function invalid(): never {
  throw new ItemResponseDraftJsonValidationError();
}

function cloneValue(value: unknown, depth: number): ItemResponseDraftJsonValue {
  if (depth > MAX_DEPTH) {
    invalid();
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      invalid();
    }

    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      invalid();
    }

    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      invalid();
    }

    return value.map((item) => cloneValue(item, depth + 1));
  }

  if (
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    invalid();
  }

  const keys = Object.keys(value);

  if (keys.length > MAX_OBJECT_KEYS) {
    invalid();
  }

  const clone: { [key: string]: ItemResponseDraftJsonValue } = {};

  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) {
      invalid();
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (!descriptor || !('value' in descriptor)) {
      invalid();
    }

    clone[key] = cloneValue(descriptor.value, depth + 1);
  }

  return clone;
}

function assertSerializedSize(value: ItemResponseDraftJsonValue): void {
  const serialized = JSON.stringify(value);

  if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_BYTES) {
    invalid();
  }
}

export function validateAndCloneDraftJsonValue(
  value: unknown,
): ItemResponseDraftJsonValue {
  const clone = cloneValue(value, 0);
  assertSerializedSize(clone);
  return clone;
}

export function validateAndCloneStructuredDraft(
  value: unknown,
): { [key: string]: ItemResponseDraftJsonValue } | null {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }

  const clone = validateAndCloneDraftJsonValue(value);

  if (clone === null || Array.isArray(clone) || typeof clone !== 'object') {
    invalid();
  }

  return clone;
}
