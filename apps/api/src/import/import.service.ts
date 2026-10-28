import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, ProcessingTaskStatus } from '@prisma/client';
import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { RenderService } from '../render/render.service';
import { StorageCoordinatorService } from '../storage/storage-drives.service';
import { AiService } from '../ai/ai.service';
import { TemplatesService, inferFormat } from '../templates/templates.service';
import { TaxonomyService } from '../taxonomy/taxonomy.service';

export interface ImportOptions {
  /** 目标网盘；不传则使用该类网盘的默认账号 */
  provider?: 'quark' | 'baidu';
  /** 是否用 AI 自动补全标题/摘要/分类/标签/定价 */
  useAi: boolean;
  /** 信息完整时自动提审 */
  autoSubmit: boolean;
  /** 最多生成多少页预览图 */
  maxPages: number;
}

/** 任务载荷：已完成阶段的结果写入载荷，重试时跳过，避免重复上传/重复消耗 AI */
interface ImportPayload {
  tempPath: string;
  originalName: string;
  size?: number;
  adminId: number;
  options: ImportOptions;
  render?: { cover: string; coverThumb: string; previews: string[]; pages: number };
  templateId?: number;
  share?: {
    provider: string;
    url: string;
    passcode?: string;
    remoteFileId?: string | null;
    remotePath?: string | null;
    remoteName?: string;
  };
  aiApplied?: boolean;
  submitted?: boolean;
  notes?: string[];
}

export interface StageUpdate {
  stage: string;
  progress: number;
  message: string;
}

/**
 * 批量导入全自动流水线（资源管理 → 批量导入）：
 * 原文件 → 渲染首图/预览图 → 建草稿 → 上传网盘并生成分享链接 → AI 补全 → 自动提审。
 *
 * 任务状态落库（ProcessingTask），进程内串行执行：服务器内存有限，
 * LibreOffice 与上传都不能并发；重启后未完成任务自动回到队列。
 */
@Injectable()
export class ImportService implements OnModuleInit {
  private readonly logger = new Logger(ImportService.name);
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly render: RenderService,
    private readonly storage: StorageCoordinatorService,
    private readonly ai: AiService,
    private readonly templates: TemplatesService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  async onModuleInit() {
    // 进程重启（含 CD 部署）后，把僵死的 running 任务放回队列
    const reset = await this.prisma.processingTask.updateMany({
      where: { type: 'import_pipeline', status: ProcessingTaskStatus.running },
      data: {
        status: ProcessingTaskStatus.queued,
        stage: null,
        message: '服务重启，任务重新排队',
      },
    });
    if (reset.count) this.logger.warn(`重启恢复：${reset.count} 个导入任务重新排队`);
    setTimeout(() => void this.drain(), 5000);
  }

  /** 建批次：每个文件一条流水线任务 */
  async createBatch(files: Express.Multer.File[], options: ImportOptions, adminId: number) {
    if (!files?.length) throw new BadRequestException('请至少上传 1 个模板文件');
    // 先确认网盘可用：没有默认账号时立即失败，避免用户传完几十个文件后才在流水线里全军覆没
    await this.storage.resolveProvider(options.provider);
    // 保证推荐分类树存在：AI 分类、提审校验都依赖它（幂等，已有则不动）
    const seeded = await this.taxonomy.ensureSeedCategories();
    if (seeded.created) {
      this.logger.log(`已补齐推荐分类树：新建 ${seeded.created} 个分类（${seeded.dimensions.join('/')}）`);
    }
    const batch = await this.prisma.uploadBatch.create({
      data: {
        operatorId: adminId,
        source: 'local',
        status: 'processing',
        remark: `批量导入 ${files.length} 个文件`,
      },
    });

    const taskIds: number[] = [];
    for (const [index, file] of files.entries()) {
      const payload: ImportPayload = {
        tempPath: file.path,
        originalName: file.originalname,
        size: file.size,
        adminId,
        options,
      };
      const task = await this.prisma.processingTask.create({
        data: {
          type: 'import_pipeline',
          status: ProcessingTaskStatus.queued,
          batchId: batch.id,
          maxAttempts: 3,
          idempotentKey: `import-${batch.id}-${index}-${Date.now()}`,
          stage: 'queued',
          progress: 0,
          message: '排队等待处理',
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      taskIds.push(task.id);
    }

    void this.drain();
    return { batchId: batch.id, taskIds, total: taskIds.length };
  }

  async listBatches(page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      this.prisma.uploadBatch.findMany({
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          tasks: {
            select: { status: true, stage: true, progress: true, message: true },
          },
        },
      }),
      this.prisma.uploadBatch.count(),
    ]);
    return {
      items: items.map((batch) => {
        const counts = { total: batch.tasks.length, succeeded: 0, failed: 0, running: 0 };
        for (const task of batch.tasks) {
          if (task.status === 'succeeded') counts.succeeded += 1;
          else if (task.status === 'failed') counts.failed += 1;
          else counts.running += 1;
        }
        const view: Record<string, unknown> = { ...batch, counts };
        delete view.tasks;
        return view;
      }),
      total,
      page,
      pageSize,
    };
  }

