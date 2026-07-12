import { Types } from 'mongoose';
import type {
  ClinicalReportSummary,
  CreateClinicalReportInput,
} from '../services/reports.service';
import type {
  ClinicalReportCorrectionActor,
  ClinicalReportCorrectionMetadata,
  ClinicalReportCorrectionPlan,
  ClinicalReportCorrectionRecordInput,
  ClinicalReportReplacementMetadata,
  ExistingClinicalReportCorrectionResolution,
} from '../types/clinical-report-correction.types';
import { buildClinicalReportCode } from './clinical-report-draft-builder';
import { resolveExistingClinicalReportArchive } from './clinical-report-archive';
import { resolveExistingClinicalReportLock } from './clinical-report-lock';
import {
  assertClinicalReportBaseComplete,
  clinicalReportHasOnlyKeys,
  isClinicalReportA20GenerationMetadata,
  isPlainRecord,
  readClinicalReportConfirmation,
  readClinicalReportDate,
  readClinicalReportNonEmptyString,
  readClinicalReportSubmission,
} from './clinical-report-review';
import { resolveExistingSourceFreeze } from './clinical-report-source-freeze';

export type ClinicalReportCorrectionRuleErrorCode =
  | 'CLINICAL_REPORT_INCOMPLETE'
  | 'CLINICAL_REPORT_METADATA_UNSUPPORTED'
  | 'CLINICAL_REPORT_VOIDED'
  | 'CLINICAL_REPORT_NOT_CORRECTABLE'
  | 'CLINICAL_REPORT_CORRECTION_NOT_LATEST'
  | 'CLINICAL_REPORT_CORRECTION_CONFLICT'
  | 'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE'
  | 'CLINICAL_REPORT_CORRECTION_REPLACEMENT_CONFLICT'
  | 'CLINICAL_REPORT_CORRECTION_INCOMPLETE';

