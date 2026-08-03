import { Types } from 'mongoose';
import {
  ASSESSMENT_OPERATOR_ROLES,
  type AssessmentOperatorRole,
} from '../schemas/assessment-visit.schema';

export const SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION = 1 as const;
export const SCALE_INSTANCE_SUBMISSION_BARRIER_STATES = [
  'fencing',
  'fenced',
  'releasing',
  'completed',
] as const;

export type ScaleInstanceSubmissionBarrierState =
  (typeof SCALE_INSTANCE_SUBMISSION_BARRIER_STATES)[number];

export type NormalizedScaleInstanceSubmissionWriteBarrier = {
  version: typeof SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION;
  barrierId: string;
  state: ScaleInstanceSubmissionBarrierState;
  startedAt: Date;
  fencedAt: Date | null;
  releaseStartedAt: Date | null;
  completedAt: Date | null;
  startedBy: string;
  startedByName: string;
  startedByRole: AssessmentOperatorRole;
  itemResponseIds: string[];
  expectedItemCount: number;
};

export type NormalizedItemResponseSubmissionWriteBarrier = {
  version: typeof SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION;
  barrierId: string;
  startedAt: Date;
};

export type SubmissionWriteBarrierParseResult<T> =
  | { kind: 'open'; value: null }
  | { kind: 'invalid'; value: null }
  | { kind: 'valid'; value: T };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function readNullableDate(
  value: Record<string, unknown>,
  propertyName: string,
): Date | null | undefined {
  if (!(propertyName in value)) {
    return undefined;
  }

  const propertyValue = value[propertyName];
  if (propertyValue === null) {
    return null;
  }

  return isValidDate(propertyValue)
    ? new Date(propertyValue.getTime())
    : undefined;
}

function normalizeObjectId(value: unknown): string | null {
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
    return null;
  }

  return new Types.ObjectId(value).toString();
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

function isOperatorRole(value: unknown): value is AssessmentOperatorRole {
  return (
    typeof value === 'string' &&
    (ASSESSMENT_OPERATOR_ROLES as readonly string[]).includes(value)
  );
}

function datesAreOrdered(
  startedAt: Date,
  fencedAt: Date | null,
  releaseStartedAt: Date | null,
  completedAt: Date | null,
): boolean {
  if (fencedAt && fencedAt.getTime() < startedAt.getTime()) {
    return false;
  }
  if (releaseStartedAt && releaseStartedAt.getTime() < startedAt.getTime()) {
    return false;
  }
  if (
    completedAt &&
    (completedAt.getTime() < startedAt.getTime() ||
      (fencedAt && completedAt.getTime() < fencedAt.getTime()))
  ) {
    return false;
  }
  return true;
}

