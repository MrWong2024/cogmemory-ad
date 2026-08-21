import type { Request, Response } from '@playwright/test';

import { expect, test } from '../support/acceptance-test';
import {
  PATIENT_SESSION_COOKIE,
  assertBrowserAudit,
  assertClientCredentialBoundary,
  assertCookieMetadata,
  assertNoFormalAnswerRequests,
  completeRequiredPreparation,
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

test.describe('patient administration handoff: same device', () => {
  test.skip(!environment, 'Explicit live Browser acceptance environment required');

  test('establishes, reloads, prepares, and hands off one same-device session', async ({
    roleContexts,
  }) => {
    invariant(environment, 'Live Browser acceptance environment is unavailable');
    const descriptor = await readHandoffDescriptor('same-device');
    const staff = await loginStaff({
      factory: roleContexts,
      descriptor,
      environment,
      syntheticMicrophone: true,
    });
    const { context, page } = staff.roleContext;
    try {
      await openExecution({ page, descriptor, environment });
      await page.getByRole('radio', { name: /同一设备/ }).check();
      const createResponsePromise = waitForPost(page, '/patient-administration');
      await page
        .getByRole('button', {
          name: '创建患者施测会话',
          exact: true,
        })
        .click();
      const createResponse = await createResponsePromise;
      expect(createResponse.status()).toBe(201);
      assertCreateRequest(createResponse.request());
      const created = await safeSessionBody(createResponse);
      invariant(
        created.deviceMode === 'same_device' &&
          created.status === 'prepared' &&
          created.entryCode === null,
        'Same-device create response did not preserve the selected mode',
      );
      await assertNoCrossDeviceControls(page);

      const reloadResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            staffAdministrationPath(descriptor) &&
          response.request().method() === 'GET',
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      const reloaded = await safeSessionBody(await reloadResponsePromise);
      invariant(
        reloaded.deviceMode === 'same_device' &&
          reloaded.status === 'prepared',
        'Reload did not restore same-device mode from the server',
      );
      await expect(
        page.getByTestId('patient-administration-staff-panel'),
      ).toBeVisible();
      await assertNoCrossDeviceControls(page);

      await completeRequiredPreparation(page);
      const preparationButton = page.getByRole('button', {
        name: '确认准备与影响因素',
        exact: true,
      });
      await expect(preparationButton).toBeEnabled();
      const preparationResponsePromise = waitForPost(
        page,
        '/preparation/confirm',
      );
      await preparationButton.click();
      const prepared = await safeSessionBody(await preparationResponsePromise);
      invariant(
        prepared.deviceMode === 'same_device' &&
          prepared.status === 'prepared',
        'Preparation confirmation changed the same-device contract',
      );

      await page
        .getByRole('checkbox', {
          name: /我已确认设备将立即交给患者/,
        })
        .check();
      const handoffResponsePromise = waitForPost(page, '/handoff');
      const patientCurrentPromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            '/patient-administration/current' &&
          response.request().method() === 'GET' &&
          response.status() === 200,
      );
      await page
        .getByRole('button', { name: '安全交接给患者', exact: true })
        .click();
      const [handoffResponse, patientCurrentResponse] = await Promise.all([
        handoffResponsePromise,
        patientCurrentPromise,
      ]);
      expect(handoffResponse.status()).toBe(200);
      const patientCurrent = await safeSessionBody(patientCurrentResponse);
      invariant(
        patientCurrent.status === 'active',
        'Patient route did not restore the active same-device session',
      );
      await expect(page).toHaveURL(
        `${environment.frontendOrigin}/patient-administration`,
      );
      await expect(
        page.getByRole('heading', { name: '已进入患者施测模式' }),
      ).toBeVisible();
      await assertCookieMetadata(context, [PATIENT_SESSION_COOKIE]);
      expect(
        (await context.request.get(`${environment.backendOrigin}/auth/me`)).status(),
      ).toBe(401);
      await assertClientCredentialBoundary({ page });
      await expect(
        page.getByTestId('patient-administration-entry-code'),
      ).toHaveCount(0);
      assertNoFormalAnswerRequests([staff.ledger]);
      assertBrowserAudit([staff], [
        {
          method: 'GET',
          status: 401,
          safeUrlPattern: '/auth/me',
        },
      ]);
    } finally {
      await detachBrowserAudit(staff);
    }
  });
});

function assertCreateRequest(request: Request): void {
  const body = request.postDataJSON() as Record<string, unknown>;
  invariant(
    Object.keys(body).length === 1 && body.deviceMode === 'same_device',
    'Same-device create request body is invalid',
  );
}

async function safeSessionBody(response: Response): Promise<{
  deviceMode?: unknown;
  status?: unknown;
  entryCode?: unknown;
}> {
  const value = (await response.json()) as Record<string, unknown>;
  return {
    deviceMode: value.deviceMode,
    status: value.status,
    entryCode: value.entryCode,
  };
}

async function assertNoCrossDeviceControls(
  page: import('@playwright/test').Page,
): Promise<void> {
  await expect(
    page.getByTestId('patient-administration-entry-code'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '重新签发进入码', exact: true }),
  ).toHaveCount(0);
}
