import { Body, Controller, Delete, Get, Injectable, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BannerLinkType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { HomeService } from './home.service';

/**
 * 公开首页接口
 * GET /api/home/overview   统计 + 热搜词
 * GET /api/home/banners    启用中的轮播
 * GET /api/home/sections   楼层（热门/最新）
 */
@Controller('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get('overview')
  overview() {
    return this.home.overview();
  }

  @Get('banners')
  banners() {
    return this.home.banners();
  }

  @Get('sections')
  sections() {
    return this.home.sections();
  }
}

class CreateBannerDto {
  @IsString()
  @Length(1, 512)
  image!: string;

  @IsOptional()
  @IsEnum(BannerLinkType)
  linkType?: BannerLinkType;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  linkTarget?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class UpdateBannerDto {
  @IsOptional()
  @IsString()
  @Length(1, 512)
  image?: string;

  @IsOptional()
  @IsEnum(BannerLinkType)
  linkType?: BannerLinkType;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  linkTarget?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * 管理端 Banner 管理
 * GET/POST /api/admin/banners  PATCH/DELETE /api/admin/banners/:id
 */
@Injectable()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/banners')
export class AdminBannersController {
  constructor(private readonly home: HomeService) {}

  @Get()
  list() {
    return this.home.listBanners();
  }

  @Post()
  create(@Body() dto: CreateBannerDto) {
    return this.home.createBanner({
      ...dto,
      startAt: dto.startAt ? new Date(dto.startAt) : null,
      endAt: dto.endAt ? new Date(dto.endAt) : null,
    });
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBannerDto) {
    return this.home.updateBanner(id, {
      ...dto,
      startAt: dto.startAt === undefined ? undefined : dto.startAt ? new Date(dto.startAt) : null,
      endAt: dto.endAt === undefined ? undefined : dto.endAt ? new Date(dto.endAt) : null,
    });
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.home.deleteBanner(id);
  }
}
