import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { exec } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { PrismaService } from "../prisma/prisma.service";
import { AdminTemplatesService } from "./admin-templates.service";

const execAsync = promisify(exec);

@Injectable()
export class AdminNetdiskSyncService {
  private readonly logger = new Logger(AdminNetdiskSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: AdminTemplatesService,
  ) {}

  async start(
    templateId: string,
    providerRaw: unknown,
  ): Promise<{ taskId: string; status: string; message?: string }> {
    const provider = String(providerRaw || "").trim();
    if (provider !== "baidu" && provider !== "quark") {
      throw new BadRequestException("网盘类型只支持 baidu / quark");
    }

    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      select: { id: true, title: true },
    });
    if (!template) throw new NotFoundException("模板不存在");

    const source = await this.prisma.templateFile.findFirst({
      where: { templateId, role: "source" },
    });
    if (!source) {
      throw new BadRequestException("该模板没有服务器源文件，请用 templio upload --with-source 重新上传");
    }

    const commandTemplate = (process.env.NETDISK_SYNC_COMMAND || "").trim();
    if (!commandTemplate) {
      const task = await this.prisma.task.create({
        data: {
          templateId,
          type: "netdisk_sync",
          status: "failed",
          progress: 0,
          message: "服务端未配置 NETDISK_SYNC_COMMAND",
          error: "未配置网盘同步命令，请手动下载源文件上传网盘，或配置 NETDISK_SYNC_COMMAND",
          payload: { provider, sourceObjectKey: source.objectKey },
        },
      });
      return { taskId: task.id, status: task.status, message: task.error || undefined };
    }

    const task = await this.prisma.task.create({
      data: {
        templateId,
        type: "netdisk_sync",
        status: "queued",
        progress: 0,
        message: "等待执行",
        payload: { provider, sourceObjectKey: source.objectKey },
      },
    });

    void this.run(task.id, templateId, provider, source.objectKey, commandTemplate).catch((error) => {
      this.logger.error(`网盘同步任务 ${task.id} 异常：${(error as Error).message}`);
    });

    return { taskId: task.id, status: task.status };
  }

  async getTask(taskId: string): Promise<{
    id: string;
    type: string;
    status: string;
    progress: number;
    message: string | null;
    error: string | null;
    result: unknown;
    createdAt: string;
    updatedAt: string;
  }> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("任务不存在");
    return {
      id: task.id,
      type: task.type,
      status: task.status,
      progress: task.progress,
      message: task.message,
      error: task.error,
      result: task.result,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private async run(
    taskId: string,
    templateId: string,
    provider: "baidu" | "quark",
    sourceObjectKey: string,
    commandTemplate: string,
  ): Promise<void> {
    const update = async (data: {
      status?: "running" | "success" | "failed";
      progress?: number;
      message?: string;
      error?: string | null;
      result?: unknown;
    }) => {
      await this.prisma.task.update({
        where: { id: taskId },
        data: data as never,
      });
    };

    try {
      await update({ status: "running", progress: 10, message: "准备同步源文件" });

      const storageRoot = process.env.STORAGE_ROOT || join(process.cwd(), "storage");
      const absolutePath = join(storageRoot, "private", sourceObjectKey);
      const command = commandTemplate
        .replace(/\{file\}/g, shellQuote(absolutePath))
        .replace(/\{provider\}/g, provider);

      this.logger.log(`执行网盘同步：${command.slice(0, 160)}`);
      const { stdout, stderr } = await execAsync(command, {
        timeout: 15 * 60 * 1000,
        maxBuffer: 10 * 1024 * 1024,
      });

      await update({ progress: 80, message: "已上传，解析网盘返回" });
      const parsed = parseSyncOutput(stdout);
      const saved = (await this.templates.saveNetdisk(templateId, {
        provider,
        url: parsed.url,
        passcode: parsed.passcode,
      })) as { shortLink?: string | null };

      await update({
        status: "success",
        progress: 100,
        message: "网盘同步完成",
        error: null,
        result: {
          url: parsed.url,
          passcode: parsed.passcode || null,
          shortLink: saved.shortLink || null,
          provider,
          stderr: stderr.slice(0, 500) || null,
        },
      });

      if (process.env.DELETE_SOURCE_AFTER_SYNC !== "false") {
        await this.templates.removeSourceFile(templateId);
      }
    } catch (error) {
      const message = (error as Error).message || "网盘同步失败";
      await update({
        status: "failed",
        progress: 100,
        message: "网盘同步失败",
        error: message.slice(0, 1000),
      });
    }
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseSyncOutput(stdout: string): { url: string; passcode?: string } {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(line.slice(start, end + 1)) as {
        url?: unknown;
        passcode?: unknown;
      };
      const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
      if (!/^https?:\/\//i.test(url)) continue;
      return {
        url,
        passcode: typeof parsed.passcode === "string" ? parsed.passcode.trim() : undefined,
      };
    } catch {
      // 继续尝试上一行
    }
  }
  throw new Error("网盘同步命令未输出有效 JSON（需要 {url, passcode}）");
}
