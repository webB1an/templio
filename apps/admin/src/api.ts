import type {
  AdminTask,
  AdminTemplate,
  AiAnalysis,
  AiAutoStatus,
  Facets,
  NetdiskProvider,
  Stats,
  StorageAccount,
  SystemStatus,
  TemplateList,
  TemplateStatus
} from "./types";

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

  system() {
    return request<SystemStatus>("/admin/system");
  },

  aiAutoStatus() {
    return request<AiAutoStatus>("/admin/settings/ai-auto");
  },

  setAiAutoEnabled(enabled: boolean) {
    return request<{ enabled: boolean }>("/admin/settings/ai-auto", {
      method: "PATCH",
      body: { enabled }
    });
  },

  storageAccounts() {
    return request<StorageAccount[]>("/admin/storage-accounts");
  },

  createStorageAccount(body: { provider: NetdiskProvider; label: string; isDefault?: boolean }) {
    return request<StorageAccount>("/admin/storage-accounts", { method: "POST", body });
  },

  updateStorageAccount(id: string, body: { label: string }) {
    return request<StorageAccount>(`/admin/storage-accounts/${id}`, { method: "PATCH", body });
  },

  setDefaultStorageAccount(id: string) {
    return request<StorageAccount>(`/admin/storage-accounts/${id}/default`, { method: "POST" });
  },

  probeStorageAccount(id: string) {
    return request<StorageAccount>(`/admin/storage-accounts/${id}/probe`, { method: "POST" });
  },

  deleteStorageAccount(id: string) {
    return request<{ deleted: boolean }>(`/admin/storage-accounts/${id}`, { method: "DELETE" });
  },

  startStorageAuth(id: string) {
    return request<{ authUrl?: string; message?: string } | StorageAccount>(
      `/admin/storage-accounts/${id}/auth/start`,
      { method: "POST" }
    );
  },

  finishStorageAuth(id: string, code: string) {
    return request<StorageAccount>(`/admin/storage-accounts/${id}/auth/finish`, {
      method: "POST",
      body: { code }
    });
  },

  startQuarkAuth(id: string) {
    return request<{ authUrl?: string; message?: string } | StorageAccount>(
      `/admin/storage-accounts/${id}/quark-auth/start`,
      { method: "POST" }
    );
  },

  finishQuarkAuth(id: string, code: string) {
    return request<StorageAccount>(`/admin/storage-accounts/${id}/quark-auth/finish`, {
      method: "POST",
      body: { code }
    });
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

  async downloadSource(id: string): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`/api/admin/templates/${id}/source`, {
      headers: { authorization: `Bearer ${getToken()}` }
    });
    if (!response.ok) {
      throw new Error(`源文件下载失败（HTTP ${response.status}）`);
    }
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
    return {
      blob: await response.blob(),
      filename: match ? decodeURIComponent(match[1]) : `source-${id}`
    };
  },

  removeSource(id: string) {
    return request<{ removed: boolean }>(`/admin/templates/${id}/source`, { method: "DELETE" });
  },

  deleteTemplate(id: string) {
    return request<{ deleted: boolean }>(`/admin/templates/${id}`, { method: "DELETE" });
  },

  async downloadCsv(path: string, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`/api${path}`, {
      headers: { authorization: `Bearer ${getToken()}` }
    });
    if (!response.ok) {
      throw new Error(`导出失败（HTTP ${response.status}）`);
    }
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
    return {
      blob: await response.blob(),
      filename: match ? decodeURIComponent(match[1]) : fallbackName
    };
  },

  downloadTemplatesCsv() {
    return api.downloadCsv("/admin/export/templates.csv", "templates.csv");
  },

  downloadClicksCsv(days = 30) {
    return api.downloadCsv(`/admin/export/clicks.csv?days=${days}`, "clicks.csv");
  },

  startNetdiskSync(id: string, provider: "baidu" | "quark") {
    return request<{ taskId: string; status: string; message?: string }>(
      `/admin/templates/${id}/netdisk/sync`,
      { method: "POST", body: { provider } }
    );
  },

  getTask(taskId: string) {
    return request<AdminTask>(`/admin/tasks/${taskId}`);
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
  },

  batchAnnotate(body: { ids?: string[]; limit?: number }) {
    return request<{
      total: number;
      succeeded: number;
      failed: number;
      items: Array<{
        id: string;
        title: string;
        ok: boolean;
        message?: string;
        analysis?: AiAnalysis;
      }>;
    }>("/admin/ai/batch", { method: "POST", body });
  },

  autoApplyAi(body: { minConfidence?: number; limit?: number }) {
    return request<{
      applied: number;
      failed: number;
      items: Array<{ id: string; title: string; ok: boolean; message?: string }>;
    }>("/admin/ai/auto-apply", { method: "POST", body });
  }
};
