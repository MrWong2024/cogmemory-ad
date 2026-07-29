import { createHash } from 'crypto';
import {
  isClinicalReportA20GenerationMetadata,
  readClinicalReportConfirmation,
  readClinicalReportEditEvents,
  readClinicalReportSubmission,
} from '../../../src/modules/reports/lib/clinical-report-review';
import { resolveExistingClinicalReportLock } from '../../../src/modules/reports/lib/clinical-report-lock';
import type { ClinicalReportDocument } from '../../../src/modules/reports/schemas/clinical-report.schema';
import type { ClinicalReportSummary } from '../../../src/modules/reports/services/reports.service';
import { b12RouteDate, type B12RouteRoot } from './fixture-builder';
import {
  B12FixtureError,
  type B12FixtureMutationClass,
  type B12PreparedState,
  type B12ProductMutationClass,
  type B12Profile,
  type B12RouteDefinition,
  type B12StageTransition,
  type B12VerifyPhase,
} from './fixture-types';

export type B12RouteBaseline = {
  version: 1;
  profile: B12Profile;
  namespace: string;
  scenarioKey: string;
  routeKey: string;
  preparedState: B12PreparedState;
  reportHash: string;
  protectedReportHash: string;
  metadataHash: string;
  narrativeSnapshotHash: string;
  patientHash: string;
  visitHash: string;
  instanceHash: string;
  initialUpdatedAt: string;
  a22LockCount: number;
  canonicalSeedHash: string;
};

export type B12RouteProgressState =
  | 'prepared'
  | 'product-completed'
  | 'target-staged';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stableB12Hash(value: unknown): string {
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
    throw new B12FixtureError(
      'B12_FIXTURE_DOCUMENT_INVALID',
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

function patientMetadataWithoutFixtureProgress(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const fixture = isRecord(value.b12Fixture)
    ? { ...value.b12Fixture }
    : value.b12Fixture;
  if (isRecord(fixture)) {
    delete fixture.baseline;
    delete fixture.stage;
  }
  return { ...value, b12Fixture: fixture };
}

function patientInvariant(root: B12RouteRoot): unknown {
  const raw = withoutLifecycleTimestamps(documentObject(root.patient));
  return normalized({
    ...raw,
    metadata: patientMetadataWithoutFixtureProgress(raw.metadata),
  });
}

function visitInvariant(root: B12RouteRoot): unknown {
  return normalized(withoutLifecycleTimestamps(documentObject(root.visit)));
}

function instanceInvariant(root: B12RouteRoot): unknown {
  return normalized(withoutLifecycleTimestamps(documentObject(root.instance)));
}

function metadataWithoutA22(metadata: unknown): unknown {
  if (!isRecord(metadata)) return metadata;
  const result = { ...metadata };
  delete result.a22Lock;
  return result;
}

function narrativeSnapshotValue(report: ClinicalReportDocument): unknown {
  return normalized({
    patientSnapshot: report.patientSnapshot,
    visitSnapshot: report.visitSnapshot,
    scaleTraces: report.scaleTraces,
    scoreSnapshots: report.scoreSnapshots,
    domainSnapshots: report.domainSnapshots,
    evidenceSnapshots: report.evidenceSnapshots,
    narrative: report.narrative,
    confirmation: report.confirmation,
  });
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
    status: report.status,
    source: report.source,
    qualityStatus: report.qualityStatus,
    patientSnapshot: report.patientSnapshot,
    visitSnapshot: report.visitSnapshot,
    scaleTraces: report.scaleTraces,
    scoreSnapshots: report.scoreSnapshots,
    domainSnapshots: report.domainSnapshots,
    evidenceSnapshots: report.evidenceSnapshots,
    narrative: report.narrative,
    aiDraft: report.aiDraft,
    confirmation: report.confirmation,
    archivedAt: report.archivedAt,
    archivedBy: report.archivedBy,
    correctionRecords: report.correctionRecords,
    voidedAt: report.voidedAt,
    voidedBy: report.voidedBy,
    voidReason: report.voidReason,
    auditLogRefs: report.auditLogRefs,
    qualityHints: report.qualityHints,
    operatorNote: report.operatorNote,
    protectedMetadata: metadataWithoutA22(report.metadata),
  });
}

