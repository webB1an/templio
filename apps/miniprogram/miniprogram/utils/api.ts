/** 服务端 API 封装：后端返回裸 JSON（无信封结构），错误通过 HTTP 状态码 + message 表达 */

export const API_BASE_URL = 'https://templio.wdbzk.com';

export function request<T>(path: string, options: { method?: 'GET' | 'POST' | 'DELETE'; data?: Record<string, unknown> } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/api${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: { 'content-type': 'application/json' },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else {
          const body = res.data as { message?: string } | undefined;
          reject(new Error(body?.message || `请求失败（${res.statusCode}）`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络异常'));
      },
    });
  });
}

// ── 类型 ──

export interface TemplateCard {
  id: number;
  title: string;
  summary: string | null;
  cover: string | null;
  format: string;
  baseCreditPrice: number;
  viewCount?: number;
  favoriteCount?: number;
  heatScore?: number;
  publishedAt?: string;
  previews?: string[];
  categories?: { id: number; name: string; dimension: string }[];
  tags?: { id: number; name: string }[];
}

export interface TemplateDetail extends TemplateCard {
  free: boolean;
  locked: boolean;
  files: {
    id: number;
    filename: string;
    netdiskType: string;
    size: number | null;
    previewUrl: string | null;
    shareUrl: string | null;
  }[];
}

export interface Banner {
  id: number;
  image: string;
  linkType: string;
  linkTarget: string | null;
}

export interface CategoryNode {
  id: number;
  name: string;
  dimension: string;
  parentId: number | null;
  children?: CategoryNode[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── 接口 ──

export const api = {
  homeOverview: () =>
    request<{ totalTemplates: number; totalCategories: number; publishedToday: number; hotKeywords: { keyword: string; count7d: number }[] }>('/home/overview'),
  homeBanners: () => request<{ items: Banner[] }>('/home/banners'),
  homeSections: () =>
    request<{ hot: TemplateCard[]; latest: TemplateCard[] }>('/home/sections'),
  categoryTree: (dimension?: string) =>
    request<CategoryNode[]>(`/categories/tree${dimension ? `?dimension=${dimension}` : ''}`),
  templates: (query: { categoryId?: number; format?: string; sort?: string; page?: number; pageSize?: number }) => {
    const params: string[] = [];
    if (query.categoryId) params.push(`categoryId=${query.categoryId}`);
    if (query.format) params.push(`format=${query.format}`);
    if (query.sort) params.push(`sort=${query.sort}`);
    params.push(`page=${query.page ?? 1}`);
    params.push(`pageSize=${query.pageSize ?? 10}`);
    return request<Paged<TemplateCard>>(`/templates?${params.join('&')}`);
  },
  templateDetail: (id: number) => request<TemplateDetail>(`/templates/${id}`),
  related: (id: number) => request<{ items: TemplateCard[] }>(`/templates/${id}/related`),
  search: (q: string, page = 1) =>
    request<Paged<TemplateCard>>(`/templates/search?q=${encodeURIComponent(q)}&page=${page}&pageSize=20`),
  shareLinks: (id: number) =>
    request<{ templateId: number; files: { id: number; filename: string; netdiskType: string; shareUrl: string }[] }>(
      `/templates/${id}/share-links`,
    ),
};

/** 相对路径图片地址 → 完整 URL（上传接口可能返回相对路径） */
export function resolveUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export const FORMAT_LABELS: Record<string, string> = {
  ppt: 'PPT',
  word: 'Word',
  excel: 'Excel',
  pdf: 'PDF',
  image: '图片',
  archive: '压缩包',
  other: '其他',
};
