import type { Page, Request, Response, Route } from "@playwright/test";

import {
  auditB12DomPrivacy,
  inspectB12CoreWorkflowNavigationAuthEntries,
  type B12LockResponseFacts,
} from "../b12-core-support";
import type { B12G3A2CanaryOwnerDefinition } from "./b12-g3-a2-canary-types";
import { ControlledRequestGate } from "../../support/network-control";
import {
  type NetworkLedger,
  type NetworkLedgerEntry,
} from "../../support/network-ledger";
import {
  ConsoleAudit,
  type ConsoleAuditSummary,
  auditRuntimeStorage,
} from "../../support/runtime-audit";
import { sanitizeUrlPattern } from "../../support/safe-output";
import { expect } from "../../support/acceptance-test";

const LATEST_SAFE_PATTERN =
  "/patients/<id>/visits/<id>/clinical-reports/latest";
const LOCK_SAFE_PATTERN =
  "/patients/<id>/visits/<id>/clinical-reports/<id>/lock";
const FINALITY_ROUTE_PATTERN =
  "**/patients/*/visits/*/clinical-reports/latest";

type SafeActorFacts = {
  operatorNamePresent: boolean;
  operatorRole: string | null;
  internalOperatorIdPresent: boolean;
};

type SafeLockFacts = {
  present: boolean;
  lockIdPresent: boolean;
  lockedAtPresent: boolean;
  lockedBy: SafeActorFacts | null;
  lockNotePresent: boolean;
};

export type B12G3A2CanaryLatestFacts = {
  updatedAt: string;
  status: string | null;
  source: string | null;
  qualityStatus: string | null;
  isFinal: boolean | null;
  confirmationPresent: boolean;
  lockedAtPresent: boolean;
  lock: SafeLockFacts;
  sourceFreezePresent: boolean;
  archivedAtPresent: boolean;
  archivePresent: boolean;
  voidedAtPresent: boolean;
};

export type B12G3A2CanaryLockRequestFacts = {
  bodyKeys: string[];
  confirmIsTrue: boolean;
  expectedUpdatedAtMatchesLatest: boolean;
  lockNoteTrimmed: boolean;
  lockNoteMatchesExpected: boolean;
  forbiddenBodyKeyDetected: boolean;
};

