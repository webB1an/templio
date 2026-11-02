import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";

export interface CliResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface CliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdin?: string;
  stdinFilePath?: string;
}

/** 运行外部 CLI（bdpan / 夸克 skill），带超时与输出捕获 */
export function runCli(command: string, args: string[], options: CliOptions = {}): Promise<CliResult> {
  return new Promise((resolve) => {
    const stdinFd = options.stdinFilePath ? openSync(options.stdinFilePath, "r") : undefined;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      shell: false,
      stdio: [stdinFd ?? "pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, options.timeoutMs ?? 300_000);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (stdinFd !== undefined) closeSync(stdinFd);
      resolve({ ok: false, code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (stdinFd !== undefined) closeSync(stdinFd);
      resolve({
        ok: !timedOut && code === 0,
        code,
        stdout: stdout.trim(),
        stderr: timedOut ? `${stderr}\n命令超时`.trim() : stderr.trim(),
      });
    });
    if (stdinFd === undefined && options.stdin) child.stdin?.end(options.stdin);
  });
}

export function parseNdjson(stdout: string): unknown[] {
  return (stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: "raw" };
      }
    });
}

export function lastResult(stdout: string): Record<string, unknown> | undefined {
  const results = parseNdjson(stdout).filter(
    (line): line is Record<string, unknown> =>
      Boolean(line && typeof line === "object" && (line as { type?: string }).type === "result"),
  );
  return results.at(-1);
}

export function extractUrl(value: string): string | undefined {
  return value.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
}

export function shortOutput(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1000);
}
