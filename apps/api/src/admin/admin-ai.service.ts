import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DeepSeekService } from "./deepseek.service";

interface AnalysisDto {
  id: string;
  title: string | null;
  categoryKey: string | null;
  tags: string[];
  summary: string | null;
  confidence: number | null;
  safe: boolean;
  needsReview: boolean;
  model: string | null;
}

@Injectable()
export class AdminAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deepseek: DeepSeekService,
  ) {}

  async annotate(id: string): Promise<{
    analysis: AnalysisDto;
    matchedCategory: { key: string; name: string } | null;
    status: string;
  }> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("模板不存在");
    if (!this.deepseek.configured) throw new BadRequestException("服务端未配置 DEEPSEEK_API_KEY");

    const categories = await this.prisma.category.findMany({ orderBy: [{ sort: "asc" }] });
    const text = (template.textContent || {}) as {
      title?: string;
      outline?: string[];
      firstPagesText?: string[];
    };

    let result: Awaited<ReturnType<DeepSeekService["suggest"]>>;
    try {
      result = await this.deepseek.suggest({
        titleGuess: template.title || template.originalName,
        text,
        categories: categories.map((item) => ({ key: item.slug, name: item.name })),
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const suggestion = result.suggestion;
    const matchedCategory = categories.find((item) => item.slug === suggestion.categoryKey) || null;

    const analysis = await this.prisma.aiAnalysis.upsert({
      where: { templateId: id },
      update: {
        title: suggestion.title,
        categoryKey: suggestion.categoryKey,
        tags: suggestion.tags as unknown as Prisma.InputJsonValue,
        summary: suggestion.summary,
        confidence: suggestion.confidence,
        safe: suggestion.safe,
        needsReview: true,
        raw: result.raw as unknown as Prisma.InputJsonValue,
        model: result.model,
        promptVersion: "v1",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      create: {
        templateId: id,
        title: suggestion.title,
        categoryKey: suggestion.categoryKey,
        tags: suggestion.tags as unknown as Prisma.InputJsonValue,
        summary: suggestion.summary,
        confidence: suggestion.confidence,
        safe: suggestion.safe,
        needsReview: true,
        raw: result.raw as unknown as Prisma.InputJsonValue,
        model: result.model,
        promptVersion: "v1",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });

    let status = template.status;
    if (["draft", "imported", "ai_processing", "failed"].includes(template.status)) {
      status = "pending_review";
      await this.prisma.template.update({ where: { id }, data: { status: "pending_review" } });
    }

    return {
      analysis: this.toDto(analysis),
      matchedCategory: matchedCategory ? { key: matchedCategory.slug, name: matchedCategory.name } : null,
      status,
    };
  }

  async apply(id: string): Promise<{
    applied: boolean;
    id: string;
    title: string;
    categoryKey: string | null;
    tags: string[];
    status: string;
  }> {
    const template = await this.prisma.template.findUnique({
      where: { id },
      include: { aiAnalysis: true },
    });
    if (!template) throw new NotFoundException("模板不存在");
    const analysis = template.aiAnalysis;
    if (!analysis) throw new BadRequestException("该模板还没有 AI 标注结果，请先执行标注");

    const title = (analysis.title || template.title || template.originalName || "未命名模板").trim().slice(0, 200);
    const summary = (analysis.summary || "").trim().slice(0, 500);
    const categoryKey = analysis.categoryKey || "";
    const category = categoryKey
      ? await this.prisma.category.findFirst({ where: { slug: categoryKey } })
      : null;
    const tagNames = Array.isArray(analysis.tags)
      ? (analysis.tags as unknown[]).filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 4)
      : [];

    const tagIds: string[] = [];
    for (let index = 0; index < tagNames.length; index += 1) {
      const tag = await this.prisma.tag.upsert({
        where: { name: tagNames[index]! },
        update: {},
        create: { name: tagNames[index]!, type: "style" },
      });
      tagIds.push(tag.id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.templateTag.deleteMany({ where: { templateId: id } });
      if (tagIds.length > 0) {
        await tx.templateTag.createMany({
          data: tagIds.map((tagId, index) => ({ templateId: id, tagId, sort: index })),
        });
      }
      await tx.template.update({
        where: { id },
        data: {
          title,
          description: summary || undefined,
          categoryId: category?.id ?? undefined,
          status: template.status === "published" ? "published" : "pending_review",
        },
      });
    });

    return {
      applied: true,
      id,
      title,
      categoryKey: category?.slug || null,
      tags: tagNames,
      status: template.status === "published" ? "published" : "pending_review",
    };
  }

  async annotateBatch(body: { ids?: unknown; limit?: unknown }): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    items: Array<{
      id: string;
      title: string;
      ok: boolean;
      message?: string;
      analysis?: AnalysisDto;
    }>;
  }> {
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((item): item is string => typeof item === "string").slice(0, 5)
      : [];
    const rawLimit = Number.parseInt(String(body.limit ?? ""), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(5, Math.max(1, rawLimit)) : 3;

    const targets = ids.length
      ? await this.prisma.template.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, originalName: true },
        })
      : await this.prisma.template.findMany({
          where: {
            status: { in: ["imported", "draft"] },
            aiAnalysis: { is: null },
          },
          orderBy: { createdAt: "asc" },
          take: limit,
          select: { id: true, title: true, originalName: true },
        });

    const items: Array<{
      id: string;
      title: string;
      ok: boolean;
      message?: string;
      analysis?: AnalysisDto;
    }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const target of targets) {
      const label = target.title || target.originalName || target.id;
      try {
        const result = await this.annotate(target.id);
        succeeded += 1;
        items.push({ id: target.id, title: label, ok: true, analysis: result.analysis });
      } catch (error) {
        failed += 1;
        items.push({
          id: target.id,
          title: label,
          ok: false,
          message: (error as Error).message || "标注失败",
        });
      }
    }

    return { total: targets.length, succeeded, failed, items };
  }

  async autoApply(body: { minConfidence?: unknown; limit?: unknown }): Promise<{
    applied: number;
    failed: number;
    items: Array<{ id: string; title: string; ok: boolean; message?: string }>;
  }> {
    const parsedConfidence = Number.parseFloat(String(body.minConfidence ?? "0.9"));
    const minConfidence = Number.isFinite(parsedConfidence)
      ? Math.min(1, Math.max(0, parsedConfidence))
      : 0.9;
    const parsedLimit = Number.parseInt(String(body.limit ?? ""), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(20, Math.max(1, parsedLimit)) : 20;

    const rows = await this.prisma.aiAnalysis.findMany({
      where: {
        needsReview: true,
        safe: true,
        confidence: { gte: minConfidence },
        template: { status: { in: ["pending_review", "imported", "draft", "ai_processing"] } },
      },
      orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
      take: limit,
      include: { template: { select: { id: true, title: true, originalName: true } } },
    });

    const items: Array<{ id: string; title: string; ok: boolean; message?: string }> = [];
    let applied = 0;
    let failed = 0;

    for (const row of rows) {
      const label = row.template.title || row.template.originalName || row.templateId;
      try {
        await this.apply(row.templateId);
        await this.prisma.aiAnalysis.update({
          where: { templateId: row.templateId },
          data: { needsReview: false },
        });
        applied += 1;
        items.push({ id: row.templateId, title: label, ok: true });
      } catch (error) {
        failed += 1;
        items.push({
          id: row.templateId,
          title: label,
          ok: false,
          message: (error as Error).message || "自动应用失败",
        });
      }
    }

    return { applied, failed, items };
  }

  private toDto(row: {
    id: string;
    title: string | null;
    categoryKey: string | null;
    tags: unknown;
    summary: string | null;
    confidence: number | null;
    safe: boolean;
    needsReview: boolean;
    model: string | null;
  }): AnalysisDto {
    return {
      id: row.id,
      title: row.title,
      categoryKey: row.categoryKey,
      tags: Array.isArray(row.tags) ? (row.tags as unknown[]).filter((item): item is string => typeof item === "string") : [],
      summary: row.summary,
      confidence: row.confidence,
      safe: row.safe,
      needsReview: row.needsReview,
      model: row.model,
    };
  }
}