export type B12G3A2CanaryOwnerCleanupSummary = Readonly<{
  listenerRemovedCount: number;
  interceptInstalledCount: number;
  interceptRemovedCount: number;
  finalityRealReadRestored: boolean;
  pendingRequestSettled: boolean;
  localDraftCleared: boolean;
  workflowNavigationAuthMeRequestCount: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function safeBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseActor(value: unknown): SafeActorFacts | null {
  if (!isRecord(value)) return null;
  return {
    operatorNamePresent:
      typeof value.operatorName === "string" && value.operatorName.length > 0,
    operatorRole: safeString(value.operatorRole),
    internalOperatorIdPresent:
      typeof value.operatorId === "string" && value.operatorId.length > 0,
  };
}

function parseLock(value: unknown): SafeLockFacts {
  if (!isRecord(value)) {
    return {
      present: false,
      lockIdPresent: false,
      lockedAtPresent: false,
      lockedBy: null,
      lockNotePresent: false,
    };
  }
  return {
    present: true,
    lockIdPresent:
      typeof value.lockId === "string" && value.lockId.length > 0,
    lockedAtPresent:
      typeof value.lockedAt === "string" && value.lockedAt.length > 0,
    lockedBy: parseActor(value.lockedBy),
    lockNotePresent:
      typeof value.lockNote === "string" && value.lockNote.length > 0,
  };
}

export function parseB12G3A2CanaryLatestBody(
  body: unknown,
): B12G3A2CanaryLatestFacts {
  const envelope = isRecord(body) ? body : {};
  const report = isRecord(envelope.report) ? envelope.report : {};
  const updatedAt = safeString(report.updatedAt);
  if (!updatedAt) throw new Error("B12_CANARY_LATEST_UPDATED_AT_MISSING");
  return {
    updatedAt,
    status: safeString(report.status),
    source: safeString(report.source),
    qualityStatus: safeString(report.qualityStatus),
    isFinal: safeBoolean(report.isFinal),
    confirmationPresent: isRecord(report.confirmation),
    lockedAtPresent:
      typeof report.lockedAt === "string" && report.lockedAt.length > 0,
    lock: parseLock(report.lock),
    sourceFreezePresent: isRecord(report.sourceFreeze),
    archivedAtPresent:
      typeof report.archivedAt === "string" && report.archivedAt.length > 0,
    archivePresent: isRecord(report.archive),
    voidedAtPresent:
      typeof report.voidedAt === "string" && report.voidedAt.length > 0,
  };
}

export async function parseB12G3A2CanaryLockResponse(
  response: Response,
  expectedPersistedNote: string,
): Promise<B12LockResponseFacts | null> {
  if (response.status() < 200 || response.status() >= 300) return null;
  const body = (await response.json()) as unknown;
  const envelope = isRecord(body) ? body : {};
  const report = isRecord(envelope.report) ? envelope.report : {};
  const latest = parseB12G3A2CanaryLatestBody({ report });
  const receipt = isRecord(envelope.lockReceipt) ? envelope.lockReceipt : null;
  const receiptNote = safeString(receipt?.lockNote);
  const { updatedAt, ...safeReport } = latest;
  return {
    report: {
      ...safeReport,
      updatedAtPresent: updatedAt.length > 0,
    },
    receiptPresent: receipt !== null,
    alreadyLocked: receipt ? safeBoolean(receipt.alreadyLocked) : null,
    receiptLockIdPresent:
      typeof receipt?.lockId === "string" && receipt.lockId.length > 0,
    receiptLockedAtPresent:
      typeof receipt?.lockedAt === "string" && receipt.lockedAt.length > 0,
    receiptLockedBy: parseActor(receipt?.lockedBy),
    receiptLockNotePresent: receiptNote !== null && receiptNote.length > 0,
    receiptLockNoteMatchesExpected:
      receiptNote === expectedPersistedNote.trim(),
  };
}

function latestRequest(request: Request): boolean {
  return (
    request.method() === "GET" &&
    sanitizeUrlPattern(request.url()) === LATEST_SAFE_PATTERN
  );
}

function lockRequest(request: Request): boolean {
  return (
    request.method() === "POST" &&
    sanitizeUrlPattern(request.url()) === LOCK_SAFE_PATTERN
  );
}

function protectedForbiddenResponse(response: Response): boolean {
  return (
    response.request().method() === "GET" &&
    response.status() === 403 &&
    sanitizeUrlPattern(response.url()).startsWith("/patients/")
  );
}

function mutation(entry: NetworkLedgerEntry): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(entry.method);
}

