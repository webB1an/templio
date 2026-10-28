import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeMediaUrl } from '../common/media-url';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async banners() {
    const now = new Date();
    const items = await this.prisma.banner.findMany({
      where: {
        enabled: true,
        OR: [{ startAt: null }, { startAt: { lte: now } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
      },
      orderBy: { sort: 'asc' },
      select: { id: true, image: true, linkType: true, linkTarget: true },
    });
    return { items: items.map((b) => ({ ...b, image: normalizeMediaUrl(b.image) })) };
  }

  async overview() {
    const [totalTemplates, totalCategories, hotKeywords, publishedToday] = await Promise.all([
      this.prisma.template.count({ where: { status: 'published' } }),
      this.prisma.category.count({ where: { enabled: true, parentId: { not: null } } }),
      this.prisma.searchKeywordStat.findMany({
        orderBy: { count7d: 'desc' },
        take: 10,
        select: { keyword: true, count7d: true },
      }),
      this.prisma.template.count({
        where: { status: 'published', publishedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      }),
    ]);
    return { totalTemplates, totalCategories, publishedToday, hotKeywords };
  }

  /** 首页楼层：热门 + 最新（每层取 6 个） */
  async sections() {
    const [hot, latest] = await Promise.all([
      this.prisma.template.findMany({
        where: { status: 'published' },
        orderBy: { heatScore: 'desc' },
        take: 6,
        select: {
          id: true, title: true, cover: true, format: true, baseCreditPrice: true, heatScore: true,
        },
      }),
      this.prisma.template.findMany({
        where: { status: 'published' },
        orderBy: { publishedAt: 'desc' },
        take: 6,
        select: {
          id: true, title: true, cover: true, format: true, baseCreditPrice: true, publishedAt: true,
        },
      }),
    ]);
    const hotItems = hot.map((t) => ({ ...t, cover: normalizeMediaUrl(t.cover) }));
    const latestItems = latest.map((t) => ({ ...t, cover: normalizeMediaUrl(t.cover) }));
    return { hot: hotItems, latest: latestItems };
  }

  // ── 管理端 Banner CRUD ──

  listBanners() {
    return this.prisma.banner.findMany({ orderBy: { sort: 'asc' } });
  }

  createBanner(data: {
    image: string;
    linkType?: string;
    linkTarget?: string;
    sort?: number;
    startAt?: Date | null;
    endAt?: Date | null;
    enabled?: boolean;
  }) {
    return this.prisma.banner.create({
      data: {
        image: data.image,
        linkType: (data.linkType as never) ?? 'none',
        linkTarget: data.linkTarget,
        sort: data.sort ?? 0,
        startAt: data.startAt,
        endAt: data.endAt,
        enabled: data.enabled ?? true,
      },
    });
  }

  updateBanner(
    id: number,
    data: {
      image?: string;
      linkType?: string;
      linkTarget?: string;
      sort?: number;
      startAt?: Date | null;
      endAt?: Date | null;
      enabled?: boolean;
    },
  ) {
    const { linkType, ...rest } = data;
    return this.prisma.banner.update({
      where: { id },
      data: {
        ...rest,
        ...(linkType !== undefined ? { linkType: linkType as never } : {}),
      },
    });
  }

  deleteBanner(id: number) {
    return this.prisma.banner.delete({ where: { id } }).then(() => ({ deleted: true }));
  }
}
