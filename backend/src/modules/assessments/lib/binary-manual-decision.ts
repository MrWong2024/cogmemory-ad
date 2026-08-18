import { isPlainRecord } from './item-response-answer-content';

const BINARY_MANUAL_MODES = new Set([
  'manual_exact_match',
  'manual_observation',
  'manual_drawing_review',
]);

const BINARY_MANUAL_ROOT_KEYS = new Set(['binaryManualDecision']);
const BINARY_MANUAL_DECISION_KEYS = new Set(['isCorrect']);

export type BinaryManualDecisionConfig = {
  incorrectScore: 0;
  correctScore: 1;
};

export const BINARY_MANUAL_DECISION_CONFIG: BinaryManualDecisionConfig = {
  incorrectScore: 0,
  correctScore: 1,
};

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

export function isBinaryManualDecisionEligible(
  scoringRule: unknown,
  scoreRange: unknown,
): boolean {
  return (
    isPlainRecord(scoringRule) &&
    typeof scoringRule.mode === 'string' &&
    BINARY_MANUAL_MODES.has(scoringRule.mode) &&
    isPlainRecord(scoreRange) &&
    scoreRange.min === 0 &&
    scoreRange.max === 1 &&
    scoreRange.step === 1
  );
}

export function readBinaryManualDecisionConfigFromSnapshot(
  itemConfigSnapshot: unknown,
): BinaryManualDecisionConfig | null {
  return isPlainRecord(itemConfigSnapshot) &&
    isBinaryManualDecisionEligible(
      itemConfigSnapshot.scoringRule,
      itemConfigSnapshot.scoreRange,
    )
    ? { ...BINARY_MANUAL_DECISION_CONFIG }
    : null;
}

export function resolveBinaryManualDecisionConfig(
  itemConfigSnapshot: unknown,
  scaleVersionScoringRule: unknown,
  scaleVersionScoreRange: unknown,
): BinaryManualDecisionConfig | null {
  const snapshot = isPlainRecord(itemConfigSnapshot)
    ? itemConfigSnapshot
    : null;
  const scoringRule =
    snapshot && hasOwn(snapshot, 'scoringRule')
      ? snapshot.scoringRule
      : scaleVersionScoringRule;
  const scoreRange =
    snapshot && hasOwn(snapshot, 'scoreRange')
      ? snapshot.scoreRange
      : scaleVersionScoreRange;

  return isBinaryManualDecisionEligible(scoringRule, scoreRange)
    ? { ...BINARY_MANUAL_DECISION_CONFIG }
    : null;
}

export function isValidBinaryManualDecisionDraft(
  structuredResponse: unknown,
): boolean {
  if (
    !isPlainRecord(structuredResponse) ||
    !hasOnlyKeys(structuredResponse, BINARY_MANUAL_ROOT_KEYS) ||
    !hasOwn(structuredResponse, 'binaryManualDecision') ||
    !isPlainRecord(structuredResponse.binaryManualDecision) ||
    !hasOnlyKeys(
      structuredResponse.binaryManualDecision,
      BINARY_MANUAL_DECISION_KEYS,
    ) ||
    !hasOwn(structuredResponse.binaryManualDecision, 'isCorrect')
  ) {
    return false;
  }

  const decision = structuredResponse.binaryManualDecision.isCorrect;
  return decision === null || typeof decision === 'boolean';
}

export function readCompleteBinaryManualDecision(
  structuredResponse: unknown,
): boolean | null {
  if (!isValidBinaryManualDecisionDraft(structuredResponse)) {
    return null;
  }

  const decision = (
    structuredResponse as {
      binaryManualDecision: { isCorrect: boolean | null };
    }
  ).binaryManualDecision.isCorrect;

  return typeof decision === 'boolean' ? decision : null;
}

export function calculateBinaryManualDecisionScore(
  structuredResponse: unknown,
): number | null {
  const decision = readCompleteBinaryManualDecision(structuredResponse);
  return decision === null
    ? null
    : decision
      ? BINARY_MANUAL_DECISION_CONFIG.correctScore
      : BINARY_MANUAL_DECISION_CONFIG.incorrectScore;
}
