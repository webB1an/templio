export type TemplateStatus =
  | "draft"
  | "imported"
  | "ai_processing"
  | "pending_review"
  | "published"
  | "rejected"
  | "archived"
  | "failed";

export interface AiAnalysis {
  title: string | null;
  categoryKey: string | null;
  tags: string[];
  summary: string | null;
  confidence: number | null;
  safe: boolean;
  needsReview: boolean;
  model: string | null;
}

export interface AdminTemplate {
  id: string;
  title: string;
  description: string;
  status: TemplateStatus;
  format: string;
  pageCount: number;
  fileSize: number;
  viewCount: number;
  copyCount: number;
  category: { id: string; name: string; key: string } | null;
  tags: string[];
  coverUrl: string | null;
  shortCode: string | null;
  shortLink: string | null;
  netdiskUrl: string | null;
  provider: string | null;
  passcode: string | null;
  hasNetdisk: boolean;
  ai: AiAnalysis | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateList {
  items: AdminTemplate[];
  total: number;
}

export interface Stats {
  total: number;
  byStatus: Record<string, number>;
  categories: Array<{ key: string; name: string; count: number }>;
}

export interface Facets {
  categories: Array<{ id: string; key: string; name: string }>;
  tags: Array<{ id: string; name: string; type: string }>;
}
