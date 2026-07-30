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

import {
  B12_CROSS_CUTTING_GROUP_KEYS,
  B12_FAILURE_CATEGORIES,
  B12_GROUP_STOP_REASONS,
  B12_OWNER_RESULTS,
  assertB12AuditId,
  assertB12AuditOwner,
  assertB12ExecutionGroup,
  assertB12FixtureCluster,
} from "../execution/b12-execution-types";
import type { B12ExecutionGroupSummary } from "../execution/b12-execution-group-runner";
import type { B12OwnerJournalRecord } from "../execution/b12-owner-result-journal";
import { safeJsonStringify } from "../../support/safe-output";
import { computeB12CoreAuditClosure } from "./b12-g3-a3-core-evidence";
import { b12G3A3CoreOwnersFor } from "./b12-g3-a3-core-registry";
import {
  B12_G3_A3_AUDIT_CLOSURE_RESULTS,
  B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A3_CORE_EVIDENCE_SCOPE,
  B12_G3_A3_CORE_EXECUTION_GROUPS,
  B12_G3_A3_CORE_JOURNAL_VERSION,
  B12_G3_A3_CORE_PHASE,
  B12_G3_A3_GROUP_PROVISIONAL_CLOSURE_SCOPE,
  type B12G3A3AuditClosureEntry,
  type B12G3A3CoreExecutionGroup,
  type B12G3A3CoreGroupOutcome,
  type B12G3A3GroupProvisionalClosureSnapshot,
} from "./b12-g3-a3-formal-types";

export type B12G3A3CoreJournalDocument = Readonly<{
  version: typeof B12_G3_A3_CORE_JOURNAL_VERSION;
  phase: typeof B12_G3_A3_CORE_PHASE;
  evidenceScope: typeof B12_G3_A3_CORE_EVIDENCE_SCOPE;
  auditClosureAllowed: typeof B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED;
  executionGroup: B12G3A3CoreExecutionGroup;
  state: "appending" | "finalized";
  ownerRecords: readonly B12OwnerJournalRecord[];
  groupProvisionalClosureSnapshot: B12G3A3GroupProvisionalClosureSnapshot;
  groupOutcome: B12G3A3CoreGroupOutcome | null;
}>;

const JOURNAL_DOCUMENT_KEYS = [
  "auditClosureAllowed",
  "evidenceScope",
  "executionGroup",
  "groupOutcome",
  "groupProvisionalClosureSnapshot",
  "ownerRecords",
  "phase",
  "state",
  "version",
] as const;

const OWNER_RECORD_KEYS = [
  "auditOwner",
  "businessAssertionsCompleted",
  "directAuditIds",
  "executionGroup",
  "failureCategory",
  "fixtureCluster",
  "minimalCleanupCompleted",
  "result",
  "routeNetworkCompleted",
  "started",
  "supportingEvidenceCompleted",
] as const;

const PROVISIONAL_CLOSURE_KEYS = [
  "auditClosureEntries",
  "closureScope",
  "profileVerifierResult",
] as const;

const CLOSURE_ENTRY_KEYS = [
  "auditId",
  "closureBlockedBySupportingOwner",
  "directOwner",
  "result",
] as const;

const GROUP_OUTCOME_KEYS = [
  "allMinimalCleanupCompleted",
  "allOwnersFinalized",
  "allOwnersPassed",
  "expectedOwnerCount",
  "groupCleanupSucceeded",
  "groupSetupSucceeded",
  "operationallyPassed",
  "ownerCount",
  "profileCompletionBlockedByGroup",
  "stopReason",
] as const;

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === [...expectedKeys].sort()[index])
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function copyRecord(record: B12OwnerJournalRecord): B12OwnerJournalRecord {
  return Object.freeze({
    ...record,
    directAuditIds: Object.freeze([...record.directAuditIds]),
    supportingEvidenceCompleted: Object.freeze([
      ...record.supportingEvidenceCompleted,
    ]),
  });
}

