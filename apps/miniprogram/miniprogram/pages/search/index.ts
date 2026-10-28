import { api, TemplateCard } from '../../utils/api';

Page({
  data: {
    keyword: '',
    items: [] as TemplateCard[],
    total: 0,
    page: 1,
    searched: false,
    loading: false,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const q = query.q ? decodeURIComponent(query.q) : '';
    this.setData({ keyword: q });
    if (q) void this.search(true);
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
  },

  onConfirm() {
    void this.search(true);
  },

  onClear() {
    this.setData({ keyword: '', items: [], total: 0, searched: false, error: '' });
  },

  async search(reset: boolean) {
    const kw = this.data.keyword.trim();
    if (!kw) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const res = await api.search(kw, page);
      this.setData({
        loading: false,
        searched: true,
        error: '',
        items: reset ? res.items : [...this.data.items, ...res.items],
        page,
        total: res.total,
      });
    } catch (e) {
      this.setData({ loading: false, searched: true, error: e instanceof Error ? e.message : '搜索失败' });
    }
  },

  onReachBottom() {
    if (this.data.searched && this.data.items.length < this.data.total && !this.data.loading) {
      void this.search(false);
    }
  },
});
