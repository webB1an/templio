#!/usr/bin/env node
/**
 * 清理 storage 中未被数据库引用的孤儿文件/目录。
 *
 * 用法（在服务器上，需先加载 apps/api/.env）：
 *   cd /www/wwwroot/templio/apps/api
 *   set -a; . ./.env; set +a
 *   node ../../scripts/cleanup-storage.mjs            # dry-run
 *   node ../../scripts/cleanup-storage.mjs --delete   # 确认后删除
 */
import { createRequire } from "node:module";
import { readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const storageIndex = args.indexOf("--storage");
const storageRoot = resolve(
  storageIndex >= 0 ? args[storageIndex + 1] : process.env.STORAGE_ROOT || "storage"
);

const prisma = new PrismaClient();

async function main() {
  const files = await prisma.templateFile.findMany({
    select: { objectKey: true, size: true, role: true },
  });
  const referenced = new Map(files.map((file) => [file.objectKey, file.role]));
  const publicDirs = new Set();
  const privateDirs = new Set();
  for (const key of referenced.keys()) {
    if (key.startsWith("templates/")) publicDirs.add(key.split("/")[1]);
    if (key.startsWith("sources/")) privateDirs.add(key.split("/")[1]);
  }

  const orphans = [];

  await collectOrphanDirs(join(storageRoot, "public", "templates"), publicDirs, "templates", orphans);
  await collectOrphanFiles(join(storageRoot, "public"), referenced, orphans);
  await collectOrphanDirs(join(storageRoot, "private", "sources"), privateDirs, "sources", orphans);

  if (orphans.length === 0) {
    console.log(`✔ storage 干净：${storageRoot}`);
    return;
  }

  console.log(`发现 ${orphans.length} 个孤儿路径：`);
  let totalBytes = 0;
  for (const orphan of orphans) {
    totalBytes += orphan.size;
    console.log(`  - ${orphan.path}${orphan.size ? ` (${formatBytes(orphan.size)})` : ""}`);
  }
  console.log(`合计约 ${formatBytes(totalBytes)}`);

  if (!shouldDelete) {
    console.log("\n当前为 dry-run；确认后加 --delete 删除。");
    return;
  }

  for (const orphan of orphans) {
    await rm(join(storageRoot, orphan.path), { recursive: true, force: true });
    console.log(`  ✘ 已删除 ${orphan.path}`);
  }
  console.log("\n✔ 清理完成");
}

async function collectOrphanDirs(parent, referencedNames, prefix, orphans) {
  let entries;
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!referencedNames.has(entry.name)) {
      const relative = `${parent.split(/[\\/]/).slice(-2).join("/")}/${entry.name}`;
      const path = relative.startsWith(`${prefix}/`) ? relative : `${prefix}/${entry.name}`;
      orphans.push({ path, size: await directorySize(join(parent, entry.name)) });
    }
  }
}

async function collectOrphanFiles(root, referenced, orphans) {
  const templatesRoot = join(root, "templates");
  let dirs;
  try {
    dirs = await readdir(templatesRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const dirPath = join(templatesRoot, dir.name);
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const key = `templates/${dir.name}/${entry.name}`;
      if (!referenced.has(key)) {
        const info = await stat(join(dirPath, entry.name));
        orphans.push({ path: `public/${key}`, size: info.size });
      }
    }
  }
}

async function directorySize(dir) {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else {
      try {
        total += (await stat(full)).size;
      } catch {
        // ignore
      }
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
