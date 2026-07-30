import type { Page } from "@playwright/test";

import {
  attemptB12BrowserLogout,
  auditB12DomPrivacy,
  setB12LoginBoundaryEntryIndex,
  setB12LogoutBoundaryEntryIndex,
  type B12LogoutMechanism,
} from "../b12-core-support";
import type {
  B12CoreRouteTarget,
  B12CoreRuntimeDescriptor,
} from "../b12-runtime-descriptor";
import { B12CrossCuttingEvidenceRegistry } from "../execution/b12-cross-cutting-evidence";
import {
  createB12OwnerExecutionFailure,
  type B12FailureCategory,
} from "../execution/b12-execution-types";
import type {
  B12ExecutionGroupSummary,
  B12GroupCleanupContext,
  B12OwnerCleanupContext,
  B12OwnerRunContext,
} from "../execution/b12-execution-group-runner";
import type { B12OwnerJournalRecord } from "../execution/b12-owner-result-journal";
import type { B12BrowserEnvironment } from "../b12-env";
import {
  B12G3A2CanaryAtomicJournal,
  type B12G3A2CanaryJournalDocument,
} from "./b12-g3-a2-canary-journal";
import {
  B12G3A2CanaryOwnerScope,
  type B12G3A2CanaryOwnerCleanupSummary,
} from "./b12-g3-a2-canary-owner-scope";
import {
  assertB12G3A2CanaryRuntimeMatchesOwner,
  deleteB12G3A2CanaryRuntimeDescriptor,
  readB12G3A2CanaryRuntimeDescriptor,
  type B12G3A2CanaryRuntimeDescriptor,
} from "./b12-g3-a2-canary-runtime";
import {
  B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED,
  B12_G3_A2_CANARY_CROSS_CUTTING_DEFINITIONS,
  B12_G3_A2_CANARY_EVIDENCE_SCOPE,
  B12_G3_A2_CANARY_PHASE,
  type B12G3A2CanaryExecutionGroup,
  type B12G3A2CanaryOwnerDefinition,
  type B12G3A2CanarySafeSummary,
} from "./b12-g3-a2-canary-types";
import { NetworkLedger, type NetworkLedgerEntry } from "../../support/network-ledger";
import { auditRuntimeStorage } from "../../support/runtime-audit";
import { safeJsonStringify } from "../../support/safe-output";
import type {
  AcceptanceRole,
  RoleContextFactory,
} from "../../support/role-context-factory";
import { expect } from "../../support/acceptance-test";

type EnabledB12BrowserEnvironment = Extract<
  B12BrowserEnvironment,
  { enabled: true }
>;

type B12G3A2CanaryCollectResult = Readonly<{
  logoutMechanism: B12LogoutMechanism;
  preAuthenticationAuthMeRequestCount: number;
  loginRequestCount: number;
  authenticatedAuthMeRequestCount: number;
  logoutRequestCount: number;
  postLogoutAuthMeRequestCount: number;
  cookieCleared: true;
  corsPassed: true;
  storagePassed: true;
  domPrivacyPassed: true;
  urlSafetyPassed: true;
}>;

type B12G3A2CanaryHarnessConfig = Readonly<{
  executionGroup: B12G3A2CanaryExecutionGroup;
  owners: readonly B12G3A2CanaryOwnerDefinition[];
  expectedRole: AcceptanceRole;
  logoutTarget: B12CoreRouteTarget;
  environment: EnabledB12BrowserEnvironment;
  roleContexts: RoleContextFactory;
  journalTarget: string;
  collectValidator?: (result: B12G3A2CanaryCollectResult) => void | Promise<void>;
}>;

export type B12G3A2CanaryGroupState = Readonly<{
  session: B12G3A2CanaryGroupSession;
  descriptors: ReadonlyMap<string, B12G3A2CanaryRuntimeDescriptor>;
}>;

export type B12G3A2CanaryOwnerExerciseContext = Readonly<{
  owner: B12G3A2CanaryOwnerDefinition;
  descriptor: B12G3A2CanaryRuntimeDescriptor;
  session: B12G3A2CanaryGroupSession;
  scope: B12G3A2CanaryOwnerScope;
}>;

