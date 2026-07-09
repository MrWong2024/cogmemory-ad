// backend/src/modules/users/services/users.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { User, UserSchema } from '../schemas/user.schema';
import { UsersService } from './users.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createUserFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    accountName: 'doctor-test-001',
    displayName: 'Doctor Test 001',
    staffCode: 'STAFF-TEST-001',
    email: 'doctor-test-001@example.test',
    phone: 'PHONE-TEST-001',
    passwordHash: 'scrypt:v1:salt-test:hash-test',
    passwordChangedAt: new Date('2026-01-10T00:00:00.000Z'),
    roles: ['doctor'],
    permissions: ['assessment:read'],
    userType: 'doctor',
    status: 'active',
    department: 'Memory Clinic Test',
    organization: 'CogMemory Test Organization',
    lastLoginAt: new Date('2026-01-10T01:00:00.000Z'),
    failedLoginCount: 1,
    lockedUntil: null,
    metadata: { source: 'unit-test' },
    internalMarker: 'not returned',
    ...overrides,
  };
}

describe('User schema', () => {
  it('defines collection and indexes', () => {
    expect(UserSchema.get('collection')).toBe('users');
    expect(UserSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ accountName: 1 }, expect.objectContaining({ unique: true })],
        [
          { staffCode: 1 },
          expect.objectContaining({ unique: true, sparse: true }),
        ],
        [{ email: 1 }, expect.objectContaining({ unique: true, sparse: true })],
        [{ phone: 1 }, expect.objectContaining({ sparse: true })],
        [{ status: 1, accountName: 1 }, expect.any(Object)],
        [{ roles: 1, status: 1 }, expect.any(Object)],
        [{ userType: 1, status: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('keeps passwordHash excluded by default', () => {
    expect(UserSchema.path('passwordHash')?.options.select).toBe(false);
  });

  it('defines explicit primitive, nullable and Mixed field types', () => {
    expect(UserSchema.path('accountName')?.instance).toBe('String');
    expect(UserSchema.path('displayName')?.instance).toBe('String');
    expect(UserSchema.path('staffCode')?.instance).toBe('String');
    expect(UserSchema.path('email')?.instance).toBe('String');
    expect(UserSchema.path('phone')?.instance).toBe('String');
    expect(UserSchema.path('passwordHash')?.instance).toBe('String');
    expect(UserSchema.path('passwordChangedAt')?.instance).toBe('Date');
    expect(UserSchema.path('roles')?.instance).toBe('Array');
    expect(UserSchema.path('permissions')?.instance).toBe('Array');
    expect(UserSchema.path('userType')?.instance).toBe('String');
    expect(UserSchema.path('status')?.instance).toBe('String');
    expect(UserSchema.path('lastLoginAt')?.instance).toBe('Date');
    expect(UserSchema.path('failedLoginCount')?.instance).toBe('Number');
    expect(UserSchema.path('lockedUntil')?.instance).toBe('Date');
    expect(UserSchema.path('metadata')?.instance).toBe('Mixed');
  });
});

describe('UsersService', () => {
  let service: UsersService;
  let userModel: {
    findOne: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    userModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes account identifiers', () => {
    expect(service.normalizeAccountName('  Doctor-Test-001  ')).toBe(
      'doctor-test-001',
    );
    expect(service.normalizeEmail('  Doctor-Test-001@Example.Test  ')).toBe(
      'doctor-test-001@example.test',
    );
    expect(service.normalizeStaffCode('  staff-test-001  ')).toBe(
      'STAFF-TEST-001',
    );
  });

  it('returns null when user id is invalid or not found', async () => {
    await expect(service.findUserById('not-object-id')).resolves.toBeNull();
    expect(userModel.findOne).not.toHaveBeenCalled();

    const userId = new Types.ObjectId();
    userModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(service.findUserById(userId)).resolves.toBeNull();
    expect(userModel.findOne).toHaveBeenCalledWith({ _id: userId });
  });

  it('returns null when account name is empty or user is not found', async () => {
    await expect(service.findUserByAccountName('   ')).resolves.toBeNull();
    expect(userModel.findOne).not.toHaveBeenCalled();

    userModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findUserByAccountName('DOCTOR-UNKNOWN-001'),
    ).resolves.toBeNull();
    expect(userModel.findOne).toHaveBeenCalledWith({
      accountName: 'doctor-unknown-001',
    });
  });

  it('maps user output without passwordHash or raw document markers', async () => {
    const userId = new Types.ObjectId();
    const passwordChangedAt = new Date('2026-01-10T00:00:00.000Z');
    const lastLoginAt = new Date('2026-01-10T01:00:00.000Z');
    const rawUser = createUserFixture({
      _id: userId,
      passwordChangedAt,
      lastLoginAt,
    });
    userModel.findOne.mockReturnValue(createExecQuery(rawUser));

    const result = await service.findUserByAccountName(' Doctor-Test-001 ');

    expect(result).toEqual({
      id: userId.toString(),
      accountName: 'doctor-test-001',
      displayName: 'Doctor Test 001',
      staffCode: 'STAFF-TEST-001',
      email: 'doctor-test-001@example.test',
      phone: 'PHONE-TEST-001',
      passwordChangedAt,
      roles: ['doctor'],
      permissions: ['assessment:read'],
      userType: 'doctor',
      status: 'active',
      department: 'Memory Clinic Test',
      organization: 'CogMemory Test Organization',
      lastLoginAt,
      failedLoginCount: 1,
      lockedUntil: null,
      metadata: { source: 'unit-test' },
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('internalMarker');
    expect(userModel.findOne).toHaveBeenCalledWith({
      accountName: 'doctor-test-001',
    });
  });

  it('returns credential records with only authentication fields', async () => {
    const userId = new Types.ObjectId();
    const select = jest
      .fn()
      .mockReturnValue(createExecQuery(createUserFixture({ _id: userId })));
    userModel.findOne.mockReturnValue({ select });

    const result =
      await service.findUserCredentialByAccountName(' doctor-test-001 ');

    expect(userModel.findOne).toHaveBeenCalledWith({
      accountName: 'doctor-test-001',
    });
    expect(select).toHaveBeenCalledWith('+passwordHash');
    expect(result).toEqual({
      id: userId.toString(),
      accountName: 'doctor-test-001',
      displayName: 'Doctor Test 001',
      passwordHash: 'scrypt:v1:salt-test:hash-test',
      passwordChangedAt: new Date('2026-01-10T00:00:00.000Z'),
      roles: ['doctor'],
      permissions: ['assessment:read'],
      userType: 'doctor',
      status: 'active',
      failedLoginCount: 1,
      lockedUntil: null,
    });
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('metadata');
    expect(result).not.toHaveProperty('internalMarker');
  });

  it('lists active users through mapper output', async () => {
    const userId = new Types.ObjectId();
    const sort = jest
      .fn()
      .mockReturnValue(createExecQuery([createUserFixture({ _id: userId })]));
    userModel.find.mockReturnValue({ sort });

    const result = await service.listActiveUsers();

    expect(userModel.find).toHaveBeenCalledWith({ status: 'active' });
    expect(sort).toHaveBeenCalledWith({ accountName: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: userId.toString(),
        accountName: 'doctor-test-001',
        status: 'active',
      }),
    );
    expect(result[0]).not.toHaveProperty('passwordHash');
    expect(result[0]).not.toHaveProperty('internalMarker');
  });
});
