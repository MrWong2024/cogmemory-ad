import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import type { B12OwnerJournalRecord } from "../execution/b12-owner-result-journal";
import { safeJsonStringify } from "../../support/safe-output";
import {
  B12_G3_A3_PROFILE_VERIFIER_RESULTS,
  computeB12CoreAuditClosure,
  type B12G3A3ProfileVerifierResult,
} from "./b12-g3-a3-core-evidence";
import {
  B12_G3_A3_CORE_DIRECT_AUDIT_IDS,
  B12_G3_A3_CORE_GROUPS,
  B12_G3_A3_CORE_OWNERS,
  b12G3A3CoreOwnersFor,
} from "./b12-g3-a3-core-registry";
import {
  b12G3A3CoreJournalTarget,
  readB12G3A3CoreJournalDocument,
  validateB12G3A3CoreJournalDocument,
  type B12G3A3CoreJournalDocument,
} from "./b12-g3-a3-core-journal";
import {
  B12_G3_A3_AUDIT_CLOSURE_RESULTS,
  B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A3_CORE_EVIDENCE_SCOPE,
  B12_G3_A3_CORE_EXECUTION_GROUPS,
  B12_G3_A3_CORE_PROFILE_ARTIFACT_VERSION,
  B12_G3_A3_CORE_PROFILE_EVIDENCE_SCOPE,
  B12_G3_A3_CORE_PROFILE_PHASE,
  B12_G3_A3_PROFILE_FINAL_CLOSURE_SCOPE,
  type B12G3A3AuditClosureEntry,
  type B12G3A3CoreExecutionGroup,
  type B12G3A3CoreGroupOutcome,
} from "./b12-g3-a3-formal-types";

export type B12G3A3CoreProfileGroupOutcome = Readonly<
  { executionGroup: B12G3A3CoreExecutionGroup } & B12G3A3CoreGroupOutcome
>;

export type B12G3A3CoreProfileCounts = Readonly<{
  passed: number;
  failed: number;
  blocked: number;
  notExecuted: number;
}>;

export type B12G3A3CoreProfileAuditIdIntegrity = Readonly<{
  expected: number;
  actual: number;
  missing: number;
  duplicate: number;
  nonCore: number;
}>;

export type B12G3A3CoreProfileEvidenceArtifact = Readonly<{
  version: typeof B12_G3_A3_CORE_PROFILE_ARTIFACT_VERSION;
  phase: typeof B12_G3_A3_CORE_PROFILE_PHASE;
  evidenceScope: typeof B12_G3_A3_CORE_PROFILE_EVIDENCE_SCOPE;
  auditClosureAllowed: typeof B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED;
  closureScope: typeof B12_G3_A3_PROFILE_FINAL_CLOSURE_SCOPE;
  profileVerifierResult: B12G3A3ProfileVerifierResult;
  groupCount: number;
  ownerCount: number;
  groupOutcomes: readonly B12G3A3CoreProfileGroupOutcome[];
  auditClosureSnapshot: readonly B12G3A3AuditClosureEntry[];
  auditIdIntegrity: B12G3A3CoreProfileAuditIdIntegrity;
  counts: B12G3A3CoreProfileCounts;
  profilePassed: boolean;
}>;

const ARTIFACT_KEYS = [
  "auditClosureAllowed",
  "auditClosureSnapshot",
  "auditIdIntegrity",
  "closureScope",
  "counts",
  "evidenceScope",
  "groupCount",
  "groupOutcomes",
  "ownerCount",
  "phase",
  "profilePassed",
  "profileVerifierResult",
  "version",
] as const;

const PROFILE_GROUP_OUTCOME_KEYS = [
  "allMinimalCleanupCompleted",
  "allOwnersFinalized",
  "allOwnersPassed",
  "executionGroup",
  "expectedOwnerCount",
  "groupCleanupSucceeded",
  "groupSetupSucceeded",
  "operationallyPassed",
  "ownerCount",
  "profileCompletionBlockedByGroup",
  "stopReason",
] as const;

