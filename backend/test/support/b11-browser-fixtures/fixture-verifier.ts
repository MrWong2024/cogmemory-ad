import { createHash } from 'crypto';
import type { Types } from 'mongoose';
import {
  isClinicalReportA20GenerationMetadata,
  readClinicalReportConfirmation,
  readClinicalReportEditEvents,
  readClinicalReportSubmission,
} from '../../../src/modules/reports/lib/clinical-report-review';
import type { ClinicalReportDocument } from '../../../src/modules/reports/schemas/clinical-report.schema';
import type { B11RouteRoot } from './fixture-builder';
import {
  B11FixtureError,
  type B11FixtureMutationClass,
  type B11PreparedState,
  type B11ProductMutationClass,
  type B11Profile,
  type B11RouteDefinition,
  type B11VerifyPhase,
} from './fixture-types';

export type B11RouteBaseline = {
  version: 1;
  profile: B11Profile;
  namespace: string;
  scenarioKey: string;
  routeKey: string;
  preparedState: B11PreparedState;
  reportHash: string;
  protectedReportHash: string;
  clinicianHash: string;
  patientHash: string;
  visitHash: string;
  instanceHash: string;
  initialUpdatedAt: string;
  editCount: number;
  hasSubmission: boolean;
  hasConfirmation: boolean;
  canonicalSeedHash: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stableB11Hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => normalized(entry));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object' || value === null) return value;
  if ('toHexString' in value && typeof value.toHexString === 'function') {
    return (value.toHexString as () => string)();
  }
  if ('toObject' in value && typeof value.toObject === 'function') {
    return normalized((value.toObject as () => unknown)());
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalized(entry)]),
  );
}

function documentObject(document: {
  toObject(): unknown;
}): Record<string, unknown> {
  const value = document.toObject();
  if (!isRecord(value)) {
    throw new B11FixtureError(
      'B11_FIXTURE_DOCUMENT_INVALID',
      'Fixture document could not be normalized',
    );
  }
  return value;
}

function withoutLifecycleTimestamps(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== 'createdAt' && key !== 'updatedAt',
    ),
  );
}

function ownershipWithoutBaseline(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const fixture = isRecord(value.b11Fixture)
    ? { ...value.b11Fixture }
    : value.b11Fixture;
  if (isRecord(fixture)) delete fixture.baseline;
  return { ...value, b11Fixture: fixture };
}

function patientInvariant(root: B11RouteRoot): unknown {
  const raw = withoutLifecycleTimestamps(documentObject(root.patient));
  return normalized({
    ...raw,
    metadata: ownershipWithoutBaseline(raw.metadata),
  });
}

function visitInvariant(root: B11RouteRoot): unknown {
  return normalized(withoutLifecycleTimestamps(documentObject(root.visit)));
}

function instanceInvariant(root: B11RouteRoot): unknown {
  return normalized(withoutLifecycleTimestamps(documentObject(root.instance)));
}

function reportMetadataWithoutAllowedMutations(
  metadata: unknown,
): Record<string, unknown> | null {
  if (!isRecord(metadata)) return null;
  const result = { ...metadata };
  delete result.a21Edits;
  delete result.a21Submission;
  delete result.a21Confirmation;
  delete result.b11FixtureStage;
  return result;
}

function systemNarrative(report: ClinicalReportDocument) {
  return {
    chiefSummary: report.narrative?.chiefSummary,
    scoreSummary: report.narrative?.scoreSummary,
    domainSummary: report.narrative?.domainSummary,
    evidenceSummary: report.narrative?.evidenceSummary,
    limitations: report.narrative?.limitations,
  };
}

function clinicianNarrative(report: ClinicalReportDocument) {
  return {
    doctorOpinion: report.narrative?.doctorOpinion ?? null,
    recommendationText: report.narrative?.recommendationText ?? null,
  };
}

