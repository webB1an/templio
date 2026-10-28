/** 公开图片资源的域名前缀 */
const MEDIA_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://templio.wdbzk.com';

/**
 * 输出层媒体 URL 规范化：
 * 历史测试数据可能存有 http://127.0.0.1:3000/... 或相对路径，统一重写到正式域名，
 * 满足小程序 request/image 合法域名（HTTPS）要求。
 */
export function normalizeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const idx = url.indexOf('/uploads/');
  if (idx > 0) return MEDIA_BASE_URL + url.slice(idx);
  if (url.startsWith('/uploads/')) return MEDIA_BASE_URL + url;
  return url;
}

/** 规范化预览图数组（截断到 5 张并过滤空值） */
export function normalizePreviews(previews: unknown): string[] {
  if (!Array.isArray(previews)) return [];
  return previews
    .slice(0, 5)
    .map((p) => normalizeMediaUrl(p as string))
    .filter((p): p is string => !!p);
}
