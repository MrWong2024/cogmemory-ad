import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from '@playwright/test';

export type AcceptanceRole =
  | 'doctor'
  | 'admin'
  | 'nurse'
  | 'research_assistant'
  | 'system';

export type RoleContext = {
  role: AcceptanceRole;
  context: BrowserContext;
  page: Page;
};

export type RoleContextFactorySummary = {
  activeContextCount: number;
  roles: AcceptanceRole[];
};

export class RoleContextFactory {
  private readonly contexts = new Map<string, RoleContext>();

  constructor(private readonly browser: Browser) {}

  async create(
    role: AcceptanceRole,
    label = 'default',
    options: BrowserContextOptions = {},
  ): Promise<RoleContext> {
    const key = `${role}:${label}`;
    if (this.contexts.has(key)) {
      throw new Error('A role context with the same safe label already exists');
    }

    const context = await this.browser.newContext(options);
    try {
      const page = await context.newPage();
      const roleContext = { role, context, page };
      this.contexts.set(key, roleContext);
      return roleContext;
    } catch (error: unknown) {
      await context.close();
      throw error;
    }
  }

  summary(): RoleContextFactorySummary {
    return {
      activeContextCount: this.contexts.size,
      roles: [...new Set([...this.contexts.values()].map(({ role }) => role))],
    };
  }

  async closeAll(): Promise<RoleContextFactorySummary> {
    const active = [...this.contexts.values()];
    this.contexts.clear();
    const results = await Promise.allSettled(
      active.map(({ context }) => context.close()),
    );
    const failureCount = results.filter(
      (result) => result.status === 'rejected',
    ).length;

    if (failureCount > 0) {
      throw new Error('One or more isolated BrowserContext instances failed to close');
    }

    return {
      activeContextCount: 0,
      roles: [...new Set(active.map(({ role }) => role))],
    };
  }
}