function protectedReportValue(report: ClinicalReportDocument): unknown {
  return normalized({
    patientId: report.patientId,
    assessmentVisitId: report.assessmentVisitId,
    primaryScaleInstanceIds: report.primaryScaleInstanceIds,
    scoreResultIds: report.scoreResultIds,
    cognitiveDomainResultIds: report.cognitiveDomainResultIds,
    mediaEvidenceIds: report.mediaEvidenceIds,
    subjectCode: report.subjectCode,
    reportCode: report.reportCode,
    reportNo: report.reportNo,
    reportType: report.reportType,
    reportVersion: report.reportVersion,
    patientSnapshot: report.patientSnapshot,
    visitSnapshot: report.visitSnapshot,
    scaleTraces: report.scaleTraces,
    scoreSnapshots: report.scoreSnapshots,
    domainSnapshots: report.domainSnapshots,
    evidenceSnapshots: report.evidenceSnapshots,
    systemNarrative: systemNarrative(report),
    aiDraft: report.aiDraft,
    lockedAt: report.lockedAt,
    lockedBy: report.lockedBy,
    archivedAt: report.archivedAt,
    archivedBy: report.archivedBy,
    correctionRecords: report.correctionRecords,
    voidedAt: report.voidedAt,
    voidedBy: report.voidedBy,
    voidReason: report.voidReason,
    auditLogRefs: report.auditLogRefs,
    qualityHints: report.qualityHints,
    operatorNote: report.operatorNote,
    protectedMetadata: reportMetadataWithoutAllowedMutations(report.metadata),
  });
}

function fullReportValue(report: ClinicalReportDocument): unknown {
  return normalized(withoutLifecycleTimestamps(documentObject(report)));
}

function editCount(report: ClinicalReportDocument): number {
  return readClinicalReportEditEvents(report.metadata ?? null)?.length ?? 0;
}

function hasSubmission(report: ClinicalReportDocument): boolean {
  return readClinicalReportSubmission(report.metadata ?? null) !== null;
}

function hasConfirmation(report: ClinicalReportDocument): boolean {
  return readClinicalReportConfirmation(report.metadata ?? null) !== null;
}

function reportUpdatedAt(report: ClinicalReportDocument): Date | null {
  const value = (report as ClinicalReportDocument & { updatedAt?: Date })
    .updatedAt;
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : null;
}

function metadataOwnershipMatches(
  report: ClinicalReportDocument,
  profile: B11Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
  preparedState: B11PreparedState,
): boolean {
  const marker = isRecord(report.metadata)
    ? report.metadata.b11FixtureOwnership
    : null;
  return (
    isRecord(marker) &&
    marker.version === 1 &&
    marker.profile === profile &&
    marker.namespace === namespace &&
    marker.scenarioKey === scenarioKey &&
    marker.routeKey === routeKey &&
    marker.preparedState === preparedState
  );
}

function expectedStateFacts(state: B11PreparedState) {
  const draft =
    state === 'system_draft' ||
    state === 'mixed_draft' ||
    state === 'audit_limit_draft';
  const confirmed = ['confirmed', 'archived', 'corrected', 'voided'].includes(
    state,
  );
  return {
    status: draft ? 'draft' : state,
    source: state === 'system_draft' ? 'system_draft' : 'mixed',
    editCount:
      state === 'system_draft' ? 0 : state === 'audit_limit_draft' ? 200 : 1,
    submission: state === 'pending_confirmation' || confirmed,
    confirmation: confirmed,
    isFinal: ['confirmed', 'archived', 'corrected'].includes(state),
  };
}