export class ClinicalReportCorrectionRuleError extends Error {
  constructor(readonly code: ClinicalReportCorrectionRuleErrorCode) {
    super(code);
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORRECTION_KEYS = [
  'version',
  'state',
  'correctionId',
  'correctionNo',
  'startedAt',
  'startedBy',
  'startedByName',
  'startedByRole',
  'correctionReason',
  'changeSummary',
  'previousReportCode',
  'previousReportVersion',
  'replacementReportCode',
  'replacementReportVersion',
  'sourceArchiveId',
  'sourceArchivedAt',
  'sourceFreezeId',
  'sourceFreezeCompletedAt',
  'replacementReportId',
  'replacementCreatedAt',
  'completedAt',
  'completedBy',
  'completedByName',
  'completedByRole',
] as const;
const REPLACEMENT_KEYS = [
  'version',
  'correctionId',
  'correctionNo',
  'previousReportId',
  'previousReportCode',
  'previousReportVersion',
  'replacementReportCode',
  'replacementReportVersion',
  'createdAt',
  'createdBy',
  'createdByName',
  'createdByRole',
  'correctionReason',
  'changeSummary',
  'sourceArchiveId',
  'sourceArchivedAt',
  'sourceFreezeId',
  'sourceFreezeCompletedAt',
] as const;

function readText(value: unknown, min = 1, max = Infinity): string | null {
  const text = readClinicalReportNonEmptyString(value);
  return text && text.length >= min && text.length <= max ? text : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function readObjectId(value: unknown): string | null {
  const text = readText(value)?.toLowerCase();
  if (!text || !Types.ObjectId.isValid(text)) {
    return null;
  }
  return new Types.ObjectId(text).toString() === text ? text : null;
}

function readRole(value: unknown): 'doctor' | 'admin' | null {
  return value === 'doctor' || value === 'admin' ? value : null;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = cloneUnknown(entry);
  }
  return result;
}

function cloneUnknown(value: unknown): unknown {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (Array.isArray(value)) {
    return value.map((entry: unknown) => cloneUnknown(entry));
  }
  if (isPlainRecord(value)) {
    return cloneRecord(value);
  }
  return value;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameDate(left: Date | null, right: Date): boolean {
  return left !== null && left.getTime() === right.getTime();
}

function parseCorrectionMetadata(
  value: unknown,
): ClinicalReportCorrectionMetadata | null {
  if (
    !isPlainRecord(value) ||
    !clinicalReportHasOnlyKeys(value, CORRECTION_KEYS) ||
    value.version !== 1 ||
    (value.state !== 'in_progress' && value.state !== 'completed')
  ) {
    return null;
  }
  const correctionId = readText(value.correctionId);
  const correctionNo = readPositiveInteger(value.correctionNo);
  const startedAt = readClinicalReportDate(value.startedAt);
  const startedBy = readObjectId(value.startedBy);
  const startedByName = readText(value.startedByName);
  const startedByRole = readRole(value.startedByRole);
  const correctionReason = readText(value.correctionReason, 3, 2000);
  const changeSummary = readText(value.changeSummary, 3, 4000);
  const previousReportCode = readText(value.previousReportCode);
  const previousReportVersion = readPositiveInteger(
    value.previousReportVersion,
  );
  const replacementReportCode = readText(value.replacementReportCode);
  const replacementReportVersion = readPositiveInteger(
    value.replacementReportVersion,
  );
  const sourceArchiveId = readText(value.sourceArchiveId);
  const sourceArchivedAt = readClinicalReportDate(value.sourceArchivedAt);
  const sourceFreezeId = readText(value.sourceFreezeId);
  const sourceFreezeCompletedAt = readClinicalReportDate(
    value.sourceFreezeCompletedAt,
  );
  if (
    !correctionId ||
    !UUID_PATTERN.test(correctionId) ||
    !correctionNo ||
    !startedAt ||
    !startedBy ||
    !startedByName ||
    !startedByRole ||
    !correctionReason ||
    !changeSummary ||
    !previousReportCode ||
    !previousReportVersion ||
    !replacementReportCode ||
    !replacementReportVersion ||
    replacementReportVersion !== previousReportVersion + 1 ||
    correctionNo !== replacementReportVersion - 1 ||
    !sourceArchiveId ||
    !UUID_PATTERN.test(sourceArchiveId) ||
    !sourceArchivedAt ||
    !sourceFreezeId ||
    !UUID_PATTERN.test(sourceFreezeId) ||
    !sourceFreezeCompletedAt
  ) {
    return null;
  }
  const base: ClinicalReportCorrectionMetadata = {
    version: 1,
    state: value.state,
    correctionId,
    correctionNo,
    startedAt,
    startedBy,
    startedByName,
    startedByRole,
    correctionReason,
    changeSummary,
    previousReportCode,
    previousReportVersion,
    replacementReportCode,
    replacementReportVersion,
    sourceArchiveId,
    sourceArchivedAt,
    sourceFreezeId,
    sourceFreezeCompletedAt,
  };
  if (value.state === 'in_progress') {
    if (
      value.completedAt !== undefined ||
      value.completedBy !== undefined ||
      value.completedByName !== undefined ||
      value.completedByRole !== undefined
    ) {
      return null;
    }
    const replacementReportId =
      value.replacementReportId === undefined
        ? null
        : readObjectId(value.replacementReportId);
    const replacementCreatedAt =
      value.replacementCreatedAt === undefined
        ? null
        : readClinicalReportDate(value.replacementCreatedAt);
    if (
      (value.replacementReportId !== undefined && !replacementReportId) ||
      (value.replacementCreatedAt !== undefined && !replacementCreatedAt) ||
      Boolean(replacementReportId) !== Boolean(replacementCreatedAt)
    ) {
      return null;
    }
    return {
      ...base,
      ...(replacementReportId && replacementCreatedAt
        ? { replacementReportId, replacementCreatedAt }
        : {}),
    };
  }
  const replacementReportId = readObjectId(value.replacementReportId);
  const replacementCreatedAt = readClinicalReportDate(
    value.replacementCreatedAt,
  );
  const completedAt = readClinicalReportDate(value.completedAt);
  const completedBy = readObjectId(value.completedBy);
  const completedByName = readText(value.completedByName);
  const completedByRole = readRole(value.completedByRole);
  return replacementReportId &&
    replacementCreatedAt &&
    completedAt &&
    completedBy &&
    completedByName &&
    completedByRole
    ? {
        ...base,
        state: 'completed',
        replacementReportId,
        replacementCreatedAt,
        completedAt,
        completedBy,
        completedByName,
        completedByRole,
      }
    : null;
}

export function resolveClinicalReportReplacementLineage(
  report: ClinicalReportSummary,
): ClinicalReportReplacementMetadata | null {
  if (!isPlainRecord(report.metadata)) {
    return null;
  }
  const value = report.metadata.a25CorrectionReplacement;
  if (value === undefined) {
    return null;
  }
  if (
    !isPlainRecord(value) ||
    !clinicalReportHasOnlyKeys(value, REPLACEMENT_KEYS) ||
    value.version !== 1
  ) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE',
    );
  }
  const correctionId = readText(value.correctionId);
  const correctionNo = readPositiveInteger(value.correctionNo);
  const previousReportId = readObjectId(value.previousReportId);
  const previousReportCode = readText(value.previousReportCode);
  const previousReportVersion = readPositiveInteger(
    value.previousReportVersion,
  );
  const replacementReportCode = readText(value.replacementReportCode);
  const replacementReportVersion = readPositiveInteger(
    value.replacementReportVersion,
  );
  const createdAt = readClinicalReportDate(value.createdAt);
  const createdBy = readObjectId(value.createdBy);
  const createdByName = readText(value.createdByName);
  const createdByRole = readRole(value.createdByRole);
  const correctionReason = readText(value.correctionReason, 3, 2000);
  const changeSummary = readText(value.changeSummary, 3, 4000);
  const sourceArchiveId = readText(value.sourceArchiveId);
  const sourceArchivedAt = readClinicalReportDate(value.sourceArchivedAt);
  const sourceFreezeId = readText(value.sourceFreezeId);
  const sourceFreezeCompletedAt = readClinicalReportDate(
    value.sourceFreezeCompletedAt,
  );
  if (
    !correctionId ||
    !UUID_PATTERN.test(correctionId) ||
    !correctionNo ||
    !previousReportId ||
    !previousReportCode ||
    !previousReportVersion ||
    !replacementReportCode ||
    !replacementReportVersion ||
    replacementReportVersion !== previousReportVersion + 1 ||
    correctionNo !== replacementReportVersion - 1 ||
    replacementReportVersion !== report.reportVersion ||
    replacementReportCode !== report.reportCode ||
    !createdAt ||
    !createdBy ||
    !createdByName ||
    !createdByRole ||
    !correctionReason ||
    !changeSummary ||
    !sourceArchiveId ||
    !UUID_PATTERN.test(sourceArchiveId) ||
    !sourceArchivedAt ||
    !sourceFreezeId ||
    !UUID_PATTERN.test(sourceFreezeId) ||
    !sourceFreezeCompletedAt
  ) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE',
    );
  }
  return {
    version: 1,
    correctionId,
    correctionNo,
    previousReportId,
    previousReportCode,
    previousReportVersion,
    replacementReportCode,
    replacementReportVersion,
    createdAt,
    createdBy,
    createdByName,
    createdByRole,
    correctionReason,
    changeSummary,
    sourceArchiveId,
    sourceArchivedAt,
    sourceFreezeId,
    sourceFreezeCompletedAt,
  };
}

