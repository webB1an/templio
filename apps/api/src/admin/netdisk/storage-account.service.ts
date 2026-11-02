import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { PrismaService } from "../../prisma/prisma.service";
import { extractUrl, lastResult, shortOutput } from "./cli";
import { CliResult, runCli } from "./cli";

export type NetdiskProvider = "baidu" | "quark";

export interface ManagedStorageAccount {
  id: string;
  provider: NetdiskProvider;
  label: string;
  profileDir: string;
  configPath: string | null;
}

const PUBLIC_SELECT = {
  id: true,
  provider: true,
  label: true,
  accountName: true,
  isDefault: true,
  isActive: true,
  lastProbeOk: true,
  lastProbeMessage: true,
  lastProbeAt: true,
  createdAt: true,
} as const;

@Injectable()
export class StorageAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async listAccounts() {
    return this.prisma.storageAccount.findMany({
      where: { isActive: true },
      orderBy: [{ provider: "asc" }, { isDefault: "desc" }, { createdAt: "desc" }],
      select: PUBLIC_SELECT,
    });
  }

  async createAccount(input: { provider: unknown; label: unknown; isDefault?: unknown }) {
    const provider = String(input.provider || "");
    if (provider !== "baidu" && provider !== "quark") {
      throw new BadRequestException("网盘类型只支持 baidu / quark");
    }
    const label = String(input.label || "").trim();
    if (!label) throw new BadRequestException("账号名称不能为空");

    const id = `sa_${randomBytes(6).toString("hex")}`;
    const profileDir = resolve(this.root(), provider, id);
    mkdirSync(profileDir, { recursive: true });
    const configPath = provider === "baidu" ? join(profileDir, "cookies.txt") : null;

    const count = await this.prisma.storageAccount.count({ where: { provider, isActive: true } });
    const shouldBeDefault = Boolean(input.isDefault) || count === 0;
    if (shouldBeDefault) {
      await this.prisma.storageAccount.updateMany({ where: { provider }, data: { isDefault: false } });
    }
    return this.prisma.storageAccount.create({
      data: { id, provider, label, profileDir, configPath, isDefault: shouldBeDefault },
      select: PUBLIC_SELECT,
    });
  }

  async setDefaultAccount(id: string) {
    const account = await this.requireAccount(id);
    await this.prisma.storageAccount.updateMany({
      where: { provider: account.provider },
      data: { isDefault: false },
    });
    return this.prisma.storageAccount.update({
      where: { id },
      data: { isDefault: true, isActive: true },
      select: PUBLIC_SELECT,
    });
  }

  async updateLabel(id: string, labelRaw: unknown) {
    const label = String(labelRaw || "").trim();
    if (!label) throw new BadRequestException("账号名称不能为空");
    await this.requireAccount(id);
    return this.prisma.storageAccount.update({
      where: { id },
      data: { label: label.slice(0, 64) },
      select: PUBLIC_SELECT,
    });
  }

  async deleteAccount(id: string) {
    const account = await this.requireAccount(id);
    const linkCount = await this.prisma.netdiskLink.count({ where: { storageAccountId: id } });
    if (linkCount > 0) {
      await this.prisma.storageAccount.update({
        where: { id },
        data: { isActive: false, isDefault: false },
      });
    } else {
      await this.prisma.storageAccount.delete({ where: { id } });
    }
    await this.removeProfile(account.profileDir);

    if (account.isDefault) {
      const next = await this.prisma.storageAccount.findFirst({
        where: { provider: account.provider, isActive: true, id: { not: id } },
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await this.prisma.storageAccount.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
    return { deleted: true };
  }

  async getDefaultAccount(provider: NetdiskProvider): Promise<ManagedStorageAccount | null> {
    const account = await this.prisma.storageAccount.findFirst({
      where: { provider, isDefault: true, isActive: true },
    });
    if (account) return this.toManaged(account);
    const fallback = await this.prisma.storageAccount.findFirst({
      where: { provider, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    return fallback ? this.toManaged(fallback) : null;
  }

  async getAccountForProvider(provider: NetdiskProvider, id?: string): Promise<ManagedStorageAccount | null> {
    if (!id) return this.getDefaultAccount(provider);
    const account = await this.prisma.storageAccount.findFirst({ where: { id, provider, isActive: true } });
    if (!account) throw new BadRequestException(`${this.providerText(provider)}网盘账号不存在或类型不匹配`);
    return this.toManaged(account);
  }

  async saveBaiduCookie(id: string, cookieRaw: unknown) {
    const account = await this.requireAccount(id, "baidu");
    const cookie = String(cookieRaw || "")
      .trim()
      .replace(/^Cookie:\s*/i, "");
    if (!cookie || !/BAIDUID=/i.test(cookie)) {
      throw new BadRequestException("Cookie 无效：需包含 BAIDUID（从浏览器 pan.baidu.com 请求头复制）");
    }
    if (!/BDUSS=/i.test(cookie) || !/STOKEN=/i.test(cookie)) {
      throw new BadRequestException("Cookie 缺少 BDUSS/STOKEN，请复制完整 Cookie（含 BAIDUID、BDUSS、STOKEN）");
    }
    mkdirSync(account.profileDir, { recursive: true });
    if (!account.configPath) throw new BadRequestException("账号配置异常：缺少 cookies 路径");
    writeFileSync(account.configPath, `${cookie}\n`, { mode: 0o600 });
    return this.probeAccount(id);
  }

  /** 统一授权入口：百度返回登录页链接 + Cookie 输入；夸克返回 OAuth 链接 + 授权码输入 */
  async startAuth(id: string) {
    const account = await this.requireAccount(id);
    if (account.provider === "baidu") {
      return {
        authUrl: "https://pan.baidu.com/",
        message:
          "打开百度网盘登录页，登录后按 F12 → Network → 任意请求 → 复制完整 Cookie（含 BAIDUID、BDUSS、STOKEN），再粘贴到下方。",
      };
    }
    return this.startQuarkAuth(id);
  }

  async finishAuth(id: string, codeRaw: unknown) {
    const account = await this.requireAccount(id);
    return account.provider === "baidu"
      ? this.saveBaiduCookie(id, codeRaw)
      : this.finishQuarkAuth(id, codeRaw);
  }

  async probeAccount(id: string) {
    const account = await this.requireAccount(id);
    const result = account.provider === "baidu" ? await this.probeBaidu(account) : await this.probeQuark(account);
    return this.prisma.storageAccount.update({
      where: { id },
      data: {
        accountName: result.accountName ?? null,
        lastProbeOk: result.ok,
        lastProbeMessage: shortOutput(result.message),
        lastProbeAt: new Date(),
      },
      select: PUBLIC_SELECT,
    });
  }

  async startQuarkAuth(id: string) {
    const account = await this.requireAccount(id, "quark");
    mkdirSync(join(account.profileDir, ".config"), { recursive: true });
    const result = await this.runQuark(account, ["login"], 15_000);
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (result.ok) return this.probeAccount(id);
    const authUrl = extractUrl(output);
    if (!authUrl) throw new BadRequestException(shortOutput(output || "夸克授权链接生成失败"));
    return {
      authUrl,
      message: "打开授权链接完成登录，然后把页面显示的授权码粘贴回来。",
    };
  }

  async finishQuarkAuth(id: string, codeRaw: unknown) {
    const account = await this.requireAccount(id, "quark");
    const code = String(codeRaw || "").trim();
    if (!code) throw new BadRequestException("授权码不能为空");
    const result = await this.runQuark(account, ["login", "--token", code], 60_000);
    if (!result.ok) {
      throw new BadRequestException(shortOutput(result.stderr || result.stdout || "夸克授权失败"));
    }
    return this.probeAccount(id);
  }

  bdpan(): string {
    return (process.env.BDPAN_PATH || "bdpan").trim() || "bdpan";
  }

  baiduArgs(account?: ManagedStorageAccount | null): string[] {
    return account?.configPath ? ["--cookie-file", account.configPath] : [];
  }

  quarkAccountEnv(account: ManagedStorageAccount): NodeJS.ProcessEnv {
    return {
      CODEX_ENV: "1",
      AI_AGENT: "codex",
      HOME: account.profileDir,
      USERPROFILE: account.profileDir,
      XDG_CONFIG_HOME: join(account.profileDir, ".config"),
    };
  }

  requireQuarkSkillDir(): string {
    const skillDir = (process.env.QUARK_SKILL_DIR || "").trim();
    if (!skillDir || !existsSync(join(skillDir, "scripts", "quark-drive.cjs"))) {
      throw new BadRequestException(
        "未配置夸克 Skill：请在服务器设置 QUARK_SKILL_DIR（需包含 scripts/quark-drive.cjs）",
      );
    }
    return skillDir;
  }

  runQuark(account: ManagedStorageAccount, args: string[], timeoutMs: number): Promise<CliResult> {
    const skillDir = this.requireQuarkSkillDir();
    const cliPath = join(skillDir, "scripts", "quark-drive.cjs");
    return runCli(process.execPath, [cliPath, ...args, "--session-id", `templio-${account.id.slice(-6)}`], {
      cwd: skillDir,
      timeoutMs,
      env: this.quarkAccountEnv(account),
    });
  }

  private async probeBaidu(account: ManagedStorageAccount): Promise<{ ok: boolean; message: string; accountName?: string }> {
    if (!account.configPath || !existsSync(account.configPath)) {
      return { ok: false, message: "尚未配置 Cookie，请粘贴百度网盘 Cookie" };
    }
    // bdpan 无 whoami：用一次不存在的分享路径探测登录态；区分“文件不存在”和“未登录”
    const result = await runCli(
      this.bdpan(),
      [...this.baiduArgs(account), "share", "/apps/bdpan/__templio_probe__", "--period-days", "0"],
      { timeoutMs: 60_000 },
    );
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (/BaiduPanAuthError|missing STOKEN|BDUSS|login cookies required|cookie.*(无效|失效)/i.test(output)) {
      return {
        ok: false,
        message: "Cookie 缺少 STOKEN/BDUSS 或已失效，请从浏览器重新复制完整 Cookie",
      };
    }
    if (/未登录|登录失效|SESTDATA|errno.?=-6|401|403/i.test(output)) {
      return { ok: false, message: output.slice(0, 300) || "百度 Cookie 已失效" };
    }
    if (/不存在|not.?found|errno.?=-9|no such file/i.test(output)) {
      return { ok: true, message: "Cookie 可用（探测路径不存在属正常）" };
    }
    return { ok: result.ok, message: output.slice(0, 300) || (result.ok ? "bdpan 可用" : "百度网盘探测失败") };
  }

  private async probeQuark(account: ManagedStorageAccount): Promise<{ ok: boolean; message: string; accountName?: string }> {
    try {
      const result = await this.runQuark(account, ["get-user-info"], 60_000);
      const final = lastResult(result.stdout);
      const data = (final?.data || {}) as { userInfo?: { nickname?: string }; nickname?: string };
      return {
        ok: result.ok && Number(final?.code ?? -1) === 0,
        message: String(final?.msg || result.stderr || "夸克 CLI 可用"),
        accountName: data.userInfo?.nickname || data.nickname,
      };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  private async requireAccount(id: string, provider?: NetdiskProvider) {
    const account = await this.prisma.storageAccount.findUnique({ where: { id } });
    if (!account || !account.isActive) throw new NotFoundException("网盘账号不存在");
    if (provider && account.provider !== provider) throw new BadRequestException("网盘账号类型不匹配");
    return {
      id: account.id,
      provider: account.provider as NetdiskProvider,
      label: account.label,
      profileDir: account.profileDir,
      configPath: account.configPath,
      isDefault: account.isDefault,
    };
  }

  private toManaged(account: {
    id: string;
    provider: string;
    label: string;
    profileDir: string;
    configPath: string | null;
  }): ManagedStorageAccount {
    return {
      id: account.id,
      provider: account.provider as NetdiskProvider,
      label: account.label,
      profileDir: account.profileDir,
      configPath: account.configPath,
    };
  }

  private providerText(provider: NetdiskProvider): string {
    return provider === "baidu" ? "百度" : "夸克";
  }

  private root(): string {
    if (process.env.STORAGE_ACCOUNT_ROOT?.trim()) return resolve(process.env.STORAGE_ACCOUNT_ROOT.trim());
    const storageRoot = process.env.STORAGE_ROOT || join(process.cwd(), "storage");
    return resolve(storageRoot, "private", "storage-accounts");
  }

  private async removeProfile(profileDir: string) {
    const root = this.root();
    const target = resolve(profileDir);
    if (target !== root && target.startsWith(`${root}${sep}`)) {
      await rm(target, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
