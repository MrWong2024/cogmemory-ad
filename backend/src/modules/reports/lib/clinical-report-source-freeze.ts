import { Types } from 'mongoose';
import type { ClinicalReportSummary } from '../services/reports.service';
import type {
  ClinicalReportSourceFreezeActor,
  ClinicalReportSourceFreezeContext,
  ClinicalReportSourceFreezeMetadata,
  ClinicalReportSourceFreezeResourceCounts,
  ClinicalReportSourceFreezeScope,
} from '../types/clinical-report-source-freeze.types';
import {
  assertClinicalReportBaseComplete,
  cloneAndValidateClinicalReportMetadata,
  isClinicalReportA20GenerationMetadata,
  isPlainRecord,
  readClinicalReportConfirmation,
  readClinicalReportSubmission,
} from './clinical-report-review';
import { resolveExistingClinicalReportLock } from './clinical-report-lock';

export type ClinicalReportSourceFreezeRuleErrorCode =
  | 'CLINICAL_REPORT_INCOMPLETE'
  | 'CLINICAL_REPORT_METADATA_UNSUPPORTED'
  | 'CLINICAL_REPORT_VOIDED'
  | 'CLINICAL_REPORT_NOT_SOURCE_FREEZABLE'
  | 'CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID'
  | 'CLINICAL_REPORT_SOURCE_FREEZE_CONFLICT'
  | 'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE';

export class ClinicalReportSourceFreezeRuleError extends Error {
  constructor(readonly code: ClinicalReportSourceFreezeRuleErrorCode) {
    super(code);
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUNT_KEYS = [
  'scaleInstanceCount',
  'itemResponseCount',
  'scoreResultCount',
  'cognitiveDomainResultCount',
  'mediaEvidenceCount',
  'totalSourceCount',
] as const;
const SCOPE_KEYS = [
  'scaleInstanceIds',
  'itemResponseIds',
  'scoreResultIds',
  'cognitiveDomainResultIds',
  'mediaEvidenceIds',
] as const;

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function readText(
  value: unknown,
  minLength = 1,
  maxLength = Number.POSITIVE_INFINITY,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length >= minLength && normalized.length <= maxLength
    ? normalized
    : null;
}

function normalizeObjectId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!Types.ObjectId.isValid(normalized)) {
    return null;
  }
  return new Types.ObjectId(normalized).toString() === normalized
    ? normalized
    : null;
}

function normalizeIdArray(value: unknown, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID',
    );
  }
  const ids = value.map((entry) => normalizeObjectId(entry));
  if (ids.some((id) => id === null)) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID',
    );
  }
  const normalized = ids.filter((id): id is string => id !== null);
  if (new Set(normalized).size !== normalized.length) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID',
    );
  }
  return [...normalized].sort((left, right) => left.localeCompare(right));
}

function readScope(value: unknown): ClinicalReportSourceFreezeScope | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, SCOPE_KEYS)) {
    return null;
  }
  try {
    return {
      scaleInstanceIds: normalizeIdArray(value.scaleInstanceIds, false),
      itemResponseIds: normalizeIdArray(value.itemResponseIds, true),
      scoreResultIds: normalizeIdArray(value.scoreResultIds, false),
      cognitiveDomainResultIds: normalizeIdArray(
        value.cognitiveDomainResultIds,
        false,
      ),
      mediaEvidenceIds: normalizeIdArray(value.mediaEvidenceIds, true),
    };
  } catch {
    return null;
  }
}

function readCounts(
  value: unknown,
): ClinicalReportSourceFreezeResourceCounts | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, COUNT_KEYS)) {
    return null;
  }
  for (const key of COUNT_KEYS) {
    if (
      typeof value[key] !== 'number' ||
      !Number.isSafeInteger(value[key]) ||
      value[key] < 0
    ) {
      return null;
    }
  }
  const counts: ClinicalReportSourceFreezeResourceCounts = {
    scaleInstanceCount: value.scaleInstanceCount as number,
    itemResponseCount: value.itemResponseCount as number,
    scoreResultCount: value.scoreResultCount as number,
    cognitiveDomainResultCount: value.cognitiveDomainResultCount as number,
    mediaEvidenceCount: value.mediaEvidenceCount as number,
    totalSourceCount: value.totalSourceCount as number,
  };
  return counts.totalSourceCount ===
    counts.scaleInstanceCount +
      counts.itemResponseCount +
      counts.scoreResultCount +
      counts.cognitiveDomainResultCount +
      counts.mediaEvidenceCount
    ? counts
    : null;
}

