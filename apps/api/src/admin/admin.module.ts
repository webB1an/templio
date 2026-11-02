import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminTemplatesController } from "./admin-templates.controller";
import { AdminAuthGuard } from "./auth.guard";
import { AdminAuthService } from "./auth.service";
import { AdminTemplatesService } from "./admin-templates.service";

@Module({
  controllers: [AdminAuthController, AdminTemplatesController],
  providers: [AdminAuthService, AdminTemplatesService, AdminAuthGuard],
})
export class AdminModule {}
