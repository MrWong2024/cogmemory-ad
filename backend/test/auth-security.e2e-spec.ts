import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  AUTH_LOGIN_MAX_FAILURES,
  AUTH_LOGIN_RATE_LIMIT_CODE,
  AUTH_LOGIN_RATE_LIMIT_MESSAGE,
  SESSION_COOKIE_NAME,
} from '../src/modules/auth/auth.constants';
import {
  Session,
  SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';
import { requireInitialized } from './support/e2e-initialization';

jest.setTimeout(30_000);

const TEST_USER_ID = new Types.ObjectId();
const TEST_ACCOUNT = 'doctor-auth-security-test';
const TEST_PASSWORD = 'Auth-Security-Test-Password!';
const WRONG_PASSWORD = 'Auth-Security-Wrong-Password!';
const RATE_LIMITED_IP = '203.0.113.10';
const ISOLATED_IP = '198.51.100.20';
const SUCCESS_IP = '192.0.2.30';

type SupertestApp = NonNullable<Parameters<typeof request.agent>[0]>;

function responseBody(response: Response): Record<string, unknown> {
  if (
    typeof response.body !== 'object' ||
    response.body === null ||
    Array.isArray(response.body)
  ) {
    throw new Error('Expected response object');
  }

  return response.body as Record<string, unknown>;
}

describe('auth production boundary security (e2e)', () => {
  let app: INestApplication;
  let server: SupertestApp;
  let connection: Connection;
  let userModel: Model<UserDocument>;
  let sessionModel: Model<SessionDocument>;
  let authService: AuthService;
  let ready = false;

  async function cleanup(): Promise<void> {
    await sessionModel.deleteMany({ userId: TEST_USER_ID }).exec();
    await userModel
      .deleteMany({
        $or: [{ _id: TEST_USER_ID }, { accountName: TEST_ACCOUNT }],
      })
      .exec();
  }

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.COGMEMORY_DATABASE_PURPOSE !== 'standard_test'
    ) {
      throw new Error(
        'Auth security E2E requires NODE_ENV=test and standard_test',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    if (connection.name !== 'cogmemory_ad_test') {
      throw new Error('Auth security E2E database isolation is not active');
    }

    const config = app.get(ConfigService);
    if (
      config.get<string>('app.env') !== 'test' ||
      config.get<string>('mongo.purpose') !== 'standard_test' ||
      config.get<string>('storage.driver') !== 'fake' ||
      config.get<string>('llm.provider') !== 'stub' ||
      config.get<string>('smsAuth.provider') !== 'stub'
    ) {
      throw new Error('Auth security E2E service isolation is not active');
    }

    userModel = app.get(getModelToken(User.name));
    sessionModel = app.get(getModelToken(Session.name));
    authService = app.get(AuthService);
    server = requireInitialized<SupertestApp>(
      app.getHttpServer() as SupertestApp | undefined,
      'HTTP server',
    );
    ready = true;

    await cleanup();
    const passwordHash = await authService.hashPassword(TEST_PASSWORD);
    await userModel.create({
      _id: TEST_USER_ID,
      accountName: TEST_ACCOUNT,
      displayName: 'Auth Security Test Doctor',
      passwordHash,
      roles: ['doctor'],
      permissions: [],
      userType: 'doctor',
      status: 'active',
    });
  });

  afterAll(async () => {
    if (ready) {
      await cleanup();
      const [userResidual, sessionResidual] = await Promise.all([
        userModel.countDocuments({ accountName: TEST_ACCOUNT }).exec(),
        sessionModel.countDocuments({ userId: TEST_USER_ID }).exec(),
      ]);
      expect({ userResidual, sessionResidual }).toEqual({
        userResidual: 0,
        sessionResidual: 0,
      });
    }

    if (app) {
      await app.close();
    }
  });

  it('returns ten 401 responses, then rate limits the same forwarded IP and account', async () => {
    for (let attempt = 0; attempt < AUTH_LOGIN_MAX_FAILURES; attempt += 1) {
      await request(server)
        .post('/auth/login')
        .set('X-Forwarded-For', RATE_LIMITED_IP)
        .send({ accountName: TEST_ACCOUNT, password: WRONG_PASSWORD })
        .expect(401);
    }

    const response = await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', RATE_LIMITED_IP)
      .send({ accountName: TEST_ACCOUNT, password: WRONG_PASSWORD })
      .expect(429);
    const body = responseBody(response);

    expect(body.code).toBe(AUTH_LOGIN_RATE_LIMIT_CODE);
    expect(body.message).toBe(AUTH_LOGIN_RATE_LIMIT_MESSAGE);
    expect(body.remainingSeconds).toEqual(expect.any(Number));
    expect(body.remainingSeconds).toBeGreaterThan(0);
    expect(body.remainingSeconds).toBeLessThanOrEqual(60);
    await expect(
      sessionModel.countDocuments({ userId: TEST_USER_ID }).exec(),
    ).resolves.toBe(0);
  });

  it('does not share the failure bucket with a different forwarded IP', async () => {
    await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', ISOLATED_IP)
      .send({ accountName: TEST_ACCOUNT, password: WRONG_PASSWORD })
      .expect(401);
  });

  it('stores the trusted forwarded client IP and sets the normal Session Cookie on success', async () => {
    const response = await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', SUCCESS_IP)
      .send({ accountName: TEST_ACCOUNT, password: TEST_PASSWORD })
      .expect(201);
    const setCookieHeader = response.headers['set-cookie'];

    expect(setCookieHeader).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${SESSION_COOKIE_NAME}=`),
      ]),
    );

    const session = await sessionModel
      .findOne({ userId: TEST_USER_ID, status: 'active' })
      .sort({ createdAt: -1 })
      .exec();

    expect(session).not.toBeNull();
    expect(session?.ipAddress).toBe(SUCCESS_IP);
  });
});
