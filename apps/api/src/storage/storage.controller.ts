import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NetdiskType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { StorageAccountService } from './storage-account.service';

class CreateAccountDto {
  @IsEnum(NetdiskType)
  provider!: NetdiskType;

  @IsString()
  @Length(1, 64)
  label!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/**
 * 网盘账号管理（管理端）——只负责账号本身，不做文件上传与分享；
 * 文件上传分享由资源管理的批量导入/模板编辑自动完成。
 * GET/POST /api/admin/storage-accounts          账号列表 / 新增
 * PATCH /:id           改名        POST /:id/default 设默认
 * POST /:id/probe      探测        DELETE /:id       删除
 * POST /:id/baidu-cookie        百度粘贴 Cookie 授权
 * POST /:id/quark-auth/start|finish  夸克授权码授权
 */
@Controller('admin/storage-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageController {
  constructor(private readonly accounts: StorageAccountService) {}

  @Get()
  list() {
    return this.accounts.listAccounts();
  }

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.createAccount(dto);
  }

  @Patch(':id')
  updateLabel(@Param('id') id: string, @Body() body: { label: string }) {
    return this.accounts.updateLabel(id, body.label);
  }

  @Post(':id/default')
  setDefault(@Param('id') id: string) {
    return this.accounts.setDefaultAccount(id);
  }

  @Post(':id/probe')
  probe(@Param('id') id: string) {
    return this.accounts.probeAccount(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.accounts.deleteAccount(id);
  }

  @Post(':id/baidu-cookie')
  saveBaiduCookie(@Param('id') id: string, @Body() body: { cookie: string }) {
    return this.accounts.saveBaiduCookie(id, body.cookie);
  }

  @Post(':id/quark-auth/start')
  startQuarkAuth(@Param('id') id: string) {
    return this.accounts.startQuarkAuth(id);
  }

  @Post(':id/quark-auth/finish')
  finishQuarkAuth(@Param('id') id: string, @Body() body: { code: string }) {
    return this.accounts.finishQuarkAuth(id, body.code);
  }
}
