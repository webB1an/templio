#!/usr/bin/env node
import { Command } from "commander";
import { runDoctor } from "./commands/doctor.js";
import { runRender } from "./commands/render.js";
import { runStatus } from "./commands/status.js";
import { runUpload } from "./commands/upload.js";

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
    process.exitCode = ok ? 0 : 1;
  });

program
  .command("render")
  .description("批量渲染模板为物料包（PPT/Word → 封面/缩略图/预览 + manifest）")
  .argument("<srcDir>", "模板源目录（递归扫描 .pptx / .docx）")
  .option("-o, --out <dir>", "物料包输出目录", "dist-packages")
  .option("--preview-pages <n>", "预览页数量（含封面页）", "4")
  .option("--render-width <px>", "PDF 渲染宽度（像素）", "1600")
  .option("--concurrency <n>", "并发数", "2")
  .option("--force", "忽略渲染记录，强制重跑", false)
  .action(
    async (
      srcDir: string,
      options: {
        out: string;
        previewPages: string;
        renderWidth: string;
        concurrency: string;
        force: boolean;
      },
    ) => {
      const code = await runRender({
        srcDir,
        outDir: options.out,
        previewPages: positiveInt(options.previewPages, 4),
        renderWidth: positiveInt(options.renderWidth, 1600),
        concurrency: positiveInt(options.concurrency, 2),
        force: Boolean(options.force),
      });
      process.exitCode = code;
    },
  );

program
  .command("status")
  .description("检查物料包完整性")
  .argument("[distDir]", "物料包目录", "dist-packages")
  .action(async (distDir: string) => {
    process.exitCode = await runStatus(distDir);
  });

program
  .command("upload")
  .description("上传物料包到服务端（管理端导入接口）")
  .argument("<distDir>", "物料包目录（templio render 的输出）")
  .option("--api <url>", "服务端地址", process.env.TEMPLIO_API || "https://templio.wdbzk.com")
  .option("--username <name>", "管理员账号", process.env.TEMPLIO_ADMIN_USERNAME || "admin")
  .option(
    "--password <password>",
    "管理员密码（建议用 TEMPLIO_ADMIN_PASSWORD 环境变量）",
    process.env.TEMPLIO_ADMIN_PASSWORD,
  )
  .option("--token <token>", "管理员登录 token（可选）", process.env.TEMPLIO_ADMIN_TOKEN)
  .option("--limit <n>", "最多上传数量")
  .option("--with-source", "同时上传源文件（暂存服务器，网盘同步后删除）", false)
  .option("--dry-run", "只列出待上传物料包", false)
  .action(
    async (
      distDir: string,
      options: {
        api: string;
        username: string;
        password?: string;
        token?: string;
        limit?: string;
        withSource: boolean;
        dryRun: boolean;
      },
    ) => {
      const code = await runUpload({
        distDir,
        api: options.api,
        username: options.username,
        password: options.password,
        token: options.token,
        limit: options.limit ? positiveInt(options.limit, 0) || undefined : undefined,
        dryRun: Boolean(options.dryRun),
        withSource: Boolean(options.withSource),
      });
      process.exitCode = code;
    },
  );

program
  .command("fixtures")
  .description("生成合成测试模板（开发用）")
  .option("-o, --out <dir>", "输出目录", "fixtures/samples")
  .action(async (options: { out: string }) => {
    const { runFixtures } = await import("./commands/fixtures.js");
    process.exitCode = await runFixtures(options.out);
  });

await program.parseAsync(process.argv);

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
