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
  async updateAiAuto(@Body() body: { enabled?: unknown; minConfidence?: unknown }) {
    let changed = false;

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") throw new BadRequestException("enabled 必须是布尔值");
      await this.aiAuto.setEnabled(body.enabled);
      changed = true;
    }

    if (body.minConfidence !== undefined) {
      if (typeof body.minConfidence !== "number" || !Number.isFinite(body.minConfidence)) {
        throw new BadRequestException("minConfidence 必须是数字");
      }
      if (body.minConfidence < 0.5 || body.minConfidence > 1) {
        throw new BadRequestException("minConfidence 必须在 0.5–1 之间");
      }
      await this.aiAuto.setMinConfidence(body.minConfidence);
      changed = true;
    }

    if (!changed) throw new BadRequestException("没有需要更新的字段");
    return this.aiAuto.getStatus();
  }
}