const CLOSURE_ENTRY_KEYS = [
  "auditId",
  "closureBlockedBySupportingOwner",
  "directOwner",
  "result",
] as const;

const INTEGRITY_KEYS = [
  "actual",
  "duplicate",
  "expected",
  "missing",
  "nonCore",
] as const;

const COUNTS_KEYS = ["blocked", "failed", "notExecuted", "passed"] as const;

const CORE_OWNER_BY_AUDIT_ID = new Map<
  string,
  (typeof B12_G3_A3_CORE_OWNERS)[number]
>(
  B12_G3_A3_CORE_OWNERS.flatMap((owner) =>
    owner.directAuditIds.map((auditId) => [auditId, owner] as const),
  ),
);

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function copyClosureEntry(
  entry: B12G3A3AuditClosureEntry,
): B12G3A3AuditClosureEntry {
  return Object.freeze({ ...entry });
}

function assertOperationalGroupOutcome(
  executionGroup: B12G3A3CoreExecutionGroup,
  outcome: B12G3A3CoreGroupOutcome,
  ownerRecordCount: number,
): void {
  const expectedOwnerCount = b12G3A3CoreOwnersFor(executionGroup).length;
  if (
    !outcome.operationallyPassed ||
    !outcome.groupSetupSucceeded ||
    !outcome.groupCleanupSucceeded ||
    outcome.profileCompletionBlockedByGroup ||
    outcome.stopReason !== "none" ||
    outcome.ownerCount !== ownerRecordCount ||
    outcome.ownerCount !== expectedOwnerCount ||
    outcome.expectedOwnerCount !== expectedOwnerCount ||
    !outcome.allOwnersFinalized ||
    !outcome.allOwnersPassed ||
    !outcome.allMinimalCleanupCompleted
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_GROUP_OUTCOME_REJECTED");
  }
}

function validateOwnerRecords(
  journals: readonly B12G3A3CoreJournalDocument[],
): readonly B12OwnerJournalRecord[] {
  const registryByOwner = new Map(
    B12_G3_A3_CORE_OWNERS.map((owner) => [owner.auditOwner, owner]),
  );
  const recordsByOwner = new Map<string, B12OwnerJournalRecord>();
  const mergedRecords: B12OwnerJournalRecord[] = [];
  for (const journal of journals) {
    const expectedOwners = b12G3A3CoreOwnersFor(journal.executionGroup);
    if (journal.ownerRecords.length !== expectedOwners.length) {
      throw new Error("B12_FORMAL_CORE_PROFILE_GROUP_OWNER_COUNT_INVALID");
    }
    for (const record of journal.ownerRecords) {
      if (recordsByOwner.has(record.auditOwner)) {
        throw new Error("B12_FORMAL_CORE_PROFILE_OWNER_DUPLICATE");
      }
      const definition = registryByOwner.get(record.auditOwner);
      if (!definition) {
        throw new Error("B12_FORMAL_CORE_PROFILE_OWNER_NOT_REGISTERED");
      }
      if (
        record.executionGroup !== journal.executionGroup ||
        definition.executionGroup !== journal.executionGroup
      ) {
        throw new Error("B12_FORMAL_CORE_PROFILE_OWNER_GROUP_MISMATCH");
      }
      if (
        record.fixtureCluster !== definition.fixtureCluster ||
        !arraysEqual(record.directAuditIds, definition.directAuditIds)
      ) {
        throw new Error("B12_FORMAL_CORE_PROFILE_OWNER_REGISTRY_MISMATCH");
      }
      if (
        !record.started ||
        record.result !== "pass" ||
        record.failureCategory !== "none" ||
        !record.businessAssertionsCompleted ||
        !record.routeNetworkCompleted ||
        !record.minimalCleanupCompleted
      ) {
        throw new Error("B12_FORMAL_CORE_PROFILE_OWNER_NOT_PASSED");
      }
      recordsByOwner.set(record.auditOwner, record);
      mergedRecords.push(record);
    }
  }
  if (mergedRecords.length !== B12_G3_A3_CORE_OWNERS.length) {
    throw new Error("B12_FORMAL_CORE_PROFILE_OWNER_COUNT_INVALID");
  }
  for (const owner of B12_G3_A3_CORE_OWNERS) {
    if (!recordsByOwner.has(owner.auditOwner)) {
      throw new Error("B12_FORMAL_CORE_PROFILE_OWNER_MISSING");
    }
  }
  return Object.freeze([...mergedRecords]);
}

