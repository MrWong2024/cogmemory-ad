// backend/src/modules/storage/storage.interface.ts
import { StorageDriver } from './storage.constants';

export type UploadFileInput = {
  objectKey: string;
  buffer: Buffer;
  sizeBytes: number;
  mimeType: string;
};

export type UploadedFileResult = {
  objectKey: string;
  bucket: string;
  sizeBytes: number;
  mimeType: string;
};

export type SignedUrlOptions = {
  expiresInSeconds: number;
};

export type SignedUrlResult = {
  url: string;
  expiresAt: Date;
};

export interface StorageService {
  readonly driver: StorageDriver;
  uploadFile(input: UploadFileInput): Promise<UploadedFileResult>;
  getSignedUrl(
    objectKey: string,
    options: SignedUrlOptions,
  ): Promise<SignedUrlResult>;
  deleteObject(objectKey: string): Promise<void>;
}