function fullReportValue(report: ClinicalReportDocument): unknown {
  return normalized(withoutLifecycleTimestamps(documentObject(report)));
}

function reportUpdatedAt(report: ClinicalReportDocument): Date | null {
  const value = (report as ClinicalReportDocument & { updatedAt?: Date })
    .updatedAt;
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : null;
}

function a22LockCount(report: ClinicalReportDocument): number {
  return isRecord(report.metadata) && report.metadata.a22Lock !== undefined
    ? 1
    : 0;
}

function metadataOwnershipMatches(
  report: ClinicalReportDocument,
  profile: B12Profile,
  namespace: string,
  scenarioKey: string,
  routeKey: string,
  preparedState: B12PreparedState,
): boolean {
  const marker = isRecord(report.metadata)
    ? report.metadata.b12FixtureOwnership
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

function expectedStateFacts(state: B12PreparedState) {
  const draft = state === 'draft';
  const pending = state === 'pending_confirmation';
  const confirmationMissing = state === 'confirmed_confirmation_missing';
  const locked =
    state === 'confirmed_locked' || state === 'historical_locked_fallback';
  return {
    status: draft ? 'draft' : pending ? 'pending_confirmation' : 'confirmed',
    source: draft ? 'system_draft' : 'mixed',
    qualityStatus:
      state === 'confirmed_quality_blocked' ? 'needs_review' : 'passed',
    editCount: draft ? 0 : 1,
    submission: !draft,
    confirmation: !draft && !pending && !confirmationMissing,
    isFinal: !draft && !pending,
    locked,
    historical: state === 'historical_locked_fallback',
    visitStatus:
      state === 'confirmed_v1_visit_locked'
        ? 'locked'
        : state === 'confirmed_v1_visit_voided'
          ? 'voided'
          : 'completed',
  };
}

function hasNoA23ToA25(report: ClinicalReportDocument): boolean {
  const metadata = isRecord(report.metadata) ? report.metadata : {};
  return (
    metadata.a23SourceFreeze === undefined &&
    metadata.a24Archive === undefined &&
    metadata.a25Correction === undefined &&
    report.archivedAt === null &&
    report.archivedBy === null &&
    report.correctionRecords.length === 0 &&
    report.voidedAt === null &&
    report.voidedBy === null
  );
}

export function assertB12PreparedReport(input: {
  root: B12RouteRoot;
  reportSummary: ClinicalReportSummary;
  profile: B12Profile;
  namespace: string;
  contract: B12RouteDefinition;
  publicIsFinal: boolean;
  publicLock: unknown;
}): void {
  const { report, instance, visit } = input.root;
  const facts = expectedStateFacts(input.contract.preparedState);
  const generation = isRecord(report.metadata)
    ? report.metadata.a20Generation
    : null;
  const editEvents = readClinicalReportEditEvents(report.metadata ?? null);
  const submission = readClinicalReportSubmission(report.metadata ?? null);
  const confirmationAudit = readClinicalReportConfirmation(
    report.metadata ?? null,
  );
  const lockAudit = isRecord(report.metadata)
    ? report.metadata.a22Lock
    : undefined;
  let resolvedLock: ReturnType<typeof resolveExistingClinicalReportLock> = null;
  try {
    resolvedLock = resolveExistingClinicalReportLock(input.reportSummary);
  } catch {
    resolvedLock = null;
  }
  const narrative = report.narrative;
  const validLocked = facts.locked
    ? Boolean(
        report.lockedAt &&
        report.lockedBy &&
        resolvedLock &&
        (facts.historical
          ? resolvedLock.lockId === null &&
            resolvedLock.lockedBy.operatorRole === 'unknown' &&
            lockAudit === undefined
          : typeof resolvedLock.lockId === 'string' &&
            resolvedLock.lockedBy.operatorRole === 'doctor' &&
            typeof resolvedLock.lockNote === 'string' &&
            isRecord(lockAudit)),
      )
    : report.lockedAt === null &&
      report.lockedBy === null &&
      resolvedLock === null &&
      lockAudit === undefined;
  if (
    report.reportType !== 'cognitive_assessment' ||
    report.reportVersion !== 1 ||
    report.status !== facts.status ||
    report.source !== facts.source ||
    report.qualityStatus !== facts.qualityStatus ||
    visit.status !== facts.visitStatus ||
    !reportUpdatedAt(report) ||
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
    (editEvents?.length ?? 0) !== facts.editCount ||
    Boolean(submission) !== facts.submission ||
    Boolean(confirmationAudit) !== facts.confirmation ||
    Boolean(report.confirmation) !== facts.confirmation ||
    input.publicIsFinal !== facts.isFinal ||
    Boolean(input.publicLock) !== facts.locked ||
    !validLocked ||
    !metadataOwnershipMatches(
      report,
      input.profile,
      input.namespace,
      input.root.scenarioKey,
      input.root.routeKey,
      input.contract.preparedState,
    ) ||
    (facts.source === 'system_draft' &&
      (narrative.doctorOpinion !== undefined ||
        narrative.recommendationText !== undefined)) ||
    (facts.source === 'mixed' &&
      (!narrative.doctorOpinion || !narrative.recommendationText)) ||
    !hasNoA23ToA25(report) ||
    report.confirmation?.signatureText !== undefined ||
    (input.contract.boundaryType === 'controlled_public_read_boundary' &&
      !['confirmed_unlocked', 'confirmed_locked'].includes(
        input.contract.preparedState,
      ))
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_REPORT_STATE_INVALID',
      'ClinicalReport differs from the fixed legal B12 prepared state',
      input.profile,
      input.root.scenarioKey,
      input.root.routeKey,
      'prepared',
    );
  }
}