function validateProfileJournals(
  sourceJournals: readonly B12G3A3CoreJournalDocument[],
): Readonly<{
  journals: readonly B12G3A3CoreJournalDocument[];
  ownerRecords: readonly B12OwnerJournalRecord[];
}> {
  if (sourceJournals.length !== B12_G3_A3_CORE_GROUPS.length) {
    throw new Error("B12_FORMAL_CORE_PROFILE_GROUP_COUNT_INVALID");
  }
  const journalsByGroup = new Map<
    B12G3A3CoreExecutionGroup,
    B12G3A3CoreJournalDocument
  >();
  for (const sourceJournal of sourceJournals) {
    const journal = validateB12G3A3CoreJournalDocument(sourceJournal);
    if (journalsByGroup.has(journal.executionGroup)) {
      throw new Error("B12_FORMAL_CORE_PROFILE_GROUP_DUPLICATE");
    }
    if (
      journal.state !== "finalized" ||
      journal.groupOutcome === null ||
      journal.groupProvisionalClosureSnapshot.closureScope !==
        "group_provisional"
    ) {
      throw new Error("B12_FORMAL_CORE_PROFILE_JOURNAL_NOT_FINALIZED");
    }
    assertOperationalGroupOutcome(
      journal.executionGroup,
      journal.groupOutcome,
      journal.ownerRecords.length,
    );
    journalsByGroup.set(journal.executionGroup, journal);
  }
  const journals = B12_G3_A3_CORE_EXECUTION_GROUPS.map((executionGroup) => {
    const journal = journalsByGroup.get(executionGroup);
    if (!journal) {
      throw new Error("B12_FORMAL_CORE_PROFILE_GROUP_MISSING");
    }
    return journal;
  });
  return Object.freeze({
    journals: Object.freeze(journals),
    ownerRecords: validateOwnerRecords(journals),
  });
}

function countClosureResults(
  entries: readonly B12G3A3AuditClosureEntry[],
): B12G3A3CoreProfileCounts {
  return Object.freeze({
    passed: entries.filter(({ result }) => result === "pass").length,
    failed: entries.filter(({ result }) => result === "fail").length,
    blocked: entries.filter(({ result }) => result.startsWith("blocked_by_"))
      .length,
    notExecuted: entries.filter(({ result }) => result === "not_executed")
      .length,
  });
}

function auditIdIntegrity(
  entries: readonly B12G3A3AuditClosureEntry[],
): B12G3A3CoreProfileAuditIdIntegrity {
  const expected = new Set<string>(B12_G3_A3_CORE_DIRECT_AUDIT_IDS);
  const seen = new Set<string>();
  let duplicate = 0;
  let nonCore = 0;
  for (const { auditId } of entries) {
    if (seen.has(auditId)) duplicate += 1;
    seen.add(auditId);
    if (!expected.has(auditId)) nonCore += 1;
  }
  let missing = 0;
  for (const auditId of expected) {
    if (!seen.has(auditId)) missing += 1;
  }
  return Object.freeze({
    expected: expected.size,
    actual: entries.length,
    missing,
    duplicate,
    nonCore,
  });
}

