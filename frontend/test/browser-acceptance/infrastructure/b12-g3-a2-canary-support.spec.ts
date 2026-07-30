import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

import {
  B12CrossCuttingEvidenceRegistry,
} from "../b12/execution/b12-cross-cutting-evidence";
import { runB12ExecutionGroup } from "../b12/execution/b12-execution-group-runner";
import { createB12OwnerExecutionFailure } from "../b12/execution/b12-execution-types";
import { validateB12ResilienceCanaryRuntimeDescriptorValue } from "../b12/b12-runtime-descriptor";
import {
  B12G3A2CanaryAtomicJournal,
  b12G3A2CanaryJournalTarget,
} from "../b12/canary/b12-g3-a2-canary-journal";
import { B12G3A2CanaryOwnerScope } from "../b12/canary/b12-g3-a2-canary-owner-scope";
import {
  B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A2_CANARY_CROSS_CUTTING_DEFINITIONS,
  B12_G3_A2_CANARY_EVIDENCE_SCOPE,
  B12_G3_A2_CANARY_OWNERS,
  B12_G3_A2_CANARY_PHASE,
  b12G3A2CanaryOwner,
  b12G3A2CanaryOwnersFor,
  type B12G3A2CanarySafeSummary,
} from "../b12/canary/b12-g3-a2-canary-types";
import { NetworkLedger } from "../support/network-ledger";
import { safeJsonStringify } from "../support/safe-output";
import { expect, test } from "../support/acceptance-test";

const SENSITIVE_VALUES = [
  "doctor@example.invalid",
  "Cookie=canary-secret",
  "Session=canary-secret",
  "C:\\runtime\\private\\descriptor.json",
  "507f1f77bcf86cd799439011",
  "B12 neutral lock note must not escape",
] as const;