const AUTH_ME_PATTERN = "/auth/me";
const LOGIN_PATTERN = "/auth/login";
const LOGOUT_PATTERN = "/auth/logout";

function successful(entry: NetworkLedgerEntry): boolean {
  return (
    entry.status !== null &&
    entry.status >= 200 &&
    entry.status < 300 &&
    entry.failureReason === null
  );
}

function inspectCanaryAuthLifecycle(input: {
  entries: readonly NetworkLedgerEntry[];
  loginBoundaryEntryIndex: number;
  logoutBoundaryEntryIndex: number;
  role: AcceptanceRole;
}): Omit<
  B12G3A2CanaryCollectResult,
  | "logoutMechanism"
  | "cookieCleared"
  | "corsPassed"
  | "storagePassed"
  | "domPrivacyPassed"
  | "urlSafetyPassed"
> {
  const preAuthenticationEntries = input.entries.slice(
    0,
    input.loginBoundaryEntryIndex,
  );
  const loginAndAuthenticatedEntries = input.entries.slice(
    input.loginBoundaryEntryIndex,
    input.logoutBoundaryEntryIndex,
  );
  const logoutAndPostLogoutEntries = input.entries.slice(
    input.logoutBoundaryEntryIndex,
  );
  const preAuthenticationAuthMe = preAuthenticationEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "GET" && safeUrlPattern === AUTH_ME_PATTERN,
  );
  const loginEntries = loginAndAuthenticatedEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "POST" && safeUrlPattern === LOGIN_PATTERN,
  );
  expect(preAuthenticationAuthMe).toHaveLength(1);
  expect(preAuthenticationAuthMe[0]).toMatchObject({
    status: 401,
    failureReason: null,
  });
  expect(loginEntries).toHaveLength(1);
  expect(loginEntries.every(successful)).toBe(true);
  const loginOffset = loginAndAuthenticatedEntries.indexOf(loginEntries[0]);
  const authenticatedEntries = loginAndAuthenticatedEntries.slice(
    loginOffset + 1,
  );
  const authenticatedAuthMe = authenticatedEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "GET" && safeUrlPattern === AUTH_ME_PATTERN,
  );
  if (input.role === "system") {
    expect(
      authenticatedAuthMe.every(
        ({ status, failureReason }) =>
          failureReason === null &&
          status !== null &&
          ((status >= 200 && status < 300) || status === 401),
      ),
    ).toBe(true);
  } else {
    expect(authenticatedAuthMe.length).toBeGreaterThan(0);
    expect(authenticatedAuthMe.every(successful)).toBe(true);
  }
  const logoutEntries = logoutAndPostLogoutEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "POST" && safeUrlPattern === LOGOUT_PATTERN,
  );
  const postLogoutAuthMe = logoutAndPostLogoutEntries.filter(
    ({ method, safeUrlPattern }) =>
      method === "GET" && safeUrlPattern === AUTH_ME_PATTERN,
  );
  expect(logoutEntries).toHaveLength(1);
  expect(logoutEntries.every(successful)).toBe(true);
  expect(postLogoutAuthMe).toHaveLength(1);
  expect(postLogoutAuthMe[0]).toMatchObject({
    status: 401,
    failureReason: null,
  });
  expect(
    logoutAndPostLogoutEntries.filter(
      ({ safeUrlPattern }) => safeUrlPattern.startsWith("/patients/"),
    ),
  ).toHaveLength(0);
  return {
    preAuthenticationAuthMeRequestCount: preAuthenticationAuthMe.length,
    loginRequestCount: loginEntries.length,
    authenticatedAuthMeRequestCount: authenticatedAuthMe.length,
    logoutRequestCount: logoutEntries.length,
    postLogoutAuthMeRequestCount: postLogoutAuthMe.length,
  };
}

