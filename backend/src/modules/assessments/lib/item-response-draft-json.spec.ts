import {
  ItemResponseDraftJsonValidationError,
  validateAndCloneDraftJsonValue,
  validateAndCloneStructuredDraft,
} from './item-response-draft-json';

describe('item response draft JSON validation', () => {
  it('clones valid JSON values without retaining client references', () => {
    const source = {
      text: 'de-identified answer',
      flags: [true, false, null],
      nested: { scoreCandidate: 2 },
    };

    const result = validateAndCloneDraftJsonValue(source);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);

    if (
      typeof result !== 'object' ||
      result === null ||
      Array.isArray(result)
    ) {
      throw new Error('Expected a cloned object');
    }

    expect(result.nested).not.toBe(source.nested);
    expect(result.flags).not.toBe(source.flags);
  });

  it('accepts only a plain object or null for structured responses', () => {
    expect(validateAndCloneStructuredDraft(null)).toBeNull();
    expect(validateAndCloneStructuredDraft({ recalled: true })).toEqual({
      recalled: true,
    });
    expect(() => validateAndCloneStructuredDraft([])).toThrow(
      ItemResponseDraftJsonValidationError,
    );
    expect(() => validateAndCloneStructuredDraft('answer')).toThrow(
      ItemResponseDraftJsonValidationError,
    );
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    undefined,
    BigInt(1),
    Symbol('answer'),
    () => 'answer',
    new Date(),
    Object.create(null),
  ])('rejects non-JSON or non-plain value %p', (value) => {
    expect(() => validateAndCloneDraftJsonValue(value)).toThrow(
      ItemResponseDraftJsonValidationError,
    );
  });

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects dangerous key %s',
    (key) => {
      const value = JSON.parse(`{"${key}":{"polluted":true}}`) as unknown;
      expect(() => validateAndCloneDraftJsonValue(value)).toThrow(
        ItemResponseDraftJsonValidationError,
      );
    },
  );

  it('rejects excessive depth, array size, object keys, and string length', () => {
    const tooDeep = [[[[[[true]]]]]];
    const tooManyArrayItems = Array.from({ length: 101 }, () => true);
    const tooManyObjectKeys = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`key${index}`, true]),
    );

    expect(() => validateAndCloneDraftJsonValue(tooDeep)).toThrow(
      ItemResponseDraftJsonValidationError,
    );
    expect(() => validateAndCloneDraftJsonValue(tooManyArrayItems)).toThrow(
      ItemResponseDraftJsonValidationError,
    );
    expect(() => validateAndCloneDraftJsonValue(tooManyObjectKeys)).toThrow(
      ItemResponseDraftJsonValidationError,
    );
    expect(() => validateAndCloneDraftJsonValue('x'.repeat(4001))).toThrow(
      ItemResponseDraftJsonValidationError,
    );
  });

  it('rejects a payload larger than 32768 serialized bytes', () => {
    const oversized = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        `field${index}`,
        '测'.repeat(4000),
      ]),
    );

    expect(() => validateAndCloneDraftJsonValue(oversized)).toThrow(
      ItemResponseDraftJsonValidationError,
    );
  });

  it('rejects accessor and symbol properties', () => {
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, 'answer', {
      enumerable: true,
      get: () => 'unsafe accessor',
    });
    const symbolKey = { answer: true };
    Object.defineProperty(symbolKey, Symbol('hidden'), { value: true });

    expect(() => validateAndCloneDraftJsonValue(accessor)).toThrow(
      ItemResponseDraftJsonValidationError,
    );
    expect(() => validateAndCloneDraftJsonValue(symbolKey)).toThrow(
      ItemResponseDraftJsonValidationError,
    );
  });
});
