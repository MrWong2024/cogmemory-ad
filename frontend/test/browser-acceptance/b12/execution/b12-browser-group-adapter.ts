import type { Page } from "@playwright/test";

import {
  B12BrowserSession,
  attemptB12BrowserLogout,
  resolveB12SessionOpenMode,
  type B12LogoutMechanism,
  type B12SessionOpenMode,
} from "../b12-core-support";
import type {
  B12CoreRouteTarget,
  B12CoreRuntimeDescriptor,
} from "../b12-runtime-descriptor";
import type { B12BrowserEnvironment } from "../b12-env";
import { NetworkLedger } from "../../support/network-ledger";
import { auditRuntimeStorage } from "../../support/runtime-audit";
import type {
  AcceptanceRole,
  RoleContextFactory,
} from "../../support/role-context-factory";
import { expect } from "../../support/acceptance-test";

type EnabledEnvironment = Extract<B12BrowserEnvironment, { enabled: true }>;

export type B12BrowserGroupCollectResult = Readonly<{
  logoutMechanism: B12LogoutMechanism;
  cookieCleared: true;
  storageCleared: true;
  contextReadyToClose: true;
}>;

export class B12BrowserGroupSession {
  readonly page: Page;
  private readonly ledger = new NetworkLedger();
  private ledgerAttached = false;
  private ownerActive = false;

  private constructor(
    readonly role: AcceptanceRole,
    private readonly loginIdentifier: string,
    private readonly environment: EnabledEnvironment,
    private readonly contextCookies: () => Promise<Array<{ httpOnly: boolean }>>,
    page: Page,
  ) {
    this.page = page;
  }

  static async create(input: {
    role: AcceptanceRole;
    loginIdentifier: string;
    environment: EnabledEnvironment;
    roleContexts: RoleContextFactory;
    label: string;
  }): Promise<B12BrowserGroupSession> {
    const roleContext = await input.roleContexts.create(input.role, input.label, {
      viewport: { width: 1536, height: 864 },
    });
    const session = new B12BrowserGroupSession(
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

  async beginOwner(input: {
    label: "primary" | "secondary" | "system";
    descriptor: B12CoreRuntimeDescriptor;
    target: B12CoreRouteTarget;
    role: AcceptanceRole;
  }): Promise<B12BrowserSession> {
    if (this.ownerActive) {
      throw new Error("B12_BROWSER_GROUP_PREVIOUS_OWNER_REMAINS");
    }
    if (input.role !== this.role) {
      throw new Error("B12_BROWSER_GROUP_OWNER_ROLE_MISMATCH");
    }
    this.ownerActive = true;
    try {
      return await B12BrowserSession.createInAuthenticatedGroup({
        label: input.label,
        role: input.role,
        loginIdentifier: this.loginIdentifier,
        descriptor: input.descriptor,
        target: input.target,
        openMode: resolveB12SessionOpenMode(input.target, input.role),
        environment: this.environment,
        page: this.page,
        contextCookies: this.contextCookies,
      });
    } catch (error: unknown) {
      this.ownerActive = false;
      throw error;
    }
  }

  endOwner(): void {
    if (!this.ownerActive) {
      throw new Error("B12_BROWSER_GROUP_OWNER_NOT_ACTIVE");
    }
    this.ownerActive = false;
  }

  async collectAndLogout(input: {
    target: B12CoreRouteTarget;
    openMode: B12SessionOpenMode;
  }): Promise<B12BrowserGroupCollectResult> {
    if (this.ownerActive) {
      throw new Error("B12_BROWSER_GROUP_OWNER_REMAINS_AT_COLLECT");
    }
    const storage = await auditRuntimeStorage(this.page);
    expect(storage.localStorageKeys).toEqual([]);
    expect(storage.sessionStorageKeys).toEqual([]);
    expect(storage.indexedDbNames).toEqual([]);
    expect(storage.forbiddenValueDetected).toBe(false);
    expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
    expect((await this.contextCookies()).some(({ httpOnly }) => httpOnly)).toBe(
      true,
    );
    const attempt = await attemptB12BrowserLogout({
      page: this.page,
      target: input.target,
      role: this.role,
      openMode: input.openMode,
      backendOrigin: this.environment.backendOrigin,
      frontendOrigin: this.environment.frontendOrigin,
      contextCookies: this.contextCookies,
      recordBoundary: () => undefined,
    });
    expect(attempt.result).toBe("succeeded");
    if (!attempt.mechanism) {
      throw new Error("B12_BROWSER_GROUP_LOGOUT_MECHANISM_MISSING");
    }
    expect((await this.contextCookies()).some(({ httpOnly }) => httpOnly)).toBe(
      false,
    );
    await this.ledger.detach();
    this.ledgerAttached = false;
    return Object.freeze({
      logoutMechanism: attempt.mechanism,
      cookieCleared: true,
      storageCleared: true,
      contextReadyToClose: true,
    });
  }

  async finishInfrastructureCleanup(): Promise<void> {
    if (this.ledgerAttached) {
      await this.ledger.detach();
      this.ledgerAttached = false;
    }
  }

  private async authenticate(): Promise<void> {
    await this.ledger.attach(this.page);
    this.ledgerAttached = true;
    const initialAuthMe = this.page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).origin === this.environment.backendOrigin &&
        new URL(response.url()).pathname === "/auth/me",
      { timeout: 20_000 },
    );
    await this.page.goto(`${this.environment.frontendOrigin}/login`, {
      waitUntil: "domcontentloaded",
    });
    const account = this.page.getByLabel("账号", { exact: true });
    const password = this.page.getByLabel("密码", { exact: true });
    const [, initialResponse] = await Promise.all([
      expect(account).toBeVisible(),
      initialAuthMe,
    ]);
    expect(initialResponse.status()).toBe(401);
    await account.fill(this.loginIdentifier);
    await password.fill(this.environment.fixturePassword);
    const login = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).origin === this.environment.backendOrigin &&
        new URL(response.url()).pathname === "/auth/login",
      { timeout: 20_000 },
    );
    await this.page.getByRole("button", { name: "登录系统", exact: true }).click();
    const response = await login;
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
    await this.page.waitForURL(`${this.environment.frontendOrigin}/dashboard`);
  }
}