export function buildB12RouteBaseline(input: {
  root: B12RouteRoot;
  profile: B12Profile;
  namespace: string;
  contract: B12RouteDefinition;
  canonicalSeedHash: string;
}): B12RouteBaseline {
  const updatedAt = reportUpdatedAt(input.root.report);
  if (!updatedAt) {
    throw new B12FixtureError(
      'B12_FIXTURE_REPORT_STATE_INVALID',
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
    reportHash: stableB12Hash(fullReportValue(input.root.report)),
    protectedReportHash: stableB12Hash(protectedReportValue(input.root.report)),
    metadataHash: stableB12Hash(normalized(input.root.report.metadata)),
    narrativeSnapshotHash: stableB12Hash(
      narrativeSnapshotValue(input.root.report),
    ),
    patientHash: stableB12Hash(patientInvariant(input.root)),
    visitHash: stableB12Hash(visitInvariant(input.root)),
    instanceHash: stableB12Hash(instanceInvariant(input.root)),
    initialUpdatedAt: updatedAt.toISOString(),
    a22LockCount: a22LockCount(input.root.report),
    canonicalSeedHash: input.canonicalSeedHash,
  };
}

export function readB12RouteBaseline(
  root: B12RouteRoot,
  profile: B12Profile,
  namespace: string,
): B12RouteBaseline {
  const fixture = isRecord(root.patient.metadata)
    ? root.patient.metadata.b12Fixture
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
    typeof baseline.metadataHash !== 'string' ||
    typeof baseline.narrativeSnapshotHash !== 'string' ||
    typeof baseline.patientHash !== 'string' ||
    typeof baseline.visitHash !== 'string' ||
    typeof baseline.instanceHash !== 'string' ||
    typeof baseline.initialUpdatedAt !== 'string' ||
    typeof baseline.a22LockCount !== 'number' ||
    typeof baseline.canonicalSeedHash !== 'string'
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_BASELINE_INVALID',
      'Route baseline is missing or unsafe',
      profile,
      root.scenarioKey,
      root.routeKey,
    );
  }
  return baseline as B12RouteBaseline;
}

