// backend/src/modules/auth/services/auth.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  UsersService,
  UserCredentialRecord,
  UserSummary,
} from '../../users/services/users.service';
import { Session, SessionSchema } from '../schemas/session.schema';
import { AuthService } from './auth.service';

type ExecQuery<T> = {
  exec: jest.Mock<Promise<T>, []>;
};

type SessionUpdateFilter = Record<string, unknown>;

type SessionUpdateOperation = {
  $set: {
    status: string;
    revokedAt: Date;
  };
};

type SessionUpdateResult = {
  modifiedCount: number;
};

function createExecQuery<T>(value: T): ExecQuery<T> {
  return {
    exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
  };
}

function createUserSummary(overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    id: new Types.ObjectId().toString(),
    accountName: 'doctor-test-001',
    displayName: 'Doctor Test 001',
    staffCode: 'STAFF-TEST-001',
    email: 'doctor-test-001@example.test',
    phone: 'PHONE-TEST-001',
    passwordChangedAt: new Date('2026-01-10T00:00:00.000Z'),
    roles: ['doctor'],
    permissions: ['assessment:read'],
    userType: 'doctor',
    status: 'active',
    department: 'Memory Clinic Test',
    organization: 'CogMemory Test Organization',
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    metadata: { source: 'unit-test' },
    ...overrides,
  };
}

function createCredentialRecord(
  overrides: Partial<UserCredentialRecord> = {},
): UserCredentialRecord {
  return {
    id: new Types.ObjectId().toString(),
    accountName: 'doctor-test-001',
    displayName: 'Doctor Test 001',
    passwordHash: 'scrypt:v1:salt-test:hash-test',
    passwordChangedAt: new Date('2026-01-10T00:00:00.000Z'),
    roles: ['doctor'],
    permissions: ['assessment:read'],
    userType: 'doctor',
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

function createSessionFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    sessionTokenHash: 'token-hash-test',
    status: 'active',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    lastSeenAt: null,
    rolesSnapshot: ['doctor'],
    permissionsSnapshot: ['assessment:read'],
    metadata: null,
    internalMarker: 'not returned',
    ...overrides,
  };
}

describe('Session schema', () => {
  it('defines collection and indexes', () => {
    expect(SessionSchema.get('collection')).toBe('sessions');
    expect(SessionSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ sessionTokenHash: 1 }, expect.objectContaining({ unique: true })],
        [{ userId: 1, status: 1 }, expect.any(Object)],
        [{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 0 })],
        [{ status: 1, updatedAt: -1 }, expect.any(Object)],
        [{ userId: 1, createdAt: -1 }, expect.any(Object)],
      ]),
    );
  });

  it('keeps sessionTokenHash excluded by default', () => {
    expect(SessionSchema.path('sessionTokenHash')?.options.select).toBe(false);
  });

  it('defines explicit ObjectId, primitive, Date and Mixed field types', () => {
    expect(SessionSchema.path('userId')?.instance).toBe('ObjectId');
    expect(SessionSchema.path('sessionTokenHash')?.instance).toBe('String');
    expect(SessionSchema.path('status')?.instance).toBe('String');
    expect(SessionSchema.path('expiresAt')?.instance).toBe('Date');
    expect(SessionSchema.path('revokedAt')?.instance).toBe('Date');
    expect(SessionSchema.path('lastSeenAt')?.instance).toBe('Date');
    expect(SessionSchema.path('userAgent')?.instance).toBe('String');
    expect(SessionSchema.path('ipAddress')?.instance).toBe('String');
    expect(SessionSchema.path('rolesSnapshot')?.instance).toBe('Array');
    expect(SessionSchema.path('permissionsSnapshot')?.instance).toBe('Array');
    expect(SessionSchema.path('metadata')?.instance).toBe('Mixed');
  });
});

