import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, resolve } from "node:path";
import { parseManifest } from "@templio/shared";
import { readJson } from "../lib/fsx.js";

export async function runStatus(distDir: string): Promise<number> {
  const root = resolve(distDir);
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    console.log(`目录不存在：${root}`);
    return 1;
  }

  const packageDirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(root, entry.name));

  const issues: string[] = [];
  let valid = 0;
  let totalBytes = 0;

  for (const packageDir of packageDirs) {
    const manifestPath = join(packageDir, "manifest.json");
    const raw = await readJson<unknown>(manifestPath);
    if (!raw) {
      issues.push(`${packageDir}: 缺少 manifest.json`);
      continue;
    }
    try {
      const manifest = parseManifest(raw);
      valid += 1;
      totalBytes += manifest.sourceBytes;
    } catch (error) {
      issues.push(`${packageDir}: ${(error as Error).message}`);
    }
  }

  console.log(`物料包目录：${root}`);
  console.log(`共 ${packageDirs.length} 个包，合法 ${valid} 个，异常 ${issues.length} 个`);
  console.log(`源文件合计：${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

  if (issues.length > 0) {
    console.log("\n异常清单：");
    for (const issue of issues.slice(0, 20)) console.log(`  ✘ ${issue}`);
    return 1;
  }
  return 0;
}

export async function directorySize(dir: string): Promise<number> {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) total += await directorySize(fullPath);
    else total += (await stat(fullPath)).size;
  }
  return total;
}
