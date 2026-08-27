import configuration from './configuration';
import { envValidationSchema } from './env.validation';

const ORIGINAL_ENV = process.env;

describe('ASR configuration', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ASR_PROVIDER;
    delete process.env.BAILIAN_API_KEY;
    delete process.env.BAILIAN_ASR_API_URL;
    delete process.env.BAILIAN_ASR_MODEL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defaults development and production ASR to disabled', () => {
    process.env.NODE_ENV = 'development';
    expect(configuration().asr).toEqual({
      provider: 'disabled',
      bailian: { apiKey: '', apiUrl: '', model: '', timeoutMs: 90000 },
    });

    process.env.NODE_ENV = 'production';
    expect(configuration().asr.provider).toBe('disabled');
  });

  it('forces test configuration to the deterministic stub', () => {
    process.env.NODE_ENV = 'test';
    process.env.ASR_PROVIDER = 'bailian';
    expect(configuration().asr).toMatchObject({
      provider: 'stub',
      bailian: { model: 'qwen-audio-3.0-asr-flash' },
    });
  });

  it('rejects real ASR in test and the stub in production', () => {
    expect(
      envValidationSchema.validate({
        NODE_ENV: 'test',
        ASR_PROVIDER: 'bailian',
      }).error,
    ).toBeDefined();
    expect(
      envValidationSchema.validate({
        NODE_ENV: 'production',
        MONGO_URI: 'mongodb://localhost/cogmemory_ad',
        MONGO_ADMIN_URI: 'mongodb://localhost/cogmemory_ad',
        STORAGE_DRIVER: 'fake',
        ASR_PROVIDER: 'stub',
      }).error,
    ).toBeDefined();
  });

  it('requires Bailian credentials and a full HTTPS ASR URL', () => {
    const missing = envValidationSchema.validate({
      NODE_ENV: 'development',
      ASR_PROVIDER: 'bailian',
    });
    expect(missing.error?.message).toContain('BAILIAN_API_KEY');
    expect(missing.error?.message).toContain('BAILIAN_ASR_API_URL');

    const insecure = envValidationSchema.validate({
      NODE_ENV: 'development',
      ASR_PROVIDER: 'bailian',
      BAILIAN_API_KEY: 'placeholder',
      BAILIAN_ASR_API_URL: 'http://workspace.example/asr',
    });
    expect(insecure.error?.message).toContain('BAILIAN_ASR_API_URL');
  });

  it('uses the exact ASR model default for a valid Bailian configuration', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      ASR_PROVIDER: 'bailian',
      BAILIAN_API_KEY: 'placeholder',
      BAILIAN_ASR_API_URL: 'https://workspace.example/asr',
    });
    expect(result.error).toBeUndefined();
    const validated = result.value as unknown;
    expect(
      typeof validated === 'object' && validated !== null
        ? Reflect.get(validated, 'BAILIAN_ASR_MODEL')
        : undefined,
    ).toBe('qwen-audio-3.0-asr-flash');
  });
});

describe('CORS origin validation', () => {
  const productionBase = {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://localhost/cogmemory_ad',
    MONGO_ADMIN_URI: 'mongodb://localhost/cogmemory_ad',
    STORAGE_DRIVER: 'fake',
  };

  it('rejects wildcard CORS in production', () => {
    const result = envValidationSchema.validate({
      ...productionBase,
      CORS_ORIGIN: '*',
    });

    expect(result.error?.message).toContain('CORS_ORIGIN');
  });

  it('accepts the production HTTPS origin', () => {
    const result = envValidationSchema.validate({
      ...productionBase,
      CORS_ORIGIN: 'https://cogmemory.cqupt.fun',
    });

    expect(result.error).toBeUndefined();
  });

  it.each(['development', 'test'] as const)(
    'keeps wildcard CORS valid in %s',
    (nodeEnv) => {
      const result = envValidationSchema.validate({
        NODE_ENV: nodeEnv,
        CORS_ORIGIN: '*',
      });

      expect(result.error).toBeUndefined();
      expect(Reflect.get(result.value as object, 'CORS_ORIGIN')).toBe('*');
    },
  );
});

describe('OSS object prefix validation', () => {
  const ossEnvironment = {
    NODE_ENV: 'development',
    STORAGE_DRIVER: 'oss',
    OSS_REGION: 'test-region',
    OSS_BUCKET: 'test-bucket',
    OSS_INTERNAL_ENDPOINT: 'internal-endpoint-test-value',
    OSS_PUBLIC_ENDPOINT: 'public-endpoint-test-value',
    OSS_ACCESS_KEY_ID: 'test-access-key-id',
    OSS_ACCESS_KEY_SECRET: 'test-access-key-secret',
  };

  it.each([undefined, '', ' '])(
    'rejects OSS storage without an explicit non-empty object prefix: %p',
    (objectPrefix) => {
      const result = envValidationSchema.validate({
        ...ossEnvironment,
        OSS_OBJECT_PREFIX: objectPrefix,
      });

      expect(result.error?.message).toContain('OSS_OBJECT_PREFIX');
    },
  );

  it('accepts and trims an explicit OSS object prefix', () => {
    const result = envValidationSchema.validate({
      ...ossEnvironment,
      OSS_OBJECT_PREFIX: ' cogmemory_ad/development ',
    });

    expect(result.error).toBeUndefined();
    expect(Reflect.get(result.value as object, 'OSS_OBJECT_PREFIX')).toBe(
      'cogmemory_ad/development',
    );
  });

  it('keeps the shared object prefix default for fake storage', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      STORAGE_DRIVER: 'fake',
    });

    expect(result.error).toBeUndefined();
    expect(Reflect.get(result.value as object, 'OSS_OBJECT_PREFIX')).toBe(
      'cogmemory_ad',
    );
  });
});