function copyClosureEntry(
  entry: B12G3A3AuditClosureEntry,
): B12G3A3AuditClosureEntry {
  return Object.freeze({ ...entry });
}

function copyGroupOutcome(
  outcome: B12G3A3CoreGroupOutcome,
): B12G3A3CoreGroupOutcome {
  return Object.freeze({ ...outcome });
}

function validateOwnerRecord(value: unknown): B12OwnerJournalRecord {
  if (!hasExactKeys(value, OWNER_RECORD_KEYS)) {
    throw new Error("B12_FORMAL_CORE_JOURNAL_OWNER_RECORD_INVALID");
  }
  if (
    typeof value.auditOwner !== "string" ||
    typeof value.executionGroup !== "string" ||
    typeof value.fixtureCluster !== "string" ||
    typeof value.started !== "boolean" ||
    typeof value.businessAssertionsCompleted !== "boolean" ||
    typeof value.routeNetworkCompleted !== "boolean" ||
    typeof value.minimalCleanupCompleted !== "boolean" ||
    typeof value.result !== "string" ||
    !(B12_OWNER_RESULTS as readonly string[]).includes(value.result) ||
    typeof value.failureCategory !== "string" ||
    !(B12_FAILURE_CATEGORIES as readonly string[]).includes(
      value.failureCategory,
    ) ||
    !Array.isArray(value.directAuditIds) ||
    !Array.isArray(value.supportingEvidenceCompleted)
  ) {
    throw new Error("B12_FORMAL_CORE_JOURNAL_OWNER_RECORD_INVALID");
  }
  assertB12AuditOwner(value.auditOwner);
  assertB12ExecutionGroup(value.executionGroup);
  assertB12FixtureCluster(value.fixtureCluster);
  for (const auditId of value.directAuditIds) {
    if (typeof auditId !== "string") {
      throw new Error("B12_FORMAL_CORE_JOURNAL_OWNER_RECORD_INVALID");
    }
    assertB12AuditId(auditId);
  }
  for (const supportingGroup of value.supportingEvidenceCompleted) {
    if (
      typeof supportingGroup !== "string" ||
      !(B12_CROSS_CUTTING_GROUP_KEYS as readonly string[]).includes(
        supportingGroup,
      )
    ) {
      throw new Error("B12_FORMAL_CORE_JOURNAL_OWNER_RECORD_INVALID");
    }
  }
  return copyRecord(value as unknown as B12OwnerJournalRecord);
}

function validateClosureEntry(value: unknown): B12G3A3AuditClosureEntry {
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
    throw new Error("B12_FORMAL_CORE_PROVISIONAL_CLOSURE_INVALID");
  }
  assertB12AuditId(value.auditId);
  assertB12AuditOwner(value.directOwner);
  return copyClosureEntry(value as unknown as B12G3A3AuditClosureEntry);
}

function validateProvisionalClosure(
  value: unknown,
): B12G3A3GroupProvisionalClosureSnapshot {
  if (
    !hasExactKeys(value, PROVISIONAL_CLOSURE_KEYS) ||
    value.closureScope !== B12_G3_A3_GROUP_PROVISIONAL_CLOSURE_SCOPE ||
    value.profileVerifierResult !== "not_executed" ||
    !Array.isArray(value.auditClosureEntries)
  ) {
    throw new Error("B12_FORMAL_CORE_PROVISIONAL_CLOSURE_INVALID");
  }
  return Object.freeze({
    closureScope: B12_G3_A3_GROUP_PROVISIONAL_CLOSURE_SCOPE,
    profileVerifierResult: "not_executed" as const,
    auditClosureEntries: Object.freeze(
      value.auditClosureEntries.map(validateClosureEntry),
    ),
  });
}

