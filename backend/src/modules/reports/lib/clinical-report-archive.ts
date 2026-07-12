import { Types } from 'mongoose';
import type { ClinicalReportSummary } from '../services/reports.service';
import type {
  ClinicalReportArchiveActor,
  ClinicalReportArchiveContext,
  ClinicalReportArchiveMetadata,
  ClinicalReportArchiveMutation,
  ExistingClinicalReportArchiveResolution,
} from '../types/clinical-report-archive.types';
import { resolveExistingClinicalReportLock } from './clinical-report-lock';
import {
  assertClinicalReportBaseComplete,
  clinicalReportHasOnlyKeys,
  cloneAndValidateClinicalReportMetadata,
  isPlainRecord,
  readClinicalReportConfirmation,
  readClinicalReportDate,
  readClinicalReportNonEmptyString,
  readClinicalReportSubmission,
} from './clinical-report-review';
import { resolveExistingSourceFreeze } from './clinical-report-source-freeze';

export type ClinicalReportArchiveRuleErrorCode =
  | 'CLINICAL_REPORT_INCOMPLETE'
  | 'CLINICAL_REPORT_METADATA_UNSUPPORTED'
  | 'CLINICAL_REPORT_VOIDED'
  | 'CLINICAL_REPORT_NOT_ARCHIVABLE'
  | 'CLINICAL_REPORT_ARCHIVE_CONFLICT'
  | 'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE';

export class ClinicalReportArchiveRuleError extends Error {
  constructor(readonly code: ClinicalReportArchiveRuleErrorCode) {
    super(code);
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ARCHIVED_STATUSES = new Set(['archived', 'corrected']);
const ARCHIVE_KEYS = [
  'version',
  'archiveId',
  'archivedAt',
  'archivedBy',
  'archivedByName',
  'archivedByRole',
  'archiveNote',
  'sourceFreezeId',
  'sourceFreezeCompletedAt',
] as const;

function normalizeObjectId(value: unknown): string | null {
  const normalized = readClinicalReportNonEmptyString(value)?.toLowerCase();
  if (!normalized || !Types.ObjectId.isValid(normalized)) {
    return null;
  }
  return new Types.ObjectId(normalized).toString() === normalized
    ? normalized
    : null;
}

function sameDate(left: Date | null, right: Date): boolean {
  return left !== null && left.getTime() === right.getTime();
}

function readArchiveMetadata(
  value: unknown,
): ClinicalReportArchiveMetadata | null {
  if (
    !isPlainRecord(value) ||
    !clinicalReportHasOnlyKeys(value, ARCHIVE_KEYS) ||
    value.version !== 1
  ) {
    return null;
  }
  const archiveId = readClinicalReportNonEmptyString(value.archiveId);
  const archivedAt = readClinicalReportDate(value.archivedAt);
  const archivedBy = normalizeObjectId(value.archivedBy);
  const archivedByName = readClinicalReportNonEmptyString(value.archivedByName);
  const archivedByRole =
    value.archivedByRole === 'doctor' || value.archivedByRole === 'admin'
      ? value.archivedByRole
      : null;
  const archiveNote = readClinicalReportNonEmptyString(value.archiveNote);
  const sourceFreezeId = readClinicalReportNonEmptyString(value.sourceFreezeId);
  const sourceFreezeCompletedAt = readClinicalReportDate(
    value.sourceFreezeCompletedAt,
  );
  if (
    !archiveId ||
    !UUID_PATTERN.test(archiveId) ||
    !archivedAt ||
    !archivedBy ||
    !archivedByName ||
    !archivedByRole ||
    !archiveNote ||
    archiveNote.length < 3 ||
    archiveNote.length > 2000 ||
    !sourceFreezeId ||
    !UUID_PATTERN.test(sourceFreezeId) ||
    !sourceFreezeCompletedAt
  ) {
    return null;
  }
  return {
    version: 1,
    archiveId,
    archivedAt,
    archivedBy,
    archivedByName,
    archivedByRole,
    archiveNote,
    sourceFreezeId,
    sourceFreezeCompletedAt,
  };
}

function cloneSupportedMetadata(
  report: ClinicalReportSummary,
): Record<string, unknown> {
  if (!isPlainRecord(report.metadata)) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  try {
    return cloneAndValidateClinicalReportMetadata(report);
  } catch {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
}

function assertConfirmationComplete(report: ClinicalReportSummary): void {
  const confirmation = report.confirmation;
  const audit = readClinicalReportConfirmation(report.metadata);
  if (
    !confirmation ||
    !confirmation.confirmedAt ||
    !confirmation.confirmedBy ||
    !readClinicalReportNonEmptyString(confirmation.confirmedByName) ||
    (confirmation.confirmedByRole !== 'doctor' &&
      confirmation.confirmedByRole !== 'admin') ||
    !readClinicalReportNonEmptyString(confirmation.confirmationNote) ||
    !audit ||
    audit.confirmedAt.getTime() !== confirmation.confirmedAt.getTime() ||
    audit.confirmedBy !== confirmation.confirmedBy ||
    audit.confirmedByName !== confirmation.confirmedByName?.trim() ||
    audit.confirmedByRole !== confirmation.confirmedByRole ||
    audit.confirmationNote !== confirmation.confirmationNote?.trim()
  ) {
    throw new ClinicalReportArchiveRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
}

function resolveCompletedSourceFreeze(report: ClinicalReportSummary) {
  try {
    const lock = resolveExistingClinicalReportLock(report);
    const sourceFreeze = resolveExistingSourceFreeze(report);
    if (
      !lock ||
      lock.lockId === null ||
      !sourceFreeze ||
      sourceFreeze.state !== 'completed' ||
      !sourceFreeze.completedAt
    ) {
      throw new Error('archive prerequisites unavailable');
    }
    return sourceFreeze;
  } catch {
    throw new ClinicalReportArchiveRuleError('CLINICAL_REPORT_NOT_ARCHIVABLE');
  }
}

export function evaluateClinicalReportArchiveReadiness(
  context: ClinicalReportArchiveContext,
): void {
  const report = context.report;
  if (report.status === 'voided') {
    throw new ClinicalReportArchiveRuleError('CLINICAL_REPORT_VOIDED');
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
    throw new ClinicalReportArchiveRuleError('CLINICAL_REPORT_NOT_ARCHIVABLE');
  }
  try {
    assertClinicalReportBaseComplete(report);
  } catch {
    throw new ClinicalReportArchiveRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  const metadata = cloneSupportedMetadata(report);
  if (metadata.a24Archive !== undefined) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
  }
  if (
    !readClinicalReportSubmission(metadata) ||
    !readClinicalReportConfirmation(metadata)
  ) {
    throw new ClinicalReportArchiveRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  assertConfirmationComplete(report);
  resolveCompletedSourceFreeze(report);
  if (!sameDate(report.updatedAt, context.expectedUpdatedAt)) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_ARCHIVE_CONFLICT',
    );
  }
}

export function buildClinicalReportArchiveActor(input: {
  operatorId: string;
  operatorName: string;
  operatorRole: 'doctor' | 'admin';
}): ClinicalReportArchiveActor {
  const operatorId = normalizeObjectId(input.operatorId);
  const operatorName = readClinicalReportNonEmptyString(input.operatorName);
  if (!operatorId || !operatorName) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
  }
  return { operatorId, operatorName, operatorRole: input.operatorRole };
}

export function buildClinicalReportArchiveMetadata(input: {
  report: ClinicalReportSummary;
  archiveId: string;
  archivedAt: Date;
  actor: ClinicalReportArchiveActor;
  archiveNote: string;
}): ClinicalReportArchiveMutation {
  const metadata = cloneSupportedMetadata(input.report);
  if (metadata.a24Archive !== undefined) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
  }
  const sourceFreeze = resolveCompletedSourceFreeze(input.report);
  const audit: ClinicalReportArchiveMetadata = {
    version: 1,
    archiveId: input.archiveId,
    archivedAt: new Date(input.archivedAt.getTime()),
    archivedBy: input.actor.operatorId,
    archivedByName: input.actor.operatorName,
    archivedByRole: input.actor.operatorRole,
    archiveNote: input.archiveNote.trim(),
    sourceFreezeId: sourceFreeze.freezeId,
    sourceFreezeCompletedAt: new Date(sourceFreeze.completedAt!.getTime()),
  };
  if (!readArchiveMetadata(audit)) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
  }
  return {
    archivedAt: new Date(audit.archivedAt.getTime()),
    archivedBy: audit.archivedBy,
    metadata: { ...metadata, a24Archive: audit },
    audit,
  };
}

