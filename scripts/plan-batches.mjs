#!/usr/bin/env node
/**
 * 84GB 大合集分批规划：只挑选可处理的 .pptx/.docx，按源文件体积切成批次。
 * 默认用硬链接建立批次源目录，不额外占用磁盘。
 *
 * 用法：
 *   node scripts/plan-batches.mjs --root "C:\...\合集 84GB" --target-gb 3.5
 *
 * 可选：
 *   --out batches        批次目录
 *   --max-files 50       只取前 N 个模板（做试点批次）
 *   --force              覆盖已有批次目录
 */
import { link, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, parse, relative, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const root = resolve(required(args.root, "--root 源目录"));
const outDir = resolve(args.out || "batches");
const targetBytes = Math.max(0.5, Number(args["target-gb"] || 3.5)) * 1024 ** 3;
const maxFiles = args["max-files"] ? Number(args["max-files"]) : 0;
const supported = new Set([".pptx", ".docx"]);

if (parse(root).root.toLowerCase() !== parse(outDir).root.toLowerCase()) {
  throw new Error("批次目录必须和源目录在同一磁盘，否则无法用硬链接，会复制几十 GB 源文件");
}

const all = await walk(root);
const legacy = all.filter((file) => [".ppt", ".doc"].includes(extname(file.path).toLowerCase()));
const considered = all.filter((file) => supported.has(extname(file.path).toLowerCase()));
const excluded = {
  legacy,
  zero: considered.filter((file) => file.size === 0),
  oversized: considered.filter((file) => file.size > 80 * 1024 * 1024),
};
const candidates = considered
  .filter((file) => file.size > 0 && file.size <= 80 * 1024 * 1024)
  .sort((a, b) => a.rel.localeCompare(b.rel, "zh-CN"));

const selected = maxFiles > 0 ? candidates.slice(0, maxFiles) : candidates;
const batches = buildBatches(selected, targetBytes);

if (args.force) {
  await rm(outDir, { recursive: true, force: true });
} else {
  try {
    await stat(outDir);
    throw new Error(`输出目录已存在：${outDir}；确认覆盖请加 --force`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
await mkdir(outDir, { recursive: true });

const planBatches = [];
for (let index = 0; index < batches.length; index += 1) {
  const id = `b${String(index + 1).padStart(3, "0")}`;
  const sourceDir = join(outDir, "source", id);
  const outputDir = join(outDir, "output", id);
  const linked = [];
  for (const file of batches[index].files) {
    const destination = join(sourceDir, file.rel);
    await mkdir(dirname(destination), { recursive: true });
    // 只允许硬链接：失败必须中止，避免意外复制几十 GB
    await link(file.path, destination);
    linked.push({ src: file.path, rel: file.rel, size: file.size });
  }
  planBatches.push({
    id,
    sourceDir,
    outputDir,
    files: linked,
    bytes: batches[index].bytes,
    categories: [...new Set(linked.map((file) => file.rel.split(/[\\/]/)[0]))],
  });
}

const plan = {
  generatedAt: new Date().toISOString(),
  root,
  outDir,
  targetGb: targetBytes / 1024 ** 3,
  totals: {
    allFiles: all.length,
    supported: considered.length,
    selected: selected.length,
    selectedBytes: selected.reduce((sum, file) => sum + file.size, 0),
    batchCount: planBatches.length,
    excludedLegacy: excluded.legacy.length,
    excludedZero: excluded.zero.length,
    excludedOversized: excluded.oversized.length,
  },
  excluded: {
    legacy: excluded.legacy.map((file) => file.path),
    zero: excluded.zero.map((file) => file.path),
    oversized: excluded.oversized.map((file) => file.path),
  },
  batches: planBatches,
};

await writeFile(join(outDir, "plan.json"), JSON.stringify(plan, null, 2), "utf8");
console.log(`规划完成：${planBatches.length} 批 / ${selected.length} 个模板 / ${gb(plan.totals.selectedBytes)}`);
for (const batch of planBatches) {
  console.log(`  ${batch.id}  ${gb(batch.bytes).padStart(7)}  ${String(batch.files.length).padStart(4)} 个  ${batch.categories.join("、")}`);
}

async function walk(dir) {
  const result = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("~$")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walk(full)));
    } else if (entry.isFile()) {
      const info = await stat(full);
      result.push({ path: full, rel: relative(root, full), size: info.size });
    }
  }
  return result;
}

function buildBatches(files, limit) {
  const result = [];
  let current = { files: [], bytes: 0 };
  for (const file of files) {
    if (current.files.length && current.bytes + file.size > limit) {
      result.push(current);
      current = { files: [], bytes: 0 };
    }
    current.files.push(file);
    current.bytes += file.size;
  }
  if (current.files.length) result.push(current);
  return result;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) result[name] = true;
    else {
      result[name] = next;
      index += 1;
    }
  }
  return result;
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function gb(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}
