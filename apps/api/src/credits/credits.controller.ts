import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { UserJwtAuthGuard, UserJwtPayload } from '../users/user-jwt.guard';
import { CreditsService } from './credits.service';

class ShareEventDto {
  @IsInt()
  @Type(() => Number)
  templateId!: number;

  @IsInt()
  @Type(() => Number)
  sharerId!: number;
}

/**
 * 用户积分接口（全部需登录）
 * GET  /api/credits/account       余额 + 今日签到状态
 * GET  /api/credits/ledger        积分流水
 * POST /api/credits/checkin       每日签到
 * POST /api/credits/share-event   分享打开上报（给分享者计奖）
 * POST /api/credits/unlock/:id    积分解锁模板
 */
@Controller('credits')
@UseGuards(UserJwtAuthGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get('account')
  account(@Req() req: { user: UserJwtPayload }) {
    return this.credits.getBalance(req.user.sub);
  }

  @Get('ledger')
  ledger(
    @Req() req: { user: UserJwtPayload },
    @Query('page') page?: string,
  ) {
    return this.credits.ledger(req.user.sub, Number(page) > 0 ? Number(page) : 1);
  }

  @Post('checkin')
  checkin(@Req() req: { user: UserJwtPayload }) {
    return this.credits.checkin(req.user.sub);
  }

  @Post('share-event')
  shareEvent(@Req() req: { user: UserJwtPayload }, @Body() dto: ShareEventDto) {
    return this.credits.shareEvent(req.user.sub, dto.templateId, dto.sharerId);
  }

  @Post('unlock/:id')
  unlock(@Req() req: { user: UserJwtPayload }, @Param('id', ParseIntPipe) id: number) {
    return this.credits.unlockTemplate(req.user.sub, id);
  }
}
