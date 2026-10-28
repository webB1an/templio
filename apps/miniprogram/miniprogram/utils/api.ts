/** 服务端 API 基础配置 */
export const API_BASE_URL = 'https://templio.wdbzk.com';

export interface ApiResult<T> {
  code: number;
  data: T;
  message?: string;
}

export function request<T>(path: string, options: { method?: string; data?: unknown } = {}): Promise<ApiResult<T>> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/api${path}`,
      method: (options.method || 'GET') as 'GET' | 'POST' | 'DELETE',
      data: options.data as Record<string, unknown> | undefined,
      header: { 'content-type': 'application/json' },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as ApiResult<T>);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg));
      },
    });
  });
}