function validateGroupOutcome(value: unknown): B12G3A3CoreGroupOutcome {
  if (
    !hasExactKeys(value, GROUP_OUTCOME_KEYS) ||
    typeof value.groupSetupSucceeded !== "boolean" ||
    typeof value.groupCleanupSucceeded !== "boolean" ||
    typeof value.profileCompletionBlockedByGroup !== "boolean" ||
    typeof value.stopReason !== "string" ||
    !(B12_GROUP_STOP_REASONS as readonly string[]).includes(value.stopReason) ||
    !isNonNegativeInteger(value.ownerCount) ||
    !isNonNegativeInteger(value.expectedOwnerCount) ||
    typeof value.allOwnersFinalized !== "boolean" ||
    typeof value.allOwnersPassed !== "boolean" ||
    typeof value.allMinimalCleanupCompleted !== "boolean" ||
    typeof value.operationallyPassed !== "boolean"
  ) {
    throw new Error("B12_FORMAL_CORE_GROUP_OUTCOME_INVALID");
  }
  const operationallyPassed =
    value.groupSetupSucceeded &&
    value.groupCleanupSucceeded &&
    value.stopReason === "none" &&
    value.ownerCount === value.expectedOwnerCount &&
    value.allOwnersFinalized &&
    value.allOwnersPassed &&
    value.allMinimalCleanupCompleted &&
    !value.profileCompletionBlockedByGroup;
  if (value.operationallyPassed !== operationallyPassed) {
    throw new Error("B12_FORMAL_CORE_GROUP_OUTCOME_INCONSISTENT");
  }
  return copyGroupOutcome(value as unknown as B12G3A3CoreGroupOutcome);
}

export function validateB12G3A3CoreJournalDocument(
  value: unknown,
  expectedExecutionGroup?: B12G3A3CoreExecutionGroup,
): B12G3A3CoreJournalDocument {
  if (
    !hasExactKeys(value, JOURNAL_DOCUMENT_KEYS) ||
    value.version !== B12_G3_A3_CORE_JOURNAL_VERSION ||
    value.phase !== B12_G3_A3_CORE_PHASE ||
    value.evidenceScope !== B12_G3_A3_CORE_EVIDENCE_SCOPE ||
    value.auditClosureAllowed !== true ||
    typeof value.executionGroup !== "string" ||
    !(B12_G3_A3_CORE_EXECUTION_GROUPS as readonly string[]).includes(
      value.executionGroup,
    ) ||
    (expectedExecutionGroup !== undefined &&
      value.executionGroup !== expectedExecutionGroup) ||
    !["appending", "finalized"].includes(String(value.state)) ||
    !Array.isArray(value.ownerRecords)
  ) {
    throw new Error("B12_FORMAL_CORE_JOURNAL_DOCUMENT_INVALID");
  }
  const state = value.state as "appending" | "finalized";
  if (
    (state === "appending" && value.groupOutcome !== null) ||
    (state === "finalized" && value.groupOutcome === null)
  ) {
    throw new Error("B12_FORMAL_CORE_GROUP_OUTCOME_STATE_INVALID");
  }
  const document = Object.freeze({
    version: B12_G3_A3_CORE_JOURNAL_VERSION,
    phase: B12_G3_A3_CORE_PHASE,
    evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
    auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
    executionGroup: value.executionGroup as B12G3A3CoreExecutionGroup,
    state,
    ownerRecords: Object.freeze(value.ownerRecords.map(validateOwnerRecord)),
    groupProvisionalClosureSnapshot: validateProvisionalClosure(
      value.groupProvisionalClosureSnapshot,
    ),
    groupOutcome:
      value.groupOutcome === null
        ? null
        : validateGroupOutcome(value.groupOutcome),
  });
  safeJsonStringify(document);
  return document;
}

export function b12G3A3CoreJournalTarget(
  executionGroup: B12G3A3CoreExecutionGroup,
): string {
  return path.resolve(
    process.cwd(),
    "test-results",
    "b12-g3-a3-core-journals",
    `${executionGroup}.json`,
  );
}

function assertJournalTargetShape(target: string): string {
  const outputRoot = path.resolve(process.cwd(), "test-results");
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(outputRoot, resolvedTarget);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    path.extname(resolvedTarget).toLowerCase() !== ".json"
  ) {
    throw new Error("B12_FORMAL_CORE_JOURNAL_TARGET_UNSAFE");
  }
  return resolvedTarget;
}

