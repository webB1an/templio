import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  parseManifest,
  shortHash,
  slugify,
  templateTextSchema,
  type TemplateFormat,
  type TemplateManifest,
  type TemplateText,
} from "@templio/shared";
import { appendJsonLine, ensureDir, pathExists, writeJsonAtomic } from "./fsx.js";

export const LEDGER_FILENAME = ".ledger.jsonl";

export interface RendererInfo {
  engine: "libreoffice" | "office-com";
  version?: string;
  pdfDpi: number;
}

export interface PackageInput {
  sourcePath: string;
  sourceBytes: number;
  sourceHash: string;
  format: TemplateFormat;
  text: TemplateText;
  pageCount: number;
  renderer: RendererInfo;
  cover: Buffer;
  thumb: Buffer;
  previews: Buffer[];
  warnings: string[];
}

export interface LedgerEntry {
  sourceHash: string;
  sourcePath: string;
  status: "rendered" | "failed";
  packageDir?: string;
  warnings?: string[];
  error?: string;
  at: string;
}

export function packageDirectoryName(sourceHash: string, sourcePath: string): string {
  return `${shortHash(sourceHash, 8)}-${slugify(basename(sourcePath), 32)}`;
}

export async function loadLedger(distDir: string): Promise<Map<string, LedgerEntry>> {
  const ledger = new Map<string, LedgerEntry>();
  const file = join(distDir, LEDGER_FILENAME);
  if (!(await pathExists(file))) return ledger;
  const content = await readFile(file, "utf8").catch(() => "");
  for (const line of content.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    try {
      const entry = JSON.parse(text) as LedgerEntry;
      if (entry?.sourceHash) ledger.set(entry.sourceHash, entry);
    } catch {
      // 跳过损坏行
    }
  }
  return ledger;
}

export async function appendLedger(distDir: string, entry: LedgerEntry): Promise<void> {
  await appendJsonLine(join(distDir, LEDGER_FILENAME), entry);
}

export async function isPackageComplete(packageDir: string): Promise<boolean> {
  const manifestExists = await pathExists(join(packageDir, "manifest.json"));
  if (!manifestExists) return false;
  return (
    (await pathExists(join(packageDir, "text.json"))) &&
    (await pathExists(join(packageDir, "images", "cover.webp"))) &&
    (await pathExists(join(packageDir, "images", "thumb.webp")))
  );
}

export function titleGuessFromSource(sourcePath: string, text: TemplateText): string {
  const fromText = text.title?.trim();
  if (fromText) return fromText.slice(0, 120);
  const filename = basename(sourcePath).replace(/\.[^.]+$/, "");
  const cleaned = filename.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "未命名模板").slice(0, 120);
}

export interface WrittenPackage {
  packageDir: string;
  manifest: TemplateManifest;
}

/** 写入标准物料包：source/ + images/ + text.json + manifest.json */
export async function writeRenderedPackage(distDir: string, input: PackageInput): Promise<WrittenPackage> {
  const packageDir = join(distDir, packageDirectoryName(input.sourceHash, input.sourcePath));
  await rm(packageDir, { recursive: true, force: true });

  const imagesDir = join(packageDir, "images");
  const sourceDir = join(packageDir, "source");
  await ensureDir(imagesDir);
  await ensureDir(sourceDir);

  const sourceName = basename(input.sourcePath);
  await copyFile(input.sourcePath, join(sourceDir, sourceName));

  const coverName = "cover.webp";
  const thumbName = "thumb.webp";
  await writeFile(join(imagesDir, coverName), input.cover);
  await writeFile(join(imagesDir, thumbName), input.thumb);

  const previewNames: string[] = [];
  for (let index = 0; index < input.previews.length; index += 1) {
    const name = `preview-${String(index + 1).padStart(2, "0")}.webp`;
    await writeFile(join(imagesDir, name), input.previews[index]!);
    previewNames.push(`images/${name}`);
  }

  const text = templateTextSchema.parse(input.text);
  await writeJsonAtomic(join(packageDir, "text.json"), text);

  const manifest = parseManifest({
    packageVersion: 1,
    sourceHash: input.sourceHash,
    sourceFile: `source/${sourceName}`,
    sourceBytes: input.sourceBytes,
    format: input.format,
    pageCount: input.pageCount,
    titleGuess: titleGuessFromSource(input.sourcePath, text),
    textFile: "text.json",
    images: {
      cover: `images/${coverName}`,
      thumb: `images/${thumbName}`,
      previews: previewNames,
    },
    renderer: input.renderer,
    warnings: input.warnings,
    generatedAt: new Date().toISOString(),
  });

  await writeJsonAtomic(join(packageDir, "manifest.json"), manifest);
  return { packageDir, manifest };
}
