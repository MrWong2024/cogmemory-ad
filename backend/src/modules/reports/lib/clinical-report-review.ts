import type { ReportOperatorRole } from '../schemas/clinical-report.schema';
import type { ClinicalReportSummary } from '../services/reports.service';
import {
  CLINICAL_REPORT_EDITABLE_FIELDS,
  type ClinicalReportConfirmationMetadata,
  type ClinicalReportDraftEditUpdate,
  type ClinicalReportEditableField,
  type ClinicalReportEditAuditEvent,
  type ClinicalReportEditValues,
  type ClinicalReportSubmissionMetadata,
  type ClinicalReportWorkflowActor,
} from '../types/clinical-report-review.types';

export const MAX_A21_EDIT_EVENTS = 200;

export type ClinicalReportReviewRuleErrorCode =
  | 'CLINICAL_REPORT_INCOMPLETE'
  | 'CLINICAL_REPORT_METADATA_UNSUPPORTED'
  | 'CLINICAL_REPORT_EDIT_NO_CHANGES'
  | 'CLINICAL_REPORT_EDIT_AUDIT_LIMIT_REACHED'
  | 'CLINICAL_REPORT_NOT_READY_FOR_SUBMISSION'
  | 'CLINICAL_REPORT_NOT_READY_FOR_CONFIRMATION';

export class ClinicalReportReviewRuleError extends Error {
  constructor(readonly code: ClinicalReportReviewRuleErrorCode) {
    super(code);
  }
}

const WORKFLOW_ROLES = new Set<ReportOperatorRole>([
  'doctor',
  'nurse',
  'research_assistant',
  'admin',
  'unknown',
]);
const CONFIRMATION_ROLES = new Set(['doctor', 'admin'] as const);
const EDITABLE_FIELD_SET = new Set<string>(CLINICAL_REPORT_EDITABLE_FIELDS);

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
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

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readRole(value: unknown): ReportOperatorRole | null {
  return typeof value === 'string' &&
    WORKFLOW_ROLES.has(value as ReportOperatorRole)
    ? (value as ReportOperatorRole)
    : null;
}

function readConfirmationRole(
  value: unknown,
): Extract<ReportOperatorRole, 'doctor' | 'admin'> | null {
  return typeof value === 'string' &&
    CONFIRMATION_ROLES.has(
      value as Extract<ReportOperatorRole, 'doctor' | 'admin'>,
    )
    ? (value as Extract<ReportOperatorRole, 'doctor' | 'admin'>)
    : null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function readStringArray(value: unknown, allowEmpty = false): string[] | null {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    return null;
  }
  const result: string[] = [];
  for (const entry of value as unknown[]) {
    const normalized = readNonEmptyString(entry);
    if (!normalized) {
      return null;
    }
    result.push(normalized);
  }
  return result;
}

function isA20GenerationMetadata(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    value.version === 1 &&
    readNonEmptyString(value.generationId) !== null &&
    readDate(value.generatedAt) !== null &&
    readNonEmptyString(value.generatedBy) !== null &&
    readNonEmptyString(value.generatedByName) !== null &&
    readRole(value.generatedByRole) !== null &&
    readNonEmptyString(value.engineVersion) !== null &&
    readNonEmptyString(value.reportScope) !== null &&
    readStringArray(value.primaryScaleInstanceIds) !== null &&
    readStringArray(value.scoreResultIds) !== null &&
    readStringArray(value.cognitiveDomainResultIds) !== null &&
    typeof value.mediaEvidenceCount === 'number' &&
    Number.isInteger(value.mediaEvidenceCount) &&
    value.mediaEvidenceCount >= 0 &&
    value.aiUsed === false
  );
}

function readEditValues(value: unknown): ClinicalReportEditValues | null {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, CLINICAL_REPORT_EDITABLE_FIELDS)
  ) {
    return null;
  }
  const result: ClinicalReportEditValues = {};
  for (const field of CLINICAL_REPORT_EDITABLE_FIELDS) {
    if (!(field in value)) {
      continue;
    }
    const entry = value[field];
    if (entry !== null && typeof entry !== 'string') {
      return null;
    }
    result[field] = entry;
  }
  return result;
}

function readChangedFields(
  value: unknown,
): ClinicalReportEditableField[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    return null;
  }
  const result: ClinicalReportEditableField[] = [];
  for (const entry of value as unknown[]) {
    if (
      typeof entry !== 'string' ||
      !EDITABLE_FIELD_SET.has(entry) ||
      result.includes(entry as ClinicalReportEditableField)
    ) {
      return null;
    }
    result.push(entry as ClinicalReportEditableField);
  }
  return result;
}

