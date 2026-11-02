export type TemplateStatus =
  | "draft"
  | "imported"
  | "ai_processing"
  | "pending_review"
  | "published"
  | "rejected"
  | "archived"
  | "failed";

export interface BackupInfo {
  filename: string;
  at: string;
  sizeMb: number;
  ageHours: number;
}

export interface SystemStatus {
  node: string;
  platform: string;
  uptimeSeconds: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  disk: { totalGb: number; freeGb: number; usedPercent: number };
  backups: { mysql: BackupInfo | null; storage: BackupInfo | null };
  version: string;
  commit: string;
}

export interface AdminTask {
  id: string;
  type: string;
  status: "queued" | "running" | "success" | "failed" | "skipped";
  progress: number;
  message: string | null;
  error: string | null;
  result: unknown;
  createdAt: string;
  updatedAt: string;
}

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
  source: { filename: string; size: number; sizeText: string } | null;
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

export interface TopTemplate {
  id: string;
  title: string;
  category: string;
  viewCount: number;
  copyCount: number;
  favoriteCount: number;
  coverUrl: string | null;
}

export interface Stats {
  total: number;
  byStatus: Record<string, number>;
  categories: Array<{ key: string; name: string; count: number }>;
  views: number;
  copies: number;
  favorites: number;
  today: { views: number; copies: number; clicks: number };
  pendingReview: number;
  trend: Array<{ date: string; views: number; copies: number }>;
  topTemplates: TopTemplate[];
}

export interface Facets {
  categories: Array<{ id: string; key: string; name: string }>;
  tags: Array<{ id: string; name: string; type: string }>;
}
