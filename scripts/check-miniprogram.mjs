#!/usr/bin/env node
/**
 * 小程序静态检查（不依赖微信开发者工具）：
 * 1. app.json 每个页面四件套齐全
 * 2. 所有 JSON 可解析
 * 3. 所有 JS 语法正确（node --check）
 * 4. WXML 标签闭合
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const miniRoot = join(repoRoot, "apps", "miniprogram");
const errors = [];

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const appJson = JSON.parse(readFileSync(join(miniRoot, "app.json"), "utf8"));
for (const page of appJson.pages) {
  for (const ext of [".js", ".json", ".wxml", ".wxss"]) {
    try {
      readFileSync(join(miniRoot, `${page}${ext}`));
    } catch {
      errors.push(`缺少页面文件：${page}${ext}`);
    }
  }
}

for (const file of walk(miniRoot)) {
  if (file.endsWith(".json")) {
    try {
      JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(`JSON 解析失败：${file}（${error.message}）`);
    }
  }

  if (file.endsWith(".js")) {
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (error) {
      errors.push(`JS 语法错误：${file}（${String(error.stderr || error.message).trim()}）`);
    }
  }

  if (file.endsWith(".wxml")) {
    const source = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const stack = [];
    const tagPattern = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    let match;
    while ((match = tagPattern.exec(source))) {
      const [, closing, name, , selfClosing] = match;
      if (selfClosing) continue;
      if (closing) {
        const top = stack.pop();
        if (top !== name) {
          errors.push(`WXML 标签不匹配：${file}（期望 </${top}>，实际 </${name}>）`);
          break;
        }
      } else {
        stack.push(name);
      }
    }
    if (stack.length > 0) {
      errors.push(`WXML 未闭合标签：${file}（${stack.join(", ")}）`);
    }
  }
}

if (errors.length > 0) {
  console.error(`小程序检查失败（${errors.length} 项）：`);
  for (const error of errors) console.error(`  ✘ ${error}`);
  process.exit(1);
}

console.log(`✔ 小程序检查通过（${appJson.pages.length} 个页面）`);