export function resolveExistingClinicalReportCorrection(
  report: ClinicalReportSummary,
): ExistingClinicalReportCorrectionResolution | null {
  if (!isPlainRecord(report.metadata)) {
    return null;
  }
  if (report.metadata.a25Correction === undefined) {
    return null;
  }
  const audit = parseCorrectionMetadata(report.metadata.a25Correction);
  if (!audit) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE',
    );
  }
  if (
    (audit.state === 'in_progress' && report.status !== 'archived') ||
    (audit.state === 'completed' && report.status !== 'corrected')
  ) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE',
    );
  }
  return { audit, completed: audit.state === 'completed' };
}

export function evaluateClinicalReportCorrectionReadiness(input: {
  sourceReport: ClinicalReportSummary;
  latestReport: ClinicalReportSummary;
  expectedUpdatedAt: Date;
}): void {
  const source = input.sourceReport;
  if (source.status === 'voided') {
    throw new ClinicalReportCorrectionRuleError('CLINICAL_REPORT_VOIDED');
  }
  if (source.id !== input.latestReport.id) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_NOT_LATEST',
    );
  }
  if (
    source.status !== 'archived' ||
    source.source !== 'mixed' ||
    source.qualityStatus !== 'passed' ||
    !Number.isSafeInteger(source.reportVersion) ||
    source.reportVersion < 1 ||
    source.correctionRecords.length !== 0 ||
    source.voidedAt !== null ||
    source.voidedBy !== null ||
    !sameDate(source.updatedAt, input.expectedUpdatedAt)
  ) {
    throw new ClinicalReportCorrectionRuleError(
      source.updatedAt && !sameDate(source.updatedAt, input.expectedUpdatedAt)
        ? 'CLINICAL_REPORT_CORRECTION_CONFLICT'
        : 'CLINICAL_REPORT_NOT_CORRECTABLE',
    );
  }
  try {
    assertClinicalReportBaseComplete(source);
  } catch {
    throw new ClinicalReportCorrectionRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  if (
    !readClinicalReportSubmission(source.metadata) ||
    !readClinicalReportConfirmation(source.metadata)
  ) {
    throw new ClinicalReportCorrectionRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  try {
    const lock = resolveExistingClinicalReportLock(source);
    const freeze = resolveExistingSourceFreeze(source);
    const archive = resolveExistingClinicalReportArchive(source);
    if (
      !lock ||
      lock.lockId === null ||
      !freeze ||
      freeze.state !== 'completed' ||
      !freeze.completedAt ||
      !archive ||
      archive.archiveId === null ||
      archive.sourceFreezeId !== freeze.freezeId ||
      !archive.sourceFreezeCompletedAt ||
      archive.sourceFreezeCompletedAt.getTime() !== freeze.completedAt.getTime()
    ) {
      throw new Error('correction prerequisites unavailable');
    }
  } catch {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_NOT_CORRECTABLE',
    );
  }
  if (
    !isPlainRecord(source.metadata) ||
    source.metadata.a25Correction !== undefined
  ) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE',
    );
  }
}

