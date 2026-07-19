import {
  CLINICAL_REPORT_SOURCES,
  CLINICAL_REPORT_STATUSES,
  REPORT_QUALITY_STATUSES,
} from '../schemas/clinical-report.schema';
import type {
  ClinicalReportHistoryRecord,
  ClinicalReportSummary,
} from '../services/reports.service';
import type {
  ClinicalReportCorrectionMetadata,
  ClinicalReportReplacementMetadata,
} from '../types/clinical-report-correction.types';
import type { ClinicalReportSourceFreezeMetadata } from '../types/clinical-report-source-freeze.types';
import type { ExistingClinicalReportArchiveResolution } from '../types/clinical-report-archive.types';
import type { ExistingClinicalReportLockResolution } from '../types/clinical-report-lock.types';
import { resolveExistingClinicalReportArchive } from './clinical-report-archive';
import {
  resolveClinicalReportReplacementLineage,
  resolveExistingClinicalReportCorrection,
} from './clinical-report-correction';
import { resolveExistingClinicalReportLock } from './clinical-report-lock';
import { assertClinicalReportReplacementLineageLink } from './clinical-report-replacement-lineage';
import { resolveExistingSourceFreeze } from './clinical-report-source-freeze';
import {
  isPlainRecord,
  readClinicalReportConfirmation,
} from './clinical-report-review';

export type ClinicalReportHistoryFailureKind = 'incomplete' | 'lineage_invalid';

export class ClinicalReportHistoryRuleError extends Error {
  constructor(readonly kind: ClinicalReportHistoryFailureKind) {
    super(kind);
  }
}

export type ClinicalReportHistoryLifecycle = {
  confirmedAt: Date | null;
  lock: ExistingClinicalReportLockResolution | null;
  sourceFreeze: ClinicalReportSourceFreezeMetadata | null;
  archive: ExistingClinicalReportArchiveResolution | null;
  correction: ClinicalReportCorrectionMetadata | null;
  replacementOf: ClinicalReportReplacementMetadata | null;
};

export type ClinicalReportHistoryLineageEvaluation = {
  ordered: ClinicalReportHistoryRecord[];
  lifecycleByReportId: ReadonlyMap<string, ClinicalReportHistoryLifecycle>;
  firstVersion: number;
  latestVersion: number;
  totalVersions: number;
};

