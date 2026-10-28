import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const DIMENSIONS = ['format', 'scene', 'audience', 'theme'] as const;
type Dimension = (typeof DIMENSIONS)[number];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** 名称归一化：忽略空格/连接符/大小写差异，用于识别「PPT模板」与「PPT 模板」为同一分类 */
function normName(input: string) {
  return String(input ?? '')
    .replace(/[\s·・\-_—–/、，,（）()【】\[\]]/g, '')
    .toLowerCase();
}

/** 中文名生成稳定 slug（同维度下唯一） */
function autoSlug(name: string) {
  return `ai-${createHash('sha1').update(normName(name)).digest('hex').slice(0, 12)}`;
}

interface SeedNode {
  name: string;
  slug: string;
  children: { name: string; slug: string }[];
}

/**
 * 推荐分类树：作为 AI 分类的种子候选。
 * 只在该维度完全没有分类时播种，不覆盖运营已有的任何结构。
 */
const SEED_TREE: Record<Dimension, SeedNode[]> = {
  format: [
    {
      name: 'PPT 模板',
      slug: 'ppt',
      children: [
        { name: '工作汇报', slug: 'work-report' },
        { name: '总结述职', slug: 'summary-review' },
        { name: '课件教学', slug: 'courseware' },
        { name: '商业计划', slug: 'business-plan' },
        { name: '宣传推广', slug: 'promotion' },
        { name: '活动策划', slug: 'event-plan' },
      ],
    },
    {
      name: 'Word 文档',
      slug: 'word',
      children: [
        { name: '简历求职', slug: 'resume' },
        { name: '方案策划', slug: 'proposal' },
        { name: '合同协议', slug: 'contract' },
        { name: '公文通知', slug: 'official-doc' },
        { name: '报告总结', slug: 'report-doc' },
      ],
    },
    {
      name: 'Excel 表格',
      slug: 'excel',
      children: [
        { name: '财务报表', slug: 'finance-sheet' },
        { name: '数据看板', slug: 'dashboard-sheet' },
        { name: '计划排期', slug: 'schedule-sheet' },
        { name: '台账清单', slug: 'ledger-sheet' },
      ],
    },
    {
      name: '设计素材',
      slug: 'design',
      children: [
        { name: '海报', slug: 'poster' },
        { name: '画册', slug: 'brochure' },
        { name: '名片', slug: 'card' },
        { name: '信息图表', slug: 'infographic' },
      ],
    },
  ],
  scene: [
    {
      name: '职场办公',
      slug: 'workplace',
      children: [
        { name: '汇报总结', slug: 'report' },
        { name: '方案策划', slug: 'planning' },
        { name: '会议纪要', slug: 'minutes' },
        { name: '培训课件', slug: 'training' },
      ],
    },
    {
      name: '学习成长',
      slug: 'study',
      children: [
        { name: '论文答辩', slug: 'thesis' },
        { name: '课程作业', slug: 'assignment' },
        { name: '知识笔记', slug: 'notes' },
      ],
    },
    {
      name: '营销运营',
      slug: 'marketing',
      children: [
        { name: '活动策划', slug: 'campaign' },
        { name: '品牌宣传', slug: 'branding' },
        { name: '电商促销', slug: 'ecommerce' },
        { name: '社交媒体', slug: 'social' },
      ],
    },
    {
      name: '生活记录',
      slug: 'life',
      children: [
        { name: '个人简历', slug: 'personal-resume' },
        { name: '婚礼庆典', slug: 'wedding' },
        { name: '节日祝福', slug: 'festival' },
      ],
    },
  ],
  audience: [
    {
      name: '职场人群',
      slug: 'office-worker',
      children: [
        { name: '职场新人', slug: 'newcomer' },
        { name: '管理者', slug: 'manager' },
        { name: '销售运营', slug: 'sales' },
      ],
    },
    {
      name: '学生教师',
      slug: 'campus',
      children: [
        { name: '大学生', slug: 'student' },
        { name: '教师', slug: 'teacher' },
      ],
    },
    {
      name: '企业团队',
      slug: 'business',
      children: [
        { name: '创业公司', slug: 'startup' },
        { name: '中小企业', slug: 'sme' },
        { name: '自由职业', slug: 'freelancer' },
      ],
    },
  ],
  theme: [
    {
      name: '简约商务',
      slug: 'minimal-business',
      children: [
        { name: '极简黑白', slug: 'mono' },
        { name: '商务蓝', slug: 'business-blue' },
        { name: '杂志排版', slug: 'editorial' },
      ],
    },
    {
      name: '科技未来',
      slug: 'tech',
      children: [
        { name: '科技蓝紫', slug: 'tech-purple' },
        { name: '数据可视化', slug: 'dataviz' },
      ],
    },
    {
      name: '清新自然',
      slug: 'fresh',
      children: [
        { name: '小清新绿', slug: 'fresh-green' },
        { name: '手绘插画', slug: 'handdrawn' },
      ],
    },
    {
      name: '国潮风格',
      slug: 'chinese-style',
      children: [
        { name: '中国风', slug: 'chinoiserie' },
        { name: '水墨丹青', slug: 'ink' },
      ],
    },
  ],
};

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

  /** 公开接口：仅启用且有已发布模板的分类，按维度返回两级树 */
  async publicTree(dimension?: string) {
    const where: Prisma.CategoryWhereInput = { enabled: true };
    if (dimension) {
      this.assertDimension(dimension);
      where.dimension = dimension as never;
    }
    const [all, contentCounts] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
      // 自动分类会生成大量空分类，公开端只展示真正有内容的，避免用户看到空目录
      this.prisma.templateCategory.groupBy({
        by: ['categoryId'],
        where: { template: { status: 'published' } },
        _count: { _all: true },
      }),
    ]);
    const withContent = new Set(contentCounts.map((c) => c.categoryId));
    const roots = all.filter((c) => c.parentId === null);
    const childrenMap = new Map<number, typeof all>();
    for (const c of all) {
      if (c.parentId !== null && withContent.has(c.id)) {
        const list = childrenMap.get(c.parentId) ?? [];
        list.push(c);
        childrenMap.set(c.parentId, list);
      }
    }
    return roots
      .map((root) => ({
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
      }))
      // 自身无模板、子分类也全空的分类对用户没有意义
      .filter((root) => root.children.length > 0 || withContent.has(root.id));
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

  // ─────────────────── AI 自动分类支持（种子 / 路径解析 / 自动建分类） ───────────────────

  /**
   * 补齐推荐分类树：仅当某维度一个分类都没有时才播种，绝不动运营已建的结构。
   * 返回本次新建的分类数量，便于日志与前端提示。
   */
  async ensureSeedCategories(): Promise<{ created: number; dimensions: Dimension[] }> {
    const counts = await this.prisma.category.groupBy({
      by: ['dimension'],
      _count: { _all: true },
    });
    const existing = new Set(counts.map((c) => c.dimension as string));
    const seeded: Dimension[] = [];
    let created = 0;

    for (const dimension of DIMENSIONS) {
      if (existing.has(dimension)) continue;
      seeded.push(dimension);
      let sort = 0;
      for (const root of SEED_TREE[dimension]) {
        const rootRow = await this.prisma.category.create({
          data: { dimension, name: root.name, slug: root.slug, sort: sort++ },
        });
        created += 1;
        let childSort = 0;
        for (const child of root.children) {
          await this.prisma.category.create({
            data: {
              dimension,
              parentId: rootRow.id,
              name: child.name,
              slug: child.slug,
              sort: childSort++,
            },
          });
          created += 1;
        }
      }
    }
    return { created, dimensions: seeded };
  }

  /** 当前分类树快照，供 AI prompt 使用 */
  async treeForPrompt() {
    const all = await this.prisma.category.findMany({
      where: { enabled: true },
      orderBy: [{ dimension: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      select: { id: true, dimension: true, parentId: true, name: true },
    });
    const byId = new Map(all.map((c) => [c.id, c]));
    return all.map((c) => {
      const parent = c.parentId ? byId.get(c.parentId) : null;
      return { id: c.id, dimension: c.dimension as string, parent: parent?.name ?? null, name: c.name };
    });
  }

  /**
   * 解析 AI 输出的分类路径并落库。
   * 路径格式：`维度/一级分类` 或 `维度/一级分类/二级分类`
   *
   * 防乱建策略：
   * - 一级分类只允许复用已有，或使用推荐分类树里的标准名（除非 allowNewRoots）
   * - 单次最多新建 maxNew 个二级分类，超出则复用最近已有的一级分类
   */
  async resolveCategoryPaths(
    paths: unknown,
    opts: { autoCreate?: boolean; allowNewRoots?: boolean; maxNew?: number } = {},
  ): Promise<{ ids: number[]; created: string[] }> {
    const autoCreate = opts.autoCreate !== false;
    const allowNewRoots = opts.allowNewRoots === true;
    const maxNew = opts.maxNew ?? 3;
    const ids = new Set<number>();
    const created: string[] = [];
    let newCount = 0;
    if (!Array.isArray(paths)) return { ids: [], created };

    for (const raw of paths.slice(0, 6)) {
      if (typeof raw !== 'string') continue;
      const parts = raw.split('/').map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const dimension = parts[0] as Dimension;
      if (!DIMENSIONS.includes(dimension)) continue;
      const rootName = parts[1];
      const childName = parts[2];

      // 一级分类：先复用
      let root = await this.findCategoryBySiblingName(dimension, null, rootName);
      if (!root) {
        const isSeedRoot = SEED_TREE[dimension].some((r) => normName(r.name) === normName(rootName));
        if (!autoCreate || (!allowNewRoots && !isSeedRoot)) continue; // 不认野一级，交给兜底
        root = await this.createCategoryRow(dimension, null, rootName);
        newCount += 1;
        created.push(`${dimension}/${rootName}`);
      }

      if (!childName) {
        ids.add(root.id);
        continue;
      }
      const child = await this.findCategoryBySiblingName(dimension, root.id, childName);
      if (child) {
        ids.add(child.id);
        continue;
      }
      if (autoCreate && newCount < maxNew) {
        const row = await this.createCategoryRow(dimension, root.id, childName);
        newCount += 1;
        created.push(`${dimension}/${rootName}/${childName}`);
        ids.add(row.id);
      } else {
        ids.add(root.id); // 新建额度用尽：退化为挂一级分类
      }
    }
    return { ids: [...ids], created };
  }

  private async findCategoryBySiblingName(
    dimension: Dimension,
    parentId: number | null,
    name: string,
  ): Promise<{ id: number } | null> {
    const siblings = await this.prisma.category.findMany({
      where: { dimension: dimension as never, parentId },
      select: { id: true, name: true },
    });
    const key = normName(name);
    return siblings.find((c) => normName(c.name) === key) ?? null;
  }

  private async createCategoryRow(dimension: Dimension, parentId: number | null, name: string) {
    const clean = name.trim().slice(0, 64);
    let slug = autoSlug(clean);
    for (let i = 1; i < 6; i += 1) {
      const dup = await this.prisma.category.findUnique({
        where: { dimension_slug: { dimension: dimension as never, slug } },
      });
      if (!dup) break;
      slug = `${autoSlug(clean)}-${i}`;
    }
    return this.prisma.category.create({
      data: { dimension: dimension as never, parentId, name: clean, slug, sort: 999 },
      select: { id: true },
    });
  }

  /** 解析 AI 输出的标签名，不存在的按需创建 */
  async resolveTagNames(names: unknown, opts: { autoCreate: boolean } = { autoCreate: true }) {
    if (!Array.isArray(names)) return [];
    const ids = new Set<number>();
    for (const raw of names.slice(0, 8)) {
      if (typeof raw !== 'string') continue;
      const name = raw.trim().slice(0, 64);
      if (!name) continue;
      const hit = await this.prisma.tag.findUnique({ where: { name } });
      if (hit) {
        ids.add(hit.id);
        continue;
      }
      if (!opts.autoCreate) continue;
      try {
        const created = await this.prisma.tag.create({ data: { name }, select: { id: true } });
        ids.add(created.id);
      } catch {
        // 并发下唯一约束冲突：回查一次
        const again = await this.prisma.tag.findUnique({ where: { name }, select: { id: true } });
        if (again) ids.add(again.id);
      }
    }
    return [...ids];
  }

  /**
   * AI 分类失败时的兜底：按文件格式挂到对应的一级分类，保证能通过「至少 1 个分类」的提审校验。
   */
  async fallbackCategoryId(format: string): Promise<number | null> {
    const map: Record<string, string> = {
      ppt: 'PPT 模板',
      word: 'Word 文档',
      excel: 'Excel 表格',
      pdf: '设计素材',
      image: '设计素材',
      archive: '设计素材',
      other: 'PPT 模板',
    };
    const want = normName(map[format] ?? 'PPT 模板');
    const roots = await this.prisma.category.findMany({
      where: { dimension: 'format', parentId: null, enabled: true },
      select: { id: true, name: true },
    });
    const hit = roots.find((c) => normName(c.name) === want);
    if (hit) return hit.id;
    return roots[0]?.id ?? null;
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