function readEditEvent(value: unknown): ClinicalReportEditAuditEvent | null {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, [
      'eventId',
      'editedAt',
      'editedBy',
      'editedByName',
      'editedByRole',
      'changedFields',
      'previousValues',
      'nextValues',
      'editNote',
    ])
  ) {
    return null;
  }
  const editedAt = readDate(value.editedAt);
  const editedByRole = readRole(value.editedByRole);
  const changedFields = readChangedFields(value.changedFields);
  const previousValues = readEditValues(value.previousValues);
  const nextValues = readEditValues(value.nextValues);
  const eventId = readNonEmptyString(value.eventId);
  const editedBy = readNonEmptyString(value.editedBy);
  const editedByName = readNonEmptyString(value.editedByName);
  const editNote = readNonEmptyString(value.editNote);
  if (
    !editedAt ||
    !editedByRole ||
    !changedFields ||
    !previousValues ||
    !nextValues ||
    !eventId ||
    !editedBy ||
    !editedByName ||
    !editNote ||
    !changedFields.every(
      (field) => field in previousValues && field in nextValues,
    )
  ) {
    return null;
  }
  return {
    eventId,
    editedAt,
    editedBy,
    editedByName,
    editedByRole,
    changedFields,
    previousValues,
    nextValues,
    editNote,
  };
}

export function readClinicalReportEditEvents(
  metadata: ClinicalReportSummary['metadata'],
): ClinicalReportEditAuditEvent[] | null {
  if (!isPlainRecord(metadata) || metadata.a21Edits === undefined) {
    return metadata !== null && isPlainRecord(metadata) ? [] : null;
  }
  const value = metadata.a21Edits;
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, [
      'version',
      'events',
      'lastEditedAt',
      'lastEditedBy',
    ]) ||
    value.version !== 1 ||
    !Array.isArray(value.events) ||
    value.events.length > MAX_A21_EDIT_EVENTS ||
    readDate(value.lastEditedAt) === null ||
    readNonEmptyString(value.lastEditedBy) === null
  ) {
    return null;
  }
  const events: ClinicalReportEditAuditEvent[] = [];
  for (const entry of value.events as unknown[]) {
    const event = readEditEvent(entry);
    if (!event) {
      return null;
    }
    events.push(event);
  }
  if (events.length === 0) {
    return null;
  }
  return events;
}

export function readClinicalReportSubmission(
  metadata: ClinicalReportSummary['metadata'],
): ClinicalReportSubmissionMetadata | null {
  if (!isPlainRecord(metadata) || !isPlainRecord(metadata.a21Submission)) {
    return null;
  }
  const value = metadata.a21Submission;
  if (
    !hasOnlyKeys(value, [
      'version',
      'submissionId',
      'submittedAt',
      'submittedBy',
      'submittedByName',
      'submittedByRole',
      'submissionNote',
    ]) ||
    value.version !== 1
  ) {
    return null;
  }
  const submittedAt = readDate(value.submittedAt);
  const submittedByRole = readRole(value.submittedByRole);
  const submissionId = readNonEmptyString(value.submissionId);
  const submittedBy = readNonEmptyString(value.submittedBy);
  const submittedByName = readNonEmptyString(value.submittedByName);
  const submissionNote = readNonEmptyString(value.submissionNote);
  if (
    !submittedAt ||
    !submittedByRole ||
    !submissionId ||
    !submittedBy ||
    !submittedByName ||
    !submissionNote
  ) {
    return null;
  }
  return {
    version: 1,
    submissionId,
    submittedAt,
    submittedBy,
    submittedByName,
    submittedByRole,
    submissionNote,
  };
}

export function readClinicalReportConfirmation(
  metadata: ClinicalReportSummary['metadata'],
): ClinicalReportConfirmationMetadata | null {
  if (!isPlainRecord(metadata) || !isPlainRecord(metadata.a21Confirmation)) {
    return null;
  }
  const value = metadata.a21Confirmation;
  if (
    !hasOnlyKeys(value, [
      'version',
      'confirmationId',
      'confirmedAt',
      'confirmedBy',
      'confirmedByName',
      'confirmedByRole',
      'confirmationNote',
    ]) ||
    value.version !== 1
  ) {
    return null;
  }
  const confirmedAt = readDate(value.confirmedAt);
  const confirmedByRole = readConfirmationRole(value.confirmedByRole);
  const confirmationId = readNonEmptyString(value.confirmationId);
  const confirmedBy = readNonEmptyString(value.confirmedBy);
  const confirmedByName = readNonEmptyString(value.confirmedByName);
  const confirmationNote = readNonEmptyString(value.confirmationNote);
  if (
    !confirmedAt ||
    !confirmedByRole ||
    !confirmationId ||
    !confirmedBy ||
    !confirmedByName ||
    !confirmationNote
  ) {
    return null;
  }
  return {
    version: 1,
    confirmationId,
    confirmedAt,
    confirmedBy,
    confirmedByName,
    confirmedByRole,
    confirmationNote,
  };
}

