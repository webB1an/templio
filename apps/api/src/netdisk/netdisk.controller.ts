import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsString, Length } from 'class-validator';
import { NetdiskType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NetdiskService } from './netdisk.service';

class CheckLinkDto {
  @IsEnum(NetdiskType)
  netdiskType!: NetdiskType;

  @IsString()
  @Length(8, 1024)
  url!: string;
}

/** 管理端网盘分享链接健康检查 */
@Controller('admin/netdisk')
@UseGuards(JwtAuthGuard)
export class NetdiskController {
  constructor(private readonly netdisk: NetdiskService) {}

  @Post('check-link')
  checkLink(@Body() dto: CheckLinkDto) {
    return this.netdisk.checkShare(dto.netdiskType, dto.url);
  }
}
