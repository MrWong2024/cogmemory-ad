import { access, open, rm, unlink } from "node:fs/promises";
import path from "node:path";
import type {
  ConsoleMessage,
  Page,
  Request,
  Response,
  Route,
} from "@playwright/test";
import { test as playwrightTest } from "@playwright/test";

import type { B12BrowserEnvironment } from "./b12-env";
import {
  b12StageMarkerPath,
  deleteB12CoreRuntimeDescriptor,
  readB12CoreRuntimeDescriptor,
  type B12CoreRouteTarget,
  type B12CoreRuntimeDescriptor,
} from "./b12-runtime-descriptor";
import {
  ControlledRequestGate,
  OneShotRequestAbort,
} from "../support/network-control";
import {
  NetworkLedger,
  type NetworkLedgerEntry,
} from "../support/network-ledger";
import { ConsoleAudit, auditRuntimeStorage } from "../support/runtime-audit";
import {
  safeJsonStringify,
  sanitizeBodyKeys,
  sanitizeUrlPattern,
} from "../support/safe-output";
import type {
  AcceptanceRole,
  RoleContextFactory,
} from "../support/role-context-factory";
import { expect } from "../support/acceptance-test";

type EnabledB12BrowserEnvironment = Extract<
  B12BrowserEnvironment,
  { enabled: true }
>;

export type B12ControlledPublicResponseVariant =
  | "none"
  | "is_final_false"
  | "top_level_locked_at_null"
  | "lock_summary_null"
  | "lock_time_mismatch";

export type B12ExpectedPublicReadOutcome =
  | "readable"
  | "clinical_report_incomplete";

export type B12SessionOpenMode =
  | "readable"
  | "forbidden"
  | "clinical_report_incomplete";

export type B12SafeNetworkDiagnosticEntry = {
  relativeIndex: number;
  method: string;
  safeEndpointPattern: string;
  status: number | null;
  resourceType: string;
  initiator: NetworkLedgerEntry["initiator"];
  failureReason: NetworkLedgerEntry["failureReason"];
};

export type B12SafeNetworkDiagnosticEntries = {
  totalCount: number;
  truncated: boolean;
  entries: B12SafeNetworkDiagnosticEntry[];
};

export type B12SafeConsoleDiagnosticEvent = {
  sequence: number;
  level: "warning" | "error";
  category: "network" | "react" | "security" | "runtime" | "other";
  safeLocationPattern: string | null;
  locationPresent: boolean;
};

export type B12SafeConsoleNetworkCorrelation = {
  consoleSequence: number;
  consoleCategory: B12SafeConsoleDiagnosticEvent["category"];
  consoleSafeLocationPattern: string | null;
  matchedNetworkRelativeIndex: number | null;
  matchedMethod: string | null;
  matchedSafeEndpointPattern: string | null;
  matchedStatus: number | null;
  correlation:
    | "exact_endpoint"
    | "same_failure_phase_without_exact_endpoint"
    | "unmatched";
};

export type B12SafeConsoleNetworkCorrelationInspection = {
  unique409: B12SafeNetworkDiagnosticEntry | null;
  consoleEvents: B12SafeConsoleDiagnosticEvent[];
  correlations: B12SafeConsoleNetworkCorrelation[];
  exactCount: number;
  phaseOnlyCount: number;
  unmatchedCount: number;
};

type B12SafeErrorCategory =
  | "forbidden"
  | "clinical_report_incomplete"
  | null;

type SafeActorFacts = {
  operatorNamePresent: boolean;
  operatorRole: string | null;
  internalOperatorIdPresent: boolean;
};

type SafeLockSummaryFacts = {
  present: boolean;
  lockIdPresent: boolean;
  lockedAtPresent: boolean;
  lockedBy: SafeActorFacts | null;
  lockNotePresent: boolean;
};

export type B12LatestFacts = {
  updatedAt: string;
  status: string | null;
  source: string | null;
  qualityStatus: string | null;
  isFinal: boolean | null;
  confirmationPresent: boolean;
  lockedAtPresent: boolean;
  lock: SafeLockSummaryFacts;
  sourceFreezePresent: boolean;
  archivedAtPresent: boolean;
  archivePresent: boolean;
  voidedAtPresent: boolean;
};

export type B12LockResponseFacts = {
  report: Omit<B12LatestFacts, "updatedAt"> & { updatedAtPresent: boolean };
  receiptPresent: boolean;
  alreadyLocked: boolean | null;
  receiptLockIdPresent: boolean;
  receiptLockedAtPresent: boolean;
  receiptLockedBy: SafeActorFacts | null;
  receiptLockNotePresent: boolean;
  receiptLockNoteMatchesExpected: boolean;
};

export type B12LockResult = {
  status: number;
  facts: B12LockResponseFacts | null;
};

export type B12LockRequestEvidence = {
  bodyKeys: string[];
  confirmIsTrue: boolean;
  expectedUpdatedAtMatchesLatest: boolean;
  lockNoteTrimmed: boolean;
  lockNoteLength: number;
  lockNoteMatchesExpected: boolean;
  forbiddenBodyKeyDetected: boolean;
};

type InternalLockRequestEvidence = B12LockRequestEvidence & {
  lockNoteValue: string | null;
};

export type B12ControlledReadEvidence = {
  boundary: "controlled_public_read_boundary";
  variant: Exclude<B12ControlledPublicResponseVariant, "none">;
  method: "GET";
  safeEndpointPattern: "/patients/<id>/visits/<id>/clinical-reports/latest";
  requestCount: 1;
  originalStatus: 200;
  statusPreserved: true;
  headersPreserved: true;
  responseEnvelopeKeysPreserved: true;
  reportKeysPreserved: true;
  changedPublicFields: string[];
};

type SafeNetworkGroup = {
  method: string;
  safeEndpointPattern: string;
  status: number | null;
  errorCategory: B12SafeErrorCategory;
  count: number;
};

export type B12SafePublicReadEvidence = {
  method: "GET";
  safeEndpointPattern: string;
  status: 200 | 403 | 409;
  errorCategory: B12SafeErrorCategory;
  count: number;
};

export type B12DomPrivacySummary = {
  forbiddenRawFieldDetected: false;
  prominentObjectIdDetected: false;
  sensitiveAttributeDetected: false;
  internalActorIdDetected: false;
};

export type B12AuthLifecyclePartition = {
  preAuthenticationEntries: NetworkLedgerEntry[];
  loginAndAuthenticatedEntries: NetworkLedgerEntry[];
  authenticatedEntries: NetworkLedgerEntry[];
  logoutAndPostLogoutEntries: NetworkLedgerEntry[];
  preLoginAuthMeEntries: NetworkLedgerEntry[];
  loginEntries: NetworkLedgerEntry[];
  authenticatedAuthMeEntries: NetworkLedgerEntry[];
  logoutEntries: NetworkLedgerEntry[];
  postLogoutAuthMeEntries: NetworkLedgerEntry[];
  postLogoutBusinessEntries: NetworkLedgerEntry[];
};

export type B12CoreWorkflowNavigationAuthInspection = {
  workflowNavigationEntries: NetworkLedgerEntry[];
  workflowNavigationAuthMeEntries: NetworkLedgerEntry[];
  workflowNavigationAuthMeRequestCount: number;
};

export type B12LogoutMechanism =
  | "ui_control"
  | "scripted_cleanup_fallback";

export type B12SessionSummary = {
  label: string;
  role: AcceptanceRole;
  login: "passed";
  logout: "succeeded";
  logoutMechanism: B12LogoutMechanism;
  routeExpectedPublicReadOutcome: B12ExpectedPublicReadOutcome;
  sessionOpenMode: B12SessionOpenMode;
  workflowNavigationAuthMeRequestCount: number;
  latestFacts: Array<Omit<B12LatestFacts, "updatedAt">>;
  lockResponses: Array<{
    status: number;
    facts: B12LockResponseFacts | null;
  }>;
  lockRequests: B12LockRequestEvidence[];
  network: {
    latestReadCount: number;
    a21EditRequestCount: 0;
    a21SubmitRequestCount: 0;
    a21ConfirmRequestCount: 0;
    a22LockRequestCount: number;
    a23FreezeSourcesRequestCount: 0;
    a24ArchiveRequestCount: 0;
    a25CorrectionRequestCount: 0;
    loginRequestCount: 1;
    authMeRequestCount: number;
    preLoginUnauthenticatedAuthMeRequestCount: 1;
    authenticatedAuthMeRequestCount: number;
    postLogoutUnauthenticatedAuthMeRequestCount: 1;
    logoutRequestCount: 1;
    unrelatedOutputRequestCount: 0;
    abortedRequestCount: number;
    automaticRetryDetected: false;
    pollingDetected: false;
    controlledPublicRead: B12ControlledReadEvidence | null;
    publicRead: B12SafePublicReadEvidence;
    entries: SafeNetworkGroup[];
  };
  console: {
    warningCount: 0;
    errorCount: number;
    pageErrorCount: 0;
    routeScopedAllowedFailureCount: number;
    unexpectedErrorCount: 0;
  };
  storage: "clear";
  cookie: "http_only_session_then_cleared";
  cors: "passed";
  url: "safe_path_without_query_or_hash";
  domPrivacy: B12DomPrivacySummary;
};

export type B12LogoutResult = "succeeded" | "failed" | "not_authenticated";

export type B12LogoutAttempt = {
  result: B12LogoutResult;
  mechanism: B12LogoutMechanism | null;
};

export type B12FailureCleanupResult = {
  scenarioKey: B12CoreRouteTarget["scenarioKey"];
  routeKey: B12CoreRouteTarget["routeKey"];
  role: AcceptanceRole;
  openMode: B12SessionOpenMode;
  logout: B12LogoutResult;
  mechanism: B12LogoutMechanism | null;
};

export type B12SessionOpenFailureCleanupSummary = {
  scenarioKey: B12CoreRouteTarget["scenarioKey"];
  routeKey: B12CoreRouteTarget["routeKey"];
  role: AcceptanceRole;
  openMode: B12SessionOpenMode;
  logoutResult: B12LogoutResult;
  logoutMechanism: B12LogoutMechanism | null;
  ledgerDetached: boolean;
  contextClosed: boolean;
};

type CaptureFailureCategory =
  | "response_headers"
  | "latest_parse"
  | "expected_error_code"
  | "controlled_read";

type B12CollectState =
  | "open"
  | "collecting"
  | "collected"
  | "failed"
  | "closing";

export const B12_NEUTRAL_TEXT = {
  doctorLock: "B12 neutral doctor lock process alpha with no clinical meaning.",
  adminLock: "B12 neutral admin lock process alpha with no clinical meaning.",
  primaryLock:
    "B12 neutral Primary Context lock process alpha with no clinical meaning.",
  secondaryLock:
    "B12 neutral Secondary Context lock process beta with no clinical meaning.",
  conflictLock:
    "B12 neutral conflict lock process alpha with no clinical meaning.",
  latestLockedPrimary:
    "B12 neutral latest conflict Primary lock text with no clinical meaning.",
  latestLockedSecondary:
    "B12 neutral latest conflict Secondary lock text with no clinical meaning.",
  requestInspection:
    "B12 neutral request inspection lock text with no clinical meaning.",
} as const;

const LOCK_SAFE_PATTERN =
  "/patients/<id>/visits/<id>/clinical-reports/<id>/lock";
const LATEST_SAFE_PATTERN =
  "/patients/<id>/visits/<id>/clinical-reports/latest";
const B12_SAFE_DIAGNOSTIC_ENTRY_LIMIT = 20;

function toB12SafeNetworkDiagnosticEntry(
  entry: NetworkLedgerEntry,
  relativeIndex: number,
): B12SafeNetworkDiagnosticEntry {
  return {
    relativeIndex,
    method: entry.method,
    safeEndpointPattern: sanitizeUrlPattern(entry.safeUrlPattern),
    status: entry.status,
    resourceType: entry.resourceType,
    initiator: entry.initiator,
    failureReason: entry.failureReason,
  };
}

function limitB12SafeNetworkDiagnosticEntries(
  entries: readonly B12SafeNetworkDiagnosticEntry[],
): B12SafeNetworkDiagnosticEntries {
  return {
    totalCount: entries.length,
    truncated: entries.length > B12_SAFE_DIAGNOSTIC_ENTRY_LIMIT,
    entries: entries
      .slice(0, B12_SAFE_DIAGNOSTIC_ENTRY_LIMIT)
      .map((entry) => ({ ...entry })),
  };
}

export function toB12SafeNetworkDiagnosticEntries(
  entries: readonly NetworkLedgerEntry[],
): B12SafeNetworkDiagnosticEntries {
  return limitB12SafeNetworkDiagnosticEntries(
    entries.map(toB12SafeNetworkDiagnosticEntry),
  );
}