function markSuccessful(context: {
  markBusinessAssertionsCompleted(): void;
  markRouteNetworkCompleted(): void;
}): void {
  context.markBusinessAssertionsCompleted();
  context.markRouteNetworkCompleted();
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("fixes six canary owners with formal targets but no Direct Audit IDs", () => {
  expect(B12_G3_A2_CANARY_OWNERS).toHaveLength(6);
  expect(
    B12_G3_A2_CANARY_OWNERS.every(
      ({ directAuditIds, formalTargetAuditIds }) =>
        directAuditIds.length === 0 && formalTargetAuditIds.length > 0,
    ),
  ).toBe(true);
  expect(
    b12G3A2CanaryOwnersFor("eg-canary-doctor-read-only").map(
      ({ auditOwner }) => auditOwner,
    ),
  ).toEqual([
    "core-workflow/eligibility-state/draft-no-entry",
    "core-workflow/eligibility-state/pending-no-entry",
    "core-workflow/eligibility-state/finality-inconsistent",
  ]);
  expect(B12_G3_A2_CANARY_EVIDENCE_SCOPE).toBe("canary_only");
  expect(B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED).toBe(false);
});

test("atomically writes owner callbacks in order before the next owner", async () => {
  const owners = b12G3A2CanaryOwnersFor(
    "eg-canary-doctor-read-only",
  ).slice(0, 2);
  const journal = await B12G3A2CanaryAtomicJournal.create({
    executionGroup: "eg-canary-doctor-read-only",
    target: test.info().outputPath("ordered-owner-journal.json"),
  });
  const events: string[] = [];
  const summary = await runB12ExecutionGroup({
    executionGroup: "eg-canary-doctor-read-only",
    owners,
    runOwner: async (context) => {
      if (context.owner === owners[1]) {
        const current = await journal.read();
        expect(current.ownerRecords.map(({ auditOwner }) => auditOwner)).toEqual([
          owners[0]?.auditOwner,
        ]);
      }
      markSuccessful(context);
    },
    minimalCleanup: ({ owner }) => {
      events.push(`cleanup:${owner.auditOwner}`);
    },
    onOwnerFinalized: async (record) => {
      events.push(`callback:${record.auditOwner}`);
      await journal.onOwnerFinalized(record);
    },
  });
  expect(summary.ownerResults.map(({ result }) => result)).toEqual([
    "pass",
    "pass",
  ]);
  const document = await journal.read();
  expect(Object.keys(document).sort()).toEqual(
    [
      "auditClosureAllowed",
      "evidenceScope",
      "executionGroup",
      "ownerRecords",
    ].sort(),
  );
  expect(document.ownerRecords.map(({ auditOwner }) => auditOwner)).toEqual(
    owners.map(({ auditOwner }) => auditOwner),
  );
  expect(events).toEqual([
    `cleanup:${owners[0]?.auditOwner}`,
    `callback:${owners[0]?.auditOwner}`,
    `cleanup:${owners[1]?.auditOwner}`,
    `callback:${owners[1]?.auditOwner}`,
  ]);
  expect(await journal.remove()).toBe(true);
});

test("keeps completed journal records readable when a later owner fails", async () => {
  const owners = b12G3A2CanaryOwnersFor(
    "eg-canary-doctor-read-only",
  ).slice(0, 2);
  const journal = await B12G3A2CanaryAtomicJournal.create({
    executionGroup: "eg-canary-doctor-read-only",
    target: test.info().outputPath("failed-group-owner-journal.json"),
  });
  const summary = await runB12ExecutionGroup({
    executionGroup: "eg-canary-doctor-read-only",
    owners,
    runOwner: (context) => {
      markSuccessful(context);
      if (context.owner === owners[1]) {
        throw createB12OwnerExecutionFailure(
          "owner_assertion",
          "B12_CANARY_SYNTHETIC_OWNER_FAILED",
        );
      }
    },
    minimalCleanup: () => undefined,
    onOwnerFinalized: journal.onOwnerFinalized,
  });
  expect(summary.ownerResults.map(({ result }) => result)).toEqual([
    "pass",
    "fail",
  ]);
  const document = await journal.read();
  expect(document.ownerRecords.map(({ result }) => result)).toEqual([
    "pass",
    "fail",
  ]);
  expect(document.ownerRecords[0]?.minimalCleanupCompleted).toBe(true);
  expect(await journal.remove()).toBe(true);
});

test("keeps real canary journals outside Playwright per-test output cleanup", () => {
  const target = b12G3A2CanaryJournalTarget("eg-canary-system-forbidden");
  expect(target).toContain("test-results");
  expect(target).toContain("b12-g3-a2-canary-journals");
  expect(target).not.toContain(test.info().outputDir);
  for (const name of [
    "01-doctor-read-only-group.spec.ts",
    "02-system-forbidden-group.spec.ts",
    "03-auth-cross-cutting-group.spec.ts",
    "04-doctor-lock-write-group.spec.ts",
  ]) {
    const source = readFileSync(
      `test/browser-acceptance/b12/canary/${name}`,
      "utf8",
    );
    expect(source).toContain("b12G3A2CanaryJournalTarget(executionGroup)");
    expect(source).not.toContain('outputPath("owner-journal.json")');
  }
});

test("uses a canary-only cross-cutting registry with no Direct impact", () => {
  expect(
    B12_G3_A2_CANARY_CROSS_CUTTING_DEFINITIONS.every(
      ({ directAuditIds }) => directAuditIds.length === 0,
    ),
  ).toBe(true);
  const registry = new B12CrossCuttingEvidenceRegistry(
    B12_G3_A2_CANARY_CROSS_CUTTING_DEFINITIONS,
  );
  for (const group of [
    "auth_lifecycle",
    "logout_cookie",
    "cors_origin",
    "deidentified_fixture",
  ] as const) {
    registry.recordSupportingResult(group, "pass");
  }
  for (const group of [
    "logout_cookie",
    "cors_origin",
    "deidentified_fixture",
  ] as const) {
    registry.recordNonAuditQualityGateResult(group, "pass");
  }
  expect(registry.calculateAuditImpact()).toEqual({
    directAuditResults: [],
    profileCompletionBlocked: false,
  });
});

test("rejects profile mixing in the fixed resilience canary runtime", () => {
  const valid = {
    version: 1,
    batch: "B12",
    profile: "resilience-security",
    scenarioKey: "presentation-safety",
    routeKey: "auth-route-deidentified",
    primaryRole: "doctor",
    loginIdentifier: "b12r-b12r-canary-doctor",
    navigationPath:
      "/patients/aaaaaaaaaaaaaaaaaaaaaaaa/visits/bbbbbbbbbbbbbbbbbbbbbbbb",
  };
  expect(validateB12ResilienceCanaryRuntimeDescriptorValue(valid)).toEqual(
    valid,
  );
  expect(() =>
    validateB12ResilienceCanaryRuntimeDescriptorValue({
      ...valid,
      profile: "core-workflow",
    }),
  ).toThrow(
    "B12 resilience canary runtime descriptor differs from its fixed target",
  );
});

test("removes owner listeners and the finality intercept before the real probe", async ({
  browser,
}) => {
  const latestPath =
    "/patients/aaaaaaaaaaaaaaaaaaaaaaaa/visits/bbbbbbbbbbbbbbbbbbbbbbbb/clinical-reports/latest";
  const server = createServer((request, response) => {
    if (request.url === "/auth/me") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ authenticated: true }));
      return;
    }
    if (request.url === latestPath) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          report: {
            updatedAt: "2026-01-01T00:00:00.000Z",
            status: "confirmed",
            source: "mixed",
            qualityStatus: "passed",
            isFinal: true,
            confirmation: {},
            lockedAt: null,
            lock: null,
          },
        }),
      );
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<!doctype html><title>canary</title>");
  });
  const origin = await listen(server);
  const context = await browser.newContext();
  const page = await context.newPage();
  const ledger = new NetworkLedger();
  try {
    await page.goto(origin);
    await ledger.attach(page);
    const owner = b12G3A2CanaryOwner(
      "core-workflow/eligibility-state/finality-inconsistent",
    );
    const scope = new B12G3A2CanaryOwnerScope(
      owner,
      page,
      ledger,
      ledger.entries().length,
    );
    scope.start();
    await scope.installFinalityControlledRead();
    const controlled = await page.evaluate(
      async ({ authUrl, latestUrl }) => {
        const [, latest] = await Promise.all([
          fetch(authUrl),
          fetch(latestUrl),
        ]);
        const body = (await latest.json()) as { report: { isFinal: boolean } };
        return body.report.isFinal;
      },
      {
        authUrl: `${origin}/auth/me`,
        latestUrl: `${origin}${latestPath}`,
      },
    );
    expect(controlled).toBe(false);
    await scope.completeRouteNetwork();
    const cleanup = await scope.minimalCleanup();
    expect(cleanup).toMatchObject({
      listenerRemovedCount: 4,
      interceptInstalledCount: 1,
      interceptRemovedCount: 1,
      finalityRealReadRestored: true,
      pendingRequestSettled: true,
      localDraftCleared: true,
    });
    const restored = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return (await response.json()) as { report: { isFinal: boolean } };
    }, `${origin}${latestPath}`);
    expect(restored.report.isFinal).toBe(true);
    await ledger.detach();
  } finally {
    await context.close();
    await closeServer(server);
  }
});

