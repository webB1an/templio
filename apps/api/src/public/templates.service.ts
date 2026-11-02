import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const TONE_BY_CATEGORY: Record<string, string> = {
  business: "blue",
  thesis: "green",
  education: "teal",
  resume: "slate",
  contract: "slate",
  party: "orange",
  report: "indigo",
};

export type TemplateWithRelations = Prisma.TemplateGetPayload<{
  include: {
    category: true;
    tags: { include: { tag: true } };
    netdiskLinks: { include: { shortLinks: true } };
    files: true;
  };
}>;

export interface PublicTemplateDto {
  id: string;
  title: string;
  category: string;
  categoryKey: string;
  format: string;
  pageCount: number;
  sizeText: string;
  tags: string[];
  tone: string;
  summary: string;
  coverUrl: string | null;
  previewUrls: string[];
  shortLink: string | null;
  passcode: string | null;
  publishedAt: string | null;
}

@Injectable()
export class PublicTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    q?: string;
    category?: string;
    tag?: string;
    limit?: string;
    offset?: string;
  }): Promise<{ items: PublicTemplateDto[]; total: number }> {
    const limit = clampNumber(query.limit, 20, 1, 50);
    const offset = clampNumber(query.offset, 0, 0, 10000);
    const keyword = (query.q || "").trim();

    const where: Prisma.TemplateWhereInput = {
      status: "published",
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.tag ? { tags: { some: { tag: { name: query.tag } } } } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { description: { contains: keyword } },
              { originalName: { contains: keyword } },
              { tags: { some: { tag: { name: { contains: keyword } } } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.template.count({ where }),
      this.prisma.template.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip: offset,
        take: limit,
        include: {
          category: true,
          files: { orderBy: { seq: "asc" } },
          tags: { include: { tag: true }, orderBy: { sort: "asc" } },
          netdiskLinks: {
            where: { isActive: true },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            include: { shortLinks: true },
          },
        },
      }),
    ]);

    return { items: rows.map((row) => this.toDto(row)), total };
  }

  async detail(id: string): Promise<(PublicTemplateDto & { related: PublicTemplateDto[] }) | null> {
    const row = await this.prisma.template.findFirst({
      where: { id, status: "published" },
      include: {
        category: true,
        files: { orderBy: { seq: "asc" } },
        tags: { include: { tag: true }, orderBy: { sort: "asc" } },
        netdiskLinks: {
          where: { isActive: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          include: { shortLinks: true },
        },
      },
    });
    if (!row) return null;

    const relatedRows = await this.prisma.template.findMany({
      where: {
        status: "published",
        id: { not: row.id },
        ...(row.categoryId ? { categoryId: row.categoryId } : {}),
      },
      orderBy: [{ publishedAt: "desc" }],
      take: 4,
      include: {
        category: true,
        files: { orderBy: { seq: "asc" } },
        tags: { include: { tag: true }, orderBy: { sort: "asc" } },
        netdiskLinks: {
          where: { isActive: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          include: { shortLinks: true },
        },
      },
    });

    return {
      ...this.toDto(row),
      related: relatedRows.map((item) => this.toDto(item)),
    };
  }

  async facets(): Promise<{
    categories: Array<{ key: string; name: string; count: number }>;
    tags: Array<{ name: string; type: string }>;
  }> {
    const [categories, grouped, tags] = await Promise.all([
      this.prisma.category.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
      this.prisma.template.groupBy({
        by: ["categoryId"],
        where: { status: "published", categoryId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.tag.findMany({ orderBy: [{ type: "asc" }, { createdAt: "asc" }], take: 100 }),
    ]);

    const counts = new Map<string, number>();
    for (const item of grouped) {
      if (item.categoryId) counts.set(item.categoryId, item._count._all);
    }

    return {
      categories: categories.map((category) => ({
        key: category.slug,
        name: category.name,
        count: counts.get(category.id) || 0,
      })),
      tags: tags.map((tag) => ({ name: tag.name, type: tag.type })),
    };
  }

  toDto(row: TemplateWithRelations): PublicTemplateDto {
    const primaryLink = row.netdiskLinks[0];
    const code = primaryLink?.shortLinks?.[0]?.code;
    const appOrigin = (process.env.APP_ORIGIN || "https://templio.wdbzk.com").replace(/\/$/, "");
    const categoryKey = row.category?.slug || "";
    const coverFile = row.files.find((file) => file.role === "cover");
    const previewFiles = row.files.filter((file) => file.role === "preview");

    return {
      id: row.id,
      title: row.title || row.originalName || "未命名模板",
      category: row.category?.name || "未分类",
      categoryKey,
      format: (row.format || "").toUpperCase(),
      pageCount: row.pageCount || 0,
      sizeText: formatBytes(row.fileSize),
      tags: row.tags.map((item) => item.tag.name),
      tone: TONE_BY_CATEGORY[categoryKey] || "pink",
      summary: row.description || "",
      coverUrl: coverFile ? `${appOrigin}/assets/${coverFile.objectKey}` : null,
      previewUrls: previewFiles.map((file) => `${appOrigin}/assets/${file.objectKey}`),
      shortLink: code ? `${appOrigin}/r/${code}` : null,
      passcode: primaryLink?.passcode || null,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    };
  }
}

function clampNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function formatBytes(value: bigint | null): string {
  if (!value) return "";
  const bytes = Number(value);
  if (bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const size = bytes / 1024 ** index;
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}
