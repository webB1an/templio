/** 管理端 API client：统一携带 JWT，401 时跳转登录页 */

const TOKEN_KEY = 'templio_admin_token';
const PROFILE_KEY = 'templio_admin_profile';

export interface AdminProfile {
  id: number;
  username: string;
  role: 'super' | 'operator';
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getProfile(): AdminProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as AdminProfile) : null;
}

export function setSession(token: string, profile: AdminProfile) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (getToken()) headers.set('Authorization', `Bearer ${getToken()}`);
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    clearSession();
    window.location.href = '/admin/login';
    throw new ApiError(401, '登录已过期，请重新登录');
  }

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message =
      (data as { message?: string | string[] })?.message &&
      Array.isArray((data as { message?: string[] }).message)
        ? (data as { message: string[] }).message.join('；')
        : ((data as { message?: string })?.message ?? `请求失败（${res.status}）`);
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T = unknown>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};