test("cleans an owner that fails before route Network completion", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const ledger = new NetworkLedger();
  try {
    const owner = b12G3A2CanaryOwner(
      "resilience-security/presentation-safety/auth-route-deidentified",
    );
    const scope = new B12G3A2CanaryOwnerScope(owner, page, ledger, 0);
    scope.start();
    const cleanup = await scope.minimalCleanup();
    expect(cleanup).toMatchObject({
      listenerRemovedCount: 4,
      interceptInstalledCount: 0,
      interceptRemovedCount: 0,
      pendingRequestSettled: true,
      localDraftCleared: true,
      workflowNavigationAuthMeRequestCount: 0,
    });
  } finally {
    await context.close();
  }
});

test("keeps safe summaries free of runtime, credential, ID, URL, and lock text", () => {
  const summary: B12G3A2CanarySafeSummary = {
    phase: B12_G3_A2_CANARY_PHASE,
    evidenceScope: B12_G3_A2_CANARY_EVIDENCE_SCOPE,
    auditClosureAllowed: false,
    executionGroup: "eg-canary-auth-cross-cutting",
    ownerCount: 1,
    ownerResults: [
      {
        auditOwner:
          "resilience-security/presentation-safety/auth-route-deidentified",
        result: "pass",
        failureCategory: "none",
        minimalCleanupCompleted: true,
      },
    ],
    contextCount: 1,
    sessionCount: 1,
    fullCollectCount: 1,
    minimalCleanupCount: 1,
    interceptInstalledCount: 0,
    interceptRemovedCount: 0,
    logoutMechanism: "ui_control",
    groupSetupSucceeded: true,
    groupCleanupSucceeded: true,
    profileCompletionBlocked: false,
    databaseTerminalEvidence: "not_applicable_to_canary",
    authLifecycleRequestCounts: {
      preAuthenticationAuthMe: 1,
      login: 1,
      authenticatedAuthMe: 2,
      workflowNavigationAuthMe: 1,
      logout: 1,
      postLogoutAuthMe: 1,
    },
    elapsedMs: 1,
  };
  const serialized = safeJsonStringify(summary, SENSITIVE_VALUES);
  for (const sensitive of SENSITIVE_VALUES) {
    expect(serialized).not.toContain(sensitive);
  }
});

test("requires every canary spec to call the common execution runner", () => {
  for (const name of [
    "01-doctor-read-only-group.spec.ts",
    "02-system-forbidden-group.spec.ts",
    "03-auth-cross-cutting-group.spec.ts",
    "04-doctor-lock-write-group.spec.ts",
  ]) {
    const source = readFileSync(
      `test/browser-acceptance/b12/canary/${name}`,
      "utf8",
    );
    expect(source).toContain("runB12ExecutionGroup({");
    expect(source).toContain("onOwnerFinalized: harness.onOwnerFinalized");
  }
});

test("keeps the system canary outside the formal core auth-probe helper", () => {
  const source = readFileSync(
    "test/browser-acceptance/b12/canary/b12-g3-a2-canary-owner-scope.ts",
    "utf8",
  );
  expect(source).toContain('this.owner.auditOwner.endsWith("/denied-role-entry")');
  expect(source).toContain('status === 401');
  expect(source).toContain("inspectB12CoreWorkflowNavigationAuthEntries(");
});