function readActorFields(
  value: Record<string, unknown>,
  prefix: 'started' | 'completed',
): ClinicalReportSourceFreezeActor | null {
  const operatorId = normalizeObjectId(value[`${prefix}By`]);
  const operatorName = readText(value[`${prefix}ByName`]);
  const role = value[`${prefix}ByRole`];
  if (!operatorId || !operatorName || (role !== 'doctor' && role !== 'admin')) {
    return null;
  }
  return { operatorId, operatorName, operatorRole: role };
}

function cloneScope(
  scope: ClinicalReportSourceFreezeScope,
): ClinicalReportSourceFreezeScope {
  return {
    scaleInstanceIds: [...scope.scaleInstanceIds],
    itemResponseIds: [...scope.itemResponseIds],
    scoreResultIds: [...scope.scoreResultIds],
    cognitiveDomainResultIds: [...scope.cognitiveDomainResultIds],
    mediaEvidenceIds: [...scope.mediaEvidenceIds],
  };
}

function cloneCounts(
  counts: ClinicalReportSourceFreezeResourceCounts,
): ClinicalReportSourceFreezeResourceCounts {
  return { ...counts };
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function sameCounts(
  left: ClinicalReportSourceFreezeResourceCounts,
  right: ClinicalReportSourceFreezeResourceCounts,
): boolean {
  return COUNT_KEYS.every((key) => left[key] === right[key]);
}

function addCounts(
  left: ClinicalReportSourceFreezeResourceCounts,
  right: ClinicalReportSourceFreezeResourceCounts,
): ClinicalReportSourceFreezeResourceCounts {
  return {
    scaleInstanceCount: left.scaleInstanceCount + right.scaleInstanceCount,
    itemResponseCount: left.itemResponseCount + right.itemResponseCount,
    scoreResultCount: left.scoreResultCount + right.scoreResultCount,
    cognitiveDomainResultCount:
      left.cognitiveDomainResultCount + right.cognitiveDomainResultCount,
    mediaEvidenceCount: left.mediaEvidenceCount + right.mediaEvidenceCount,
    totalSourceCount: left.totalSourceCount + right.totalSourceCount,
  };
}

function assertSnapshotCoverage(report: ClinicalReportSummary): void {
  const expectedScaleIds = normalizeIdArray(
    report.primaryScaleInstanceIds,
    false,
  );
  const traceIds = normalizeIdArray(
    report.scaleTraces.map((trace) => trace.scaleInstanceId),
    false,
  );
  const expectedScoreIds = normalizeIdArray(report.scoreResultIds, false);
  const scoreIds = normalizeIdArray(
    report.scoreSnapshots.map((snapshot) => snapshot.scoreResultId),
    false,
  );
  const expectedDomainIds = normalizeIdArray(
    report.cognitiveDomainResultIds,
    false,
  );
  const domainIds = normalizeIdArray(
    [
      ...new Set(
        report.domainSnapshots.map(
          (snapshot) => snapshot.cognitiveDomainResultId,
        ),
      ),
    ],
    false,
  );
  const expectedEvidenceIds = normalizeIdArray(report.mediaEvidenceIds, true);
  const evidenceIds = normalizeIdArray(
    report.evidenceSnapshots.map((snapshot) => snapshot.mediaEvidenceId),
    true,
  );
  if (
    !sameIds(expectedScaleIds, traceIds) ||
    !sameIds(expectedScoreIds, scoreIds) ||
    !sameIds(expectedDomainIds, domainIds) ||
    !sameIds(expectedEvidenceIds, evidenceIds)
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID',
    );
  }
}