async function assertSafeDirectory(outputRoot: string, parent: string) {
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
    throw new Error("B12_FORMAL_CORE_JOURNAL_DIRECTORY_UNSAFE");
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

function recordsMatch(
  left: B12OwnerJournalRecord,
  right: B12OwnerJournalRecord,
): boolean {
  return safeJsonStringify(left) === safeJsonStringify(right);
}

export function createB12G3A3CoreGroupOutcome(
  executionGroup: B12G3A3CoreExecutionGroup,
  records: readonly B12OwnerJournalRecord[],
  summary: B12ExecutionGroupSummary,
): B12G3A3CoreGroupOutcome {
  if (summary.executionGroup !== executionGroup) {
    throw new Error("B12_FORMAL_CORE_GROUP_SUMMARY_MISMATCH");
  }
  const expectedOwnerKeys = b12G3A3CoreOwnersFor(executionGroup).map(
    ({ auditOwner }) => auditOwner,
  );
  const recordKeys = records.map(({ auditOwner }) => auditOwner);
  const summaryByOwner = new Map(
    summary.ownerResults.map((record) => [record.auditOwner, record]),
  );
  const allOwnersFinalized =
    records.length === expectedOwnerKeys.length &&
    summary.ownerResults.length === expectedOwnerKeys.length &&
    recordKeys.every((key, index) => key === expectedOwnerKeys[index]) &&
    records.every((record) => {
      const summaryRecord = summaryByOwner.get(record.auditOwner);
      return summaryRecord !== undefined && recordsMatch(record, summaryRecord);
    });
  const allOwnersPassed =
    allOwnersFinalized &&
    records.every(
      (record) =>
        record.started &&
        record.businessAssertionsCompleted &&
        record.routeNetworkCompleted &&
        record.result === "pass" &&
        record.failureCategory === "none",
    );
  const allMinimalCleanupCompleted =
    allOwnersFinalized &&
    records.every(({ minimalCleanupCompleted }) => minimalCleanupCompleted);
  const operationallyPassed =
    summary.groupSetupSucceeded &&
    summary.groupCleanupSucceeded &&
    summary.stopReason === "none" &&
    allOwnersFinalized &&
    allOwnersPassed &&
    allMinimalCleanupCompleted &&
    !summary.profileCompletionBlocked;
  return Object.freeze({
    groupSetupSucceeded: summary.groupSetupSucceeded,
    groupCleanupSucceeded: summary.groupCleanupSucceeded,
    profileCompletionBlockedByGroup:
      summary.profileCompletionBlocked || !operationallyPassed,
    stopReason: summary.stopReason,
    ownerCount: records.length,
    expectedOwnerCount: expectedOwnerKeys.length,
    allOwnersFinalized,
    allOwnersPassed,
    allMinimalCleanupCompleted,
    operationallyPassed,
  });
}

export async function readB12G3A3CoreJournalDocument(
  target: string,
  expectedExecutionGroup?: B12G3A3CoreExecutionGroup,
): Promise<B12G3A3CoreJournalDocument> {
  const resolvedTarget = assertJournalTargetShape(target);
  const outputRoot = path.resolve(process.cwd(), "test-results");
  const parent = path.dirname(resolvedTarget);
  await assertSafeDirectory(outputRoot, parent);
  const targetStat = await lstat(resolvedTarget);
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
    throw new Error("B12_FORMAL_CORE_JOURNAL_FILE_UNSAFE");
  }
  const source = await readFile(resolvedTarget, "utf8");
  if (Buffer.byteLength(source, "utf8") > 65_536) {
    throw new Error("B12_FORMAL_CORE_JOURNAL_TOO_LARGE");
  }
  return validateB12G3A3CoreJournalDocument(
    JSON.parse(source) as unknown,
    expectedExecutionGroup,
  );
}

