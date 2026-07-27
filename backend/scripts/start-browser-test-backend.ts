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
type FaultModuleExport =
  typeof import('../test/support/b10-browser-fixtures/browser-http-fault');
type ManagerModuleExport =
  typeof import('../test/support/b10-browser-fixtures/b10-browser-fixtures');

async function bootstrap(): Promise<void> {
  const b10HttpFaultConfigured = Object.keys(process.env).some((name) =>
    name.startsWith('B10_BROWSER_HTTP_FAULT_'),
  );
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
    if (b10HttpFaultConfigured) {
      // Test-only modules remain unloaded during the normal Browser backend path.
      const faultModule: FaultModuleExport =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../test/support/b10-browser-fixtures/browser-http-fault') as FaultModuleExport;
      const managerModule: ManagerModuleExport =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../test/support/b10-browser-fixtures/b10-browser-fixtures') as ManagerModuleExport;
      const faultConfig = faultModule.resolveB10BrowserHttpFaultConfig(
        process.env,
        {
          nodeEnv: process.env.NODE_ENV,
          databasePurpose: process.env.COGMEMORY_DATABASE_PURPOSE,
          databaseName: connection.name,
        },
      );
      if (!faultConfig) {
        throw new Error('B10 Browser HTTP fault configuration is missing');
      }
      const target = await managerModule
        .createB10BrowserFixtureManager(app)
        .resolveBrowserHttpFaultTarget(
          faultConfig.profile,
          faultConfig.namespace,
          faultConfig.fixturePassword,
        );
      app.use(faultModule.createB10BrowserHttpFaultMiddleware(target));
    }
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
