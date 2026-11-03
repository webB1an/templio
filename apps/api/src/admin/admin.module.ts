import { Module } from "@nestjs/common";
import { LoginRateLimitGuard } from "../common/login-rate-limit.guard";
import { AdminAiController } from "./admin-ai.controller";
import { AdminAiService } from "./admin-ai.service";
import { AdminAiAutoService } from "./admin-ai-auto.service";
import { AdminSettingsController } from "./admin-settings.controller";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminImportController } from "./admin-import.controller";
import { AdminTemplatesController } from "./admin-templates.controller";
import { AdminAuthGuard } from "./auth.guard";
import { AdminAuthService } from "./auth.service";
import { AdminImportService } from "./admin-import.service";
import { AdminTemplatesService } from "./admin-templates.service";
import { AdminNetdiskSyncService } from "./admin-netdisk-sync.service";
import { DeepSeekService } from "./deepseek.service";
import { StorageController } from "./storage.controller";
import { StorageAccountService } from "./netdisk/storage-account.service";
import {
  BaiduStorageService,
  QuarkStorageService,
  StorageCoordinatorService,
} from "./netdisk/storage-drives.service";

@Module({
  controllers: [
    AdminAuthController,
    AdminTemplatesController,
    AdminImportController,
    AdminAiController,
    AdminSettingsController,
    StorageController,
  ],
  providers: [
    AdminAuthService,
    AdminTemplatesService,
    AdminImportService,
    AdminAiService,
    AdminAiAutoService,
    AdminNetdiskSyncService,
    DeepSeekService,
    AdminAuthGuard,
    LoginRateLimitGuard,
    StorageAccountService,
    QuarkStorageService,
    BaiduStorageService,
    StorageCoordinatorService,
  ],
})
export class AdminModule {}
