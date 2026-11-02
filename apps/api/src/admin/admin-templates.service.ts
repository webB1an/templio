import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
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
  }> {
    const [total, grouped, categories] = await Promise.all([
      this.prisma.template.count(),
      this.prisma.template.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.category.findMany({ orderBy: [{ sort: "asc" }] }),
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

    return {
      total,
      byStatus,
      categories: categories.map((category) => ({
        key: category.slug,
        name: category.name,
        count: countMap.get(category.id) || 0,
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
    body: { provider?: unknown; url?: unknown; passcode?: unknown },
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

  private async findAdminDto(id: string): Promise<unknown> {
    const row = await this.prisma.template.findUnique({
      where: { id },
      include: {
        category: true,
        files: { orderBy: { seq: "asc" } },
        tags: { include: { tag: true } },
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
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    category: { id: string; name: string; slug: string } | null;
    tags: Array<{ tag: { name: string } }>;
    files: Array<{ role: string; objectKey: string }>;
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
      coverUrl: coverFile ? `${appOrigin}/assets/${coverFile.objectKey}` : null,
      shortCode,
      shortLink: shortCode ? `${appOrigin}/r/${shortCode}` : null,
      netdiskUrl: primary?.url || null,
      provider: primary?.provider || null,
      passcode: primary?.passcode || null,
      hasNetdisk: Boolean(primary?.url),
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
