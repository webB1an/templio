import { api, resolveUrl, TemplateCard } from '../../utils/api';

Page({
  data: {
    loading: true,
    banners: [] as { id: number; image: string }[],
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
        banners: bannersRes.items.map((b) => ({ id: b.id, image: resolveUrl(b.image) })),
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
});