function assertGenerationScope(report: ClinicalReportSummary): void {
  if (
    !isPlainRecord(report.metadata) ||
    !isClinicalReportA20GenerationMetadata(report.metadata.a20Generation) ||
    !isPlainRecord(report.metadata.a20Generation)
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  const generation = report.metadata.a20Generation;
  const generatedScaleIds = normalizeIdArray(
    generation.primaryScaleInstanceIds,
    false,
  );
  const generatedScoreIds = normalizeIdArray(generation.scoreResultIds, false);
  const generatedDomainIds = normalizeIdArray(
    generation.cognitiveDomainResultIds,
    false,
  );
  if (
    !sameIds(
      generatedScaleIds,
      normalizeIdArray(report.primaryScaleInstanceIds, false),
    ) ||
    !sameIds(
      generatedScoreIds,
      normalizeIdArray(report.scoreResultIds, false),
    ) ||
    !sameIds(
      generatedDomainIds,
      normalizeIdArray(report.cognitiveDomainResultIds, false),
    ) ||
    generation.mediaEvidenceCount !== report.mediaEvidenceIds.length
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_SCOPE_INVALID',
    );
  }
}

export function buildClinicalReportSourceFreezeCounts(
  scope: ClinicalReportSourceFreezeScope,
): ClinicalReportSourceFreezeResourceCounts {
  const counts = {
    scaleInstanceCount: scope.scaleInstanceIds.length,
    itemResponseCount: scope.itemResponseIds.length,
    scoreResultCount: scope.scoreResultIds.length,
    cognitiveDomainResultCount: scope.cognitiveDomainResultIds.length,
    mediaEvidenceCount: scope.mediaEvidenceIds.length,
    totalSourceCount: 0,
  };
  counts.totalSourceCount =
    counts.scaleInstanceCount +
    counts.itemResponseCount +
    counts.scoreResultCount +
    counts.cognitiveDomainResultCount +
    counts.mediaEvidenceCount;
  return counts;
}

export function buildClinicalReportSourceFreezeScope(
  report: ClinicalReportSummary,
  itemResponseIds: readonly string[],
): ClinicalReportSourceFreezeScope {
  return {
    scaleInstanceIds: normalizeIdArray(report.primaryScaleInstanceIds, false),
    itemResponseIds: normalizeIdArray([...itemResponseIds], true),
    scoreResultIds: normalizeIdArray(report.scoreResultIds, false),
    cognitiveDomainResultIds: normalizeIdArray(
      report.cognitiveDomainResultIds,
      false,
    ),
    mediaEvidenceIds: normalizeIdArray(report.mediaEvidenceIds, true),
  };
}

export function evaluateClinicalReportSourceFreezeReadiness(
  context: ClinicalReportSourceFreezeContext,
): void {
  const report = context.report;
  if (report.status === 'voided') {
    throw new ClinicalReportSourceFreezeRuleError('CLINICAL_REPORT_VOIDED');
  }
  if (
    report.status !== 'confirmed' ||
    report.source !== 'mixed' ||
    report.qualityStatus !== 'passed' ||
    report.lockedAt === null ||
    report.lockedBy === null ||
    report.archivedAt !== null ||
    report.archivedBy !== null ||
    report.voidedAt !== null ||
    report.voidedBy !== null ||
    report.correctionRecords.length !== 0
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_NOT_SOURCE_FREEZABLE',
    );
  }
  try {
    assertClinicalReportBaseComplete(report);
  } catch {
    throw new ClinicalReportSourceFreezeRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  if (!isPlainRecord(report.metadata)) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  try {
    cloneAndValidateClinicalReportMetadata(report);
  } catch {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  if (
    !readClinicalReportSubmission(report.metadata) ||
    !readClinicalReportConfirmation(report.metadata)
  ) {
    throw new ClinicalReportSourceFreezeRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  try {
    const lock = resolveExistingClinicalReportLock(report);
    if (!lock || lock.lockId === null) {
      throw new Error('missing controlled lock audit');
    }
  } catch {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  if (report.metadata.a23SourceFreeze !== undefined) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
    );
  }
  assertGenerationScope(report);
  assertSnapshotCoverage(report);
  if (
    !report.updatedAt ||
    report.updatedAt.getTime() !== context.expectedUpdatedAt.getTime()
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_CONFLICT',
    );
  }
}