function fixtureStage(root: B12RouteRoot): Record<string, unknown> | null {
  const fixture = isRecord(root.patient.metadata)
    ? root.patient.metadata.b12Fixture
    : null;
  const value = isRecord(fixture) ? fixture.stage : null;
  return isRecord(value) ? value : null;
}

function expectedTransition(
  mutation: B12FixtureMutationClass,
): B12StageTransition | null {
  const transitions: Record<
    Exclude<B12FixtureMutationClass, 'none'>,
    B12StageTransition
  > = {
    fixture_conflict_touch_only: 'lock-conflict-touch',
    fixture_conflict_latest_locked_touch_only:
      'lock-conflict-latest-locked-touch',
    fixture_audit_unavailable_only: 'lock-audit-unavailable',
    fixture_metadata_unsupported_only: 'lock-metadata-unsupported',
    fixture_forbidden_role_only: 'forbidden-lock-role',
  };
  return mutation === 'none' ? null : transitions[mutation];
}

function assertStageMarker(input: {
  root: B12RouteRoot;
  fixtureMutation: B12FixtureMutationClass;
  profile: B12Profile;
  namespace: string;
}): void {
  const marker = fixtureStage(input.root);
  const transition = expectedTransition(input.fixtureMutation);
  if (
    (transition === null && marker !== null) ||
    (transition !== null &&
      (!marker ||
        marker.version !== 1 ||
        marker.profile !== input.profile ||
        marker.namespace !== input.namespace ||
        marker.scenarioKey !== input.root.scenarioKey ||
        marker.routeKey !== input.root.routeKey ||
        marker.transition !== transition))
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_STAGE_DRIFT',
      'Fixture Stage marker differs from the fixed route contract',
      input.profile,
      input.root.scenarioKey,
      input.root.routeKey,
      'post-browser',
    );
  }
}

function expectedLockRole(
  mutation: B12ProductMutationClass,
): 'doctor' | 'admin' | null {
  return mutation === 'lock_once_admin'
    ? 'admin'
    : mutation === 'lock_once_doctor' ||
        mutation === 'fixture_touch_plus_lock_once' ||
        mutation === 'fixture_touch_plus_secondary_lock_once'
      ? 'doctor'
      : null;
}

function assertLegalProductLock(input: {
  report: ClinicalReportDocument;
  reportSummary: ClinicalReportSummary;
  expectedRole: 'doctor' | 'admin';
  baseline: B12RouteBaseline;
}): void {
  let lock: ReturnType<typeof resolveExistingClinicalReportLock> = null;
  try {
    lock = resolveExistingClinicalReportLock(input.reportSummary);
  } catch {
    lock = null;
  }
  if (
    !lock ||
    !lock.lockId ||
    lock.lockedBy.operatorRole !== input.expectedRole ||
    !lock.lockedBy.operatorName ||
    !lock.lockNote ||
    input.report.status !== 'confirmed' ||
    input.report.qualityStatus !== 'passed' ||
    input.report.lockedAt === null ||
    input.report.lockedBy === null ||
    a22LockCount(input.report) !== input.baseline.a22LockCount + 1 ||
    stableB12Hash(protectedReportValue(input.report)) !==
      input.baseline.protectedReportHash ||
    stableB12Hash(narrativeSnapshotValue(input.report)) !==
      input.baseline.narrativeSnapshotHash ||
    !hasNoA23ToA25(input.report)
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_POST_BROWSER_MUTATION_INVALID',
      'A22 product lock differs from the one-lock actor and protected-field contract',
    );
  }
}

