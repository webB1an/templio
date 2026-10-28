import { api, ensureLogin, FORMAT_LABELS, resolveUrl, TemplateDetail, TemplateCard } from '../../utils/api';

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
    // 分享链路：带 sharerId 进入时上报，给分享者计奖（PRD §3.5）
    const sharerId = Number(query.sharerId);
    if (Number.isInteger(sharerId) && sharerId > 0) {
      void (async () => {
        if (await ensureLogin()) {
          await api.shareEvent(id, sharerId).catch(() => undefined);
        }
      })();
    }
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
        claimText: detail.free
          ? '免费获取 · 网盘链接'
          : detail.unlocked
            ? '已解锁 · 获取网盘链接'
            : `${detail.baseCreditPrice} 积分解锁`,
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

  /** 免费模板：直接换取网盘分享链接；付费模板：先积分解锁，再取链接 */
  async onClaim() {
    const detail = this.data.detail;
    if (!detail) return;
    // 付费且未解锁：登录 → 解锁 → 重新加载（load 后 detail.unlocked 为 true，不再递归）
    if (!detail.free && !detail.unlocked) {
      const ok = await ensureLogin();
      if (!ok) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }
      try {
        const me = await api.me();
        wx.setStorageSync('templio_user_id', me.id);
        const res = await api.unlock(this.data.id);
        if (res.unlocked) {
          wx.showToast({ title: res.alreadyUnlocked ? '已解锁' : '解锁成功', icon: 'success' });
          this.setData({ claimed: false, claimedLinks: [] });
          await this.load(this.data.id);
          await this.onClaim(); // 此时已解锁，走下方取链接分支
        }
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '解锁失败';
        if (msg.includes('余额不足')) {
          wx.showModal({
            title: '积分不足',
            content: '去「积分」页充值或签到攒积分',
            confirmText: '去充值',
            success: (r) => {
              if (r.confirm) wx.switchTab({ url: '/pages/credits/index' });
            },
          });
        } else {
          wx.showToast({ title: msg, icon: 'none' });
        }
        return;
      }
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
    const uid = wx.getStorageSync('templio_user_id') as number;
    const sharer = uid ? `&sharerId=${uid}` : '';
    return {
      title: d ? d.title : '万用模板',
      path: `/pages/detail/index?id=${this.data.id}${sharer}`,
    };
  },
});
