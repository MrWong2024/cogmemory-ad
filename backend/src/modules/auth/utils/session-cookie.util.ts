// backend/src/modules/auth/utils/session-cookie.util.ts
import type { CookieOptions } from 'express';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  SESSION_COOKIE_SAME_SITE,
} from '../auth.constants';

export type CookieLikeHeaders = {
  cookie?: string | string[];
  'user-agent'?: string | string[];
};

export type CookieLikeRequest = {
  cookies?: Record<string, string | undefined>;
  headers?: CookieLikeHeaders;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
};

export type SessionCookieResponse = {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: CookieOptions): void;
};

export function readCookieValue(
  request: CookieLikeRequest,
  cookieName: string,
): string | null {
  const parsedCookieValue = request.cookies?.[cookieName];

  if (typeof parsedCookieValue === 'string') {
    return decodeCookieValue(parsedCookieValue);
  }

  const cookieHeader = request.headers?.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookieHeaders = Array.isArray(cookieHeader)
    ? cookieHeader
    : [cookieHeader];

  for (const header of cookieHeaders) {
    const value = readCookieValueFromHeader(header, cookieName);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function readSessionTokenFromRequest(
  request: CookieLikeRequest,
): string | null {
  return readCookieValue(request, SESSION_COOKIE_NAME);
}

export function buildSessionCookieOptions(
  isProduction: boolean,
  maxAgeMs: number,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: SESSION_COOKIE_SAME_SITE,
    secure: isProduction,
    path: SESSION_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

export function buildClearSessionCookieOptions(
  isProduction: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: SESSION_COOKIE_SAME_SITE,
    secure: isProduction,
    path: SESSION_COOKIE_PATH,
  };
}

function readCookieValueFromHeader(
  cookieHeader: string,
  cookieName: string,
): string | null {
  const entries = cookieHeader.split(';');

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = entry.slice(0, separatorIndex).trim();

    if (key !== cookieName) {
      continue;
    }

    const rawValue = entry.slice(separatorIndex + 1).trim();

    return decodeCookieValue(rawValue);
  }

  return null;
}

function decodeCookieValue(value: string): string | null {
  try {
    const decodedValue = decodeURIComponent(value);
    return decodedValue.trim() ? decodedValue : null;
  } catch {
    return null;
  }
}
