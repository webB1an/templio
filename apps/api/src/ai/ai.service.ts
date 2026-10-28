import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
 * 输入：封面/预览图 + 元信息；输出：标题/摘要/分类/标签/建议积分价（人工确认后应用）
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get apiKey() {
    return this.config.get<string>('DEEPSEEK_API_KEY') || '';
  }

  private get model() {
    return this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-flash';
  }

  /** 调 DeepSeek vision 生成建议。未配 Key 时返回明确错误（优雅降级，不阻塞主流程） */
  async enrichTemplate(templateId: number, apply: boolean) {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('未配置 DEEPSEEK_API_KEY，AI 辅助分类不可用');
    }
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

    const [categories, tags] = await Promise.all([
      this.prisma.category.findMany({
        where: { enabled: true, parentId: { not: null } },
        select: { id: true, name: true, dimension: true, parent: { select: { name: true } } },
      }),
      this.prisma.tag.findMany({ select: { id: true, name: true }, take: 100 }),
    ]);

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
      'title（字符串，≤32字，吸引力标题）、summary（字符串，≤80字，一句话卖点）、',
      'categoryIds（从候选分类中选 2-4 个最相关的 id）、tagIds（从候选标签中选 0-6 个 id）、',
      'suggestedPrice（整数，0-100，0=免费；普通模板 10-30）',
    ].join('\n');

    const userText = [
      `当前标题：${template.title}`,
      `格式：${template.format}`,
      `已有分类：${template.categories.map((c) => c.category.id).join(',') || '无'}`,
      `候选分类：${categories.map((c) => `${c.id}=${c.parent?.name ?? ''}/${c.name}(${c.dimension})`).join('；')}`,
      `候选标签：${tags.map((t) => `${t.id}=${t.name}`).join('；')}`,
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

    let parsed: Partial<AiSuggestion>;
    try {
      parsed = JSON.parse(raw) as Partial<AiSuggestion>;
    } catch {
      // 模型偶尔输出代码块，做一次兜底剥离
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new ServiceUnavailableException('DeepSeek 返回内容无法解析为 JSON');
      parsed = JSON.parse(match[0]) as Partial<AiSuggestion>;
    }

    const validCategoryIds = (parsed.categoryIds ?? []).filter((id) =>
      categories.some((c) => c.id === id),
    );
    const validTagIds = (parsed.tagIds ?? []).filter((id) => tags.some((t) => t.id === id));
    const suggestion: AiSuggestion = {
      title: String(parsed.title ?? template.title).slice(0, 128),
      summary: String(parsed.summary ?? template.summary ?? '').slice(0, 512),
      categoryIds: validCategoryIds.slice(0, 4),
      tagIds: validTagIds.slice(0, 6),
      suggestedPrice: Math.max(0, Math.min(100, Number(parsed.suggestedPrice ?? 0) || 0)),
    };

    // 建议存档（meta.aiSuggestion），便于运营追溯
    await this.prisma.template.update({
      where: { id: templateId },
      data: { meta: { ...(template.meta as object ?? {}), aiSuggestion: suggestion } as Prisma.InputJsonValue },
    });
    this.logger.log(`AI 建议已生成 template=${templateId}`);

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