export function compareSourceFreezeScope(
  left: ClinicalReportSourceFreezeScope,
  right: ClinicalReportSourceFreezeScope,
): boolean {
  return SCOPE_KEYS.every((key) => sameIds(left[key], right[key]));
}

export function buildSourceFreezeStartMetadata(input: {
  report: ClinicalReportSummary;
  freezeId: string;
  startedAt: Date;
  sourceLockedAt: Date;
  actor: ClinicalReportSourceFreezeActor;
  freezeNote: string;
  scope: ClinicalReportSourceFreezeScope;
  previouslyFrozenCounts: ClinicalReportSourceFreezeResourceCounts;
}): {
  metadata: Record<string, unknown>;
  audit: ClinicalReportSourceFreezeMetadata;
} {
  let metadata: Record<string, unknown>;
  try {
    metadata = cloneAndValidateClinicalReportMetadata(input.report);
  } catch {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  if (
    metadata.a23SourceFreeze !== undefined ||
    !UUID_PATTERN.test(input.freezeId) ||
    !Number.isFinite(input.startedAt.getTime()) ||
    !Number.isFinite(input.sourceLockedAt.getTime()) ||
    !readText(input.freezeNote, 3, 2000)
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
    );
  }
  const scope = cloneScope(input.scope);
  const expectedCounts = buildClinicalReportSourceFreezeCounts(scope);
  const audit: ClinicalReportSourceFreezeMetadata = {
    version: 1,
    state: 'in_progress',
    freezeId: input.freezeId,
    startedAt: new Date(input.startedAt.getTime()),
    sourceLockedAt: new Date(input.sourceLockedAt.getTime()),
    startedBy: input.actor.operatorId,
    startedByName: input.actor.operatorName,
    startedByRole: input.actor.operatorRole,
    freezeNote: input.freezeNote.trim(),
    scope,
    expectedCounts,
    previouslyFrozenCounts: cloneCounts(input.previouslyFrozenCounts),
  };
  return { metadata: { ...metadata, a23SourceFreeze: audit }, audit };
}

export function buildSourceFreezeCompletionMetadata(input: {
  report: ClinicalReportSummary;
  freezeId: string;
  completedAt: Date;
  actor: ClinicalReportSourceFreezeActor;
  completedCounts: ClinicalReportSourceFreezeResourceCounts;
  newlyFrozenCounts: ClinicalReportSourceFreezeResourceCounts;
  previouslyFrozenCounts: ClinicalReportSourceFreezeResourceCounts;
}): {
  metadata: Record<string, unknown>;
  audit: ClinicalReportSourceFreezeMetadata;
} {
  const existing = resolveExistingSourceFreeze(input.report);
  if (
    !existing ||
    existing.state !== 'in_progress' ||
    existing.freezeId !== input.freezeId ||
    !Number.isFinite(input.completedAt.getTime()) ||
    !sameCounts(existing.expectedCounts, input.completedCounts) ||
    !sameCounts(
      addCounts(input.newlyFrozenCounts, input.previouslyFrozenCounts),
      existing.expectedCounts,
    ) ||
    !sameCounts(existing.previouslyFrozenCounts, input.previouslyFrozenCounts)
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
    );
  }
  if (!isPlainRecord(input.report.metadata)) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  const audit: ClinicalReportSourceFreezeMetadata = {
    ...existing,
    state: 'completed',
    scope: cloneScope(existing.scope),
    expectedCounts: cloneCounts(existing.expectedCounts),
    completedCounts: cloneCounts(input.completedCounts),
    newlyFrozenCounts: cloneCounts(input.newlyFrozenCounts),
    previouslyFrozenCounts: cloneCounts(input.previouslyFrozenCounts),
    completedAt: new Date(input.completedAt.getTime()),
    completedBy: input.actor.operatorId,
    completedByName: input.actor.operatorName,
    completedByRole: input.actor.operatorRole,
  };
  return {
    metadata: { ...input.report.metadata, a23SourceFreeze: audit },
    audit,
  };
}

