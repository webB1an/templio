import { api, FORMAT_LABELS, resolveUrl, TemplateDetail, TemplateCard } from '../../utils/api';

interface FileRow {
  id: number;
  filename: string;
  netdiskType: string;
  sizeText: string;
}

function formatSize(size: number | null): string {
  if (!size) return '';
  if (size > 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

Page({
  data: {
    loading: true,
    error: '',
    id: 0,
    detail: null as TemplateDetail | null,
    coverUrl: '',
    previewUrls: [] as string[],
    formatText: '',
    priceText: '',
    claimText: '',
    files: [] as FileRow[],
    related: [] as TemplateCard[],
    claimLoading: false,
    claimed: false,
    claimedLinks: [] as { filename: string; shareUrl: string }[],
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = Number(query.id);
    if (!Number.isInteger(id) || id <= 0) {
      this.setData({ loading: false, error: '无效的模板 ID' });
      return;
    }
    this.setData({ id });
    void this.load(id);
  },

  async load(id: number) {
    try {
      const detail = await api.templateDetail(id);
      const previewUrls = (detail.previews ?? []).map((u) => resolveUrl(u));
      const slides = [resolveUrl(detail.cover), ...previewUrls].filter(Boolean);
      this.setData({
        loading: false,
        error: '',
        detail,
        coverUrl: slides[0] ?? '',
        previewUrls: slides,
        formatText: FORMAT_LABELS[detail.format] ?? detail.format,
        priceText: detail.baseCreditPrice === 0 ? '免费' : `${detail.baseCreditPrice} 积分`,
        claimText: detail.free ? '免费获取 · 网盘链接' : `${detail.baseCreditPrice} 积分解锁`,
        files: detail.files.map((f) => ({
          id: f.id,
          filename: f.filename,
          netdiskType: f.netdiskType === 'quark' ? '夸克网盘' : '百度网盘',
          sizeText: formatSize(f.size),
        })),
      });
      wx.setNavigationBarTitle({ title: detail.title });
      void this.loadRelated(id);
    } catch (e) {
      this.setData({ loading: false, error: e instanceof Error ? e.message : '加载失败' });
    }
  },

  async loadRelated(id: number) {
    try {
      const res = await api.related(id);
      this.setData({ related: res.items });
    } catch {
      // 相关推荐失败不阻塞
    }
  },

  onPreviewTap(e: WechatMiniprogram.TouchEvent) {
    const current = e.currentTarget.dataset.url as string;
    wx.previewImage({ current, urls: this.data.previewUrls });
  },

  /** 免费模板：直接换取网盘分享链接；付费模板：M3 接入积分解锁 */
  async onClaim() {
    const detail = this.data.detail;
    if (!detail) return;
    if (!detail.free) {
      wx.showModal({
        title: '需要解锁',
        content: `该模板需 ${detail.baseCreditPrice} 积分解锁，积分功能即将上线`,
        showCancel: false,
      });
      return;
    }
    this.setData({ claimLoading: true });
    try {
      const res = await api.shareLinks(this.data.id);
      this.setData({
        claimLoading: false,
        claimed: true,
        claimedLinks: res.files.map((f) => ({ filename: f.filename, shareUrl: f.shareUrl })),
      });
    } catch (e) {
      this.setData({ claimLoading: false });
      wx.showToast({ title: e instanceof Error ? e.message : '获取失败', icon: 'none' });
    }
  },

  onCopyLink(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.url as string;
    wx.setClipboardData({ data: url });
  },

  onShareAppMessage() {
    const d = this.data.detail;
    return {
      title: d ? d.title : '万用模板',
      path: `/pages/detail/index?id=${this.data.id}`,
    };
  },
});
