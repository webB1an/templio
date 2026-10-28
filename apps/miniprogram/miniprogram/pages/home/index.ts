import { api, resolveUrl, TemplateCard, Banner } from '../../utils/api';

Page({
  data: {
    loading: true,
    banners: [] as Banner[],
    hot: [] as TemplateCard[],
    latest: [] as TemplateCard[],
    totalTemplates: 0,
    hotKeywords: [] as string[],
    keyword: '',
    error: '',
  },

  onLoad() {
    void this.load();
  },

  onPullDownRefresh() {
    void this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      const [overview, bannersRes, sections] = await Promise.all([
        api.homeOverview().catch(() => null),
        api.homeBanners().catch(() => ({ items: [] })),
        api.homeSections(),
      ]);
      this.setData({
        loading: false,
        error: '',
        totalTemplates: overview?.totalTemplates ?? 0,
        hotKeywords: (overview?.hotKeywords ?? []).map((k) => k.keyword),
        banners: bannersRes.items.map((b) => ({ ...b, image: resolveUrl(b.image) })),
        hot: sections.hot,
        latest: sections.latest,
      });
    } catch (e) {
      this.setData({ loading: false, error: e instanceof Error ? e.message : '加载失败' });
    }
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    const kw = (this.data.keyword as string).trim();
    if (kw) wx.navigateTo({ url: `/pages/search/index?q=${encodeURIComponent(kw)}` });
  },

  goSearchPage() {
    wx.navigateTo({ url: '/pages/search/index' });
  },

  onHotKeywordTap(e: WechatMiniprogram.TouchEvent) {
    const kw = e.currentTarget.dataset.keyword as string;
    wx.navigateTo({ url: `/pages/search/index?q=${encodeURIComponent(kw)}` });
  },

  /** Banner 跳转：template → 详情页；page → 站内页面；none → 无操作 */
  onBannerTap(e: WechatMiniprogram.TouchEvent) {
    const b = e.currentTarget.dataset.item as Banner;
    if (!b || b.linkType === 'none' || !b.linkTarget) return;
    if (b.linkType === 'template') {
      wx.navigateTo({ url: `/pages/detail/index?id=${b.linkTarget}` });
    } else if (b.linkType === 'page') {
      const tabs = ['/pages/home/index', '/pages/category/index', '/pages/credits/index', '/pages/mine/index'];
      if (tabs.includes(b.linkTarget)) wx.switchTab({ url: b.linkTarget });
      else wx.navigateTo({ url: b.linkTarget });
    }
  },
});
