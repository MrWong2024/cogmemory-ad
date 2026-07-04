// backend/src/modules/storage/fake-storage.service.ts
import { Injectable } from '@nestjs/common';
import { StorageDriver } from './storage.constants';
import { StorageConfigService } from './storage-config.service';
import {
  SignedUrlOptions,
  SignedUrlResult,
  StorageService,
  UploadedFileResult,
  UploadFileInput,
} from './storage.interface';

@Injectable()
export class FakeStorageService implements StorageService {
  readonly driver: StorageDriver = 'fake';

  constructor(private readonly storageConfigService: StorageConfigService) {}

  uploadFile(input: UploadFileInput): Promise<UploadedFileResult> {
    return Promise.resolve({
      objectKey: input.objectKey,
      bucket: this.storageConfigService.getFakeBucket(),
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
    });
  }

  getSignedUrl(
    objectKey: string,
    options: SignedUrlOptions,
  ): Promise<SignedUrlResult> {
    const expiresAt = new Date(Date.now() + options.expiresInSeconds * 1000);
    const encodedKey = objectKey
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');

    return Promise.resolve({
      url: `https://fake-storage.local/${encodedKey}?expires=${Math.floor(
        expiresAt.getTime() / 1000,
      )}`,
      expiresAt,
    });
  }

  deleteObject(): Promise<void> {
    return Promise.resolve();
  }
}