export function buildClinicalReportCorrectionPlan(input: {
  sourceReport: ClinicalReportSummary;
  correctionId: string;
  startedAt: Date;
  actor: ClinicalReportCorrectionActor;
  correctionReason: string;
  changeSummary: string;
}): ClinicalReportCorrectionPlan {
  const archive = resolveExistingClinicalReportArchive(input.sourceReport);
  const freeze = resolveExistingSourceFreeze(input.sourceReport);
  const replacementReportVersion = input.sourceReport.reportVersion + 1;
  if (
    !UUID_PATTERN.test(input.correctionId) ||
    !archive ||
    !archive.archiveId ||
    !archive.sourceFreezeId ||
    !archive.sourceFreezeCompletedAt ||
    !freeze ||
    freeze.state !== 'completed'
  ) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE',
    );
  }
  return {
    correctionId: input.correctionId,
    correctionNo: replacementReportVersion - 1,
    replacementReportCode: buildClinicalReportCode({
      patientId: input.sourceReport.patientId,
      visitId: input.sourceReport.assessmentVisitId,
      reportType: input.sourceReport.reportType,
      reportVersion: replacementReportVersion,
    }),
    replacementReportVersion,
    startedAt: new Date(input.startedAt.getTime()),
    actor: { ...input.actor },
    correctionReason: input.correctionReason.trim(),
    changeSummary: input.changeSummary.trim(),
    sourceArchiveId: archive.archiveId,
    sourceArchivedAt: new Date(archive.archivedAt.getTime()),
    sourceFreezeId: archive.sourceFreezeId,
    sourceFreezeCompletedAt: new Date(
      archive.sourceFreezeCompletedAt.getTime(),
    ),
  };
}

