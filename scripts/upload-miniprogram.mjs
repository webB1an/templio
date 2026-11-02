#!/usr/bin/env node
/**
 * 微信小程序体验版上传。
 * 用法（本地/CI）：
 *   WX_APPID=wx... WX_PRIVATE_KEY_PATH=./private.key node scripts/upload-miniprogram.mjs --version 0.1.0 --desc "模板宝 体验版"
 *   node scripts/upload-miniprogram.mjs --dry-run
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const args = parseArgs(process.argv.slice(2));
const projectPath = resolve(args.project || "apps/miniprogram");

if (!existsSync(resolve(projectPath, "project.config.json"))) {
  fail(`找不到小程序项目：${projectPath}`);
}

const projectConfig = JSON.parse(readFileSync(resolve(projectPath, "project.config.json"), "utf8"));
const appid = process.env.WX_APPID || projectConfig.appid;
const keyPath = process.env.WX_PRIVATE_KEY_PATH || args["private-key-path"] || "";
const version = args.version || process.env.MINIPROGRAM_VERSION || "0.1.0";
const desc = args.desc || process.env.MINIPROGRAM_DESC || "模板宝 体验版";
const dryRun = Boolean(args["dry-run"]);

if (!appid) fail("缺少 AppID：请设置 WX_APPID 或检查 project.config.json");
if (!dryRun && !keyPath) fail("缺少上传密钥：请设置 WX_PRIVATE_KEY_PATH 或传 --private-key-path");
if (!dryRun && !existsSync(keyPath)) fail(`上传密钥不存在：${keyPath}`);

console.log("模板宝小程序上传");
console.log(`  appid:   ${appid}`);
console.log(`  project: ${projectPath}`);
console.log(`  version: ${version}`);
console.log(`  desc:    ${desc}`);
console.log(`  key:     ${keyPath ? keyPath : "（dry-run 未提供）"}`);

if (dryRun) {
  console.log("✔ dry-run：配置检查通过（不执行上传）");
  process.exit(0);
}

const ci = require("miniprogram-ci");
const project = new ci.Project({
  appid,
  type: "miniProgram",
  projectPath,
  privateKeyPath: keyPath,
  ignores: ["node_modules/**/*", "**/*.map"]
});

let lastPercent = -1;
ci.upload({
  project,
  version,
  desc,
  robot: Number(process.env.WX_ROBOT || 1),
  setting: {
    es6: true,
    es7: true,
    minify: true,
    autoPrefixWXSS: true
  },
  onProgressUpdate: (task) => {
    const percent = typeof task === "string" ? null : task && task._msg;
    if (percent) console.log(`  ${percent}`);
  }
})
  .then((result) => {
    console.log("✔ 上传成功");
    if (result && result.subPackageInfo) {
      console.log(JSON.stringify(result.subPackageInfo, null, 2));
    }
  })
  .catch((error) => {
    fail(error && error.message ? error.message : String(error));
  });

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function fail(message) {
  console.error(`✘ ${message}`);
  process.exit(1);
}
