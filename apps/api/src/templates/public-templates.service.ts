import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeMediaUrl, normalizePreviews } from '../common/media-url';

/** 公开字段：绝不包含 shareUrl / 审核记录 / 管理字段 */
const PUBLIC_LIST_SELECT = {
  id: true,
  title: true,
  summary: true,
  cover: true,
  format: true,
  baseCreditPrice: true,
  viewCount: true,
  favoriteCount: true,
  shareOpenCount: true,
  heatScore: true,
  publishedAt: true,
  meta: true,
  categories: { select: { category: { select: { id: true, name: true, dimension: true } } } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
} satisfies Prisma.TemplateSelect;

type PublicTemplate = Prisma.TemplateGetPayload<{ select: typeof PUBLIC_LIST_SELECT }>;

interface FilePublicView {
  id: number;
  filename: string;
  netdiskType: string;
  size: number | null;
  previewUrl: string | null;
  /** 免费 = 真实分享链接；付费 = null（解锁后 M3 返回） */
  shareUrl: string | null;
}

/** 列表项瘦身：meta.previews 提取为 previews 数组 */
function toListItem(t: PublicTemplate) {
  const meta = (t.meta ?? {}) as { previews?: string[] };
  return {
    id: t.id,
    title: t.title,
    summary: t.summary,
    cover: normalizeMediaUrl(t.cover),
    format: t.format,
    baseCreditPrice: t.baseCreditPrice,
    viewCount: t.viewCount,
    favoriteCount: t.favoriteCount,
    heatScore: t.heatScore,
    publishedAt: t.publishedAt,
    previews: normalizePreviews(meta.previews),
    categories: t.categories.map((c) => c.category),
    tags: t.tags.map((x) => x.tag),
  };
}

@Injectable()
export class PublicTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { categoryId?: number; format?: string; sort?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 10));
    const where: Prisma.TemplateWhereInput = {
      status: 'published',
      ...(query.format ? { format: query.format as never } : {}),
      ...(query.categoryId
        ? { categories: { some: { categoryId: query.categoryId } } }
        : {}),
    };
    const orderBy: Prisma.TemplateOrderByWithRelationInput =
      query.sort === 'hot' ? { heatScore: 'desc' } : { publishedAt: 'desc' };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.template.findMany({
        where,
        select: PUBLIC_LIST_SELECT,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.template.count({ where }),
    ]);
    return { items: items.map(toListItem), total, page, pageSize };
  }

  async detail(id: number, userId?: number) {
    const t = await this.prisma.template.findFirst({
      where: { id, status: 'published' },
      include: {
        files: {
          select: {
            id: true,
            filename: true,
            size: true,
            netdiskType: true,
            previewUrl: true,
            checkStatus: true,
          },
        },
        categories: { select: { category: { select: { id: true, name: true, dimension: true } } } },
        tags: { select: { tag: { select: { id: true, name: true } } } },
      },
    });
    if (!t) throw new NotFoundException('模板不存在或未发布');

    // 浏览计数（轻量自增，失败不阻塞详情）
    void this.prisma.template
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    const free = t.baseCreditPrice === 0;
    const files: FilePublicView[] = t.files.map((f) => ({
      id: f.id,
      filename: f.filename,
      netdiskType: f.netdiskType,
      size: f.size === null ? null : Number(f.size),
      previewUrl: normalizeMediaUrl(f.previewUrl),
      shareUrl: null, // 分享链接在详情一律不直接下发；免费模板走专用换取接口
    }));

    const meta = (t.meta ?? {}) as { previews?: string[] };
    const unlocked = userId
      ? !!(await this.prisma.templateUnlock.findUnique({ where: { userId_templateId: { userId, templateId: id } } }))
      : false;
    return {
      id: t.id,
      title: t.title,
      summary: t.summary,
      cover: normalizeMediaUrl(t.cover),
      format: t.format,
      baseCreditPrice: t.baseCreditPrice,
      viewCount: t.viewCount,
      favoriteCount: t.favoriteCount,
      publishedAt: t.publishedAt,
      previews: normalizePreviews(meta.previews),
      categories: t.categories.map((c) => c.category),
      tags: t.tags.map((x) => x.tag),
      free,
      locked: !free && !unlocked,
      unlocked,
      files,
    };
  }

  /**
   * 模板分享链接换取：
   * 免费模板 → 直接返回；付费模板 → 需已登录且已积分解锁。
   */
  async getShareLinks(id: number, userId?: number) {
    const t = await this.prisma.template.findFirst({
      where: { id, status: 'published' },
      select: { id: true, baseCreditPrice: true, files: { select: { id: true, filename: true, netdiskType: true, shareUrl: true } } },
    });
    if (!t) throw new NotFoundException('模板不存在或未发布');
    if (t.baseCreditPrice !== 0) {
      if (!userId) throw new NotFoundException('请先登录并解锁后获取分享链接');
      const unlocked = await this.prisma.templateUnlock.findUnique({
        where: { userId_templateId: { userId, templateId: id } },
      });
      if (!unlocked) throw new NotFoundException('请先解锁该模板');
    }
    return {
      templateId: t.id,
      files: t.files.map((f) => ({ id: f.id, filename: f.filename, netdiskType: f.netdiskType, shareUrl: f.shareUrl })),
    };
  }

  /** ngram FULLTEXT 搜索（迁移 _template_fulltext 建索引） */
  async search(keyword: string, page = 1, pageSize = 10) {
    const q = keyword.trim();
    if (!q) return { items: [], total: 0, page: 1, pageSize };
    const safeQ = q.replace(/["\\]/g, ' ').slice(0, 64);
    const offset = (Math.max(1, page) - 1) * Math.min(50, pageSize);
    const rows = await this.prisma.$queryRaw<{ id: number; score: number }[]>`
      SELECT id, MATCH(title, summary) AGAINST (${safeQ} IN NATURAL LANGUAGE MODE) AS score
      FROM Template
      WHERE status = 'published' AND MATCH(title, summary) AGAINST (${safeQ} IN NATURAL LANGUAGE MODE) > 0
      ORDER BY score DESC, heatScore DESC
      LIMIT ${Math.min(50, pageSize)} OFFSET ${offset}`;
    const totalRows = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total FROM Template
      WHERE status = 'published' AND MATCH(title, summary) AGAINST (${safeQ} IN NATURAL LANGUAGE MODE) > 0`;
    const ids = rows.map((r) => r.id);
    const items = ids.length
      ? await this.prisma.template.findMany({
          where: { id: { in: ids }, status: 'published' },
          select: PUBLIC_LIST_SELECT,
        })
      : [];
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return { items: items.map(toListItem), total: Number(totalRows[0]?.total ?? 0), page, pageSize };
  }

  async related(id: number, limit = 6) {
    const t = await this.prisma.template.findFirst({
      where: { id, status: 'published' },
      select: { categories: { select: { categoryId: true } } },
    });
    if (!t) throw new NotFoundException('模板不存在或未发布');
    const categoryIds = t.categories.map((c) => c.categoryId);
    const where: Prisma.TemplateWhereInput = {
      status: 'published',
      id: { not: id },
      ...(categoryIds.length ? { categories: { some: { categoryId: { in: categoryIds } } } } : {}),
    };
    const items = await this.prisma.template.findMany({
      where,
      select: PUBLIC_LIST_SELECT,
      orderBy: { heatScore: 'desc' },
      take: limit,
    });
    return { items: items.map(toListItem) };
  }
}
