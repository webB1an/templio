/** 服务端 API 封装：后端返回裸 JSON（无信封结构），错误通过 HTTP 状态码 + message 表达 */

export const API_BASE_URL = 'https://templio.wdbzk.com';

const TOKEN_KEY = 'templio_user_token';

export function getUserToken(): string {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

export function setUserToken(token: string) {
  wx.setStorageSync(TOKEN_KEY, token);
}

export function clearUserToken() {
  wx.removeStorageSync(TOKEN_KEY);
}

export function request<T>(path: string, options: { method?: 'GET' | 'POST' | 'DELETE'; data?: Record<string, unknown>; auth?: boolean } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const header: Record<string, string> = { 'content-type': 'application/json' };
    if (options.auth) {
      const token = getUserToken();
      if (token) header.Authorization = `Bearer ${token}`;
    }
    wx.request({
      url: `${API_BASE_URL}/api${path}`,
      method: options.method || 'GET',
      data: options.data,
      header,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else if (res.statusCode === 401 && options.auth) {
          clearUserToken();
          reject(new Error('NEED_LOGIN'));
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
  unlocked: boolean;
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
      { auth: true },
    ),
  // ── 用户 / 积分 / 支付 ──
  wxLogin: (code: string) =>
    request<{ accessToken: string; profile: { id: number; openid: string; nickname: string | null } }>(
      '/users/wx-login',
      { method: 'POST', data: { code } },
    ),
  me: () => request<{ id: number; nickname: string | null; balance: number }>('/users/me', { auth: true }),
  creditAccount: () =>
    request<{ balance: number; checkedInToday: boolean; totalEarned: number }>('/credits/account', { auth: true }),
  creditLedger: (page = 1) =>
    request<Paged<{ id: number; type: string; amount: number; balanceAfter: number; reason: string | null; createdAt: string }>>(
      `/credits/ledger?page=${page}`,
      { auth: true },
    ),
  checkin: () =>
    request<{ reward: number; streakDays: number; balance: number }>('/credits/checkin', { method: 'POST', auth: true }),
  shareEvent: (templateId: number, sharerId: number) =>
    request<{ rewarded: boolean; reason?: string }>('/credits/share-event', {
      method: 'POST',
      data: { templateId, sharerId },
      auth: true,
    }),
  unlock: (id: number) =>
    request<{ unlocked: boolean; alreadyUnlocked: boolean; balance: number }>(`/credits/unlock/${id}`, {
      method: 'POST',
      auth: true,
    }),
  skus: () =>
    request<
      { skuKey: string; name: string; description: string | null; wxPriceFen: number; credits: number; bonusCredits: number; badgeText: string | null; activityNote: string | null }[]
    >('/pay/skus'),
  createOrder: (skuKey: string) =>
    request<{ orderNo: string; amountFen: number; credits: number; mockMode: boolean }>('/pay/orders', {
      method: 'POST',
      data: { skuKey },
      auth: true,
    }),
  mockPay: (orderNo: string) =>
    request<{ paid: boolean; credits: number }>(`/pay/mock-pay/${orderNo}`, { method: 'POST', auth: true }),
  myOrders: () =>
    request<Paged<{ orderNo: string; skuSnapshot: Record<string, unknown>; amountFen: number; creditsSnapshot: number; status: string; createdAt: string }>>(
      '/pay/orders',
      { auth: true },
    ),
};

// ── 登录态 ──

/** 静默 wx.login 取 code */
export function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (r) => (r.code ? resolve(r.code) : reject(new Error(r.errMsg || 'wx.login 失败'))),
      fail: (e) => reject(new Error(e.errMsg || 'wx.login 失败')),
    });
  });
}

/** 确保已登录（静默 wx.login）；成功返回 true */
export async function ensureLogin(): Promise<boolean> {
  if (getUserToken()) return true;
  try {
    const code = await wxLoginCode();
    const res = await api.wxLogin(code);
    setUserToken(res.accessToken);
    wx.setStorageSync('templio_user_id', res.profile.id);
    return true;
  } catch {
    return false;
  }
}

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
