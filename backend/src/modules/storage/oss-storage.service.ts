// backend/src/modules/storage/oss-storage.service.ts
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OSS from 'ali-oss';
import { StorageDriver } from './storage.constants';
import {
  OssStorageConfig,
  StorageConfigService,
} from './storage-config.service';
import {
  SignedUrlOptions,
  SignedUrlResult,
  StorageService,
  UploadedFileResult,
  UploadFileInput,
} from './storage.interface';

type AliOssClientOptions = {
  region: string;
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
};

type AliOssClient = {
  put(
    name: string,
    file: Buffer,
    options?: { mime?: string },
  ): Promise<unknown>;
  delete(name: string): Promise<unknown>;
  signatureUrl(
    name: string,
    options?: { expires?: number; method?: string },
  ): string;
};

type AliOssConstructor = new (options: AliOssClientOptions) => AliOssClient;

const OssClient = OSS as unknown as AliOssConstructor;

@Injectable()
export class OssStorageService implements StorageService {
  readonly driver: StorageDriver = 'oss';

  constructor(private readonly storageConfigService: StorageConfigService) {}

  async uploadFile(input: UploadFileInput): Promise<UploadedFileResult> {
    const config = this.storageConfigService.getOssConfigOrThrow();
    const client = this.createClient(config, config.internalEndpoint);

    try {
      await client.put(input.objectKey, input.buffer, {
        mime: input.mimeType,
      });
    } catch (error) {
      throw this.toStorageError(error, 'Failed to upload file to OSS');
    }

    return {
      objectKey: input.objectKey,
      bucket: config.bucket,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
    };
  }

  getSignedUrl(
    objectKey: string,
    options: SignedUrlOptions,
  ): Promise<SignedUrlResult> {
    return Promise.resolve()
      .then(() => {
        const config = this.storageConfigService.getOssConfigOrThrow();
        const client = this.createClient(config, config.publicEndpoint);
        const expiresAt = new Date(
          Date.now() + options.expiresInSeconds * 1000,
        );

        return {
          url: client.signatureUrl(objectKey, {
            expires: options.expiresInSeconds,
            method: 'GET',
          }),
          expiresAt,
        };
      })
      .catch((error: unknown) => {
        throw this.toStorageError(error, 'Failed to generate OSS signed URL');
      });
  }

  async deleteObject(objectKey: string): Promise<void> {
    const config = this.storageConfigService.getOssConfigOrThrow();
    const client = this.createClient(config, config.internalEndpoint);

    try {
      await client.delete(objectKey);
    } catch {
      return undefined;
    }
  }

  private createClient(config: OssStorageConfig, endpoint: string) {
    return new OssClient({
      region: config.region,
      bucket: config.bucket,
      endpoint,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
    });
  }

  private toStorageError(error: unknown, message: string): Error {
    if (error instanceof ServiceUnavailableException) {
      return error;
    }

    return new ServiceUnavailableException(message);
  }
}
