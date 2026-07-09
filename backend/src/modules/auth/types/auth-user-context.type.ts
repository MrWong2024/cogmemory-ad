// backend/src/modules/auth/types/auth-user-context.type.ts
import type { IncomingHttpHeaders } from 'http';

export type AuthenticatedUserContext = {
  id: string;
  accountName: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  sessionId?: string;
  userType?: string;
};

export type RequestWithAuthenticatedUser = {
  headers: IncomingHttpHeaders;
  user?: AuthenticatedUserContext;
  cookies?: Record<string, string | undefined>;
};
