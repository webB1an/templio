import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NetdiskType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { StorageCoordinatorService } from './storage-drives.service';
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
 * 网盘账号管理与上传分享（管理端）：
 * GET/POST /api/admin/storage-accounts          账号列表 / 新增
 * PATCH /:id           改名        POST /:id/default 设默认
 * POST /:id/probe      探测        DELETE /:id       删除
 * POST /:id/baidu-cookie        百度粘贴 Cookie 授权
 * POST /:id/quark-auth/start|finish  夸克授权码授权
 * POST /upload-share   上传文件→网盘→生成永久分享链接
 */
@Controller('admin/storage-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageController {
  constructor(
    private readonly accounts: StorageAccountService,
    private readonly coordinator: StorageCoordinatorService,
  ) {}

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

  /** 上传文件 → 网盘 → 生成永久公开分享链接（模板文件入库用） */
  @Post('upload-share')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 * 1024 } }))
  async uploadShare(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { provider?: NetdiskType; accountId?: string; title?: string },
  ) {
    if (!file) throw new BadRequestException('缺少文件');
    const provider = body.provider === NetdiskType.baidu ? NetdiskType.baidu : NetdiskType.quark;
    const tmpPath = this.persistTmp(file);
    try {
      return await this.coordinator.uploadAndShare(tmpPath, provider, {
        accountId: body.accountId,
        title: body.title || file.originalname,
      });
    } finally {
      rmSync(tmpPath, { force: true });
    }
  }

  private persistTmp(file: Express.Multer.File): string {
    // 保留原始扩展名，便于夸克 skill / bdpan 识别
    const tmpRoot = resolve(process.cwd(), '.storage-tmp');
    mkdirSync(tmpRoot, { recursive: true });
    const p = join(tmpRoot, `up-${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname || '')}`);
    writeFileSync(p, file.buffer);
    if (!existsSync(p)) throw new BadRequestException('临时文件写入失败');
    return p;
  }
}
