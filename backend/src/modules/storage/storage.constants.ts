// backend/src/modules/storage/storage.constants.ts
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export const STORAGE_DRIVERS = ['fake', 'oss'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

export const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 10 * 60;