async function settleWithTimeout(
  tasks: readonly Promise<unknown>[],
): Promise<boolean> {
  if (tasks.length === 0) return true;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race([
      Promise.allSettled(tasks).then(() => true),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), 5_000);
      }),
    ]);
    return result;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class B12G3A2CanaryOwnerScope {
  private readonly consoleAudit: ConsoleAudit;
  private readonly captureTasks: Promise<void>[] = [];
  private readonly captureFailures: string[] = [];
  private readonly latestFacts: B12G3A2CanaryLatestFacts[] = [];
  private readonly lockRequests: B12G3A2CanaryLockRequestFacts[] = [];
  private readonly pendingTasks: Promise<unknown>[] = [];
  private finalityHandler: ((route: Route) => Promise<void>) | null = null;
  private finalityMatchedCount = 0;
  private finalityLatestUrl: string | null = null;
  private pendingGate: ControlledRequestGate | null = null;
  private expectedLockRequest: {
    note: string;
    updatedAt: string;
  } | null = null;
  private completedEntries: NetworkLedgerEntry[] | null = null;
  private workflowNavigationAuthMeRequestCount: number | null = null;
  private listenerAttached = false;
  private consoleAttached = false;
  private cleanupCompleted = false;
  private interceptInstalledCount = 0;
  private interceptRemovedCount = 0;

  private readonly onRequest = (request: Request): void => {
    if (!lockRequest(request)) return;
    const expected = this.expectedLockRequest;
    let body: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(request.postData() ?? "") as unknown;
      if (isRecord(parsed)) body = parsed;
    } catch {
      body = {};
    }
    const lockNote = safeString(body.lockNote);
    const bodyKeys = Object.keys(body).sort();
    this.lockRequests.push({
      bodyKeys,
      confirmIsTrue: body.confirm === true,
      expectedUpdatedAtMatchesLatest:
        expected !== null && body.expectedUpdatedAt === expected.updatedAt,
      lockNoteTrimmed:
        lockNote !== null && lockNote === lockNote.trim() && lockNote.length > 0,
      lockNoteMatchesExpected:
        expected !== null && lockNote === expected.note.trim(),
      forbiddenBodyKeyDetected: bodyKeys.some((key) =>
        /(?:reportId|patientId|visitId|actor|password|cookie|session|token)/i.test(
          key,
        ),
      ),
    });
  };

  private readonly onResponse = (response: Response): void => {
    if (response.status() !== 200 || !latestRequest(response.request())) return;
    const task = response
      .json()
      .then((body: unknown) => {
        this.latestFacts.push(parseB12G3A2CanaryLatestBody(body));
      })
      .catch(() => {
        this.captureFailures.push("latest_parse");
      });
    this.captureTasks.push(task);
  };

  constructor(
    readonly owner: B12G3A2CanaryOwnerDefinition,
    readonly page: Page,
    private readonly ledger: NetworkLedger,
    private readonly entryStartIndex: number,
  ) {
    this.consoleAudit = new ConsoleAudit(page);
  }

  start(): void {
    if (this.listenerAttached || this.consoleAttached) {
      throw new Error("B12_CANARY_OWNER_SCOPE_ALREADY_STARTED");
    }
    this.page.on("request", this.onRequest);
    this.page.on("response", this.onResponse);
    this.listenerAttached = true;
    this.consoleAudit.start();
    this.consoleAttached = true;
  }

  async installFinalityControlledRead(): Promise<void> {
    if (this.finalityHandler || this.pendingGate) {
      throw new Error("B12_CANARY_OWNER_INTERCEPT_ALREADY_INSTALLED");
    }
    const handler = async (route: Route): Promise<void> => {
      if (!latestRequest(route.request()) || this.finalityMatchedCount > 0) {
        await route.continue();
        return;
      }
      this.finalityMatchedCount += 1;
      this.finalityLatestUrl = route.request().url();
      const response = await route.fetch();
      if (response.status() !== 200) {
        throw new Error("B12_CANARY_FINALITY_BASELINE_NOT_200");
      }
      const body = (await response.json()) as unknown;
      if (!isRecord(body) || !isRecord(body.report)) {
        throw new Error("B12_CANARY_FINALITY_REPORT_ENVELOPE_MISSING");
      }
      if (body.report.isFinal !== true) {
        throw new Error("B12_CANARY_FINALITY_BASELINE_NOT_FINAL");
      }
      const envelopeKeys = Object.keys(body).sort();
      const reportKeys = Object.keys(body.report).sort();
      body.report.isFinal = false;
      if (
        JSON.stringify(Object.keys(body).sort()) !==
          JSON.stringify(envelopeKeys) ||
        JSON.stringify(Object.keys(body.report).sort()) !==
          JSON.stringify(reportKeys)
      ) {
        throw new Error("B12_CANARY_FINALITY_RESPONSE_KEYS_CHANGED");
      }
      await route.fulfill({ response, json: body });
    };
    this.finalityHandler = handler;
    await this.page.route(FINALITY_ROUTE_PATTERN, handler);
    this.interceptInstalledCount += 1;
  }

  async installLockPendingGate(): Promise<ControlledRequestGate> {
    if (this.finalityHandler || this.pendingGate) {
      throw new Error("B12_CANARY_OWNER_INTERCEPT_ALREADY_INSTALLED");
    }
    const gate = new ControlledRequestGate(this.page, lockRequest, 20_000);
    await gate.install();
    this.pendingGate = gate;
    this.interceptInstalledCount += 1;
    return gate;
  }

  expectNextLockRequest(note: string, updatedAt: string): void {
    if (this.expectedLockRequest) {
      throw new Error("B12_CANARY_LOCK_REQUEST_EXPECTATION_ALREADY_SET");
    }
    this.expectedLockRequest = { note, updatedAt };
  }

  registerPendingTask(task: Promise<unknown>): void {
    const observed = task.catch(() => undefined);
    this.pendingTasks.push(observed);
  }

  waitForLockResponse(): Promise<Response> {
    return this.page.waitForResponse(
      (response) => lockRequest(response.request()),
      { timeout: 30_000 },
    );
  }

  async navigateReadable(
    frontendOrigin: string,
    navigationPath: string,
  ): Promise<B12G3A2CanaryLatestFacts> {
    const responsePromise = this.page.waitForResponse(
      (response) =>
        latestRequest(response.request()) && response.status() === 200,
      { timeout: 45_000 },
    );
    await this.page.goto(`${frontendOrigin}${navigationPath}`, {
      waitUntil: "domcontentloaded",
    });
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(
      this.page.getByRole("heading", {
        name: "访视级临床报告",
        exact: true,
      }),
    ).toBeVisible();
    await this.flushCaptures();
    this.throwCaptureFailures();
    const latest = this.latestFacts.at(-1);
    if (!latest) throw new Error("B12_CANARY_LATEST_FACTS_MISSING");
    return latest;
  }

  async navigateForbidden(
    frontendOrigin: string,
    navigationPath: string,
  ): Promise<Response> {
    const responsePromise = this.page.waitForResponse(
      protectedForbiddenResponse,
      { timeout: 45_000 },
    );
    await this.page.goto(`${frontendOrigin}${navigationPath}`, {
      waitUntil: "domcontentloaded",
    });
    const response = await responsePromise;
    expect(response.status()).toBe(403);
    await this.flushCaptures();
    this.throwCaptureFailures();
    return response;
  }

  async completeRouteNetwork(): Promise<readonly NetworkLedgerEntry[]> {
    await this.page.waitForLoadState("networkidle", { timeout: 10_000 });
    await this.flushCaptures();
    this.throwCaptureFailures();
    const entries = this.ledger.entries();
    const completedIndex = entries.length;
    if (this.owner.auditOwner.endsWith("/denied-role-entry")) {
      const systemAuthEntries = entries
        .slice(this.entryStartIndex, completedIndex)
        .filter(
          ({ method, safeUrlPattern }) =>
            method === "GET" && safeUrlPattern === "/auth/me",
        );
      expect(
        systemAuthEntries.every(
          ({ status, failureReason }) =>
            failureReason === null &&
            status !== null &&
            ((status >= 200 && status < 300) || status === 401),
        ),
      ).toBe(true);
      this.workflowNavigationAuthMeRequestCount = systemAuthEntries.length;
    } else {
      const authInspection = inspectB12CoreWorkflowNavigationAuthEntries(
        entries,
        this.entryStartIndex,
        completedIndex,
      );
      this.workflowNavigationAuthMeRequestCount =
        authInspection.workflowNavigationAuthMeRequestCount;
    }
    this.completedEntries = entries.slice(this.entryStartIndex, completedIndex);
    return this.completedEntries.map((entry) => ({
      ...entry,
      bodyKeys: [...entry.bodyKeys],
    }));
  }

  entries(): readonly NetworkLedgerEntry[] {
    if (!this.completedEntries) {
      throw new Error("B12_CANARY_OWNER_NETWORK_NOT_COMPLETED");
    }
    return this.completedEntries.map((entry) => ({
      ...entry,
      bodyKeys: [...entry.bodyKeys],
    }));
  }

  assertNoProductWrites(): void {
    expect(
      this.entries().filter(
        (entry) =>
          mutation(entry) && entry.safeUrlPattern.includes("/clinical-reports"),
      ),
    ).toHaveLength(0);
  }

  count(method: string, safeUrlPattern: string): number {
    return this.entries().filter(
      (entry) =>
        entry.method === method.toUpperCase() &&
        entry.safeUrlPattern === safeUrlPattern,
    ).length;
  }

  assertSingleLockWithoutRetryOrPolling(): void {
    expect(this.count("POST", LOCK_SAFE_PATTERN)).toBe(1);
    expect(this.count("GET", LATEST_SAFE_PATTERN)).toBe(1);
  }

  lockRequestFacts(): readonly B12G3A2CanaryLockRequestFacts[] {
    return this.lockRequests.map((entry) => ({
      ...entry,
      bodyKeys: [...entry.bodyKeys],
    }));
  }

  async inspectPreLogoutLocalSafety(): Promise<void> {
    const storage = await auditRuntimeStorage(this.page);
    expect(storage.localStorageKeys).toEqual([]);
    expect(storage.sessionStorageKeys).toEqual([]);
    expect(storage.indexedDbNames).toEqual([]);
    expect(storage.forbiddenValueDetected).toBe(false);
    expect(storage.documentCookieForbiddenPatternDetected).toBe(false);
    expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
    const currentUrl = new URL(this.page.url());
    expect(currentUrl.search).toBe("");
    expect(currentUrl.hash).toBe("");
    await auditB12DomPrivacy(this.page, []);
  }

  async minimalCleanup(): Promise<B12G3A2CanaryOwnerCleanupSummary> {
    if (this.cleanupCompleted) {
      throw new Error("B12_CANARY_OWNER_CLEANUP_ALREADY_COMPLETED");
    }
    let cleanupFailed = false;
    let finalityRealReadRestored = false;
    if (this.pendingGate) {
      const gate = this.pendingGate;
      this.pendingGate = null;
      try {
        const before = gate.summary();
        if (
          before.matchedRequestCount > 0 &&
          before.abortedRequestCount + before.continuedRequestCount === 0
        ) {
          gate.abort();
          await expect
            .poll(
              () => {
                const current = gate.summary();
                return (
                  current.abortedRequestCount + current.continuedRequestCount
                );
              },
              { timeout: 5_000 },
            )
            .toBeGreaterThan(0);
        }
      } catch {
        cleanupFailed = true;
      } finally {
        await gate.dispose().then(
          () => {
            this.interceptRemovedCount += 1;
          },
          () => {
            cleanupFailed = true;
          },
        );
      }
    }
    if (this.finalityHandler) {
      const handler = this.finalityHandler;
      this.finalityHandler = null;
      try {
        await this.page.unroute(FINALITY_ROUTE_PATTERN, handler);
        this.interceptRemovedCount += 1;
        if (this.finalityMatchedCount !== 1 || !this.finalityLatestUrl) {
          throw new Error("B12_CANARY_FINALITY_INTERCEPT_COUNT_INVALID");
        }
        const restored = await this.page.evaluate(async (url) => {
          const response = await fetch(url, { credentials: "include" });
          const body = (await response.json()) as unknown;
          const report =
            typeof body === "object" && body !== null && "report" in body
              ? (body as { report?: unknown }).report
              : null;
          const isFinal =
            typeof report === "object" && report !== null && "isFinal" in report
              ? (report as { isFinal?: unknown }).isFinal
              : null;
          return { status: response.status, isFinal };
        }, this.finalityLatestUrl);
        expect(restored).toEqual({ status: 200, isFinal: true });
        expect(this.finalityMatchedCount).toBe(1);
        finalityRealReadRestored = true;
      } catch {
        cleanupFailed = true;
      }
    }

    const pendingRequestSettled = await settleWithTimeout(this.pendingTasks);
    if (!pendingRequestSettled) cleanupFailed = true;
    let localDraftCleared = false;
    try {
      localDraftCleared = await this.clearLocalDraft();
      await this.flushCaptures();
      this.throwCaptureFailures();
    } catch {
      cleanupFailed = true;
    }

    let consoleSummary: ConsoleAuditSummary | null = null;
    try {
      consoleSummary = this.consoleAudit.stop();
    } catch {
      cleanupFailed = true;
    } finally {
      this.consoleAttached = false;
      this.page.off("request", this.onRequest);
      this.page.off("response", this.onResponse);
      this.listenerAttached = false;
    }
    try {
      expect(consoleSummary).not.toBeNull();
      expect(consoleSummary?.warningCount).toBe(0);
      expect(consoleSummary?.pageErrorCount).toBe(0);
      if (this.owner.auditOwner.endsWith("/denied-role-entry")) {
        expect(
          consoleSummary?.categories.every(
            ({ category }) => category === "network",
          ),
        ).toBe(true);
      } else {
        expect(consoleSummary?.errorCount).toBe(0);
      }
      expect(this.listenerAttached).toBe(false);
      expect(this.consoleAttached).toBe(false);
      expect(this.pendingGate).toBeNull();
      expect(this.finalityHandler).toBeNull();
      expect(this.interceptRemovedCount).toBe(this.interceptInstalledCount);
    } catch {
      cleanupFailed = true;
    }

    const summary = Object.freeze({
      listenerRemovedCount: 4,
      interceptInstalledCount: this.interceptInstalledCount,
      interceptRemovedCount: this.interceptRemovedCount,
      finalityRealReadRestored,
      pendingRequestSettled,
      localDraftCleared,
      workflowNavigationAuthMeRequestCount:
        this.workflowNavigationAuthMeRequestCount ?? 0,
    });
    this.cleanupCompleted = true;
    this.captureTasks.length = 0;
    this.captureFailures.length = 0;
    this.latestFacts.length = 0;
    this.lockRequests.length = 0;
    this.pendingTasks.length = 0;
    this.expectedLockRequest = null;
    this.completedEntries = null;
    this.workflowNavigationAuthMeRequestCount = null;
    this.finalityLatestUrl = null;
    if (cleanupFailed) {
      throw new Error("B12_CANARY_OWNER_MINIMAL_CLEANUP_FAILED");
    }
    return summary;
  }

  private async clearLocalDraft(): Promise<boolean> {
    if (this.page.isClosed()) return true;
    const note = this.page.getByLabel("锁定流程说明（必填）", { exact: true });
    if ((await note.count()) > 0 && (await note.isEditable().catch(() => false))) {
      await note.fill("");
    }
    const checkbox = this.page.locator("#clinical-report-lock-confirmed");
    if (
      (await checkbox.count()) > 0 &&
      (await checkbox.isEnabled().catch(() => false)) &&
      (await checkbox.isChecked().catch(() => false))
    ) {
      await checkbox.uncheck();
    }
    const cancel = this.page.getByRole("button", { name: "取消", exact: true });
    if (
      (await cancel.count()) > 0 &&
      (await cancel.isVisible().catch(() => false)) &&
      (await cancel.isEnabled().catch(() => false))
    ) {
      await cancel.click();
    }
    return true;
  }

  private async flushCaptures(): Promise<void> {
    while (this.captureTasks.length > 0) {
      const tasks = this.captureTasks.splice(0);
      await Promise.all(tasks);
    }
  }

  private throwCaptureFailures(): void {
    if (this.captureFailures.length === 0) return;
    throw new Error("B12_CANARY_OWNER_CAPTURE_FAILED");
  }
}

export const B12_G3_A2_CANARY_LATEST_SAFE_PATTERN = LATEST_SAFE_PATTERN;
export const B12_G3_A2_CANARY_LOCK_SAFE_PATTERN = LOCK_SAFE_PATTERN;
