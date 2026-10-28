import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DIMENSIONS = ['format', 'scene', 'audience', 'theme'] as const;
type Dimension = (typeof DIMENSIONS)[number];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  private assertDimension(dimension: string): Dimension {
    if (!DIMENSIONS.includes(dimension as never)) {
      throw new BadRequestException(`dimension 必须是 ${DIMENSIONS.join('/')}`);
    }
    return dimension as Dimension;
  }

  // ───────────────────────── 分类（两级树） ─────────────────────────

  adminListCategories(dimension?: string) {
    return this.prisma.category.findMany({
      where: dimension ? { dimension: dimension as never } : undefined,
      orderBy: [{ dimension: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      include: { parent: { select: { id: true, name: true } } },
    });
  }

  /** 公开接口：仅启用项，按维度返回两级树 */
  async publicTree(dimension?: string) {
    const where: Prisma.CategoryWhereInput = { enabled: true };
    if (dimension) {
      this.assertDimension(dimension);
      where.dimension = dimension as never;
    }
    const all = await this.prisma.category.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const roots = all.filter((c) => c.parentId === null);
    const childrenMap = new Map<number, typeof all>();
    for (const c of all) {
      if (c.parentId !== null) {
        const list = childrenMap.get(c.parentId) ?? [];
        list.push(c);
        childrenMap.set(c.parentId, list);
      }
    }
    return roots.map((root) => ({
      id: root.id,
      dimension: root.dimension,
      name: root.name,
      slug: root.slug,
      sort: root.sort,
      children: (childrenMap.get(root.id) ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        sort: c.sort,
      })),
    }));
  }

  async createCategory(data: {
    dimension: string;
    parentId?: number | null;
    name: string;
    slug: string;
    sort?: number;
  }) {
    const dimension = this.assertDimension(data.dimension);
    if (!SLUG_RE.test(data.slug)) {
      throw new BadRequestException('slug 仅允许小写字母/数字/连字符，且以字母或数字开头');
    }
    if (data.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new NotFoundException('父分类不存在');
      if (parent.dimension !== dimension) {
        throw new BadRequestException('父分类必须属于同一维度');
      }
      if (parent.parentId !== null) {
        throw new BadRequestException('仅支持两级分类，父分类不能再有上级');
      }
    }
    const dup = await this.prisma.category.findUnique({
      where: { dimension_slug: { dimension, slug: data.slug } },
    });
    if (dup) throw new ConflictException('同维度下 slug 已存在');
    return this.prisma.category.create({
      data: {
        dimension,
        parentId: data.parentId ?? null,
        name: data.name,
        slug: data.slug,
        sort: data.sort ?? 0,
      },
    });
  }

  async updateCategory(
    id: number,
    data: { name?: string; slug?: string; sort?: number; enabled?: boolean; parentId?: number | null },
  ) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('分类不存在');
    if (data.slug && data.slug !== category.slug) {
      if (!SLUG_RE.test(data.slug)) throw new BadRequestException('slug 格式不合法');
      const dup = await this.prisma.category.findUnique({
        where: { dimension_slug: { dimension: category.dimension, slug: data.slug } },
      });
      if (dup) throw new ConflictException('同维度下 slug 已存在');
    }
    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === id) throw new BadRequestException('不能把自己设为父分类');
      const parent = await this.prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent || parent.parentId !== null || parent.dimension !== category.dimension) {
        throw new BadRequestException('父分类不合法（需同维度的一级分类）');
      }
    }
    if (data.parentId === null && category.parentId === null) {
      // 一级变一级，无操作；一级不能在有子分类时挂到二级下（上面已校验 parent 须为一级）
    }
    const childCount = await this.prisma.category.count({ where: { parentId: id } });
    if (childCount > 0 && data.parentId !== undefined) {
      throw new BadRequestException('该分类下有子分类，不能调整层级');
    }
    return this.prisma.category.update({ where: { id }, data });
  }

  async deleteCategory(id: number) {
    const childCount = await this.prisma.category.count({ where: { parentId: id } });
    if (childCount > 0) throw new ConflictException('请先删除其子分类');
    const bound = await this.prisma.templateCategory.count({ where: { categoryId: id } });
    if (bound > 0) throw new ConflictException(`该分类已关联 ${bound} 个模板，不能删除（可停用）`);
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }

  // ───────────────────────── 标签 ─────────────────────────

  adminListTags(page = 1, pageSize = 50) {
    return this.prisma.tag.findMany({
      orderBy: { id: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { templates: true } } },
    });
  }

  /** 公开接口：有模板关联的标签，按使用量降序 */
  async publicTags(limit = 50) {
    const tags = await this.prisma.tag.findMany({
      take: limit,
      where: { templates: { some: {} } },
      orderBy: { templates: { _count: 'desc' } },
      select: { id: true, name: true, _count: { select: { templates: true } } },
    });
    return tags.map((t) => ({ id: t.id, name: t.name, templateCount: t._count.templates }));
  }

  async createTag(name: string) {
    const exists = await this.prisma.tag.findUnique({ where: { name } });
    if (exists) throw new ConflictException('标签已存在');
    return this.prisma.tag.create({ data: { name } });
  }

  async updateTag(id: number, name: string) {
    const exists = await this.prisma.tag.findUnique({ where: { name } });
    if (exists && exists.id !== id) throw new ConflictException('标签名已被占用');
    return this.prisma.tag.update({ where: { id }, data: { name } });
  }

  async deleteTag(id: number) {
    const bound = await this.prisma.templateTag.count({ where: { tagId: id } });
    if (bound > 0) throw new ConflictException(`该标签已关联 ${bound} 个模板，不能删除`);
    await this.prisma.tag.delete({ where: { id } });
    return { ok: true };
  }
}