function classifyB12ConsoleText(
  text: string,
): B12SafeConsoleDiagnosticEvent["category"] {
  if (/cors|cookie|credential|content security|csp/i.test(text)) {
    return "security";
  }
  if (/fetch|network|failed to load|http/i.test(text)) return "network";
  if (/react|hydration/i.test(text)) return "react";
  if (/typeerror|referenceerror|syntaxerror/i.test(text)) return "runtime";
  return "other";
}

export class B12SafeConsoleDiagnosticListener {
  private readonly events: B12SafeConsoleDiagnosticEvent[] = [];
  private readonly failurePhaseConsoleSequences = new Set<number>();
  private sequence = 0;
  private listening = false;
  private clinicalReportIncompleteObserved = false;

  private readonly onConsole = (message: ConsoleMessage): void => {
    const level = message.type();
    if (level !== "warning" && level !== "error") return;
    this.sequence += 1;
    const locationUrl = message.location().url;
    const event: B12SafeConsoleDiagnosticEvent = {
      sequence: this.sequence,
      level,
      category: classifyB12ConsoleText(message.text()),
      safeLocationPattern:
        locationUrl.length > 0 ? sanitizeUrlPattern(locationUrl) : null,
      locationPresent: locationUrl.length > 0,
    };
    this.events.push(event);
    if (this.clinicalReportIncompleteObserved) {
      this.failurePhaseConsoleSequences.add(event.sequence);
    }
  };

  constructor(private readonly page: Page) {}

  start(): void {
    if (this.listening) return;
    this.listening = true;
    this.page.on("console", this.onConsole);
  }

  markNetworkObservation(input: {
    method: string;
    safeEndpointPattern: string;
    status: number;
    failureReason: NetworkLedgerEntry["failureReason"];
  }): void {
    if (
      input.method === "GET" &&
      sanitizeUrlPattern(input.safeEndpointPattern) === LATEST_SAFE_PATTERN &&
      input.status === 409 &&
      input.failureReason === null
    ) {
      this.clinicalReportIncompleteObserved = true;
    }
  }

  summary(): {
    events: B12SafeConsoleDiagnosticEvent[];
    failurePhaseConsoleSequences: number[];
  } {
    return {
      events: this.events.map((event) => ({ ...event })),
      failurePhaseConsoleSequences: [
        ...this.failurePhaseConsoleSequences,
      ].sort((left, right) => left - right),
    };
  }

  stop(): {
    events: B12SafeConsoleDiagnosticEvent[];
    failurePhaseConsoleSequences: number[];
  } {
    if (this.listening) {
      this.listening = false;
      this.page.off("console", this.onConsole);
    }
    return this.summary();
  }
}

function isB12FrontendScriptLocation(
  safeLocationPattern: string | null,
): boolean {
  if (safeLocationPattern === null) return true;
  return (
    safeLocationPattern.startsWith("/_next/") ||
    /\.(?:cjs|mjs|js|jsx|ts|tsx)$/.test(safeLocationPattern)
  );
}

export function correlateB12SafeConsoleNetworkEvents(input: {
  networkEntries: readonly NetworkLedgerEntry[];
  consoleEvents: readonly B12SafeConsoleDiagnosticEvent[];
  failurePhaseConsoleSequences: readonly number[];
}): B12SafeConsoleNetworkCorrelationInspection {
  const safeNetworkEntries = input.networkEntries.map(
    toB12SafeNetworkDiagnosticEntry,
  );
  const candidates = safeNetworkEntries.filter(
    (entry) =>
      entry.method === "GET" &&
      entry.safeEndpointPattern === LATEST_SAFE_PATTERN &&
      entry.status === 409 &&
      entry.failureReason === null,
  );
  const unique409 = candidates.length === 1 ? candidates[0] ?? null : null;
  const failurePhaseSequences = new Set(input.failurePhaseConsoleSequences);
  const consoleEvents = input.consoleEvents.map((event) => ({
    sequence: event.sequence,
    level: event.level,
    category: event.category,
    safeLocationPattern:
      event.safeLocationPattern === null
        ? null
        : sanitizeUrlPattern(event.safeLocationPattern),
    locationPresent: event.locationPresent,
  }));
  const correlations = consoleEvents
    .filter(({ level }) => level === "error")
    .map((event): B12SafeConsoleNetworkCorrelation => {
      const exact =
        unique409 !== null &&
        event.safeLocationPattern === unique409.safeEndpointPattern;
      const phaseOnly =
        unique409 !== null &&
        !exact &&
        failurePhaseSequences.has(event.sequence) &&
        isB12FrontendScriptLocation(event.safeLocationPattern);
      const matched = exact || phaseOnly ? unique409 : null;
      return {
        consoleSequence: event.sequence,
        consoleCategory: event.category,
        consoleSafeLocationPattern: event.safeLocationPattern,
        matchedNetworkRelativeIndex: matched?.relativeIndex ?? null,
        matchedMethod: matched?.method ?? null,
        matchedSafeEndpointPattern: matched?.safeEndpointPattern ?? null,
        matchedStatus: matched?.status ?? null,
        correlation: exact
          ? "exact_endpoint"
          : phaseOnly
            ? "same_failure_phase_without_exact_endpoint"
            : "unmatched",
      };
    });
  return {
    unique409: unique409 ? { ...unique409 } : null,
    consoleEvents,
    correlations,
    exactCount: correlations.filter(
      ({ correlation }) => correlation === "exact_endpoint",
    ).length,
    phaseOnlyCount: correlations.filter(
      ({ correlation }) =>
        correlation === "same_failure_phase_without_exact_endpoint",
    ).length,
    unmatchedCount: correlations.filter(
      ({ correlation }) => correlation === "unmatched",
    ).length,
  };
}

export function assertB12SafeConsoleNetworkCorrelation(input: {
  networkEntries: readonly NetworkLedgerEntry[];
  consoleEvents: readonly B12SafeConsoleDiagnosticEvent[];
  failurePhaseConsoleSequences: readonly number[];
  observedConsoleErrorCount: number;
  allowedConsoleErrorCount: number;
  forbiddenLiterals?: readonly string[];
}): B12SafeConsoleNetworkCorrelationInspection {
  const inspection = correlateB12SafeConsoleNetworkEvents(input);
  if (
    input.observedConsoleErrorCount !== input.allowedConsoleErrorCount ||
    inspection.unique409 === null ||
    inspection.correlations.some(
      ({ correlation }) => correlation !== "exact_endpoint",
    )
  ) {
    throw b12SafeDiagnosticError(
      "B12_CONSOLE_NETWORK_CORRELATION_INVALID",
      {
        unique409: inspection.unique409,
        consoleEvents: inspection.consoleEvents,
        correlations: inspection.correlations,
        counts: {
          exact: inspection.exactCount,
          phaseOnly: inspection.phaseOnlyCount,
          unmatched: inspection.unmatchedCount,
        },
      },
      input.forbiddenLiterals,
    );
  }
  return inspection;
}

const CONTROLLED_VARIANTS: Readonly<
  Record<string, B12ControlledPublicResponseVariant>
> = {
  "eligibility-state/finality-inconsistent": "is_final_false",
  "eligibility-state/lock-without-locked-at-warning":
    "top_level_locked_at_null",
  "eligibility-state/locked-at-without-lock-warning": "lock_summary_null",
  "eligibility-state/lock-time-mismatch-warning": "lock_time_mismatch",
};

const EXPECTED_PUBLIC_READ_OUTCOMES: Readonly<
  Partial<Record<string, B12ExpectedPublicReadOutcome>>
> = {
  "eligibility-state/confirmation-missing": "clinical_report_incomplete",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function safeBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseActor(value: unknown): {
  safe: SafeActorFacts | null;
  internalId: string | null;
} {
  if (!isRecord(value)) return { safe: null, internalId: null };
  const operatorId = safeString(value.operatorId);
  return {
    safe: {
      operatorNamePresent:
        typeof value.operatorName === "string" && value.operatorName.length > 0,
      operatorRole: safeString(value.operatorRole),
      internalOperatorIdPresent: operatorId !== null,
    },
    internalId: operatorId,
  };
}

function parseLock(value: unknown): {
  safe: SafeLockSummaryFacts;
  internalActorId: string | null;
} {
  if (!isRecord(value)) {
    return {
      safe: {
        present: false,
        lockIdPresent: false,
        lockedAtPresent: false,
        lockedBy: null,
        lockNotePresent: false,
      },
      internalActorId: null,
    };
  }
  const actor = parseActor(value.lockedBy);
  return {
    safe: {
      present: true,
      lockIdPresent:
        typeof value.lockId === "string" && value.lockId.length > 0,
      lockedAtPresent:
        typeof value.lockedAt === "string" && value.lockedAt.length > 0,
      lockedBy: actor.safe,
      lockNotePresent:
        typeof value.lockNote === "string" && value.lockNote.length > 0,
    },
    internalActorId: actor.internalId,
  };
}

function parseLatestBody(body: unknown): {
  facts: B12LatestFacts;
  internalActorId: string | null;
} {
  const envelope = isRecord(body) ? body : {};
  const report = isRecord(envelope.report) ? envelope.report : {};
  const updatedAt = safeString(report.updatedAt);
  if (!updatedAt) {
    throw new Error("B12 latest response omitted its server updatedAt fact");
  }
  const lock = parseLock(report.lock);
  return {
    facts: {
      updatedAt,
      status: safeString(report.status),
      source: safeString(report.source),
      qualityStatus: safeString(report.qualityStatus),
      isFinal: safeBoolean(report.isFinal),
      confirmationPresent: isRecord(report.confirmation),
      lockedAtPresent:
        typeof report.lockedAt === "string" && report.lockedAt.length > 0,
      lock: lock.safe,
      sourceFreezePresent: isRecord(report.sourceFreeze),
      archivedAtPresent:
        typeof report.archivedAt === "string" && report.archivedAt.length > 0,
      archivePresent: isRecord(report.archive),
      voidedAtPresent:
        typeof report.voidedAt === "string" && report.voidedAt.length > 0,
    },
    internalActorId: lock.internalActorId,
  };
}

async function parseLatestResponse(response: Response) {
  return parseLatestBody((await response.json()) as unknown);
}

async function hasClinicalReportIncompleteCode(
  response: Response,
): Promise<boolean> {
  const body = (await response.json()) as unknown;
  return isRecord(body) && body.code === "CLINICAL_REPORT_INCOMPLETE";
}

async function parseLockResponse(
  response: Response,
  expectedPersistedNote: string | undefined,
): Promise<{
  safe: B12LockResponseFacts | null;
  actorIds: string[];
}> {
  if (response.status() < 200 || response.status() >= 300) {
    return { safe: null, actorIds: [] };
  }
  const body = (await response.json()) as unknown;
  const envelope = isRecord(body) ? body : {};
  const report = isRecord(envelope.report) ? envelope.report : {};
  const parsedReport = parseLatestBody({ report });
  const receipt = isRecord(envelope.lockReceipt) ? envelope.lockReceipt : null;
  const receiptActor = parseActor(receipt?.lockedBy);
  const receiptNote = safeString(receipt?.lockNote);
  const actorIds = [
    parsedReport.internalActorId,
    receiptActor.internalId,
  ].filter((value): value is string => value !== null);
  const { updatedAt, ...safeReport } = parsedReport.facts;
  return {
    safe: {
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
      receiptLockedBy: receiptActor.safe,
      receiptLockNotePresent: receiptNote !== null && receiptNote.length > 0,
      receiptLockNoteMatchesExpected:
        expectedPersistedNote === undefined ||
        receiptNote === expectedPersistedNote.trim(),
    },
    actorIds,
  };
}

function latestResponse(response: Response): boolean {
  return (
    response.request().method() === "GET" &&
    sanitizeUrlPattern(response.url()) === LATEST_SAFE_PATTERN
  );
}

function protectedPatientWorkflowResponse(response: Response): boolean {
  return (
    response.request().method() === "GET" &&
    response.status() === 403 &&
    sanitizeUrlPattern(response.url()).startsWith("/patients/")
  );
}

function lockRequest(request: Request): boolean {
  return (
    request.method() === "POST" &&
    sanitizeUrlPattern(request.url()) === LOCK_SAFE_PATTERN
  );
}

function mutation(entry: NetworkLedgerEntry): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(entry.method);
}

function relevantEntry(entry: NetworkLedgerEntry): boolean {
  return (
    entry.safeUrlPattern === "/auth/login" ||
    entry.safeUrlPattern === "/auth/logout" ||
    entry.safeUrlPattern === "/auth/me" ||
    entry.safeUrlPattern.startsWith("/patients/") ||
    /(?:pdf|print|download|signature|\bai\b|llm)/i.test(entry.safeUrlPattern)
  );
}

