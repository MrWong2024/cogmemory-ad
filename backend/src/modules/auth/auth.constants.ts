// backend/src/modules/auth/auth.constants.ts
export const SESSION_COOKIE_NAME = 'cogmemory_ad_session';
export const SESSION_COOKIE_PATH = '/';
export const SESSION_COOKIE_SAME_SITE = 'lax';
export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const AUTH_LOGIN_FAILURE_WINDOW_MS = 60 * 1000;
export const AUTH_LOGIN_MAX_FAILURES = 10;
export const AUTH_LOGIN_RATE_LIMIT_CODE = 'AUTH_LOGIN_RATE_LIMITED';
export const AUTH_LOGIN_RATE_LIMIT_MESSAGE =
  'Too many login attempts. Please try again later.';
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
