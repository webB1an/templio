import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

export interface CliResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

/** 运行外部 CLI（网盘 skill / bdpan），带超时与输出捕获 */
export function runCli(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdin?: string;
    stdinFilePath?: string;
    timeoutMs?: number;
  },
): Promise<CliResult> {
  return new Promise((resolve) => {
    const stdinFd = options?.stdinFilePath ? openSync(options.stdinFilePath, 'r') : undefined;
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      windowsHide: true,
      shell: false,
      stdio: [stdinFd ?? 'pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, options?.timeoutMs ?? 300_000);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error: Error) => {
      clearTimeout(timer);
      if (stdinFd !== undefined) closeSync(stdinFd);
      resolve({ ok: false, code: 1, stdout, stderr: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stdinFd !== undefined) closeSync(stdinFd);
      resolve({
        ok: !timedOut && code === 0,
        code,
        stdout: stdout.trim(),
        stderr: timedOut ? `${stderr}\n命令超时`.trim() : stderr.trim(),
      });
    });

    if (stdinFd === undefined && options?.stdin) child.stdin?.end(options.stdin);
  });
}

export interface NdjsonLine {
  type?: string;
  code?: number;
  msg?: string;
  data?: Record<string, unknown>;
  action?: string;
}

/** 解析 skill CLI 的 NDJSON 输出 */
export function parseNdjson(stdout: string): NdjsonLine[] {
  return (stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as NdjsonLine;
      } catch {
        return { type: 'raw' } as NdjsonLine;
      }
    });
}

/** 取最后一行 result；无有效 result 时抛错 */
export function lastResult(stdout: string): NdjsonLine {
  const lines = parseNdjson(stdout).filter((l) => l.type === 'result');
  if (!lines.length) throw new Error(`CLI 未返回结果：${stdout.slice(0, 200)}`);
  return lines[lines.length - 1];
}

export function extractUrl(value: string): string | undefined {
  return value.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
}

export function shortOutput(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 1000);
}