function cloneNetworkLedgerEntry(
  entry: NetworkLedgerEntry,
): NetworkLedgerEntry {
  return {
    ...entry,
    bodyKeys: [...entry.bodyKeys],
  };
}

function successfulResponse(entry: NetworkLedgerEntry): boolean {
  return (
    entry.status !== null &&
    entry.status >= 200 &&
    entry.status < 300 &&
    entry.failureReason === null
  );
}

function expectedLoginPageRequest(entry: NetworkLedgerEntry): boolean {
  if (entry.method !== "GET") return false;
  if (entry.safeUrlPattern === "/login") return true;
  if (entry.safeUrlPattern.startsWith("/_next/")) return true;
  return (
    (entry.safeUrlPattern === "/favicon.ico" ||
      entry.safeUrlPattern === "/manifest.webmanifest") &&
    (entry.resourceType === "image" || entry.resourceType === "other")
  );
}

function b12SafeDiagnosticError(
  category: string,
  summary: unknown,
  forbiddenLiterals: readonly string[] = [],
): Error {
  return new Error(
    `${category} ${safeJsonStringify(summary, forbiddenLiterals)}`,
  );
}

function limitB12SafeFacts<T>(entries: readonly T[]): {
  totalCount: number;
  truncated: boolean;
  entries: T[];
} {
  return {
    totalCount: entries.length,
    truncated: entries.length > B12_SAFE_DIAGNOSTIC_ENTRY_LIMIT,
    entries: entries.slice(0, B12_SAFE_DIAGNOSTIC_ENTRY_LIMIT),
  };
}

export async function rethrowAfterB12SessionOpenFailureCleanup(input: {
  target: B12CoreRouteTarget;
  role: AcceptanceRole;
  openMode: B12SessionOpenMode;
  originalError: unknown;
  cleanupLogout: () => Promise<B12LogoutAttempt>;
  closeContext: () => Promise<void>;
  ledgerDetached: () => boolean;
  contextClosed: () => boolean;
  forbiddenLiterals?: readonly string[];
  emit?: (line: string) => void;
}): Promise<never> {
  let logoutAttempt: B12LogoutAttempt = {
    result: "failed",
    mechanism: null,
  };
  try {
    logoutAttempt = await input.cleanupLogout();
  } catch {
    logoutAttempt = { result: "failed", mechanism: null };
  }
  try {
    await input.closeContext();
  } catch {
    // The fixed contextClosed fact below preserves the failure safely.
  }
  const summary: B12SessionOpenFailureCleanupSummary = {
    scenarioKey: input.target.scenarioKey,
    routeKey: input.target.routeKey,
    role: input.role,
    openMode: input.openMode,
    logoutResult: logoutAttempt.result,
    logoutMechanism: logoutAttempt.mechanism,
    ledgerDetached: input.ledgerDetached(),
    contextClosed: input.contextClosed(),
  };
  try {
    const line = `B12_SESSION_OPEN_FAILURE_CLEANUP ${safeJsonStringify(
      summary,
      input.forbiddenLiterals,
    )}`;
    (input.emit ?? console.log)(line);
  } catch {
    // Safe-summary emission must never replace the original assertion error.
  }
  throw input.originalError;
}

export function setB12LoginBoundaryEntryIndex(
  currentBoundaryEntryIndex: number | null,
  entryCount: number,
): number {
  if (currentBoundaryEntryIndex !== null) {
    throw new Error("B12 login boundary entry index is already set");
  }
  if (!Number.isInteger(entryCount) || entryCount < 0) {
    throw new Error("B12 login boundary entry count is invalid");
  }
  return entryCount;
}

export function setB12LogoutBoundaryEntryIndex(
  currentBoundaryEntryIndex: number | null,
  loginBoundaryEntryIndex: number,
  entryCount: number,
): number {
  if (currentBoundaryEntryIndex !== null) {
    throw new Error("B12 logout boundary entry index is already set");
  }
  if (!Number.isInteger(entryCount) || entryCount < 0) {
    throw new Error("B12 logout boundary entry count is invalid");
  }
  if (
    !Number.isInteger(loginBoundaryEntryIndex) ||
    loginBoundaryEntryIndex < 0
  ) {
    throw new Error("B12 login boundary entry index is invalid");
  }
  if (entryCount <= loginBoundaryEntryIndex) {
    throw new Error("B12 logout boundary must be after the login boundary");
  }
  return entryCount;
}

export function setB12WorkflowNavigationBoundaryEntryIndex(
  currentBoundaryEntryIndex: number | null,
  entryCount: number,
): number {
  if (currentBoundaryEntryIndex !== null) {
    throw new Error(
      "B12 workflow navigation boundary entry index is already set",
    );
  }
  if (!Number.isInteger(entryCount) || entryCount < 0) {
    throw new Error("B12 workflow navigation boundary entry count is invalid");
  }
  return entryCount;
}

export function setB12WorkflowNavigationCompletedEntryIndex(
  currentCompletedEntryIndex: number | null,
  workflowNavigationBoundaryEntryIndex: number,
  entryCount: number,
): number {
  if (currentCompletedEntryIndex !== null) {
    throw new Error(
      "B12 workflow navigation completed entry index is already set",
    );
  }
  if (!Number.isInteger(entryCount) || entryCount < 0) {
    throw new Error(
      "B12 workflow navigation completed entry count is invalid",
    );
  }
  if (
    !Number.isInteger(workflowNavigationBoundaryEntryIndex) ||
    workflowNavigationBoundaryEntryIndex < 0
  ) {
    throw new Error("B12 workflow navigation boundary entry index is invalid");
  }
  if (entryCount <= workflowNavigationBoundaryEntryIndex) {
    throw new Error(
      "B12 workflow navigation completed boundary must be after the start boundary",
    );
  }
  return entryCount;
}

export function inspectB12CoreWorkflowNavigationAuthEntries(
  entries: readonly NetworkLedgerEntry[],
  workflowNavigationBoundaryEntryIndex: number | null | undefined,
  workflowNavigationCompletedEntryIndex: number | null | undefined,
  forbiddenLiterals: readonly string[] = [],
): B12CoreWorkflowNavigationAuthInspection {
  if (
    typeof workflowNavigationBoundaryEntryIndex !== "number" ||
    !Number.isInteger(workflowNavigationBoundaryEntryIndex) ||
    workflowNavigationBoundaryEntryIndex < 0
  ) {
    throw new Error(
      "B12 workflow navigation boundary entry index is out of range",
    );
  }
  if (
    typeof workflowNavigationCompletedEntryIndex !== "number" ||
    !Number.isInteger(workflowNavigationCompletedEntryIndex) ||
    workflowNavigationCompletedEntryIndex < 0 ||
    workflowNavigationCompletedEntryIndex > entries.length
  ) {
    throw new Error(
      "B12 workflow navigation completed entry index is out of range",
    );
  }
  if (
    workflowNavigationBoundaryEntryIndex >=
    workflowNavigationCompletedEntryIndex
  ) {
    throw new Error(
      "B12 workflow navigation boundary must precede the completed boundary",
    );
  }

  const workflowNavigationEntries = entries.slice(
    workflowNavigationBoundaryEntryIndex,
    workflowNavigationCompletedEntryIndex,
  );
  if (
    workflowNavigationEntries.some(
      ({ safeUrlPattern }) =>
        safeUrlPattern === "/auth/login" ||
        safeUrlPattern === "/auth/logout",
    )
  ) {
    throw new Error(
      "B12 workflow navigation contained a login or logout transition",
    );
  }

  const workflowNavigationAuthMeEntries = workflowNavigationEntries.filter(
    ({ safeUrlPattern }) => safeUrlPattern === "/auth/me",
  );
  const invalidAuthMeEntryDetected =
    workflowNavigationAuthMeEntries.length === 0 ||
    workflowNavigationAuthMeEntries.some(
      ({ method, status, failureReason, initiator }) =>
        method !== "GET" ||
        status === null ||
        status < 200 ||
        status >= 300 ||
        failureReason !== null ||
        initiator !== "script",
    );
  if (invalidAuthMeEntryDetected) {
    const safeEntries = workflowNavigationEntries.map(
      toB12SafeNetworkDiagnosticEntry,
    );
    const authMeFacts = safeEntries
      .filter(
        ({ safeEndpointPattern }) => safeEndpointPattern === "/auth/me",
      )
      .map(
        ({ relativeIndex, status, method, initiator, failureReason }) => ({
          relativeIndex,
          status,
          method,
          initiator,
          failureReason,
        }),
      );
    const protectedGetFacts = safeEntries
      .filter(
        ({ method, safeEndpointPattern }) =>
          method === "GET" && safeEndpointPattern.startsWith("/patients/"),
      )
      .map(({ relativeIndex, safeEndpointPattern, status }) => ({
        relativeIndex,
        safeEndpointPattern,
        status,
      }));
    const protected403Facts = protectedGetFacts.filter(
      ({ status }) => status === 403,
    );
    const relativeOrderFacts = authMeFacts.flatMap((authMe) =>
      protected403Facts.map((protectedEntry) => ({
        authMeRelativeIndex: authMe.relativeIndex,
        protected403RelativeIndex: protectedEntry.relativeIndex,
        order:
          authMe.relativeIndex < protectedEntry.relativeIndex
            ? "auth_me_before_protected_403"
            : "auth_me_after_protected_403",
      })),
    );
    throw b12SafeDiagnosticError(
      "B12_WORKFLOW_NAVIGATION_AUTH_PROBE_INVALID",
      {
        workflowStartBoundary: workflowNavigationBoundaryEntryIndex,
        workflowCompletedBoundary: workflowNavigationCompletedEntryIndex,
        navigationEntryCount: workflowNavigationEntries.length,
        authMe: limitB12SafeFacts(authMeFacts),
        protectedPatientVisitClinicalReportGets:
          limitB12SafeFacts(protectedGetFacts),
        authMeToProtected403Order:
          limitB12SafeFacts(relativeOrderFacts),
      },
      forbiddenLiterals,
    );
  }

  // Core verifies every navigation probe, while B12-83's unique owner separately
  // decides the exact no-second-/auth/me contract in resilience-security.
  return {
    workflowNavigationEntries: workflowNavigationEntries.map(
      cloneNetworkLedgerEntry,
    ),
    workflowNavigationAuthMeEntries: workflowNavigationAuthMeEntries.map(
      cloneNetworkLedgerEntry,
    ),
    workflowNavigationAuthMeRequestCount:
      workflowNavigationAuthMeEntries.length,
  };
}

