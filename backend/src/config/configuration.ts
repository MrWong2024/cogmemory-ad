// backend/src/config/configuration.ts
const DEFAULT_PORT = 5002;
const DEFAULT_FRONTEND_URL = 'http://localhost:3002';
const DEFAULT_PRODUCTION_MONGO_URI = '';
const DEFAULT_MONGO_SERVER_SELECTION_TIMEOUT_MS = 5000;
const DEFAULT_SESSION_COOKIE_NAME = 'cogmemory_ad_session';
const DEFAULT_SESSION_TTL_MS = 86_400_000;
const DEFAULT_MAX_ACTIVE_SESSIONS_PER_USER = 5;
const DEFAULT_SESSION_COOKIE_SAME_SITE = 'lax';
const DEFAULT_STORAGE_REGION = 'oss-cn-shenzhen';
const DEFAULT_OSS_PUBLIC_ENDPOINT = 'oss-cn-shenzhen.aliyuncs.com';
const DEFAULT_OSS_INTERNAL_ENDPOINT = 'oss-cn-shenzhen-internal.aliyuncs.com';
const DEFAULT_STORAGE_OBJECT_PREFIX = 'cogmemory_ad';
const DEFAULT_BAILIAN_BASE_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_BAILIAN_MODEL = 'qwen3.6-plus';
const DEFAULT_BAILIAN_TIMEOUT_MS = 90000;
const DEFAULT_BAILIAN_MAX_RETRIES = 1;
const DEFAULT_ALIYUN_SMS_REGION_ID = 'cn-shenzhen';
const DEFAULT_ALIYUN_SMS_ENDPOINT = 'dysmsapi.aliyuncs.com';
const DEFAULT_ALIYUN_SMS_COUNTRY_CODE = '86';
const DEFAULT_ALIYUN_SMS_CODE_LENGTH = 6;
const DEFAULT_ALIYUN_SMS_VALID_TIME_SECONDS = 300;
const DEFAULT_ALIYUN_SMS_DUPLICATE_POLICY = 1;
const DEFAULT_ALIYUN_SMS_INTERVAL_SECONDS = 60;
const DEFAULT_ALIYUN_SMS_CODE_TYPE = 1;
const DEFAULT_ALIYUN_SMS_CASE_AUTH_POLICY = 1;

type AppEnvironment = 'development' | 'test' | 'production';
type LlmProvider = 'stub' | 'bailian';
type SmsAuthProvider = 'stub' | 'aliyun';
type StorageDriver = 'fake' | 'oss';
export type SessionCookieSameSite = 'lax' | 'strict' | 'none';

const SESSION_COOKIE_SAME_SITE_VALUES = ['lax', 'strict', 'none'] as const;

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseNonNegativeNumber(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = parseNumber(value, fallback);

  return parsed >= 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
}

function parseCookieSameSite(value: string | undefined): SessionCookieSameSite {
  if (
    SESSION_COOKIE_SAME_SITE_VALUES.includes(value as SessionCookieSameSite)
  ) {
    return value as SessionCookieSameSite;
  }

  return DEFAULT_SESSION_COOKIE_SAME_SITE;
}

function resolveAppEnvironment(): AppEnvironment {
  if (process.env.NODE_ENV === 'test') {
    return 'test';
  }

  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }

  return 'development';
}

function getDefaultMongoUri(env: AppEnvironment): string {
  if (env === 'test') {
    return 'mongodb://cogmemory_ad_test_app:{COGMEMORY_AD_TEST_APP_PASSWORD}@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test';
  }

  if (env === 'production') {
    return DEFAULT_PRODUCTION_MONGO_URI;
  }

  return 'mongodb://cogmemory_ad_dev_app:{COGMEMORY_AD_DEV_APP_PASSWORD}@127.0.0.1:27017/cogmemory_ad_dev?authSource=cogmemory_ad_dev';
}

function getDefaultMongoAutoIndex(env: AppEnvironment): boolean {
  return env !== 'production';
}