export class B12G3A2CanaryGroupSession {
  readonly page: Page;
  private readonly ledger = new NetworkLedger();
  private readonly corsChecks: boolean[] = [];
  private activeScope: B12G3A2CanaryOwnerScope | null = null;
  private loginBoundaryEntryIndex: number | null = null;
  private logoutBoundaryEntryIndex: number | null = null;
  private logoutMechanism: B12LogoutMechanism | null = null;
  private ledgerAttached = false;
  private responseListenerAttached = false;
  private logoutAttempted = false;

  private readonly onResponse = (response: { url(): string; headers(): Record<string, string> }): void => {
    let origin: string;
    try {
      origin = new URL(response.url()).origin;
    } catch {
      return;
    }
    if (origin !== this.environment.backendOrigin) return;
    const headers = response.headers();
    this.corsChecks.push(
      headers["access-control-allow-origin"] ===
        this.environment.frontendOrigin &&
        headers["access-control-allow-credentials"] === "true",
    );
  };

  private constructor(
    readonly role: AcceptanceRole,
    private readonly loginIdentifier: string,
    private readonly environment: EnabledB12BrowserEnvironment,
    private readonly contextCookies: () => Promise<
      Array<{ httpOnly: boolean }>
    >,
    page: Page,
  ) {
    this.page = page;
  }

  static async create(input: {
    role: AcceptanceRole;
    loginIdentifier: string;
    environment: EnabledB12BrowserEnvironment;
    roleContexts: RoleContextFactory;
    label: string;
  }): Promise<B12G3A2CanaryGroupSession> {
    const roleContext = await input.roleContexts.create(input.role, input.label, {
      viewport: { width: 1536, height: 864 },
    });
    const session = new B12G3A2CanaryGroupSession(
      input.role,
      input.loginIdentifier,
      input.environment,
      () => roleContext.context.cookies(),
      roleContext.page,
    );
    try {
      await session.authenticate();
      return session;
    } catch (error: unknown) {
      await session.finishInfrastructureCleanup().catch(() => undefined);
      throw error;
    }
  }

  beginOwner(
    owner: B12G3A2CanaryOwnerDefinition,
  ): B12G3A2CanaryOwnerScope {
    if (this.activeScope) {
      throw new Error("B12_CANARY_PREVIOUS_OWNER_SCOPE_REMAINS");
    }
    const scope = new B12G3A2CanaryOwnerScope(
      owner,
      this.page,
      this.ledger,
      this.ledger.entries().length,
    );
    scope.start();
    this.activeScope = scope;
    return scope;
  }

  async cleanupOwner(
    owner: B12G3A2CanaryOwnerDefinition,
  ): Promise<B12G3A2CanaryOwnerCleanupSummary> {
    if (!this.activeScope || this.activeScope.owner.auditOwner !== owner.auditOwner) {
      throw new Error("B12_CANARY_ACTIVE_OWNER_SCOPE_MISMATCH");
    }
    try {
      return await this.activeScope.minimalCleanup();
    } finally {
      this.activeScope = null;
    }
  }