export function partitionB12AuthLifecycleEntries(
  entries: readonly NetworkLedgerEntry[],
  loginBoundaryEntryIndex: number,
  logoutBoundaryEntryIndex: number,
  forbiddenLiterals: readonly string[] = [],
): B12AuthLifecyclePartition {
  if (
    !Number.isInteger(loginBoundaryEntryIndex) ||
    loginBoundaryEntryIndex < 0 ||
    loginBoundaryEntryIndex >= entries.length
  ) {
    throw new Error("B12 login boundary entry index is out of range");
  }
  if (
    !Number.isInteger(logoutBoundaryEntryIndex) ||
    logoutBoundaryEntryIndex < 0 ||
    logoutBoundaryEntryIndex > entries.length
  ) {
    throw new Error("B12 logout boundary entry index is out of range");
  }
  if (loginBoundaryEntryIndex >= logoutBoundaryEntryIndex) {
    throw new Error("B12 login boundary must precede the logout boundary");
  }

  const preAuthenticationEntries = entries.slice(0, loginBoundaryEntryIndex);
  const loginAndAuthenticatedEntries = entries.slice(
    loginBoundaryEntryIndex,
    logoutBoundaryEntryIndex,
  );
  const logoutAndPostLogoutEntries = entries.slice(
    logoutBoundaryEntryIndex,
  );
  const preLoginAuthMeEntries = preAuthenticationEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "GET" && safeUrlPattern === "/auth/me",
  );
  const expectedLoginPageEntries = preAuthenticationEntries.filter(
    expectedLoginPageRequest,
  );
  const preLoginAuthMeEntrySet = new Set(preLoginAuthMeEntries);
  const expectedLoginPageEntrySet = new Set(expectedLoginPageEntries);
  const unexpectedPreAuthenticationEntries = preAuthenticationEntries.filter(
    (entry) =>
      !preLoginAuthMeEntrySet.has(entry) &&
      !expectedLoginPageEntrySet.has(entry),
  );
  const loginEntries = loginAndAuthenticatedEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "POST" && safeUrlPattern === "/auth/login",
  );
  const postBoundaryLoginEntries = logoutAndPostLogoutEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "POST" && safeUrlPattern === "/auth/login",
  );
  if (postBoundaryLoginEntries.length > 0) {
    throw new Error("B12 login request occurred after the logout boundary");
  }
  if (loginEntries.length !== 1) {
    throw new Error("B12 login transition requires exactly one login request");
  }
  const loginEntry = loginEntries[0];
  if (!loginEntry || !successfulResponse(loginEntry)) {
    throw new Error("B12 login request was not successful");
  }
  if (loginEntry.initiator !== "script") {
    throw new Error("B12 login request was not initiated by page script");
  }
  const loginOffset = loginAndAuthenticatedEntries.indexOf(loginEntry);
  if (
    loginAndAuthenticatedEntries
      .slice(0, loginOffset)
      .some(
        ({ method, safeUrlPattern }) =>
          method === "GET" && safeUrlPattern === "/auth/me",
      )
  ) {
    throw new Error("B12 authenticated /auth/me preceded the login request");
  }
  const authenticatedEntries = loginAndAuthenticatedEntries.slice(
    loginOffset + 1,
  );
  const authenticatedAuthMeEntries = authenticatedEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "GET" && safeUrlPattern === "/auth/me",
  );
  const logoutEntries = logoutAndPostLogoutEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "POST" && safeUrlPattern === "/auth/logout",
  );
  const postLogoutAuthMeEntries = logoutAndPostLogoutEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "GET" && safeUrlPattern === "/auth/me",
  );
  const postLogoutBusinessEntries = logoutAndPostLogoutEntries.filter(
    (entry) =>
      !(
        (entry.method === "POST" &&
          entry.safeUrlPattern === "/auth/logout") ||
        (entry.method === "GET" && entry.safeUrlPattern === "/auth/me") ||
        expectedLoginPageRequest(entry)
      ),
  );

  if (preLoginAuthMeEntries.length !== 1) {
    throw new Error(
      "B12 pre-authentication phase requires exactly one unauthenticated /auth/me",
    );
  }
  const preLoginAuthMeEntry = preLoginAuthMeEntries[0];
  if (
    !preLoginAuthMeEntry ||
    preLoginAuthMeEntry.status !== 401 ||
    preLoginAuthMeEntry.failureReason !== null
  ) {
    throw new Error("B12 pre-authentication /auth/me response was not a clean 401");
  }
  if (unexpectedPreAuthenticationEntries.length > 0) {
    const unexpectedEntrySet = new Set(unexpectedPreAuthenticationEntries);
    const safeUnexpectedEntries = preAuthenticationEntries
      .map(toB12SafeNetworkDiagnosticEntry)
      .filter((_, index) => {
        const entry = preAuthenticationEntries[index];
        return entry !== undefined && unexpectedEntrySet.has(entry);
      });
    throw b12SafeDiagnosticError(
      "B12_PRE_AUTHENTICATION_UNEXPECTED_REQUEST",
      limitB12SafeNetworkDiagnosticEntries(safeUnexpectedEntries),
      forbiddenLiterals,
    );
  }
  if (
    entries.slice(0, logoutBoundaryEntryIndex).some(
      ({ method, safeUrlPattern }) =>
        method === "POST" && safeUrlPattern === "/auth/logout",
    )
  ) {
    throw new Error("B12 logout request occurred before the logout boundary");
  }
  if (authenticatedAuthMeEntries.length === 0) {
    throw new Error("B12 authenticated phase omitted /auth/me");
  }
  if (!authenticatedAuthMeEntries.every(successfulResponse)) {
    throw new Error("B12 authenticated /auth/me response was not successful");
  }
  if (logoutEntries.length !== 1) {
    throw new Error("B12 logout transition requires exactly one logout request");
  }
  const logoutEntry = logoutEntries[0];
  if (!logoutEntry || !successfulResponse(logoutEntry)) {
    throw new Error("B12 logout request was not successful");
  }
  if (logoutEntry.initiator !== "script") {
    throw new Error("B12 logout request was not initiated by page script");
  }
  if (postLogoutAuthMeEntries.length !== 1) {
    throw new Error(
      "B12 post-logout phase requires exactly one unauthenticated /auth/me",
    );
  }
  const postLogoutAuthMeEntry = postLogoutAuthMeEntries[0];
  if (
    !postLogoutAuthMeEntry ||
    postLogoutAuthMeEntry.status !== 401 ||
    postLogoutAuthMeEntry.failureReason !== null
  ) {
    throw new Error("B12 post-logout /auth/me response was not a clean 401");
  }
  const logoutOffset = logoutAndPostLogoutEntries.indexOf(logoutEntry);
  const postLogoutAuthMeOffset = logoutAndPostLogoutEntries.indexOf(
    postLogoutAuthMeEntry,
  );
  if (postLogoutAuthMeOffset <= logoutOffset) {
    throw new Error("B12 post-logout /auth/me preceded the logout request");
  }
  if (postLogoutBusinessEntries.length > 0) {
    throw new Error("B12 protected business request occurred after logout");
  }

  return {
    preAuthenticationEntries: preAuthenticationEntries.map(
      cloneNetworkLedgerEntry,
    ),
    loginAndAuthenticatedEntries: loginAndAuthenticatedEntries.map(
      cloneNetworkLedgerEntry,
    ),
    authenticatedEntries: authenticatedEntries.map(cloneNetworkLedgerEntry),
    logoutAndPostLogoutEntries: logoutAndPostLogoutEntries.map(
      cloneNetworkLedgerEntry,
    ),
    preLoginAuthMeEntries: preLoginAuthMeEntries.map(cloneNetworkLedgerEntry),
    loginEntries: loginEntries.map(cloneNetworkLedgerEntry),
    authenticatedAuthMeEntries: authenticatedAuthMeEntries.map(
      cloneNetworkLedgerEntry,
    ),
    logoutEntries: logoutEntries.map(cloneNetworkLedgerEntry),
    postLogoutAuthMeEntries: postLogoutAuthMeEntries.map(
      cloneNetworkLedgerEntry,
    ),
    postLogoutBusinessEntries: postLogoutBusinessEntries.map(
      cloneNetworkLedgerEntry,
    ),
  };
}

function safeErrorCategory(entry: NetworkLedgerEntry): B12SafeErrorCategory {
  if (
    entry.method === "GET" &&
    entry.status === 403 &&
    entry.safeUrlPattern.startsWith("/patients/")
  ) {
    return "forbidden";
  }
  if (
    entry.method === "GET" &&
    entry.status === 409 &&
    entry.safeUrlPattern === LATEST_SAFE_PATTERN
  ) {
    return "clinical_report_incomplete";
  }
  return null;
}

function groupNetworkEntries(
  entries: readonly NetworkLedgerEntry[],
): SafeNetworkGroup[] {
  const groups = new Map<string, SafeNetworkGroup>();
  for (const entry of entries.filter(relevantEntry)) {
    const value: SafeNetworkGroup = {
      method: entry.method,
      safeEndpointPattern: entry.safeUrlPattern,
      status: entry.status,
      errorCategory: safeErrorCategory(entry),
      count: 1,
    };
    const key = JSON.stringify(value);
    const current = groups.get(key);
    if (current) current.count += 1;
    else groups.set(key, value);
  }
  return [...groups.values()].sort(
    (left, right) =>
      left.safeEndpointPattern.localeCompare(right.safeEndpointPattern) ||
      left.method.localeCompare(right.method) ||
      (left.status ?? -1) - (right.status ?? -1),
  );
}

function targetKey(target: B12CoreRouteTarget): string {
  return `${target.scenarioKey}/${target.routeKey}`;
}

function controlledVariantFor(
  target: B12CoreRouteTarget,
): B12ControlledPublicResponseVariant {
  return CONTROLLED_VARIANTS[targetKey(target)] ?? "none";
}

function expectedPublicReadOutcomeFor(
  target: B12CoreRouteTarget,
): B12ExpectedPublicReadOutcome {
  return EXPECTED_PUBLIC_READ_OUTCOMES[targetKey(target)] ?? "readable";
}

export function resolveB12SessionOpenMode(
  target: B12CoreRouteTarget,
  role: AcceptanceRole,
): B12SessionOpenMode {
  const key = targetKey(target);
  if (role === "system") {
    if (key !== "eligibility-state/denied-role-entry") {
      throw new Error("B12 system Session is allowed only for B12-08");
    }
    return "forbidden";
  }
  if (expectedPublicReadOutcomeFor(target) === "clinical_report_incomplete") {
    if (key !== "eligibility-state/confirmation-missing" || role !== "doctor") {
      throw new Error(
        "B12 incomplete-report open is allowed only for B12-14 doctor",
      );
    }
    return "clinical_report_incomplete";
  }
  return "readable";
}

export function resolveB12LogoutDisposition(input: {
  target: B12CoreRouteTarget;
  role: AcceptanceRole;
  openMode: B12SessionOpenMode;
  hasHttpOnlySessionCookie: boolean;
  hasVisibleUiLogout: boolean;
}): B12LogoutMechanism | "not_authenticated" | "unsupported" {
  if (!input.hasHttpOnlySessionCookie) return "not_authenticated";
  if (input.hasVisibleUiLogout) return "ui_control";
  if (
    targetKey(input.target) === "eligibility-state/denied-role-entry" &&
    input.role === "system" &&
    input.openMode === "forbidden"
  ) {
    return "scripted_cleanup_fallback";
  }
  return "unsupported";
}

export async function attemptB12BrowserLogout(input: {
  page: Page;
  target: B12CoreRouteTarget;
  role: AcceptanceRole;
  openMode: B12SessionOpenMode;
  backendOrigin: string;
  frontendOrigin: string;
  contextCookies: () => Promise<Array<{ httpOnly: boolean }>>;
  recordBoundary: () => void | Promise<void>;
}): Promise<B12LogoutAttempt> {
  if (input.page.isClosed()) return { result: "failed", mechanism: null };

  let hasHttpOnlySessionCookie: boolean;
  try {
    hasHttpOnlySessionCookie = (await input.contextCookies()).some(
      ({ httpOnly }) => httpOnly,
    );
  } catch {
    return { result: "failed", mechanism: null };
  }

  const logoutControl = input.page.getByRole("button", {
    name: "退出登录",
    exact: true,
  });
  const hasVisibleUiLogout = await logoutControl
    .isVisible()
    .catch(() => false);
  const disposition = resolveB12LogoutDisposition({
    target: input.target,
    role: input.role,
    openMode: input.openMode,
    hasHttpOnlySessionCookie,
    hasVisibleUiLogout,
  });
  if (disposition === "not_authenticated") {
    return { result: "not_authenticated", mechanism: null };
  }
  if (disposition === "unsupported") {
    return { result: "failed", mechanism: null };
  }

  const logoutResponsePromise = input.page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).origin === input.backendOrigin &&
        new URL(response.url()).pathname === "/auth/logout",
      { timeout: 5_000 },
    )
    .catch(() => null);
  const logoutRequestFinishedPromise = input.page
    .waitForEvent("requestfinished", {
      predicate: (request) =>
        request.method() === "POST" &&
        new URL(request.url()).origin === input.backendOrigin &&
        new URL(request.url()).pathname === "/auth/logout",
      timeout: 5_000,
    })
    .catch(() => null);
  const postLogoutAuthMeResponsePromise = input.page
    .waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).origin === input.backendOrigin &&
        new URL(response.url()).pathname === "/auth/me",
      { timeout: 5_000 },
    )
    .catch(() => null);

  try {
    await input.recordBoundary();
    let scriptedStatus: number | null = null;
    if (disposition === "ui_control") {
      await logoutControl.click();
    } else {
      scriptedStatus = await input.page.evaluate(async (backendOrigin) => {
        const response = await fetch(
          new URL("/auth/logout", backendOrigin).toString(),
          {
            method: "POST",
            credentials: "include",
          },
        );
        const status = response.status;
        await response.text();
        return status;
      }, input.backendOrigin);
    }

    const logoutResponse = await logoutResponsePromise;
    const logoutRequestFinished = await logoutRequestFinishedPromise;
    if (
      !logoutResponse ||
      !logoutRequestFinished ||
      logoutResponse.status() < 200 ||
      logoutResponse.status() >= 300 ||
      (scriptedStatus !== null && scriptedStatus !== logoutResponse.status())
    ) {
      return { result: "failed", mechanism: disposition };
    }

    if (disposition === "scripted_cleanup_fallback") {
      await input.page.goto(`${input.frontendOrigin}/login`, {
        waitUntil: "domcontentloaded",
        timeout: 5_000,
      });
    } else {
      await input.page.waitForURL(`${input.frontendOrigin}/login`, {
        timeout: 5_000,
      });
    }
    const postLogoutAuthMeResponse = await postLogoutAuthMeResponsePromise;
    if (!postLogoutAuthMeResponse || postLogoutAuthMeResponse.status() !== 401) {
      return { result: "failed", mechanism: disposition };
    }
    const sessionCookieRemains = (await input.contextCookies()).some(
      ({ httpOnly }) => httpOnly,
    );
    return sessionCookieRemains
      ? { result: "failed", mechanism: disposition }
      : { result: "succeeded", mechanism: disposition };
  } catch {
    return { result: "failed", mechanism: disposition };
  }
}

