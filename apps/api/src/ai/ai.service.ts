import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TaxonomyService } from '../taxonomy/taxonomy.service';

interface AiSuggestion {
  title: string;
  summary: string;
  categoryIds: number[];
  tagIds: number[];
  suggestedPrice: number;
  [key: string]: unknown;
}

/**
 * AI 辅助分类（M1-7）：DeepSeek vision 模型
 * 输入：封面/预览图 + 元信息；输出：标题/摘要/分类路径/标签/建议积分价
 *
 * 分类采用「路径 + 自动落库」策略：AI 输出 `维度/一级/二级`，由 TaxonomyService
 * 复用或按需创建，因此分类池会随使用自我生长，运营无需预先建全分类树。
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  private get apiKey() {
    return this.config.get<string>('DEEPSEEK_API_KEY') || '';
  }

  private get model() {
    return this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-flash';
  }

  /**
   * 调 DeepSeek vision 生成建议。
   * @param apply true=直接写入模板（批量导入用），false=仅返回建议（编辑页预览用）
   * @param options.autoCreateCategory 是否允许自动创建分类/标签（默认允许）
   */
  async enrichTemplate(
    templateId: number,
    apply: boolean,
    options: { autoCreateCategory?: boolean } = {},
  ) {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('未配置 DEEPSEEK_API_KEY，AI 辅助分类不可用');
    }
    const autoCreate = options.autoCreateCategory !== false;

    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      include: {
        files: { select: { previewUrl: true } },
        categories: { select: { category: { select: { id: true } } } },
      },
    });
    if (!template) {
      throw new ServiceUnavailableException(`模板 ${templateId} 不存在`);
    }

    // 先补齐推荐分类树，AI 才有稳定的父级可选
    await this.taxonomy.ensureSeedCategories();

    const [categoryRows, categoryTree, tags] = await Promise.all([
      this.prisma.category.findMany({
        where: { enabled: true, parentId: { not: null } },
        select: { id: true, name: true, dimension: true, parent: { select: { name: true } } },
      }),
      this.taxonomy.treeForPrompt(),
      this.prisma.tag.findMany({ select: { id: true, name: true }, take: 100 }),
    ]);

    const roots = categoryTree.filter((c) => !c.parent);
    const dimensionLabel: Record<string, string> = {
      format: '形式',
      scene: '场景',
      audience: '人群',
      theme: '风格',
    };
    const treeLines = (['format', 'scene', 'audience', 'theme'] as const).map((dim) => {
      const dimRoots = roots.filter((c) => c.dimension === dim);
      const parts = dimRoots.map((root) => {
        const children = categoryRows
          .filter((c) => c.dimension === dim && c.parent?.name === root.name)
          .map((c) => c.name);
        return children.length ? `${root.name}（${children.join('、')}）` : root.name;
      });
      return `- ${dim}（${dimensionLabel[dim]}）：${parts.join('；') || '（暂无，可自建二级）'}`;
    });

    // 图片优先级：封面 → meta.previews（自动渲染的多页预览）→ 文件预览图，最多 3 张
    const metaPreviews = Array.isArray((template.meta as { previews?: unknown } | null)?.previews)
      ? ((template.meta as { previews: string[] }).previews ?? [])
      : [];
    const images = [
      ...(template.cover ? [template.cover] : []),
      ...metaPreviews.filter((url) => url !== template.cover),
      ...template.files.map((f) => f.previewUrl).filter((u): u is string => !!u),
    ].slice(0, 3);

    const systemPrompt = [
      '你是模板资源库的内容运营助手。根据模板封面/预览截图与元信息，输出内容建议。',
      '必须只输出一个 JSON 对象，不要任何多余文字或 Markdown 代码块标记。',
      'JSON 字段：',
      'title（字符串，≤32字，有吸引力的标题）、summary（字符串，≤80字，一句话卖点）、',
      'categoryPaths（字符串数组，2-4 条分类路径）、tags（字符串数组，0-6 个中文短标签，每个≤6字）、',
      'suggestedPrice（整数，0-100，0=免费；普通模板 10-30）。',
      '',
      'categoryPaths 规则（非常重要）：',
      '1. 每条格式必须是「维度/一级分类」或「维度/一级分类/二级分类」，维度只能是 format/scene/audience/theme。',
      '2. 第二段必须原样使用下面列出的已有「一级分类」名称，禁止凭空造新的一级分类。',
      '3. 第三段优先复用括号内的已有二级分类名称；确实没有贴切的，才可以自拟一个简洁通用名（≤8字，不要带书名号或引号）。',
      '4. format 维度必须给 1 条，且要与文件格式一致；scene/audience/theme 各最多 1 条，宁缺勿滥。',
      '',
      '可用分类：',
      ...treeLines,
    ].join('\n');

    const userText = [
      `当前标题：${template.title}`,
      `格式：${template.format}`,
      `已有分类 id：${template.categories.map((c) => c.category.id).join(',') || '无'}`,
      images.length ? '附上模板截图，请据此判断主题与风格。' : '没有截图，请仅依据标题与格式推断。',
    ].join('\n');

    const contentParts: Record<string, unknown>[] = [{ type: 'text', text: userText }];
    for (const url of images) {
      contentParts.push({ type: 'image_url', image_url: { url } });
    }

    let raw: string;
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: contentParts },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 800,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ServiceUnavailableException(`DeepSeek 调用失败（${res.status}）：${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      raw = data.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      throw new ServiceUnavailableException(`DeepSeek 请求异常：${e instanceof Error ? e.message : 'unknown'}`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // 模型偶尔输出代码块，做一次兜底剥离
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new ServiceUnavailableException('DeepSeek 返回内容无法解析为 JSON');
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    }

    // ── 分类：路径解析 + 自动落库 ──
    const paths = Array.isArray(parsed.categoryPaths) ? parsed.categoryPaths : [];
    const resolved = await this.taxonomy.resolveCategoryPaths(paths, {
      autoCreate,
      allowNewRoots: false,
      maxNew: 3,
    });
    let categoryIds = resolved.ids;
    if (!categoryIds.length) {
      // 兼容 AI 直接给 id 的旧格式
      const legacyIds = Array.isArray(parsed.categoryIds) ? (parsed.categoryIds as number[]) : [];
      categoryIds = legacyIds.filter((id) => categoryRows.some((c) => c.id === id)).slice(0, 4);
    }
    if (!categoryIds.length) {
      // 兜底：按格式挂一级分类，保证提审「至少 1 个分类」不被卡住
      const fallback = await this.taxonomy.fallbackCategoryId(template.format);
      if (fallback) categoryIds = [fallback];
    }

    // ── 标签：按名解析，不存在则创建 ──
    const tagNames = Array.isArray(parsed.tags) ? parsed.tags : [];
    const createdTags = tagNames.length ? await this.taxonomy.resolveTagNames(tagNames, { autoCreate }) : [];
    const validTagIds = createdTags.length
      ? createdTags
      : (Array.isArray(parsed.tagIds) ? (parsed.tagIds as number[]) : []).filter((id) =>
          tags.some((t) => t.id === id),
        );

    const suggestion: AiSuggestion = {
      title: String(parsed.title ?? template.title).slice(0, 128),
      summary: String(parsed.summary ?? template.summary ?? '').slice(0, 512),
      categoryIds: categoryIds.slice(0, 4),
      tagIds: validTagIds.slice(0, 6),
      suggestedPrice: Math.max(0, Math.min(100, Number(parsed.suggestedPrice ?? 0) || 0)),
      createdCategories: resolved.created,
      categoryPaths: Array.isArray(paths) ? paths : [],
    };

    // 建议存档（meta.aiSuggestion），便于运营追溯
    await this.prisma.template.update({
      where: { id: templateId },
      data: {
        meta: { ...((template.meta as object) ?? {}), aiSuggestion: suggestion } as Prisma.InputJsonValue,
      },
    });
    this.logger.log(
      `AI 建议已生成 template=${templateId} 分类=${categoryIds.join(',')} 新建分类=${resolved.created.length}`,
    );

    if (apply) {
      await this.prisma.$transaction([
        this.prisma.template.update({
          where: { id: templateId },
          data: {
            title: suggestion.title,
            summary: suggestion.summary,
            baseCreditPrice: suggestion.suggestedPrice,
          },
        }),
        // 分类/标签整体替换
        this.prisma.templateCategory.deleteMany({ where: { templateId } }),
        this.prisma.templateTag.deleteMany({ where: { templateId } }),
      ]);
      if (suggestion.categoryIds.length) {
        await this.prisma.templateCategory.createMany({
          data: suggestion.categoryIds.map((categoryId) => ({ templateId, categoryId })),
        });
      }
      if (suggestion.tagIds.length) {
        await this.prisma.templateTag.createMany({
          data: suggestion.tagIds.map((tagId) => ({ templateId, tagId })),
        });
      }
    }

    return { applied: apply, suggestion };
  }
}
