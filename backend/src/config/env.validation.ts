// backend/src/config/env.validation.ts
import Joi from 'joi';

const DEFAULT_DEV_MONGO_URI =
  'mongodb://cogmemory_ad_dev_app:{COGMEMORY_AD_DEV_APP_PASSWORD}@127.0.0.1:27017/cogmemory_ad_dev?authSource=cogmemory_ad_dev';
const DEFAULT_DEV_MONGO_ADMIN_URI =
  'mongodb://cogmemory_ad_dev_db_admin:{COGMEMORY_AD_DEV_DB_ADMIN_PASSWORD}@127.0.0.1:27017/cogmemory_ad_dev?authSource=cogmemory_ad_dev';
const DEFAULT_TEST_MONGO_URI =
  'mongodb://cogmemory_ad_test_app:{COGMEMORY_AD_TEST_APP_PASSWORD}@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test';
const DEFAULT_TEST_MONGO_ADMIN_URI =
  'mongodb://cogmemory_ad_test_db_admin:{COGMEMORY_AD_TEST_DB_ADMIN_PASSWORD}@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test';

const mongoUriSchema = Joi.string()
  .trim()
  .pattern(/^mongodb(\+srv)?:\/\/\S+$/)
  .messages({
    'string.pattern.base':
      'MONGO_URI must start with mongodb:// or mongodb+srv://',
  });

const mongoAutoIndexSchema = Joi.boolean()
  .truthy('true')
  .truthy('1')
  .falsy('false')
  .falsy('0');

const booleanSchema = Joi.boolean()
  .truthy('true')
  .truthy('1')
  .falsy('false')
  .falsy('0');

const storageDriverSchema = Joi.when('NODE_ENV', {
  is: 'production',
  then: Joi.string().valid('fake', 'oss').default('oss'),
  otherwise: Joi.string().valid('fake', 'oss').default('fake'),
});

const llmProviderSchema = Joi.when('NODE_ENV', {
  is: 'test',
  then: Joi.string().valid('stub').default('stub'),
  otherwise: Joi.string().valid('stub', 'bailian').default('bailian'),
});

const smsAuthProviderSchema = Joi.when('NODE_ENV', {
  is: 'test',
  then: Joi.string().valid('stub').default('stub'),
  otherwise: Joi.string().valid('stub', 'aliyun').default('aliyun'),
});

const optionalStringSchema = Joi.string().trim().allow('').default('');

type SessionEnvCandidate = {
  SESSION_COOKIE_SAME_SITE?: unknown;
  SESSION_COOKIE_SECURE?: unknown;
};

