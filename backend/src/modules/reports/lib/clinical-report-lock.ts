import type { ClinicalReportSummary } from '../services/reports.service';
import type {
  ClinicalReportLockActor,
  ClinicalReportLockContext,
  ClinicalReportLockMetadata,
  ClinicalReportLockMutation,
  ExistingClinicalReportLockResolution,
} from '../types/clinical-report-lock.types';
import {
  assertClinicalReportBaseComplete,
  cloneAndValidateClinicalReportMetadata,
  isClinicalReportA20GenerationMetadata,
  isPlainRecord,
  readClinicalReportConfirmation,
  readClinicalReportSubmission,
} from './clinical-report-review';

export type ClinicalReportLockRuleErrorCode =
  | 'CLINICAL_REPORT_INCOMPLETE'
  | 'CLINICAL_REPORT_METADATA_UNSUPPORTED'
  | 'CLINICAL_REPORT_VOIDED'
  | 'CLINICAL_REPORT_NOT_LOCKABLE'
  | 'CLINICAL_REPORT_LOCK_CONFLICT'
  | 'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE';

export class ClinicalReportLockRuleError extends Error {
  constructor(readonly code: ClinicalReportLockRuleErrorCode) {
    super(code);
  }
}

const IDEMPOTENT_LOCK_STATUSES = new Set([
  'confirmed',
  'archived',
  'corrected',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function readText(value: unknown, minLength = 1, maxLength = Infinity) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length >= minLength && normalized.length <= maxLength
    ? normalized
    : null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function sameDate(left: Date | null, right: Date): boolean {
  return left !== null && left.getTime() === right.getTime();
}

function readLockMetadata(value: unknown): ClinicalReportLockMetadata | null {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, [
      'version',
      'lockId',
      'lockedAt',
      'lockedBy',
      'lockedByName',
      'lockedByRole',
      'lockNote',
    ]) ||
    value.version !== 1
  ) {
    return null;
  }
  const lockId = readText(value.lockId);
  const lockedAt = readDate(value.lockedAt);
  const lockedBy = readText(value.lockedBy);
  const lockedByName = readText(value.lockedByName);
  const lockedByRole =
    value.lockedByRole === 'doctor' || value.lockedByRole === 'admin'
      ? value.lockedByRole
      : null;
  const lockNote = readText(value.lockNote, 3, 2000);
  if (
    !lockId ||
    !UUID_PATTERN.test(lockId) ||
    !lockedAt ||
    !lockedBy ||
    !lockedByName ||
    !lockedByRole ||
    !lockNote
  ) {
    return null;
  }
  return {
    version: 1,
    lockId,
    lockedAt,
    lockedBy,
    lockedByName,
    lockedByRole,
    lockNote,
  };
}

function assertConfirmationComplete(report: ClinicalReportSummary): void {
  const confirmation = report.confirmation;
  const audit = readClinicalReportConfirmation(report.metadata);
  if (
    !confirmation ||
    !confirmation.confirmedAt ||
    !confirmation.confirmedBy ||
    !readText(confirmation.confirmedByName) ||
    (confirmation.confirmedByRole !== 'doctor' &&
      confirmation.confirmedByRole !== 'admin') ||
    !readText(confirmation.confirmationNote, 3, 2000) ||
    !audit
  ) {
    throw new ClinicalReportLockRuleError('CLINICAL_REPORT_NOT_LOCKABLE');
  }
  if (
    audit.confirmedAt.getTime() !== confirmation.confirmedAt.getTime() ||
    audit.confirmedBy !== confirmation.confirmedBy ||
    audit.confirmedByName !== confirmation.confirmedByName?.trim() ||
    audit.confirmedByRole !== confirmation.confirmedByRole ||
    audit.confirmationNote !== confirmation.confirmationNote?.trim()
  ) {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
  }
}

