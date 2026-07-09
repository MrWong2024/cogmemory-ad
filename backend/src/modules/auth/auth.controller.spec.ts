// backend/src/modules/auth/auth.controller.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_SESSION_TTL_MS, SESSION_COOKIE_NAME } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import type { AuthenticatedUserContext } from './types/auth-user-context.type';
import type { AuthUserResponse } from './types/auth-response.types';
import type {
  CookieLikeRequest,
  SessionCookieResponse,
} from './utils/session-cookie.util';

function createAuthenticatedUser(
  overrides: Partial<AuthenticatedUserContext> = {},
): AuthenticatedUserContext {
  return {
    id: 'USER-TEST-001',
    accountName: 'doctor-test-001',
    displayName: 'Doctor Test 001',
    roles: ['doctor'],
    permissions: ['assessment:read'],
    sessionId: 'SESSION-ID-TEST-001',
    userType: 'doctor',
    ...overrides,
  };
}

function createAuthUserResponse(
  overrides: Partial<AuthUserResponse> = {},
): AuthUserResponse {
  return {
    id: 'USER-TEST-001',
    accountName: 'doctor-test-001',
    displayName: 'Doctor Test 001',
    roles: ['doctor'],
    permissions: ['assessment:read'],
    userType: 'doctor',
    ...overrides,
  };
}

function createCookieResponse(): jest.Mocked<SessionCookieResponse> {
  return {
    cookie: jest.fn<void, Parameters<SessionCookieResponse['cookie']>>(),
    clearCookie: jest.fn<
      void,
      Parameters<SessionCookieResponse['clearCookie']>
    >(),
  };
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<
    Pick<
      AuthService,
      'authenticateWithPassword' | 'revokeSessionByToken' | 'toAuthUserResponse'
    >
  >;

  beforeEach(async () => {
    authService = {
      authenticateWithPassword: jest.fn(),
      revokeSessionByToken: jest.fn(),
      toAuthUserResponse: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  it('logs in, sets HttpOnly session cookie, and returns public user response', async () => {
    const user = createAuthenticatedUser();
    const userResponse = createAuthUserResponse();
    authService.authenticateWithPassword.mockResolvedValue({
      user,
      rawSessionToken: 'SESSION-TEST-LOGIN',
      expiresAt: new Date(Date.now() + DEFAULT_SESSION_TTL_MS),
    });
    authService.toAuthUserResponse.mockReturnValue(userResponse);
    const response = createCookieResponse();
    const request: CookieLikeRequest = {
      headers: {
        'user-agent': 'Unit Test Agent',
      },
      ip: '127.0.0.1',
    };

    const result = await controller.login(
      {
        accountName: 'doctor-test-001',
        password: 'password-test-001',
      },
      request,
      response,
    );

    expect(authService.authenticateWithPassword).toHaveBeenCalledWith({
      accountName: 'doctor-test-001',
      password: 'password-test-001',
      userAgent: 'Unit Test Agent',
      ipAddress: '127.0.0.1',
    });
    expect(response.cookie.mock.calls).toHaveLength(1);
    expect(response.cookie.mock.calls[0]).toEqual([
      SESSION_COOKIE_NAME,
      'SESSION-TEST-LOGIN',
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: DEFAULT_SESSION_TTL_MS,
      },
    ]);
    expect(result).toEqual({
      authenticated: true,
      user: userResponse,
    });
    expect(result).not.toHaveProperty('rawSessionToken');
    expect(result).not.toHaveProperty('rawToken');
    expect(result).not.toHaveProperty('sessionTokenHash');
    expect(result).not.toHaveProperty('tokenHash');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('sessionId');
    expect(result.user).not.toHaveProperty('secret');
    expect(result.user).not.toHaveProperty('credential');
  });

  it('throws UnauthorizedException without setting cookie when login fails', async () => {
    authService.authenticateWithPassword.mockResolvedValue(null);
    const response = createCookieResponse();

    await expect(
      controller.login(
        {
          accountName: 'doctor-test-001',
          password: 'wrong-password-test',
        },
        {
          headers: {},
        },
        response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(response.cookie.mock.calls).toHaveLength(0);
  });

  it('revokes session from cookie and clears cookie on logout', async () => {
    authService.revokeSessionByToken.mockResolvedValue(true);
    const response = createCookieResponse();

    const result = await controller.logout(
      {
        cookies: {
          [SESSION_COOKIE_NAME]: 'SESSION-TEST-LOGOUT',
        },
        headers: {},
      },
      response,
    );

    expect(authService.revokeSessionByToken).toHaveBeenCalledWith(
      'SESSION-TEST-LOGOUT',
    );
    expect(response.clearCookie.mock.calls).toHaveLength(1);
    expect(response.clearCookie.mock.calls[0]).toEqual([
      SESSION_COOKIE_NAME,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      },
    ]);
    expect(result).toEqual({ ok: true, authenticated: false });
  });

  it('clears cookie and returns success when logout has no cookie', async () => {
    const response = createCookieResponse();

    const result = await controller.logout(
      {
        headers: {},
      },
      response,
    );

    expect(authService.revokeSessionByToken).not.toHaveBeenCalled();
    expect(response.clearCookie.mock.calls).toHaveLength(1);
    expect(response.clearCookie.mock.calls[0]).toEqual([
      SESSION_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      }),
    ]);
    expect(result).toEqual({ ok: true, authenticated: false });
  });

  it('returns current public user from authenticated context', () => {
    const user = createAuthenticatedUser({
      roles: ['doctor', 'research_assistant'],
      permissions: ['assessment:read', 'report:read'],
    });
    const userResponse = createAuthUserResponse({
      roles: ['doctor', 'research_assistant'],
      permissions: ['assessment:read', 'report:read'],
    });
    authService.toAuthUserResponse.mockReturnValue(userResponse);

    const result = controller.getMe(user);

    expect(result).toEqual({
      authenticated: true,
      user: userResponse,
    });
    expect(result).not.toHaveProperty('rawSessionToken');
    expect(result).not.toHaveProperty('sessionTokenHash');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('sessionId');
  });
});
