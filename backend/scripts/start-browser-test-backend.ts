import 'reflect-metadata';
import type { INestApplication, Type } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Connection } from 'mongoose';
import { configureApp } from '../src/app.setup';
import {
  DatabaseGateError,
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserBackendDatabaseAccess,
} from '../src/config/database-purpose';

type AppModuleExport = { AppModule: Type<unknown> };

async function bootstrap(): Promise<void> {
  assertBrowserAcceptancePreImportEnvironment({
    nodeEnv: process.env.NODE_ENV,
    purpose: process.env.COGMEMORY_DATABASE_PURPOSE,
    mongoUri: process.env.MONGO_URI,
  });

  const [{ NestFactory }, mongooseModule, configModule] = await Promise.all([
    import('@nestjs/core'),
    import('@nestjs/mongoose'),
    import('@nestjs/config'),
  ]);
  // Application modules are deliberately loaded only after the process gate.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../src/app.module') as AppModuleExport;
  let app: INestApplication | null = null;

  try {
    app = await NestFactory.create(AppModule, { abortOnError: false });
    configureApp(app);
    const connection = app.get<Connection>(mongooseModule.getConnectionToken());
    await assertBrowserBackendDatabaseAccess(connection);
    const configService = app.get<ConfigService>(configModule.ConfigService);
    const port = configService.get<number>('app.port') ?? 5002;
    await app.listen(port);
  } catch (error: unknown) {
    if (app) {
      await app.close();
    }
    throw error;
  }
}

bootstrap().catch((error: unknown) => {
  if (error instanceof DatabaseGateError) {
    console.error(
      JSON.stringify({
        ok: false,
        code: error.code,
        message: error.message,
      }),
    );
  } else {
    console.error(
      JSON.stringify({
        ok: false,
        code: 'BROWSER_BACKEND_START_FAILED',
        message: 'Browser test backend failed to start',
      }),
    );
  }
  process.exit(1);
});
