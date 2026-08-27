import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { AuthApiError, login } from '@/src/features/auth/api/auth-api';

async function expectLoginError(
  status: number,
  expectedCode: AuthApiError['code'],
): Promise<void> {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ statusCode: status }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    await expect(
      login({
        accountName: 'doctor-auth-contract-test',
        password: 'Auth-Contract-Test-Password!',
      }),
    ).rejects.toMatchObject({
      name: 'AuthApiError',
      code: expectedCode,
      status,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test.describe('auth login frontend contract', () => {
  test('maps 401, 429, and other errors to stable classifications', async () => {
    await expectLoginError(401, 'invalid_credentials');
    await expectLoginError(429, 'rate_limited');
    await expectLoginError(500, 'service_unavailable');
  });

  test('uses the dedicated rate-limit message without changing existing fallbacks', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/auth/components/LoginForm.tsx'),
      'utf8',
    );

    expect(source).toContain("error.code === 'rate_limited'");
    expect(source).toContain('登录尝试次数过多，请稍后再试。');
    expect(source).toContain('账号或密码错误，或账号不可用。');
    expect(source).toContain('暂时无法连接认证服务，请稍后再试。');
  });
});
