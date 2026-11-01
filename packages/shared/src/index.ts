/**
 * Templio 跨端契约
 *
 * 桌面 CLI、服务端、管理端、小程序共用这里的枚举、物料包 schema 与图片规格。
 * 任何一端改契约，必须同步改这里并重新构建。
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* 枚举                                                                        */
/* -------------------------------------------------------------------------- */

export const TEMPLATE_FORMATS = ["pptx", "docx"] as const;
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number];

export const TEMPLATE_STATUSES = [
  "draft",
  "imported",
  "ai_processing",
  "pending_review",
  "published",
  "rejected",
  "archived",
  "failed",
] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const NETDISK_PROVIDERS = ["baidu", "quark"] as const;
export type NetdiskProvider = (typeof NETDISK_PROVIDERS)[number];

export const NETDISK_LINK_STATUSES = ["pending", "synced", "invalid"] as const;
export type NetdiskLinkStatus = (typeof NETDISK_LINK_STATUSES)[number];

export const TASK_TYPES = ["netdisk_sync", "ai_classify"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ["queued", "running", "success", "failed", "skipped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const RENDER_ENGINES = ["libreoffice", "office-com"] as const;
export type RenderEngine = (typeof RENDER_ENGINES)[number];

/* -------------------------------------------------------------------------- */
/* 常量                                                                        */
/* -------------------------------------------------------------------------- */

export const PACKAGE_VERSION = 1 as const;

/**
 * 资源受限版图片规格（无 CDN / 2C2G 服务器）
 * 见 docs/03-资源受限部署修订.md §3
 */
export const IMAGE_SPEC = {
  thumb: { width: 360, height: 480, quality: 78, maxBytes: 30 * 1024 },
  cover: { width: 800, height: 1067, quality: 82, maxBytes: 120 * 1024 },
  preview: { width: 800, quality: 80, maxBytes: 80 * 1024 },
} as const;

/** 单模板图片体积预算（约 450–550KB） */
export const TEMPLATE_IMAGE_BUDGET_BYTES =
  IMAGE_SPEC.thumb.maxBytes +
  IMAGE_SPEC.cover.maxBytes +
  IMAGE_SPEC.preview.maxBytes * 4;

/** 源文件临时区硬配额：超过则暂停接收新上传（见 docs/03 §2） */
export const INCOMING_QUOTA_BYTES = 8 * 1024 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* 工具                                                                        */
/* -------------------------------------------------------------------------- */

const HEX64_RE = /^[a-f0-9]{64}$/i;

export const sha256HexSchema = z
  .string()
  .trim()
  .regex(HEX64_RE, "需要 64 位 sha256 hex");

/** 取 hash 前 n 位，用于目录名与文件名 */
export function shortHash(hash: string, len = 8): string {
  return hash.replace(/^[^a-f0-9]*/i, "").slice(0, len).toLowerCase();
}

/** 把标题/文件名清洗成目录名（保留中文，替换非法字符） */
export function slugify(input: string, maxLen = 40): string {
  const cleaned = input
    .replace(/\.[a-z0-9]{1,6}$/i, "")
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const value = cleaned || "template";
  return value.slice(0, maxLen);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

/* -------------------------------------------------------------------------- */
/* text.json                                                                   */
/* -------------------------------------------------------------------------- */

export const templateTextSchema = z.object({
  /** 从 OOXML 抽取：文档标题/首屏标题 */
  title: z.string().trim().max(200).optional(),
  /** 目录/大纲 */
  outline: z.array(z.string().trim()).max(100).default([]),
  /** 前几页文字（供 AI 分类与标题生成） */
  firstPagesText: z.array(z.string()).max(12).default([]),
  slideCount: z.number().int().nonnegative().optional(),
  wordCount: z.number().int().nonnegative().optional(),
});
export type TemplateText = z.infer<typeof templateTextSchema>;

/* -------------------------------------------------------------------------- */
/* manifest.json                                                               */
/* -------------------------------------------------------------------------- */

export const templateManifestSchema = z.object({
  packageVersion: z.literal(PACKAGE_VERSION),
  sourceHash: sha256HexSchema,
  /** 相对物料包根目录的源文件路径 */
  sourceFile: z.string().min(1),
  sourceBytes: z.number().int().positive(),
  format: z.enum(["pptx", "docx"]),
  pageCount: z.number().int().positive(),
  /** 文件名清洗后的兜底标题（AI 失败时使用） */
  titleGuess: z.string().trim().min(1).max(120),
  textFile: z.string().min(1).default("text.json"),
  images: z.object({
    cover: z.string().min(1),
    thumb: z.string().min(1),
    previews: z.array(z.string().min(1)).min(1).max(8),
  }),
  renderer: z.object({
    engine: z.enum(["libreoffice", "office-com"]).default("libreoffice"),
    version: z.string().optional(),
    pdfDpi: z.number().int().positive().default(144),
  }),
  /** 渲染告警：字体缺失、页数异常等，管理端展示 */
  warnings: z.array(z.string()).max(20).default([]),
  generatedAt: z.string().datetime({ offset: true }),
});
export type TemplateManifest = z.infer<typeof templateManifestSchema>;

/** 解析并校验 manifest，失败时抛出中文错误 */
export function parseManifest(value: unknown): TemplateManifest {
  const result = templateManifestSchema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`manifest.json 不合法：${detail}`);
  }
  return result.data;
}
