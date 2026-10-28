import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AiService } from './ai.service';

class EnrichDto {
  @IsOptional()
  @IsBoolean()
  apply?: boolean;
}

/**
 * AI 辅助分类（M1-7）
 * POST /api/admin/templates/:id/ai-enrich   body: { apply?: boolean }
 * 默认仅生成建议（存 meta.aiSuggestion），apply=true 时直接写入（仅草稿/驳回态安全期使用）
 */
@Controller('admin/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post(':id/ai-enrich')
  enrich(@Param('id', ParseIntPipe) id: number, @Body() dto: EnrichDto) {
    return this.ai.enrichTemplate(id, dto.apply === true);
  }
}