  async collect(
    logoutTarget: B12CoreRouteTarget,
  ): Promise<B12G3A2CanaryCollectResult> {
    if (this.activeScope) {
      throw new Error("B12_CANARY_OWNER_SCOPE_REMAINS_AT_COLLECT");
    }
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
    await auditB12DomPrivacy(this.page, []);
    expect(
      (await this.contextCookies()).some(({ httpOnly }) => httpOnly),
    ).toBe(true);

    this.logoutAttempted = true;
    const openMode = this.role === "system" ? "forbidden" : "readable";
    const attempt = await attemptB12BrowserLogout({
      page: this.page,
      target: logoutTarget,
      role: this.role,
      openMode,
      backendOrigin: this.environment.backendOrigin,
      frontendOrigin: this.environment.frontendOrigin,
      contextCookies: this.contextCookies,
      recordBoundary: () => {
        if (this.loginBoundaryEntryIndex === null) {
          throw new Error("B12_CANARY_LOGIN_BOUNDARY_MISSING");
        }
        this.logoutBoundaryEntryIndex = setB12LogoutBoundaryEntryIndex(
          this.logoutBoundaryEntryIndex,
          this.loginBoundaryEntryIndex,
          this.ledger.entries().length,
        );
      },
    });
    expect(attempt.result).toBe("succeeded");
    if (!attempt.mechanism) {
      throw new Error("B12_CANARY_LOGOUT_MECHANISM_MISSING");
    }
    this.logoutMechanism = attempt.mechanism;
    expect(
      (await this.contextCookies()).some(({ httpOnly }) => httpOnly),
    ).toBe(false);
    await this.page.waitForLoadState("networkidle", { timeout: 10_000 });
    this.detachResponseListener();
    const network = await this.ledger.detach();
    this.ledgerAttached = false;
    if (
      this.loginBoundaryEntryIndex === null ||
      this.logoutBoundaryEntryIndex === null
    ) {
      throw new Error("B12_CANARY_AUTH_BOUNDARY_MISSING");
    }
    const auth = inspectCanaryAuthLifecycle({
      entries: network.entries,
      loginBoundaryEntryIndex: this.loginBoundaryEntryIndex,
      logoutBoundaryEntryIndex: this.logoutBoundaryEntryIndex,
      role: this.role,
    });
    expect(this.corsChecks.length).toBeGreaterThan(0);
    expect(this.corsChecks.every(Boolean)).toBe(true);
    return Object.freeze({
      logoutMechanism: attempt.mechanism,
      ...auth,
      cookieCleared: true,
      corsPassed: true,
      storagePassed: true,
      domPrivacyPassed: true,
      urlSafetyPassed: true,
    });
  }

  async finishInfrastructureCleanup(): Promise<void> {
    this.detachResponseListener();
    if (this.ledgerAttached) {
      await this.ledger.detach();
      this.ledgerAttached = false;
    }
  }

  private async authenticate(): Promise<void> {
    await this.ledger.attach(this.page);
    this.ledgerAttached = true;
    this.page.on("response", this.onResponse);
    this.responseListenerAttached = true;
    const initialAuthMeResponsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).origin === this.environment.backendOrigin &&
        new URL(response.url()).pathname === AUTH_ME_PATTERN,
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
        new URL(response.url()).pathname === LOGIN_PATTERN,
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
  }

  private detachResponseListener(): void {
    if (!this.responseListenerAttached) return;
    this.page.off("response", this.onResponse);
    this.responseListenerAttached = false;
  }
}

export class B12G3A2CanaryGroupHarness {
  readonly setupGroup: () => Promise<B12G3A2CanaryGroupState>;
  readonly minimalCleanup: (
    context: B12OwnerCleanupContext<
      B12G3A2CanaryOwnerDefinition,
      B12G3A2CanaryGroupState
    >,
  ) => Promise<void>;
  readonly cleanupGroup: (
    context: B12GroupCleanupContext<B12G3A2CanaryGroupState>,
  ) => Promise<void>;
  readonly onOwnerFinalized: (
    record: B12OwnerJournalRecord,
  ) => Promise<void>;

  private readonly startedAt = Date.now();
  private readonly forbiddenLiterals: string[];
  private session: B12G3A2CanaryGroupSession | null = null;
  private collectResult: B12G3A2CanaryCollectResult | null = null;
  private contextCount = 0;
  private sessionCount = 0;
  private fullCollectCount = 0;
  private minimalCleanupCount = 0;
  private interceptInstalledCount = 0;
  private interceptRemovedCount = 0;
  private workflowNavigationAuthMeRequestCount = 0;

  private constructor(
    private readonly config: B12G3A2CanaryHarnessConfig,
    private readonly journal: B12G3A2CanaryAtomicJournal,
  ) {
    this.forbiddenLiterals = [config.environment.fixturePassword];
    this.onOwnerFinalized = journal.onOwnerFinalized;
    this.setupGroup = () => this.setup();
    this.minimalCleanup = (context) => this.cleanupOwner(context);
    this.cleanupGroup = (context) => this.cleanup(context);
  }

