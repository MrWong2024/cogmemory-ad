// frontend/src/features/auth/api/auth-api.ts
import { frontendEnv } from '@/src/lib/env';

import type {
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  MeResponse,
} from '@/src/features/auth/types/auth';

export type AuthApiErrorCode =
  | 'invalid_credentials'
  | 'service_unavailable';

export class AuthApiError extends Error {
  constructor(
    readonly code: AuthApiErrorCode,
    readonly status?: number,
  ) {
    super(
      code === 'invalid_credentials'
        ? 'Authentication failed.'
        : 'Authentication service unavailable.',
    );
    this.name = 'AuthApiError';
  }
}

function buildAuthUrl(path: string): string {
  return `${frontendEnv.apiBaseUrl.replace(/\/+$/, '')}${path}`;
}

async function authFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(buildAuthUrl(path), {
      ...init,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new AuthApiError('service_unavailable');
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new AuthApiError('service_unavailable', response.status);
  }
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  const response = await authFetch('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (response.status === 401) {
    throw new AuthApiError('invalid_credentials', response.status);
  }

  if (!response.ok) {
    throw new AuthApiError('service_unavailable', response.status);
  }

  return readJson<LoginResponse>(response);
}

export async function logout(): Promise<LogoutResponse> {
  const response = await authFetch('/auth/logout', {
    method: 'POST',
  });

  if (!response.ok) {
    throw new AuthApiError('service_unavailable', response.status);
  }

  return readJson<LogoutResponse>(response);
}

export async function getMe(): Promise<MeResponse | null> {
  const response = await authFetch('/auth/me', {
    method: 'GET',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new AuthApiError('service_unavailable', response.status);
  }

  return readJson<MeResponse>(response);
}
