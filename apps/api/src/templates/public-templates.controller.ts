import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OptionalUserJwtGuard, UserJwtPayload } from '../users/user-jwt.guard';
import { PublicTemplatesService } from './public-templates.service';

/**
 * 小程序公开接口（无需登录）
 * GET /api/templates?categoryId=&format=&sort=latest|hot&page=&pageSize=
 * GET /api/templates/search?q=
 * GET /api/templates/:id
 * GET /api/templates/:id/share-links   免费模板换取网盘链接
 * GET /api/templates/:id/related
 */
@Controller('templates')
export class PublicTemplatesController {
  constructor(private readonly templates: PublicTemplatesService) {}

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
  ) {
    return this.templates.search(q ?? '', page, pageSize);
  }

  @Get()
  list(
    @Query('categoryId', new DefaultValuePipe(0), ParseIntPipe) categoryId: number,
    @Query('format') format: string,
    @Query('sort') sort: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
  ) {
    return this.templates.list({
      categoryId: categoryId > 0 ? categoryId : undefined,
      format: format || undefined,
      sort: sort || undefined,
      page,
      pageSize,
    });
  }

  @Get(':id/share-links')
  @UseGuards(OptionalUserJwtGuard)
  shareLinks(@Req() req: { user?: UserJwtPayload }, @Param('id', ParseIntPipe) id: number) {
    return this.templates.getShareLinks(id, req.user?.sub);
  }

  @Get(':id/related')
  related(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
  ) {
    return this.templates.related(id, limit);
  }

  @Get(':id')
  @UseGuards(OptionalUserJwtGuard)
  detail(@Req() req: { user?: UserJwtPayload }, @Param('id', ParseIntPipe) id: number) {
    return this.templates.detail(id, req.user?.sub);
  }
}