function assertFixtureMutation(input: {
  root: B12RouteRoot;
  baseline: B12RouteBaseline;
  fixture: B12FixtureMutationClass;
  product: B12ProductMutationClass;
  profile: B12Profile;
  namespace: string;
}): void {
  const report = input.root.report;
  const updatedAt = reportUpdatedAt(report);
  const ordinalMarker = isRecord(input.root.patient.metadata)
    ? input.root.patient.metadata.b12Fixture
    : null;
  const ordinal = isRecord(ordinalMarker) ? ordinalMarker.routeOrdinal : null;
  const fixedStageTime =
    typeof ordinal === 'number' ? b12RouteDate(ordinal, 500_000) : null;
  const reportHash = stableB12Hash(fullReportValue(report));
  const metadataHash = stableB12Hash(normalized(report.metadata));
  const productLock = expectedLockRole(input.product) !== null;
  if (!updatedAt) {
    throw new B12FixtureError(
      'B12_FIXTURE_POST_BROWSER_MUTATION_INVALID',
      'Report timestamp is missing',
    );
  }
  if (input.fixture === 'none') {
    if (!productLock && reportHash !== input.baseline.reportHash) {
      throw new B12FixtureError(
        'B12_FIXTURE_POST_BROWSER_MUTATION_INVALID',
        'Zero-mutation route changed its report',
      );
    }
    return;
  }
  if (!fixedStageTime) {
    throw new B12FixtureError(
      'B12_FIXTURE_STAGE_DRIFT',
      'Fixture marker does not contain its fixed ordinal',
    );
  }
  if (
    input.fixture === 'fixture_conflict_touch_only' ||
    input.fixture === 'fixture_conflict_latest_locked_touch_only'
  ) {
    if (
      (!productLock && reportHash !== input.baseline.reportHash) ||
      (!productLock && updatedAt.getTime() !== fixedStageTime.getTime()) ||
      metadataHash !==
        (productLock
          ? stableB12Hash(normalized(report.metadata))
          : input.baseline.metadataHash)
    ) {
      throw new B12FixtureError(
        'B12_FIXTURE_POST_BROWSER_MUTATION_INVALID',
        'Conflict Stage changed fields beyond the controlled timestamp and marker',
      );
    }
    return;
  }
  if (input.fixture === 'fixture_audit_unavailable_only') {
    if (
      report.lockedAt?.getTime() !== fixedStageTime.getTime() ||
      report.lockedBy !== null ||
      a22LockCount(report) !== input.baseline.a22LockCount ||
      metadataHash !== input.baseline.metadataHash ||
      stableB12Hash(protectedReportValue(report)) !==
        input.baseline.protectedReportHash ||
      updatedAt.getTime() !== fixedStageTime.getTime()
    ) {
      throw new B12FixtureError(
        'B12_FIXTURE_POST_BROWSER_MUTATION_INVALID',
        'Audit-unavailable Stage differs from its exact inconsistent lock fact',
      );
    }
    return;
  }
  if (input.fixture === 'fixture_metadata_unsupported_only') {
    const expectedMetadata = {
      a20Generation: { b12UnsupportedRoot: true },
    };
    if (
      stableB12Hash(normalized(report.metadata)) !==
        stableB12Hash(normalized(expectedMetadata)) ||
      updatedAt.getTime() !== fixedStageTime.getTime() ||
      report.lockedAt !== null ||
      report.lockedBy !== null ||
      stableB12Hash(narrativeSnapshotValue(report)) !==
        input.baseline.narrativeSnapshotHash ||
      !hasNoA23ToA25(report)
    ) {
      throw new B12FixtureError(
        'B12_FIXTURE_POST_BROWSER_MUTATION_INVALID',
        'Metadata-unsupported Stage differs from its exact fixed root structure',
      );
    }
    return;
  }
  if (reportHash !== input.baseline.reportHash) {
    throw new B12FixtureError(
      'B12_FIXTURE_POST_BROWSER_MUTATION_INVALID',
      'Forbidden-role Stage changed the report',
    );
  }
}

