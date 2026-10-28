import { Module } from '@nestjs/common';
import { StorageAccountService } from './storage-account.service';
import { BaiduStorageService, QuarkStorageService, StorageCoordinatorService } from './storage-drives.service';
import { StorageController } from './storage.controller';

@Module({
  controllers: [StorageController],
  providers: [StorageAccountService, QuarkStorageService, BaiduStorageService, StorageCoordinatorService],
  exports: [StorageCoordinatorService, StorageAccountService],
})
export class StorageModule {}
