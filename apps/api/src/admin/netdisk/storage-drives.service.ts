import { BadRequestException, Injectable } from "@nestjs/common";
import { statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { lastResult, runCli } from "./cli";
import { ManagedStorageAccount, NetdiskProvider, StorageAccountService } from "./storage-account.service";

export interface UploadShareResult {
  provider: NetdiskProvider;
  accountId: string;
  url: string;
  passcode?: string;
  remotePath?: string;
  remoteFileId?: string;
}

/** 夸克网盘：quarkclouddrive skill CLI 上传 + 永久公开分享 */
@Injectable()
export class QuarkStorageService {
  constructor(private readonly accounts: StorageAccountService) {}

  async upload(filePath: string, account: ManagedStorageAccount, remoteDirSegments?: string[]) {
    const skillDir = this.accounts.requireQuarkSkillDir();
    const cliPath = join(skillDir, "scripts", "quark-drive.cjs");
    const args = [cliPath, "upload", filePath, "--session-id", this.sessionId()];
    const parentFid = await this.resolveParentFid(account, remoteDirSegments);
    if (parentFid) args.splice(3, 0, "--parent-fid", parentFid);

    const result = await runCli(process.execPath, args, {
      cwd: skillDir,
      timeoutMs: 60 * 60_000,
      env: this.accounts.quarkAccountEnv(account),
    });
    const final = this.tryLastResult(result.stdout);
    const code = Number(final?.code ?? (result.ok ? 0 : -1));
    if (!result.ok || code !== 0) {
      throw new Error(String(final?.msg || result.stderr || "夸克上传失败"));
    }
    const data = (final?.data || {}) as {
      fids?: string[];
      fileNames?: string[];
      fullPath?: string;
    };
    if (!data.fids?.length) throw new Error("夸克上传成功但未返回文件 ID");
    return {
      fids: data.fids,
      fileName: data.fileNames?.[0] || basename(filePath),
      fullPath: data.fullPath,
    };
  }

  async share(fids: string[], title: string, account: ManagedStorageAccount) {
    const skillDir = this.accounts.requireQuarkSkillDir();
    const cliPath = join(skillDir, "scripts", "quark-drive.cjs");
    const result = await runCli(
      process.execPath,
      [
        cliPath,
        "share",
        ...fids,
        "--title",
        title,
        "--url-type",
        "1",
        "--expired-type",
        "1",
        "--session-id",
        this.sessionId(),
      ],
      { cwd: skillDir, timeoutMs: 120_000, env: this.accounts.quarkAccountEnv(account) },
    );
    const final = this.tryLastResult(result.stdout);
    const code = Number(final?.code ?? (result.ok ? 0 : -1));
    if (!result.ok || code !== 0) {
      throw new Error(String(final?.msg || result.stderr || "夸克分享失败"));
    }
    const data = (final?.data || {}) as { share_url?: string; passcode?: string };
    if (!data.share_url) throw new Error("夸克分享成功但未返回链接");
    return { url: data.share_url, passcode: data.passcode };
  }

  private async resolveParentFid(account: ManagedStorageAccount, segments?: string[]) {
    const base = (process.env.QUARK_UPLOAD_PARENT_FID || "").trim();
    if (!segments?.length) return base || undefined;
    const skillDir = this.accounts.requireQuarkSkillDir();
    const cliPath = join(skillDir, "scripts", "quark-drive.cjs");
    let parentFid = base || "0";
    for (const segment of segments) {
      const result = await runCli(
        process.execPath,
        [cliPath, "create-folder", "--dir-path", segment, "--parent-fid", parentFid, "--session-id", this.sessionId()],
        { cwd: skillDir, timeoutMs: 120_000, env: this.accounts.quarkAccountEnv(account) },
      );
      const final = this.tryLastResult(result.stdout);
      const code = Number(final?.code ?? (result.ok ? 0 : -1));
      const data = (final?.data || {}) as { fid?: string };
      if (!result.ok || code !== 0 || !data.fid) {
        if (/exist|已存在/i.test(String(final?.msg || result.stderr))) continue;
        throw new Error(String(final?.msg || result.stderr || "夸克创建目录失败"));
      }
      parentFid = data.fid;
    }
    return parentFid;
  }

  private tryLastResult(stdout: string): Record<string, unknown> | undefined {
    try {
      return lastResult(stdout);
    } catch {
      return undefined;
    }
  }

  private sessionId(): string {
    return `templio-${Math.floor(Date.now() / 1000)}`;
  }
}

/** 百度网盘：官方 bdpan CLI（OAuth 授权）上传 + 分享 */
@Injectable()
export class BaiduStorageService {
  constructor(private readonly accounts: StorageAccountService) {}

  async uploadAndShare(
    filePath: string,
    account: ManagedStorageAccount,
    remoteDir?: string,
  ): Promise<{ url: string; passcode?: string; remotePath: string }> {
    const remotePath = this.uploadPath(filePath, remoteDir);
    const size = statSync(filePath).size;
    const timeoutMs = Math.max(600_000, Math.ceil(size / 40_000) * 1500);

    const upload = await runCli(
      this.accounts.bdpan(),
      [...this.accounts.baiduArgs(account), "upload", filePath, remotePath, "--overwrite", "--json"],
      { timeoutMs },
    );
    if (!upload.ok) throw new Error(lastLine(upload.stderr || upload.stdout) || "百度网盘上传失败");

    const period = (process.env.BAIDU_SHARE_PERIOD_DAYS || "0").trim();
    const share = await runCli(
      this.accounts.bdpan(),
      [...this.accounts.baiduArgs(account), "share", remotePath, "--period", period, "--json"],
      { timeoutMs: 120_000 },
    );
    const output = `${share.stdout}\n${share.stderr}`;
    if (!share.ok) throw new Error(lastLine(output) || "百度网盘分享失败");

    const parsed = parseBaiduShare(output);
    if (!parsed.url) throw new Error(`无法解析百度分享结果：${output.slice(0, 200)}`);
    return { url: parsed.url, passcode: parsed.passcode, remotePath };
  }

  uploadPath(filePath: string, remoteDir?: string): string {
    const rawBase = (process.env.BAIDU_REMOTE_BASE || "templio")
      .replace(/^\/?apps\/bdpan\/?/, "")
      .replace(/\/+$/, "");
    return [rawBase, remoteDir, sanitizeRemoteName(basename(filePath))].filter(Boolean).join("/");
  }
}

function parseBaiduShare(output: string): { url?: string; passcode?: string } {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines.reverse()) {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const body = JSON.parse(line.slice(start, end + 1)) as {
        link?: string;
        url?: string;
        pwd?: string;
        password?: string;
      };
      const url = body.link || body.url;
      if (url) return { url, passcode: body.pwd || body.password };
    } catch {
      // 继续尝试其他行
    }
  }
  const url = output.match(/https:\/\/pan\.baidu\.com\/s\/[^\s"']+/i)?.[0];
  const passcode = output.match(/(?:提取码|密码|pwd)[:：=]\s*([a-zA-Z0-9]{4})/i)?.[1];
  return { url, passcode };
}

function lastLine(value: string): string {
  return (
    String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) || ""
  );
}