function getDefaultMongoAdminUri(env: AppEnvironment): string {
  if (env === 'test') {
    return 'mongodb://cogmemory_ad_test_db_admin:{COGMEMORY_AD_TEST_DB_ADMIN_PASSWORD}@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test';
  }

  if (env === 'production') {
    return DEFAULT_PRODUCTION_MONGO_URI;
  }

  return 'mongodb://cogmemory_ad_dev_db_admin:{COGMEMORY_AD_DEV_DB_ADMIN_PASSWORD}@127.0.0.1:27017/cogmemory_ad_dev?authSource=cogmemory_ad_dev';
}

function getDefaultStorageDriver(env: AppEnvironment): StorageDriver {
  return env === 'production' ? 'oss' : 'fake';
}

function parseStorageDriver(
  value: string | undefined,
  env: AppEnvironment,
): StorageDriver {
  if (value === 'fake' || value === 'oss') {
    return value;
  }

  return getDefaultStorageDriver(env);
}

function parseLlmProvider(
  value: string | undefined,
  env: AppEnvironment,
): LlmProvider {
  if (value === 'stub' || value === 'bailian') {
    return env === 'test' ? 'stub' : value;
  }

  return env === 'test' ? 'stub' : 'bailian';
}

function parseSmsAuthProvider(
  value: string | undefined,
  env: AppEnvironment,
): SmsAuthProvider {
  if (env === 'test') {
    return 'stub';
  }

  if (value === 'stub' || value === 'aliyun') {
    return value;
  }

  return 'aliyun';
}

