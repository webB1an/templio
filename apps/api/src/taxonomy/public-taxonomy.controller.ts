import { Controller, Get, Query } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';

/**
 * 小程序公开接口
 * GET /api/categories/tree?dimension=   两级分类树（仅启用）
 * GET /api/tags?limit=                  热门标签（按模板使用量）
 */
@Controller()
export class PublicTaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get('categories/tree')
  tree(@Query('dimension') dimension?: string) {
    return this.taxonomy.publicTree(dimension || undefined);
  }

  @Get('tags')
  tags() {
    return this.taxonomy.publicTags();
  }
}