export class B12G3A3CoreAtomicJournal {
  private records: readonly B12OwnerJournalRecord[] = Object.freeze([]);
  private state: "appending" | "finalized" = "appending";

  private constructor(
    readonly executionGroup: B12G3A3CoreExecutionGroup,
    readonly target: string,
  ) {}

  static async create(input: {
    executionGroup: B12G3A3CoreExecutionGroup;
    target: string;
  }): Promise<B12G3A3CoreAtomicJournal> {
    const outputRoot = path.resolve(process.cwd(), "test-results");
    await mkdir(outputRoot, { recursive: true });
    const target = assertJournalTargetShape(input.target);
    const parent = path.dirname(target);
    await mkdir(parent, { recursive: true });
    await assertSafeDirectory(outputRoot, parent);
    try {
      await lstat(target);
      throw new Error("B12_FORMAL_CORE_JOURNAL_TARGET_EXISTS");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return new B12G3A3CoreAtomicJournal(input.executionGroup, target);
  }

  readonly onOwnerFinalized = async (
    record: B12OwnerJournalRecord,
  ): Promise<void> => {
    if (this.state !== "appending") {
      throw new Error("B12_FORMAL_CORE_JOURNAL_ALREADY_FINALIZED");
    }
    if (record.executionGroup !== this.executionGroup) {
      throw new Error("B12_FORMAL_CORE_JOURNAL_GROUP_MISMATCH");
    }
    const next = Object.freeze([...this.records, copyRecord(record)]);
    await this.write(next, "appending", null);
    this.records = next;
  };

  async finalize(summary: B12ExecutionGroupSummary): Promise<void> {
    if (this.state !== "appending") {
      throw new Error("B12_FORMAL_CORE_JOURNAL_ALREADY_FINALIZED");
    }
    const groupOutcome = createB12G3A3CoreGroupOutcome(
      this.executionGroup,
      this.records,
      summary,
    );
    await this.write(this.records, "finalized", groupOutcome);
    this.state = "finalized";
  }

  async read(): Promise<B12G3A3CoreJournalDocument> {
    return readB12G3A3CoreJournalDocument(this.target, this.executionGroup);
  }

  async remove(): Promise<boolean> {
    try {
      await unlink(this.target);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    const prefix = `.${path.basename(this.target)}.`;
    const residual = (await readdir(path.dirname(this.target))).filter(
      (name) => name.startsWith(prefix) && name.endsWith(".tmp"),
    );
    if (residual.length !== 0) {
      throw new Error("B12_FORMAL_CORE_JOURNAL_TEMPORARY_REMAINS");
    }
    return true;
  }

  private async write(
    records: readonly B12OwnerJournalRecord[],
    state: "appending" | "finalized",
    groupOutcome: B12G3A3CoreGroupOutcome | null,
  ): Promise<void> {
    const groupProvisionalClosureSnapshot = Object.freeze({
      closureScope: B12_G3_A3_GROUP_PROVISIONAL_CLOSURE_SCOPE,
      profileVerifierResult: "not_executed" as const,
      auditClosureEntries: computeB12CoreAuditClosure({
        evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
        auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
        ownerRecords: records,
      }),
    });
    const document: B12G3A3CoreJournalDocument = Object.freeze({
      version: B12_G3_A3_CORE_JOURNAL_VERSION,
      phase: B12_G3_A3_CORE_PHASE,
      evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
      executionGroup: this.executionGroup,
      state,
      ownerRecords: records,
      groupProvisionalClosureSnapshot,
      groupOutcome,
    });
    validateB12G3A3CoreJournalDocument(document, this.executionGroup);
    const serialized = `${safeJsonStringify(document)}\n`;
    const temporaryTarget = path.resolve(
      path.dirname(this.target),
      `.${path.basename(this.target)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(temporaryTarget, "wx", 0o600);
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporaryTarget, this.target);
      await syncDirectory(path.dirname(this.target));
    } finally {
      await handle?.close().catch(() => undefined);
      await unlink(temporaryTarget).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
    }
  }
}
