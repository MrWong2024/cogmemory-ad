import { resolveLiveAcceptanceEnvironment } from '../support/acceptance-env';
import {
  clearKeyboardEvidence,
  installKeyboardEvidence,
  pressKeyboard,
  readKeyboardEvidence,
} from '../support/keyboard-evidence';
import { NetworkLedger } from '../support/network-ledger';
import { ConsoleAudit, auditRuntimeStorage } from '../support/runtime-audit';
import { safeJsonStringify } from '../support/safe-output';
import { expect, test } from '../support/acceptance-test';

const liveEnvironment = resolveLiveAcceptanceEnvironment();

test.describe('production frontend and Browser test backend topology', () => {
  test.skip(
    !liveEnvironment.enabled,
    'BROWSER_ACCEPTANCE_RUN_LIVE=1 and explicit localhost origins are required',
  );

  test('loads login and verifies health, exact CORS, credentials, keyboard, and runtime boundaries', async ({
    page,
  }) => {
    if (!liveEnvironment.enabled) {
      throw new Error('Live Browser acceptance environment was not enabled');
    }

    const consoleAudit = new ConsoleAudit(page);
    const ledger = new NetworkLedger();
    consoleAudit.start();
    await installKeyboardEvidence(page);
    await ledger.attach(page);
    try {
      const loginResponse = await page.goto(
        `${liveEnvironment.frontendOrigin}/login`,
        { waitUntil: 'domcontentloaded' },
      );
      expect(loginResponse?.ok()).toBe(true);
      await page.locator('input').first().waitFor({ state: 'visible' });

      const healthResponsePromise = page.waitForResponse(
        (response) =>
          response.url() === `${liveEnvironment.backendOrigin}/health` &&
          response.request().method() === 'GET',
      );
      const healthResult = await page.evaluate(async (backendOrigin) => {
        const response = await fetch(`${backendOrigin}/health`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        return { ok: response.ok, status: response.status };
      }, liveEnvironment.backendOrigin);
      const healthResponse = await healthResponsePromise;

      expect(healthResult).toEqual({ ok: true, status: 200 });
      expect(await healthResponse.headerValue('access-control-allow-origin')).toBe(
        liveEnvironment.frontendOrigin,
      );
      expect(
        await healthResponse.headerValue('access-control-allow-credentials'),
      ).toBe('true');

      await clearKeyboardEvidence(page);
      await pressKeyboard(page, 'Tab');
      await pressKeyboard(page, 'Shift+Tab');
      const keyboardEvents = await readKeyboardEvidence(page);
      const trustedKeyboardEventCount = keyboardEvents.filter(
        ({ isTrusted }) => isTrusted,
      ).length;
      expect(trustedKeyboardEventCount).toBe(keyboardEvents.length);
      expect(trustedKeyboardEventCount).toBeGreaterThan(0);

      const runtime = await auditRuntimeStorage(page);
      expect(runtime.forbiddenValueDetected).toBe(false);
      expect(runtime.documentCookieForbiddenPatternDetected).toBe(false);
      expect(runtime.urlHasSensitiveQueryOrHash).toBe(false);

      const network = ledger.summary();
      expect(
        network.entries.filter(({ method }) =>
          ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method),
        ),
      ).toHaveLength(0);
      const failedNetworkEntries = network.entries
        .filter(
          ({ status, failureReason }) =>
            (status !== null && status >= 400) || failureReason !== null,
        )
        .map(({ method, status, safeUrlPattern, failureReason }) => ({
          method,
          status,
          safeUrlPattern,
          failureReason,
        }));
      expect(failedNetworkEntries).toEqual([
        {
          method: 'GET',
          status: 401,
          safeUrlPattern: '/auth/me',
          failureReason: null,
        },
      ]);
      const consoleSummary = consoleAudit.summary();
      const networkConsoleErrorCount =
        consoleSummary.categories.find(
          ({ category }) => category === 'network',
        )?.count ?? 0;
      const expectedUnauthenticatedProbeConsoleCount = Math.min(
        1,
        networkConsoleErrorCount,
      );
      const infrastructureConsoleErrorCount =
        consoleSummary.errorCount - expectedUnauthenticatedProbeConsoleCount;
      expect(consoleSummary.warningCount).toBe(0);
      expect(infrastructureConsoleErrorCount).toBe(0);
      expect(consoleSummary.pageErrorCount).toBe(0);

      console.log(
        `BROWSER_ACCEPTANCE_LIVE ${safeJsonStringify({
          frontendLoginStatus: loginResponse?.status() ?? null,
          backendHealthStatus: healthResult.status,
          exactCors: true,
          credentialsAllowed: true,
          trustedKeyboardEventCount,
          consoleErrorCount: consoleSummary.errorCount,
          expectedUnauthenticatedProbeConsoleCount,
          infrastructureConsoleErrorCount,
          pageErrorCount: consoleSummary.pageErrorCount,
          writeRequestCount: 0,
        })}`,
      );
    } finally {
      consoleAudit.stop();
      await ledger.detach();
    }
  });
});
