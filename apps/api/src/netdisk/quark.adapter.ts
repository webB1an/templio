import { Injectable } from '@nestjs/common';
import { httpJson, UA, NetdiskAdapter, ShareCheckResult } from './netdisk-adapter';

/**
 * 夸克网盘适配器：走分享页公开接口（无需账号登录态）
 * token:  POST https://drive-pc.quark.cn/1/clouddrive/share/sharepage/token?pr=ucpro&fr=pc
 * detail: POST https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail?pr=ucpro&fr=pc
 */
@Injectable()
export class QuarkAdapter implements NetdiskAdapter {
  async checkShare(url: string): Promise<ShareCheckResult> {
    const parsed = parseQuarkUrl(url);
    if (!parsed) {
      return { status: 'invalid', message: '不是有效的夸克分享链接' };
    }
    const commonHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Referer: 'https://pan.quark.cn/',
    };
    const tokenUrl =
      'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/token?pr=ucpro&fr=pc';

    let tokenRes: { status: number; body: Record<string, unknown> };
    try {
      tokenRes = await httpJson(tokenUrl, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ pwd_id: parsed.pwdId, passcode: parsed.passcode ?? '' }),
      });
    } catch {
      return { status: 'unknown', message: '夸克接口请求失败，请稍后重试或人工核对' };
    }

    const code = Number(tokenRes.body.code ?? -1);
    const msg = String(tokenRes.body.message ?? tokenRes.body.msg ?? '');
    if (code !== 0) {
      if (code === 41008 || msg.includes('提取码')) {
        return { status: 'need_passcode', message: '该链接需要提取码（或提取码错误）' };
      }
      // 42004 = 分享不存在 / 已取消 / 已删除
      return { status: 'invalid', message: `分享已失效：${msg || `code=${code}`}` };
    }

    const stoken = String((tokenRes.body.data as Record<string, unknown>)?.stoken ?? '');
    if (!stoken) {
      return { status: 'unknown', message: '夸克返回异常（缺少 stoken）' };
    }

    try {
      const detail = await httpJson(
        'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail?pr=ucpro&fr=pc',
        {
          method: 'POST',
          headers: commonHeaders,
          body: JSON.stringify({
            pwd_id: parsed.pwdId,
            stoken,
            pdir_fid: '0',
            _page: 1,
            _size: 50,
            _fetch_banner: 0,
            _fetch_share: 0,
            _fetch_total: 1,
            _sort: { file_type: 'asc', updated_at: 'desc' },
          }),
        },
      );
      if (Number(detail.body.code ?? -1) !== 0) {
        return { status: 'unknown', message: '分享 token 有效但获取文件清单失败' };
      }
      const list = (detail.body.data as Record<string, unknown>)?.list as
        | Array<Record<string, unknown>>
        | undefined;
      const files = (list ?? [])
        .map((f) => ({ name: String(f.file_name ?? f.share_name ?? ''), size: Number(f.size ?? 0) }))
        .filter((f) => f.name)
        .slice(0, 10);
      return {
        status: 'ok',
        message: `分享有效，共 ${Number((detail.body.data as Record<string, unknown>)?._total ?? files.length)} 个文件`,
        files,
      };
    } catch {
      return { status: 'ok', message: '分享 token 有效（文件清单获取失败）' };
    }
  }
}

/** 从 https://pan.quark.cn/s/<pwd_id>#/list/share?pwd=<提取码> 提取参数 */
export function parseQuarkUrl(url: string): { pwdId: string; passcode?: string } | null {
  const m = url.match(/pan\.quark\.cn\/s\/([0-9a-zA-Z]+)/i);
  if (!m) return null;
  let passcode: string | undefined;
  const pwdMatch = url.match(/[?&#]pwd=([^&#\s]+)/i);
  if (pwdMatch) passcode = decodeURIComponent(pwdMatch[1]);
  // 支持直接在 URL 后附带提取码文本（如 "链接 提取码：xxxx" 已由录入端拼进 pwd 参数）
  return { pwdId: m[1], passcode };
}
