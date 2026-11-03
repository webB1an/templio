#!/usr/bin/env node
/**
 * 按上传报告批量同步网盘（串行，避免 2C2G 服务器过载）。
 *
 * 用法：
 *   TEMPLIO_ADMIN_PASSWORD=xxx node scripts/sync-batch.mjs \
 *     --report "C:\...\upload-report.json" --provider quark
 *
 * 可选：
 *   --api https://templio.wdbzk.com
 *   --limit 10
 *   --publish        同步成功后批量上架（默认只保持 imported）
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const reportPath = resolve(required(args.report, "缺少 --report 上传报告"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const api = (args.api || process.env.TEMPLIO_API || "https://templio.wdbzk.com").replace(/\/+$/, "");
const username = args.username || process.env.TEMPLIO_ADMIN_USERNAME || "admin";
const password = process.env.TEMPLIO_ADMIN_PASSWORD || "";
const provider = args.provider || "quark";
const limit = args.limit ? Math.max(1, Number(args.limit)) : 0;
const shouldPublish = Boolean(args.publish);

if (!password) throw new Error("缺少 TEMPLIO_ADMIN_PASSWORD");

const token = await login();
const items = (report.results || []).filter((item) => item.status === "imported" && item.id);
const selected = limit > 0 ? items.slice(0, limit) : items;
const results = [];
console.log(`网盘同步：${selected.length}/${items.length} 个已导入模板 → ${api}（${provider}）`);

for (let index = 0; index < selected.length; index += 1) {
  const item = selected[index];
  const label = `[${index + 1}/${selected.length}] ${item.title || item.package}`;
  try {
    const started = await json(`/api/admin/templates/${item.id}/netdisk/sync`, {
      method: "POST",
      body: { provider },
    });
    if (!started?.taskId) throw new Error(started?.message || "未返回任务 ID");
    if (started.status === "failed") throw new Error(started.message || "同步启动失败");

    const task = await waitTask(started.taskId);
    if (task.status !== "success") throw new Error(task.error || task.message || `任务状态 ${task.status}`);
    console.log(`${label} ✓ ${task.result?.shortLink || task.result?.url || ""}`);
    results.push({ ...item, sync: "success", taskId: task.id, result: task.result || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${label} ✘ ${message}`);
    results.push({ ...item, sync: "failed", error: message });
  }
  await writeFile(
    resolve(args.out || reportPath.replace(/\.json$/i, "-sync.json")),
    JSON.stringify({ api, provider, generatedAt: new Date().toISOString(), results }, null, 2),
    "utf8",
  );
  if (index < selected.length - 1) await sleep(400);
}

const success = results.filter((item) => item.sync === "success").length;
const failed = results.length - success;
console.log(`\n同步完成：成功 ${success}，失败 ${failed}`);

if (shouldPublish && success > 0) {
  const ids = results.filter((item) => item.sync === "success").map((item) => item.id);
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50);
    await json("/api/admin/templates/bulk", { method: "POST", body: { ids: chunk, action: "publish" } });
  }
  console.log(`已批量上架 ${ids.length} 个模板`);
}

if (failed > 0) process.exitCode = 1;

async function login() {
  const data = await json("/api/admin/login", { method: "POST", body: { username, password }, auth: false });
  if (!data?.token) throw new Error("管理员登录失败：未返回 token");
  return data.token;
}

async function waitTask(taskId) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const task = await json(`/api/admin/tasks/${taskId}`);
    if (task.status === "success" || task.status === "failed") return task;
    await sleep(2000);
  }
  throw new Error("同步任务超时（10 分钟）");
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
  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`);
  }
  return payload;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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
