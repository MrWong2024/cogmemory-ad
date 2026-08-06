import type { CookieOptions } from 'express';
import {
  PATIENT_ADMINISTRATION_COOKIE_PATH,
  PATIENT_ADMINISTRATION_COOKIE_SAME_SITE,
  PATIENT_ADMINISTRATION_SESSION_TTL_MS,
} from '../patient-administration.constants';

export function buildPatientAdministrationCookieOptions(
  secure: boolean,
  expiresAt: Date,
  now = new Date(),
): CookieOptions {
  const remainingMs = expiresAt.getTime() - now.getTime();
  const maxAge = Math.min(PATIENT_ADMINISTRATION_SESSION_TTL_MS, remainingMs);

  if (!Number.isFinite(maxAge) || maxAge <= 0) {
    throw new RangeError(
      'Patient administration cookie must have a future expiry',
    );
  }

  return {
    httpOnly: true,
    sameSite: PATIENT_ADMINISTRATION_COOKIE_SAME_SITE,
    secure,
    path: PATIENT_ADMINISTRATION_COOKIE_PATH,
    maxAge,
  };
}

export function buildClearPatientAdministrationCookieOptions(
  secure: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: PATIENT_ADMINISTRATION_COOKIE_SAME_SITE,
    secure,
    path: PATIENT_ADMINISTRATION_COOKIE_PATH,
  };
}
