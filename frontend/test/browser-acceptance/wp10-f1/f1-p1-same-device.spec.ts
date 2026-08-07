import type { BrowserContext } from '@playwright/test';

import { test, expect } from '../support/acceptance-test';
import { runAccessibilityAudit } from '../support/accessibility-audit';
import {
  auditRuntimeStorage,
} from '../support/runtime-audit';
import {
  assertNoGlobalHorizontalOverflow,
  auditViewport,
} from '../support/viewport-audit';
import {
  HANDOFF_PATTERN,
  PREPARATION_PATTERN,
  STAFF_ROOT_PATTERN,
  assertNoF2F3Requests,
  bodyContainsAny,
  completeLocalPreparation,
  invariant,
  loginStaff,
  openExecution,
  readDescriptor,
  requireSecret,
  resolveEnvironment,
} from './support/wp10-f1-support';

const environment = resolveEnvironment();

type CurrentBody = {
  status?: unknown;
  currentStep?: {
    patientText?: unknown;
    stepKey?: unknown;
    assets?: Array<{ assetKey?: unknown }>;
  } | null;
};

function patientCookieMetadata(context: BrowserContext, backendOrigin: string) {
  return context.cookies(`${backendOrigin}/patient-administration`).then((cookies) =>
    cookies.map(({ name, domain, httpOnly, secure, sameSite, path }) => ({
      name,
      domain,
      httpOnly,
      secure,
      sameSite,
      path,
    })),
  );
}