export function assertB11PreparedReport(input: {
  root: B11RouteRoot;
  profile: B11Profile;
  namespace: string;
  contract: B11RouteDefinition;
  publicIsFinal: boolean;
}): void {
  const { report, instance } = input.root;
  const facts = expectedStateFacts(input.contract.preparedState);
  const generation = isRecord(report.metadata)
    ? report.metadata.a20Generation
    : null;
  const updatedAt = reportUpdatedAt(report);
  const narrative = report.narrative;
  const stage = isRecord(report.metadata)
    ? report.metadata.b11FixtureStage
    : undefined;
  const confirmation = report.confirmation;
  const terminalArchived =
    input.contract.preparedState === 'archived' ||
    input.contract.preparedState === 'corrected';
  const terminalVoided = input.contract.preparedState === 'voided';
  if (
    report.reportType !== 'cognitive_assessment' ||
    report.reportVersion !== 1 ||
    report.status !== facts.status ||
    report.source !== facts.source ||
    report.qualityStatus !== 'passed' ||
    !updatedAt ||
    report.primaryScaleInstanceIds.length !== 1 ||
    report.primaryScaleInstanceIds[0]?.toString() !== instance._id.toString() ||
    report.scoreResultIds.length !== 1 ||
    report.cognitiveDomainResultIds.length !== 1 ||
    report.scaleTraces.length !== 1 ||
    report.scoreSnapshots.length !== 1 ||
    report.domainSnapshots.length !== 1 ||
    report.evidenceSnapshots.length !== 0 ||
    !narrative?.chiefSummary ||
    !narrative.scoreSummary ||
    !narrative.domainSummary ||
    !narrative.evidenceSummary ||
    !narrative.limitations ||
    !isClinicalReportA20GenerationMetadata(generation) ||
    editCount(report) !== facts.editCount ||
    hasSubmission(report) !== facts.submission ||
    hasConfirmation(report) !== facts.confirmation ||
    Boolean(confirmation) !== facts.confirmation ||
    input.publicIsFinal !== facts.isFinal ||
    stage !== undefined ||
    !metadataOwnershipMatches(
      report,
      input.profile,
      input.namespace,
      input.root.scenarioKey,
      input.root.routeKey,
      input.contract.preparedState,
    ) ||
    (input.contract.preparedState === 'system_draft' &&
      (narrative.doctorOpinion !== undefined ||
        narrative.recommendationText !== undefined)) ||
    (input.contract.preparedState !== 'system_draft' &&
      (!narrative.doctorOpinion || !narrative.recommendationText)) ||
    (input.contract.preparedState === 'confirmed' &&
      (report.lockedAt !== null ||
        report.lockedBy !== null ||
        report.archivedAt !== null ||
        report.archivedBy !== null)) ||
    (terminalArchived &&
      (!report.lockedAt ||
        !report.lockedBy ||
        !report.archivedAt ||
        !report.archivedBy ||
        report.voidedAt !== null ||
        report.voidedBy !== null)) ||
    (input.contract.preparedState === 'corrected' &&
      report.correctionRecords.length !== 1) ||
    (terminalVoided &&
      (!report.voidedAt ||
        !report.voidedBy ||
        !report.voidReason ||
        report.lockedAt !== null ||
        report.archivedAt !== null)) ||
    (input.contract.preparedState !== 'corrected' &&
      report.correctionRecords.length !== 0) ||
    report.confirmation?.signatureText !== undefined
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_REPORT_STATE_INVALID',
      'ClinicalReport differs from the fixed legal B11 prepared state',
      input.profile,
      input.root.scenarioKey,
      input.root.routeKey,
      'prepared',
    );
  }
}

export function buildB11RouteBaseline(input: {
  root: B11RouteRoot;
  profile: B11Profile;
  namespace: string;
  contract: B11RouteDefinition;
  canonicalSeedHash: string;
}): B11RouteBaseline {
  const updatedAt = reportUpdatedAt(input.root.report);
  if (!updatedAt) {
    throw new B11FixtureError(
      'B11_FIXTURE_REPORT_STATE_INVALID',
      'Prepared report is missing updatedAt',
      input.profile,
      input.root.scenarioKey,
      input.root.routeKey,
    );
  }
  return {
    version: 1,
    profile: input.profile,
    namespace: input.namespace,
    scenarioKey: input.root.scenarioKey,
    routeKey: input.root.routeKey,
    preparedState: input.contract.preparedState,
    reportHash: stableB11Hash(fullReportValue(input.root.report)),
    protectedReportHash: stableB11Hash(protectedReportValue(input.root.report)),
    clinicianHash: stableB11Hash(clinicianNarrative(input.root.report)),
    patientHash: stableB11Hash(patientInvariant(input.root)),
    visitHash: stableB11Hash(visitInvariant(input.root)),
    instanceHash: stableB11Hash(instanceInvariant(input.root)),
    initialUpdatedAt: updatedAt.toISOString(),
    editCount: editCount(input.root.report),
    hasSubmission: hasSubmission(input.root.report),
    hasConfirmation: hasConfirmation(input.root.report),
    canonicalSeedHash: input.canonicalSeedHash,
  };
}

