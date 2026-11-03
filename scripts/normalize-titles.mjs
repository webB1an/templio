#!/usr/bin/env node
/**
 * 批量把管理端模板标题改成源文件名；文件名是纯数字时，
 * 自动带上最近的有意义目录名（例如“238套总结汇报PPT模板 · 10”）。
 *
 * 用法：
 *   TEMPLIO_ADMIN_PASSWORD=xxx node scripts/normalize-titles.mjs \
 *     --report "C:\...\b001-upload.json" \
 *     --plan "C:\...\plan.json" --batch b001
 *
 * 可选：
 *   --api https://templio.wdbzk.com
 *   --limit 20
 *   --dry-run
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const reportPath = resolve(required(args.report, "缺少 --report 上传报告"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const planPath = args.plan ? resolve(args.plan) : "";
const plan = planPath ? JSON.parse(await readFile(planPath, "utf8")) : null;
const batch = plan && args.batch ? plan.batches.find((item) => item.id === args.batch) : null;
const relByFile = buildRelLookup(batch);
const api = (args.api || process.env.TEMPLIO_API || "https://templio.wdbzk.com").replace(/\/+$/, "");
const username = args.username || process.env.TEMPLIO_ADMIN_USERNAME || "admin";
const password = process.env.TEMPLIO_ADMIN_PASSWORD || "";
const dryRun = Boolean(args["dry-run"]);
const limit = args.limit ? Math.max(1, Number(args.limit)) : 0;

if (!password) throw new Error("缺少 TEMPLIO_ADMIN_PASSWORD");

const token = await login();
const items = (report.results || []).filter((item) => item.id && item.status === "imported");
const selected = limit > 0 ? items.slice(0, limit) : items;
let updated = 0;
let failed = 0;

for (const item of selected) {
  try {
    const manifest = JSON.parse(await readFile(join(item.dir, "manifest.json"), "utf8"));
    const sourceFile = manifest.sourceFile || basename(item.dir);
    const rel = relByFile.get(`${basename(sourceFile)}|${Number(manifest.sourceBytes) || 0}`) || "";
    const title = cleanTitle(sourceFile, rel);
    if (dryRun) {
      console.log(`  ${item.id}  ${title}`);
      continue;
    }
    await json(`/api/admin/templates/${item.id}`, {
      method: "PATCH",
      body: { title },
    });
    updated += 1;
    if (updated % 20 === 0) console.log(`  已更新 ${updated}/${selected.length}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✘ ${item.id} ${error instanceof Error ? error.message : String(error)}`);
  }
}

const outPath = reportPath.replace(/\.json$/i, "-titles.json");
await writeFile(
  outPath,
  JSON.stringify({ api, generatedAt: new Date().toISOString(), updated, failed }, null, 2),
  "utf8",
);
console.log(`\n标题整理${dryRun ? "（dry-run）" : "完成"}：成功 ${updated}，失败 ${failed}`);
console.log(`报告：${outPath}`);
if (failed > 0) process.exitCode = 1;

async function login() {
  const data = await json("/api/admin/login", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
  if (!data?.token) throw new Error("管理员登录失败");
  return data.token;
}

async function json(path, options = {}) {
  const response = await fetch(`${api}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.auth === false ? {} : { authorization: `Bearer ${token}` }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
  return payload;
}

function cleanTitle(sourceFile, rel) {
  const stem = basename(String(sourceFile)).replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim();
  if (!rel) return (stem || "未命名模板").slice(0, 100);

  const segments = String(rel).split(/[\\/]/).filter(Boolean);
  const parent = [...segments.slice(0, -1)].reverse().find((name) => isMeaningfulFolder(name));
  const cleanParent = parent ? parent.replace(/[-_\s]+$/g, "") : "";
  const generic =
    !stem ||
    /^\d+$/.test(stem) ||
    /^[a-z]{1,4}\d{1,6}$/i.test(stem) ||
    /^(PowerPoint|幻灯片|单击此处|Write Your Title|ThemeGallery|www\.|https?\\:|第一PPT|大侠|小鹿|A尚|哎呀|典藏馆|1\.0 UTF-8)/i.test(
      stem,
    );
  const title = generic && cleanParent ? `${cleanParent} · ${stem || "模板"}` : stem || cleanParent || "未命名模板";
  return title.replace(/\s+/g, " ").slice(0, 100);
}

function isMeaningfulFolder(name) {
  const text = String(name || "").trim();
  if (!text) return false;
  if (/^\d+$/.test(text)) return false;
  if (/^(PPT|PPT模板|PPT文件|PPT素材|模板|下载|含内容|打开文件夹|PPT模板文件)/i.test(text)) return false;
  return text.length >= 2;
}

function buildRelLookup(batch) {
  const map = new Map();
  if (!batch) return map;
  for (const file of batch.files || []) {
    const key = `${basename(file.rel)}|${Number(file.size) || 0}`;
    if (!map.has(key)) map.set(key, file.rel);
  }
  return map;
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
