/**
 * 网盘目录与文件名规则（参照 wallpaper-manager 的 wallpaper-path 思路）。
 *
 * 设计要点：
 * 1. 根目录只出现一次。百度靠 BAIDU_REMOTE_BASE（默认 /apps/bdpan/templio）承载，
 *    代码只拼相对目录；夸克没有 base 配置，根目录固定为 QUARK_ROOT_DIR 常量。
 * 2. 分层「文件格式/年-月」：upload 阶段格式和时间都已知，不依赖 AI 分类，
 *    同时避免所有模板平铺在一个目录里。
 * 3. 上传文件名加随机后缀：multer 落盘的临时文件是 imp-xxx 随机名，
 *    且不同模板可能同名，直接用会导致网盘里文件名不可读、或互相覆盖。
 */

/** 夸克网盘根目录，与百度 BAIDU_REMOTE_BASE 的末段保持一致 */
export const QUARK_ROOT_DIR = 'templio';

/** 文件格式 → 网盘一级目录 */
const FORMAT_DIR: Record<string, string> = {
  ppt: 'PPT模板',
  word: 'Word文档',
  excel: 'Excel表格',
  pdf: 'PDF文档',
  image: '图片素材',
  archive: '压缩包',
  other: '其他',
};

export interface TemplateRemoteDir {
  /** 百度网盘 BAIDU_REMOTE_BASE 下的相对目录，如 "PPT模板/2026-10" */
  baiduRelativeDir: string;
  /** 夸克目录层级，第一段固定 QUARK_ROOT_DIR */
  quarkSegments: string[];
}

/** 按文件格式与月份构建落库目录 */
export function buildTemplateRemoteDir(
  format: string,
  date: Date = new Date(),
): TemplateRemoteDir {
  const formatDir = FORMAT_DIR[format] ?? FORMAT_DIR.other;
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return {
    baiduRelativeDir: `${formatDir}/${month}`,
    quarkSegments: [QUARK_ROOT_DIR, formatDir, month],
  };
}

/** 去掉网盘不接受的字符（与百度/夸克的上传行为保持一致） */
export function sanitizeRemoteName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * 生成上传用的唯一文件名：原名（截断）+ 短随机后缀，保留扩展名。
 * 例：年终汇报.pptx → 年终汇报_k3f9ab.pptx
 */
export function uniqueRemoteName(
  originalName: string,
  date: Date = new Date(),
): string {
  const safe = sanitizeRemoteName(originalName || '') || 'template';
  const dot = safe.lastIndexOf('.');
  const ext = dot > 0 && dot < safe.length - 1 ? safe.slice(dot) : '';
  const rawStem = ext ? safe.slice(0, dot) : safe;
  const stem = rawStem.trim().slice(0, 60) || 'template';
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${stem}_${rand}${ext}`;
}
