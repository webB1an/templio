import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminImportController } from "./admin-import.controller";
import { AdminTemplatesController } from "./admin-templates.controller";
import { AdminAuthGuard } from "./auth.guard";
import { AdminAuthService } from "./auth.service";
import { AdminImportService } from "./admin-import.service";
import { AdminTemplatesService } from "./admin-templates.service";

@Module({
  controllers: [AdminAuthController, AdminTemplatesController, AdminImportController],
  providers: [AdminAuthService, AdminTemplatesService, AdminImportService, AdminAuthGuard],
})
export class AdminModule {}
