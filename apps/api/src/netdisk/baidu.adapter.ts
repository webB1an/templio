import { Injectable } from '@nestjs/common';
import { NetdiskAdapter, ShareCheckResult } from './netdisk-adapter';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * 百度网盘适配器：分享页 HTML 标记检测（无需账号登录态）
 * 百度无开放的分享详情 API，网页客户端接口依赖登录 Cookie，
 * 这里做轻量有效性判断：抓取分享页，按特征文案/结构判定。
 */
@Injectable()
export class BaiduAdapter implements NetdiskAdapter {
  async checkShare(url: string): Promise<ShareCheckResult> {
    const surl = parseBaiduUrl(url);
    if (!surl) {
      return { status: 'invalid', message: '不是有效的百度网盘分享链接' };
    }
    let html: string;
    try {
      const res = await fetch(`https://pan.baidu.com/s/${surl}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(15_000),
        redirect: 'follow',
      });
      html = await res.text();
    } catch {
      return { status: 'unknown', message: '百度接口请求失败，请稍后重试或人工核对' };
    }

    if (INVALID_MARKERS.some((m) => html.includes(m))) {
      return { status: 'invalid', message: '分享已失效（取消/删除/链接不存在）' };
    }
    if (html.includes('请输入提取码') || html.includes('提取码：') && !url.includes('pwd=')) {
      return { status: 'need_passcode', message: '该链接需要提取码，请把提取码拼进 pwd 参数后重新检查' };
    }
    // 有效分享页通常包含 shareid / file_list 数据
    if (html.includes('shareid') || html.includes('file_list') || html.includes('下载客户端')) {
      return { status: 'ok', message: '分享页可访问（百度未提供免登录文件清单，建议人工核对文件名）' };
    }
    return { status: 'unknown', message: '未能确认链接状态，请人工核对' };
  }
}

/** 从 https://pan.baidu.com/s/1xxxx?pwd=xx 提取 surl（去掉首位的 1） */
export function parseBaiduUrl(url: string): string | null {
  const m = url.match(/pan\.baidu\.com\/s\/1([0-9a-zA-Z_-]+)/i);
  return m ? m[1] : null;
}

const INVALID_MARKERS = [
  '分享的文件已经被取消',
  '你访问的页面不存在',
  '分享链接不存在',
  '链接不存在',
  '该链接分享内容可能因为涉及侵权',
  '此链接分享内容因为涉及侵权',
];