describe('AuthService', () => {
  let service: AuthService;
  let sessionModel: {
    create: jest.Mock<
      Promise<Record<string, unknown>>,
      [Record<string, unknown>]
    >;
    findOne: jest.Mock;
    updateOne: jest.Mock<
      ExecQuery<SessionUpdateResult>,
      [SessionUpdateFilter, SessionUpdateOperation]
    >;
  };
  let usersService: {
    findUserById: jest.Mock;
    findUserCredentialByAccountName: jest.Mock;
  };

  beforeEach(async () => {
    sessionModel = {
      create: jest.fn<
        Promise<Record<string, unknown>>,
        [Record<string, unknown>]
      >(),
      findOne: jest.fn(),
      updateOne: jest.fn<
        ExecQuery<SessionUpdateResult>,
        [SessionUpdateFilter, SessionUpdateOperation]
      >(),
    };
    usersService = {
      findUserById: jest.fn(),
      findUserCredentialByAccountName: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getModelToken(Session.name),
          useValue: sessionModel,
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('hashes and verifies passwords without storing plaintext', async () => {
    const passwordHash = await service.hashPassword('plain-password-test');

    expect(passwordHash).toMatch(/^scrypt:v1:/);
    expect(passwordHash).not.toBe('plain-password-test');
    await expect(
      service.verifyPassword('plain-password-test', passwordHash),
    ).resolves.toBe(true);
    await expect(
      service.verifyPassword('wrong-password-test', passwordHash),
    ).resolves.toBe(false);
    await expect(
      service.verifyPassword('plain-password-test', 'damaged-hash'),
    ).resolves.toBe(false);
  });

  it('generates random session tokens and stable token hashes', () => {
    const firstToken = service.generateSessionToken();
    const secondToken = service.generateSessionToken();

    expect(firstToken).toEqual(expect.any(String));
    expect(firstToken.length).toBeGreaterThan(0);
    expect(secondToken).toEqual(expect.any(String));
    expect(secondToken).not.toBe(firstToken);
    expect(service.hashSessionToken('SESSION-TEST-001')).toBe(
      service.hashSessionToken('SESSION-TEST-001'),
    );
    expect(service.hashSessionToken('SESSION-TEST-001')).not.toBe(
      service.hashSessionToken('SESSION-TEST-002'),
    );
  });

  it('creates sessions with token hash instead of raw token', async () => {
    const userId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    const expiresAt = new Date(Date.now() + 60_000);
    usersService.findUserById.mockResolvedValue(
      createUserSummary({ id: userId.toString() }),
    );
    sessionModel.create.mockImplementation((input) =>
      Promise.resolve({
        _id: sessionId,
        expiresAt,
        ...input,
      }),
    );

    const result = await service.createSessionForUser({
      userId,
      expiresAt,
      userAgent: 'Unit Test Agent',
      ipAddress: '127.0.0.1',
      metadata: { source: 'unit-test' },
    });

    expect(result?.sessionId).toBe(sessionId.toString());
    expect(typeof result?.rawToken).toBe('string');
    expect(result?.rawToken.length).toBeGreaterThan(0);
    expect(result?.expiresAt).toBe(expiresAt);
    expect(result?.user).toEqual(
      expect.objectContaining({
        id: userId.toString(),
        accountName: 'doctor-test-001',
        roles: ['doctor'],
        permissions: ['assessment:read'],
        sessionId: sessionId.toString(),
      }),
    );
    expect(sessionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        sessionTokenHash: service.hashSessionToken(result?.rawToken ?? ''),
        status: 'active',
        expiresAt,
        revokedAt: null,
        lastSeenAt: null,
        userAgent: 'Unit Test Agent',
        ipAddress: '127.0.0.1',
        rolesSnapshot: ['doctor'],
        permissionsSnapshot: ['assessment:read'],
        metadata: { source: 'unit-test' },
      }),
    );
    expect(sessionModel.create.mock.calls[0][0]).not.toHaveProperty('rawToken');
    expect(result?.user).not.toHaveProperty('passwordHash');
    expect(result?.user).not.toHaveProperty('sessionTokenHash');
  });

  it('authenticates account and password, creates a session, and returns raw session token only for cookie use', async () => {
    const userId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    const passwordHash = await service.hashPassword('password-test-001');
    usersService.findUserCredentialByAccountName.mockResolvedValue(
      createCredentialRecord({
        id: userId.toString(),
        passwordHash,
      }),
    );
    usersService.findUserById.mockResolvedValue(
      createUserSummary({ id: userId.toString() }),
    );
    sessionModel.create.mockImplementation((input) =>
      Promise.resolve({
        _id: sessionId,
        ...input,
      }),
    );

    const result = await service.authenticateWithPassword({
      accountName: 'doctor-test-001',
      password: 'password-test-001',
      userAgent: 'Unit Test Agent',
      ipAddress: '127.0.0.1',
    });

    expect(usersService.findUserCredentialByAccountName).toHaveBeenCalledWith(
      'doctor-test-001',
    );
    expect(result?.rawSessionToken).toEqual(expect.any(String));
    expect(result?.rawSessionToken.length).toBeGreaterThan(0);
    expect(result?.expiresAt).toBeInstanceOf(Date);
    expect(result?.user).toEqual(
      expect.objectContaining({
        id: userId.toString(),
        accountName: 'doctor-test-001',
        displayName: 'Doctor Test 001',
        roles: ['doctor'],
        permissions: ['assessment:read'],
        sessionId: sessionId.toString(),
        userType: 'doctor',
      }),
    );
    expect(sessionModel.create.mock.calls[0][0]).not.toHaveProperty('rawToken');
    expect(sessionModel.create.mock.calls[0][0]).not.toHaveProperty(
      'rawSessionToken',
    );
    expect(sessionModel.create.mock.calls[0][0]).toHaveProperty(
      'sessionTokenHash',
      service.hashSessionToken(result?.rawSessionToken ?? ''),
    );
    expect(result?.user).not.toHaveProperty('passwordHash');
    expect(result?.user).not.toHaveProperty('sessionTokenHash');
    expect(result?.user).not.toHaveProperty('tokenHash');
  });

  it('returns null when authenticating an unknown account', async () => {
    usersService.findUserCredentialByAccountName.mockResolvedValue(null);

    await expect(
      service.authenticateWithPassword({
        accountName: 'doctor-test-001',
        password: 'password-test-001',
      }),
    ).resolves.toBeNull();
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it('returns null when authenticating with a wrong password', async () => {
    const passwordHash = await service.hashPassword('password-test-001');
    usersService.findUserCredentialByAccountName.mockResolvedValue(
      createCredentialRecord({ passwordHash }),
    );

    await expect(
      service.authenticateWithPassword({
        accountName: 'doctor-test-001',
        password: 'wrong-password-test',
      }),
    ).resolves.toBeNull();
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it('returns null when authenticating a non-active user', async () => {
    usersService.findUserCredentialByAccountName.mockResolvedValue(
      createCredentialRecord({ status: 'disabled' }),
    );

    await expect(
      service.authenticateWithPassword({
        accountName: 'doctor-test-001',
        password: 'password-test-001',
      }),
    ).resolves.toBeNull();
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it('returns null when validating a missing session token', async () => {
    sessionModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.validateSessionToken('SESSION-TEST-MISSING'),
    ).resolves.toBeNull();
    expect(sessionModel.findOne).toHaveBeenCalledWith({
      sessionTokenHash: service.hashSessionToken('SESSION-TEST-MISSING'),
      status: 'active',
    });
    expect(usersService.findUserById).not.toHaveBeenCalled();
  });

  it('returns null for revoked or expired sessions', async () => {
    sessionModel.findOne.mockReturnValue(
      createExecQuery(
        createSessionFixture({
          status: 'revoked',
          revokedAt: new Date(),
        }),
      ),
    );
    await expect(
      service.validateSessionToken('SESSION-TEST-REVOKED'),
    ).resolves.toBeNull();

    sessionModel.findOne.mockReturnValue(
      createExecQuery(
        createSessionFixture({
          expiresAt: new Date(Date.now() - 60_000),
        }),
      ),
    );
    await expect(
      service.validateSessionToken('SESSION-TEST-EXPIRED'),
    ).resolves.toBeNull();
    expect(usersService.findUserById).not.toHaveBeenCalled();
  });

  it('returns null when session user is missing or not active', async () => {
    const userId = new Types.ObjectId();
    sessionModel.findOne.mockReturnValue(
      createExecQuery(createSessionFixture({ userId })),
    );
    usersService.findUserById.mockResolvedValue(null);

    await expect(
      service.validateSessionToken('SESSION-TEST-NO-USER'),
    ).resolves.toBeNull();

    usersService.findUserById.mockResolvedValue(
      createUserSummary({ id: userId.toString(), status: 'disabled' }),
    );

    await expect(
      service.validateSessionToken('SESSION-TEST-DISABLED-USER'),
    ).resolves.toBeNull();
  });

  it('returns public authenticated context without sensitive fields', async () => {
    const userId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    sessionModel.findOne.mockReturnValue(
      createExecQuery(createSessionFixture({ _id: sessionId, userId })),
    );
    usersService.findUserById.mockResolvedValue(
      createUserSummary({
        id: userId.toString(),
        roles: ['doctor', 'research_assistant'],
        permissions: ['assessment:read', 'report:read'],
      }),
    );

    const result = await service.validateSessionToken('SESSION-TEST-VALID');

    expect(result).toEqual({
      id: userId.toString(),
      accountName: 'doctor-test-001',
      displayName: 'Doctor Test 001',
      roles: ['doctor', 'research_assistant'],
      permissions: ['assessment:read', 'report:read'],
      sessionId: sessionId.toString(),
      userType: 'doctor',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('rawToken');
    expect(result).not.toHaveProperty('sessionTokenHash');
    expect(result).not.toHaveProperty('tokenHash');
    expect(result).not.toHaveProperty('internalMarker');
  });

  it('revokes sessions by token hash', async () => {
    sessionModel.updateOne.mockReturnValue(
      createExecQuery({
        modifiedCount: 1,
      }),
    );

    await expect(
      service.revokeSessionByToken('SESSION-TEST-REVOKE'),
    ).resolves.toBe(true);
    const updateCall = sessionModel.updateOne.mock.calls[0];

    expect(updateCall[0]).toEqual({
      sessionTokenHash: service.hashSessionToken('SESSION-TEST-REVOKE'),
      status: 'active',
    });
    expect(updateCall[1]).toEqual({
      $set: {
        status: 'revoked',
        revokedAt: updateCall[1].$set.revokedAt,
      },
    });
    expect(updateCall[1].$set.revokedAt).toBeInstanceOf(Date);
  });
});
