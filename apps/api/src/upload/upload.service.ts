import { Injectable, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 10 * 1024 * 1024; // 单图 10MB（PRD §4.4）

@Injectable()
export class UploadService {
  /** 存储根目录（生产：/www/wwwroot/templio/uploads，由 Nginx /uploads/ 托管） */
  private readonly uploadDir =
    process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  /** 生成访问 URL 的域名前缀 */
  private readonly publicBaseUrl =
    process.env.PUBLIC_BASE_URL || 'https://templio.wdbzk.com';

  async saveImage(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('缺少图片文件');
    if (!IMAGE_MIMES.has(file.mimetype)) {
      throw new BadRequestException('仅支持 jpg / png / webp 图片');
    }
    if (file.size > MAX_SIZE) {
      throw new PayloadTooLargeException('图片不能超过 10MB');
    }

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dir = path.join(this.uploadDir, yyyy, mm);
    await fs.mkdir(dir, { recursive: true });

    const name = crypto.randomBytes(12).toString('hex');

    try {
      // 主图：最长边压到 1600，webp q82（截图场景足够清晰且省磁盘）
      const mainBuf = await sharp(file.buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      // 缩略图：宽 480，列表用
      const thumbBuf = await sharp(file.buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: 480, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();

      await Promise.all([
        fs.writeFile(path.join(dir, `${name}.webp`), mainBuf),
        fs.writeFile(path.join(dir, `${name}-thumb.webp`), thumbBuf),
      ]);

      const base = `${this.publicBaseUrl}/uploads/${yyyy}/${mm}`;
      return {
        url: `${base}/${name}.webp`,
        thumbUrl: `${base}/${name}-thumb.webp`,
        width: await sharp(mainBuf).metadata().then((m) => m.width ?? null),
        height: await sharp(mainBuf).metadata().then((m) => m.height ?? null),
        size: mainBuf.length,
      };
    } catch {
      throw new BadRequestException('图片解析失败，文件可能已损坏');
    }
  }
}
