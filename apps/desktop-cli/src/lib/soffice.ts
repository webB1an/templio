import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * LibreOffice 可执行文件探测。
 * 优先级：环境变量 TEMPLIO_SOFFICE → 各平台常见安装路径 → PATH。
 *
 * Windows 注意：soffice.exe 是 GUI 子系统程序，管道拿不到 stdout；
 * 同目录的 soffice.com 是控制台包装器，能正常输出，因此 Windows 上优先返回 .com。
 */
const CANDIDATES: Record<string, string[]> = {
  win32: [
    "C:\\Program Files\\LibreOffice\\program\\soffice.com",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ],
  darwin: ["/Applications/LibreOffice.app/Contents/MacOS/soffice"],
  linux: ["/usr/bin/soffice", "/usr/local/bin/soffice", "/snap/bin/libreoffice"],
};

/** 返回可用于捕获 stdout 的等价可执行文件（Windows 下 .exe → .com） */
function consoleBinary(bin: string): string {
  if (process.platform !== "win32" || !/soffice\.exe$/i.test(bin)) return bin;
  const com = bin.replace(/soffice\.exe$/i, "soffice.com");
  return existsSync(com) ? com : bin;
}

export async function findSoffice(): Promise<string | null> {
  const fromEnv = process.env.TEMPLIO_SOFFICE?.trim();
  if (fromEnv && existsSync(fromEnv)) return consoleBinary(fromEnv);

  for (const candidate of CANDIDATES[process.platform] ?? []) {
    if (existsSync(candidate)) return consoleBinary(candidate);
  }

  const cmd = process.platform === "win32" ? "where" : "which";
  const arg = process.platform === "win32" ? "soffice.com" : "soffice";
  try {
    const { stdout } = await execFileAsync(cmd, [arg], { windowsHide: true, timeout: 10_000 });
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) return consoleBinary(first);
  } catch {
    // 未找到，交给调用方提示安装
  }
  return null;
}

export async function readSofficeVersion(bin: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(consoleBinary(bin), ["--headless", "--version"], {
      windowsHide: true,
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });
    const text = `${stdout}\n${stderr}`.trim();
    const match = text.match(/LibreOffice\s+([\d.]+)/i);
    return match?.[1] ?? text.split(/\r?\n/).find(Boolean) ?? "unknown";
  } catch (error) {
    return `无法获取版本：${(error as Error).message}`;
  }
}

export interface ConvertToPdfOptions {
  /** 单文件超时，默认 5 分钟 */
  timeoutMs?: number;
}

/**
 * 把 PPTX/DOCX 转成 PDF。
 *
 * 做法：拷到 ASCII 临时目录再转换，规避中文路径 / 并发锁 / 残留文件问题；
 * 每个并发任务使用独立的 UserInstallation 配置目录。
 */
export async function convertToPdf(
  sofficePath: string,
  sourcePath: string,
  options: ConvertToPdfOptions = {},
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "templio-lo-"));
  try {
    const ext = extname(sourcePath).toLowerCase() || ".pptx";
    const inputPath = join(workDir, `input${ext}`);
    const profileDir = join(workDir, "profile");
    await mkdir(profileDir, { recursive: true });
    await copyFile(sourcePath, inputPath);

    const args = [
      "--headless",
      "--norestore",
      "--invisible",
      "--nodefault",
      "--nologo",
      "--nolockcheck",
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--convert-to",
      "pdf",
      "--outdir",
      workDir,
      inputPath,
    ];

    await runProcess(sofficePath, args, options.timeoutMs ?? 300_000);

    const pdfPath = join(workDir, "input.pdf");
    return await readFile(pdfPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    timer = setTimeout(() => {
      killTree(child.pid);
      finish(new Error(`LibreOffice 转换超时（${Math.round(timeoutMs / 1000)}s）`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-4000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (error) => finish(new Error(`无法启动 LibreOffice：${error.message}`)));
    child.on("close", (code) => {
      if (settled) return;
      if (code === 0) {
        finish();
        return;
      }
      const detail = (stderr || stdout).trim().slice(-800);
      finish(new Error(`LibreOffice 转换失败（exit ${code}）${detail ? `：${detail}` : ""}`));
    });
  });
}

function killTree(pid?: number): void {
  if (!pid) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => undefined);
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // 进程可能已经退出
  }
}
