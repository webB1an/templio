#!/usr/bin/env node
/**
 * 单个批次流水线：render → upload（带源文件）→ 网盘同步。
 *
 * 用法：
 *   TEMPLIO_ADMIN_PASSWORD=xxx node scripts/run-batch.mjs --batch b001
 *
 * 常用选项：
 *   --plan C:\...\plan.json
 *   --preview-pages 4
 *   --provider quark
 *   --skip-render / --skip-upload / --skip-sync
 *   --publish
 *   --limit 20       试点时限制上传/同步数量
 */
import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const planPath = resolve(args.plan || "C:\\Users\\Admin\\Desktop\\templio-batches\\plan.json");
const plan = JSON.parse(await readFile(planPath, "utf8"));
const batchId = args.batch || "b001";
const batch = plan.batches.find((item) => item.id === batchId);
if (!batch) throw new Error(`plan 中没有批次 ${batchId}`);

const api = (args.api || process.env.TEMPLIO_API || "https://templio.wdbzk.com").replace(/\/+$/, "");
const password = process.env.TEMPLIO_ADMIN_PASSWORD || "";
const previewPages = args["preview-pages"] || "4";
const reportPath = resolve(args.report || join(plan.outDir, "reports", `${batchId}-upload.json`));
const syncReportPath = reportPath.replace(/\.json$/i, "-sync.json");
const cli = resolve("apps/desktop-cli/dist/index.js");
if (!password) throw new Error("缺少 TEMPLIO_ADMIN_PASSWORD");

console.log(`批次 ${batch.id}：${batch.files.length} 个模板 / ${(batch.bytes / 1024 ** 3).toFixed(2)}GB`);
console.log(`源目录：${batch.sourceDir}`);
console.log(`输出目录：${batch.outputDir}`);

if (!args["skip-render"]) {
  await run(
    process.execPath,
    [
      cli,
      "render",
      batch.sourceDir,
      "--out",
      batch.outputDir,
      "--preview-pages",
      String(previewPages),
      "--force",
    ],
    {},
    { allowFailure: true },
  );
}

if (!args["skip-upload"]) {
  await mkdir(dirname(reportPath), { recursive: true });
  const uploadArgs = [
    cli,
    "upload",
    batch.outputDir,
    "--api",
    api,
    "--with-source",
    "--report",
    reportPath,
  ];
  if (args.limit) uploadArgs.push("--limit", String(args.limit));
  await run(process.execPath, uploadArgs, { TEMPLIO_ADMIN_PASSWORD: password }, { allowFailure: true });
  await access(reportPath, constants.R_OK).catch(() => {
    throw new Error(`上传报告不存在，上传可能完全失败：${reportPath}`);
  });
  if (!args["skip-title-fix"]) {
    // PPT 内部标题经常是“PowerPoint 演示文稿/淘宝店名”等占位文本，
    // 同步/上架前统一改成源文件名。
    await run(
      process.execPath,
      [
        resolve("scripts/normalize-titles.mjs"),
        "--report",
        reportPath,
        "--plan",
        planPath,
        "--batch",
        batch.id,
        "--api",
        api,
      ],
      { TEMPLIO_ADMIN_PASSWORD: password },
      { allowFailure: true },
    );
  }
}

if (!args["skip-sync"]) {
  const syncArgs = [
    resolve("scripts/sync-batch.mjs"),
    "--report",
    reportPath,
    "--api",
    api,
    "--provider",
    args.provider || "quark",
  ];
  if (args.limit) syncArgs.push("--limit", String(args.limit));
  if (args.publish) syncArgs.push("--publish");
  await run(process.execPath, syncArgs, { TEMPLIO_ADMIN_PASSWORD: password }, { allowFailure: true });
}

console.log(`\n批次 ${batch.id} 完成`);
console.log(`上传报告：${reportPath}`);
console.log(`同步报告：${syncReportPath}`);
console.log("请确认源文件已删除后，再删除本地批次输出目录，继续下一批。");

function run(command, commandArgs, env = {}, options = {}) {
  return new Promise((resolvePromise, reject) => {
    console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
    const child = spawn(command, commandArgs, {
      cwd: resolve("."),
      env: { ...process.env, ...env },
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(0);
        return;
      }
      if (options.allowFailure) {
        console.warn(`⚠ 命令退出码 ${code}，继续后续步骤（失败项见日志）`);
        resolvePromise(code);
        return;
      }
      reject(new Error(`命令退出码 ${code}`));
    });
  });
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