  static async create(
    config: B12G3A2CanaryHarnessConfig,
  ): Promise<B12G3A2CanaryGroupHarness> {
    if (
      config.owners.length === 0 ||
      config.owners.some(
        (owner) => owner.executionGroup !== config.executionGroup,
      )
    ) {
      throw new Error("B12_CANARY_HARNESS_OWNER_GROUP_INVALID");
    }
    const journal = await B12G3A2CanaryAtomicJournal.create({
      executionGroup: config.executionGroup,
      target: config.journalTarget,
    });
    return new B12G3A2CanaryGroupHarness(config, journal);
  }

  async runOwner(
    context: B12OwnerRunContext<
      B12G3A2CanaryOwnerDefinition,
      B12G3A2CanaryGroupState
    >,
    exercise: (
      context: B12G3A2CanaryOwnerExerciseContext,
    ) => void | Promise<void>,
  ): Promise<void> {
    if (!context.groupState) {
      throw createB12OwnerExecutionFailure(
        "shared_support",
        "B12_CANARY_GROUP_STATE_MISSING",
      );
    }
    const descriptor = context.groupState.descriptors.get(
      context.owner.auditOwner,
    );
    if (!descriptor) {
      throw createB12OwnerExecutionFailure(
        "shared_support",
        "B12_CANARY_OWNER_RUNTIME_MISSING",
      );
    }
    const scope = context.groupState.session.beginOwner(context.owner);
    await exercise({
      owner: context.owner,
      descriptor,
      session: context.groupState.session,
      scope,
    });
  }

  async finalize(
    runnerSummary: B12ExecutionGroupSummary,
  ): Promise<B12G3A2CanarySafeSummary> {
    let journalDocument: B12G3A2CanaryJournalDocument | null = null;
    let journalValid = false;
    try {
      journalDocument = await this.journal.read();
      const expectedOrder = runnerSummary.ownerResults.map(
        ({ auditOwner }) => auditOwner,
      );
      const persistedOrder = journalDocument.ownerRecords.map(
        ({ auditOwner }) => auditOwner,
      );
      journalValid =
        JSON.stringify(persistedOrder) === JSON.stringify(expectedOrder);
    } catch {
      journalValid = false;
    }

    const expectedInterceptCount =
      this.config.executionGroup === "eg-canary-doctor-read-only" ||
      this.config.executionGroup === "eg-canary-doctor-lock-write"
        ? 1
        : 0;
    const budgetSatisfied =
      this.contextCount === 1 &&
      this.sessionCount === 1 &&
      this.fullCollectCount === 1 &&
      this.minimalCleanupCount === this.config.owners.length &&
      this.interceptInstalledCount === expectedInterceptCount &&
      this.interceptRemovedCount === expectedInterceptCount;
    const profileCompletionBlocked =
      runnerSummary.profileCompletionBlocked ||
      !journalValid ||
      !budgetSatisfied;
    const safeSummary: B12G3A2CanarySafeSummary = Object.freeze({
      phase: B12_G3_A2_CANARY_PHASE,
      evidenceScope: B12_G3_A2_CANARY_EVIDENCE_SCOPE,
      auditClosureAllowed: B12_G3_A2_CANARY_AUDIT_CLOSURE_ALLOWED,
      executionGroup: this.config.executionGroup,
      ownerCount: runnerSummary.ownerResults.length,
      ownerResults: Object.freeze(
        runnerSummary.ownerResults.map((record) =>
          Object.freeze({
            auditOwner: record.auditOwner,
            result: record.result,
            failureCategory: record.failureCategory,
            minimalCleanupCompleted: record.minimalCleanupCompleted,
          }),
        ),
      ),
      contextCount: this.contextCount,
      sessionCount: this.sessionCount,
      fullCollectCount: this.fullCollectCount,
      minimalCleanupCount: this.minimalCleanupCount,
      interceptInstalledCount: this.interceptInstalledCount,
      interceptRemovedCount: this.interceptRemovedCount,
      logoutMechanism: this.collectResult?.logoutMechanism ?? "not_completed",
      groupSetupSucceeded: runnerSummary.groupSetupSucceeded,
      groupCleanupSucceeded: runnerSummary.groupCleanupSucceeded,
      profileCompletionBlocked,
      databaseTerminalEvidence: "not_applicable_to_canary",
      authLifecycleRequestCounts: this.collectResult
        ? Object.freeze({
            preAuthenticationAuthMe:
              this.collectResult.preAuthenticationAuthMeRequestCount,
            login: this.collectResult.loginRequestCount,
            authenticatedAuthMe:
              this.collectResult.authenticatedAuthMeRequestCount,
            workflowNavigationAuthMe:
              this.workflowNavigationAuthMeRequestCount,
            logout: this.collectResult.logoutRequestCount,
            postLogoutAuthMe:
              this.collectResult.postLogoutAuthMeRequestCount,
          })
        : null,
      elapsedMs: Date.now() - this.startedAt,
    });
    console.log(
      `B12_G3_A2_CANARY ${safeJsonStringify(
        safeSummary,
        this.forbiddenLiterals,
      )}`,
    );

    const passed =
      runnerSummary.stopReason === "none" &&
      runnerSummary.groupSetupSucceeded &&
      runnerSummary.groupCleanupSucceeded &&
      !profileCompletionBlocked &&
      runnerSummary.ownerResults.length === this.config.owners.length &&
      runnerSummary.ownerResults.every(
        (record) => record.result === "pass" && record.minimalCleanupCompleted,
      );
    if (!passed) {
      void journalDocument;
      throw new Error("B12_G3_A2_CANARY_GROUP_FAILED");
    }
    expect(await this.journal.remove()).toBe(true);
    return safeSummary;
  }

