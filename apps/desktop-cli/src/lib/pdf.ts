import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const standardFontDataUrl = pathToFileURL(join(pdfjsRoot, "standard_fonts") + "/").href;

export interface RenderedPdfPage {
  pageNumber: number;
  /** 输出图片尺寸 */
  width: number;
  height: number;
  /** PDF 原始页面宽度（pt，scale=1），用于折算等效 DPI */
  baseWidth: number;
  baseHeight: number;
  png: Buffer;
}

export interface RenderedPdf {
  numPages: number;
  pages: RenderedPdfPage[];
}

export interface RenderPdfOptions {
  /** 渲染宽度（像素） */
  width: number;
  /** 最多渲染前几页（含封面页） */
  maxPages: number;
}

/** 从 PDF 提取前几页可读文字；比手工解析损坏的 OOXML 更可靠 */
export async function extractPdfText(pdfBytes: Buffer, maxPages = 3): Promise<string[]> {
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
    standardFontDataUrl,
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  try {
    const count = Math.min(Math.max(1, maxPages), document.numPages);
    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) pages.push(text.slice(0, 1500));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

/**
 * PDF → PNG。
 * 用 pdfjs 的 legacy 构建：在 Node.js 环境下官方要求 legacy 版本，
 * 否则会因缺少 Web API 报 `hashOriginal.toHex is not a function`。
 */
export async function renderPdfPages(pdfBytes: Buffer, options: RenderPdfOptions): Promise<RenderedPdf> {
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
    standardFontDataUrl,
  });

  const document = await loadingTask.promise;
  try {
    const numPages = document.numPages;
    const count = Math.min(Math.max(1, options.maxPages), numPages);
    const pages: RenderedPdfPage[] = [];

    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = options.width / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));

      const canvas = createCanvas(width, height);
      const renderParams = {
        canvas: canvas as unknown as Parameters<typeof page.render>[0]["canvas"],
        viewport,
      };
      await page.render(renderParams).promise;

      pages.push({
        pageNumber,
        width,
        height,
        baseWidth: baseViewport.width,
        baseHeight: baseViewport.height,
        png: await canvas.encode("png"),
      });
      page.cleanup();
    }

    return { numPages, pages };
  } finally {
    await loadingTask.destroy();
  }
}
