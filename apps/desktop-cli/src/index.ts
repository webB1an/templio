#!/usr/bin/env node
import { Command } from "commander";
import { runDoctor } from "./commands/doctor.js";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("templio")
  .description("Templio 模板加工 CLI：PPT/Word → 封面/缩略图/预览 → 标准物料包")
  .version(VERSION);

program
  .command("doctor")
  .description("检查本机渲染环境（LibreOffice、中文字体、Node、图片预算）")
  .action(async () => {
    const ok = await runDoctor();
    process.exit(ok ? 0 : 1);
  });

program
  .command("render")
  .description("批量渲染模板为物料包（P0-2 实现）")
  .argument("<srcDir>", "模板源目录")
  .option("-o, --out <dir>", "物料包输出目录", "dist-packages")
  .option("--preview-pages <n>", "预览页数量", "4")
  .option("--dpi <n>", "PDF 渲染 DPI", "144")
  .option("--force", "忽略已渲染记录，强制重跑", false)
  .action(async () => {
    console.error("render 命令将在 P0-2 实现；请先运行 `templio doctor` 确认渲染环境。");
    process.exit(2);
  });

program
  .command("status")
  .description("查看物料包渲染/上传状态（P0-2 实现）")
  .argument("[distDir]", "物料包目录", "dist-packages")
  .action(async () => {
    console.error("status 命令将在 P0-2 实现。");
    process.exit(2);
  });

await program.parseAsync(process.argv);