export function resolveExistingClinicalReportArchive(
  report: ClinicalReportSummary,
): ExistingClinicalReportArchiveResolution | null {
  const hasArchiveNamespace =
    isPlainRecord(report.metadata) && report.metadata.a24Archive !== undefined;
  if (!ARCHIVED_STATUSES.has(report.status)) {
    if (
      report.archivedAt !== null ||
      report.archivedBy !== null ||
      hasArchiveNamespace
    ) {
      throw new ClinicalReportArchiveRuleError(
        'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
      );
    }
    return null;
  }
  const archivedAt = readClinicalReportDate(report.archivedAt);
  const archivedBy = normalizeObjectId(report.archivedBy);
  if (!archivedAt || !archivedBy || report.voidedAt !== null) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
  }
  if (report.metadata === null) {
    return {
      archiveId: null,
      archivedAt,
      archivedBy: { operatorId: archivedBy, operatorRole: 'unknown' },
      sourceFreezeId: null,
      sourceFreezeCompletedAt: null,
    };
  }
  if (!isPlainRecord(report.metadata)) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
  }
  if (report.metadata.a24Archive === undefined) {
    return {
      archiveId: null,
      archivedAt,
      archivedBy: { operatorId: archivedBy, operatorRole: 'unknown' },
      sourceFreezeId: null,
      sourceFreezeCompletedAt: null,
    };
  }
  const audit = readArchiveMetadata(report.metadata.a24Archive);
  if (
    !audit ||
    audit.archivedAt.getTime() !== archivedAt.getTime() ||
    audit.archivedBy !== archivedBy
  ) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
  }
  let sourceFreeze: ReturnType<typeof resolveExistingSourceFreeze>;
  try {
    sourceFreeze = resolveExistingSourceFreeze(report);
  } catch {
    sourceFreeze = null;
  }
  if (
    !sourceFreeze ||
    sourceFreeze.state !== 'completed' ||
    !sourceFreeze.completedAt ||
    sourceFreeze.freezeId !== audit.sourceFreezeId ||
    sourceFreeze.completedAt.getTime() !==
      audit.sourceFreezeCompletedAt.getTime()
  ) {
    throw new ClinicalReportArchiveRuleError(
      'CLINICAL_REPORT_ARCHIVE_AUDIT_UNAVAILABLE',
    );
  }
  return {
    archiveId: audit.archiveId,
    archivedAt: new Date(audit.archivedAt.getTime()),
    archivedBy: {
      operatorId: audit.archivedBy,
      operatorName: audit.archivedByName,
      operatorRole: audit.archivedByRole,
    },
    archiveNote: audit.archiveNote,
    sourceFreezeId: audit.sourceFreezeId,
    sourceFreezeCompletedAt: new Date(audit.sourceFreezeCompletedAt.getTime()),
  };
}