function cloneSupportedMetadata(
  report: ClinicalReportSummary,
): Record<string, unknown> {
  if (!isPlainRecord(report.metadata)) {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  if (report.metadata.a20Generation === undefined) {
    throw new ClinicalReportLockRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  if (!isClinicalReportA20GenerationMetadata(report.metadata.a20Generation)) {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  try {
    return cloneAndValidateClinicalReportMetadata(report);
  } catch {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
}

export function evaluateClinicalReportLockReadiness(
  context: ClinicalReportLockContext,
): void {
  const report = context.report;
  if (report.status === 'voided') {
    throw new ClinicalReportLockRuleError('CLINICAL_REPORT_VOIDED');
  }
  if (
    report.status !== 'confirmed' ||
    report.source !== 'mixed' ||
    report.qualityStatus !== 'passed' ||
    report.lockedAt !== null ||
    report.lockedBy !== null ||
    report.archivedAt !== null ||
    report.archivedBy !== null ||
    report.voidedAt !== null ||
    report.voidedBy !== null ||
    report.correctionRecords.length !== 0
  ) {
    throw new ClinicalReportLockRuleError('CLINICAL_REPORT_NOT_LOCKABLE');
  }
  try {
    assertClinicalReportBaseComplete(report);
  } catch {
    throw new ClinicalReportLockRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  const metadata = cloneSupportedMetadata(report);
  if (
    !readClinicalReportSubmission(metadata) ||
    !readClinicalReportConfirmation(metadata)
  ) {
    throw new ClinicalReportLockRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  if (metadata.a22Lock !== undefined) {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
  }
  assertConfirmationComplete(report);
  if (!readText(report.narrative?.doctorOpinion, 3, 4000)) {
    throw new ClinicalReportLockRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  if (!sameDate(report.updatedAt, context.expectedUpdatedAt)) {
    throw new ClinicalReportLockRuleError('CLINICAL_REPORT_LOCK_CONFLICT');
  }
}

export function buildClinicalReportLockMetadata(input: {
  report: ClinicalReportSummary;
  lockId: string;
  lockedAt: Date;
  actor: ClinicalReportLockActor;
  lockNote: string;
}): ClinicalReportLockMutation {
  const metadata = cloneSupportedMetadata(input.report);
  if (metadata.a22Lock !== undefined) {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
  }
  const audit: ClinicalReportLockMetadata = {
    version: 1,
    lockId: input.lockId,
    lockedAt: new Date(input.lockedAt.getTime()),
    lockedBy: input.actor.operatorId,
    lockedByName: input.actor.operatorName,
    lockedByRole: input.actor.operatorRole,
    lockNote: input.lockNote.trim(),
  };
  if (!readLockMetadata(audit)) {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
  }
  return {
    lockedAt: new Date(audit.lockedAt.getTime()),
    lockedBy: audit.lockedBy,
    metadata: { ...metadata, a22Lock: audit },
    audit,
  };
}

export function resolveExistingClinicalReportLock(
  report: ClinicalReportSummary,
): ExistingClinicalReportLockResolution | null {
  if (report.lockedAt === null && report.lockedBy === null) {
    if (
      isPlainRecord(report.metadata) &&
      report.metadata.a22Lock !== undefined
    ) {
      throw new ClinicalReportLockRuleError(
        'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
      );
    }
    return null;
  }
  if (
    report.lockedAt === null ||
    report.lockedBy === null ||
    !IDEMPOTENT_LOCK_STATUSES.has(report.status)
  ) {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
  }
  if (report.metadata === null) {
    return {
      lockId: null,
      lockedAt: new Date(report.lockedAt.getTime()),
      lockedBy: {
        operatorId: report.lockedBy,
        operatorRole: 'unknown',
      },
    };
  }
  if (!isPlainRecord(report.metadata)) {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
  }
  if (report.metadata.a22Lock === undefined) {
    return {
      lockId: null,
      lockedAt: new Date(report.lockedAt.getTime()),
      lockedBy: {
        operatorId: report.lockedBy,
        operatorRole: 'unknown',
      },
    };
  }
  const audit = readLockMetadata(report.metadata.a22Lock);
  if (
    !audit ||
    audit.lockedAt.getTime() !== report.lockedAt.getTime() ||
    audit.lockedBy !== report.lockedBy
  ) {
    throw new ClinicalReportLockRuleError(
      'CLINICAL_REPORT_LOCK_AUDIT_UNAVAILABLE',
    );
  }
  return {
    lockId: audit.lockId,
    lockedAt: new Date(audit.lockedAt.getTime()),
    lockedBy: {
      operatorId: audit.lockedBy,
      operatorName: audit.lockedByName,
      operatorRole: audit.lockedByRole,
    },
    lockNote: audit.lockNote,
  };
}
