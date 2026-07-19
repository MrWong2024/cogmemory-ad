// backend/src/modules/auth/guards/roles.guard.spec.ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import type {
  AuthenticatedUserContext,
  RequestWithAuthenticatedUser,
} from '../types/auth-user-context.type';
import { RolesGuard } from './roles.guard';

function createRequest(
  user?: AuthenticatedUserContext,
): RequestWithAuthenticatedUser {
  return {
    headers: {},
    user,
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

function createAuthenticatedUser(
  roles: string[] = ['doctor'],
): AuthenticatedUserContext {
  return {
    id: 'USER-TEST-001',
    accountName: 'doctor-test-001',
    displayName: 'Doctor Test 001',
    roles,
    permissions: ['assessment:read'],
    sessionId: 'SESSION-ID-TEST-001',
    userType: 'doctor',
  };
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: {
    getAllAndOverride: jest.Mock;
  };

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: reflector,
        },
      ],
    }).compile();

    guard = moduleRef.get(RolesGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests without required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const request = createRequest();

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
  });

  it('allows authenticated users with a required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['doctor']);
    const request = createRequest(createAuthenticatedUser(['doctor', 'nurse']));

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
  });

  it('throws ForbiddenException when authenticated user lacks required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const request = createRequest(createAuthenticatedUser(['doctor']));

    expect(() => guard.canActivate(createExecutionContext(request))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when request has no authenticated user', () => {
    reflector.getAllAndOverride.mockReturnValue(['doctor']);
    const request = createRequest();

    expect(() => guard.canActivate(createExecutionContext(request))).toThrow(
      ForbiddenException,
    );
  });
});
