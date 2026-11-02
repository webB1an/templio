import type { AdminTemplate, AiAnalysis, Facets, Stats, TemplateList, TemplateStatus } from "./types";

const TOKEN_KEY = "templio_admin_token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (response.status === 401) {
    clearToken();
    throw new Error("登录已过期，请重新登录");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : `请求失败（${response.status}）`;
    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  login(username: string, password: string) {
    return request<{ token: string; username: string; expiresIn: number }>("/admin/login", {
      method: "POST",
      body: { username, password }
    });
  },

  me() {
    return request<{ username: string }>("/admin/me");
  },

  stats() {
    return request<Stats>("/admin/stats");
  },

  facets() {
    return request<Facets>("/admin/facets");
  },

  templates(params: {
    status?: string;
    category?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.category) search.set("category", params.category);
    if (params.q) search.set("q", params.q);
    if (params.limit) search.set("limit", String(params.limit));
    if (params.offset) search.set("offset", String(params.offset));
    return request<TemplateList>(`/admin/templates?${search.toString()}`);
  },

  updateTemplate(
    id: string,
    body: { title?: string; description?: string; categoryId?: string; status?: TemplateStatus }
  ) {
    return request<AdminTemplate>(`/admin/templates/${id}`, { method: "PATCH", body });
  },

  bulk(ids: string[], action: "publish" | "offline" | "review") {
    return request<{ updated: number; status: string }>("/admin/templates/bulk", {
      method: "POST",
      body: { ids, action }
    });
  },

  saveNetdisk(id: string, body: { provider: string; url: string; passcode?: string }) {
    return request<AdminTemplate>(`/admin/templates/${id}/netdisk`, { method: "PUT", body });
  },

  removeNetdisk(id: string) {
    return request<{ removed: boolean }>(`/admin/templates/${id}/netdisk`, { method: "DELETE" });
  },

  annotateAi(id: string) {
    return request<{
      analysis: AiAnalysis;
      matchedCategory: { key: string; name: string } | null;
      status: string;
    }>(`/admin/ai/templates/${id}`, { method: "POST" });
  },

  applyAi(id: string) {
    return request<{
      applied: boolean;
      id: string;
      title: string;
      categoryKey: string | null;
      tags: string[];
      status: string;
    }>(`/admin/ai/templates/${id}/apply`, { method: "POST" });
  }
};
