import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { promises as fs } from 'node:fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { decodeOriginalName, stagingStorage } from '../common/multipart';
import { RenderService } from '../render/render.service';
import { StorageCoordinatorService } from '../storage/storage-drives.service';
import { CreateTemplateDto, BatchReviewDto, ListTemplateQueryDto, ReviewDto, UpdateTemplateDto } from './dto';
import { TemplatesService, inferFormat } from './templates.service';

interface AdminReq {
  admin: { sub: number; role: string };
}

/** 管理端模板管理与审核流 */
@Controller('admin/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminTemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly render: RenderService,
    private readonly storage: StorageCoordinatorService,
  ) {}

  @Post()
  create(@Body() dto: CreateTemplateDto, @Req() req: AdminReq) {
    return this.templates.create(dto, req.admin.sub);
  }

  /**
   * 单个模板文件一站式处理：生成首图/预览图 + 上传网盘并生成永久分享链接。
   * 供「编辑模板」页上传原文件时使用（批量场景走 /admin/imports 流水线）。
   */
  @Post('publish-file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: stagingStorage,
      limits: { fileSize: Number(process.env.IMPORT_MAX_FILE_MB || 300) * 1024 * 1024 },
    }),
  )
  async publishFile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { provider?: string; maxPages?: string },
  ) {
    if (!file) throw new BadRequestException('缺少模板文件');
    const originalName = decodeOriginalName(file.originalname);
    const notes: string[] = [];
    try {
      const provider =
        body.provider === 'quark' || body.provider === 'baidu'
          ? body.provider
          : await this.storage.resolveProvider();
      let rendered: Awaited<ReturnType<RenderService['renderPreviews']>> = null;
      try {
        rendered = await this.render.renderPreviews(file.path, originalName, {
          maxPages: Math.min(Math.max(Number(body.maxPages) || 6, 1), 20),
        });
        if (!rendered) notes.push('该格式不支持自动生成预览图，请手动上传封面');
      } catch (error) {
        notes.push(`预览图生成失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
      const share = await this.storage.uploadAndShare(file.path, provider, {
        title: originalName,
        remoteDir: 'templio',
      });
      return {
        filename: originalName,
        format: inferFormat(originalName),
        size: file.size,
        provider: share.provider,
        shareUrl: share.passcode
          ? `${share.url}${share.url.includes('?') ? '&' : '?'}pwd=${encodeURIComponent(share.passcode)}`
          : share.url,
        passcode: share.passcode ?? null,
        cover: rendered?.cover ?? null,
        coverThumb: rendered?.coverThumb ?? null,
        previews: rendered?.previews ?? [],
        pages: rendered?.pages ?? 0,
        notes,
      };
    } finally {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  /** 批量审核（仅 pending_review 会被处理，其余逐条报失败原因） */
  @Post('batch-review')
  batchReview(@Body() dto: BatchReviewDto, @Req() req: AdminReq) {
    return this.templates.batchReview(dto.ids, req.admin.sub, dto.action, dto.note);
  }

  /** 批量提审（draft/rejected/offline → pending_review） */
  @Post('batch-submit')
  batchSubmit(@Body() body: { ids: number[] }, @Req() req: AdminReq) {
    return this.templates.batchSubmit(body.ids ?? [], req.admin.sub);
  }

  @Get()
  list(@Query() query: ListTemplateQueryDto) {
    return this.templates.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.templates.detail(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.templates.remove(id);
  }

  @Post(':id/submit')
  submit(@Param('id', ParseIntPipe) id: number, @Req() req: AdminReq) {
    return this.templates.submit(id, req.admin.sub);
  }

  @Post(':id/review')
  review(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewDto, @Req() req: AdminReq) {
    return this.templates.review(id, req.admin.sub, dto.action, dto.note);
  }

  @Post(':id/offline')
  offline(@Param('id', ParseIntPipe) id: number, @Body() body: { note?: string }, @Req() req: AdminReq) {
    return this.templates.offline(id, req.admin.sub, body?.note);
  }

  @Post(':id/check-files')
  checkFiles(@Param('id', ParseIntPipe) id: number) {
    return this.templates.checkFiles(id);
  }
}
