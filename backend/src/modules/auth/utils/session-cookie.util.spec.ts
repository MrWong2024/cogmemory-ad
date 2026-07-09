// backend/src/modules/auth/utils/session-cookie.util.spec.ts
import { DEFAULT_SESSION_TTL_MS, SESSION_COOKIE_NAME } from '../auth.constants';
import {
  buildClearSessionCookieOptions,
  buildSessionCookieOptions,
  readCookieValue,
  readSessionTokenFromRequest,
} from './session-cookie.util';

describe('session-cookie.util', () => {
  it('reads session token from parsed cookies', () => {
    expect(
      readSessionTokenFromRequest({
        cookies: {
          [SESSION_COOKIE_NAME]: 'SESSION-TEST-COOKIE',
        },
      }),
    ).toBe('SESSION-TEST-COOKIE');
  });

  it('reads and decodes session token from raw cookie header', () => {
    expect(
      readSessionTokenFromRequest({
        headers: {
          cookie: 'theme=light; cogmemory_ad_session=SESSION-TEST-HEADER%2D001',
        },
      }),
    ).toBe('SESSION-TEST-HEADER-001');
  });

  it('returns null for missing or malformed cookie values', () => {
    expect(
      readCookieValue(
        {
          headers: {
            cookie: 'theme=light',
          },
        },
        SESSION_COOKIE_NAME,
      ),
    ).toBeNull();
    expect(
      readCookieValue(
        {
          headers: {
            cookie: 'cogmemory_ad_session=%E0%A4%A',
          },
        },
        SESSION_COOKIE_NAME,
      ),
    ).toBeNull();
  });

  it('builds session cookie options with secure controlled by runtime', () => {
    expect(buildSessionCookieOptions(false, DEFAULT_SESSION_TTL_MS)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: DEFAULT_SESSION_TTL_MS,
    });
    expect(buildClearSessionCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  });
});
