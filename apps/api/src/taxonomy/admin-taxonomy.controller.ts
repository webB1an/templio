import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TaxonomyService } from './taxonomy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

export const CATEGORY_DIMENSIONS = ['format', 'scene', 'audience', 'theme'] as const;

class CreateCategoryDto {
  @IsIn(CATEGORY_DIMENSIONS as unknown as string[])
  dimension!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number | null;

  @IsString()
  @Length(1, 64)
  name!: string;

  @IsString()
  @Length(1, 64)
  slug!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;
}

class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  slug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number | null;
}

class CreateTagDto {
  @IsString()
  @Length(1, 64)
  name!: string;
}

class UpdateTagDto {
  @IsString()
  @Length(1, 64)
  name!: string;
}

class ListTagsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/**
 * 管理端分类/标签管理
 * GET    /api/admin/categories?dimension=   扁平列表（含父级信息）
 * POST   /api/admin/categories             创建（一级或二级）
 * PATCH  /api/admin/categories/:id         更新/启停/排序
 * DELETE /api/admin/categories/:id         删除（有子级或关联模板时拒绝）
 * GET    /api/admin/tags                   标签分页列表（含模板计数）
 * POST   /api/admin/tags
 * PATCH  /api/admin/tags/:id
 * DELETE /api/admin/tags/:id
 */
@Injectable()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminTaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get('categories')
  list(@Query('dimension') dimension?: string) {
    return this.taxonomy.adminListCategories(dimension || undefined);
  }

  @Post('categories')
  create(@Body() dto: CreateCategoryDto) {
    return this.taxonomy.createCategory(dto);
  }

  @Patch('categories/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.taxonomy.updateCategory(Number(id), dto);
  }

  @Delete('categories/:id')
  remove(@Param('id') id: string) {
    return this.taxonomy.deleteCategory(Number(id));
  }

  @Get('tags')
  listTags(@Query() q: ListTagsQuery) {
    return this.taxonomy.adminListTags(q.page ?? 1, q.pageSize ?? 50);
  }

  @Post('tags')
  createTag(@Body() dto: CreateTagDto) {
    return this.taxonomy.createTag(dto.name);
  }

  @Patch('tags/:id')
  updateTag(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.taxonomy.updateTag(Number(id), dto.name);
  }

  @Delete('tags/:id')
  removeTag(@Param('id') id: string) {
    return this.taxonomy.deleteTag(Number(id));
  }
}
