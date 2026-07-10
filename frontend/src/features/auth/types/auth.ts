// frontend/src/features/auth/types/auth.ts
export type AuthUserResponse = {
  id: string;
  accountName: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  userType?: string;
};

export type AuthUser = AuthUserResponse;

export type LoginRequest = {
  accountName: string;
  password: string;
};

export type LoginResponse = {
  authenticated: true;
  user: AuthUserResponse;
};

export type MeResponse = {
  authenticated: true;
  user: AuthUserResponse;
};

export type LogoutResponse = {
  authenticated: false;
  ok: true;
};

export type AuthState = {
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'error';
  user: AuthUser | null;
  error?: string | null;
};
