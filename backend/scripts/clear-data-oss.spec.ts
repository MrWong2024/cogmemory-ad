import OSS from 'ali-oss';
import type { OssStorageConfig } from '../src/modules/storage/storage-config.service';
import { createOssObjectLister } from './clear-data-oss';

jest.mock('ali-oss', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type MockListResult = {
  objects?: Array<{ name?: string }>;
  nextMarker?: string | null;
  isTruncated: boolean;
};

type MockAliOssClient = {
  list: jest.Mock<Promise<MockListResult>, [Record<string, unknown>]>;
  put: jest.Mock;
  delete: jest.Mock;
  deleteMulti: jest.Mock;
  copy: jest.Mock;
};

const ossClientConstructor = OSS as unknown as jest.Mock<
  MockAliOssClient,
  [Record<string, unknown>]
>;

const OSS_CONFIG: OssStorageConfig = {
  region: 'test-region',
  bucket: 'test-bucket',
  internalEndpoint: 'internal-endpoint-test-value',
  publicEndpoint: 'public-endpoint-test-value',
  accessKeyId: 'test-access-key-id',
  accessKeySecret: 'test-access-key-secret',
  objectPrefix: 'cogmemory_ad/development',
};

function createClient(): MockAliOssClient {
  return {
    list: jest.fn<Promise<MockListResult>, [Record<string, unknown>]>(),
    put: jest.fn(),
    delete: jest.fn(),
    deleteMulti: jest.fn(),
    copy: jest.fn(),
  };
}

describe('clear-data OSS object lister', () => {
  beforeEach(() => {
    ossClientConstructor.mockReset();
  });

  it('uses the internal endpoint and exhausts marker pagination for one exact prefix', async () => {
    const client = createClient();
    const prefix = 'cogmemory_ad/development/clinical-evidence/';
    client.list
      .mockResolvedValueOnce({
        objects: [{ name: `${prefix}one` }, { name: `${prefix}two` }],
        nextMarker: 'next-page-marker',
        isTruncated: true,
      })
      .mockResolvedValueOnce({
        objects: [{ name: `${prefix}two` }, { name: `${prefix}three` }],
        nextMarker: null,
        isTruncated: false,
      });
    ossClientConstructor.mockReturnValue(client);

    const objectKeys =
      await createOssObjectLister(OSS_CONFIG).listObjectKeys(prefix);

    expect(ossClientConstructor).toHaveBeenCalledWith({
      region: 'test-region',
      bucket: 'test-bucket',
      endpoint: 'internal-endpoint-test-value',
      accessKeyId: 'test-access-key-id',
      accessKeySecret: 'test-access-key-secret',
      secure: true,
    });
    expect(client.list.mock.calls).toEqual([
      [{ prefix, 'max-keys': 1000 }],
      [{ prefix, marker: 'next-page-marker', 'max-keys': 1000 }],
    ]);
    expect(objectKeys).toEqual([
      `${prefix}one`,
      `${prefix}two`,
      `${prefix}three`,
    ]);
    expect(client.put).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
    expect(client.deleteMulti).not.toHaveBeenCalled();
    expect(client.copy).not.toHaveBeenCalled();
  });

  it('fails safely when the provider list call fails', async () => {
    const client = createClient();
    const sensitiveObjectKey =
      'cogmemory_ad/development/clinical-evidence/private-object';
    client.list.mockRejectedValue(
      new Error(
        `provider failure test-bucket test-access-key-secret ${sensitiveObjectKey}`,
      ),
    );
    ossClientConstructor.mockReturnValue(client);

    const error = await createOssObjectLister(OSS_CONFIG)
      .listObjectKeys('cogmemory_ad/development/clinical-evidence/')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Failed to list OSS cleanup namespace',
    );
    expect((error as Error).message).not.toContain('test-bucket');
    expect((error as Error).message).not.toContain('test-access-key-secret');
    expect((error as Error).message).not.toContain(sensitiveObjectKey);
  });

  it('fails closed on invalid pagination or an out-of-scope response', async () => {
    const invalidMarkerClient = createClient();
    invalidMarkerClient.list.mockResolvedValue({
      objects: [],
      nextMarker: null,
      isTruncated: true,
    });
    ossClientConstructor.mockReturnValueOnce(invalidMarkerClient);

    await expect(
      createOssObjectLister(OSS_CONFIG).listObjectKeys(
        'cogmemory_ad/development/clinical-evidence/',
      ),
    ).rejects.toThrow('Failed to list OSS cleanup namespace');

    const foreignObjectClient = createClient();
    foreignObjectClient.list.mockResolvedValue({
      objects: [
        {
          name: 'cogmemory_ad/production/clinical-evidence/foreign-object',
        },
      ],
      nextMarker: null,
      isTruncated: false,
    });
    ossClientConstructor.mockReturnValueOnce(foreignObjectClient);

    await expect(
      createOssObjectLister(OSS_CONFIG).listObjectKeys(
        'cogmemory_ad/development/clinical-evidence/',
      ),
    ).rejects.toThrow('Failed to list OSS cleanup namespace');
  });
});
