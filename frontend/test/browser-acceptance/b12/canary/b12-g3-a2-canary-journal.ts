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
  B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A2_CANARY_EVIDENCE_SCOPE,
  type B12G3A2CanaryExecutionGroup,
} from "./b12-g3-a2-canary-types";

export type B12G3A2CanaryJournalDocument = Readonly<{
  evidenceScope: typeof B12_G3_A2_CANARY_EVIDENCE_SCOPE;
  auditClosureAllowed: typeof B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED;
  executionGroup: B12G3A2CanaryExecutionGroup;
  ownerRecords: readonly B12OwnerJournalRecord[];
}>;

export function b12G3A2CanaryJournalTarget(
  executionGroup: B12G3A2CanaryExecutionGroup,
): string {
  return path.resolve(
    process.cwd(),
    "test-results",
    "b12-g3-a2-canary-journals",
    `${executionGroup}.json`,
  );
}

const DOCUMENT_KEYS = [
  "auditClosureAllowed",
  "evidenceScope",
  "executionGroup",
  "ownerRecords",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyOwnerRecord(
  record: B12OwnerJournalRecord,
): B12OwnerJournalRecord {
  if (record.directAuditIds.length !== 0) {
    throw new Error("B12_CANARY_JOURNAL_DIRECT_AUDIT_IDS_MUST_BE_EMPTY");
  }
  return Object.freeze({
    auditOwner: record.auditOwner,
    executionGroup: record.executionGroup,
    fixtureCluster: record.fixtureCluster,
    started: record.started,
    businessAssertionsCompleted: record.businessAssertionsCompleted,
    routeNetworkCompleted: record.routeNetworkCompleted,
    minimalCleanupCompleted: record.minimalCleanupCompleted,
    result: record.result,
    failureCategory: record.failureCategory,
    directAuditIds: Object.freeze([]),
    supportingEvidenceCompleted: Object.freeze([
      ...record.supportingEvidenceCompleted,
    ]),
  });
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

export class B12G3A2CanaryAtomicJournal {
  private records: readonly B12OwnerJournalRecord[] = Object.freeze([]);

  private constructor(
    readonly executionGroup: B12G3A2CanaryExecutionGroup,
    readonly target: string,
  ) {}

  static async create(input: {
    executionGroup: B12G3A2CanaryExecutionGroup;
    target: string;
  }): Promise<B12G3A2CanaryAtomicJournal> {
    const outputRoot = path.resolve(process.cwd(), "test-results");
    const target = path.resolve(input.target);
    const relative = path.relative(outputRoot, target);
    if (
      !relative ||
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      path.extname(target).toLowerCase() !== ".json"
    ) {
      throw new Error("B12_CANARY_JOURNAL_TARGET_OUTSIDE_TEST_RESULTS");
    }
    const parent = path.dirname(target);
    await mkdir(parent, { recursive: true });
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
      throw new Error("B12_CANARY_JOURNAL_DIRECTORY_UNSAFE");
    }
    try {
      await lstat(target);
      throw new Error("B12_CANARY_JOURNAL_TARGET_ALREADY_EXISTS");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return new B12G3A2CanaryAtomicJournal(input.executionGroup, target);
  }

  readonly onOwnerFinalized = async (
    record: B12OwnerJournalRecord,
  ): Promise<void> => {
    if (record.executionGroup !== this.executionGroup) {
      throw new Error("B12_CANARY_JOURNAL_GROUP_MISMATCH");
    }
    const nextRecords = Object.freeze([
      ...this.records,
      copyOwnerRecord(record),
    ]);
    await this.write(nextRecords);
    this.records = nextRecords;
  };

  async read(): Promise<B12G3A2CanaryJournalDocument> {
    const source = await readFile(this.target, "utf8");
    if (Buffer.byteLength(source, "utf8") > 16_384) {
      throw new Error("B12_CANARY_JOURNAL_EXCEEDS_SIZE_LIMIT");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error("B12_CANARY_JOURNAL_INVALID_JSON");
    }
    if (
      !isRecord(parsed) ||
      JSON.stringify(Object.keys(parsed).sort()) !==
        JSON.stringify([...DOCUMENT_KEYS].sort()) ||
      parsed.evidenceScope !== B12_G3_A2_CANARY_EVIDENCE_SCOPE ||
      parsed.auditClosureAllowed !== false ||
      parsed.executionGroup !== this.executionGroup ||
      !Array.isArray(parsed.ownerRecords)
    ) {
      throw new Error("B12_CANARY_JOURNAL_DOCUMENT_INVALID");
    }
    const ownerRecords = parsed.ownerRecords.map((value) => {
      if (!isRecord(value)) {
        throw new Error("B12_CANARY_JOURNAL_OWNER_RECORD_INVALID");
      }
      return copyOwnerRecord(value as B12OwnerJournalRecord);
    });
    const document = Object.freeze({
      evidenceScope: B12_G3_A2_CANARY_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED,
      executionGroup: this.executionGroup,
      ownerRecords: Object.freeze(ownerRecords),
    });
    safeJsonStringify(document);
    return document;
  }

  async remove(): Promise<boolean> {
    try {
      await unlink(this.target);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    const temporaryPrefix = `.${path.basename(this.target)}.`;
    const residualTemporaryFiles = (await readdir(path.dirname(this.target))).filter(
      (name) => name.startsWith(temporaryPrefix) && name.endsWith(".tmp"),
    );
    if (residualTemporaryFiles.length !== 0) {
      throw new Error("B12_CANARY_JOURNAL_TEMPORARY_FILE_REMAINS");
    }
    return true;
  }

  private async write(
    ownerRecords: readonly B12OwnerJournalRecord[],
  ): Promise<void> {
    const document: B12G3A2CanaryJournalDocument = Object.freeze({
      evidenceScope: B12_G3_A2_CANARY_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED,
      executionGroup: this.executionGroup,
      ownerRecords,
    });
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
