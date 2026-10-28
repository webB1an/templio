import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AiService } from './ai.service';

class EnrichDto {
  @IsOptional()
  @IsBoolean()
  apply?: boolean;

  /** 是否允许 AI 自动创建缺失的分类/标签，默认 true */
  @IsOptional()
  @IsBoolean()
  autoCreateCategory?: boolean;
}

/**
 * AI 辅助分类（M1-7）
 * POST /api/admin/templates/:id/ai-enrich   body: { apply?: boolean, autoCreateCategory?: boolean }
 * 默认仅生成建议（存 meta.aiSuggestion，分类会按需落库），apply=true 时直接写入模板字段
 */
@Controller('admin/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post(':id/ai-enrich')
  enrich(@Param('id', ParseIntPipe) id: number, @Body() dto: EnrichDto) {
    return this.ai.enrichTemplate(id, dto.apply === true, {
      autoCreateCategory: dto.autoCreateCategory !== false,
    });
  }
}
