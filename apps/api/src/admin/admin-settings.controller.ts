import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "./auth.guard";
import { AdminAiAutoService } from "./admin-ai-auto.service";

@Controller("admin/settings")
@UseGuards(AdminAuthGuard)
export class AdminSettingsController {
  constructor(private readonly aiAuto: AdminAiAutoService) {}

  @Get("ai-auto")
  aiAutoStatus() {
    return this.aiAuto.getStatus();
  }

  @Patch("ai-auto")
  updateAiAuto(@Body() body: { enabled?: unknown }) {
    if (typeof body.enabled !== "boolean") {
      throw new BadRequestException("enabled 必须是布尔值");
    }
    return this.aiAuto.setEnabled(body.enabled);
  }
}