  private async setup(): Promise<B12G3A2CanaryGroupState> {
    const descriptors = new Map<string, B12G3A2CanaryRuntimeDescriptor>();
    try {
      for (const owner of this.config.owners) {
        const descriptor = await readB12G3A2CanaryRuntimeDescriptor(owner);
        assertB12G3A2CanaryRuntimeMatchesOwner(owner, descriptor);
        descriptors.set(owner.auditOwner, descriptor);
        this.forbiddenLiterals.push(
          descriptor.loginIdentifier,
          descriptor.navigationPath,
        );
      }
      const values = [...descriptors.values()];
      if (
        values.some(
          (descriptor) => descriptor.primaryRole !== this.config.expectedRole,
        ) ||
        new Set(values.map(({ loginIdentifier }) => loginIdentifier)).size !== 1
      ) {
        throw new Error("B12_CANARY_GROUP_RUNTIME_SESSION_MISMATCH");
      }
    } catch {
      throw createB12OwnerExecutionFailure(
        "fixture",
        "B12_CANARY_RUNTIME_SETUP_FAILED",
      );
    }

    const firstDescriptor = [...descriptors.values()][0];
    if (!firstDescriptor) {
      throw createB12OwnerExecutionFailure(
        "fixture",
        "B12_CANARY_RUNTIME_SETUP_EMPTY",
      );
    }
    try {
      this.session = await B12G3A2CanaryGroupSession.create({
        role: this.config.expectedRole,
        loginIdentifier: firstDescriptor.loginIdentifier,
        environment: this.config.environment,
        roleContexts: this.config.roleContexts,
        label: this.config.executionGroup,
      });
      this.contextCount = 1;
      this.sessionCount = 1;
      expect(this.config.roleContexts.summary().activeContextCount).toBe(1);
      return Object.freeze({
        session: this.session,
        descriptors,
      });
    } catch {
      throw createB12OwnerExecutionFailure(
        "group_setup_auth",
        "B12_CANARY_GROUP_AUTH_SETUP_FAILED",
      );
    }
  }