function assertSessionOpenModeAllowed(
  target: B12CoreRouteTarget,
  role: AcceptanceRole,
  mode: B12SessionOpenMode,
): void {
  if (mode !== resolveB12SessionOpenMode(target, role)) {
    throw new Error("B12 Session open mode does not match the fixed route contract");
  }
}

function expectedSessionCount(target: B12CoreRouteTarget): number {
  if (targetKey(target) === "eligibility-state/denied-role-entry") return 3;
  if (
    targetKey(target) === "success-idempotency/already-locked-idempotency" ||
    targetKey(target) === "conflict/lock-conflict-latest-locked"
  ) {
    return 2;
  }
  return 1;
}

function expectedLockCount(target: B12CoreRouteTarget, label: string): number {
  const key = targetKey(target);
  if (
    key === "lock-form-contract/validation-request-contract" ||
    key === "success-idempotency/doctor-lock-success" ||
    key === "success-idempotency/admin-lock-success"
  ) {
    return 1;
  }
  if (key === "success-idempotency/already-locked-idempotency") return 1;
  if (key === "conflict/lock-conflict-continue") return 2;
  if (key === "conflict/lock-conflict-latest-locked") {
    return label === "primary" || label === "secondary" ? 1 : 0;
  }
  return 0;
}

function expectedLatestCount(
  target: B12CoreRouteTarget,
  label: string,
): number {
  const key = targetKey(target);
  if (key === "eligibility-state/denied-role-entry" && label === "system") {
    return 0;
  }
  if (key === "conflict/lock-conflict-continue") return 2;
  if (key === "conflict/lock-conflict-latest-locked" && label === "primary") {
    return 2;
  }
  return 1;
}

