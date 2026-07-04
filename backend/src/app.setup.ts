// backend/src/app.setup.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const DEFAULT_CORS_ORIGIN = 'http://localhost:3002';

type ExpressLikeApplication = {
  disable(setting: string): void;
  set(setting: string, value: unknown): void;
};

type ExpressLikeCandidate = {
  disable?: unknown;
  set?: unknown;
};

function isExpressLikeApplication(
  value: unknown,
): value is ExpressLikeApplication {
  const valueType = typeof value;

  if (value === null || (valueType !== 'object' && valueType !== 'function')) {
    return false;
  }

  const candidate = value as ExpressLikeCandidate;

  return (
    typeof candidate.disable === 'function' &&
    typeof candidate.set === 'function'
  );
}

function resolveCorsOrigin(corsOriginValue: string): boolean | string[] {
  if (corsOriginValue.trim() === '*') {
    return true;
  }

  const origins = corsOriginValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : [DEFAULT_CORS_ORIGIN];
}

export function configureApp(app: INestApplication): void {
  const httpInstance: unknown = app.getHttpAdapter().getInstance();

  if (isExpressLikeApplication(httpInstance)) {
    httpInstance.disable('x-powered-by');
    httpInstance.set('x-powered-by', false);
  }

  const configService = app.get(ConfigService);
  const corsOriginValue =
    configService.get<string>('app.corsOrigin') ?? DEFAULT_CORS_ORIGIN;

  app.enableCors({
    credentials: true,
    origin: resolveCorsOrigin(corsOriginValue),
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(app.get(AllExceptionsFilter));
}
