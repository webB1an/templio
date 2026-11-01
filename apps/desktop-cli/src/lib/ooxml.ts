import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { templateTextSchema, type TemplateFormat, type TemplateText } from "@templio/shared";

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

export interface OoxmlExtract {
  text: TemplateText;
  fonts: string[];
}

/**
 * 从 PPTX/DOCX 的 OOXML 里抽取文字与字体名。
 * 不依赖 Office：pptx/docx 本质是 zip + XML。
 */
export async function extractOoxmlText(filePath: string, format: TemplateFormat): Promise<OoxmlExtract> {
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const coreTitle = await readCoreTitle(zip);
  return format === "pptx" ? extractPptx(zip, coreTitle) : extractDocx(zip, coreTitle);
}

async function readCoreTitle(zip: JSZip): Promise<string> {
  const file = zip.file("docProps/core.xml");
  if (!file) return "";
  try {
    return findTitle(parser.parse(await file.async("string")))?.trim().slice(0, 120) ?? "";
  } catch {
    return "";
  }
}

function findTitle(node: unknown, depth = 0): string | undefined {
  if (!node || typeof node !== "object" || depth > 5) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTitle(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = node as Record<string, unknown>;
  const direct = record.title;
  if (typeof direct === "string" && direct.trim()) return direct;
  if (direct && typeof direct === "object") {
    const text = (direct as Record<string, unknown>)["#text"];
    if (typeof text === "string" && text.trim()) return text;
  }
  for (const value of Object.values(record)) {
    const found = findTitle(value, depth + 1);
    if (found) return found;
  }
  return undefined;
}

async function extractPptx(zip: JSZip, coreTitle: string): Promise<OoxmlExtract> {
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const firstPagesText: string[] = [];
  const outline: string[] = [];
  const fonts = new Set<string>();
  let totalChars = 0;
  let fallbackTitle = "";

  for (let index = 0; index < slideNames.length; index += 1) {
    const file = zip.file(slideNames[index]!);
    if (!file) continue;
    let xml = "";
    try {
      xml = await file.async("string");
    } catch {
      continue;
    }

    const texts: string[] = [];
    try {
      collectTextValues(parser.parse(xml), texts);
    } catch {
      // 个别损坏页跳过，不影响整包
    }
    const joined = normalizeText(texts.join(" "));

    if (joined) {
      if (index < 3) firstPagesText.push(joined.slice(0, 1500));
      outline.push(joined.slice(0, 60));
      totalChars += joined.length;
      if (!fallbackTitle) fallbackTitle = joined.slice(0, 120);
    }

    for (const match of xml.matchAll(/typeface="([^"]+)"/g)) {
      const font = decodeXmlEntities(match[1] ?? "").trim();
      if (font && !font.startsWith("+")) fonts.add(font);
    }
  }

  const fontList = [...fonts].slice(0, 30);
  const text = templateTextSchema.parse({
    title: coreTitle || fallbackTitle || undefined,
    outline: outline.slice(0, 100),
    firstPagesText,
    slideCount: slideNames.length,
    wordCount: totalChars,
    fonts: fontList,
  });
  return { text, fonts: fontList };
}

async function extractDocx(zip: JSZip, coreTitle: string): Promise<OoxmlExtract> {
  const documentFile = zip.file("word/document.xml");
  const xml = documentFile ? await documentFile.async("string") : "";

  const paragraphs: string[] = [];
  for (const chunk of xml.split(/<\/w:p>/i)) {
    const runs = [...chunk.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) =>
      decodeXmlEntities(match[1] ?? ""),
    );
    const joined = normalizeText(runs.join(""));
    if (joined) paragraphs.push(joined);
    if (paragraphs.length >= 500) break;
  }

  const fonts = new Set<string>();
  for (const match of xml.matchAll(/(?:ascii|eastAsia|hAnsi|cstheme)="([^"]+)"/g)) {
    const font = decodeXmlEntities(match[1] ?? "").trim();
    if (font && !font.startsWith("+")) fonts.add(font);
  }

  const fontList = [...fonts].slice(0, 30);
  const totalChars = paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
  const text = templateTextSchema.parse({
    title: coreTitle || paragraphs[0] || undefined,
    outline: paragraphs.slice(0, 30).map((paragraph) => paragraph.slice(0, 60)),
    firstPagesText: paragraphs.slice(0, 12).map((paragraph) => paragraph.slice(0, 400)),
    wordCount: totalChars,
    fonts: fontList,
  });
  return { text, fonts: fontList };
}

function collectTextValues(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectTextValues(item, out);
    return;
  }
  if (typeof node !== "object") return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "t") {
      if (typeof value === "string") out.push(value);
      else collectTextValues(value, out);
    } else {
      collectTextValues(value, out);
    }
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slideNumber(name: string): number {
  const match = name.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.toLowerCase().startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    const map: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    return map[code.toLowerCase()] ?? entity;
  });
}