export function readB11RouteBaseline(
  root: B11RouteRoot,
  profile: B11Profile,
  namespace: string,
): B11RouteBaseline {
  const fixture = isRecord(root.patient.metadata)
    ? root.patient.metadata.b11Fixture
    : null;
  const baseline = isRecord(fixture) ? fixture.baseline : null;
  if (
    !isRecord(baseline) ||
    baseline.version !== 1 ||
    baseline.profile !== profile ||
    baseline.namespace !== namespace ||
    baseline.scenarioKey !== root.scenarioKey ||
    baseline.routeKey !== root.routeKey ||
    typeof baseline.reportHash !== 'string' ||
    typeof baseline.protectedReportHash !== 'string' ||
    typeof baseline.clinicianHash !== 'string' ||
    typeof baseline.patientHash !== 'string' ||
    typeof baseline.visitHash !== 'string' ||
    typeof baseline.instanceHash !== 'string' ||
    typeof baseline.initialUpdatedAt !== 'string' ||
    typeof baseline.editCount !== 'number' ||
    typeof baseline.hasSubmission !== 'boolean' ||
    typeof baseline.hasConfirmation !== 'boolean' ||
    typeof baseline.canonicalSeedHash !== 'string'
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_BASELINE_INVALID',
      'Route baseline is missing or unsafe',
      profile,
      root.scenarioKey,
      root.routeKey,
    );
  }
  return baseline as B11RouteBaseline;
}

function stageMarker(
  report: ClinicalReportDocument,
): Record<string, unknown> | null {
  const value = isRecord(report.metadata)
    ? report.metadata.b11FixtureStage
    : null;
  return isRecord(value) ? value : null;
}

function assertStageMarker(input: {
  report: ClinicalReportDocument;
  fixtureMutation: B11FixtureMutationClass;
  profile: B11Profile;
  namespace: string;
  scenarioKey: string;
  routeKey: string;
}): void {
  const marker = stageMarker(input.report);
  const expectedTransition =
    input.fixtureMutation === 'fixture_confirmation_conflict_touch_only'
      ? 'confirmation-conflict-touch'
      : null;
  if (
    (expectedTransition === null && marker !== null) ||
    (expectedTransition !== null &&
      (!marker ||
        marker.version !== 1 ||
        marker.profile !== input.profile ||
        marker.namespace !== input.namespace ||
        marker.scenarioKey !== input.scenarioKey ||
        marker.routeKey !== input.routeKey ||
        marker.transition !== expectedTransition))
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_STAGE_DRIFT',
      'Fixture Stage marker differs from the fixed route contract',
      input.profile,
      input.scenarioKey,
      input.routeKey,
      'post-browser',
    );
  }
}

function expectedEditDelta(mutation: B11ProductMutationClass): number {
  if (mutation === 'edit_once' || mutation === 'secondary_edit_only') return 1;
  if (mutation === 'edit_twice_after_conflict_continue') return 2;
  return 0;
}

function expectedSubmissionAdded(mutation: B11ProductMutationClass): boolean {
  return mutation === 'submit_once' || mutation === 'secondary_submit_only';
}

function expectedConfirmationAdded(mutation: B11ProductMutationClass): boolean {
  return mutation === 'confirm_once' || mutation === 'secondary_confirm_only';
}

function expectsUpdatedAtChange(
  productMutation: B11ProductMutationClass,
  fixtureMutation: B11FixtureMutationClass,
): boolean {
  return (
    productMutation !== 'none' ||
    fixtureMutation === 'fixture_confirmation_conflict_touch_only'
  );
}

