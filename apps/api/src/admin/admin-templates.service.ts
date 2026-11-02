import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { readdir, stat, statfs, unlink, rmdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Prisma, StorageProvider, TemplateStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const VALID_STATUSES = new Set<string>([
  "draft",
  "imported",
  "ai_processing",
  "pending_review",
  "published",
  "rejected",
  "archived",
  "failed",
]);

const BULK_STATUS: Record<string, TemplateStatus> = {
  publish: "published",
  offline: "archived",
  review: "pending_review",
};

@Injectable()
export class AdminTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    status?: string;
    category?: string;
    q?: string;
    limit?: string;
    offset?: string;
  }): Promise<{ items: unknown[]; total: number }> {
    const limit = clamp(query.limit, 20, 1, 100);
    const offset = clamp(query.offset, 0, 0, 100000);
    const keyword = (query.q || "").trim();

    const where: Prisma.TemplateWhereInput = {
      ...(query.status && VALID_STATUSES.has(query.status)
        ? { status: query.status as TemplateStatus }
        : {}),
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { description: { contains: keyword } },
              { originalName: { contains: keyword } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.template.count({ where }),
      this.prisma.template.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: offset,
        take: limit,
        include: {
          category: true,
          files: { orderBy: { seq: "asc" } },
          tags: { include: { tag: true }, orderBy: { sort: "asc" } },
          aiAnalysis: true,
          netdiskLinks: {
            where: { isActive: true },
            orderBy: [{ isPrimary: "desc" }],
            include: { shortLinks: true },
          },
        },
      }),
    ]);

    return { items: rows.map((row) => this.toAdminDto(row)), total };
  }

  async stats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    categories: Array<{ key: string; name: string; count: number }>;
    views: number;
    copies: number;
    favorites: number;
    today: { views: number; copies: number; clicks: number };
    pendingReview: number;
    trend: Array<{ date: string; views: number; copies: number }>;
    topTemplates: Array<{
      id: string;
      title: string;
      category: string;
      viewCount: number;
      copyCount: number;
      favoriteCount: number;
      coverUrl: string | null;
    }>;
  }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const trendStart = new Date(startOfDay);
    trendStart.setDate(trendStart.getDate() - 6);
    const appOrigin = (process.env.APP_ORIGIN || "https://templio.wdbzk.com").replace(/\/$/, "");

    const [total, grouped, categories, sums, todayGrouped, pendingReview, topRows, trendClicks] =
      await Promise.all([
        this.prisma.template.count(),
        this.prisma.template.groupBy({ by: ["status"], _count: { _all: true } }),
        this.prisma.category.findMany({ orderBy: [{ sort: "asc" }] }),
        this.prisma.template.aggregate({
          _sum: { viewCount: true, copyCount: true, favoriteCount: true },
        }),
        this.prisma.templateClick.groupBy({
          by: ["kind"],
          where: { createdAt: { gte: startOfDay } },
          _count: { _all: true },
        }),
        this.prisma.template.count({ where: { status: "pending_review" } }),
        this.prisma.template.findMany({
          orderBy: [{ copyCount: "desc" }, { viewCount: "desc" }],
          take: 5,
          select: {
            id: true,
            title: true,
            originalName: true,
            viewCount: true,
            copyCount: true,
            favoriteCount: true,
            category: { select: { name: true } },
            files: {
              where: { role: "cover" },
              take: 1,
              select: { objectKey: true },
            },
          },
        }),
        this.prisma.templateClick.findMany({
          where: { createdAt: { gte: trendStart } },
          select: { kind: true, createdAt: true },
        }),
      ]);

    const categoryCounts = await this.prisma.template.groupBy({
      by: ["categoryId"],
      where: { categoryId: { not: null } },
      _count: { _all: true },
    });
    const countMap = new Map<string, number>();
    for (const item of categoryCounts) {
      if (item.categoryId) countMap.set(item.categoryId, item._count._all);
    }

    const byStatus: Record<string, number> = {};
    for (const item of grouped) {
      byStatus[item.status] = item._count._all;
    }

    const today: Record<string, number> = {};
    for (const item of todayGrouped) {
      today[item.kind] = item._count._all;
    }

    const trendMap = new Map<string, { views: number; copies: number }>();
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(trendStart);
      day.setDate(trendStart.getDate() + offset);
      trendMap.set(formatDateKey(day), { views: 0, copies: 0 });
    }
    for (const click of trendClicks) {
      const key = formatDateKey(click.createdAt);
      const bucket = trendMap.get(key);
      if (!bucket) continue;
      if (click.kind === "copy") bucket.copies += 1;
      else bucket.views += 1;
    }

    return {
      total,
      byStatus,
      categories: categories.map((category) => ({
        key: category.slug,
        name: category.name,
        count: countMap.get(category.id) || 0,
      })),
      views: sums._sum.viewCount || 0,
      copies: sums._sum.copyCount || 0,
      favorites: sums._sum.favoriteCount || 0,
      today: {
        views: today.view || 0,
        copies: today.copy || 0,
        clicks: (today.view || 0) + (today.copy || 0),
      },
      pendingReview,
      trend: Array.from(trendMap.entries()).map(([date, value]) => ({
        date,
        views: value.views,
        copies: value.copies,
      })),
      topTemplates: topRows.map((row) => ({
        id: row.id,
        title: row.title || row.originalName || "未命名模板",
        category: row.category?.name || "未分类",
        viewCount: row.viewCount,
        copyCount: row.copyCount,
        favoriteCount: row.favoriteCount,
        coverUrl: row.files[0] ? `${appOrigin}/assets/${row.files[0].objectKey}` : null,
      })),
    };
  }

  async facets(): Promise<{
    categories: Array<{ id: string; key: string; name: string }>;
    tags: Array<{ id: string; name: string; type: string }>;
  }> {
    const [categories, tags] = await Promise.all([
      this.prisma.category.findMany({ orderBy: [{ sort: "asc" }] }),
      this.prisma.tag.findMany({ orderBy: [{ type: "asc" }, { createdAt: "asc" }], take: 200 }),
    ]);
    return {
      categories: categories.map((item) => ({ id: item.id, key: item.slug, name: item.name })),
      tags: tags.map((item) => ({ id: item.id, name: item.name, type: item.type })),
    };
  }

  async update(
    id: string,
    body: { title?: unknown; description?: unknown; categoryId?: unknown; status?: unknown },
  ): Promise<unknown> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("模板不存在");

    const data: Prisma.TemplateUpdateInput = {};
    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title || title.length > 200) throw new BadRequestException("标题长度需在 1-200 字之间");
      data.title = title;
    }
    if (typeof body.description === "string") {
      if (body.description.length > 5000) throw new BadRequestException("简介不能超过 5000 字");
      data.description = body.description.trim();
    }
    if (typeof body.categoryId === "string" && body.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!category) throw new BadRequestException("分类不存在");
      data.category = { connect: { id: body.categoryId } };
    }
    if (typeof body.status === "string") {
      if (!VALID_STATUSES.has(body.status)) throw new BadRequestException("状态不合法");
      data.status = body.status as TemplateStatus;
      if (body.status === "published" && !template.publishedAt) {
        data.publishedAt = new Date();
      }
    }
    if (Object.keys(data).length === 0) throw new BadRequestException("没有需要更新的字段");

    const updated = await this.prisma.template.update({
      where: { id },
      data,
      include: {
        category: true,
        files: { orderBy: { seq: "asc" } },
        tags: { include: { tag: true } },
        aiAnalysis: true,
        netdiskLinks: { include: { shortLinks: true } },
      },
    });
    return this.toAdminDto(updated);
  }

  async bulk(ids: unknown, action: unknown): Promise<{ updated: number; status: string }> {
    const list = Array.isArray(ids) ? ids.filter((item): item is string => typeof item === "string") : [];
    const statusKey = String(action || "");
    const status = BULK_STATUS[statusKey];
    if (!list.length) throw new BadRequestException("请选择模板");
    if (!status) throw new BadRequestException("不支持的批量操作");

    const result = await this.prisma.template.updateMany({
      where: { id: { in: list } },
      data: status === "published" ? { status } : { status },
    });

    if (status === "published") {
      await this.prisma.template.updateMany({
        where: { id: { in: list }, publishedAt: null },
        data: { publishedAt: new Date() },
      });
    }

    return { updated: result.count, status };
  }

  async saveNetdisk(
    id: string,
    body: { provider?: unknown; url?: unknown; passcode?: unknown; accountId?: unknown },
  ): Promise<unknown> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("模板不存在");

    const provider = String(body.provider || "").trim();
    if (provider !== "baidu" && provider !== "quark") {
      throw new BadRequestException("网盘类型只支持 baidu / quark");
    }

    const rawUrl = String(body.url || "").trim();
    if (!rawUrl || rawUrl.length > 1000) throw new BadRequestException("请输入有效的网盘链接");
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException("网盘链接格式不正确");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new BadRequestException("网盘链接必须以 http(s) 开头");
    }
    const host = parsed.hostname.toLowerCase();
    if (provider === "baidu" && !(host === "pan.baidu.com" || host.endsWith(".baidu.com"))) {
      throw new BadRequestException("百度网盘链接域名应为 pan.baidu.com");
    }
    if (provider === "quark" && !(host === "pan.quark.cn" || host.endsWith(".quark.cn"))) {
      throw new BadRequestException("夸克网盘链接域名应为 pan.quark.cn");
    }

    const passcode = typeof body.passcode === "string" ? body.passcode.trim() : "";
    if (passcode.length > 32) throw new BadRequestException("提取码过长");
    if (passcode && !/^[A-Za-z0-9]+$/.test(passcode)) {
      throw new BadRequestException("提取码只能包含字母或数字");
    }

    const existing = await this.prisma.netdiskLink.findFirst({
      where: { templateId: id, isActive: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      include: { shortLinks: true },
    });

    const data = {
      provider: provider as StorageProvider,
      url: rawUrl,
      passcode: passcode || null,
      status: "synced" as const,
      isPrimary: true,
      isActive: true,
      ...(typeof body.accountId === "string" && body.accountId
        ? { storageAccountId: body.accountId }
        : {}),
    };

    const link = existing
      ? await this.prisma.netdiskLink.update({
          where: { id: existing.id },
          data,
          include: { shortLinks: true },
        })
      : await this.prisma.netdiskLink.create({
          data: { templateId: id, ...data },
          include: { shortLinks: true },
        });

    await this.prisma.netdiskLink.updateMany({
      where: { templateId: id, id: { not: link.id } },
      data: { isPrimary: false },
    });

    let shortCode = link.shortLinks[0]?.code;
    if (!shortCode) {
      shortCode = await this.generateShortCode();
      await this.prisma.shortLink.create({
        data: {
          code: shortCode,
          templateId: id,
          netdiskLinkId: link.id,
          provider: provider as StorageProvider,
        },
      });
    } else {
      await this.prisma.shortLink.update({
        where: { code: shortCode },
        data: {
          provider: provider as StorageProvider,
          netdiskLinkId: link.id,
          templateId: id,
        },
      });
    }

    return this.findAdminDto(id);
  }

  async removeNetdisk(id: string): Promise<{ removed: boolean }> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("模板不存在");
    const result = await this.prisma.netdiskLink.updateMany({
      where: { templateId: id, isActive: true },
      data: { isActive: false, isPrimary: false },
    });
    return { removed: result.count > 0 };
  }

  async system(): Promise<{
    node: string;
    platform: string;
    uptimeSeconds: number;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
    disk: { totalGb: number; freeGb: number; usedPercent: number };
    backups: {
      mysql: { filename: string; at: string; sizeMb: number; ageHours: number } | null;
      storage: { filename: string; at: string; sizeMb: number; ageHours: number } | null;
    };
    version: string;
    commit: string;
  }> {
    const storageRoot = process.env.STORAGE_ROOT || join(process.cwd(), "storage");
    const backupRoot = process.env.BACKUP_ROOT || join(dirname(storageRoot), "backups");
    const memory = process.memoryUsage();

    let disk = { totalGb: 0, freeGb: 0, usedPercent: 0 };
    try {
      const fsStat = await statfs(storageRoot);
      const blockSize = Number(fsStat.bsize);
      const totalBytes = Number(fsStat.blocks) * blockSize;
      const freeBytes = Number(fsStat.bfree) * blockSize;
      disk = {
        totalGb: round1(totalBytes / 1024 ** 3),
        freeGb: round1(freeBytes / 1024 ** 3),
        usedPercent: totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0,
      };
    } catch {
      // 非 Linux 或路径不可用时忽略
    }

    return {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: round1(memory.rss / 1024 / 1024),
        heapUsedMb: round1(memory.heapUsed / 1024 / 1024),
        heapTotalMb: round1(memory.heapTotal / 1024 / 1024),
      },
      disk,
      backups: {
        mysql: await latestBackup(join(backupRoot, "mysql"), /^templio-.*\.sql\.gz$/),
        storage: await latestBackup(join(backupRoot, "storage"), /^storage-.*\.tar\.gz$/),
      },
      version: process.env.APP_VERSION || "0.1.0",
      commit: process.env.GIT_SHA || "dev",
    };
  }

  async exportTemplatesCsv(): Promise<string> {
    const rows = await this.prisma.template.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        tags: { include: { tag: true }, orderBy: { sort: "asc" } },
        files: { where: { role: "source" }, take: 1 },
        netdiskLinks: {
          where: { isActive: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          include: { shortLinks: true },
        },
      },
    });

    const appOrigin = (process.env.APP_ORIGIN || "https://templio.wdbzk.com").replace(/\/$/, "");
    const header = [
      "id",
      "title",
      "status",
      "format",
      "pageCount",
      "fileSize",
      "category",
      "tags",
      "viewCount",
      "copyCount",
      "favoriteCount",
      "shortLink",
      "passcode",
      "sourceFile",
      "publishedAt",
      "createdAt",
      "updatedAt",
    ];
    const lines = rows.map((row) => {
      const link = row.netdiskLinks[0];
      const code = link?.shortLinks?.[0]?.code;
      return [
        row.id,
        row.title || "",
        row.status,
        row.format || "",
        row.pageCount || "",
        row.fileSize ? Number(row.fileSize) : "",
        row.category?.name || "",
        row.tags.map((item) => item.tag.name).join("|"),
        row.viewCount,
        row.copyCount,
        row.favoriteCount,
        code ? `${appOrigin}/r/${code}` : "",
        link?.passcode || "",
        row.files[0] ? basename(row.files[0].objectKey) : "",
        row.publishedAt ? row.publishedAt.toISOString() : "",
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
      ]
        .map(csvCell)
        .join(",");
    });
    return `\uFEFF${[header.join(","), ...lines].join("\r\n")}`;
  }

  async exportClicksCsv(daysRaw?: string): Promise<string> {
    const parsed = Number.parseInt(daysRaw || "30", 10);
    const days = Number.isFinite(parsed) ? Math.min(365, Math.max(1, parsed)) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.templateClick.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: { template: { select: { title: true } } },
    });
    const header = ["id", "createdAt", "kind", "templateId", "templateTitle", "userId"];
    const lines = rows.map((row) =>
      [
        row.id,
        row.createdAt.toISOString(),
        row.kind,
        row.templateId,
        row.template.title || "",
        row.userId || "",
      ]
        .map(csvCell)
        .join(",")
    );
    return `\uFEFF${[header.join(","), ...lines].join("\r\n")}`;
  }

  async deleteTemplate(id: string): Promise<{ deleted: boolean }> {
    const template = await this.prisma.template.findUnique({
      where: { id },
      include: { files: true },
    });
    if (!template) throw new NotFoundException("模板不存在");

    await this.prisma.task.deleteMany({ where: { templateId: id } });
    await this.prisma.template.delete({ where: { id } });

    const storageRoot = process.env.STORAGE_ROOT || join(process.cwd(), "storage");
    for (const file of template.files) {
      const absolutePath = file.objectKey.startsWith("sources/")
        ? join(storageRoot, "private", file.objectKey)
        : join(storageRoot, "public", file.objectKey);
      await unlink(absolutePath).catch(() => undefined);
      await rmdir(dirname(absolutePath)).catch(() => undefined);
    }

    return { deleted: true };
  }

  async getSourceFile(id: string): Promise<{ path: string; filename: string; size: number }> {
    const file = await this.prisma.templateFile.findFirst({
      where: { templateId: id, role: "source" },
    });
    if (!file) throw new NotFoundException("该模板还没有上传源文件");

    const storageRoot = process.env.STORAGE_ROOT || join(process.cwd(), "storage");
    const absolutePath = join(storageRoot, "private", file.objectKey);
    try {
      const info = await stat(absolutePath);
      return { path: absolutePath, filename: basename(file.objectKey), size: info.size };
    } catch {
      throw new NotFoundException("源文件不存在或已被清理");
    }
  }

  async removeSourceFile(id: string): Promise<{ removed: boolean }> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("模板不存在");
    const files = await this.prisma.templateFile.findMany({
      where: { templateId: id, role: "source" },
    });
    if (!files.length) return { removed: false };

    const storageRoot = process.env.STORAGE_ROOT || join(process.cwd(), "storage");
    for (const file of files) {
      const absolutePath = join(storageRoot, "private", file.objectKey);
      await unlink(absolutePath).catch(() => undefined);
      await rmdir(dirname(absolutePath)).catch(() => undefined);
      await this.prisma.templateFile.delete({ where: { id: file.id } });
    }
    return { removed: true };
  }

  private async findAdminDto(id: string): Promise<unknown> {
    const row = await this.prisma.template.findUnique({
      where: { id },
      include: {
        category: true,
        files: { orderBy: { seq: "asc" } },
        tags: { include: { tag: true } },
        aiAnalysis: true,
        netdiskLinks: {
          where: { isActive: true },
          orderBy: [{ isPrimary: "desc" }],
          include: { shortLinks: true },
        },
      },
    });
    if (!row) throw new NotFoundException("模板不存在");
    return this.toAdminDto(row);
  }

  private async generateShortCode(): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = randomBytes(5).toString("hex");
      const exists = await this.prisma.shortLink.findUnique({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException("短链生成失败，请重试");
  }

  private toAdminDto(row: {
    id: string;
    title: string | null;
    description: string | null;
    status: string;
    format: string | null;
    pageCount: number | null;
    fileSize: bigint | null;
    originalName: string | null;
    viewCount: number;
    copyCount: number;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    category: { id: string; name: string; slug: string } | null;
    tags: Array<{ tag: { name: string } }>;
    files: Array<{ role: string; objectKey: string; size?: bigint | null; mime?: string | null }>;
    aiAnalysis?: {
      title: string | null;
      categoryKey: string | null;
      tags: unknown;
      summary: string | null;
      confidence: number | null;
      safe: boolean;
      needsReview: boolean;
      model: string | null;
    } | null;
    netdiskLinks: Array<{
      url: string;
      passcode: string | null;
      provider: string;
      status: string;
      shortLinks: Array<{ code: string }>;
    }>;
  }) {
    const primary = row.netdiskLinks[0];
    const coverFile = row.files.find((file) => file.role === "cover");
    const sourceFile = row.files.find((file) => file.role === "source");
    const appOrigin = (process.env.APP_ORIGIN || "https://templio.wdbzk.com").replace(/\/$/, "");
    const shortCode = primary?.shortLinks?.[0]?.code || null;
    return {
      id: row.id,
      title: row.title || row.originalName || "未命名模板",
      description: row.description || "",
      status: row.status,
      format: (row.format || "").toUpperCase(),
      pageCount: row.pageCount || 0,
      fileSize: row.fileSize ? Number(row.fileSize) : 0,
      category: row.category ? { id: row.category.id, name: row.category.name, key: row.category.slug } : null,
      tags: row.tags.map((item) => item.tag.name),
      viewCount: row.viewCount,
      copyCount: row.copyCount,
      coverUrl: coverFile ? `${appOrigin}/assets/${coverFile.objectKey}` : null,
      shortCode,
      shortLink: shortCode ? `${appOrigin}/r/${shortCode}` : null,
      netdiskUrl: primary?.url || null,
      provider: primary?.provider || null,
      passcode: primary?.passcode || null,
      hasNetdisk: Boolean(primary?.url),
      source: sourceFile
        ? {
            filename: basename(sourceFile.objectKey),
            size: Number(sourceFile.size || 0),
            sizeText: humanSize(Number(sourceFile.size || 0)),
          }
        : null,
      ai: row.aiAnalysis
        ? {
            title: row.aiAnalysis.title,
            categoryKey: row.aiAnalysis.categoryKey,
            tags: Array.isArray(row.aiAnalysis.tags)
              ? (row.aiAnalysis.tags as unknown[]).filter((item): item is string => typeof item === "string")
              : [],
            summary: row.aiAnalysis.summary,
            confidence: row.aiAnalysis.confidence,
            safe: row.aiAnalysis.safe,
            needsReview: row.aiAnalysis.needsReview,
            model: row.aiAnalysis.model,
          }
        : null,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function clamp(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function humanSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

async function latestBackup(
  dir: string,
  pattern: RegExp,
): Promise<{ filename: string; at: string; sizeMb: number; ageHours: number } | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  let latest: { file: string; mtime: Date; size: number } | null = null;
  for (const entry of entries) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    try {
      const info = await stat(join(dir, entry.name));
      if (!latest || info.mtime > latest.mtime) {
        latest = { file: entry.name, mtime: info.mtime, size: info.size };
      }
    } catch {
      // ignore
    }
  }
  if (!latest) return null;

  return {
    filename: latest.file,
    at: latest.mtime.toISOString(),
    sizeMb: round1(latest.size / 1024 / 1024),
    ageHours: round1((Date.now() - latest.mtime.getTime()) / 1000 / 3600),
  };
}
