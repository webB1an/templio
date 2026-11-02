import { Module } from "@nestjs/common";
import { AdminAiController } from "./admin-ai.controller";
import { AdminAiService } from "./admin-ai.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminImportController } from "./admin-import.controller";
import { AdminTemplatesController } from "./admin-templates.controller";
import { AdminAuthGuard } from "./auth.guard";
import { AdminAuthService } from "./auth.service";
import { AdminImportService } from "./admin-import.service";
import { AdminTemplatesService } from "./admin-templates.service";
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
    DeepSeekService,
    AdminAuthGuard,
  ],
})
export class AdminModule {}
