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
import { computeB12CoreAuditClosure } from "./b12-g3-a3-core-evidence";
import {
  B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A3_CORE_EVIDENCE_SCOPE,
  B12_G3_A3_CORE_PHASE,
  type B12G3A3AuditClosureEntry,
  type B12G3A3CoreExecutionGroup,
} from "./b12-g3-a3-formal-types";

export type B12G3A3CoreJournalDocument = Readonly<{
  version: 1;
  phase: typeof B12_G3_A3_CORE_PHASE;
  evidenceScope: typeof B12_G3_A3_CORE_EVIDENCE_SCOPE;
  auditClosureAllowed: typeof B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED;
  executionGroup: B12G3A3CoreExecutionGroup;
  state: "appending" | "finalized";
  ownerRecords: readonly B12OwnerJournalRecord[];
  auditClosureSnapshot: readonly B12G3A3AuditClosureEntry[];
}>;

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

function copyRecord(record: B12OwnerJournalRecord): B12OwnerJournalRecord {
  return Object.freeze({
    ...record,
    directAuditIds: Object.freeze([...record.directAuditIds]),
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
    const target = path.resolve(input.target);
    const relative = path.relative(outputRoot, target);
    if (
      !relative ||
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      path.extname(target).toLowerCase() !== ".json"
    ) {
      throw new Error("B12_FORMAL_CORE_JOURNAL_TARGET_UNSAFE");
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
      throw new Error("B12_FORMAL_CORE_JOURNAL_DIRECTORY_UNSAFE");
    }
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
    await this.write(next, "appending");
    this.records = next;
  };

  async finalize(): Promise<void> {
    if (this.state !== "appending") {
      throw new Error("B12_FORMAL_CORE_JOURNAL_ALREADY_FINALIZED");
    }
    await this.write(this.records, "finalized");
    this.state = "finalized";
  }

  async read(): Promise<B12G3A3CoreJournalDocument> {
    const source = await readFile(this.target, "utf8");
    if (Buffer.byteLength(source, "utf8") > 65_536) {
      throw new Error("B12_FORMAL_CORE_JOURNAL_TOO_LARGE");
    }
    const parsed = JSON.parse(source) as B12G3A3CoreJournalDocument;
    if (
      parsed.version !== 1 ||
      parsed.phase !== B12_G3_A3_CORE_PHASE ||
      parsed.evidenceScope !== B12_G3_A3_CORE_EVIDENCE_SCOPE ||
      parsed.auditClosureAllowed !== true ||
      parsed.executionGroup !== this.executionGroup ||
      !["appending", "finalized"].includes(parsed.state) ||
      !Array.isArray(parsed.ownerRecords) ||
      !Array.isArray(parsed.auditClosureSnapshot)
    ) {
      throw new Error("B12_FORMAL_CORE_JOURNAL_DOCUMENT_INVALID");
    }
    safeJsonStringify(parsed);
    return Object.freeze({
      ...parsed,
      ownerRecords: Object.freeze(parsed.ownerRecords.map(copyRecord)),
      auditClosureSnapshot: Object.freeze(
        parsed.auditClosureSnapshot.map((entry) => Object.freeze({ ...entry })),
      ),
    });
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
  ): Promise<void> {
    const auditClosureSnapshot = computeB12CoreAuditClosure({
      evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
      ownerRecords: records,
    });
    const document: B12G3A3CoreJournalDocument = Object.freeze({
      version: 1,
      phase: B12_G3_A3_CORE_PHASE,
      evidenceScope: B12_G3_A3_CORE_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A3_CORE_AUDIT_CLOSURE_ALLOWED,
      executionGroup: this.executionGroup,
      state,
      ownerRecords: records,
      auditClosureSnapshot,
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
