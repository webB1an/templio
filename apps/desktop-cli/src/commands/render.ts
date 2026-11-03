import { readdir, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import type { TemplateFormat } from "@templio/shared";
import { makeCover, makePreview, makeThumb } from "../lib/images.js";
import { ensureDir } from "../lib/fsx.js";
import { filterUnknownFonts } from "../lib/fonts.js";
import { sha256File } from "../lib/hash.js";
import { extractOoxmlText } from "../lib/ooxml.js";
import {
  appendLedger,
  isPackageComplete,
  loadLedger,
  writeRenderedPackage,
} from "../lib/package.js";
import { renderPdfPages, extractPdfText } from "../lib/pdf.js";
import { convertToPdf, findSoffice, readSofficeVersion } from "../lib/soffice.js";

export interface RenderCommandOptions {
  srcDir: string;
  outDir: string;
  previewPages: number;
  renderWidth: number;
  concurrency: number;
  force: boolean;
}

interface SourceFile {
  path: string;
  format: TemplateFormat;
}

interface Failure {
  path: string;
  error: string;
}

export async function runRender(options: RenderCommandOptions): Promise<number> {
  const srcDir = resolve(options.srcDir);
  const distDir = resolve(options.outDir);
  const relativeOutput = relative(srcDir, distDir);
  if (!relativeOutput || (!relativeOutput.startsWith("..") && !isAbsolute(relativeOutput))) {
    console.error("✘ 输出目录不能放在源目录内部，否则下次会扫描到生成的 source 文件。");
    return 1;
  }
  const previewPages = Math.min(8, Math.max(1, options.previewPages));

  const soffice = await findSoffice();
  if (!soffice) {
    console.error("✘ 未找到 LibreOffice，请先运行 `templio doctor` 检查环境。");
    return 1;
  }
  const sofficeVersion = await readSofficeVersion(soffice);

  const files = await scanTemplates(srcDir);
  if (files.length === 0) {
    console.log(`未在 ${srcDir} 找到 .pptx / .docx 文件`);
    return 0;
  }

  await ensureDir(distDir);
  const ledger = await loadLedger(distDir);

  console.log(`Templio 渲染：${files.length} 个模板 → ${distDir}`);
  console.log(
    `LibreOffice ${sofficeVersion} · 并发 ${options.concurrency} · 预览 ${previewPages} 页 · 渲染宽度 ${options.renderWidth}px\n`,
  );

  const failures: Failure[] = [];
  let succeeded = 0;
  let skipped = 0;
  let cursor = 0;
  let done = 0;

  const processOne = async (file: SourceFile): Promise<void> => {
    const position = ++cursor;
    const label = `[${position}/${files.length}] ${basename(file.path)}`;
    const startedAt = Date.now();
    let sourceHash = "";

    try {
      sourceHash = await sha256File(file.path);
      const previous = ledger.get(sourceHash);
      if (
        !options.force &&
        previous?.status === "rendered" &&
        previous.packageDir &&
        (await isPackageComplete(previous.packageDir))
      ) {
        skipped += 1;
        console.log(`${label} 跳过（已渲染）`);
        return;
      }

      const sourceStat = await stat(file.path);
      const { text: ooxmlText, fonts } = await extractOoxmlText(file.path, file.format);

      const warnings: string[] = [];
      const unknownFonts = filterUnknownFonts(fonts);
      if (unknownFonts.length > 0) {
        warnings.push(
          `模板使用非常用字体：${unknownFonts.slice(0, 10).join("、")}${unknownFonts.length > 10 ? " 等" : ""}（渲染前请确认已安装）`,
        );
      }

      const pdfBytes = await convertToPdf(soffice, file.path, { timeoutMs: 300_000 });
      // 部分第三方 PPTX 的 <a:t> 会夹杂 XML/几何噪声；优先用真实 PDF 文字作为
      // 标题、简介和 AI 输入，避免详情页出现大段乱码。
      const pdfPages = await extractPdfText(pdfBytes, 3);
      const text = {
        ...ooxmlText,
        firstPagesText: pdfPages.length > 0 ? pdfPages : ooxmlText.firstPagesText,
        outline: pdfPages.length > 0 ? pdfPages.map((page) => page.slice(0, 60)) : ooxmlText.outline,
      };
      if (text.firstPagesText.length === 0) {
        warnings.push("未从模板中抽取到文字，AI 分类准确率可能受影响");
      }

      const rendered = await renderPdfPages(pdfBytes, {
        width: options.renderWidth,
        maxPages: previewPages,
      });
      const firstPage = rendered.pages[0];
      if (!firstPage) throw new Error("PDF 没有可渲染页面");

      const cover = await makeCover(firstPage.png);
      const thumb = await makeThumb(firstPage.png);
      const previews: Buffer[] = [];
      for (const page of rendered.pages) {
        previews.push(await makePreview(page.png));
      }

      const effectiveDpi = Math.round((options.renderWidth / firstPage.baseWidth) * 72);
      const written = await writeRenderedPackage(distDir, {
        sourcePath: file.path,
        sourceBytes: sourceStat.size,
        sourceHash,
        format: file.format,
        text,
        pageCount: rendered.numPages,
        renderer: { engine: "libreoffice", version: sofficeVersion, pdfDpi: effectiveDpi },
        cover,
        thumb,
        previews,
        warnings,
      });

      await appendLedger(distDir, {
        sourceHash,
        sourcePath: file.path,
        status: "rendered",
        packageDir: written.packageDir,
        warnings,
        at: new Date().toISOString(),
      });
      // 同步更新内存账本：同一批次里内容相同的模板后续直接跳过，
      // 否则会重复渲染并覆盖同名物料包。
      ledger.set(sourceHash, {
        sourceHash,
        sourcePath: file.path,
        status: "rendered",
        packageDir: written.packageDir,
        warnings,
        at: new Date().toISOString(),
      });

      succeeded += 1;
      done += 1;
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `${label} ✓ ${rendered.numPages}页  cover=${(cover.length / 1024).toFixed(0)}KB  thumb=${(thumb.length / 1024).toFixed(0)}KB  preview=${previews.length}张  (${seconds}s)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (sourceHash) {
        await appendLedger(distDir, {
          sourceHash,
          sourcePath: file.path,
          status: "failed",
          error: message,
          at: new Date().toISOString(),
        }).catch(() => undefined);
      }
      failures.push({ path: file.path, error: message });
      console.log(`${label} ✘ ${message}`);
    }
  };

  await runPool(files, Math.max(1, options.concurrency), processOne);

  console.log(
    `\n完成：成功 ${succeeded}，跳过 ${skipped}，失败 ${failures.length}（已渲染 ${done}/${files.length}）`,
  );
  if (failures.length > 0) {
    console.log("\n失败清单：");
    for (const failure of failures) {
      console.log(`  ✘ ${failure.path}\n    ${failure.error}`);
    }
    return 1;
  }
  return 0;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function scanTemplates(root: string): Promise<SourceFile[]> {
  const results: SourceFile[] = [];

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith("~$") || entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const ext = extname(entry.name).toLowerCase();
      if (ext === ".pptx") results.push({ path: fullPath, format: "pptx" });
      else if (ext === ".docx") results.push({ path: fullPath, format: "docx" });
    }
  };

  await walk(root);
  return results;
}