test.describe('WP-10 F1-P1 same-device preparation and safe handoff', () => {
  test.skip(!environment, 'Explicit live Browser acceptance environment is required');

  test('uses the production MMSE page and fails closed into patient mode', async ({
    roleContexts,
  }) => {
    test.setTimeout(75_000);
    invariant(environment, 'Live environment is unavailable');
    const descriptor = await readDescriptor('F1-P1-same-device');
    const password = requireSecret();
    const staff = await loginStaff({
      factory: roleContexts,
      account: descriptor.accounts.staff.loginIdentifier,
      password,
      environment,
      viewport: { width: 1280, height: 800 },
    });
    const { context, page } = staff.roleContext;
    await openExecution({ page, descriptor, environment });

    await page
      .getByRole('radio', { name: /同一设备/ })
      .check();
    const createResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/patient-administration') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '创建患者施测会话' }).click();
    const createResponse = await createResponsePromise;
    if (createResponse.status() !== 201) {
      let safeCode = 'UNAVAILABLE';
      try {
        const body = (await createResponse.json()) as { code?: unknown };
        if (typeof body.code === 'string' && /^[A-Z0-9_]+$/.test(body.code)) {
          safeCode = body.code;
        }
      } catch {
        // Only a safe backend code may cross the diagnostic boundary.
      }
      throw new Error(`Patient administration create failed with safe code ${safeCode}`);
    }
    await expect(page.getByTestId('patient-administration-entry-code')).toBeVisible();
    const storageWhileCodeVisible = await auditRuntimeStorage(page);
    expect(storageWhileCodeVisible.localStorageKeys).toEqual([]);
    expect(storageWhileCodeVisible.sessionStorageKeys).toEqual([]);
    expect(storageWhileCodeVisible.indexedDbNames).toEqual([]);

    await expect(page.getByRole('button', { name: '安全交接给患者' })).toHaveCount(
      0,
    );
    await completeLocalPreparation(page);
    await page
      .getByRole('checkbox', { name: '设备或网络因素' })
      .check();
    const preparationResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/preparation/confirm') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '确认准备与影响因素' }).click();
    const preparationResponse = await preparationResponsePromise;
    expect(preparationResponse.status()).toBe(200);
    await expect(page.getByText('设备准备与影响因素已确认。请核对后执行同设备安全交接。')).toBeVisible();
    await expect(page.getByText('等待准备', { exact: true })).toBeVisible();
    const revisionValue = page
      .getByText('服务端 revision', { exact: true })
      .locator('..')
      .locator('dd');
    await expect(revisionValue).toHaveText('1');

    const staffAuthStatus = await page.evaluate(async (backendOrigin) => {
      const response = await fetch(`${backendOrigin}/auth/me`, {
        cache: 'no-store',
        credentials: 'include',
      });
      return response.status;
    }, environment.backendOrigin);
    expect(staffAuthStatus).toBe(200);

    await page
      .getByRole('checkbox', {
        name: '我已确认设备将立即交给患者，并理解当前医护登录会被撤销',
      })
      .check();
    const handoffResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/handoff') &&
        response.request().method() === 'POST',
    );
    const currentResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/patient-administration/current' &&
        response.request().method() === 'GET' &&
        response.status() === 200,
    );
    await page.getByRole('button', { name: '安全交接给患者' }).click();
    expect((await handoffResponsePromise).status()).toBe(200);
    const currentResponse = await currentResponsePromise;
    const currentBody = (await currentResponse.json()) as CurrentBody;
    invariant(currentBody.status === 'active', 'Patient current status is not active');
    await expect(page).toHaveURL(`${environment.frontendOrigin}/patient-administration`);
    await expect(page.getByRole('heading', { name: '已进入患者施测模式' })).toBeVisible();
    await expect(page.getByText('设备准备完成', { exact: true })).toBeVisible();
    await expect(page.getByText('请在医护人员指导下继续', { exact: true })).toBeVisible();
    await expect(page.getByText('正式题目将在下一步操作中显示')).toBeVisible();
    await expect(page.getByText('工作台', { exact: true })).toHaveCount(0);
    await expect(page.getByText('患者档案', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('patient-administration-entry-code')).toHaveCount(0);

    const responseOnlyValues = [
      descriptor.scenario.patientId,
      descriptor.scenario.visitId,
      descriptor.scenario.scaleInstanceId,
      ...(typeof currentBody.currentStep?.patientText === 'string'
        ? [currentBody.currentStep.patientText]
        : []),
      ...(typeof currentBody.currentStep?.stepKey === 'string'
        ? [currentBody.currentStep.stepKey]
        : []),
      ...((currentBody.currentStep?.assets ?? [])
        .map(({ assetKey }) => assetKey)
        .filter((value): value is string => typeof value === 'string')),
    ];
    invariant(
      !(await bodyContainsAny(page, responseOnlyValues)),
      'Patient page rendered an internal identifier, step, or asset value',
    );

    const authAfterHandoff = await page.evaluate(async (backendOrigin) => {
      const response = await fetch(`${backendOrigin}/auth/me`, {
        cache: 'no-store',
        credentials: 'include',
      });
      return response.status;
    }, environment.backendOrigin);
    expect(authAfterHandoff).toBe(401);
    expect(await patientCookieMetadata(context, environment.backendOrigin)).toEqual([
      {
        name: 'cogmemory_ad_patient_session',
        domain: 'localhost',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        path: '/patient-administration',
      },
    ]);

    const storage = await auditRuntimeStorage(page);
    expect(storage.localStorageKeys).toEqual([]);
    expect(storage.sessionStorageKeys).toEqual([]);
    expect(storage.indexedDbNames).toEqual([]);
    expect(storage.forbiddenValueDetected).toBe(false);
    expect(storage.documentCookieEmpty).toBe(true);
    expect(storage.urlHasSensitiveQueryOrHash).toBe(false);
    assertNoGlobalHorizontalOverflow(
      await auditViewport(page, { width: 800, height: 1280 }),
    );
    expect((await runAccessibilityAudit(page)).violationCount).toBe(0);

    const backResponse = await page.goBack({ waitUntil: 'domcontentloaded' });
    invariant(backResponse !== null, 'Browser back navigation had no history entry');
    await expect(page).toHaveURL(`${environment.frontendOrigin}/login`);
    await expect(page.getByTestId('patient-administration-staff-panel')).toHaveCount(0);

    staff.ledger.assertNoAutomaticRetry({
      method: 'POST',
      safeUrlPattern: STAFF_ROOT_PATTERN,
    });
    staff.ledger.assertNoAutomaticRetry({
      method: 'POST',
      safeUrlPattern: PREPARATION_PATTERN,
    });
    staff.ledger.assertNoAutomaticRetry({
      method: 'POST',
      safeUrlPattern: HANDOFF_PATTERN,
    });
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: STAFF_ROOT_PATTERN }),
    ).toBe(1);
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: PREPARATION_PATTERN }),
    ).toBe(1);
    expect(
      staff.ledger.count({ method: 'POST', safeUrlPattern: HANDOFF_PATTERN }),
    ).toBe(1);
    assertNoF2F3Requests([staff.ledger]);
    const consoleSummary = staff.consoleAudit.stop();
    expect(consoleSummary.errorCount).toBe(0);
    expect(consoleSummary.pageErrorCount).toBe(0);
  });
});
