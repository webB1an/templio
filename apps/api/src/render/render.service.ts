import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import sharp from 'sharp';
import { runCli } from '../storage/cli';

/** 渲染结果：首图 + 预览图（均为公网 URL） */
export interface RenderResult {
  /** 首图，用于列表封面 */
  cover: string;
  /** 首图缩略图 */
  coverThumb: string;
  /** 预览图（第 1 张与 cover 相同；无法多页渲染时只有 1 张） */
  previews: string[];
  /** 生成的预览页数 */
  pages: number;
  /** 预览图来源，便于运营判断质量 */
  source: 'pdf' | 'office-thumbnail' | 'office-media' | 'image';
}

const PDF_EXTS = new Set(['pdf']);
/** ZIP 容器格式（Office 2007+），内部可能带 docProps/thumbnail */
const ZIP_OFFICE_EXTS = new Set(['pptx', 'pptm', 'ppsx', 'docx', 'docm', 'xlsx', 'xlsm', 'odt', 'odp', 'ods']);
/** 旧二进制 Office（OLE 复合文档），取不到内置缩略图 */
const LEGACY_OFFICE_EXTS = new Set(['ppt', 'doc', 'xls', 'pps', 'pot', 'rtf']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp']);

/**
 * 文档预览图生成（轻量方案，不依赖 LibreOffice）
 *
 * - PDF：pdftoppm 渲染前 N 页（poppler，单进程内存约 50MB）
 * - Office 2007+（pptx/docx/xlsx）：解包取内置 `docProps/thumbnail.*`（PowerPoint/Word 保存时生成的首页缩略图），
 *   没有则退回 `ppt/media/` 里最大的一张图
 * - 图片：直接作为首图
 * - 旧版 Office（ppt/doc/xls）：无法提取，返回 null 由运营手动补封面
 *
 * 之所以不用 LibreOffice：生产服务器仅 1.6G 内存，LibreOffice 转换峰值 300-500MB，
 * 会与 MySQL/Node 争内存并触发整机不可用。
 */
@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  private readonly publicBaseUrl = process.env.PUBLIC_BASE_URL || 'https://templio.wdbzk.com';
  private readonly pdftoppmPath = process.env.PDFTOPPM_PATH || 'pdftoppm';
  private readonly unzipPath = process.env.UNZIP_PATH || 'unzip';

  /** 该文件是否可能生成预览图 */
  supports(filename: string): boolean {
    const ext = extnameOf(filename);
    return (
      PDF_EXTS.has(ext) || ZIP_OFFICE_EXTS.has(ext) || IMAGE_EXTS.has(ext)
    );
  }

  async renderPreviews(
    filePath: string,
    originalName: string,
    options?: { maxPages?: number },
  ): Promise<RenderResult | null> {
    const maxPages = Math.min(Math.max(options?.maxPages ?? 6, 1), 20);
    const ext = extnameOf(originalName) || extnameOf(filePath);
    const workDir = await fs.mkdtemp(path.join(tmpRoot(), 'render-'));
    try {
      if (IMAGE_EXTS.has(ext)) return await this.fromImage(filePath, workDir);
      if (PDF_EXTS.has(ext)) return await this.fromPdf(filePath, workDir, maxPages);
      if (ZIP_OFFICE_EXTS.has(ext)) return await this.fromOfficeZip(filePath, workDir);
      if (LEGACY_OFFICE_EXTS.has(ext)) {
        this.logger.warn(`旧版 Office 格式无法自动取预览图：${originalName}`);
        return null;
      }
      return null;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** 图片：直接作为首图 */
  private async fromImage(filePath: string, workDir: string): Promise<RenderResult> {
    const pngPath = path.join(workDir, 'single.png');
    await sharp(filePath, { failOn: 'none' }).png().toFile(pngPath);
    const saved = await this.persist([pngPath]);
    return {
      cover: saved[0].url,
      coverThumb: saved[0].thumbUrl,
      previews: [saved[0].url],
      pages: 1,
      source: 'image',
    };
  }

  /** PDF：前 N 页转图 */
  private async fromPdf(pdfPath: string, workDir: string, maxPages: number): Promise<RenderResult | null> {
    const outPrefix = path.join(workDir, 'page');
    // 注意参数顺序：pdftoppm [options] <PDF-file> [PREFIX]，文件必须在前、前缀在后，
    // 写反会把输出前缀当成输入文件（报 Couldn't open file）。
    const result = await runCli(
      this.pdftoppmPath,
      ['-png', '-r', '110', '-f', '1', '-l', String(maxPages), pdfPath, outPrefix],
      { timeoutMs: 180_000 },
    );
    const pages = (await fs.readdir(workDir))
      .filter((name) => /^page-?\d+\.png$/i.test(name))
      .sort((a, b) => pageNumber(a) - pageNumber(b))
      .map((name) => path.join(workDir, name));
    if (!pages.length) {
      this.logger.warn(`PDF 转图无输出：${result.stderr.slice(0, 200)}`);
      return null;
    }
    const saved = await this.persist(pages);
    return {
      cover: saved[0].url,
      coverThumb: saved[0].thumbUrl,
      previews: saved.map((item) => item.url),
      pages: saved.length,
      source: 'pdf',
    };
  }

  /**
   * Office 2007+：解包拿内置缩略图。
   * 优先 docProps/thumbnail.*（PowerPoint/Word 保存时写入的首页缩略图），
   * 缺失时退回 ppt/media 里体积最大的图片（通常是封面背景大图）。
   */
  private async fromOfficeZip(filePath: string, workDir: string): Promise<RenderResult | null> {
    const listing = await runCli(this.unzipPath, ['-Z1', filePath], { timeoutMs: 60_000 });
    if (!listing.ok) {
      this.logger.warn(`解包失败（无 unzip 或文件损坏）：${listing.stderr.slice(0, 200)}`);
      return null;
    }
    const entries = listing.stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

    const thumbEntry = entries.find((name) => /^docProps\/thumbnail\.(jpe?g|png)$/i.test(name));
    if (thumbEntry) {
      const saved = await this.extractAndPersist(filePath, thumbEntry, workDir);
      if (saved) return { ...saved, source: 'office-thumbnail' };
    }

    // 退回 media 目录：取体积最大的图片（zip 列表带原始大小）
    const mediaCandidates = entries.filter((name) =>
      /^(ppt|xl|word)\/media\/[^/]+\.(jpe?g|png|webp)$/i.test(name),
    );
    if (mediaCandidates.length) {
      const sized = await this.withSizes(filePath, mediaCandidates);
      const largest = sized.sort((a, b) => b.size - a.size)[0];
      if (largest) {
        const saved = await this.extractAndPersist(filePath, largest.name, workDir);
        if (saved) return { ...saved, source: 'office-media' };
      }
    }
    this.logger.warn('Office 文件内没有可用缩略图');
    return null;
  }

  private async withSizes(filePath: string, names: string[]): Promise<{ name: string; size: number }[]> {
    const listing = await runCli(this.unzipPath, ['-l', filePath], { timeoutMs: 60_000 });
    if (!listing.ok) return names.map((name) => ({ name, size: 0 }));
    const sizeMap = new Map<string, number>();
    for (const line of listing.stdout.split(/\r?\n/)) {
      // 形如: 123456  2024-01-01 00:00  ppt/media/image1.png
      const match = line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(.+)$/);
      if (match) sizeMap.set(match[2].trim(), Number(match[1]));
    }
    return names.map((name) => ({ name, size: sizeMap.get(name) ?? 0 }));
  }

  private async extractAndPersist(filePath: string, entry: string, workDir: string) {
    const outDir = path.join(workDir, 'extract');
    await fs.mkdir(outDir, { recursive: true });
    const result = await runCli(
      this.unzipPath,
      ['-o', '-j', filePath, entry, '-d', outDir],
      { timeoutMs: 60_000 },
    );
    if (!result.ok) return null;
    const files = await fs.readdir(outDir);
    const picked = files.find((name) => /\.(jpe?g|png|webp)$/i.test(name));
    if (!picked) return null;
    const pngPath = path.join(outDir, 'normalized.png');
    try {
      await sharp(path.join(outDir, picked), { failOn: 'none' }).png().toFile(pngPath);
    } catch {
      return null;
    }
    const saved = await this.persist([pngPath]);
    return {
      cover: saved[0].url,
      coverThumb: saved[0].thumbUrl,
      previews: [saved[0].url],
      pages: 1,
    };
  }

  /** PNG → webp 双尺寸落盘 uploads/YYYY/MM，返回公网 URL */
  private async persist(pngPaths: string[]) {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dir = path.join(this.uploadDir, yyyy, mm);
    await fs.mkdir(dir, { recursive: true });
    const base = `${this.publicBaseUrl}/uploads/${yyyy}/${mm}`;
    const out: { url: string; thumbUrl: string }[] = [];
    for (const pngPath of pngPaths) {
      const name = crypto.randomBytes(12).toString('hex');
      const source = sharp(pngPath, { failOn: 'none' }).rotate();
      const mainBuf = await source
        .clone()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const thumbBuf = await source
        .clone()
        .resize({ width: 480, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      await Promise.all([
        fs.writeFile(path.join(dir, `${name}.webp`), mainBuf),
        fs.writeFile(path.join(dir, `${name}-thumb.webp`), thumbBuf),
      ]);
      out.push({ url: `${base}/${name}.webp`, thumbUrl: `${base}/${name}-thumb.webp` });
    }
    return out;
  }
}

function extnameOf(name: string): string {
  return (name.match(/\.([a-z0-9]+)(?:\?|#|$)/i)?.[1] ?? '').toLowerCase();
}

function pageNumber(fileName: string): number {
  return Number(fileName.match(/^page-?(\d+)\.png$/i)?.[1] ?? 0);
}

function tmpRoot(): string {
  const root = process.env.RENDER_TMP_DIR || path.join(process.cwd(), '.storage-tmp');
  mkdirSync(root, { recursive: true });
  return root;
}