const STATUS_SET = new Set<string>(CLINICAL_REPORT_STATUSES);
const SOURCE_SET = new Set<string>(CLINICAL_REPORT_SOURCES);
const QUALITY_SET = new Set<string>(REPORT_QUALITY_STATUSES);

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function metadataScopeIds(
  metadata: ClinicalReportHistoryRecord['metadata'],
  key:
    | 'scaleInstanceIds'
    | 'scoreResultIds'
    | 'cognitiveDomainResultIds'
    | 'mediaEvidenceIds',
): string[] {
  if (!isPlainRecord(metadata)) {
    return [];
  }
  const freeze = metadata.a23SourceFreeze;
  if (!isPlainRecord(freeze) || !isPlainRecord(freeze.scope)) {
    return [];
  }
  const value = freeze.scope[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? [...value]
    : [];
}

function toCompatibilityReport(
  report: ClinicalReportHistoryRecord,
): ClinicalReportSummary {
  return {
    id: report.id,
    patientId: report.patientId,
    assessmentVisitId: report.assessmentVisitId,
    primaryScaleInstanceIds: metadataScopeIds(
      report.metadata,
      'scaleInstanceIds',
    ),
    scoreResultIds: metadataScopeIds(report.metadata, 'scoreResultIds'),
    cognitiveDomainResultIds: metadataScopeIds(
      report.metadata,
      'cognitiveDomainResultIds',
    ),
    mediaEvidenceIds: metadataScopeIds(report.metadata, 'mediaEvidenceIds'),
    subjectCode: '',
    reportCode: report.reportCode,
    reportType: report.reportType,
    status: report.status,
    reportVersion: report.reportVersion,
    source: report.source,
    patientSnapshot: null,
    visitSnapshot: null,
    scaleTraces: [],
    scoreSnapshots: [],
    domainSnapshots: [],
    evidenceSnapshots: [],
    narrative: null,
    aiDraft: null,
    confirmation: report.confirmation,
    lockedAt: report.lockedAt,
    lockedBy: report.lockedBy,
    archivedAt: report.archivedAt,
    archivedBy: report.archivedBy,
    correctionRecords: report.correctionRecords,
    voidedAt: report.voidedAt,
    voidedBy: null,
    auditLogRefs: [],
    qualityStatus: report.qualityStatus,
    qualityHints: null,
    metadata: report.metadata,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function readSafeConfirmation(
  report: ClinicalReportHistoryRecord,
): Date | null {
  const audit = readClinicalReportConfirmation(report.metadata);
  const direct = report.confirmation;
  const hasNamespace =
    isPlainRecord(report.metadata) &&
    report.metadata.a21Confirmation !== undefined;
  if (!audit && !direct && !hasNamespace) {
    return null;
  }
  if (
    !audit ||
    !direct ||
    !validDate(direct.confirmedAt) ||
    direct.confirmedBy !== audit.confirmedBy ||
    direct.confirmedByName?.trim() !== audit.confirmedByName ||
    direct.confirmedByRole !== audit.confirmedByRole ||
    direct.confirmationNote?.trim() !== audit.confirmationNote ||
    direct.confirmedAt.getTime() !== audit.confirmedAt.getTime()
  ) {
    throw new ClinicalReportHistoryRuleError('incomplete');
  }
  return new Date(audit.confirmedAt.getTime());
}

function assertBaseFields(report: ClinicalReportHistoryRecord): void {
  if (
    !nonEmptyString(report.id) ||
    !nonEmptyString(report.patientId) ||
    !nonEmptyString(report.assessmentVisitId) ||
    !nonEmptyString(report.reportCode) ||
    report.reportType !== 'cognitive_assessment' ||
    !STATUS_SET.has(report.status) ||
    !SOURCE_SET.has(report.source) ||
    !QUALITY_SET.has(report.qualityStatus) ||
    !Number.isSafeInteger(report.reportVersion) ||
    report.reportVersion < 1 ||
    !validDate(report.createdAt) ||
    !validDate(report.updatedAt) ||
    (report.voidedAt !== null && !validDate(report.voidedAt))
  ) {
    throw new ClinicalReportHistoryRuleError('incomplete');
  }
}

export function readClinicalReportHistoryLifecycle(
  report: ClinicalReportHistoryRecord,
): ClinicalReportHistoryLifecycle {
  assertBaseFields(report);
  const compatibilityReport = toCompatibilityReport(report);
  const lockCompatibilityReport =
    report.status === 'voided' &&
    (report.lockedAt !== null || report.lockedBy !== null)
      ? { ...compatibilityReport, status: 'confirmed' as const }
      : compatibilityReport;
  const archiveCompatibilityReport =
    report.status === 'voided' &&
    (report.archivedAt !== null ||
      report.archivedBy !== null ||
      (isPlainRecord(report.metadata) &&
        report.metadata.a24Archive !== undefined))
      ? {
          ...compatibilityReport,
          status: 'archived' as const,
          voidedAt: null,
        }
      : compatibilityReport;
  try {
    const confirmation = readSafeConfirmation(report);
    if (
      ['confirmed', 'archived', 'corrected'].includes(report.status) &&
      !confirmation
    ) {
      throw new ClinicalReportHistoryRuleError('incomplete');
    }
    const correction =
      resolveExistingClinicalReportCorrection(compatibilityReport)?.audit ??
      null;
    return {
      confirmedAt: confirmation,
      lock: resolveExistingClinicalReportLock(lockCompatibilityReport),
      sourceFreeze: resolveExistingSourceFreeze(compatibilityReport),
      archive: resolveExistingClinicalReportArchive(archiveCompatibilityReport),
      correction,
      replacementOf:
        resolveClinicalReportReplacementLineage(compatibilityReport),
    };
  } catch (error: unknown) {
    if (error instanceof ClinicalReportHistoryRuleError) {
      throw error;
    }
    throw new ClinicalReportHistoryRuleError('incomplete');
  }
}

export function evaluateClinicalReportHistoryLineage(input: {
  reports: readonly ClinicalReportHistoryRecord[];
  patientId: string;
  assessmentVisitId: string;
}): ClinicalReportHistoryLineageEvaluation {
  if (input.reports.length === 0) {
    return {
      ordered: [],
      lifecycleByReportId: new Map(),
      firstVersion: 0,
      latestVersion: 0,
      totalVersions: 0,
    };
  }
  const lifecycleByReportId = new Map<string, ClinicalReportHistoryLifecycle>();
  const compatibilityByReportId = new Map<string, ClinicalReportSummary>();
  for (const report of input.reports) {
    assertBaseFields(report);
    if (
      report.patientId !== input.patientId ||
      report.assessmentVisitId !== input.assessmentVisitId ||
      report.reportType !== 'cognitive_assessment'
    ) {
      throw new ClinicalReportHistoryRuleError('lineage_invalid');
    }
  }
  const ordered = [...input.reports].sort(
    (left, right) =>
      left.reportVersion - right.reportVersion ||
      left.createdAt!.getTime() - right.createdAt!.getTime() ||
      left.id.localeCompare(right.id),
  );
  const reportCodes = new Set<string>();
  for (let index = 0; index < ordered.length; index += 1) {
    const report = ordered[index];
    if (
      report.reportVersion !== index + 1 ||
      reportCodes.has(report.reportCode)
    ) {
      throw new ClinicalReportHistoryRuleError('lineage_invalid');
    }
    reportCodes.add(report.reportCode);
  }
  for (const report of ordered) {
    lifecycleByReportId.set(
      report.id,
      readClinicalReportHistoryLifecycle(report),
    );
    compatibilityByReportId.set(report.id, toCompatibilityReport(report));
  }
  const firstLifecycle = lifecycleByReportId.get(ordered[0].id)!;
  if (firstLifecycle.replacementOf) {
    throw new ClinicalReportHistoryRuleError('lineage_invalid');
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    const previous = ordered[index - 1];
    const incoming = lifecycleByReportId.get(current.id)!.replacementOf;
    if (
      !incoming ||
      incoming.previousReportId !== previous.id ||
      incoming.previousReportCode !== previous.reportCode ||
      incoming.previousReportVersion !== previous.reportVersion
    ) {
      throw new ClinicalReportHistoryRuleError('lineage_invalid');
    }
    try {
      assertClinicalReportReplacementLineageLink({
        currentReport: compatibilityByReportId.get(current.id)!,
        previousReport: compatibilityByReportId.get(previous.id)!,
      });
    } catch {
      throw new ClinicalReportHistoryRuleError('lineage_invalid');
    }
  }
  const latest = ordered[ordered.length - 1];
  const latestCorrection = lifecycleByReportId.get(latest.id)!.correction;
  if (
    latest.status === 'corrected' ||
    latestCorrection?.state === 'completed'
  ) {
    throw new ClinicalReportHistoryRuleError('lineage_invalid');
  }
  return {
    ordered,
    lifecycleByReportId,
    firstVersion: 1,
    latestVersion: latest.reportVersion,
    totalVersions: ordered.length,
  };
}
