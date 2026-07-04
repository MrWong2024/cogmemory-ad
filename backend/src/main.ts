// backend/src/main.ts
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 5002;

  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap CogMemory AD backend', error);
  process.exit(1);
});
