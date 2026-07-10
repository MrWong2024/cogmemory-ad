export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function hasMeaningfulJsonValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return isPlainRecord(value) && Object.keys(value).length > 0;
}

export type MeaningfulItemResponseAnswerInput = {
  rawResponse: unknown;
  structuredResponse: Record<string, unknown> | null;
  responseText?: string;
  isMissing: boolean;
  stepValues: unknown[];
  promptValues: unknown[];
};

export function hasMeaningfulItemResponseAnswer(
  input: MeaningfulItemResponseAnswerInput,
): boolean {
  return (
    input.isMissing ||
    hasMeaningfulJsonValue(input.rawResponse) ||
    (isPlainRecord(input.structuredResponse) &&
      Object.keys(input.structuredResponse).length > 0) ||
    Boolean(input.responseText?.trim()) ||
    input.stepValues.some(hasMeaningfulJsonValue) ||
    input.promptValues.some(hasMeaningfulJsonValue)
  );
}
