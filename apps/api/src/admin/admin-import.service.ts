import { BadRequestException, Injectable } from "@nestjs/common";
import { mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Prisma } from "@prisma/client";
import { parseManifest, shortHash, templateTextSchema } from "@templio/shared";
import { PrismaService } from "../prisma/prisma.service";

interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

type UploadedFiles = Record<string, UploadedImage[] | undefined>;

@Injectable()
export class AdminImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importPackage(
    files: UploadedFiles,
    manifestRaw?: string,
    textRaw?: string,
  ): Promise<{ status: string; id: string; title: string | null; sourceFile?: string | null }> {
    if (!manifestRaw) throw new BadRequestException("缺少 manifest.json");

    let manifest: ReturnType<typeof parseManifest>;
    try {
      manifest = parseManifest(JSON.parse(manifestRaw));
    } catch (error) {
      throw new BadRequestException(`manifest 不合法：${(error as Error).message}`);
    }

    let text: ReturnType<typeof templateTextSchema.parse> = templateTextSchema.parse({});
    if (textRaw) {
      try {
        text = templateTextSchema.parse(JSON.parse(textRaw));
      } catch (error) {
        throw new BadRequestException(`text.json 不合法：${(error as Error).message}`);
      }
    }

    const existing = await this.prisma.template.findUnique({
      where: { sourceHash: manifest.sourceHash },
    });
    if (existing) {
      return { status: "duplicate", id: existing.id, title: existing.title };
    }

    const cover = files.cover?.[0];
    const thumb = files.thumb?.[0];
    const previews = files.previews || [];
    if (!cover || !thumb) {
      throw new BadRequestException("缺少封面（cover）或缩略图（thumb）");
    }

    const hash = shortHash(manifest.sourceHash, 8);
    const storageRoot = process.env.STORAGE_ROOT || join(process.cwd(), "storage");
    // Nginx /assets/ 已指向 storage/public，因此 objectKey 不再包含 public 前缀
    const relativeDir = `templates/${hash}`;
    const absoluteDir = join(storageRoot, "public", relativeDir);

    // 先校验源文件，避免校验失败时已经在磁盘留下孤立图片
    const source = files.source?.[0];
    let sourceMeta:
      | { safeName: string; sourceKey: string; sourceDir: string; size: number; mimetype: string }
      | null = null;
    if (source) {
      if (Math.abs(Number(manifest.sourceBytes) - source.size) > 1) {
        throw new BadRequestException("源文件大小与 manifest.sourceBytes 不一致");
      }
      const safeName = sanitizeFilename(decodeFilename(source.originalname || basename(manifest.sourceFile)));
      const extension = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "";
      if (extension !== manifest.format) {
        throw new BadRequestException(`源文件扩展名应为 .${manifest.format}`);
      }
      sourceMeta = {
        safeName,
        sourceKey: `sources/${shortHash(manifest.sourceHash, 8)}/${safeName}`,
        sourceDir: join(storageRoot, "private", "sources", shortHash(manifest.sourceHash, 8)),
        size: source.size || source.buffer.length,
        mimetype: source.mimetype || "application/octet-stream"
      };
    }

    const writtenPaths: string[] = [];

    const fileCreates: Prisma.TemplateFileCreateWithoutTemplateInput[] = [];

    const saveImage = async (
      file: UploadedImage,
      name: string,
      role: "cover" | "thumb" | "preview",
      seq: number,
    ) => {
      const objectKey = `${relativeDir}/${name}`;
      const absolutePath = join(storageRoot, "public", objectKey);
      await writeFile(absolutePath, file.buffer);
      writtenPaths.push(absolutePath);
      fileCreates.push({
        role,
        objectKey,
        mime: file.mimetype || "image/webp",
        size: BigInt(file.size || file.buffer.length),
        seq,
      });
    };

    try {
      await mkdir(absoluteDir, { recursive: true });
      await saveImage(cover, "cover.webp", "cover", 0);
      await saveImage(thumb, "thumb.webp", "thumb", 0);
      for (let index = 0; index < previews.length; index += 1) {
        await saveImage(previews[index]!, `preview-${String(index + 1).padStart(2, "0")}.webp`, "preview", index);
      }

      // 可选：源文件先暂存到服务器私有目录，等同步网盘后再删除
      let sourceInfo: { filename: string; size: number } | null = null;
      if (sourceMeta && source) {
        await mkdir(sourceMeta.sourceDir, { recursive: true });
        const sourceAbsolutePath = join(storageRoot, "private", sourceMeta.sourceKey);
        await writeFile(sourceAbsolutePath, source.buffer);
        writtenPaths.push(sourceAbsolutePath);
        fileCreates.push({
          role: "source",
          objectKey: sourceMeta.sourceKey,
          mime: sourceMeta.mimetype,
          size: BigInt(sourceMeta.size),
          seq: 0,
        });
        sourceInfo = { filename: sourceMeta.safeName, size: sourceMeta.size };
      }

      const title = (manifest.titleGuess || text.title || basename(manifest.sourceFile)).slice(0, 200);
      const template = await this.prisma.template.create({
        data: {
          sourceHash: manifest.sourceHash,
          title,
          description: text.firstPagesText?.[0]?.slice(0, 500) || null,
          status: "imported",
          format: manifest.format,
          pageCount: manifest.pageCount,
          fileSize: BigInt(manifest.sourceBytes),
          originalName: basename(manifest.sourceFile),
          batchKey: "cli",
          textContent: text as unknown as Prisma.InputJsonValue,
          files: { create: fileCreates },
        },
      });

      return { status: "imported", id: template.id, title: template.title, sourceFile: sourceInfo?.filename || null };
    } catch (error) {
      // 数据库写失败或写入中途异常时，清理本次已经落盘的图片/源文件
      for (const absolutePath of writtenPaths) {
        await unlink(absolutePath).catch(() => undefined);
      }
      await rmdir(absoluteDir).catch(() => undefined);
      if (sourceMeta) await rmdir(sourceMeta.sourceDir).catch(() => undefined);
      throw error;
    }
  }
}

function sanitizeFilename(name: string): string {
  const cleaned = basename(name || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120) || "source";
}

/**
 * multipart 的 filename 在 busboy/multer 下常被按 latin1 解码，中文会变成乱码；
 * 这里尝试还原为 UTF-8，失败则保留原值。
 */
function decodeFilename(raw: string): string {
  if (!raw) return raw;
  if (!/^[\x00-\xff]*$/.test(raw)) return raw;
  const decoded = Buffer.from(raw, "latin1").toString("utf8");
  if (decoded.includes("\uFFFD")) return raw;
  return decoded;
}
