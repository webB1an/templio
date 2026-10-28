/** 模板管理相关类型（与后端 DTO 对齐） */

export type TemplateStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'offline' | 'banned';
export type TemplateFormat = 'ppt' | 'word' | 'excel' | 'pdf' | 'image' | 'archive' | 'other';
export type NetdiskType = 'quark' | 'baidu';

export const FORMAT_OPTIONS: { value: TemplateFormat; label: string }[] = [
  { value: 'ppt', label: 'PPT' },
  { value: 'word', label: 'Word' },
  { value: 'excel', label: 'Excel' },
  { value: 'pdf', label: 'PDF' },
  { value: 'image', label: '图片' },
  { value: 'archive', label: '压缩包' },
  { value: 'other', label: '其他' },
];

export const STATUS_OPTIONS: { value: TemplateStatus; label: string }[] = [
  { value: 'draft', label: '草稿' },
  { value: 'pending_review', label: '待审核' },
  { value: 'published', label: '已发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'offline', label: '已下架' },
  { value: 'banned', label: '已封禁' },
];

export const STATUS_COLORS: Record<TemplateStatus, string> = {
  draft: 'default',
  pending_review: 'processing',
  published: 'success',
  rejected: 'error',
  offline: 'warning',
  banned: 'error',
};

export function formatLabel(v: string) {
  return FORMAT_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function statusLabel(v: string) {
  return STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export interface TemplateFile {
  id: number;
  filename: string;
  netdiskType: NetdiskType;
  size: number | null;
  /** 仅详情接口返回，列表中不存在 */
  shareUrl?: string;
  checkStatus: string | null;
  checkMessage: string | null;
  checkAt: string | null;
}

export interface TemplateItem {
  id: number;
  title: string;
  summary: string | null;
  format: TemplateFormat;
  cover: string | null;
  previews: string[];
  status: TemplateStatus;
  baseCreditPrice: number;
  copyrightSource: string | null;
  authorizationNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  files?: TemplateFile[];
  categories: { category: { id: number; name: string; dimension: string } }[];
  tags: { tag: { id: number; name: string } }[];
}

export interface TemplateListResult {
  items: TemplateItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CategoryItem {
  id: number;
  dimension: 'format' | 'scene' | 'audience' | 'theme';
  parentId: number | null;
  name: string;
  slug: string;
  sort: number;
  enabled: boolean;
  parent?: { id: number; name: string } | null;
}

export interface TagItem {
  id: number;
  name: string;
  enabled?: boolean;
  _count?: { templates: number };
}

export interface UploadResult {
  url: string;
}
