import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AdminAiService } from "./admin-ai.service";
import { DeepSeekService } from "./deepseek.service";

/**
 * DeepSeek 平价时段自动标注。
 *
 * 官方空闲/平价时段（北京时间）：
 * - 周一至周五：00:00–09:00、12:00–14:00、18:00–24:00
 * - 周末及中国法定节假日：全天
 * - 高峰：周一至周五 09:00–12:00、14:00–18:00
 *
 * 每次只串行调用一个模板，避免 2C2G 服务器同时打多个 DeepSeek 请求。
 * 只自动应用 safe=true 且 confidence >= AI_AUTO_MIN_CONFIDENCE 的结果；
 * 低置信度结果保留给管理端人工复核。
 */
@Injectable()
export class AdminAiAutoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminAiAutoService.name);
  private readonly enabled = (process.env.AI_AUTO_ENABLED || "true").trim() !== "false";
  private readonly minConfidence = clamp(Number.parseFloat(process.env.AI_AUTO_MIN_CONFIDENCE || "0.85"), 0, 1, 0.85);
  private readonly delayMs = Math.max(1000, Number.parseInt(process.env.AI_AUTO_DELAY_MS || "2500", 10) || 2500);
  private readonly holidays = new Set(
    (process.env.AI_AUTO_HOLIDAYS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  private timer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AdminAiService,
    private readonly deepseek: DeepSeekService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log("AI 自动标注已关闭（AI_AUTO_ENABLED=false）");
      return;
    }
    if (!this.deepseek.configured) {
      this.logger.warn("AI 自动标注未启动：DEEPSEEK_API_KEY 未配置");
      return;
    }
    this.logger.log(
      `AI 自动标注已启用：平价时段执行，置信度阈值 ${this.minConfidence}，间隔 ${this.delayMs}ms`,
    );
    this.initialTimer = setTimeout(() => void this.tick(), 5_000);
    this.timer = setInterval(() => void this.tick(), 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
  }

  private async tick(): Promise<void> {
    if (this.running || !this.isOffPeak(new Date())) return;
    this.running = true;
    try {
      await this.processUntilWindowEnds();
    } catch (error) {
      this.logger.error(`AI 自动标注异常：${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async processUntilWindowEnds(): Promise<void> {
    let processed = 0;
    while (this.isOffPeak(new Date())) {
      const candidate = await this.nextCandidate();
      if (!candidate) break;

      if (candidate.kind === "apply") {
        await this.applyExisting(candidate.id);
      } else {
        await this.annotateOne(candidate.id);
      }
      processed += 1;

      if (processed % 20 === 0) {
        this.logger.log(`AI 自动标注进度：本次已处理 ${processed} 个模板`);
      }
      await sleep(this.delayMs);
    }
    if (processed > 0) this.logger.log(`AI 自动标注本轮结束，共处理 ${processed} 个模板`);
  }

  private async nextCandidate(): Promise<{ kind: "annotate" | "apply"; id: string } | null> {
    // 优先应用已存在的高置信度结果，不重复消耗 DeepSeek tokens
    const ready = await this.prisma.aiAnalysis.findFirst({
      where: {
        needsReview: true,
        safe: true,
        confidence: { gte: this.minConfidence },
        template: { status: { in: ["published", "imported", "pending_review", "ai_processing"] } },
      },
      orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
      select: { templateId: true },
    });
    if (ready) return { kind: "apply", id: ready.templateId };

    const template = await this.prisma.template.findFirst({
      where: {
        status: { in: ["published", "imported", "pending_review"] },
        aiAnalysis: { is: null },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return template ? { kind: "annotate", id: template.id } : null;
  }

  private async annotateOne(templateId: string): Promise<void> {
    try {
      const result = await this.ai.annotate(templateId);
      const confidence = result.analysis.confidence ?? 0;
      if (!result.analysis.safe || confidence < this.minConfidence) {
        this.logger.log(
          `AI 自动标注跳过 ${templateId}：confidence=${confidence.toFixed(2)} safe=${result.analysis.safe}`,
        );
        return;
      }
      await this.ai.apply(templateId);
      await this.prisma.aiAnalysis.update({
        where: { templateId },
        data: { needsReview: false },
      });
      this.logger.log(
        `AI 自动标注完成 ${templateId}：${result.analysis.title || ""} / ${result.analysis.categoryKey || "未分类"} / ${confidence.toFixed(2)}`,
      );
    } catch (error) {
      this.logger.warn(`AI 自动标注失败 ${templateId}：${(error as Error).message}`);
    }
  }

  private async applyExisting(templateId: string): Promise<void> {
    try {
      await this.ai.apply(templateId);
      await this.prisma.aiAnalysis.update({
        where: { templateId },
        data: { needsReview: false },
      });
      this.logger.log(`AI 自动应用完成 ${templateId}`);
    } catch (error) {
      this.logger.warn(`AI 自动应用失败 ${templateId}：${(error as Error).message}`);
    }
  }

  /** 以北京时间为准判断当前是否 DeepSeek 平价时段 */
  private isOffPeak(now: Date): boolean {
    const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const year = beijing.getUTCFullYear();
    const month = String(beijing.getUTCMonth() + 1).padStart(2, "0");
    const day = String(beijing.getUTCDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;
    const weekday = beijing.getUTCDay(); // 0=周日
    if (weekday === 0 || weekday === 6 || this.holidays.has(dateKey)) return true;

    const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
    const isPeak = (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60);
    return !isPeak;
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