export function aggregateB12G3A3CoreProfileEvidence(input: Readonly<{
  journals: readonly B12G3A3CoreJournalDocument[];
  profileVerifierResult: B12G3A3ProfileVerifierResult;
}>): B12G3A3CoreProfileEvidenceArtifact {
  if (!B12_G3_A3_PROFILE_VERIFIER_RESULTS.includes(input.profileVerifierResult)) {
    throw new Error("B12_FORMAL_CORE_PROFILE_VERIFIER_RESULT_INVALID");
  }
  const validated = validateProfileJournals(input.journals);
  const auditClosureSnapshot = computeB12CoreAuditClosure(
    {
      evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
      ownerRecords: validated.ownerRecords,
    },
    B12_G3_A3_CORE_OWNERS,
    input.profileVerifierResult,
  );
  const integrity = auditIdIntegrity(auditClosureSnapshot);
  const counts = countClosureResults(auditClosureSnapshot);
  const profilePassed =
    input.profileVerifierResult === "pass" &&
    integrity.expected === 62 &&
    integrity.actual === 62 &&
    integrity.missing === 0 &&
    integrity.duplicate === 0 &&
    integrity.nonCore === 0 &&
    counts.passed === 62 &&
    counts.failed === 0 &&
    counts.blocked === 0 &&
    counts.notExecuted === 0;
  const artifact = Object.freeze({
    version: B12_G3_A3_CORE_PROFILE_ARTIFACT_VERSION,
    phase: B12_G3_A3_CORE_PROFILE_PHASE,
    evidenceScope: B12_G3_A3_CORE_PROFILE_EVIDENCE_SCOPE,
    auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
    closureScope: B12_G3_A3_PROFILE_FINAL_CLOSURE_SCOPE,
    profileVerifierResult: input.profileVerifierResult,
    groupCount: validated.journals.length,
    ownerCount: validated.ownerRecords.length,
    groupOutcomes: Object.freeze(
      validated.journals.map((journal) =>
        Object.freeze({
          executionGroup: journal.executionGroup,
          ...(journal.groupOutcome as B12G3A3CoreGroupOutcome),
        }),
      ),
    ),
    auditClosureSnapshot: Object.freeze(
      auditClosureSnapshot.map(copyClosureEntry),
    ),
    auditIdIntegrity: integrity,
    counts,
    profilePassed,
  });
  return validateB12G3A3CoreProfileEvidenceArtifact(artifact);
}

function validateProfileGroupOutcome(
  value: unknown,
): B12G3A3CoreProfileGroupOutcome {
  if (
    !hasExactKeys(value, PROFILE_GROUP_OUTCOME_KEYS) ||
    typeof value.executionGroup !== "string" ||
    !(B12_G3_A3_CORE_EXECUTION_GROUPS as readonly string[]).includes(
      value.executionGroup,
    ) ||
    typeof value.groupSetupSucceeded !== "boolean" ||
    typeof value.groupCleanupSucceeded !== "boolean" ||
    typeof value.profileCompletionBlockedByGroup !== "boolean" ||
    value.stopReason !== "none" ||
    !isNonNegativeInteger(value.ownerCount) ||
    !isNonNegativeInteger(value.expectedOwnerCount) ||
    typeof value.allOwnersFinalized !== "boolean" ||
    typeof value.allOwnersPassed !== "boolean" ||
    typeof value.allMinimalCleanupCompleted !== "boolean" ||
    typeof value.operationallyPassed !== "boolean"
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_GROUP_INVALID");
  }
  const executionGroup = value.executionGroup as B12G3A3CoreExecutionGroup;
  const expectedOwnerCount = b12G3A3CoreOwnersFor(executionGroup).length;
  if (
    !value.groupSetupSucceeded ||
    !value.groupCleanupSucceeded ||
    value.profileCompletionBlockedByGroup ||
    value.ownerCount !== expectedOwnerCount ||
    value.expectedOwnerCount !== expectedOwnerCount ||
    !value.allOwnersFinalized ||
    !value.allOwnersPassed ||
    !value.allMinimalCleanupCompleted ||
    !value.operationallyPassed
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_GROUP_INVALID");
  }
  return Object.freeze({
    executionGroup,
    groupSetupSucceeded: true,
    groupCleanupSucceeded: true,
    profileCompletionBlockedByGroup: false,
    stopReason: "none" as const,
    ownerCount: value.ownerCount,
    expectedOwnerCount: value.expectedOwnerCount,
    allOwnersFinalized: true,
    allOwnersPassed: true,
    allMinimalCleanupCompleted: true,
    operationallyPassed: true,
  });
}

