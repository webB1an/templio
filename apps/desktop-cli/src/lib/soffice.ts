import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
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