function resolveMongoUri(
  value: string | undefined,
  env: AppEnvironment,
): string {
  if (!value) {
    return getDefaultMongoUri(env);
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : getDefaultMongoUri(env);
}

function resolveMongoAdminUri(
  value: string | undefined,
  env: AppEnvironment,
): string {
  if (!value) {
    return getDefaultMongoAdminUri(env);
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : getDefaultMongoAdminUri(env);
}

function optionalString(value: string | undefined, fallback = ''): string {
  return value?.trim() ?? fallback;
}

function getDefaultOssInternalEndpoint(env: AppEnvironment): string {
  return env === 'production'
    ? DEFAULT_OSS_INTERNAL_ENDPOINT
    : DEFAULT_OSS_PUBLIC_ENDPOINT;
}

export default () => {
  const env = resolveAppEnvironment();

  return {
    app: {
      env,
      port: parseNumber(process.env.PORT, DEFAULT_PORT),
      frontendUrl: process.env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL,
      corsOrigin:
        process.env.CORS_ORIGIN ??
        process.env.FRONTEND_URL ??
        DEFAULT_FRONTEND_URL,
    },
    mongo: {
      uri: resolveMongoUri(process.env.MONGO_URI, env),
      adminUri: resolveMongoAdminUri(process.env.MONGO_ADMIN_URI, env),
      autoIndex: parseBoolean(
        process.env.MONGO_AUTO_INDEX,
        getDefaultMongoAutoIndex(env),
      ),
      serverSelectionTimeoutMs: parseNumber(
        process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        DEFAULT_MONGO_SERVER_SELECTION_TIMEOUT_MS,
      ),
    },
    storage: {
      driver: parseStorageDriver(process.env.STORAGE_DRIVER, env),
      oss: {
        region: optionalString(process.env.OSS_REGION, DEFAULT_STORAGE_REGION),
        bucket: optionalString(process.env.OSS_BUCKET),
        internalEndpoint: optionalString(
          process.env.OSS_INTERNAL_ENDPOINT,
          getDefaultOssInternalEndpoint(env),
        ),
        publicEndpoint: optionalString(
          process.env.OSS_PUBLIC_ENDPOINT,
          DEFAULT_OSS_PUBLIC_ENDPOINT,
        ),
        accessKeyId: optionalString(process.env.OSS_ACCESS_KEY_ID),
        accessKeySecret: optionalString(process.env.OSS_ACCESS_KEY_SECRET),
        objectPrefix: optionalString(
          process.env.OSS_OBJECT_PREFIX,
          DEFAULT_STORAGE_OBJECT_PREFIX,
        ),
      },
    },
    session: {
      cookieName:
        process.env.SESSION_COOKIE_NAME ?? DEFAULT_SESSION_COOKIE_NAME,
      ttlMs: parseNumber(process.env.SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS),
      maxActiveSessionsPerUser: parseNumber(
        process.env.MAX_ACTIVE_SESSIONS_PER_USER,
        DEFAULT_MAX_ACTIVE_SESSIONS_PER_USER,
      ),
      cookieSecure: parseBoolean(
        process.env.SESSION_COOKIE_SECURE,
        env === 'production',
      ),
      cookieSameSite: parseCookieSameSite(process.env.SESSION_COOKIE_SAME_SITE),
    },
    llm: {
      provider: parseLlmProvider(process.env.LLM_PROVIDER, env),
      bailian: {
        apiKey: optionalString(process.env.BAILIAN_API_KEY),
        baseUrl: optionalString(
          process.env.BAILIAN_BASE_URL,
          DEFAULT_BAILIAN_BASE_URL,
        ),
        model: optionalString(
          process.env.BAILIAN_MODEL,
          env === 'test' ? '' : DEFAULT_BAILIAN_MODEL,
        ),
        timeoutMs: parseNumber(
          process.env.BAILIAN_TIMEOUT_MS,
          DEFAULT_BAILIAN_TIMEOUT_MS,
        ),
        maxRetries: parseNumber(
          process.env.BAILIAN_MAX_RETRIES,
          DEFAULT_BAILIAN_MAX_RETRIES,
        ),
      },
    },
    smsAuth: {
      provider: parseSmsAuthProvider(process.env.SMS_AUTH_PROVIDER, env),
      aliyun: {
        accessKeyId: optionalString(process.env.ALIYUN_SMS_ACCESS_KEY_ID),
        accessKeySecret: optionalString(
          process.env.ALIYUN_SMS_ACCESS_KEY_SECRET,
        ),
        regionId: optionalString(
          process.env.ALIYUN_SMS_REGION_ID,
          DEFAULT_ALIYUN_SMS_REGION_ID,
        ),
        endpoint: optionalString(
          process.env.ALIYUN_SMS_ENDPOINT,
          DEFAULT_ALIYUN_SMS_ENDPOINT,
        ),
        countryCode: optionalString(
          process.env.ALIYUN_SMS_COUNTRY_CODE,
          DEFAULT_ALIYUN_SMS_COUNTRY_CODE,
        ),
        signName: optionalString(process.env.ALIYUN_SMS_SIGN_NAME),
        templateCode: optionalString(process.env.ALIYUN_SMS_TEMPLATE_CODE),
        templateParam: optionalString(process.env.ALIYUN_SMS_TEMPLATE_PARAM),
        codeLength: parseNumber(
          process.env.ALIYUN_SMS_CODE_LENGTH,
          DEFAULT_ALIYUN_SMS_CODE_LENGTH,
        ),
        validTimeSeconds: parseNumber(
          process.env.ALIYUN_SMS_VALID_TIME_SECONDS,
          DEFAULT_ALIYUN_SMS_VALID_TIME_SECONDS,
        ),
        duplicatePolicy: parseNumber(
          process.env.ALIYUN_SMS_DUPLICATE_POLICY,
          DEFAULT_ALIYUN_SMS_DUPLICATE_POLICY,
        ),
        intervalSeconds: parseNonNegativeNumber(
          process.env.ALIYUN_SMS_INTERVAL_SECONDS,
          DEFAULT_ALIYUN_SMS_INTERVAL_SECONDS,
        ),
        codeType: parseNumber(
          process.env.ALIYUN_SMS_CODE_TYPE,
          DEFAULT_ALIYUN_SMS_CODE_TYPE,
        ),
        caseAuthPolicy: parseNumber(
          process.env.ALIYUN_SMS_CASE_AUTH_POLICY,
          DEFAULT_ALIYUN_SMS_CASE_AUTH_POLICY,
        ),
      },
    },
  };
};
