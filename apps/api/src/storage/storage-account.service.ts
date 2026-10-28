import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NetdiskType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { extractUrl, runCli, shortOutput } from './cli';
import { PrismaService } from '../prisma/prisma.service';

export type ManagedStorageAccount = {
  id: string;
  provider: NetdiskType;
  label: string;
  profileDir: string;
  configPath: string | null;
};

export const STORAGE_ACCOUNT_SELECT = {
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

/**
 * 网盘账号管理（参照 wallpaper-manager 多账号方案）：
 * - 夸克：quarkclouddrive skill CLI，授权态隔离在账号独立 HOME 沙箱
 * - 百度：bdpan CLI（pip 安装），授权态 = 每账号一份 cookies.txt（用户粘贴 Cookie）
 */
@Injectable()
export class StorageAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listAccounts() {
    return this.prisma.storageAccount.findMany({
      where: { isActive: true },
      orderBy: [{ provider: 'asc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
      select: STORAGE_ACCOUNT_SELECT,
    });
  }

  async createAccount(input: { provider: NetdiskType; label: string; isDefault?: boolean }) {
    const label = input.label?.trim();
    if (!label) throw new BadRequestException('账号名称不能为空');
    const id = `sa_${randomBytes(6).toString('hex')}`;
    const profileDir = resolve(this.root(), input.provider, id);
    mkdirSync(profileDir, { recursive: true });
    const configPath =
      input.provider === NetdiskType.baidu ? join(profileDir, 'cookies.txt') : null;
    const count = await this.prisma.storageAccount.count({
      where: { provider: input.provider, isActive: true },
    });
    const shouldBeDefault = Boolean(input.isDefault) || count === 0;
    if (shouldBeDefault) {
      await this.prisma.storageAccount.updateMany({
        where: { provider: input.provider },
        data: { isDefault: false },
      });
    }
    return this.prisma.storageAccount.create({
      data: { id, provider: input.provider, label, profileDir, configPath, isDefault: shouldBeDefault },
      select: STORAGE_ACCOUNT_SELECT,
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
      select: STORAGE_ACCOUNT_SELECT,
    });
  }

  async updateLabel(id: string, label: string) {
    const trimmed = label?.trim();
    if (!trimmed) throw new BadRequestException('账号名称不能为空');
    await this.requireAccount(id);
    return this.prisma.storageAccount.update({
      where: { id },
      data: { label: trimmed },
      select: STORAGE_ACCOUNT_SELECT,
    });
  }

  async deleteAccount(id: string) {
    const account = await this.requireAccount(id);
    await this.prisma.storageAccount.delete({ where: { id } });
    this.removeProfile(account.profileDir);
    if (account.isDefault) {
      const next = await this.prisma.storageAccount.findFirst({
        where: { provider: account.provider, isActive: true, id: { not: id } },
        orderBy: { createdAt: 'desc' },
      });
      if (next) {
        await this.prisma.storageAccount.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
    return { deleted: true };
  }

  async getDefaultAccount(provider: NetdiskType) {
    const def = await this.prisma.storageAccount.findFirst({
      where: { provider, isDefault: true, isActive: true },
    });
    if (def) return def;
    return this.prisma.storageAccount.findFirst({
      where: { provider, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAccountForProvider(provider: NetdiskType, id?: string) {
    if (!id) return this.getDefaultAccount(provider);
    const account = await this.prisma.storageAccount.findFirst({
      where: { id, provider, isActive: true },
    });
    if (!account) {
      throw new BadRequestException(`${provider === 'baidu' ? '百度' : '夸克'}网盘账号不存在或类型不匹配`);
    }
    return account;
  }

  /** 百度：保存用户粘贴的 Cookie 到账号独立文件（凭证只落服务器文件） */
  async saveBaiduCookie(id: string, cookie: string) {
    const account = await this.requireAccount(id, NetdiskType.baidu);
    const cleaned = cookie.trim().replace(/^Cookie:\s*/i, '');
    if (!cleaned || !/BAIDUID=/i.test(cleaned)) {
      throw new BadRequestException('Cookie 无效：需包含 BAIDUID 字段（从浏览器 pan.baidu.com 请求头复制）');
    }
    mkdirSync(account.profileDir, { recursive: true });
    if (!account.configPath) throw new BadRequestException('账号配置异常：缺少 cookies 路径');
    writeFileSync(account.configPath, cleaned + '\n', { mode: 0o600 });
    return this.probeAccount(id);
  }

  async probeAccount(id: string) {
    const account = await this.requireAccount(id);
    const result =
      account.provider === NetdiskType.baidu
        ? await this.probeBaidu(account)
        : await this.probeQuark(account);
    return this.prisma.storageAccount.update({
      where: { id },
      data: {
        accountName: result.accountName ?? null,
        lastProbeOk: result.ok,
        lastProbeMessage: shortOutput(result.message),
        lastProbeAt: new Date(),
      },
      select: STORAGE_ACCOUNT_SELECT,
    });
  }

  /** 夸克授权：skill CLI `login` 输出授权链接；完成后再 `login --token <code>` */
  async startQuarkAuth(id: string) {
    const account = await this.requireAccount(id, NetdiskType.quark);
    mkdirSync(join(account.profileDir, '.config'), { recursive: true });
    const result = await this.runQuark(account, ['login'], 15_000);
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (result.ok) return this.probeAccount(id);
    const authUrl = extractUrl(output);
    if (!authUrl) throw new BadRequestException(shortOutput(output || '夸克授权链接生成失败'));
    return {
      authUrl,
      message: '打开授权链接，登录夸克后把页面显示的授权码粘贴回来完成授权。',
    };
  }

  async finishQuarkAuth(id: string, code: string) {
    const account = await this.requireAccount(id, NetdiskType.quark);
    const authCode = code.trim();
    if (!authCode) throw new BadRequestException('授权码不能为空');
    const result = await this.runQuark(account, ['login', '--token', authCode], 60_000);
    if (!result.ok) {
      throw new BadRequestException(shortOutput(result.stderr || result.stdout || '夸克授权失败'));
    }
    return this.probeAccount(id);
  }

  private runQuark(account: ManagedStorageAccount, args: string[], timeoutMs: number) {
    const skillDir = this.requireQuarkSkillDir();
    const cliPath = join(skillDir, 'scripts', 'quark-drive.cjs');
    return runCli(process.execPath, [cliPath, ...args, '--session-id', `templio-${account.id.slice(-6)}`], {
      cwd: skillDir,
      timeoutMs,
      env: this.quarkAccountEnv(account),
    });
  }

  quarkAccountEnv(account: ManagedStorageAccount): NodeJS.ProcessEnv {
    return {
      // skill CLI 要求的 Agent 环境标记
      CODEX_ENV: '1',
      AI_AGENT: 'codex',
      // 每账号独立 HOME 沙箱隔离授权态
      HOME: account.profileDir,
      USERPROFILE: account.profileDir,
      XDG_CONFIG_HOME: join(account.profileDir, '.config'),
    };
  }

  private async probeQuark(account: ManagedStorageAccount) {
    try {
      const result = await this.runQuark(account, ['get-user-info'], 60_000);
      const lines = this.parseQuarkNdjson(result.stdout);
      const final = lines[lines.length - 1];
      const data = (final?.data ?? {}) as { userInfo?: { nickname?: string }; nickname?: string };
      return {
        ok: result.ok && Number(final?.code ?? -1) === 0,
        message: String(final?.msg || result.stderr || '夸克 CLI 可用'),
        accountName: data.userInfo?.nickname || data.nickname,
      };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  private parseQuarkNdjson(stdout: string) {
    const lines: Array<{ code?: number; msg?: string; data?: Record<string, unknown> }> = [];
    for (const line of (stdout || '').split(/\r?\n/)) {
      try {
        const parsed = JSON.parse(line.trim()) as { code?: number; msg?: string; data?: Record<string, unknown> };
        if (parsed && typeof parsed === 'object' && 'code' in parsed) lines.push(parsed);
      } catch {
        // 忽略非 JSON 行
      }
    }
    return lines;
  }

  /** 百度探测：pip 版 bdpan 无 whoami，用一次无害的 share 调用根据报错文本判断登录态 */
  private async probeBaidu(account: ManagedStorageAccount) {
    if (!account.configPath || !existsSync(account.configPath)) {
      return { ok: false, message: '尚未配置 Cookie，请先粘贴百度网盘 Cookie' };
    }
    const result = await runCli(this.bdpan(), this.baiduArgs(account), { timeoutMs: 60_000 });
    const output = `${result.stdout}\n${result.stderr}`;
    if (/cookie|登录|login|未授权|SESTDATA|invalid/i.test(output)) {
      return { ok: false, message: shortOutput(output), accountName: undefined };
    }
    return { ok: true, message: shortOutput(output || 'Cookie 有效'), accountName: undefined };
  }

  /** 供 storage 服务复用：bdpan 命令参数（含 per-account cookies） */
  baiduArgs(account: ManagedStorageAccount): string[] {
    return account.configPath ? ['--cookie-file', account.configPath] : [];
  }

  bdpan(): string {
    return this.config.get<string>('BDPAN_PATH') || 'bdpan';
  }

  requireQuarkSkillDir(): string {
    const skillDir = this.config.get<string>('QUARK_SKILL_DIR')?.trim();
    if (!skillDir || !existsSync(join(skillDir, 'scripts', 'quark-drive.cjs'))) {
      throw new BadRequestException('未配置可用的夸克网盘 Skill 目录（QUARK_SKILL_DIR）');
    }
    return skillDir;
  }

  private async requireAccount(id: string, provider?: NetdiskType) {
    const account = await this.prisma.storageAccount.findUnique({ where: { id } });
    if (!account || !account.isActive) throw new NotFoundException('网盘账号不存在');
    if (provider && account.provider !== provider) throw new BadRequestException('网盘账号类型不匹配');
    return account;
  }

  private root() {
    return resolve(this.config.get<string>('STORAGE_ACCOUNT_ROOT') || 'storage-accounts');
  }

  private removeProfile(profileDir: string) {
    // 仅删除 STORAGE_ACCOUNT_ROOT 下的目录，防路径逃逸
    const root = resolve(this.root());
    const target = resolve(profileDir);
    if (target.startsWith(`${root}${sep}`)) {
      try {
        rmSync(target, { recursive: true, force: true });
      } catch {
        // 清理失败不影响账号删除
      }
    }
  }
}
