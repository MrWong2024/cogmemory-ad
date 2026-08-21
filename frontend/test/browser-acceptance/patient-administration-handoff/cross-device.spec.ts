import type { BrowserContext, Request, Response } from '@playwright/test';

import { expect, test } from '../support/acceptance-test';
import {
  PATIENT_SESSION_COOKIE,
  STAFF_SESSION_COOKIE,
  assertBrowserAudit,
  assertClientCredentialBoundary,
  assertCookieMetadata,
  assertNoFormalAnswerRequests,
  attachBrowserAudit,
  detachBrowserAudit,
  invariant,
  loginStaff,
  openExecution,
  readHandoffDescriptor,
  resolveHandoffEnvironment,
  staffAdministrationPath,
  waitForPost,
} from './support/handoff-profile-support';

const environment = resolveHandoffEnvironment();

test.describe('patient administration handoff: cross device', () => {
  test.skip(!environment, 'Explicit live Browser acceptance environment required');

  test('creates, redeems, reloads, and reissues across isolated contexts', async ({
    browser,
    roleContexts,
  }) => {
    invariant(environment, 'Live Browser acceptance environment is unavailable');
    const descriptor = await readHandoffDescriptor('cross-device');
    const staff = await loginStaff({
      factory: roleContexts,
      descriptor,
      environment,
    });
    const staffPage = staff.roleContext.page;
    let patientContext: BrowserContext | null = null;
    let patientAudit: Awaited<ReturnType<typeof attachBrowserAudit>> | null = null;
    try {
      await openExecution({ page: staffPage, descriptor, environment });
      await staffPage.getByRole('radio', { name: /跨设备/ }).check();
      const createResponsePromise = waitForPost(
        staffPage,
        '/patient-administration',
      );
      await staffPage
        .getByRole('button', {
          name: '创建患者施测会话',
          exact: true,
        })
        .click();
      const createResponse = await createResponsePromise;
      expect(createResponse.status()).toBe(201);
      assertCreateRequest(createResponse.request());
      const created = await readCredentialResponse(createResponse);
      invariant(
        created.deviceMode === 'cross_device' &&
          created.status === 'prepared' &&
          isEntryCode(created.entryCode),
        'Cross-device create response is invalid',
      );
      const firstCode = created.entryCode;
      const visibleFirstCode = await staffPage
        .getByTestId('patient-administration-entry-code')
        .textContent();
      invariant(
        visibleFirstCode?.trim() === firstCode,
        'The current cross-device entry credential was not rendered',
      );
      await assertClientCredentialBoundary({
        page: staffPage,
        forbiddenValues: [firstCode],
      });

      patientContext = await browser.newContext({
        viewport: { width: 1100, height: 760 },
      });
      const patientPage = await patientContext.newPage();
      patientAudit = await attachBrowserAudit(patientPage);
      await patientPage.goto(
        `${environment.frontendOrigin}/patient-administration/enter`,
        { waitUntil: 'domcontentloaded' },
      );
      await patientPage.getByLabel('六位数字进入码').fill(firstCode);
      const enterResponsePromise = waitForPost(
        patientPage,
        '/patient-administration/enter',
      );
      await patientPage
        .getByRole('button', { name: '进入患者施测', exact: true })
        .click();
      const enterResponse = await enterResponsePromise;
      expect(enterResponse.status()).toBe(200);
      await expect(patientPage).toHaveURL(
        `${environment.frontendOrigin}/patient-administration`,
      );
      await assertCookieMetadata(
        staff.roleContext.context,
        [STAFF_SESSION_COOKIE],
      );
      await assertCookieMetadata(patientContext, [PATIENT_SESSION_COOKIE]);
      expect(
        (
          await staff.roleContext.context.request.get(
            `${environment.backendOrigin}/auth/me`,
          )
        ).status(),
      ).toBe(200);
      expect(
        (
          await patientContext.request.get(
            `${environment.backendOrigin}/patient-administration/current`,
          )
        ).status(),
      ).toBe(200);
      await assertClientCredentialBoundary({
        page: patientPage,
        forbiddenValues: [firstCode],
        forbidBodyValues: true,
      });

      const reloadResponsePromise = staffPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            staffAdministrationPath(descriptor) &&
          response.request().method() === 'GET',
      );
      await staffPage.reload({ waitUntil: 'domcontentloaded' });
      const restored = await readCredentialResponse(
        await reloadResponsePromise,
      );
      invariant(
        restored.deviceMode === 'cross_device' &&
          restored.status === 'prepared' &&
          restored.hasPatientCredential === true,
        'Reload did not restore cross-device mode and identity state from the server',
      );
      await expect(
        staffPage.getByTestId('patient-administration-entry-code'),
      ).toHaveCount(0);

      await staffPage
        .getByLabel('重新签发原因（必填，最多 500 字）')
        .fill('当前测试验证正式重新签发入口');
      await staffPage
        .getByRole('checkbox', { name: /我确认原患者设备将退出/ })
        .check();
      const reissueResponsePromise = waitForPost(
        staffPage,
        '/entry-code/reissue',
      );
      await staffPage
        .getByRole('button', { name: '重新签发进入码', exact: true })
        .click();
      const reissueResponse = await reissueResponsePromise;
      expect(reissueResponse.status()).toBe(200);
      const reissued = await readCredentialResponse(reissueResponse);
      invariant(
        reissued.deviceMode === 'cross_device' &&
          reissued.status === 'prepared' &&
          isEntryCode(reissued.entryCode) &&
          reissued.entryCode !== firstCode,
        'Cross-device reissue did not return a fresh rendered credential',
      );
      const secondCode = reissued.entryCode;
      const visibleSecondCode = await staffPage
        .getByTestId('patient-administration-entry-code')
        .textContent();
      invariant(
        visibleSecondCode?.trim() === secondCode,
        'The reissued cross-device credential was not rendered',
      );
      await assertClientCredentialBoundary({
        page: staffPage,
        forbiddenValues: [firstCode, secondCode],
      });
      expect(
        (
          await patientContext.request.get(
            `${environment.backendOrigin}/patient-administration/current`,
          )
        ).status(),
      ).toBe(401);
      expect(
        (
          await staff.roleContext.context.request.get(
            `${environment.backendOrigin}/auth/me`,
          )
        ).status(),
      ).toBe(200);
      assertNoFormalAnswerRequests([staff.ledger, patientAudit.ledger]);
      assertBrowserAudit([staff, patientAudit], [
        {
          method: 'GET',
          status: 404,
          safeUrlPattern:
            '/patients/<id>/visits/<id>/scale-instances/<id>/patient-administration',
        },
        {
          method: 'GET',
          status: 401,
          safeUrlPattern: '/auth/me',
        },
        {
          method: 'GET',
          status: 401,
          safeUrlPattern: '/patient-administration/current',
        },
      ]);
    } finally {
      if (patientAudit) await detachBrowserAudit(patientAudit);
      if (patientContext) await patientContext.close();
      await detachBrowserAudit(staff);
    }
  });
});

function assertCreateRequest(request: Request): void {
  const body = request.postDataJSON() as Record<string, unknown>;
  invariant(
    Object.keys(body).length === 1 && body.deviceMode === 'cross_device',
    'Cross-device create request body is invalid',
  );
}

function isEntryCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}

async function readCredentialResponse(response: Response): Promise<{
  deviceMode?: unknown;
  status?: unknown;
  entryCode?: unknown;
  hasPatientCredential?: unknown;
}> {
  const value = (await response.json()) as Record<string, unknown>;
  return {
    deviceMode: value.deviceMode,
    status: value.status,
    entryCode: value.entryCode,
    hasPatientCredential: value.hasPatientCredential,
  };
}