export function assertB12RouteAgainstBaseline(input: {
  root: B12RouteRoot;
  reportSummary: ClinicalReportSummary;
  baseline: B12RouteBaseline;
  contract: B12RouteDefinition;
  profile: B12Profile;
  namespace: string;
  phase: B12VerifyPhase;
}): void {
  if (
    stableB12Hash(patientInvariant(input.root)) !==
      input.baseline.patientHash ||
    stableB12Hash(visitInvariant(input.root)) !== input.baseline.visitHash ||
    stableB12Hash(instanceInvariant(input.root)) !== input.baseline.instanceHash
  ) {
    throw new B12FixtureError(
      'B12_FIXTURE_SOURCE_ROOT_DRIFT',
      'Patient, Visit, or ScaleInstance changed outside the B12 contract',
      input.profile,
      input.root.scenarioKey,
      input.root.routeKey,
      input.phase,
    );
  }
  assertStageMarker({
    root: input.root,
    fixtureMutation: input.contract.expectedFixtureOwnedMutationClass,
    profile: input.profile,
    namespace: input.namespace,
  });
  const expectedRole = expectedLockRole(
    input.contract.expectedProductMutationClass,
  );
  if (expectedRole) {
    assertLegalProductLock({
      report: input.root.report,
      reportSummary: input.reportSummary,
      expectedRole,
      baseline: input.baseline,
    });
  }
  assertFixtureMutation({
    root: input.root,
    baseline: input.baseline,
    fixture: input.contract.expectedFixtureOwnedMutationClass,
    product: input.contract.expectedProductMutationClass,
    profile: input.profile,
    namespace: input.namespace,
  });
}

export function assertB12RouteProgress(input: {
  root: B12RouteRoot;
  reportSummary: ClinicalReportSummary;
  baseline: B12RouteBaseline;
  contract: B12RouteDefinition;
  profile: B12Profile;
  namespace: string;
  target: boolean;
  targetStaged: boolean;
}): B12RouteProgressState {
  const assertRoute = (
    expectedProductMutationClass: B12ProductMutationClass,
    expectedFixtureOwnedMutationClass: B12FixtureMutationClass,
  ): void =>
    assertB12RouteAgainstBaseline({
      root: input.root,
      reportSummary: input.reportSummary,
      baseline: input.baseline,
      contract: {
        ...input.contract,
        expectedProductMutationClass,
        expectedFixtureOwnedMutationClass,
      },
      profile: input.profile,
      namespace: input.namespace,
      phase: 'post-browser',
    });
  if (input.target) {
    if (input.targetStaged) {
      assertRoute('none', input.contract.expectedFixtureOwnedMutationClass);
      return 'target-staged';
    }
    assertRoute('none', 'none');
    return 'prepared';
  }
  try {
    assertRoute('none', 'none');
    return 'prepared';
  } catch (preparedError: unknown) {
    if (
      (input.contract.expectedProductMutationClass === 'none' ||
        input.contract.expectedProductMutationClass ===
          'already_locked_readonly') &&
      input.contract.expectedFixtureOwnedMutationClass === 'none'
    ) {
      throw preparedError;
    }
  }
  assertRoute(
    input.contract.expectedProductMutationClass,
    input.contract.expectedFixtureOwnedMutationClass,
  );
  return 'product-completed';
}

export function preparedHashForBaselines(
  baselines: readonly B12RouteBaseline[],
): string {
  return stableB12Hash(
    baselines
      .map((baseline) => ({
        scenarioKey: baseline.scenarioKey,
        routeKey: baseline.routeKey,
        preparedState: baseline.preparedState,
        reportHash: baseline.reportHash,
        protectedReportHash: baseline.protectedReportHash,
        narrativeSnapshotHash: baseline.narrativeSnapshotHash,
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