export function buildClinicalReportCorrectionStartMetadata(input: {
  sourceReport: ClinicalReportSummary;
  plan: ClinicalReportCorrectionPlan;
}): Record<string, unknown> {
  if (!isPlainRecord(input.sourceReport.metadata)) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  const audit: ClinicalReportCorrectionMetadata = {
    version: 1,
    state: 'in_progress',
    correctionId: input.plan.correctionId,
    correctionNo: input.plan.correctionNo,
    startedAt: new Date(input.plan.startedAt.getTime()),
    startedBy: input.plan.actor.operatorId,
    startedByName: input.plan.actor.operatorName,
    startedByRole: input.plan.actor.operatorRole,
    correctionReason: input.plan.correctionReason,
    changeSummary: input.plan.changeSummary,
    previousReportCode: input.sourceReport.reportCode,
    previousReportVersion: input.sourceReport.reportVersion,
    replacementReportCode: input.plan.replacementReportCode,
    replacementReportVersion: input.plan.replacementReportVersion,
    sourceArchiveId: input.plan.sourceArchiveId,
    sourceArchivedAt: new Date(input.plan.sourceArchivedAt.getTime()),
    sourceFreezeId: input.plan.sourceFreezeId,
    sourceFreezeCompletedAt: new Date(
      input.plan.sourceFreezeCompletedAt.getTime(),
    ),
  };
  return {
    ...cloneRecord(input.sourceReport.metadata),
    a25Correction: audit,
  };
}

