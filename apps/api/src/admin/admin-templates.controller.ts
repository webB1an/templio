import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "./auth.guard";
import { AdminTemplatesService } from "./admin-templates.service";

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class AdminTemplatesController {
  constructor(private readonly templates: AdminTemplatesService) {}

  @Get("stats")
  stats() {
    return this.templates.stats();
  }

  @Get("facets")
  facets() {
    return this.templates.facets();
  }

  @Get("templates")
  list(
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.templates.list({ status, category, q, limit, offset });
  }

  @Patch("templates/:id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.templates.update(id, body);
  }

  @Post("templates/bulk")
  bulk(@Body() body: { ids?: unknown; action?: unknown }) {
    return this.templates.bulk(body.ids, body.action);
  }

  @Put("templates/:id/netdisk")
  saveNetdisk(
    @Param("id") id: string,
    @Body() body: { provider?: unknown; url?: unknown; passcode?: unknown },
  ) {
    return this.templates.saveNetdisk(id, body);
  }

  @Delete("templates/:id/netdisk")
  removeNetdisk(@Param("id") id: string) {
    return this.templates.removeNetdisk(id);
  }
}