/** 上传分享协调器：优先显式 provider，否则夸克默认 → 百度默认 */
@Injectable()
export class StorageCoordinatorService {
  constructor(
    private readonly accounts: StorageAccountService,
    private readonly quark: QuarkStorageService,
    private readonly baidu: BaiduStorageService,
  ) {}

  async resolveProvider(preferred?: NetdiskProvider): Promise<NetdiskProvider> {
    if (preferred) return preferred;
    if (await this.accounts.getDefaultAccount("quark")) return "quark";
    if (await this.accounts.getDefaultAccount("baidu")) return "baidu";
    throw new BadRequestException("未配置默认网盘账号，请先在「网盘账号」新增账号、完成授权并设为默认");
  }

  async uploadAndShare(
    filePath: string,
    provider?: NetdiskProvider,
    options?: { accountId?: string; title?: string; remoteDir?: string; remoteDirSegments?: string[] },
  ): Promise<UploadShareResult> {
    const resolvedProvider = await this.resolveProvider(provider);
    const account = await this.accounts.getAccountForProvider(resolvedProvider, options?.accountId);
    if (!account) {
      throw new BadRequestException(
        `未配置默认${resolvedProvider === "baidu" ? "百度" : "夸克"}网盘账号，请先在「网盘账号」新增、授权并设为默认`,
      );
    }
    const title = options?.title || basename(filePath);

    if (resolvedProvider === "baidu") {
      const result = await this.baidu.uploadAndShare(filePath, account, options?.remoteDir);
      return {
        provider: "baidu",
        accountId: account.id,
        url: result.url,
        passcode: result.passcode,
        remotePath: result.remotePath,
      };
    }

    const uploaded = await this.quark.upload(filePath, account, options?.remoteDirSegments);
    const shared = await this.quark.share(uploaded.fids, title, account);
    return {
      provider: "quark",
      accountId: account.id,
      url: shared.url,
      passcode: shared.passcode,
      remotePath: uploaded.fullPath,
      remoteFileId: uploaded.fids[0],
    };
  }
}

function sanitizeRemoteName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim();
}

export async function ensureLocalDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