  /** 批次详情：任务阶段进度 + 已生成的结果（标题/封面/链接） */
  async batchDetail(batchId: number) {
    const batch = await this.prisma.uploadBatch.findUnique({
      where: { id: batchId },
      include: { tasks: { orderBy: { id: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('批次不存在');
    return {
      ...batch,
      tasks: batch.tasks.map((task) => this.toTaskView(task)),
    };
  }

  /** 单条任务状态（前端轻量轮询用） */
  async taskDetail(taskId: number) {
    const task = await this.prisma.processingTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    return this.toTaskView(task);
  }

  /** 失败任务重试：保留已完成阶段结果，从断点继续 */
  async retry(taskId: number) {
    const task = await this.prisma.processingTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.type !== 'import_pipeline') throw new BadRequestException('该任务不支持重试');
    if (!['failed', 'succeeded'].includes(task.status)) {
      throw new BadRequestException('仅失败或已完成的任务可重试');
    }
    const payload = (task.payload ?? {}) as unknown as ImportPayload;
    try {
      await fs.access(payload.tempPath);
    } catch {
      throw new BadRequestException('原始文件已清理（服务可能重启过），请重新上传该文件');
    }
    const updated = await this.prisma.processingTask.update({
      where: { id: taskId },
      data: {
        status: ProcessingTaskStatus.queued,
        error: null,
        stage: 'queued',
        progress: 0,
        message: '已重新排队',
        finishedAt: null,
        maxAttempts: task.attempts + 3,
      },
    });
    void this.drain();
    return this.toTaskView(updated);
  }

  private toTaskView(task: {
    id: number;
    status: string;
    stage: string | null;
    progress: number;
    message: string | null;
    error: string | null;
    templateId: number | null;
    payload: Prisma.JsonValue | null;
    createdAt: Date;
    finishedAt: Date | null;
  }) {
    const payload = (task.payload ?? {}) as unknown as ImportPayload;
    return {
      id: task.id,
      status: task.status,
      stage: task.stage,
      progress: task.progress,
      message: task.message,
      error: task.error,
      templateId: task.templateId,
      fileName: payload.originalName,
      size: payload.size ?? null,
      cover: payload.render?.cover ?? null,
      previews: payload.render?.previews ?? [],
      pages: payload.render?.pages ?? 0,
      shareUrl: payload.share?.url ?? null,
      provider: payload.share?.provider ?? null,
      aiApplied: !!payload.aiApplied,
      submitted: !!payload.submitted,
      createdAt: task.createdAt,
      finishedAt: task.finishedAt,
    };
  }

  /** 串行执行队列：一次只处理一条，避免 LibreOffice 与上传并发压垮小内存机器 */
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    let processed = 0;
    try {
      for (;;) {
        const task = await this.prisma.processingTask.findFirst({
          where: {
            type: 'import_pipeline',
            status: {
              in: [ProcessingTaskStatus.queued, ProcessingTaskStatus.retry_waiting],
            },
            OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
          },
          orderBy: { id: 'asc' },
        });
        if (!task) break;
        // 原子认领，避免多进程重复执行
        const claimed = await this.prisma.processingTask.updateMany({
          where: {
            id: task.id,
            status: {
              in: [ProcessingTaskStatus.queued, ProcessingTaskStatus.retry_waiting],
            },
          },
          data: { status: ProcessingTaskStatus.running, attempts: { increment: 1 } },
        });
        if (claimed.count === 0) continue;
        await this.runTask(task.id);
        processed += 1;
      }
    } finally {
      this.draining = false;
      if (processed) this.logger.log(`批量导入队列本轮处理 ${processed} 条任务`);
    }
  }

  private async stage(
    taskId: number,
    payload: ImportPayload,
    update: StageUpdate,
  ): Promise<void> {
    await this.prisma.processingTask.update({
      where: { id: taskId },
      data: {
        stage: update.stage,
        progress: update.progress,
        message: update.message,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async runTask(taskId: number) {
    const task = await this.prisma.processingTask.findUniqueOrThrow({ where: { id: taskId } });
    const payload = (task.payload ?? {}) as unknown as ImportPayload;
    const options: ImportOptions = {
      provider: payload.options?.provider,
      useAi: payload.options?.useAi ?? true,
      autoSubmit: payload.options?.autoSubmit ?? false,
      maxPages: payload.options?.maxPages ?? 6,
    };
    payload.options = options;
    payload.notes = payload.notes ?? [];

    try {
      // ① 渲染首图与预览图（失败不阻断：无预览图的草稿仍可人工补图）
      if (!payload.render) {
        await this.stage(taskId, payload, {
          stage: 'render',
          progress: 10,
          message: '正在解析文档并生成首图/预览图',
        });
        try {
          const rendered = await this.render.renderPreviews(
            payload.tempPath,
            payload.originalName,
            { maxPages: options.maxPages },
          );
          if (rendered) payload.render = rendered;
          else payload.notes.push('该文件格式不支持自动生成预览图，请手动上传封面');
        } catch (error) {
          payload.notes.push(`预览图生成失败：${errMsg(error)}`);
          this.logger.warn(`预览图生成失败 ${payload.originalName}：${errMsg(error)}`);
        }
      }

      // ② 建草稿（AI 需要模板已存在）
      if (!payload.templateId) {
        await this.stage(taskId, payload, {
          stage: 'create',
          progress: 30,
          message: '正在创建模板草稿',
        });
        const template = await this.prisma.template.create({
          data: {
            title: titleFromFileName(payload.originalName),
            format: inferFormat(payload.originalName),
            status: 'draft',
            cover: payload.render?.cover ?? null,
            meta: {
              previews: payload.render?.previews ?? [],
              importSource: 'batch_import',
            } as Prisma.InputJsonValue,
          },
        });
        payload.templateId = template.id;
        await this.prisma.processingTask.update({
          where: { id: taskId },
          data: { templateId: template.id },
        });
      }

      // ③ 上传网盘 + 生成永久分享链接（失败即整条失败：没有链接的模板无法交付）
      if (!payload.share) {
        await this.stage(taskId, payload, {
          stage: 'upload',
          progress: 45,
          message: '正在上传原文件到网盘并生成分享链接',
        });
        const provider = await this.storage.resolveProvider(options.provider);
        await this.stage(taskId, payload, {
          stage: 'upload',
          progress: 55,
          message: `正在上传到${provider === 'baidu' ? '百度' : '夸克'}网盘并生成分享链接`,
        });
        const share = await this.storage.uploadTemplateFile(payload.tempPath, provider, {
          format: inferFormat(payload.originalName),
          originalName: payload.originalName,
        });
        payload.share = {
          provider: share.provider,
          url: share.url,
          passcode: share.passcode,
          remoteFileId: share.remoteFileId,
          remotePath: share.remotePath,
          remoteName: share.remoteName,
        };
        await this.upsertTemplateFile(payload);
      }

      // ④ AI 自动补全（失败不阻断：仍会兜底挂一个分类，保证能提审）
      if (options.useAi && !payload.aiApplied && payload.render?.cover) {
        await this.stage(taskId, payload, {
          stage: 'ai',
          progress: 75,
          message: 'AI 正在识别标题/分类/标签与建议定价',
        });
        try {
          const result = await this.ai.enrichTemplate(payload.templateId, true);
          payload.aiApplied = true;
          const created = (result.suggestion.createdCategories as string[] | undefined) ?? [];
          if (created.length) {
            payload.notes.push(`AI 自动新建分类 ${created.length} 个：${created.join('、')}`);
          }
        } catch (error) {
          payload.notes.push(`AI 补全失败：${errMsg(error)}`);
          this.logger.warn(`AI 补全失败 template=${payload.templateId}：${errMsg(error)}`);
          await this.ensureFallbackCategory(payload);
        }
      } else if (options.useAi && !payload.render?.cover) {
        payload.notes.push('缺少封面图，跳过 AI 补全，已按格式兜底分类');
        await this.ensureFallbackCategory(payload);
      }

      // ⑤ 自动提审
      if (options.autoSubmit && !payload.submitted) {
        await this.stage(taskId, payload, {
          stage: 'submit',
          progress: 92,
          message: '正在提交审核',
        });
        try {
          await this.templates.submit(payload.templateId, payload.adminId);
          payload.submitted = true;
        } catch (error) {
          payload.notes.push(`自动提审未通过：${errMsg(error)}`);
        }
      }

      await this.prisma.processingTask.update({
        where: { id: taskId },
        data: {
          status: ProcessingTaskStatus.succeeded,
          stage: 'done',
          progress: 100,
          message: payload.submitted
            ? '已完成并提交审核'
            : payload.notes.length
              ? `已完成（${payload.notes.length} 条提示）`
              : '已完成',
          payload: payload as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      await this.cleanupTemp(payload.tempPath);
    } catch (error) {
      const message = errMsg(error);
      this.logger.error(`导入任务 ${taskId} 失败：${message}`);
      await this.prisma.processingTask.update({
        where: { id: taskId },
        data: {
          status: ProcessingTaskStatus.failed,
          error: message.slice(0, 1000),
          message: `失败：${message.slice(0, 200)}`,
          payload: payload as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
    } finally {
      await this.refreshBatchStatus(task.batchId);
    }
  }

  /** 网盘文件行：分享链接（自带提取码）入库，供详情页换取 */
  /**
   * AI 不可用时的分类兜底：按文件格式挂到对应一级分类。
   * 目的：不让「至少 1 个分类」的提审校验把整条流水线卡在最后一步。
   */
  private async ensureFallbackCategory(payload: ImportPayload) {
    const templateId = payload.templateId;
    if (!templateId) return;
    try {
      const template = await this.prisma.template.findUnique({
        where: { id: templateId },
        select: { format: true, _count: { select: { categories: true } } },
      });
      if (!template || template._count.categories > 0) return;
      const categoryId = await this.taxonomy.fallbackCategoryId(template.format);
      if (!categoryId) return;
      await this.prisma.templateCategory.createMany({
        data: [{ templateId, categoryId }],
        skipDuplicates: true,
      });
      payload.notes = payload.notes ?? [];
      payload.notes.push('已按文件格式兜底挂分类，建议人工复核');
    } catch (error) {
      this.logger.warn(`兜底分类失败 template=${templateId}：${errMsg(error)}`);
    }
  }

  private async upsertTemplateFile(payload: ImportPayload) {
    const share = payload.share!;
    const shareUrl = withPasscode(share.url, share.passcode);
    const existing = await this.prisma.templateFile.findFirst({
      where: { templateId: payload.templateId!, shareUrl },
      select: { id: true },
    });
    if (existing) return;
    await this.prisma.templateFile.create({
      data: {
        templateId: payload.templateId!,
        filename: payload.originalName,
        format: inferFormat(payload.originalName),
        size: BigInt(payload.size ?? 0),
        netdiskType: share.provider === 'baidu' ? 'baidu' : 'quark',
        netdiskFileId: share.remoteFileId ?? null,
        // 网盘内真实路径（含格式/年月目录与唯一文件名），供回源与清理使用
        remotePath: share.remotePath ?? null,
        previewUrl: payload.render?.cover ?? null,
        shareUrl,
        checkStatus: 'ok',
        checkMessage: '导入时自动生成分享链接',
        checkAt: new Date(),
      },
    });
  }

  private async cleanupTemp(tempPath: string) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }

  /** 批次内任务全部结束则标记批次完成 */
  private async refreshBatchStatus(batchId: number | null) {
    if (!batchId) return;
    const pending = await this.prisma.processingTask.count({
      where: {
        batchId,
        status: {
          in: [
            ProcessingTaskStatus.queued,
            ProcessingTaskStatus.running,
            ProcessingTaskStatus.retry_waiting,
          ],
        },
      },
    });
    await this.prisma.uploadBatch.update({
      where: { id: batchId },
      data: { status: pending ? 'processing' : 'finished' },
    });
  }
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 文件名 → 标题：去扩展名，压缩空白 */
function titleFromFileName(name: string): string {
  const base = basename(name).replace(/\.[a-z0-9]+$/i, '').trim();
  return (base || '未命名模板').replace(/\s+/g, ' ').slice(0, 128);
}

function withPasscode(url: string, passcode?: string): string {
  if (!passcode || url.includes('pwd=')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}pwd=${encodeURIComponent(passcode)}`;
}