function expectedClosureResult(
  auditId: string,
  profileVerifierResult: B12G3A3ProfileVerifierResult,
): B12G3A3AuditClosureEntry["result"] {
  const owner = CORE_OWNER_BY_AUDIT_ID.get(auditId);
  if (!owner) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_AUDIT_ID_INVALID");
  }
  return profileVerifierResult !== "pass" &&
    owner.profileVerifierAuditIds.some((candidate) => candidate === auditId)
    ? "blocked_by_profile_verifier"
    : "pass";
}

function validateArtifactClosureEntry(
  value: unknown,
  profileVerifierResult: B12G3A3ProfileVerifierResult,
): B12G3A3AuditClosureEntry {
  if (
    !hasExactKeys(value, CLOSURE_ENTRY_KEYS) ||
    typeof value.auditId !== "string" ||
    typeof value.directOwner !== "string" ||
    typeof value.result !== "string" ||
    !(B12_G3_A3_AUDIT_CLOSURE_RESULTS as readonly string[]).includes(
      value.result,
    ) ||
    typeof value.closureBlockedBySupportingOwner !== "boolean"
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_CLOSURE_INVALID");
  }
  const definition = CORE_OWNER_BY_AUDIT_ID.get(value.auditId);
  if (
    !definition ||
    value.directOwner !== definition.auditOwner ||
    value.result !== expectedClosureResult(value.auditId, profileVerifierResult) ||
    value.closureBlockedBySupportingOwner
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_CLOSURE_INVALID");
  }
  return copyClosureEntry(value as unknown as B12G3A3AuditClosureEntry);
}