export function buildClinicalReportReplacement(input: {
  sourceReport: ClinicalReportSummary;
  audit: ClinicalReportCorrectionMetadata;
  createdAt: Date;
}): CreateClinicalReportInput {
  const source = input.sourceReport;
  if (
    !isPlainRecord(source.metadata) ||
    !isPlainRecord(source.metadata.a20Generation) ||
    !isClinicalReportA20GenerationMetadata(source.metadata.a20Generation)
  ) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  if (
    !source.patientSnapshot ||
    !source.visitSnapshot ||
    !source.narrative ||
    !source.aiDraft
  ) {
    throw new ClinicalReportCorrectionRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  const lineage: ClinicalReportReplacementMetadata = {
    version: 1,
    correctionId: input.audit.correctionId,
    correctionNo: input.audit.correctionNo,
    previousReportId: source.id,
    previousReportCode: source.reportCode,
    previousReportVersion: source.reportVersion,
    replacementReportCode: input.audit.replacementReportCode,
    replacementReportVersion: input.audit.replacementReportVersion,
    createdAt: new Date(input.createdAt.getTime()),
    createdBy: input.audit.startedBy,
    createdByName: input.audit.startedByName,
    createdByRole: input.audit.startedByRole,
    correctionReason: input.audit.correctionReason,
    changeSummary: input.audit.changeSummary,
    sourceArchiveId: input.audit.sourceArchiveId,
    sourceArchivedAt: new Date(input.audit.sourceArchivedAt.getTime()),
    sourceFreezeId: input.audit.sourceFreezeId,
    sourceFreezeCompletedAt: new Date(
      input.audit.sourceFreezeCompletedAt.getTime(),
    ),
  };
  return {
    patientId: source.patientId,
    assessmentVisitId: source.assessmentVisitId,
    primaryScaleInstanceIds: [...source.primaryScaleInstanceIds],
    scoreResultIds: [...source.scoreResultIds],
    cognitiveDomainResultIds: [...source.cognitiveDomainResultIds],
    mediaEvidenceIds: [...source.mediaEvidenceIds],
    subjectCode: source.subjectCode,
    reportCode: input.audit.replacementReportCode,
    reportType: 'cognitive_assessment' as const,
    status: 'draft' as const,
    reportVersion: input.audit.replacementReportVersion,
    source: 'mixed' as const,
    patientSnapshot: structuredClone(source.patientSnapshot),
    visitSnapshot: structuredClone(source.visitSnapshot),
    scaleTraces: structuredClone(source.scaleTraces),
    scoreSnapshots: structuredClone(source.scoreSnapshots),
    domainSnapshots: structuredClone(source.domainSnapshots),
    evidenceSnapshots: structuredClone(source.evidenceSnapshots),
    narrative: structuredClone(source.narrative),
    aiDraft: structuredClone(source.aiDraft),
    confirmation: null,
    lockedAt: null,
    archivedAt: null,
    correctionRecords: [] as [],
    voidedAt: null,
    auditLogRefs: [] as [],
    qualityStatus: 'needs_review' as const,
    qualityHints: null,
    metadata: {
      a20Generation: cloneRecord(source.metadata.a20Generation),
      a25CorrectionReplacement: lineage,
    },
    createdAt: new Date(input.createdAt.getTime()),
  };
}

export function validateClinicalReportReplacement(input: {
  sourceReport: ClinicalReportSummary;
  replacementReport: ClinicalReportSummary;
  audit: ClinicalReportCorrectionMetadata;
}): ClinicalReportReplacementMetadata {
  const source = input.sourceReport;
  const replacement = input.replacementReport;
  const lineage = resolveClinicalReportReplacementLineage(replacement);
  const systemNarrative = (report: ClinicalReportSummary) => ({
    chiefSummary: report.narrative?.chiefSummary,
    scoreSummary: report.narrative?.scoreSummary,
    domainSummary: report.narrative?.domainSummary,
    evidenceSummary: report.narrative?.evidenceSummary,
    trendSummary: report.narrative?.trendSummary,
    limitations: report.narrative?.limitations,
  });
  if (
    !lineage ||
    replacement.patientId !== source.patientId ||
    replacement.assessmentVisitId !== source.assessmentVisitId ||
    replacement.reportType !== source.reportType ||
    replacement.reportVersion !== input.audit.replacementReportVersion ||
    replacement.reportCode !== input.audit.replacementReportCode ||
    replacement.source !== 'mixed' ||
    !['draft', 'pending_confirmation', 'confirmed'].includes(
      replacement.status,
    ) ||
    replacement.lockedAt !== null ||
    replacement.lockedBy !== null ||
    replacement.archivedAt !== null ||
    replacement.archivedBy !== null ||
    replacement.voidedAt !== null ||
    replacement.voidedBy !== null ||
    replacement.correctionRecords.length !== 0 ||
    replacement.auditLogRefs.length !== 0 ||
    lineage.correctionId !== input.audit.correctionId ||
    lineage.previousReportId !== source.id ||
    lineage.previousReportCode !== source.reportCode ||
    lineage.previousReportVersion !== source.reportVersion ||
    !replacement.createdAt ||
    lineage.createdAt.getTime() !== replacement.createdAt.getTime() ||
    !sameValue(
      replacement.primaryScaleInstanceIds,
      source.primaryScaleInstanceIds,
    ) ||
    !sameValue(replacement.scoreResultIds, source.scoreResultIds) ||
    !sameValue(
      replacement.cognitiveDomainResultIds,
      source.cognitiveDomainResultIds,
    ) ||
    !sameValue(replacement.mediaEvidenceIds, source.mediaEvidenceIds) ||
    !sameValue(replacement.patientSnapshot, source.patientSnapshot) ||
    !sameValue(replacement.visitSnapshot, source.visitSnapshot) ||
    !sameValue(replacement.scaleTraces, source.scaleTraces) ||
    !sameValue(replacement.scoreSnapshots, source.scoreSnapshots) ||
    !sameValue(replacement.domainSnapshots, source.domainSnapshots) ||
    !sameValue(replacement.evidenceSnapshots, source.evidenceSnapshots) ||
    !sameValue(systemNarrative(replacement), systemNarrative(source)) ||
    !sameValue(replacement.aiDraft, source.aiDraft) ||
    !isPlainRecord(source.metadata) ||
    !isPlainRecord(replacement.metadata) ||
    !sameValue(
      replacement.metadata.a20Generation,
      source.metadata.a20Generation,
    ) ||
    replacement.metadata.a22Lock !== undefined ||
    replacement.metadata.a23SourceFreeze !== undefined ||
    replacement.metadata.a24Archive !== undefined ||
    replacement.metadata.a25Correction !== undefined
  ) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_REPLACEMENT_CONFLICT',
    );
  }
  return lineage;
}

