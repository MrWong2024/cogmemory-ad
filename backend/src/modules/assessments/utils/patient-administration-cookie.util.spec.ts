import {
  PATIENT_ADMINISTRATION_COOKIE_PATH,
  PATIENT_ADMINISTRATION_SESSION_TTL_MS,
} from '../patient-administration.constants';
import {
  buildClearPatientAdministrationCookieOptions,
  buildPatientAdministrationCookieOptions,
} from './patient-administration-cookie.util';

describe('patient administration cookie utility', () => {
  const now = new Date('2026-08-06T01:00:00.000Z');

  it.each([false, true])(
    'builds the exact patient cookie contract when secure=%s',
    (secure) => {
      const options = buildPatientAdministrationCookieOptions(
        secure,
        new Date(now.getTime() + 30_000),
        now,
      );

      expect(options).toEqual({
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: PATIENT_ADMINISTRATION_COOKIE_PATH,
        maxAge: 30_000,
      });
      expect(options).not.toHaveProperty('domain');
      expect(options).not.toHaveProperty('expires');
    },
  );

  it('caps maxAge at the absolute two-hour contract', () => {
    const options = buildPatientAdministrationCookieOptions(
      false,
      new Date(now.getTime() + PATIENT_ADMINISTRATION_SESSION_TTL_MS * 2),
      now,
    );
    expect(options.maxAge).toBe(PATIENT_ADMINISTRATION_SESSION_TTL_MS);
  });

  it('rejects non-positive remaining lifetime', () => {
    expect(() =>
      buildPatientAdministrationCookieOptions(false, now, now),
    ).toThrow(RangeError);
  });

  it.each([false, true])(
    'builds matching clear options when secure=%s',
    (secure) => {
      expect(buildClearPatientAdministrationCookieOptions(secure)).toEqual({
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: PATIENT_ADMINISTRATION_COOKIE_PATH,
      });
    },
  );
});
