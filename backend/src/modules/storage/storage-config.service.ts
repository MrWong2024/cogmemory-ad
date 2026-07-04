// backend/src/modules/storage/storage-config.service.ts
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { StorageDriver } from './storage.constants';

export type OssStorageConfig = {
  region: string;
  bucket: string;
  internalEndpoint: string;
  publicEndpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  objectPrefix: string;
};

@Injectable()
export class StorageConfigService {
  getDriver(): StorageDriver {
    const driver = process.env.STORAGE_DRIVER?.trim();

    if (driver === 'fake' || driver === 'oss') {
      return driver;
    }

    return process.env.NODE_ENV === 'production' ? 'oss' : 'fake';
  }

  getObjectPrefix(): string {
    return this.optional('OSS_OBJECT_PREFIX') ?? 'cogmemory_ad';
  }

  getFakeBucket(): string {
    return this.optional('OSS_BUCKET') ?? 'fake-storage';
  }

  getOssConfigOrThrow(): OssStorageConfig {
    return {
      region: this.required('OSS_REGION'),
      bucket: this.required('OSS_BUCKET'),
      internalEndpoint: this.required('OSS_INTERNAL_ENDPOINT'),
      publicEndpoint: this.required('OSS_PUBLIC_ENDPOINT'),
      accessKeyId: this.required('OSS_ACCESS_KEY_ID'),
      accessKeySecret: this.required('OSS_ACCESS_KEY_SECRET'),
      objectPrefix: this.getObjectPrefix(),
    };
  }

  private optional(key: string): string | undefined {
    const value = process.env[key]?.trim();
    return value ? value : undefined;
  }

  private required(key: string): string {
    const value = this.optional(key);

    if (!value) {
      throw new ServiceUnavailableException(
        `OSS storage is not configured: missing ${key}`,
      );
    }

    return value;
  }
}
