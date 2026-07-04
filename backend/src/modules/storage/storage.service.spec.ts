// backend/src/modules/storage/storage.service.spec.ts
import { ServiceUnavailableException } from '@nestjs/common';
import { FakeStorageService } from './fake-storage.service';
import { OssStorageService } from './oss-storage.service';
import { StorageConfigService } from './storage-config.service';

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
});