export function validateB12G3A3CoreProfileEvidenceArtifact(
  value: unknown,
): B12G3A3CoreProfileEvidenceArtifact {
  if (
    !hasExactKeys(value, ARTIFACT_KEYS) ||
    value.version !== B12_G3_A3_CORE_PROFILE_ARTIFACT_VERSION ||
    value.phase !== B12_G3_A3_CORE_PROFILE_PHASE ||
    value.evidenceScope !== B12_G3_A3_CORE_PROFILE_EVIDENCE_SCOPE ||
    value.auditClosureAllowed !== true ||
    value.closureScope !== B12_G3_A3_PROFILE_FINAL_CLOSURE_SCOPE ||
    typeof value.profileVerifierResult !== "string" ||
    !(B12_G3_A3_PROFILE_VERIFIER_RESULTS as readonly string[]).includes(
      value.profileVerifierResult,
    ) ||
    value.groupCount !== B12_G3_A3_CORE_EXECUTION_GROUPS.length ||
    value.ownerCount !== B12_G3_A3_CORE_OWNERS.length ||
    !Array.isArray(value.groupOutcomes) ||
    !Array.isArray(value.auditClosureSnapshot) ||
    typeof value.profilePassed !== "boolean"
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_INVALID");
  }
  const profileVerifierResult =
    value.profileVerifierResult as B12G3A3ProfileVerifierResult;
  const groupOutcomes = value.groupOutcomes.map(validateProfileGroupOutcome);
  if (
    groupOutcomes.length !== B12_G3_A3_CORE_EXECUTION_GROUPS.length ||
    new Set(groupOutcomes.map(({ executionGroup }) => executionGroup)).size !==
      B12_G3_A3_CORE_EXECUTION_GROUPS.length ||
    !B12_G3_A3_CORE_EXECUTION_GROUPS.every((executionGroup) =>
      groupOutcomes.some((outcome) => outcome.executionGroup === executionGroup),
    )
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_GROUP_SET_INVALID");
  }
  const auditClosureSnapshot = value.auditClosureSnapshot.map((entry) =>
    validateArtifactClosureEntry(entry, profileVerifierResult),
  );
  const integrity = auditIdIntegrity(auditClosureSnapshot);
  const counts = countClosureResults(auditClosureSnapshot);
  if (
    !hasExactKeys(value.auditIdIntegrity, INTEGRITY_KEYS) ||
    !hasExactKeys(value.counts, COUNTS_KEYS) ||
    !Object.values(value.auditIdIntegrity).every(isNonNegativeInteger) ||
    !Object.values(value.counts).every(isNonNegativeInteger) ||
    value.auditIdIntegrity.expected !== integrity.expected ||
    value.auditIdIntegrity.actual !== integrity.actual ||
    value.auditIdIntegrity.missing !== integrity.missing ||
    value.auditIdIntegrity.duplicate !== integrity.duplicate ||
    value.auditIdIntegrity.nonCore !== integrity.nonCore ||
    value.counts.passed !== counts.passed ||
    value.counts.failed !== counts.failed ||
    value.counts.blocked !== counts.blocked ||
    value.counts.notExecuted !== counts.notExecuted
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_COUNTS_INVALID");
  }
  const profilePassed =
    profileVerifierResult === "pass" &&
    integrity.expected === 62 &&
    integrity.actual === 62 &&
    integrity.missing === 0 &&
    integrity.duplicate === 0 &&
    integrity.nonCore === 0 &&
    counts.passed === 62 &&
    counts.failed === 0 &&
    counts.blocked === 0 &&
    counts.notExecuted === 0;
  if (value.profilePassed !== profilePassed) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_PASS_INVALID");
  }
  const artifact = Object.freeze({
    version: B12_G3_A3_CORE_PROFILE_ARTIFACT_VERSION,
    phase: B12_G3_A3_CORE_PROFILE_PHASE,
    evidenceScope: B12_G3_A3_CORE_PROFILE_EVIDENCE_SCOPE,
    auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
    closureScope: B12_G3_A3_PROFILE_FINAL_CLOSURE_SCOPE,
    profileVerifierResult,
    groupCount: B12_G3_A3_CORE_EXECUTION_GROUPS.length,
    ownerCount: B12_G3_A3_CORE_OWNERS.length,
    groupOutcomes: Object.freeze(groupOutcomes),
    auditClosureSnapshot: Object.freeze(auditClosureSnapshot),
    auditIdIntegrity: integrity,
    counts,
    profilePassed,
  });
  safeJsonStringify(artifact);
  return artifact;
}

export async function readB12G3A3CoreProfileJournals(): Promise<
  readonly B12G3A3CoreJournalDocument[]
> {
  return Object.freeze(
    await Promise.all(
      B12_G3_A3_CORE_EXECUTION_GROUPS.map((executionGroup) =>
        readB12G3A3CoreJournalDocument(
          b12G3A3CoreJournalTarget(executionGroup),
          executionGroup,
        ),
      ),
    ),
  );
}

export function b12G3A3CoreProfileEvidenceTarget(): string {
  return path.resolve(
    process.cwd(),
    "test-results",
    "b12-g3-a3-core-profile-evidence",
    "core-profile-evidence.json",
  );
}

export function b12G3A3CoreProfileEvidenceRunEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    env.B12_BROWSER_ACCEPTANCE_RUN === "1" &&
    env.B12_G3_A3_CORE_RUN === "1" &&
    env.B12_G3_A3_CORE_PROFILE_EVIDENCE_RUN === "1" &&
    env.B12_G3_A3_CORE_PROFILE_VERIFIER_PASS === "1"
  );
}