export function assertB11RouteAgainstBaseline(input: {
  root: B11RouteRoot;
  baseline: B11RouteBaseline;
  contract: B11RouteDefinition;
  profile: B11Profile;
  namespace: string;
  phase: B11VerifyPhase;
}): void {
  const currentUpdatedAt = reportUpdatedAt(input.root.report);
  const product = input.contract.expectedProductMutationClass;
  const fixture = input.contract.expectedFixtureOwnedMutationClass;
  const currentEdits = editCount(input.root.report);
  const expectedEdits = input.baseline.editCount + expectedEditDelta(product);
  const expectedSubmission =
    input.baseline.hasSubmission || expectedSubmissionAdded(product);
  const expectedConfirmation =
    input.baseline.hasConfirmation || expectedConfirmationAdded(product);
  const protectedHash = stableB11Hash(protectedReportValue(input.root.report));
  const patientHash = stableB11Hash(patientInvariant(input.root));
  const visitHash = stableB11Hash(visitInvariant(input.root));
  const instanceHash = stableB11Hash(instanceInvariant(input.root));
  const unchangedRoute = product === 'none' && fixture === 'none';
  const reportMustRemainExact =
    unchangedRoute || fixture === 'fixture_forbidden_role_only';
  const editMutation = expectedEditDelta(product) > 0;
  const submissionMutation = expectedSubmissionAdded(product);
  const confirmationMutation = expectedConfirmationAdded(product);
  const currentClinicianHash = stableB11Hash(
    clinicianNarrative(input.root.report),
  );
  if (
    !currentUpdatedAt ||
    protectedHash !== input.baseline.protectedReportHash ||
    patientHash !== input.baseline.patientHash ||
    visitHash !== input.baseline.visitHash ||
    instanceHash !== input.baseline.instanceHash ||
    currentEdits !== expectedEdits ||
    hasSubmission(input.root.report) !== expectedSubmission ||
    hasConfirmation(input.root.report) !== expectedConfirmation ||
    (expectsUpdatedAtChange(product, fixture)
      ? currentUpdatedAt.toISOString() === input.baseline.initialUpdatedAt
      : currentUpdatedAt.toISOString() !== input.baseline.initialUpdatedAt) ||
    (reportMustRemainExact &&
      stableB11Hash(fullReportValue(input.root.report)) !==
        input.baseline.reportHash) ||
    (editMutation
      ? currentClinicianHash === input.baseline.clinicianHash ||
        input.root.report.status !== 'draft' ||
        input.root.report.source !== 'mixed'
      : currentClinicianHash !== input.baseline.clinicianHash) ||
    (submissionMutation &&
      (input.root.report.status !== 'pending_confirmation' ||
        input.root.report.source !== 'mixed' ||
        input.root.report.confirmation !== null)) ||
    (confirmationMutation &&
      (input.root.report.status !== 'confirmed' ||
        input.root.report.source !== 'mixed' ||
        input.root.report.qualityStatus !== 'passed' ||
        !input.root.report.confirmation ||
        input.root.report.lockedAt !== null)) ||
    (fixture === 'fixture_confirmation_conflict_touch_only' &&
      (input.root.report.status !== 'pending_confirmation' ||
        input.root.report.confirmation !== null))
  ) {
    throw new B11FixtureError(
      'B11_FIXTURE_POST_BROWSER_MUTATION_INVALID',
      'Route product, audit, field, timestamp, Stage, or protected-source delta differs from contract',
      input.profile,
      input.root.scenarioKey,
      input.root.routeKey,
      input.phase,
    );
  }
  assertStageMarker({
    report: input.root.report,
    fixtureMutation: fixture,
    profile: input.profile,
    namespace: input.namespace,
    scenarioKey: input.root.scenarioKey,
    routeKey: input.root.routeKey,
  });
}

export function preparedHashForBaselines(
  baselines: readonly B11RouteBaseline[],
): string {
  return stableB11Hash(
    baselines
      .map((baseline) => ({
        scenarioKey: baseline.scenarioKey,
        routeKey: baseline.routeKey,
        preparedState: baseline.preparedState,
        reportHash: baseline.reportHash,
        protectedReportHash: baseline.protectedReportHash,
        patientHash: baseline.patientHash,
        visitHash: baseline.visitHash,
        instanceHash: baseline.instanceHash,
      }))
      .sort(
        (left, right) =>
          left.scenarioKey.localeCompare(right.scenarioKey) ||
          left.routeKey.localeCompare(right.routeKey),
      ),
  );
}

export function objectIdStrings(values: readonly Types.ObjectId[]): string[] {
  return values.map((value) => value.toString());
}
