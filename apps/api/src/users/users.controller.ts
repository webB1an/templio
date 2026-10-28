import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UserJwtAuthGuard, UserJwtPayload } from './user-jwt.guard';

class WxLoginDto {
  @IsString()
  @Length(1, 128)
  code!: string;
}

/**
 * 用户端接口
 * POST /api/users/wx-login   小程序登录（code 换 token，5次/分钟限速）
 * GET  /api/users/me         当前用户信息 + 积分余额
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('wx-login')
  wxLogin(@Body() dto: WxLoginDto) {
    return this.users.wxLogin(dto.code);
  }

  @Get('me')
  @UseGuards(UserJwtAuthGuard)
  me(@Req() req: { user: UserJwtPayload }) {
    return this.users.me(req.user.sub);
  }
}
