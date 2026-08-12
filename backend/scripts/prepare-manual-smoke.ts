import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import {
  readDeclaredDatabaseName,
  DatabaseGateError,
} from '../src/config/database-purpose';
import { AuthService } from '../src/modules/auth/services/auth.service';
import { ScaleCatalogService } from '../src/modules/scales/services/scale-catalog.service';
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';

type AppModuleExport = { AppModule: Type<unknown> };

const DEVELOPMENT_DATABASE = 'cogmemory_ad_dev';
const ACCOUNT_NAME = 'manual_smoke_doctor';
const ACCOUNT_PASSWORD = '12345678';

function fail(code: string, message: string): never {
  throw new DatabaseGateError(code, message);
}

function loadDevelopmentEnvFiles(): void {
  for (const fileName of ['.env.development', '.env']) {
    const filePath = resolve(process.cwd(), fileName);
    if (existsSync(filePath)) {
      loadEnvFile(filePath);
    }
  }
}

function assertPreImportEnvironment(): void {
  if (process.argv.length > 2) {
    fail('MANUAL_SMOKE_ARGUMENTS_NOT_ALLOWED', 'arguments are not supported');
  }
  if (process.env.NODE_ENV !== 'development') {
    fail(
      'MANUAL_SMOKE_DEVELOPMENT_REQUIRED',
      'manual smoke preparation requires development mode',
    );
  }
  loadDevelopmentEnvFiles();

  if (process.env.COGMEMORY_DATABASE_PURPOSE) {
    fail(
      'MANUAL_SMOKE_DATABASE_PURPOSE_FORBIDDEN',
      'test or Browser database purpose must not be layered into development',
    );
  }

  if (
    readDeclaredDatabaseName(process.env.MONGO_URI) !== DEVELOPMENT_DATABASE
  ) {
    fail(
      'MANUAL_SMOKE_DECLARED_DATABASE_MISMATCH',
      'declared database must be cogmemory_ad_dev',
    );
  }
}

async function ensureDoctor(
  userModel: Model<UserDocument>,
  authService: AuthService,
): Promise<void> {
  const existing = await userModel
    .findOne({ accountName: ACCOUNT_NAME })
    .select('+passwordHash')
    .exec();
  const passwordMatches = existing
    ? await authService.verifyPassword(ACCOUNT_PASSWORD, existing.passwordHash)
    : false;
  const passwordHash = passwordMatches
    ? existing?.passwordHash
    : await authService.hashPassword(ACCOUNT_PASSWORD);

  await userModel
    .findOneAndUpdate(
      { accountName: ACCOUNT_NAME },
      {
        $set: {
          displayName: '人工冒烟医生',
          passwordHash,
          roles: ['doctor'],
          permissions: [],
          userType: 'doctor',
          status: 'active',
          failedLoginCount: 0,
          lockedUntil: null,
        },
        $setOnInsert: {
          accountName: ACCOUNT_NAME,
          passwordChangedAt: new Date(),
          lastLoginAt: null,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    )
    .exec();

  const ensuredCount = await userModel.countDocuments({
    accountName: ACCOUNT_NAME,
  });
  if (ensuredCount !== 1) {
    fail(
      'MANUAL_SMOKE_DOCTOR_ENSURE_FAILED',
      'manual smoke doctor could not be ensured',
    );
  }
}

async function run(): Promise<void> {
  let app: INestApplicationContext | null = null;

  try {
    assertPreImportEnvironment();
    const [{ NestFactory }, mongooseModule] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/mongoose'),
    ]);
    // Application modules load only after the development database gate.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as AppModuleExport;
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });

    const config = app.get(ConfigService);
    const connection = app.get<Connection>(mongooseModule.getConnectionToken());
    if (
      config.get<string>('app.env') !== 'development' ||
      config.get<string>('mongo.purpose') !== undefined ||
      connection.name !== DEVELOPMENT_DATABASE
    ) {
      fail(
        'MANUAL_SMOKE_CONNECTED_DATABASE_MISMATCH',
        'connected database must be development cogmemory_ad_dev',
      );
    }

    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    await ensureDoctor(userModel, app.get(AuthService));

    const scaleCatalog = app.get(ScaleCatalogService);
    const mmse = await scaleCatalog.ensureSeedScaleVersionMaterialized('mmse');
    const moca = await scaleCatalog.ensureSeedScaleVersionMaterialized('moca');

    console.log(
      [
        'manual-smoke prepare ok',
        `database=${connection.name}`,
        `${ACCOUNT_NAME}=ensured`,
        `MMSE=${mmse.version}`,
        `MoCA=${moca.version}`,
      ].join(' | '),
    );
  } finally {
    if (app) {
      await app.close();
    }
  }
}

void run().catch((error: unknown) => {
  const code =
    error instanceof DatabaseGateError
      ? error.code
      : 'MANUAL_SMOKE_PREPARE_FAILED';
  console.error(`manual-smoke prepare failed: ${code}`);
  process.exitCode = 1;
});
