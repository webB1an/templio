import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { exec } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { PrismaService } from "../prisma/prisma.service";
import { AdminTemplatesService } from "./admin-templates.service";
import { NetdiskProvider, StorageAccountService } from "./netdisk/storage-account.service";
import { StorageCoordinatorService } from "./netdisk/storage-drives.service";

const execAsync = promisify(exec);

type SyncMode = "account" | "command";

@Injectable()
export class AdminNetdiskSyncService {
  private readonly logger = new Logger(AdminNetdiskSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: AdminTemplatesService,
    private readonly accounts: StorageAccountService,
    private readonly storage: StorageCoordinatorService,
  ) {}

  async start(
    templateId: string,
    providerRaw: unknown,
  ): Promise<{ taskId: string; status: string; message?: string }> {
    const rawProvider = String(providerRaw || "").trim();
    if (rawProvider && rawProvider !== "baidu" && rawProvider !== "quark") {
      throw new BadRequestException("网盘类型只支持 baidu / quark");
    }
    const requested = (rawProvider || undefined) as NetdiskProvider | undefined;

    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      select: { id: true, title: true, originalName: true, format: true },
    });
    if (!template) throw new NotFoundException("模板不存在");

    const source = await this.prisma.templateFile.findFirst({
      where: { templateId, role: "source" },
    });
    if (!source) {
      throw new BadRequestException("该模板没有服务器源文件，请用 templio upload --with-source 重新上传");
    }

    const commandTemplate = (process.env.NETDISK_SYNC_COMMAND || "").trim();
    const provider = await this.pickProvider(requested);
    const mode: SyncMode = provider ? "account" : "command";

    if (!provider && !commandTemplate) {
      const task = await this.prisma.task.create({
        data: {
          templateId,
          type: "netdisk_sync",
          status: "failed",
          progress: 0,
          message: "未配置网盘账号",
          error:
            "未配置默认网盘账号，请先在「网盘账号」新增账号、完成授权并设为默认（或配置 NETDISK_SYNC_COMMAND）",
          payload: { provider: requested || null, sourceObjectKey: source.objectKey },
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
        message: mode === "account" ? "等待网盘账号同步" : "等待执行同步命令",
        payload: {
          provider: provider || requested || null,
          sourceObjectKey: source.objectKey,
          mode,
          title: template.title || template.originalName,
          format: template.format,
        },
      },
    });

    void this.run(
      task.id,
      templateId,
      provider || requested,
      source.objectKey,
      mode,
      commandTemplate,
      template,
    ).catch((error) => {
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

  /** 显式 provider 优先；否则按默认账号（夸克优先）判断能否走账号同步 */
  private async pickProvider(requested?: NetdiskProvider): Promise<NetdiskProvider | undefined> {
    if (requested) {
      const account = await this.accounts.getAccountForProvider(requested);
      return account ? requested : undefined;
    }
    try {
      return await this.storage.resolveProvider();
    } catch {
      return undefined;
    }
  }

  private async run(
    taskId: string,
    templateId: string,
    provider: NetdiskProvider | undefined,
    sourceObjectKey: string,
    mode: SyncMode,
    commandTemplate: string,
    template: { title: string | null; originalName: string | null; format: string | null },
  ): Promise<void> {
    const update = async (data: {
      status?: "running" | "success" | "failed";
      progress?: number;
      message?: string;
      error?: string | null;
      result?: unknown;
    }) => {
      await this.prisma.task.update({ where: { id: taskId }, data: data as never });
    };

    try {
      await update({ status: "running", progress: 10, message: "准备同步源文件" });
      const storageRoot = process.env.STORAGE_ROOT || join(process.cwd(), "storage");
      const absolutePath = join(storageRoot, "private", sourceObjectKey);

      if (mode === "account") {
        const format = (template.format || "pptx").toLowerCase();
        const dirName = format === "docx" ? "Word模板" : "PPT模板";
        const month = new Date().toISOString().slice(0, 7);
        await update({ progress: 30, message: "上传到网盘" });
        const uploaded = await this.storage.uploadAndShare(absolutePath, provider, {
          title: template.title || template.originalName || undefined,
          remoteDir: `${dirName}/${month}`,
          remoteDirSegments: [dirName, month],
        });
        await update({ progress: 80, message: "写入网盘链接与短链" });
        const saved = (await this.templates.saveNetdisk(templateId, {
          provider: uploaded.provider,
          url: uploaded.url,
          passcode: uploaded.passcode,
          accountId: uploaded.accountId,
        })) as { shortLink?: string | null };

        await update({
          status: "success",
          progress: 100,
          message: "网盘同步完成",
          error: null,
          result: {
            provider: uploaded.provider,
            accountId: uploaded.accountId,
            url: uploaded.url,
            passcode: uploaded.passcode || null,
            shortLink: saved.shortLink || null,
            remotePath: uploaded.remotePath || null,
          },
        });
      } else {
        await update({ progress: 20, message: "执行同步命令" });
        const command = commandTemplate
          .replace(/\{file\}/g, shellQuote(absolutePath))
          .replace(/\{provider\}/g, provider || "");
        this.logger.log(`执行网盘同步：${command.slice(0, 160)}`);
        const { stdout, stderr } = await execAsync(command, {
          timeout: 15 * 60 * 1000,
          maxBuffer: 10 * 1024 * 1024,
        });
        await update({ progress: 80, message: "解析网盘返回" });
        const parsed = parseSyncOutput(stdout);
        const saved = (await this.templates.saveNetdisk(templateId, {
          provider: provider || "baidu",
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
            provider: provider || null,
            stderr: stderr.slice(0, 500) || null,
          },
        });
      }

      if (process.env.DELETE_SOURCE_AFTER_SYNC !== "false") {
        await this.templates.removeSourceFile(templateId);
      }
    } catch (error) {
      const rawMessage = (error as Error).message || "网盘同步失败";
      const message = friendlySyncMessage(rawMessage);
      await update({
        status: "failed",
        progress: 100,
        message: "网盘同步失败",
        error: message.slice(0, 1000),
      });
    }
  }
}

function friendlySyncMessage(message: string): string {
  if (/BaiduPanAuthError|missing STOKEN|BDUSS|login cookies required/i.test(message)) {
    return "百度 Cookie 缺少 STOKEN/BDUSS 或已失效，请到「网盘账号」重新粘贴完整 Cookie";
  }
  if (/QUARK_SKILL_DIR|未配置夸克 Skill/i.test(message)) {
    return "未配置夸克 Skill，请在服务器设置 QUARK_SKILL_DIR 后重试";
  }
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) || message).slice(0, 800);
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
