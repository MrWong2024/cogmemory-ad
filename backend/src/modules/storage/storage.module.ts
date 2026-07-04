// backend/src/modules/storage/storage.module.ts
import { Module } from '@nestjs/common';
import { FakeStorageService } from './fake-storage.service';
import { OssStorageService } from './oss-storage.service';
import { STORAGE_SERVICE } from './storage.constants';
import { StorageConfigService } from './storage-config.service';

@Module({
  providers: [
    StorageConfigService,
    {
      provide: STORAGE_SERVICE,
      inject: [StorageConfigService],
      useFactory: (storageConfigService: StorageConfigService) => {
        if (storageConfigService.getDriver() === 'oss') {
          return new OssStorageService(storageConfigService);
        }

        return new FakeStorageService(storageConfigService);
      },
    },
  ],
  exports: [STORAGE_SERVICE, StorageConfigService],
})
export class StorageModule {}