function assertProfileArtifactTargetShape(target: string): string {
  const outputRoot = path.resolve(process.cwd(), "test-results");
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(outputRoot, resolvedTarget);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    path.extname(resolvedTarget).toLowerCase() !== ".json"
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_TARGET_UNSAFE");
  }
  return resolvedTarget;
}

async function assertSafeArtifactDirectory(
  outputRoot: string,
  parent: string,
): Promise<void> {
  const [rootStat, parentStat, canonicalRoot, canonicalParent] =
    await Promise.all([
      lstat(outputRoot),
      lstat(parent),
      realpath(outputRoot),
      realpath(parent),
    ]);
  const canonicalRelative = path.relative(canonicalRoot, canonicalParent);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    !parentStat.isDirectory() ||
    parentStat.isSymbolicLink() ||
    canonicalRelative.startsWith("..") ||
    path.isAbsolute(canonicalRelative)
  ) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_DIRECTORY_UNSAFE");
  }
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!["EISDIR", "EINVAL", "ENOTSUP", "EPERM"].includes(code ?? "")) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function writeB12G3A3CoreProfileEvidenceArtifact(
  artifact: B12G3A3CoreProfileEvidenceArtifact,
  target: string = b12G3A3CoreProfileEvidenceTarget(),
): Promise<string> {
  const validated = validateB12G3A3CoreProfileEvidenceArtifact(artifact);
  const outputRoot = path.resolve(process.cwd(), "test-results");
  await mkdir(outputRoot, { recursive: true });
  const resolvedTarget = assertProfileArtifactTargetShape(target);
  const parent = path.dirname(resolvedTarget);
  await mkdir(parent, { recursive: true });
  await assertSafeArtifactDirectory(outputRoot, parent);
  try {
    await lstat(resolvedTarget);
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_TARGET_EXISTS");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporaryTarget = path.resolve(
    parent,
    `.${path.basename(resolvedTarget)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporaryTarget, "wx", 0o600);
    await handle.writeFile(`${safeJsonStringify(validated)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryTarget, resolvedTarget);
    await syncDirectory(parent);
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryTarget).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
  return resolvedTarget;
}

export async function readB12G3A3CoreProfileEvidenceArtifact(
  target: string = b12G3A3CoreProfileEvidenceTarget(),
): Promise<B12G3A3CoreProfileEvidenceArtifact> {
  const resolvedTarget = assertProfileArtifactTargetShape(target);
  const outputRoot = path.resolve(process.cwd(), "test-results");
  const parent = path.dirname(resolvedTarget);
  await assertSafeArtifactDirectory(outputRoot, parent);
  const targetStat = await lstat(resolvedTarget);
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_FILE_UNSAFE");
  }
  const source = await readFile(resolvedTarget, "utf8");
  if (Buffer.byteLength(source, "utf8") > 131_072) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_TOO_LARGE");
  }
  return validateB12G3A3CoreProfileEvidenceArtifact(
    JSON.parse(source) as unknown,
  );
}

export async function removeB12G3A3CoreProfileEvidenceArtifact(
  target: string = b12G3A3CoreProfileEvidenceTarget(),
): Promise<boolean> {
  const resolvedTarget = assertProfileArtifactTargetShape(target);
  try {
    await unlink(resolvedTarget);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const prefix = `.${path.basename(resolvedTarget)}.`;
  const residual = (await readdir(path.dirname(resolvedTarget))).filter(
    (name) => name.startsWith(prefix) && name.endsWith(".tmp"),
  );
  if (residual.length !== 0) {
    throw new Error("B12_FORMAL_CORE_PROFILE_ARTIFACT_TEMPORARY_REMAINS");
  }
  return true;
}
