#!/usr/bin/env node
/**
 * 修复历史模板的乱码简介：把 PPT 内部抽出的 XML 噪声替换为
 * “PPT 模板 · 共 N 页”这样的安全简介。
 *
 * 用法：
 *   TEMPLIO_ADMIN_PASSWORD=xxx node scripts/clean-descriptions.mjs \
 *     --report "C:\...\b001-upload.json"
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const reportPath = resolve(required(args.report, "缺少 --report"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const api = (args.api || process.env.TEMPLIO_API || "https://templio.wdbzk.com").replace(/\/+$/, "");
const username = process.env.TEMPLIO_ADMIN_USERNAME || "admin";
const password = process.env.TEMPLIO_ADMIN_PASSWORD || "";
if (!password) throw new Error("缺少 TEMPLIO_ADMIN_PASSWORD");

const token = await login();
const items = (report.results || []).filter((item) => item.id && item.status === "imported");
let updated = 0;
let failed = 0;

for (const item of items) {
  try {
    const manifest = JSON.parse(await readFile(join(item.dir, "manifest.json"), "utf8"));
    const label = manifest.format === "docx" ? "Word" : "PPT";
    const description = `${label} 模板 · 共 ${manifest.pageCount || 0} 页`;
    await json(`/api/admin/templates/${item.id}`, { method: "PATCH", body: { description } });
    updated += 1;
  } catch (error) {
    failed += 1;
    console.error(`  ✘ ${item.id} ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`简介整理完成：成功 ${updated}，失败 ${failed}`);
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
