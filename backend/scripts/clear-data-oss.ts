import OSS from 'ali-oss';
import type { OssStorageConfig } from '../src/modules/storage/storage-config.service';

type AliOssListClientOptions = {
  region: string;
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  secure: boolean;
};

type AliOssListQuery = {
  prefix: string;
  marker?: string;
  'max-keys': number;
};

type AliOssListResult = {
  objects?: Array<{ name?: string }>;
  nextMarker?: string | null;
  isTruncated: boolean;
};

type AliOssListClient = {
  list(query: AliOssListQuery): Promise<AliOssListResult>;
};

type AliOssListConstructor = new (
  options: AliOssListClientOptions,
) => AliOssListClient;

const OssListClient = OSS as unknown as AliOssListConstructor;

export type OssObjectLister = {
  listObjectKeys(prefix: string): Promise<string[]>;
};

export function createOssObjectLister(
  config: OssStorageConfig,
): OssObjectLister {
  const client = new OssListClient({
    region: config.region,
    bucket: config.bucket,
    endpoint: config.internalEndpoint,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    secure: true,
  });

  return {
    async listObjectKeys(prefix: string): Promise<string[]> {
      const objectKeys = new Set<string>();
      let marker: string | undefined;
      let hasMore = true;

      try {
        while (hasMore) {
          const result = await client.list({
            prefix,
            ...(marker ? { marker } : {}),
            'max-keys': 1000,
          });

          for (const object of result.objects ?? []) {
            if (
              typeof object.name !== 'string' ||
              !object.name.startsWith(prefix)
            ) {
              throw new Error('OSS returned an object outside cleanup scope');
            }
            objectKeys.add(object.name);
          }

          if (!result.isTruncated) {
            hasMore = false;
            continue;
          }

          if (!result.nextMarker || result.nextMarker === marker) {
            throw new Error('OSS returned an invalid pagination marker');
          }
          marker = result.nextMarker;
        }
      } catch {
        throw new Error('Failed to list OSS cleanup namespace');
      }

      return [...objectKeys];
    },
  };
}