export async function auditB12DomPrivacy(
  page: Page,
  internalActorIds: readonly string[],
): Promise<B12DomPrivacySummary> {
  const result = await page.evaluate((actorIds) => {
    const disclosure =
      "仅展示最新公开摘要与当前页面会话回执，不公开完整编辑历史、前后值、metadata 或签名字段。";
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script,style").forEach((node) => node.remove());
    const html = clone.outerHTML.replace(disclosure, "");
    const text = document.body.innerText.replace(disclosure, "");
    const forbiddenRawField =
      /a22Lock|["']lockedBy["']|completeAudit|auditHistory|sessionToken|passwordHash/i;
    const objectId = /\b[a-f\d]{24}\b/i;
    const prominentObjectIdDetected = [
      ...document.querySelectorAll(
        'h1,h2,h3,h4,h5,h6,button,label,dt,dd,[role="button"],[role="link"]',
      ),
    ].some((node) => objectId.test(node.textContent ?? ""));
    const sensitiveAttributeDetected = [...document.querySelectorAll("*")].some(
      (node) =>
        [...node.attributes].some(
          (attribute) =>
            (attribute.name === "title" ||
              attribute.name.startsWith("aria-") ||
              attribute.name.startsWith("data-")) &&
            (forbiddenRawField.test(attribute.value) ||
              actorIds.some(
                (actorId) =>
                  actorId.length > 0 && attribute.value.includes(actorId),
              )),
        ),
    );
    const internalActorIdDetected = actorIds.some(
      (actorId) =>
        actorId.length > 0 &&
        (text.includes(actorId) || html.includes(actorId)),
    );
    return {
      forbiddenRawFieldDetected:
        forbiddenRawField.test(text) || forbiddenRawField.test(html),
      prominentObjectIdDetected,
      sensitiveAttributeDetected,
      internalActorIdDetected,
    };
  }, internalActorIds);
  expect(result).toEqual({
    forbiddenRawFieldDetected: false,
    prominentObjectIdDetected: false,
    sensitiveAttributeDetected: false,
    internalActorIdDetected: false,
  });
  return result as B12DomPrivacySummary;
}

export class B12BrowserSession {
  readonly page: Page;
  private readonly ledger = new NetworkLedger();
  private readonly consoleAudit: ConsoleAudit;
  private readonly safeConsoleDiagnostics: B12SafeConsoleDiagnosticListener;
  private readonly latestFacts: B12LatestFacts[] = [];
  private readonly internalActorIds = new Set<string>();
  private readonly lockRequests: InternalLockRequestEvidence[] = [];
  private readonly lockResponses: B12LockResult[] = [];
  private readonly corsChecks: boolean[] = [];
  private readonly captureTasks: Promise<void>[] = [];
  private readonly captureFailures: CaptureFailureCategory[] = [];
  private clinicalReportIncompleteCodeCount = 0;
  private controlledReadEvidence: B12ControlledReadEvidence | null = null;
  private controlledReadHandler: ((route: Route) => Promise<void>) | null =
    null;
  private loginBoundaryEntryIndex: number | null = null;
  private workflowNavigationBoundaryEntryIndex: number | null = null;
  private workflowNavigationCompletedEntryIndex: number | null = null;
  private workflowNavigationAuthMeRequestCount: number | null = null;
  private logoutBoundaryEntryIndex: number | null = null;
  private collectState: B12CollectState = "open";
  private collectedSummary: B12SessionSummary | null = null;
  private logoutResult: B12LogoutResult | null = null;
  private logoutMechanism: B12LogoutMechanism | null = null;
  private explicitLockCount = 0;
  private explicitAbortedLockCount = 0;
  private acceptingCaptures = true;
  private consoleListening = false;
  private ledgerDetached = false;
  private contextClosed = false;

  private constructor(
    readonly label: string,
    readonly role: AcceptanceRole,
    private readonly loginIdentifier: string,
    private readonly descriptor: B12CoreRuntimeDescriptor,
    private readonly target: B12CoreRouteTarget,
    private readonly openMode: B12SessionOpenMode,
    private readonly environment: EnabledB12BrowserEnvironment,
    private readonly contextCookies: () => Promise<
      Array<{ httpOnly: boolean }>
    >,
    private readonly closeBrowserContext: () => Promise<void>,
    page: Page,
  ) {
    this.page = page;
    this.consoleAudit = new ConsoleAudit(page);
    this.safeConsoleDiagnostics = new B12SafeConsoleDiagnosticListener(page);
  }

  static async create(input: {
    label: string;
    role: AcceptanceRole;
    loginIdentifier: string;
    descriptor: B12CoreRuntimeDescriptor;
    target: B12CoreRouteTarget;
    openMode: B12SessionOpenMode;
    environment: EnabledB12BrowserEnvironment;
    roleContexts: RoleContextFactory;
  }): Promise<B12BrowserSession> {
    assertSessionOpenModeAllowed(input.target, input.role, input.openMode);
    const roleContext = await input.roleContexts.create(
      input.role,
      input.label,
      {
        viewport: { width: 1536, height: 864 },
      },
    );
    const session = new B12BrowserSession(
      input.label,
      input.role,
      input.loginIdentifier,
      input.descriptor,
      input.target,
      input.openMode,
      input.environment,
      () => roleContext.context.cookies(),
      () => roleContext.context.close(),
      roleContext.page,
    );
    try {
      await session.open();
      return session;
    } catch (error: unknown) {
      return rethrowAfterB12SessionOpenFailureCleanup({
        target: input.target,
        role: input.role,
        openMode: input.openMode,
        originalError: error,
        cleanupLogout: async () => ({
          result: await session.bestEffortLogout(),
          mechanism: session.logoutMechanism,
        }),
        closeContext: () => session.closeContext(),
        ledgerDetached: () => session.ledgerDetached,
        contextClosed: () => session.contextClosed,
        forbiddenLiterals: session.diagnosticForbiddenLiterals(),
      });
    }
  }

  private diagnosticForbiddenLiterals(): string[] {
    return [
      this.environment.fixturePassword,
      this.loginIdentifier,
      this.descriptor.navigationPath,
      ...Object.values(B12_NEUTRAL_TEXT),
    ];
  }

  private registerCapture(
    category: CaptureFailureCategory,
    task: Promise<void>,
  ): void {
    this.captureTasks.push(
      task.catch(() => {
        this.captureFailures.push(category);
      }),
    );
  }

  private readonly onRequest = (request: Request): void => {
    if (!this.acceptingCaptures || !lockRequest(request)) return;
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = request.postDataJSON();
      if (isRecord(parsed)) body = parsed;
    } catch {
      body = {};
    }
    const lockNoteValue = safeString(body.lockNote);
    const bodyKeys = sanitizeBodyKeys(Object.keys(body));
    const allowed = new Set(["confirm", "expectedUpdatedAt", "lockNote"]);
    this.lockRequests.push({
      bodyKeys,
      confirmIsTrue: body.confirm === true,
      expectedUpdatedAtMatchesLatest:
        typeof body.expectedUpdatedAt === "string" &&
        body.expectedUpdatedAt === this.latestFacts.at(-1)?.updatedAt,
      lockNoteTrimmed:
        lockNoteValue !== null && lockNoteValue === lockNoteValue.trim(),
      lockNoteLength: lockNoteValue?.length ?? 0,
      lockNoteMatchesExpected: false,
      forbiddenBodyKeyDetected: Object.keys(body).some(
        (key) => !allowed.has(key),
      ),
      lockNoteValue,
    });
  };

  private readonly onResponse = (response: Response): void => {
    if (!this.acceptingCaptures) return;
    this.safeConsoleDiagnostics.markNetworkObservation({
      method: response.request().method(),
      safeEndpointPattern: sanitizeUrlPattern(response.url()),
      status: response.status(),
      failureReason: null,
    });
    if (response.url().startsWith(`${this.environment.backendOrigin}/`)) {
      this.registerCapture(
        "response_headers",
        response.allHeaders().then((headers) => {
          this.corsChecks.push(
            headers["access-control-allow-origin"] ===
              this.environment.frontendOrigin &&
              headers["access-control-allow-credentials"] === "true",
          );
        }),
      );
    }
    if (latestResponse(response) && response.status() === 200) {
      this.registerCapture(
        "latest_parse",
        parseLatestResponse(response).then(({ facts, internalActorId }) => {
          this.latestFacts.push(facts);
          if (internalActorId) this.internalActorIds.add(internalActorId);
        }),
      );
    }
    if (
      this.openMode === "clinical_report_incomplete" &&
      latestResponse(response) &&
      response.status() === 409
    ) {
      this.registerCapture(
        "expected_error_code",
        hasClinicalReportIncompleteCode(response).then((matches) => {
          if (!matches) {
            throw new Error("B12 expected error category did not match");
          }
          this.clinicalReportIncompleteCodeCount += 1;
        }),
      );
    }
  };

  private async flushCaptures(): Promise<void> {
    while (this.captureTasks.length > 0) {
      const tasks = this.captureTasks.splice(0);
      await Promise.all(tasks);
    }
  }

  private throwCaptureFailures(): void {
    if (this.captureFailures.length === 0) return;
    throw new Error(
      `B12 capture task failed safely: ${[...new Set(this.captureFailures)]
        .sort()
        .join(",")}`,
    );
  }

  private async installControlledInitialLatest(): Promise<void> {
    const variant = controlledVariantFor(this.target);
    if (variant === "none") return;
    let matched = 0;
    const handler = async (route: Route): Promise<void> => {
      if (!latestResponseUrl(route.request()) || matched > 0) {
        await route.continue();
        return;
      }
      matched += 1;
      const response = await route.fetch();
      if (response.status() !== 200) {
        throw new Error("B12 controlled public read requires a real HTTP 200");
      }
      const body = (await response.json()) as unknown;
      if (!isRecord(body) || !isRecord(body.report)) {
        throw new Error(
          "B12 controlled public read requires a report envelope",
        );
      }
      const envelopeKeys = Object.keys(body).sort();
      const reportKeys = Object.keys(body.report).sort();
      let changedPublicFields: string[];
      if (variant === "is_final_false") {
        if (body.report.isFinal !== true) {
          throw new Error("B12 finality boundary requires a true baseline");
        }
        body.report.isFinal = false;
        changedPublicFields = ["report.isFinal"];
      } else if (variant === "top_level_locked_at_null") {
        if (typeof body.report.lockedAt !== "string") {
          throw new Error("B12 lockedAt boundary requires a locked baseline");
        }
        body.report.lockedAt = null;
        changedPublicFields = ["report.lockedAt"];
      } else if (variant === "lock_summary_null") {
        if (!isRecord(body.report.lock)) {
          throw new Error(
            "B12 lock summary boundary requires a locked baseline",
          );
        }
        body.report.lock = null;
        changedPublicFields = ["report.lock"];
      } else {
        if (!isRecord(body.report.lock)) {
          throw new Error("B12 lock time boundary requires a lock summary");
        }
        body.report.lock.lockedAt = "2000-01-01T00:00:00.000Z";
        changedPublicFields = ["report.lock.lockedAt"];
      }
      if (
        JSON.stringify(Object.keys(body).sort()) !==
          JSON.stringify(envelopeKeys) ||
        JSON.stringify(Object.keys(body.report).sort()) !==
          JSON.stringify(reportKeys)
      ) {
        throw new Error("B12 controlled public read changed response keys");
      }
      await route.fulfill({ response, json: body });
      this.controlledReadEvidence = {
        boundary: "controlled_public_read_boundary",
        variant,
        method: "GET",
        safeEndpointPattern: LATEST_SAFE_PATTERN,
        requestCount: 1,
        originalStatus: 200,
        statusPreserved: true,
        headersPreserved: true,
        responseEnvelopeKeysPreserved: true,
        reportKeysPreserved: true,
        changedPublicFields,
      };
    };
    this.controlledReadHandler = handler;
    await this.page.route("**/*", handler);
  }

  private async disposeControlledRead(): Promise<void> {
    if (!this.controlledReadHandler) return;
    await this.page.unroute("**/*", this.controlledReadHandler);
    this.controlledReadHandler = null;
  }

  private async authenticateForWorkflow(): Promise<void> {
    await this.ledger.attach(this.page);
    this.page.on("request", this.onRequest);
    this.page.on("response", this.onResponse);

    const initialAuthMeResponsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).origin === this.environment.backendOrigin &&
        new URL(response.url()).pathname === "/auth/me",
      { timeout: 20_000 },
    );
    await this.page.goto(`${this.environment.frontendOrigin}/login`, {
      waitUntil: "domcontentloaded",
    });
    const accountInput = this.page.getByLabel("账号", { exact: true });
    const passwordInput = this.page.getByLabel("密码", { exact: true });
    const [, initialAuthMeResponse] = await Promise.all([
      expect(accountInput).toBeVisible(),
      initialAuthMeResponsePromise,
    ]);
    expect(initialAuthMeResponse.status()).toBe(401);
    await this.page.waitForLoadState("networkidle", { timeout: 10_000 });
    this.loginBoundaryEntryIndex = setB12LoginBoundaryEntryIndex(
      this.loginBoundaryEntryIndex,
      this.ledger.entries().length,
    );
    await accountInput.fill(this.loginIdentifier);
    await passwordInput.fill(this.environment.fixturePassword);
    const loginResponsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).origin === this.environment.backendOrigin &&
        new URL(response.url()).pathname === "/auth/login",
      { timeout: 20_000 },
    );
    await this.page
      .getByRole("button", { name: "登录系统", exact: true })
      .click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBeGreaterThanOrEqual(200);
    expect(loginResponse.status()).toBeLessThan(300);
    await this.page.waitForURL(`${this.environment.frontendOrigin}/dashboard`);
    expect(
      (await passwordInput.count()) === 0 ||
        (await passwordInput.inputValue()) === "",
    ).toBe(true);
    await this.page.waitForLoadState("networkidle", { timeout: 10_000 });

    this.consoleAudit.start();
    this.safeConsoleDiagnostics.start();
    this.consoleListening = true;
  }

  private recordWorkflowNavigationBoundary(): void {
    this.workflowNavigationBoundaryEntryIndex =
      setB12WorkflowNavigationBoundaryEntryIndex(
        this.workflowNavigationBoundaryEntryIndex,
        this.ledger.entries().length,
      );
  }

  private async finishWorkflowNavigation(): Promise<void> {
    await this.page.waitForLoadState("networkidle", { timeout: 10_000 });
    if (this.workflowNavigationBoundaryEntryIndex === null) {
      throw new Error("B12 workflow navigation boundary entry index is missing");
    }
    const entries = this.ledger.entries();
    this.workflowNavigationCompletedEntryIndex =
      setB12WorkflowNavigationCompletedEntryIndex(
        this.workflowNavigationCompletedEntryIndex,
        this.workflowNavigationBoundaryEntryIndex,
        entries.length,
      );
    const inspection = inspectB12CoreWorkflowNavigationAuthEntries(
      entries,
      this.workflowNavigationBoundaryEntryIndex,
      this.workflowNavigationCompletedEntryIndex,
      this.diagnosticForbiddenLiterals(),
    );
    this.workflowNavigationAuthMeRequestCount =
      inspection.workflowNavigationAuthMeRequestCount;
  }

  private async openReadable(): Promise<void> {
    await this.authenticateForWorkflow();
    await this.installControlledInitialLatest();
    const latestResponsePromise = this.page.waitForResponse(
      (response) => latestResponse(response) && response.status() === 200,
      { timeout: 45_000 },
    );
    this.recordWorkflowNavigationBoundary();
    await this.page.goto(
      `${this.environment.frontendOrigin}${this.descriptor.navigationPath}`,
      { waitUntil: "domcontentloaded" },
    );
    await latestResponsePromise;
    await this.flushCaptures();
    this.throwCaptureFailures();
    await expect(
      this.page.getByRole("heading", {
        name: "访视级临床报告",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      this.page.getByRole("heading", {
        name: "报告工作流摘要",
        exact: true,
      }),
    ).toBeVisible();
    await this.finishWorkflowNavigation();
    expect(this.latestFacts).toHaveLength(1);
    expect(this.clinicalReportIncompleteCodeCount).toBe(0);
    if (controlledVariantFor(this.target) === "none") {
      expect(this.controlledReadEvidence).toBeNull();
    } else {
      expect(this.controlledReadEvidence?.requestCount).toBe(1);
    }
  }

  private async openExpectingForbidden(): Promise<void> {
    await this.authenticateForWorkflow();
    const forbiddenResponsePromise = this.page.waitForResponse(
      protectedPatientWorkflowResponse,
      { timeout: 45_000 },
    );
    this.recordWorkflowNavigationBoundary();
    await this.page.goto(
      `${this.environment.frontendOrigin}${this.descriptor.navigationPath}`,
      { waitUntil: "domcontentloaded" },
    );
    await forbiddenResponsePromise;
    await this.flushCaptures();
    this.throwCaptureFailures();
    await expect(
      this.page.getByRole("heading", {
        name: "当前账号没有访问评估访视的权限",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      this.page.getByRole("heading", {
        name: "访视级临床报告",
        exact: true,
      }),
    ).toHaveCount(0);
    await this.finishWorkflowNavigation();
    expect(this.latestFacts).toHaveLength(0);
    expect(this.clinicalReportIncompleteCodeCount).toBe(0);
    expect(this.controlledReadEvidence).toBeNull();
  }

  private async openExpectingClinicalReportIncomplete(): Promise<void> {
    await this.authenticateForWorkflow();
    const incompleteResponsePromise = this.page.waitForResponse(
      (response) => latestResponse(response) && response.status() === 409,
      { timeout: 45_000 },
    );
    this.recordWorkflowNavigationBoundary();
    await this.page.goto(
      `${this.environment.frontendOrigin}${this.descriptor.navigationPath}`,
      { waitUntil: "domcontentloaded" },
    );
    await incompleteResponsePromise;
    await this.flushCaptures();
    this.throwCaptureFailures();
    await expect(
      this.page.getByRole("heading", {
        name: "访视级临床报告",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      this.page.getByText("暂时无法安全加载最新报告", { exact: true }),
    ).toBeVisible();
    await this.finishWorkflowNavigation();
    expect(this.latestFacts).toHaveLength(0);
    expect(this.clinicalReportIncompleteCodeCount).toBe(1);
    expect(this.controlledReadEvidence).toBeNull();
  }

  private async open(): Promise<void> {
    if (this.openMode === "readable") {
      await this.openReadable();
      return;
    }
    if (this.openMode === "forbidden") {
      await this.openExpectingForbidden();
      return;
    }
    await this.openExpectingClinicalReportIncomplete();
  }

  latestCount(): number {
    return this.latestFacts.length;
  }

  initialUpdatedAt(): string {
    const value = this.latestFacts[0]?.updatedAt;
    if (!value) throw new Error("B12 session has no opening updatedAt");
    return value;
  }

  latestUpdatedAt(): string {
    const value = this.latestFacts.at(-1)?.updatedAt;
    if (!value) throw new Error("B12 session has no latest updatedAt");
    return value;
  }

  latestSafeFacts(): B12LatestFacts {
    const facts = this.latestFacts.at(-1);
    if (!facts) throw new Error("B12 session has no latest report facts");
    return {
      ...facts,
      lock: {
        ...facts.lock,
        lockedBy: facts.lock.lockedBy ? { ...facts.lock.lockedBy } : null,
      },
    };
  }

  controlledRead(): B12ControlledReadEvidence | null {
    return this.controlledReadEvidence
      ? {
          ...this.controlledReadEvidence,
          changedPublicFields: [
            ...this.controlledReadEvidence.changedPublicFields,
          ],
        }
      : null;
  }

  publicReadEvidence(): B12SafePublicReadEvidence {
    const entries = this.ledger.entries();
    if (this.openMode === "forbidden") {
      const failures = entries.filter(
        (entry) =>
          entry.method === "GET" &&
          entry.status === 403 &&
          entry.safeUrlPattern.startsWith("/patients/"),
      );
      expect(failures).toHaveLength(1);
      const safeEndpointPattern = failures[0]?.safeUrlPattern;
      if (!safeEndpointPattern) {
        throw new Error("B12 forbidden public-read evidence is missing");
      }
      return {
        method: "GET",
        safeEndpointPattern,
        status: 403,
        errorCategory: "forbidden",
        count: 1,
      };
    }
    if (this.openMode === "clinical_report_incomplete") {
      const failures = entries.filter(
        (entry) =>
          entry.method === "GET" &&
          entry.status === 409 &&
          entry.safeUrlPattern === LATEST_SAFE_PATTERN,
      );
      expect(failures).toHaveLength(1);
      expect(this.clinicalReportIncompleteCodeCount).toBe(1);
      return {
        method: "GET",
        safeEndpointPattern: LATEST_SAFE_PATTERN,
        status: 409,
        errorCategory: "clinical_report_incomplete",
        count: 1,
      };
    }
    const reads = entries.filter(
      (entry) =>
        entry.method === "GET" &&
        entry.status === 200 &&
        entry.safeUrlPattern === LATEST_SAFE_PATTERN,
    );
    expect(reads).toHaveLength(expectedLatestCount(this.target, this.label));
    return {
      method: "GET",
      safeEndpointPattern: LATEST_SAFE_PATTERN,
      status: 200,
      errorCategory: null,
      count: reads.length,
    };
  }

  lockRequestEvidence(): B12LockRequestEvidence[] {
    return this.lockRequests.map(({ lockNoteValue, ...entry }) => {
      void lockNoteValue;
      return {
        ...entry,
        bodyKeys: [...entry.bodyKeys],
      };
    });
  }

  async waitForLatestCount(count: number): Promise<void> {
    await expect
      .poll(async () => {
        await this.flushCaptures();
        this.throwCaptureFailures();
        return this.latestFacts.length;
      })
      .toBe(count);
  }

  private assertNewestRequestNote(expectedRequestNote: string): void {
    const newest = this.lockRequests.at(-1);
    if (!newest) throw new Error("B12 lock request evidence is missing");
    newest.lockNoteMatchesExpected =
      newest.lockNoteValue === expectedRequestNote.trim();
    expect(newest.lockNoteMatchesExpected).toBe(true);
  }

  async performLock(
    trigger: () => Promise<void>,
    options: {
      expectedRequestNote: string;
      expectedPersistedNote?: string;
    },
  ): Promise<B12LockResult> {
    this.explicitLockCount += 1;
    const responsePromise = this.page.waitForResponse(
      (response) => lockRequest(response.request()),
      { timeout: 30_000 },
    );
    await trigger();
    const response = await responsePromise;
    this.assertNewestRequestNote(options.expectedRequestNote);
    const parsed = await parseLockResponse(
      response,
      options.expectedPersistedNote,
    );
    parsed.actorIds.forEach((id) => this.internalActorIds.add(id));
    const result = { status: response.status(), facts: parsed.safe };
    this.lockResponses.push(result);
    return result;
  }

  async performLockWithPendingGate(
    trigger: () => Promise<void>,
    pendingEvidence: () => Promise<void>,
    options: {
      expectedRequestNote: string;
      expectedPersistedNote?: string;
    },
  ): Promise<B12LockResult> {
    const gate = new ControlledRequestGate(
      this.page,
      (request) => lockRequest(request),
      20_000,
    );
    await gate.install();
    this.explicitLockCount += 1;
    const responsePromise = this.page.waitForResponse(
      (response) => lockRequest(response.request()),
      { timeout: 30_000 },
    );
    try {
      const triggerPromise = trigger();
      await gate.waitForStarted();
      await pendingEvidence();
      gate.resume();
      await expect
        .poll(() => gate.summary().continuedRequestCount, { timeout: 5_000 })
        .toBe(1);
      await triggerPromise;
      const response = await responsePromise;
      this.assertNewestRequestNote(options.expectedRequestNote);
      const parsed = await parseLockResponse(
        response,
        options.expectedPersistedNote,
      );
      parsed.actorIds.forEach((id) => this.internalActorIds.add(id));
      const result = { status: response.status(), facts: parsed.safe };
      this.lockResponses.push(result);
      return result;
    } finally {
      const summary = await gate.dispose();
      expect(summary).toEqual({
        matchedRequestCount: 1,
        abortedRequestCount: 0,
        continuedRequestCount: 1,
      });
    }
  }

  async abortLockRequest(
    trigger: () => Promise<void>,
    expectedRequestNote: string,
  ): Promise<void> {
    const abort = new OneShotRequestAbort(this.page, (request) =>
      lockRequest(request),
    );
    await abort.install();
    this.explicitLockCount += 1;
    this.explicitAbortedLockCount += 1;
    try {
      const triggerPromise = trigger();
      await abort.waitForStarted();
      await triggerPromise;
      this.assertNewestRequestNote(expectedRequestNote);
      await expect
        .poll(
          () =>
            this.ledger.count({
              method: "POST",
              safeUrlPattern: LOCK_SAFE_PATTERN,
              failureReason: "aborted",
            }),
          { timeout: 5_000 },
        )
        .toBe(1);
    } finally {
      const summary = await abort.dispose();
      expect(summary).toEqual({
        matchedRequestCount: 1,
        abortedRequestCount: 1,
        continuedRequestCount: 0,
      });
    }
  }

  async holdNextLatest(): Promise<ControlledRequestGate> {
    const gate = new ControlledRequestGate(
      this.page,
      (request) => latestResponseUrl(request),
      30_000,
    );
    await gate.install();
    return gate;
  }

  async assertCapturedActorIdsNotLeaked(): Promise<void> {
    await auditB12DomPrivacy(this.page, [...this.internalActorIds]);
  }

  private freezeCaptureListeners(): void {
    if (!this.acceptingCaptures) return;
    this.acceptingCaptures = false;
    this.page.off("request", this.onRequest);
    this.page.off("response", this.onResponse);
  }

  private stopConsoleAudit() {
    if (!this.consoleListening) {
      this.safeConsoleDiagnostics.stop();
      return this.consoleAudit.summary();
    }
    this.consoleListening = false;
    const summary = this.consoleAudit.stop();
    this.safeConsoleDiagnostics.stop();
    return summary;
  }

  private recordLogoutBoundary(): void {
    if (this.loginBoundaryEntryIndex === null) return;
    this.logoutBoundaryEntryIndex = setB12LogoutBoundaryEntryIndex(
      this.logoutBoundaryEntryIndex,
      this.loginBoundaryEntryIndex,
      this.ledger.entries().length,
    );
  }

  private async attemptLogout(): Promise<B12LogoutResult> {
    if (this.logoutResult) return this.logoutResult;
    const attempt = await attemptB12BrowserLogout({
      page: this.page,
      target: this.target,
      role: this.role,
      openMode: this.openMode,
      backendOrigin: this.environment.backendOrigin,
      frontendOrigin: this.environment.frontendOrigin,
      contextCookies: this.contextCookies,
      recordBoundary: () => this.recordLogoutBoundary(),
    });
    this.logoutResult = attempt.result;
    this.logoutMechanism = attempt.mechanism;
    return this.logoutResult;
  }

  private async detachLedger() {
    if (this.ledgerDetached) return this.ledger.summary();
    const summary = await this.ledger.detach();
    this.ledgerDetached = true;
    return summary;
  }

  async collect(): Promise<B12SessionSummary> {
    if (this.collectState === "collected" && this.collectedSummary) {
      return this.collectedSummary;
    }
    if (this.collectState !== "open") {
      throw new Error(`B12 session cannot collect from ${this.collectState}`);
    }
    this.collectState = "collecting";
    try {
      await this.disposeControlledRead();
      this.freezeCaptureListeners();
      await this.flushCaptures();
      this.throwCaptureFailures();

      const storage = await auditRuntimeStorage(this.page);
      expect(storage.localStorageKeys).toEqual([]);
      expect(storage.sessionStorageKeys).toEqual([]);
      expect(storage.indexedDbNames).toEqual([]);
      expect(storage.forbiddenValueDetected).toBe(false);
      expect(storage.documentCookieEmpty).toBe(true);
      expect(storage.documentCookieForbiddenPatternDetected).toBe(false);
      expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
      const currentUrl = new URL(this.page.url());
      expect(currentUrl.search).toBe("");
      expect(currentUrl.hash).toBe("");
      const domPrivacy = await auditB12DomPrivacy(this.page, [
        ...this.internalActorIds,
      ]);
      expect(
        (await this.contextCookies()).some(({ httpOnly }) => httpOnly),
      ).toBe(true);

      const publicRead = this.publicReadEvidence();
      const consoleSummary = this.stopConsoleAudit();
      const safeConsoleSummary = this.safeConsoleDiagnostics.summary();
      const routeScopedAllowedFailureCount =
        this.lockResponses.filter(({ status }) => status >= 400).length +
        this.explicitAbortedLockCount +
        (this.openMode === "readable" ? 0 : publicRead.count);
      expect(consoleSummary.warningCount).toBe(0);
      expect(consoleSummary.pageErrorCount).toBe(0);
      if (this.openMode === "clinical_report_incomplete") {
        assertB12SafeConsoleNetworkCorrelation({
          networkEntries: this.ledger.entries(),
          consoleEvents: safeConsoleSummary.events,
          failurePhaseConsoleSequences:
            safeConsoleSummary.failurePhaseConsoleSequences,
          observedConsoleErrorCount: consoleSummary.errorCount,
          allowedConsoleErrorCount: publicRead.count,
          forbiddenLiterals: this.diagnosticForbiddenLiterals(),
        });
      } else {
        expect(consoleSummary.errorCount).toBeLessThanOrEqual(
          routeScopedAllowedFailureCount,
        );
      }
      expect(
        consoleSummary.categories.every(
          ({ category }) => category === "network",
        ),
      ).toBe(true);

      await this.page.waitForLoadState("networkidle", { timeout: 10_000 });
      expect(await this.attemptLogout()).toBe("succeeded");
      expect(
        (await this.contextCookies()).some(({ httpOnly }) => httpOnly),
      ).toBe(false);
      await this.page.waitForLoadState("networkidle", { timeout: 10_000 });
      expect(this.corsChecks.length).toBeGreaterThan(0);
      expect(this.corsChecks.every(Boolean)).toBe(true);

      const network = await this.detachLedger();
      const entries = network.entries;
      if (this.loginBoundaryEntryIndex === null) {
        throw new Error("B12 login boundary entry index is missing");
      }
      if (this.logoutBoundaryEntryIndex === null) {
        throw new Error("B12 logout boundary entry index is missing");
      }
      if (this.workflowNavigationBoundaryEntryIndex === null) {
        throw new Error(
          "B12 workflow navigation boundary entry index is missing",
        );
      }
      if (this.workflowNavigationCompletedEntryIndex === null) {
        throw new Error(
          "B12 workflow navigation completed entry index is missing",
        );
      }
      const workflowNavigationAuth =
        inspectB12CoreWorkflowNavigationAuthEntries(
          entries,
          this.workflowNavigationBoundaryEntryIndex,
          this.workflowNavigationCompletedEntryIndex,
          this.diagnosticForbiddenLiterals(),
        );
      if (
        this.workflowNavigationAuthMeRequestCount !==
        workflowNavigationAuth.workflowNavigationAuthMeRequestCount
      ) {
        throw new Error(
          "B12 workflow navigation /auth/me count changed after inspection",
        );
      }
      const authLifecycle = partitionB12AuthLifecycleEntries(
        entries,
        this.loginBoundaryEntryIndex,
        this.logoutBoundaryEntryIndex,
        this.diagnosticForbiddenLiterals(),
      );
      const count = (method: string, pattern: RegExp | string) =>
        entries.filter(
          (entry) =>
            entry.method === method &&
            (typeof pattern === "string"
              ? entry.safeUrlPattern === pattern
              : pattern.test(entry.safeUrlPattern)),
        ).length;
      const latestReadCount = count("GET", LATEST_SAFE_PATTERN);
      const loginEntries = authLifecycle.loginEntries;
      const a21EditRequestCount = count(
        "PATCH",
        /\/clinical-reports\/<id>\/draft$/,
      );
      const a21SubmitRequestCount = count(
        "POST",
        /\/clinical-reports\/<id>\/submit-confirmation$/,
      );
      const a21ConfirmRequestCount = count(
        "POST",
        /\/clinical-reports\/<id>\/confirm$/,
      );
      const a22LockRequestCount = count("POST", LOCK_SAFE_PATTERN);
      const a23FreezeSourcesRequestCount = count(
        "POST",
        /\/clinical-reports\/<id>\/freeze-sources$/,
      );
      const a24ArchiveRequestCount = count(
        "POST",
        /\/clinical-reports\/<id>\/archive$/,
      );
      const a25CorrectionRequestCount = count(
        "POST",
        /\/clinical-reports\/<id>\/corrections$/,
      );
      const unrelatedOutputRequestCount = entries.filter((entry) =>
        /(?:pdf|print|download|signature|\bai\b|llm)/i.test(
          entry.safeUrlPattern,
        ),
      ).length;
      expect(latestReadCount).toBe(
        expectedLatestCount(this.target, this.label),
      );
      expect(loginEntries).toHaveLength(1);
      expect(
        loginEntries.every(
          ({ status }) => status !== null && status >= 200 && status < 300,
        ),
      ).toBe(true);
      expect(authLifecycle.preLoginAuthMeEntries).toHaveLength(1);
      expect(authLifecycle.authenticatedAuthMeEntries.length).toBeGreaterThan(
        0,
      );
      expect(authLifecycle.logoutEntries).toHaveLength(1);
      expect(authLifecycle.postLogoutAuthMeEntries).toHaveLength(1);
      expect(authLifecycle.postLogoutBusinessEntries).toHaveLength(0);
      expect(a22LockRequestCount).toBe(
        expectedLockCount(this.target, this.label),
      );
      expect(a22LockRequestCount).toBe(this.explicitLockCount);
      expect(a21EditRequestCount).toBe(0);
      expect(a21SubmitRequestCount).toBe(0);
      expect(a21ConfirmRequestCount).toBe(0);
      expect(a23FreezeSourcesRequestCount).toBe(0);
      expect(a24ArchiveRequestCount).toBe(0);
      expect(a25CorrectionRequestCount).toBe(0);
      expect(unrelatedOutputRequestCount).toBe(0);
      const businessEntries = entries.filter(
        (entry) =>
          (entry.safeUrlPattern === publicRead.safeEndpointPattern ||
            (mutation(entry) &&
              entry.safeUrlPattern.includes("/clinical-reports"))) &&
          entry.failureReason === null,
      );
      expect(
        businessEntries.every(({ initiator }) => initiator === "script"),
      ).toBe(true);
      expect(
        this.lockRequests.every(
          (request) =>
            request.bodyKeys.join("|") ===
              "confirm|expectedUpdatedAt|lockNote" &&
            request.confirmIsTrue &&
            request.expectedUpdatedAtMatchesLatest &&
            request.lockNoteTrimmed &&
            request.lockNoteMatchesExpected &&
            !request.forbiddenBodyKeyDetected,
        ),
      ).toBe(true);
      const logoutRequestCount = authLifecycle.logoutEntries.length;
      expect(logoutRequestCount).toBe(1);
      const abortedRequestCount = entries.filter(
        ({ failureReason, safeUrlPattern }) =>
          failureReason !== null && safeUrlPattern === LOCK_SAFE_PATTERN,
      ).length;
      expect(abortedRequestCount).toBe(this.explicitAbortedLockCount);
      if (controlledVariantFor(this.target) === "none") {
        expect(this.controlledReadEvidence).toBeNull();
      } else {
        expect(this.controlledReadEvidence).not.toBeNull();
      }
      if (this.logoutMechanism === null) {
        throw new Error("B12 successful logout omitted its mechanism");
      }

      const summary: B12SessionSummary = {
        label: this.label,
        role: this.role,
        login: "passed",
        logout: "succeeded",
        logoutMechanism: this.logoutMechanism,
        routeExpectedPublicReadOutcome: expectedPublicReadOutcomeFor(
          this.target,
        ),
        sessionOpenMode: this.openMode,
        workflowNavigationAuthMeRequestCount:
          workflowNavigationAuth.workflowNavigationAuthMeRequestCount,
        latestFacts: this.latestFacts.map(({ updatedAt, ...facts }) => {
          void updatedAt;
          return {
            ...facts,
            lock: {
              ...facts.lock,
              lockedBy: facts.lock.lockedBy ? { ...facts.lock.lockedBy } : null,
            },
          };
        }),
        lockResponses: this.lockResponses.map((result) => ({
          status: result.status,
          facts: result.facts,
        })),
        lockRequests: this.lockRequestEvidence(),
        network: {
          latestReadCount,
          a21EditRequestCount: 0,
          a21SubmitRequestCount: 0,
          a21ConfirmRequestCount: 0,
          a22LockRequestCount,
          a23FreezeSourcesRequestCount: 0,
          a24ArchiveRequestCount: 0,
          a25CorrectionRequestCount: 0,
          loginRequestCount: 1,
          authMeRequestCount: count("GET", "/auth/me"),
          preLoginUnauthenticatedAuthMeRequestCount: 1,
          authenticatedAuthMeRequestCount:
            authLifecycle.authenticatedAuthMeEntries.length,
          postLogoutUnauthenticatedAuthMeRequestCount: 1,
          logoutRequestCount: 1,
          unrelatedOutputRequestCount: 0,
          abortedRequestCount,
          automaticRetryDetected: false,
          pollingDetected: false,
          controlledPublicRead: this.controlledRead(),
          publicRead,
          entries: groupNetworkEntries(entries),
        },
        console: {
          warningCount: 0,
          errorCount: consoleSummary.errorCount,
          pageErrorCount: 0,
          routeScopedAllowedFailureCount,
          unexpectedErrorCount: 0,
        },
        storage: "clear",
        cookie: "http_only_session_then_cleared",
        cors: "passed",
        url: "safe_path_without_query_or_hash",
        domPrivacy,
      };
      this.collectedSummary = summary;
      this.collectState = "collected";
      return summary;
    } catch (error: unknown) {
      this.collectState = "failed";
      throw error;
    }
  }

  async bestEffortLogout(): Promise<B12LogoutResult> {
    if (this.collectState !== "collected") this.collectState = "closing";
    let result: B12LogoutResult = "failed";
    try {
      await this.disposeControlledRead().catch(() => undefined);
      this.freezeCaptureListeners();
      await this.flushCaptures().catch(() => undefined);
      this.stopConsoleAudit();
      result = await this.attemptLogout().catch(() => "failed" as const);
    } finally {
      this.freezeCaptureListeners();
      this.stopConsoleAudit();
      await this.detachLedger().catch(() => undefined);
    }
    return result;
  }

  failureCleanupResult(logout: B12LogoutResult): B12FailureCleanupResult {
    return {
      scenarioKey: this.target.scenarioKey,
      routeKey: this.target.routeKey,
      role: this.role,
      openMode: this.openMode,
      logout,
      mechanism: this.logoutMechanism,
    };
  }

  async closeContext(): Promise<void> {
    if (this.contextClosed) return;
    await this.closeBrowserContext();
    this.contextClosed = true;
  }
}

function latestResponseUrl(request: Request): boolean {
  return (
    request.method() === "GET" &&
    sanitizeUrlPattern(request.url()) === LATEST_SAFE_PATTERN
  );
}

export class B12RouteRun {
  private primarySession: B12BrowserSession | null = null;
  private secondarySession: B12BrowserSession | null = null;
  private systemSession: B12BrowserSession | null = null;
  private systemDescriptor: B12CoreRuntimeDescriptor | null = null;

  constructor(
    readonly target: B12CoreRouteTarget,
    private readonly descriptor: B12CoreRuntimeDescriptor,
    private readonly environment: EnabledB12BrowserEnvironment,
    private readonly roleContexts: RoleContextFactory,
  ) {}

  async primary(): Promise<B12BrowserSession> {
    if (!this.primarySession) {
      this.primarySession = await B12BrowserSession.create({
        label: "primary",
        role: this.descriptor.primaryRole,
        loginIdentifier: this.descriptor.loginIdentifier,
        descriptor: this.descriptor,
        target: this.target,
        openMode: resolveB12SessionOpenMode(
          this.target,
          this.descriptor.primaryRole,
        ),
        environment: this.environment,
        roleContexts: this.roleContexts,
      });
    }
    return this.primarySession;
  }

  async secondary(): Promise<B12BrowserSession> {
    if (
      !this.descriptor.secondaryRole ||
      !this.descriptor.secondaryLoginIdentifier
    ) {
      throw new Error("B12 route does not allow a secondary Session");
    }
    if (!this.secondarySession) {
      this.secondarySession = await B12BrowserSession.create({
        label: "secondary",
        role: this.descriptor.secondaryRole,
        loginIdentifier: this.descriptor.secondaryLoginIdentifier,
        descriptor: this.descriptor,
        target: this.target,
        openMode: resolveB12SessionOpenMode(
          this.target,
          this.descriptor.secondaryRole,
        ),
        environment: this.environment,
        roleContexts: this.roleContexts,
      });
    }
    return this.secondarySession;
  }

  async system(): Promise<B12BrowserSession> {
    if (targetKey(this.target) !== "eligibility-state/denied-role-entry") {
      throw new Error("B12 system Session is allowed only for B12-08");
    }
    if (!this.systemDescriptor) {
      this.systemDescriptor = await readB12CoreRuntimeDescriptor(
        this.target,
        "system",
      );
    }
    if (!this.systemSession) {
      this.systemSession = await B12BrowserSession.create({
        label: "system",
        role: "system",
        loginIdentifier: this.systemDescriptor.loginIdentifier,
        descriptor: this.systemDescriptor,
        target: this.target,
        openMode: resolveB12SessionOpenMode(this.target, "system"),
        environment: this.environment,
        roleContexts: this.roleContexts,
      });
    }
    return this.systemSession;
  }

  private sessions(): B12BrowserSession[] {
    return [
      this.primarySession,
      this.secondarySession,
      this.systemSession,
    ].filter((session): session is B12BrowserSession => session !== null);
  }

  async collect(): Promise<B12SessionSummary[]> {
    const sessions = this.sessions();
    expect(sessions).toHaveLength(expectedSessionCount(this.target));
    const summaries: B12SessionSummary[] = [];
    for (const session of sessions) summaries.push(await session.collect());
    return summaries;
  }

  async cleanupAfterFailure(): Promise<
    B12FailureCleanupResult[]
  > {
    return Promise.all(
      this.sessions().map(async (session) => {
        const logout = await session
          .bestEffortLogout()
          .catch(() => "failed" as const);
        await session.closeContext().catch(() => undefined);
        return session.failureCleanupResult(logout);
      }),
    );
  }
}

export async function removeCurrentB12TestOutput(): Promise<boolean> {
  const outputRoot = path.resolve(
    process.cwd(),
    "test-results",
    "browser-acceptance",
  );
  const currentOutput = path.resolve(playwrightTest.info().outputDir);
  const relative = path.relative(outputRoot, currentOutput);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("B12 test output directory is outside the configured root");
  }
  await rm(currentOutput, { recursive: true, force: true });
  return true;
}

export async function runB12CoreRoute(
  input: {
    environment: EnabledB12BrowserEnvironment;
    roleContexts: RoleContextFactory;
    target: B12CoreRouteTarget;
  },
  exercise: (run: B12RouteRun) => Promise<void>,
): Promise<void> {
  const descriptor = await readB12CoreRuntimeDescriptor(input.target);
  const run = new B12RouteRun(
    input.target,
    descriptor,
    input.environment,
    input.roleContexts,
  );
  let completed = false;
  try {
    await exercise(run);
    const sessions = await run.collect();
    const closed = await input.roleContexts.closeAll();
    expect(closed.activeContextCount).toBe(0);
    expect(await deleteB12CoreRuntimeDescriptor(input.target)).toBe(true);
    const systemRuntime =
      targetKey(input.target) === "eligibility-state/denied-role-entry"
        ? await deleteB12CoreRuntimeDescriptor(input.target, "system")
        : null;
    if (systemRuntime !== null) expect(systemRuntime).toBe(true);
    completed = true;
    console.log(
      `B12_CORE_ROUTE ${safeJsonStringify(
        {
          profile: "core-workflow",
          scenarioKey: input.target.scenarioKey,
          routeKey: input.target.routeKey,
          sessionCount: sessions.length,
          isolatedContexts: true,
          contextsClosed: true,
          runtimeDescriptorDeleted: true,
          systemRuntimeDescriptorDeleted: systemRuntime,
          workers: 1,
          retries: 0,
          artifacts: {
            trace: false,
            video: false,
            screenshot: false,
            html: false,
          },
          databaseBoundaryClear: input.environment.databaseBoundaryClear,
          sessions,
        },
        [
          input.environment.fixturePassword,
          descriptor.loginIdentifier,
          descriptor.secondaryLoginIdentifier ?? "",
          descriptor.navigationPath,
          ...Object.values(B12_NEUTRAL_TEXT),
        ],
      )}`,
    );
  } finally {
    if (!completed) {
      const logout = await run.cleanupAfterFailure();
      const contextsClosed = await input.roleContexts
        .closeAll()
        .then(({ activeContextCount }) => activeContextCount === 0)
        .catch(() => false);
      const runtimeDescriptorDeleted = await deleteB12CoreRuntimeDescriptor(
        input.target,
      ).catch(() => false);
      const systemRuntimeDescriptorDeleted =
        targetKey(input.target) === "eligibility-state/denied-role-entry"
          ? await deleteB12CoreRuntimeDescriptor(input.target, "system").catch(
              () => false,
            )
          : null;
      const failureArtifactsRemoved = await removeCurrentB12TestOutput().catch(
        () => false,
      );
      console.log(
        `B12_CORE_FAILURE_CLEANUP ${safeJsonStringify(
          {
            logout,
            contextsClosed,
            runtimeDescriptorDeleted,
            systemRuntimeDescriptorDeleted,
            failureArtifactsRemoved,
          },
          [
            input.environment.fixturePassword,
            descriptor.loginIdentifier,
            descriptor.secondaryLoginIdentifier ?? "",
            descriptor.navigationPath,
            ...Object.values(B12_NEUTRAL_TEXT),
          ],
        )}`,
      );
    } else {
      await removeCurrentB12TestOutput().catch(() => false);
    }
  }
}

export async function assertNoAvailableLockEntry(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: "准备锁定报告", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "确认不可逆锁定", exact: true }),
  ).toHaveCount(0);
}

export async function assertNoA21WriteControls(page: Page): Promise<void> {
  for (const name of ["编辑临床人员内容", "准备提交医生确认", "准备确认报告"]) {
    const control = page.getByRole("button", { name, exact: true });
    if ((await control.count()) > 0) await expect(control).toBeDisabled();
  }
}

export function reportNarrativeSections(page: Page) {
  return page.locator(
    [
      'section[aria-labelledby="clinical-report-narrative-heading"]',
      'section[aria-labelledby="clinical-report-clinician-narrative-heading"]',
    ].join(","),
  );
}

export async function assertReportNarrativeSectionsExcludeText(
  page: Page,
  text: string,
): Promise<number> {
  const sections = reportNarrativeSections(page);
  const count = await sections.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const section = sections.nth(index);
    await expect(section).toBeVisible();
    const containsExcludedText = await section.evaluate(
      (node, excludedText) =>
        (node.textContent ?? "").includes(excludedText),
      text,
    );
    expect(containsExcludedText).toBe(false);
  }
  return count;
}

async function markerExists(markerPath: string): Promise<boolean> {
  try {
    await access(markerPath);
    return true;
  } catch {
    return false;
  }
}

export async function coordinateB12Stage(
  transition: "lock-conflict-touch" | "lock-conflict-latest-locked-touch",
): Promise<void> {
  const requestMarker = b12StageMarkerPath(transition, "request");
  const completedMarker = b12StageMarkerPath(transition, "completed");
  await Promise.all([
    unlink(requestMarker).catch(() => undefined),
    unlink(completedMarker).catch(() => undefined),
  ]);
  const handle = await open(requestMarker, "wx", 0o600);
  try {
    await handle.writeFile("ready\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  console.log(`B12_STAGE_REQUEST_READY ${transition}`);
  try {
    await expect
      .poll(() => markerExists(completedMarker), { timeout: 120_000 })
      .toBe(true);
  } finally {
    await Promise.all([
      unlink(requestMarker).catch(() => undefined),
      unlink(completedMarker).catch(() => undefined),
    ]);
  }
}
