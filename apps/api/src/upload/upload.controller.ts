import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadService } from './upload.service';

/** 管理端图片上传（封面 + 预览截图）。Multipart 字段名：file / files */
@Controller('admin/uploads')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploads: UploadService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadImage(@UploadedFile() file?: Express.Multer.File) {
    return this.uploads.saveImage(file!);
  }

  /** 批量上传预览截图，单次最多 5 张（PRD §4.4 上限） */
  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadImages(@UploadedFiles() files?: Express.Multer.File[]) {
    if (!files || files.length === 0) throw new BadRequestException('缺少图片文件');
    const results = [];
    for (const f of files) {
      results.push(await this.uploads.saveImage(f));
    }
    return { items: results };
  }
}
