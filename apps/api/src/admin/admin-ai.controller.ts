import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "./auth.guard";
import { AdminAiService } from "./admin-ai.service";

@Controller("admin/ai")
@UseGuards(AdminAuthGuard)
export class AdminAiController {
  constructor(private readonly ai: AdminAiService) {}

  @Post("templates/:id")
  annotate(@Param("id") id: string) {
    return this.ai.annotate(id);
  }

  @Post("templates/:id/apply")
  apply(@Param("id") id: string) {
    return this.ai.apply(id);
  }
}
