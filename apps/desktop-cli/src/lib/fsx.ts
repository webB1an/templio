import { constants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** 原子写 JSON：先写临时文件再 rename，避免中断留下半个文件 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

export async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}
