// backend/src/modules/auth/types/auth-response.types.ts

export type AuthUserResponse = {
  id: string;
  accountName: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  userType?: string;
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