export function resolveExistingSourceFreeze(
  report: ClinicalReportSummary,
): ClinicalReportSourceFreezeMetadata | null {
  if (report.metadata === null) {
    return null;
  }
  if (!isPlainRecord(report.metadata)) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  if (report.metadata.a23SourceFreeze === undefined) {
    return null;
  }
  const value = report.metadata.a23SourceFreeze;
  const allowedKeys = [
    'version',
    'state',
    'freezeId',
    'startedAt',
    'sourceLockedAt',
    'startedBy',
    'startedByName',
    'startedByRole',
    'freezeNote',
    'scope',
    'expectedCounts',
    'completedCounts',
    'newlyFrozenCounts',
    'previouslyFrozenCounts',
    'completedAt',
    'completedBy',
    'completedByName',
    'completedByRole',
  ];
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, allowedKeys) ||
    value.version !== 1 ||
    (value.state !== 'in_progress' && value.state !== 'completed')
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
    );
  }
  const freezeId = readText(value.freezeId);
  const startedAt = readDate(value.startedAt);
  const sourceLockedAt = readDate(value.sourceLockedAt);
  const startedBy = readActorFields(value, 'started');
  const freezeNote = readText(value.freezeNote, 3, 2000);
  const scope = readScope(value.scope);
  const expectedCounts = readCounts(value.expectedCounts);
  const previouslyFrozenCounts = readCounts(value.previouslyFrozenCounts);
  if (
    !freezeId ||
    !UUID_PATTERN.test(freezeId) ||
    !startedAt ||
    !sourceLockedAt ||
    !startedBy ||
    !freezeNote ||
    !scope ||
    !expectedCounts ||
    !previouslyFrozenCounts ||
    !sameCounts(expectedCounts, buildClinicalReportSourceFreezeCounts(scope))
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
    );
  }
  const reportScope = buildClinicalReportSourceFreezeScope(
    report,
    scope.itemResponseIds,
  );
  if (!compareSourceFreezeScope(scope, reportScope)) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
    );
  }
  const base: ClinicalReportSourceFreezeMetadata = {
    version: 1,
    state: value.state,
    freezeId,
    startedAt,
    sourceLockedAt,
    startedBy: startedBy.operatorId,
    startedByName: startedBy.operatorName,
    startedByRole: startedBy.operatorRole,
    freezeNote,
    scope,
    expectedCounts,
    previouslyFrozenCounts,
  };
  if (value.state === 'in_progress') {
    if (
      value.completedCounts !== undefined ||
      value.newlyFrozenCounts !== undefined ||
      value.completedAt !== undefined ||
      value.completedBy !== undefined ||
      value.completedByName !== undefined ||
      value.completedByRole !== undefined
    ) {
      throw new ClinicalReportSourceFreezeRuleError(
        'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
      );
    }
    return base;
  }
  const completedCounts = readCounts(value.completedCounts);
  const newlyFrozenCounts = readCounts(value.newlyFrozenCounts);
  const completedAt = readDate(value.completedAt);
  const completedBy = readActorFields(value, 'completed');
  if (
    !completedCounts ||
    !newlyFrozenCounts ||
    !completedAt ||
    !completedBy ||
    !sameCounts(completedCounts, expectedCounts) ||
    !sameCounts(
      addCounts(newlyFrozenCounts, previouslyFrozenCounts),
      expectedCounts,
    )
  ) {
    throw new ClinicalReportSourceFreezeRuleError(
      'CLINICAL_REPORT_SOURCE_FREEZE_AUDIT_UNAVAILABLE',
    );
  }
  return {
    ...base,
    state: 'completed',
    completedCounts,
    newlyFrozenCounts,
    completedAt,
    completedBy: completedBy.operatorId,
    completedByName: completedBy.operatorName,
    completedByRole: completedBy.operatorRole,
  };
}
