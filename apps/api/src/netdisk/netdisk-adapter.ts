/**
 * 网盘适配器接口（PRD §7.3）
 *
 * M1-4 范围：checkShare（分享链接健康检查）——纯 HTTP 实现，无外部依赖。
 * upload / saveas（自动上传与转存）依赖服务器侧 CLI 工具（夸克 skill / bdpan，
 * 沿用 wallpaper-manager 方式），作为后续可选增强接入，接口先留位。
 */

export type ShareCheckStatus = 'ok' | 'invalid' | 'need_passcode' | 'unknown';

export interface ShareFile {
  name: string;
  size: number;
}

export interface ShareCheckResult {
  status: ShareCheckStatus;
  message: string;
  /** 链接有效时返回分享内文件清单（最多前 10 个） */
  files?: ShareFile[];
}

export interface NetdiskAdapter {
  /** 检查分享链接（含提取码）是否有效，返回健康状态与文件清单 */
  checkShare(url: string): Promise<ShareCheckResult>;
}

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function fetchTimeoutMs(): number {
  return 15_000;
}

/** 带超时的 JSON 请求 */
export async function httpJson(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(fetchTimeoutMs()),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}
