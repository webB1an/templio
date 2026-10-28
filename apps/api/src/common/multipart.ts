import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

/** 大文件暂存目录（原模板文件可能上百 MB，不能进内存） */
export const STAGING_DIR = resolve(
  process.env.IMPORT_STAGING_DIR || join(process.cwd(), '.import-staging'),
);

/** 随机文件名落盘，扩展名保留供格式推断 */
export const stagingStorage = diskStorage({
  destination: (_req, _file, cb) => {
    mkdirSync(STAGING_DIR, { recursive: true });
    cb(null, STAGING_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `imp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
  },
});

/**
 * multipart 文件名按 latin1 解码，中文会变乱码。
 * 仅当按 latin1→utf8 转换后是合法文本时才替换。
 */
export function decodeOriginalName(name: string): string {
  if (!name) return 'unnamed';
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}
