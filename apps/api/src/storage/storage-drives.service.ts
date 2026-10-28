import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { lastResult, runCli } from './cli';
import {
  ManagedStorageAccount,
  StorageAccountService,
} from './storage-account.service';

export interface QuarkUploadResult {
  fids: string[];
  fileName: string;
  fullPath?: string;
}

export interface ShareResult {
  url: string;
  passcode?: string;
}

/** 夸克网盘：skill CLI 上传 + 永久公开分享 */
@Injectable()
export class QuarkStorageService {
  constructor(
    private readonly config: ConfigService,
    private readonly accounts: StorageAccountService,
  ) {}

  async upload(
    filePath: string,
    account: ManagedStorageAccount,
    remoteDirSegments?: string[],
  ): Promise<QuarkUploadResult> {
    const skillDir = this.accounts.requireQuarkSkillDir();
    const cliPath = join(skillDir, 'scripts', 'quark-drive.cjs');
    const args = [cliPath, 'upload', filePath, '--session-id', this.sessionId()];
    const parentFid = await this.resolveParentFid(account, remoteDirSegments);
    if (parentFid) args.splice(3, 0, '--parent-fid', parentFid);

    const result = await runCli(process.execPath, args, {
      cwd: skillDir,
      timeoutMs: 60 * 60_000,
      env: this.accounts.quarkAccountEnv(account),
    });
    const final = this.tryLastResult(result.stdout);
    const code = Number(final?.code ?? (result.ok ? 0 : -1));
    if (!result.ok || code !== 0) {
      throw new Error(String(final?.msg || result.stderr || '夸克上传失败'));
    }
    const data = (final?.data ?? {}) as { fids?: string[]; fileNames?: string[]; fullPath?: string };
    if (!data.fids?.length) throw new Error('夸克上传成功但未返回文件 ID');
    return { fids: data.fids, fileName: data.fileNames?.[0] || basename(filePath), fullPath: data.fullPath };
  }

  async share(fids: string[], title: string, account: ManagedStorageAccount): Promise<ShareResult> {
    const skillDir = this.accounts.requireQuarkSkillDir();
    const cliPath = join(skillDir, 'scripts', 'quark-drive.cjs');
    const result = await runCli(
      process.execPath,
      [
        cliPath, 'share', ...fids,
        '--title', title,
        '--url-type', '1', // 公开链接
        '--expired-type', '1', // 永久有效
        '--session-id', this.sessionId(),
      ],
      { cwd: skillDir, timeoutMs: 120_000, env: this.accounts.quarkAccountEnv(account) },
    );
    const final = this.tryLastResult(result.stdout);
    const code = Number(final?.code ?? (result.ok ? 0 : -1));
    if (!result.ok || code !== 0) {
      throw new Error(String(final?.msg || result.stderr || '夸克分享失败'));
    }
    const data = (final?.data ?? {}) as { share_url?: string; passcode?: string };
    if (!data.share_url) throw new Error('夸克分享成功但未返回链接');
    return { url: data.share_url, passcode: data.passcode };
  }

  private tryLastResult(stdout: string) {
    try {
      return lastResult(stdout);
    } catch {
      return undefined;
    }
  }

  private sessionId(): string {
    return `templio-${Math.floor(Date.now() / 1000)}`;
  }

  private async resolveParentFid(account: ManagedStorageAccount, segments?: string[]) {
    if (!segments?.length) {
      return this.config.get<string>('QUARK_UPLOAD_PARENT_FID')?.trim() || undefined;
    }
    const skillDir = this.accounts.requireQuarkSkillDir();
    const cliPath = join(skillDir, 'scripts', 'quark-drive.cjs');
    let parentFid = this.config.get<string>('QUARK_UPLOAD_PARENT_FID')?.trim() || '0';
    for (const segment of segments) {
      const result = await runCli(
        process.execPath,
        [cliPath, 'create-folder', '--dir-path', segment, '--parent-fid', parentFid, '--session-id', this.sessionId()],
        { cwd: skillDir, timeoutMs: 120_000, env: this.accounts.quarkAccountEnv(account) },
      );
      const final = this.tryLastResult(result.stdout);
      const code = Number(final?.code ?? (result.ok ? 0 : -1));
      const data = (final?.data ?? {}) as { fid?: string };
      if (!result.ok || code !== 0 || !data.fid) {
        // 目录已存在等场景：容错继续（skill 通常返回已存在目录的 fid）
        if (/exist|已存在/i.test(String(final?.msg || result.stderr))) continue;
        throw new Error(String(final?.msg || result.stderr || '夸克创建目录失败'));
      }
      parentFid = data.fid;
    }
    return parentFid;
  }
}

