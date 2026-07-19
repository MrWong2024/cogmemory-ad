// backend/src/modules/auth/guards/session-auth.guard.spec.ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { SESSION_COOKIE_NAME } from '../auth.constants';
import { AuthService } from '../services/auth.service';
import type {
  AuthenticatedUserContext,
  RequestWithAuthenticatedUser,
} from '../types/auth-user-context.type';
import { SessionAuthGuard } from './session-auth.guard';

function createRequest(input: {
  cookieHeader?: string;
  cookies?: Record<string, string | undefined>;
}): RequestWithAuthenticatedUser {
  return {
    headers: {
      cookie: input.cookieHeader,
    },
    cookies: input.cookies,
  };
}

function createExecutionContext(
  request: RequestWithAuthenticatedUser,
): ExecutionContext {
  const handler = () => undefined;
  class TestController {}

  const context = new ExecutionContextHost([request], TestController, handler);
  context.setType('http');
  return context;
}

function createAuthenticatedUser(): AuthenticatedUserContext {
  return {
    id: 'USER-TEST-001',
    accountName: 'doctor-test-001',
    displayName: 'Doctor Test 001',
    roles: ['doctor'],
    permissions: ['assessment:read'],
    sessionId: 'SESSION-ID-TEST-001',
    userType: 'doctor',
  };
}

describe('SessionAuthGuard', () => {
  let guard: SessionAuthGuard;
  let reflector: {
    getAllAndOverride: jest.Mock;
  };
  let authService: {
    validateSessionToken: jest.Mock;
  };

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    authService = {
      validateSessionToken: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionAuthGuard,
        {
          provide: Reflector,
          useValue: reflector,
        },
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    guard = moduleRef.get(SessionAuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows public routes without checking cookies', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const request = createRequest({});

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).resolves.toBe(true);
    expect(authService.validateSessionToken).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when cookie is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const request = createRequest({});

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.validateSessionToken).not.toHaveBeenCalled();
  });

  it('reads cogmemory_ad_session from cookie-parser cookies and attaches req.user', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const authenticatedUser = createAuthenticatedUser();
    authService.validateSessionToken.mockResolvedValue(authenticatedUser);
    const request = createRequest({
      cookies: {
        [SESSION_COOKIE_NAME]: 'SESSION-TEST-COOKIE',
      },
    });

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).resolves.toBe(true);

    expect(authService.validateSessionToken).toHaveBeenCalledWith(
      'SESSION-TEST-COOKIE',
    );
    expect(request.user).toEqual(authenticatedUser);
  });

  it('parses cogmemory_ad_session from raw cookie header without cookie-parser', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const authenticatedUser = createAuthenticatedUser();
    authService.validateSessionToken.mockResolvedValue(authenticatedUser);
    const request = createRequest({
      cookieHeader:
        'theme=light; cogmemory_ad_session=SESSION-TEST-HEADER; other=value',
    });

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).resolves.toBe(true);

    expect(authService.validateSessionToken).toHaveBeenCalledWith(
      'SESSION-TEST-HEADER',
    );
    expect(request.user).toEqual(authenticatedUser);
  });

  it('throws UnauthorizedException when session validation fails', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.validateSessionToken.mockResolvedValue(null);
    const request = createRequest({
      cookieHeader: 'cogmemory_ad_session=SESSION-TEST-INVALID',
    });

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });
});
