import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { statSync } from 'node:fs';
import { copyFile, link, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { lastResult, runCli } from './cli';
import {
  buildTemplateRemoteDir,
  sanitizeRemoteName,
  uniqueRemoteName,
} from './netdisk-path';
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

  /**
   * 百度落盘路径 = BAIDU_REMOTE_BASE（已含根目录 templio）+ 相对目录 + 文件名。
   * remoteDir 只能传相对目录（如 "PPT模板/2026-10"），不要再带根目录名，否则会出现 templio/templio。
   */
  uploadPath(filePath: string, remoteDir?: string) {
    const remoteBase = this.config.get<string>('BAIDU_REMOTE_BASE') || '/apps/bdpan/templio';
    const base = remoteBase.replace(/\/+$/, '');
    return [base, remoteDir, sanitizeRemoteName(basename(filePath))].filter(Boolean).join('/');
  }
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

  /**
   * 选定 provider：显式指定优先，否则用已设默认的账号（夸克优先）。
   * 都没有时抛出带引导文案的错误。
   */
  async resolveProvider(preferred?: 'quark' | 'baidu'): Promise<'quark' | 'baidu'> {
    if (preferred) return preferred;
    if (await this.accounts.getDefaultAccount('quark')) return 'quark';
    if (await this.accounts.getDefaultAccount('baidu')) return 'baidu';
    throw new BadRequestException(
      '未配置默认网盘账号，请先在「网盘管理」新增账号、完成授权并设为默认',
    );
  }

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

  /**
   * 模板文件专用上传：按「格式/年-月」分层 + 唯一文件名，返回可直接落库的 remotePath。
   *
   * 与 uploadAndShare 的区别：
   * - 目录由 buildTemplateRemoteDir 统一构建，调用方不再手写 'templio'，避免根目录重复；
   * - 本地临时文件名是 imp-xxx 随机串，这里先改成可读且唯一的远端名再上传，
   *   既让网盘里文件看得懂，也避免不同模板同名互相覆盖。
   */
  async uploadTemplateFile(
    filePath: string,
    provider: 'quark' | 'baidu',
    input: { format: string; originalName: string; accountId?: string; date?: Date },
  ) {
    const date = input.date ?? new Date();
    const dir = buildTemplateRemoteDir(input.format, date);
    const remoteName = uniqueRemoteName(input.originalName, date);

    const result = await this.withRemoteName(filePath, remoteName, (staged) =>
      this.uploadAndShare(staged, provider, {
        accountId: input.accountId,
        // 分享标题用原始文件名，用户在分享页看到的是干净名字
        title: input.originalName,
        remoteDir: dir.baiduRelativeDir,
      }),
    );

    const fallbackPath =
      provider === 'baidu'
        ? this.baidu.uploadPath(filePath, dir.baiduRelativeDir).replace(
            /[^/]+$/,
            remoteName,
          )
        : `/${dir.quarkSegments.join('/')}/${remoteName}`;

    return {
      ...result,
      remoteName,
      remotePath: result.remotePath ?? fallbackPath,
    };
  }

  /**
   * 上传前把文件改成目标远端名。同分区用硬链接（零拷贝），跨分区回退复制。
   * 上传结束后删除这份临时命名，真正的清理仍由调用方负责。
   */
  private async withRemoteName<T>(
    filePath: string,
    remoteName: string,
    fn: (stagedPath: string) => Promise<T>,
  ): Promise<T> {
    if (basename(filePath) === remoteName) return fn(filePath);
    const target = join(dirname(filePath), remoteName);
    try {
      await link(filePath, target);
    } catch {
      await copyFile(filePath, target);
    }
    try {
      return await fn(target);
    } finally {
      await unlink(target).catch(() => undefined);
    }
  }
}