/** 百度网盘：bdpan（pip）上传 + 分享，Cookie 认证 */
@Injectable()
export class BaiduStorageService {
  constructor(
    private readonly config: ConfigService,
    private readonly accounts: StorageAccountService,
  ) {}

  async uploadAndShare(
    filePath: string,
    account: ManagedStorageAccount,
    remoteDir?: string,
  ): Promise<ShareResult & { remotePath: string }> {
    if (!account.configPath) throw new BadRequestException('百度账号缺少 cookies 配置');
    const remotePath = this.uploadPath(filePath, remoteDir);
    const size = statSync(filePath).size;
    const timeoutMs = Math.max(600_000, Math.ceil(size / 40_000) * 1500);
    const result = await runCli(
      this.accounts.bdpan(),
      [...this.accounts.baiduArgs(account), 'upload', filePath, '--remote-path', remotePath, '--overwrite'],
      { timeoutMs },
    );
    if (!result.ok) throw new Error(result.stderr || result.stdout || '百度网盘上传失败');

    const period = String(this.config.get('BAIDU_SHARE_PERIOD_DAYS') ?? 0);
    const shareRes = await runCli(
      this.accounts.bdpan(),
      [...this.accounts.baiduArgs(account), 'share', remotePath, '--period-days', period],
      { timeoutMs: 120_000 },
    );
    const output = `${shareRes.stdout}\n${shareRes.stderr}`;
    if (!shareRes.ok) throw new Error(output || '百度网盘分享失败');
    const link = output.match(/https:\/\/pan\.baidu\.com\/[^\s"']+/i)?.[0];
    if (!link) throw new Error(`无法解析百度分享结果：${output.slice(0, 200)}`);
    const passcode = output.match(/(?:密码|提取码|pwd)[:：=]\s*([a-zA-Z0-9]{4})/i)?.[1];
    return { url: link, passcode, remotePath };
  }

  uploadPath(filePath: string, remoteDir?: string) {
    const remoteBase = this.config.get<string>('BAIDU_REMOTE_BASE') || '/apps/bdpan/templio';
    const base = remoteBase.replace(/\/$/, '');
    return [base, remoteDir, sanitizeRemoteName(basename(filePath))].filter(Boolean).join('/');
  }
}

function sanitizeRemoteName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * 上传分享协调器：按 provider 选择账号，完成 上传→分享，返回可入库的分享链接。
 * 单一 provider 失败即抛错（调用方展示原因）。
 */
@Injectable()
export class StorageCoordinatorService {
  constructor(
    private readonly accounts: StorageAccountService,
    private readonly quark: QuarkStorageService,
    private readonly baidu: BaiduStorageService,
  ) {}

  async uploadAndShare(
    filePath: string,
    provider: 'quark' | 'baidu',
    options?: { accountId?: string; title?: string; remoteDir?: string },
  ) {
    const account = await this.accounts.getAccountForProvider(provider, options?.accountId);
    if (!account) {
      throw new BadRequestException(
        `未配置默认${provider === 'baidu' ? '百度' : '夸克'}网盘账号，请先在「网盘管理」新增、授权并设为默认`,
      );
    }
    const title = options?.title || basename(filePath);
    if (provider === 'baidu') {
      const r = await this.baidu.uploadAndShare(filePath, account, options?.remoteDir);
      return {
        provider,
        accountId: account.id,
        url: r.url,
        passcode: r.passcode,
        remoteFileId: null as string | null,
        remotePath: r.remotePath,
      };
    }
    const uploaded = await this.quark.upload(filePath, account, options?.remoteDir?.split('/').filter(Boolean));
    const share = await this.quark.share(uploaded.fids, title, account);
    return {
      provider,
      accountId: account.id,
      url: share.url,
      passcode: share.passcode,
      remoteFileId: uploaded.fids[0] ?? null,
      remotePath: uploaded.fullPath ?? null,
    };
  }
}