export function buildClinicalReportCorrectionCompletion(input: {
  sourceReport: ClinicalReportSummary;
  replacementReport: ClinicalReportSummary;
  audit: ClinicalReportCorrectionMetadata;
  completedAt: Date;
  actor: ClinicalReportCorrectionActor;
}): {
  metadata: Record<string, unknown>;
  correctionRecord: ClinicalReportCorrectionRecordInput;
  audit: ClinicalReportCorrectionMetadata;
} {
  if (!isPlainRecord(input.sourceReport.metadata)) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE',
    );
  }
  const audit: ClinicalReportCorrectionMetadata = {
    ...input.audit,
    state: 'completed',
    replacementReportId: input.replacementReport.id,
    replacementCreatedAt: input.replacementReport.createdAt
      ? new Date(input.replacementReport.createdAt.getTime())
      : new Date(input.audit.startedAt.getTime()),
    completedAt: new Date(input.completedAt.getTime()),
    completedBy: input.actor.operatorId,
    completedByName: input.actor.operatorName,
    completedByRole: input.actor.operatorRole,
  };
  const correctionRecord: ClinicalReportCorrectionRecordInput = {
    correctionNo: audit.correctionNo,
    correctedAt: new Date(input.completedAt.getTime()),
    correctedBy: input.actor.operatorId,
    correctedByName: input.actor.operatorName,
    reason: audit.correctionReason,
    changeSummary: audit.changeSummary,
    previousReportCode: audit.previousReportCode,
    replacementReportCode: audit.replacementReportCode,
    auditLogId: null,
  };
  return {
    metadata: {
      ...cloneRecord(input.sourceReport.metadata),
      a25Correction: audit,
    },
    correctionRecord,
    audit,
  };
}

export function buildClinicalReportCorrectionReplacementRecordedMetadata(input: {
  sourceReport: ClinicalReportSummary;
  audit: ClinicalReportCorrectionMetadata;
  replacementReport: ClinicalReportSummary;
}): Record<string, unknown> {
  if (!isPlainRecord(input.sourceReport.metadata)) {
    throw new ClinicalReportCorrectionRuleError(
      'CLINICAL_REPORT_CORRECTION_AUDIT_UNAVAILABLE',
    );
  }
  const audit: ClinicalReportCorrectionMetadata = {
    ...input.audit,
    state: 'in_progress',
    replacementReportId: input.replacementReport.id,
    replacementCreatedAt: input.replacementReport.createdAt
      ? new Date(input.replacementReport.createdAt.getTime())
      : new Date(input.audit.startedAt.getTime()),
  };
  return {
    ...cloneRecord(input.sourceReport.metadata),
    a25Correction: audit,
  };
}
