import { isPlainRecord } from './item-response-answer-content';

export type StructuredManualField = {
  code: string;
  label: string;
  maxScore: number;
  referenceAnswer?: string | number | boolean;
};

type StructuredManualSubItemResponse = {
  responseText?: string;
  isCorrect?: boolean | null;
};

const STRUCTURED_RESPONSE_ROOT_KEYS = new Set(['subItems']);
const STRUCTURED_SUB_ITEM_KEYS = new Set(['responseText', 'isCorrect']);

function hasOwn(
  record: Record<string, unknown>,
  propertyName: string,
): boolean {
  return Object.getOwnPropertyDescriptor(record, propertyName) !== undefined;
}

function hasOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: Set<string>,
): boolean {
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function readCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const code = value.trim();
  return code || null;
}

function readReferenceAnswer(
  value: unknown,
): string | number | boolean | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }

  return undefined;
}

function parseSubItems(value: unknown): StructuredManualField[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const fields: StructuredManualField[] = [];
  const normalizedCodes = new Set<string>();

  for (const entry of value) {
    if (!isPlainRecord(entry)) {
      return null;
    }

    const code = readCode(entry.code);
    const normalizedCode = code?.toLowerCase();
    const maxScore = entry.maxScore;
    const referenceAnswer = readReferenceAnswer(entry.expected);
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    const fallbackLabel =
      referenceAnswer === undefined ? '' : String(referenceAnswer).trim();
    const label = title || fallbackLabel;

    if (
      !code ||
      !normalizedCode ||
      normalizedCodes.has(normalizedCode) ||
      typeof maxScore !== 'number' ||
      !Number.isFinite(maxScore) ||
      maxScore < 0 ||
      !label
    ) {
      return null;
    }

    normalizedCodes.add(normalizedCode);
    fields.push({
      code,
      label,
      maxScore,
      ...(referenceAnswer === undefined ? {} : { referenceAnswer }),
    });
  }

  return fields;
}

function parseWords(value: unknown): StructuredManualField[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const fields: StructuredManualField[] = [];
  const normalizedCodes = new Set<string>();

  for (const entry of value) {
    if (!isPlainRecord(entry)) {
      return null;
    }

    const code = readCode(entry.code);
    const normalizedCode = code?.toLowerCase();
    const text = typeof entry.text === 'string' ? entry.text.trim() : '';

    if (
      !code ||
      !normalizedCode ||
      normalizedCodes.has(normalizedCode) ||
      !text
    ) {
      return null;
    }

    normalizedCodes.add(normalizedCode);
    fields.push({ code, label: text, maxScore: 1, referenceAnswer: text });
  }

  return fields;
}

export function parseStructuredManualFields(
  scoringRule: unknown,
): StructuredManualField[] | null {
  if (!isPlainRecord(scoringRule) || scoringRule.mode !== 'structured_manual') {
    return null;
  }

  if (hasOwn(scoringRule, 'subItems')) {
    return parseSubItems(scoringRule.subItems);
  }

  if (hasOwn(scoringRule, 'words')) {
    return parseWords(scoringRule.words);
  }

  return null;
}

export function readStructuredManualFieldsFromSnapshot(
  itemConfigSnapshot: unknown,
): StructuredManualField[] | null {
  return isPlainRecord(itemConfigSnapshot)
    ? parseStructuredManualFields(itemConfigSnapshot.scoringRule)
    : null;
}

export function resolveStructuredManualFields(
  itemConfigSnapshot: unknown,
  scaleVersionScoringRule: unknown,
): StructuredManualField[] | null {
  if (
    isPlainRecord(itemConfigSnapshot) &&
    hasOwn(itemConfigSnapshot, 'scoringRule')
  ) {
    return parseStructuredManualFields(itemConfigSnapshot.scoringRule);
  }

  return parseStructuredManualFields(scaleVersionScoringRule);
}

export function isValidStructuredManualDraft(
  structuredResponse: unknown,
  fields: StructuredManualField[],
): boolean {
  if (
    fields.length === 0 ||
    !isPlainRecord(structuredResponse) ||
    !hasOnlyKeys(structuredResponse, STRUCTURED_RESPONSE_ROOT_KEYS) ||
    !hasOwn(structuredResponse, 'subItems') ||
    !isPlainRecord(structuredResponse.subItems)
  ) {
    return false;
  }

  const configuredCodes = new Set(fields.map((field) => field.code));

  for (const [code, value] of Object.entries(structuredResponse.subItems)) {
    if (
      !configuredCodes.has(code) ||
      !isPlainRecord(value) ||
      !hasOnlyKeys(value, STRUCTURED_SUB_ITEM_KEYS)
    ) {
      return false;
    }

    if (
      hasOwn(value, 'responseText') &&
      typeof value.responseText !== 'string'
    ) {
      return false;
    }

    if (
      hasOwn(value, 'isCorrect') &&
      value.isCorrect !== null &&
      typeof value.isCorrect !== 'boolean'
    ) {
      return false;
    }
  }

  return true;
}

export function isCompleteStructuredManualResponse(
  structuredResponse: unknown,
  fields: StructuredManualField[],
): boolean {
  if (!isValidStructuredManualDraft(structuredResponse, fields)) {
    return false;
  }

  const root = structuredResponse as Record<string, unknown>;
  const subItems = root.subItems as Record<string, unknown>;
  if (Object.keys(subItems).length !== fields.length) {
    return false;
  }

  return fields.every((field) => {
    const value = subItems[field.code];
    if (!isPlainRecord(value)) {
      return false;
    }

    return (
      typeof value.responseText === 'string' &&
      Boolean(value.responseText.trim()) &&
      typeof value.isCorrect === 'boolean'
    );
  });
}

export function calculateStructuredManualScore(
  structuredResponse: unknown,
  fields: StructuredManualField[],
): number | null {
  if (!isCompleteStructuredManualResponse(structuredResponse, fields)) {
    return null;
  }

  const root = structuredResponse as Record<string, unknown>;
  const subItems = root.subItems as Record<
    string,
    StructuredManualSubItemResponse
  >;

  return fields.reduce(
    (score, field) =>
      subItems[field.code]?.isCorrect === true ? score + field.maxScore : score,
    0,
  );
}
