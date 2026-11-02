import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { PublicTemplatesService } from "./templates.service";

@Controller("templates")
export class PublicTemplatesController {
  constructor(private readonly templates: PublicTemplatesService) {}

  @Get("facets")
  facets() {
    return this.templates.facets();
  }

  @Get()
  list(
    @Query("q") q?: string,
    @Query("category") category?: string,
    @Query("tag") tag?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.templates.list({ q, category, tag, limit, offset });
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const item = await this.templates.detail(id);
    if (!item) throw new NotFoundException("模板不存在或已下架");
    return item;
  }
}
