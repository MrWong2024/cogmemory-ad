import { test as base } from '@playwright/test';
import { RoleContextFactory } from './role-context-factory';

type AcceptanceFixtures = {
  roleContexts: RoleContextFactory;
};

export const test = base.extend<AcceptanceFixtures>({
  roleContexts: async ({ browser }, fixtureUse) => {
    const factory = new RoleContextFactory(browser);
    try {
      await fixtureUse(factory);
    } finally {
      await factory.closeAll();
    }
  },
});

export { expect } from '@playwright/test';