export function buildStableItemResponseScope(
  itemResponseIds: readonly string[],
): string[] | null {
  const normalized: string[] = [];

  for (const itemResponseId of itemResponseIds) {
    const objectId = normalizeObjectId(itemResponseId);
    if (!objectId) {
      return null;
    }
    normalized.push(objectId);
  }

  return [...new Set(normalized)].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function itemResponseScopesEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const normalizedLeft = buildStableItemResponseScope(left);
  const normalizedRight = buildStableItemResponseScope(right);

  return (
    normalizedLeft !== null &&
    normalizedRight !== null &&
    normalizedLeft.length === left.length &&
    normalizedRight.length === right.length &&
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

export function normalizeScaleInstanceSubmissionWriteBarrier(
  value: unknown,
): SubmissionWriteBarrierParseResult<NormalizedScaleInstanceSubmissionWriteBarrier> {
  if (value === null || value === undefined) {
    return { kind: 'open', value: null };
  }
  if (!isRecord(value)) {
    return { kind: 'invalid', value: null };
  }

  const barrierId = isUuid(value.barrierId) ? value.barrierId.trim() : null;
  const state = SCALE_INSTANCE_SUBMISSION_BARRIER_STATES.find(
    (candidate) => candidate === value.state,
  );
  const startedAt = isValidDate(value.startedAt)
    ? new Date(value.startedAt.getTime())
    : null;
  const fencedAt = readNullableDate(value, 'fencedAt');
  const releaseStartedAt = readNullableDate(value, 'releaseStartedAt');
  const completedAt = readNullableDate(value, 'completedAt');
  const startedBy = normalizeObjectId(value.startedBy);
  const startedByName =
    typeof value.startedByName === 'string' && value.startedByName.trim()
      ? value.startedByName.trim()
      : null;
  const itemResponseIds = Array.isArray(value.itemResponseIds)
    ? value.itemResponseIds
        .map((itemResponseId) => normalizeObjectId(itemResponseId))
        .filter((itemResponseId): itemResponseId is string =>
          Boolean(itemResponseId),
        )
    : null;
  const stableScope = itemResponseIds
    ? buildStableItemResponseScope(itemResponseIds)
    : null;
  const expectedItemCount = value.expectedItemCount;

  if (
    value.version !== SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION ||
    !barrierId ||
    !state ||
    !startedAt ||
    fencedAt === undefined ||
    releaseStartedAt === undefined ||
    completedAt === undefined ||
    !startedBy ||
    !startedByName ||
    !isOperatorRole(value.startedByRole) ||
    !itemResponseIds ||
    !Array.isArray(value.itemResponseIds) ||
    itemResponseIds.length !== value.itemResponseIds.length ||
    !stableScope ||
    stableScope.length !== itemResponseIds.length ||
    !stableScope.every(
      (itemResponseId, index) => itemResponseId === itemResponseIds[index],
    ) ||
    !Number.isSafeInteger(expectedItemCount) ||
    Number(expectedItemCount) < 0 ||
    Number(expectedItemCount) !== stableScope.length ||
    !datesAreOrdered(startedAt, fencedAt, releaseStartedAt, completedAt)
  ) {
    return { kind: 'invalid', value: null };
  }

  const stateIsValid =
    (state === 'fencing' &&
      fencedAt === null &&
      releaseStartedAt === null &&
      completedAt === null) ||
    (state === 'fenced' &&
      fencedAt !== null &&
      releaseStartedAt === null &&
      completedAt === null) ||
    (state === 'releasing' &&
      releaseStartedAt !== null &&
      completedAt === null) ||
    (state === 'completed' &&
      fencedAt !== null &&
      releaseStartedAt === null &&
      completedAt !== null);

  if (!stateIsValid) {
    return { kind: 'invalid', value: null };
  }

  return {
    kind: 'valid',
    value: {
      version: SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
      barrierId,
      state,
      startedAt,
      fencedAt,
      releaseStartedAt,
      completedAt,
      startedBy,
      startedByName,
      startedByRole: value.startedByRole,
      itemResponseIds: stableScope,
      expectedItemCount: Number(expectedItemCount),
    },
  };
}

export function normalizeItemResponseSubmissionWriteBarrier(
  value: unknown,
): SubmissionWriteBarrierParseResult<NormalizedItemResponseSubmissionWriteBarrier> {
  if (value === null || value === undefined) {
    return { kind: 'open', value: null };
  }
  if (!isRecord(value)) {
    return { kind: 'invalid', value: null };
  }

  if (
    value.version !== SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION ||
    !isUuid(value.barrierId) ||
    !isValidDate(value.startedAt)
  ) {
    return { kind: 'invalid', value: null };
  }

  return {
    kind: 'valid',
    value: {
      version: SCALE_INSTANCE_SUBMISSION_BARRIER_VERSION,
      barrierId: value.barrierId.trim(),
      startedAt: new Date(value.startedAt.getTime()),
    },
  };
}

export function scaleInstanceSubmissionBarrierBlocksWrites(
  value: unknown,
): boolean {
  return normalizeScaleInstanceSubmissionWriteBarrier(value).kind !== 'open';
}

export function itemResponseSubmissionBarrierBlocksWrites(
  value: unknown,
): boolean {
  return normalizeItemResponseSubmissionWriteBarrier(value).kind !== 'open';
}
