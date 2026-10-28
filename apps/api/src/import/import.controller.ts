import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { decodeOriginalName, stagingStorage } from '../common/multipart';
import { ImportService } from './import.service';

interface AdminReq {
  admin: { sub: number; role: string };
}

const MAX_FILE_SIZE = Number(process.env.IMPORT_MAX_FILE_MB || 300) * 1024 * 1024;
const MAX_FILES = Number(process.env.IMPORT_MAX_FILES || 50);

/**
 * 批量导入全自动流水线（资源管理）：
 * POST /api/admin/imports              多文件上传建批次（原文件 → 预览图 → 网盘分享链接 → AI → 提审）
 * GET  /api/admin/imports              批次列表
 * GET  /api/admin/imports/:id          批次详情（含每条任务阶段进度）
 * GET  /api/admin/imports/tasks/:id    单任务状态（轻量轮询）
 * POST /api/admin/imports/tasks/:id/retry  失败重试（断点续跑）
 */
@Controller('admin/imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: stagingStorage,
      limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
    }),
  )
  async create(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: Record<string, string | undefined>,
    @Req() req: AdminReq,
  ) {
    if (!files?.length) throw new BadRequestException('请至少上传 1 个模板文件');
    const provider = body.provider === 'quark' || body.provider === 'baidu' ? body.provider : undefined;
    return this.imports.createBatch(
      files.map((file) => ({ ...file, originalname: decodeOriginalName(file.originalname) })),
      {
        provider,
        useAi: body.useAi !== 'false',
        autoSubmit: body.autoSubmit === 'true',
        maxPages: Math.min(Math.max(Number(body.maxPages) || 6, 1), 20),
      },
      req.admin.sub,
    );
  }

  @Get()
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.imports.listBatches(
      Math.max(Number(page) || 1, 1),
      Math.min(Math.max(Number(pageSize) || 20, 1), 100),
    );
  }

  @Get('tasks/:id')
  task(@Param('id', ParseIntPipe) id: number) {
    return this.imports.taskDetail(id);
  }

  @Post('tasks/:id/retry')
  retry(@Param('id', ParseIntPipe) id: number) {
    return this.imports.retry(id);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.imports.batchDetail(id);
  }
}