function validateSessionCookieCombination(
  value: unknown,
  helpers: Joi.CustomHelpers,
): unknown {
  const candidate = value as SessionEnvCandidate;

  if (
    candidate.SESSION_COOKIE_SAME_SITE === 'none' &&
    candidate.SESSION_COOKIE_SECURE !== true
  ) {
    return helpers.error('any.invalid');
  }

  return value;
}

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(5002),
  FRONTEND_URL: Joi.string().trim().min(1).default('http://localhost:3002'),
  CORS_ORIGIN: Joi.string().trim().min(1).default('http://localhost:3002'),
  COGMEMORY_DATABASE_PURPOSE: Joi.when('NODE_ENV', {
    is: 'test',
    then: Joi.string()
      .valid('standard_test', 'browser_acceptance')
      .default('standard_test'),
    otherwise: Joi.string()
      .valid('standard_test', 'browser_acceptance')
      .optional(),
  }),
  MONGO_URI: Joi.when('NODE_ENV', {
    is: 'production',
    then: mongoUriSchema.required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'test',
      then: Joi.when('COGMEMORY_DATABASE_PURPOSE', {
        is: 'browser_acceptance',
        then: mongoUriSchema.required(),
        otherwise: mongoUriSchema.default(DEFAULT_TEST_MONGO_URI),
      }),
      otherwise: mongoUriSchema.default(DEFAULT_DEV_MONGO_URI),
    }),
  }),
  MONGO_ADMIN_URI: Joi.when('NODE_ENV', {
    is: 'production',
    then: mongoUriSchema.required(),
    otherwise: Joi.when('NODE_ENV', {
      is: 'test',
      then: Joi.when('COGMEMORY_DATABASE_PURPOSE', {
        is: 'browser_acceptance',
        then: mongoUriSchema.required(),
        otherwise: mongoUriSchema.default(DEFAULT_TEST_MONGO_ADMIN_URI),
      }),
      otherwise: mongoUriSchema.default(DEFAULT_DEV_MONGO_ADMIN_URI),
    }),
  }),
  MONGO_AUTO_INDEX: Joi.when('NODE_ENV', {
    is: 'production',
    then: mongoAutoIndexSchema.valid(false).default(false),
    otherwise: mongoAutoIndexSchema.optional(),
  }),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1)
    .default(5000),
  STORAGE_DRIVER: storageDriverSchema,
  OSS_REGION: Joi.string().trim().allow('').default('oss-cn-shenzhen'),
  OSS_BUCKET: Joi.when('STORAGE_DRIVER', {
    is: 'oss',
    then: Joi.string().trim().min(1).required(),
    otherwise: optionalStringSchema.optional(),
  }),
  OSS_INTERNAL_ENDPOINT: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .trim()
      .allow('')
      .default('oss-cn-shenzhen-internal.aliyuncs.com'),
    otherwise: Joi.string()
      .trim()
      .allow('')
      .default('oss-cn-shenzhen.aliyuncs.com'),
  }),
  OSS_PUBLIC_ENDPOINT: Joi.string()
    .trim()
    .allow('')
    .default('oss-cn-shenzhen.aliyuncs.com'),
  OSS_ACCESS_KEY_ID: Joi.when('STORAGE_DRIVER', {
    is: 'oss',
    then: Joi.string().trim().min(1).required(),
    otherwise: optionalStringSchema.optional(),
  }),
  OSS_ACCESS_KEY_SECRET: Joi.when('STORAGE_DRIVER', {
    is: 'oss',
    then: Joi.string().trim().min(1).required(),
    otherwise: optionalStringSchema.optional(),
  }),
  OSS_OBJECT_PREFIX: Joi.string().trim().allow('').default('cogmemory_ad'),
  SESSION_COOKIE_NAME: Joi.string()
    .trim()
    .min(1)
    .default('cogmemory_ad_session'),
  SESSION_TTL_MS: Joi.number().integer().min(1).default(86400000),
  MAX_ACTIVE_SESSIONS_PER_USER: Joi.number().integer().min(1).default(5),
  SESSION_COOKIE_SECURE: Joi.when('NODE_ENV', {
    is: 'production',
    then: booleanSchema.default(true),
    otherwise: booleanSchema.default(false),
  }),
  SESSION_COOKIE_SAME_SITE: Joi.string()
    .valid('lax', 'strict', 'none')
    .default('lax'),
  LLM_PROVIDER: llmProviderSchema,
  BAILIAN_API_KEY: optionalStringSchema,
  BAILIAN_BASE_URL: Joi.string()
    .trim()
    .allow('')
    .pattern(/^https?:\/\/\S+$/)
    .default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  BAILIAN_MODEL: Joi.when('NODE_ENV', {
    is: 'test',
    then: Joi.string().trim().allow('').default(''),
    otherwise: Joi.string().trim().allow('').default('qwen3.6-plus'),
  }),
  BAILIAN_TIMEOUT_MS: Joi.number().integer().min(1).default(90000),
  BAILIAN_MAX_RETRIES: Joi.number().integer().min(0).default(1),
  SMS_AUTH_PROVIDER: smsAuthProviderSchema,
  ALIYUN_SMS_ACCESS_KEY_ID: optionalStringSchema,
  ALIYUN_SMS_ACCESS_KEY_SECRET: optionalStringSchema,
  ALIYUN_SMS_REGION_ID: Joi.string().trim().min(1).default('cn-shenzhen'),
  ALIYUN_SMS_ENDPOINT: Joi.string()
    .trim()
    .min(1)
    .default('dysmsapi.aliyuncs.com'),
  ALIYUN_SMS_COUNTRY_CODE: Joi.string().trim().valid('86').default('86'),
  ALIYUN_SMS_SIGN_NAME: optionalStringSchema,
  ALIYUN_SMS_TEMPLATE_CODE: optionalStringSchema,
  ALIYUN_SMS_TEMPLATE_PARAM: optionalStringSchema,
  ALIYUN_SMS_CODE_LENGTH: Joi.number().integer().min(4).max(8).default(6),
  ALIYUN_SMS_VALID_TIME_SECONDS: Joi.number().integer().min(1).default(300),
  ALIYUN_SMS_DUPLICATE_POLICY: Joi.number().integer().valid(1, 2).default(1),
  ALIYUN_SMS_INTERVAL_SECONDS: Joi.number().integer().min(0).default(60),
  ALIYUN_SMS_CODE_TYPE: Joi.number().integer().min(1).max(7).default(1),
  ALIYUN_SMS_CASE_AUTH_POLICY: Joi.number().integer().valid(1, 2).default(1),
})
  .custom(validateSessionCookieCombination)
  .unknown(true)
  .options({ abortEarly: false });