function cloneAndValidateMetadata(
  report: ClinicalReportSummary,
): Record<string, unknown> {
  if (!isPlainRecord(report.metadata)) {
    throw new ClinicalReportReviewRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  if (!isA20GenerationMetadata(report.metadata.a20Generation)) {
    throw new ClinicalReportReviewRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  if (
    (report.metadata.a21Edits !== undefined &&
      readClinicalReportEditEvents(report.metadata) === null) ||
    (report.metadata.a21Submission !== undefined &&
      readClinicalReportSubmission(report.metadata) === null) ||
    (report.metadata.a21Confirmation !== undefined &&
      readClinicalReportConfirmation(report.metadata) === null)
  ) {
    throw new ClinicalReportReviewRuleError(
      'CLINICAL_REPORT_METADATA_UNSUPPORTED',
    );
  }
  return { ...report.metadata };
}

function normalizedOptionalText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function assertBaseReportComplete(report: ClinicalReportSummary): void {
  const narrative = report.narrative;
  if (
    report.reportType !== 'cognitive_assessment' ||
    report.reportVersion !== 1 ||
    !report.patientSnapshot ||
    !report.visitSnapshot ||
    report.primaryScaleInstanceIds.length < 1 ||
    report.scoreResultIds.length < 1 ||
    report.cognitiveDomainResultIds.length < 1 ||
    report.scaleTraces.length < 1 ||
    report.scoreSnapshots.length < 1 ||
    report.domainSnapshots.length < 1 ||
    !narrative ||
    !readNonEmptyString(narrative.chiefSummary) ||
    !readNonEmptyString(narrative.scoreSummary) ||
    !readNonEmptyString(narrative.domainSummary) ||
    !readNonEmptyString(narrative.evidenceSummary) ||
    !readNonEmptyString(narrative.limitations) ||
    !report.updatedAt
  ) {
    throw new ClinicalReportReviewRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
}

export function prepareClinicalReportDraftEdit(input: {
  report: ClinicalReportSummary;
  doctorOpinion: string;
  recommendationText?: string;
  editNote: string;
  eventId: string;
  editedAt: Date;
  actor: ClinicalReportWorkflowActor;
}): ClinicalReportDraftEditUpdate {
  assertBaseReportComplete(input.report);
  const metadata = cloneAndValidateMetadata(input.report);
  const currentNarrative = input.report.narrative;
  if (!currentNarrative) {
    throw new ClinicalReportReviewRuleError('CLINICAL_REPORT_INCOMPLETE');
  }
  const doctorOpinion = input.doctorOpinion.trim();
  const currentDoctorOpinion = normalizedOptionalText(
    currentNarrative.doctorOpinion,
  );
  const currentRecommendation = normalizedOptionalText(
    currentNarrative.recommendationText,
  );
  const nextRecommendation =
    input.recommendationText === undefined
      ? currentRecommendation
      : normalizedOptionalText(input.recommendationText);
  const changedFields: ClinicalReportEditableField[] = [];
  const previousValues: ClinicalReportEditValues = {};
  const nextValues: ClinicalReportEditValues = {};
  if (doctorOpinion !== currentDoctorOpinion) {
    changedFields.push('doctorOpinion');
    previousValues.doctorOpinion = currentDoctorOpinion;
    nextValues.doctorOpinion = doctorOpinion;
  }
  if (nextRecommendation !== currentRecommendation) {
    changedFields.push('recommendationText');
    previousValues.recommendationText = currentRecommendation;
    nextValues.recommendationText = nextRecommendation;
  }
  if (changedFields.length === 0) {
    throw new ClinicalReportReviewRuleError('CLINICAL_REPORT_EDIT_NO_CHANGES');
  }
  const existingEvents = readClinicalReportEditEvents(metadata) ?? [];
  if (existingEvents.length >= MAX_A21_EDIT_EVENTS) {
    throw new ClinicalReportReviewRuleError(
      'CLINICAL_REPORT_EDIT_AUDIT_LIMIT_REACHED',
    );
  }
  const event: ClinicalReportEditAuditEvent = {
    eventId: input.eventId,
    editedAt: new Date(input.editedAt.getTime()),
    editedBy: input.actor.operatorId,
    editedByName: input.actor.operatorName,
    editedByRole: input.actor.operatorRole,
    changedFields: [...changedFields],
    previousValues: { ...previousValues },
    nextValues: { ...nextValues },
    editNote: input.editNote.trim(),
  };
  metadata.a21Edits = {
    version: 1,
    events: [...existingEvents, event],
    lastEditedAt: event.editedAt,
    lastEditedBy: event.editedBy,
  };
  const narrative = {
    ...currentNarrative,
    doctorOpinion,
  };
  if (nextRecommendation === null) {
    delete narrative.recommendationText;
  } else {
    narrative.recommendationText = nextRecommendation;
  }
  return { narrative, metadata, event };
}

export function prepareClinicalReportSubmission(input: {
  report: ClinicalReportSummary;
  submissionId: string;
  submittedAt: Date;
  actor: ClinicalReportWorkflowActor;
  submissionNote: string;
}): {
  metadata: Record<string, unknown>;
  submission: ClinicalReportSubmissionMetadata;
} {
  assertBaseReportComplete(input.report);
  const metadata = cloneAndValidateMetadata(input.report);
  const doctorOpinion = normalizedOptionalText(
    input.report.narrative?.doctorOpinion,
  );
  if (
    input.report.status !== 'draft' ||
    input.report.source !== 'mixed' ||
    !doctorOpinion ||
    doctorOpinion.length < 3 ||
    doctorOpinion.length > 4000 ||
    input.report.confirmation !== null ||
    input.report.lockedAt !== null ||
    input.report.archivedAt !== null ||
    input.report.voidedAt !== null ||
    input.report.qualityStatus === 'failed' ||
    metadata.a21Submission !== undefined
  ) {
    throw new ClinicalReportReviewRuleError(
      'CLINICAL_REPORT_NOT_READY_FOR_SUBMISSION',
    );
  }
  const submission: ClinicalReportSubmissionMetadata = {
    version: 1,
    submissionId: input.submissionId,
    submittedAt: new Date(input.submittedAt.getTime()),
    submittedBy: input.actor.operatorId,
    submittedByName: input.actor.operatorName,
    submittedByRole: input.actor.operatorRole,
    submissionNote: input.submissionNote.trim(),
  };
  metadata.a21Submission = submission;
  return { metadata, submission };
}

export function prepareClinicalReportConfirmation(input: {
  report: ClinicalReportSummary;
  confirmationId: string;
  confirmedAt: Date;
  actor: ClinicalReportWorkflowActor & {
    operatorRole: Extract<ReportOperatorRole, 'doctor' | 'admin'>;
  };
  confirmationNote: string;
}): {
  metadata: Record<string, unknown>;
  confirmation: ClinicalReportConfirmationMetadata;
} {
  assertBaseReportComplete(input.report);
  const metadata = cloneAndValidateMetadata(input.report);
  const doctorOpinion = normalizedOptionalText(
    input.report.narrative?.doctorOpinion,
  );
  if (
    input.report.status !== 'pending_confirmation' ||
    input.report.source !== 'mixed' ||
    !doctorOpinion ||
    doctorOpinion.length < 3 ||
    doctorOpinion.length > 4000 ||
    !readClinicalReportSubmission(metadata) ||
    input.report.confirmation !== null ||
    input.report.lockedAt !== null ||
    input.report.archivedAt !== null ||
    input.report.voidedAt !== null ||
    input.report.qualityStatus === 'failed' ||
    metadata.a21Confirmation !== undefined
  ) {
    throw new ClinicalReportReviewRuleError(
      'CLINICAL_REPORT_NOT_READY_FOR_CONFIRMATION',
    );
  }
  const confirmation: ClinicalReportConfirmationMetadata = {
    version: 1,
    confirmationId: input.confirmationId,
    confirmedAt: new Date(input.confirmedAt.getTime()),
    confirmedBy: input.actor.operatorId,
    confirmedByName: input.actor.operatorName,
    confirmedByRole: input.actor.operatorRole,
    confirmationNote: input.confirmationNote.trim(),
  };
  metadata.a21Confirmation = confirmation;
  return { metadata, confirmation };
}
