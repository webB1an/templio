import { Module } from "@nestjs/common";
import { AdminAiController } from "./admin-ai.controller";
import { AdminAiService } from "./admin-ai.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminImportController } from "./admin-import.controller";
import { AdminTemplatesController } from "./admin-templates.controller";
import { AdminAuthGuard } from "./auth.guard";
import { AdminAuthService } from "./auth.service";
import { LoginRateLimitGuard } from "../common/login-rate-limit.guard";
import { AdminImportService } from "./admin-import.service";
import { AdminTemplatesService } from "./admin-templates.service";
import { AdminNetdiskSyncService } from "./admin-netdisk-sync.service";
import { DeepSeekService } from "./deepseek.service";

@Module({
  controllers: [
    AdminAuthController,
    AdminTemplatesController,
    AdminImportController,
    AdminAiController,
  ],
  providers: [
    AdminAuthService,
    AdminTemplatesService,
    AdminImportService,
    AdminAiService,
    AdminNetdiskSyncService,
    DeepSeekService,
    AdminAuthGuard,
    LoginRateLimitGuard,
  ],
})
export class AdminModule {}