  private async cleanupOwner(
    context: B12OwnerCleanupContext<
      B12G3A2CanaryOwnerDefinition,
      B12G3A2CanaryGroupState
    >,
  ): Promise<void> {
    if (!context.groupState) {
      throw new Error("B12_CANARY_CLEANUP_GROUP_STATE_MISSING");
    }
    const summary = await context.groupState.session.cleanupOwner(
      context.owner,
    );
    this.minimalCleanupCount += 1;
    this.interceptInstalledCount += summary.interceptInstalledCount;
    this.interceptRemovedCount += summary.interceptRemovedCount;
    this.workflowNavigationAuthMeRequestCount +=
      summary.workflowNavigationAuthMeRequestCount;
  }

  private async cleanup(
    context: B12GroupCleanupContext<B12G3A2CanaryGroupState>,
  ): Promise<void> {
    let cleanupFailed = false;
    if (context.groupState) {
      this.fullCollectCount += 1;
      try {
        this.collectResult = await context.groupState.session.collect(
          this.config.logoutTarget,
        );
        await this.config.collectValidator?.(this.collectResult);
      } catch {
        cleanupFailed = true;
      }
      await context.groupState.session
        .finishInfrastructureCleanup()
        .catch(() => {
          cleanupFailed = true;
        });
    }
    const contextsClosed = await this.config.roleContexts
      .closeAll()
      .then(({ activeContextCount }) => activeContextCount === 0)
      .catch(() => false);
    if (!contextsClosed) cleanupFailed = true;

    let runtimeRemovedCount = 0;
    for (const owner of this.config.owners) {
      try {
        if (await deleteB12G3A2CanaryRuntimeDescriptor(owner)) {
          runtimeRemovedCount += 1;
        }
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          cleanupFailed = true;
        }
      }
    }
    if (context.groupSetupSucceeded && runtimeRemovedCount !== this.config.owners.length) {
      cleanupFailed = true;
    }
    if (cleanupFailed) {
      throw new Error("B12_CANARY_GROUP_CLEANUP_FAILED");
    }
  }
}

export async function runB12G3A2CanaryPhase<T>(
  category: Exclude<B12FailureCategory, "none">,
  safeCode: string,
  action: () => T | Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch {
    throw createB12OwnerExecutionFailure(category, safeCode);
  }
}

export function assertB12G3A2CanaryAuthCrossCuttingEvidence(
  result: B12G3A2CanaryCollectResult,
): void {
  expect(result).toMatchObject({
    cookieCleared: true,
    corsPassed: true,
    storagePassed: true,
    domPrivacyPassed: true,
    urlSafetyPassed: true,
    logoutMechanism: "ui_control",
    preAuthenticationAuthMeRequestCount: 1,
    loginRequestCount: 1,
    logoutRequestCount: 1,
    postLogoutAuthMeRequestCount: 1,
  });
  expect(result.authenticatedAuthMeRequestCount).toBeGreaterThan(0);
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
  const impact = registry.calculateAuditImpact();
  expect(impact.directAuditResults).toEqual([]);
  expect(impact.profileCompletionBlocked).toBe(false);
  expect(
    registry.snapshot().every(({ directAuditIds, directResult }) =>
      directAuditIds.length === 0 && directResult === "not_executed",
    ),
  ).toBe(true);
}

export function b12G3A2CanaryLogoutTarget(
  executionGroup: B12G3A2CanaryExecutionGroup,
): B12CoreRouteTarget {
  if (executionGroup === "eg-canary-doctor-lock-write") {
    return {
      scenarioKey: "success-idempotency",
      routeKey: "doctor-lock-success",
    };
  }
  if (executionGroup === "eg-canary-system-forbidden") {
    return {
      scenarioKey: "eligibility-state",
      routeKey: "denied-role-entry",
    };
  }
  return {
    scenarioKey: "eligibility-state",
    routeKey: "draft-no-entry",
  };
}

export function assertCanaryDescriptorIsCore(
  descriptor: B12G3A2CanaryRuntimeDescriptor,
): asserts descriptor is B12CoreRuntimeDescriptor {
  if (descriptor.profile !== "core-workflow") {
    throw new Error("B12_CANARY_CORE_DESCRIPTOR_REQUIRED");
  }
}
