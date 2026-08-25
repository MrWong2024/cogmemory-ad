// backend/src/modules/storage/storage.service.spec.ts
import { ServiceUnavailableException } from '@nestjs/common';
import OSS from 'ali-oss';
import { FakeStorageService } from './fake-storage.service';
import { OssStorageService } from './oss-storage.service';
import { StorageConfigService } from './storage-config.service';

jest.mock('ali-oss', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type MockAliOssClient = {
  put: jest.Mock<
    Promise<unknown>,
    [string, Buffer, { mime?: string } | undefined]
  >;
  delete: jest.Mock<Promise<unknown>, [string]>;
  signatureUrl: jest.Mock<
    string,
    [string, { expires?: number; method?: string } | undefined]
  >;
};

type MockAliOssClientOptions = {
  region: string;
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  secure: boolean;
};

const ossClientConstructor = OSS as unknown as jest.Mock<
  MockAliOssClient,
  [MockAliOssClientOptions]
>;

function createMockAliOssClient(): MockAliOssClient {
  return {
    put: jest.fn<
      Promise<unknown>,
      [string, Buffer, { mime?: string } | undefined]
    >(),
    delete: jest.fn<Promise<unknown>, [string]>(),
    signatureUrl: jest.fn<
      string,
      [string, { expires?: number; method?: string } | undefined]
    >(),
  };
}

describe('Storage services', () => {
  const ossEnvKeys = [
    'STORAGE_DRIVER',
    'OSS_REGION',
    'OSS_BUCKET',
    'OSS_INTERNAL_ENDPOINT',
    'OSS_PUBLIC_ENDPOINT',
    'OSS_ACCESS_KEY_ID',
    'OSS_ACCESS_KEY_SECRET',
    'OSS_OBJECT_PREFIX',
  ];
  const previousEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    ossClientConstructor.mockReset();

    for (const key of ossEnvKeys) {
      previousEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ossEnvKeys) {
      const previous = previousEnv.get(key);

      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
    previousEnv.clear();
  });

  function setValidOssEnvironment(): void {
    process.env.STORAGE_DRIVER = 'oss';
    process.env.OSS_REGION = 'test-region';
    process.env.OSS_BUCKET = 'test-bucket';
    process.env.OSS_INTERNAL_ENDPOINT = 'internal-endpoint-test-value';
    process.env.OSS_PUBLIC_ENDPOINT = 'public-endpoint-test-value';
    process.env.OSS_ACCESS_KEY_ID = 'test-access-key-id';
    process.env.OSS_ACCESS_KEY_SECRET = 'test-access-key-secret';
    process.env.OSS_OBJECT_PREFIX = 'test-prefix';
  }

  it('uses fake storage without requiring OSS configuration', async () => {
    const config = new StorageConfigService();
    const storage = new FakeStorageService(config);

    const uploaded = await storage.uploadFile({
      objectKey: 'cogmemory_ad/samples/2026/file.pdf',
      buffer: Buffer.from('fake'),
      sizeBytes: 4,
      mimeType: 'application/pdf',
    });
    const signedUrl = await storage.getSignedUrl(uploaded.objectKey, {
      expiresInSeconds: 600,
    });

    expect(uploaded).toMatchObject({
      objectKey: 'cogmemory_ad/samples/2026/file.pdf',
      bucket: 'fake-storage',
      sizeBytes: 4,
      mimeType: 'application/pdf',
    });
    expect(signedUrl.url).toContain('https://fake-storage.local/');
    expect(signedUrl.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns a clear error when OSS configuration is missing', async () => {
    process.env.STORAGE_DRIVER = 'oss';
    const config = new StorageConfigService();
    const storage = new OssStorageService(config);

    await expect(
      storage.uploadFile({
        objectKey: 'cogmemory_ad/samples/2026/file.pdf',
        buffer: Buffer.from('oss'),
        sizeBytes: 3,
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    await expect(
      storage.getSignedUrl('cogmemory_ad/samples/2026/file.pdf', {
        expiresInSeconds: 600,
      }),
    ).rejects.toThrow('missing OSS_REGION');
  });

  it('uploads with a secure internal OSS client and preserves the result contract', async () => {
    setValidOssEnvironment();
    const client = createMockAliOssClient();
    client.put.mockResolvedValue({});
    ossClientConstructor.mockReturnValue(client);
    const storage = new OssStorageService(new StorageConfigService());
    const buffer = Buffer.from('synthetic');

    const uploaded = await storage.uploadFile({
      objectKey: 'test-prefix/smoke/object.txt',
      buffer,
      sizeBytes: buffer.length,
      mimeType: 'text/plain; charset=utf-8',
    });

    expect(ossClientConstructor).toHaveBeenCalledWith({
      region: 'test-region',
      bucket: 'test-bucket',
      endpoint: 'internal-endpoint-test-value',
      accessKeyId: 'test-access-key-id',
      accessKeySecret: 'test-access-key-secret',
      secure: true,
    });
    expect(client.put).toHaveBeenCalledWith(
      'test-prefix/smoke/object.txt',
      buffer,
      { mime: 'text/plain; charset=utf-8' },
    );
    expect(uploaded).toEqual({
      objectKey: 'test-prefix/smoke/object.txt',
      bucket: 'test-bucket',
      sizeBytes: buffer.length,
      mimeType: 'text/plain; charset=utf-8',
    });
  });

  it('deletes with a secure internal OSS client and exposes provider failure safely', async () => {
    setValidOssEnvironment();
    const client = createMockAliOssClient();
    client.delete.mockRejectedValue(new Error('sensitive delete failure'));
    ossClientConstructor.mockReturnValue(client);
    const storage = new OssStorageService(new StorageConfigService());

    await expect(
      storage.deleteObject('test-prefix/smoke/object.txt'),
    ).rejects.toMatchObject({
      message: 'Failed to delete OSS object',
    });

    expect(ossClientConstructor).toHaveBeenCalledWith({
      region: 'test-region',
      bucket: 'test-bucket',
      endpoint: 'internal-endpoint-test-value',
      accessKeyId: 'test-access-key-id',
      accessKeySecret: 'test-access-key-secret',
      secure: true,
    });
    expect(client.delete).toHaveBeenCalledWith('test-prefix/smoke/object.txt');
  });

  it('returns an HTTPS signed URL from a secure public OSS client', async () => {
    setValidOssEnvironment();
    const client = createMockAliOssClient();
    const signedUrl = 'https://signed-url.test/object?signature=redacted';
    client.signatureUrl.mockReturnValue(signedUrl);
    ossClientConstructor.mockReturnValue(client);
    const storage = new OssStorageService(new StorageConfigService());
    const before = Date.now();

    const result = await storage.getSignedUrl('test-prefix/smoke/object.txt', {
      expiresInSeconds: 120,
    });

    expect(ossClientConstructor).toHaveBeenCalledWith({
      region: 'test-region',
      bucket: 'test-bucket',
      endpoint: 'public-endpoint-test-value',
      accessKeyId: 'test-access-key-id',
      accessKeySecret: 'test-access-key-secret',
      secure: true,
    });
    expect(client.signatureUrl).toHaveBeenCalledWith(
      'test-prefix/smoke/object.txt',
      { expires: 120, method: 'GET' },
    );
    expect(result.url).toBe(signedUrl);
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 120_000);
  });

  it('rejects an HTTP signed URL without leaking sensitive context', async () => {
    setValidOssEnvironment();
    const client = createMockAliOssClient();
    const objectKey = 'test-prefix/smoke/private-object.txt';
    const signedUrl =
      'http://signed-url.test/private-object.txt?signature=sensitive';
    client.signatureUrl.mockReturnValue(signedUrl);
    ossClientConstructor.mockReturnValue(client);
    const storage = new OssStorageService(new StorageConfigService());

    const error = await storage
      .getSignedUrl(objectKey, { expiresInSeconds: 120 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const message = (error as ServiceUnavailableException).message;
    expect(message).toBe('Failed to generate secure OSS signed URL');
    expect(message).not.toContain(signedUrl);
    expect(message).not.toContain(objectKey);
    expect(message).not.toContain('public-endpoint-test-value');
    expect(message).not.toContain('signature=sensitive');
  });

  it.each(['', '/relative-object', 'not a valid URL'])(
    'rejects a non-absolute signed URL: %p',
    async (signedUrl) => {
      setValidOssEnvironment();
      const client = createMockAliOssClient();
      client.signatureUrl.mockReturnValue(signedUrl);
      ossClientConstructor.mockReturnValue(client);
      const storage = new OssStorageService(new StorageConfigService());

      await expect(
        storage.getSignedUrl('test-prefix/smoke/object.txt', {
          expiresInSeconds: 120,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    },
  );

  it('maps signature generation failures without leaking the underlying error', async () => {
    setValidOssEnvironment();
    const client = createMockAliOssClient();
    client.signatureUrl.mockImplementation(() => {
      throw new Error('sensitive signing failure');
    });
    ossClientConstructor.mockReturnValue(client);
    const storage = new OssStorageService(new StorageConfigService());

    const error = await storage
      .getSignedUrl('test-prefix/smoke/private-object.txt', {
        expiresInSeconds: 120,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const message = (error as ServiceUnavailableException).message;
    expect(message).toBe('Failed to generate OSS signed URL');
    expect(message).not.toContain('sensitive signing failure');
  });
});
