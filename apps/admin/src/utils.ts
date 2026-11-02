export const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  imported: { label: "已导入", color: "blue" },
  ai_processing: { label: "AI 处理中", color: "purple" },
  pending_review: { label: "待复核", color: "orange" },
  published: { label: "已上架", color: "green" },
  rejected: { label: "已驳回", color: "red" },
  archived: { label: "已下架", color: "default" },
  failed: { label: "失败", color: "red" }
};

export const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, meta]) => ({
  value,
  label: meta.label
}));

export function formatTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}
