const { CATEGORIES, TEMPLATES } = require("../../data/mock");
const { getNavMetrics } = require("../../utils/layout");
const { fetchTemplates, fetchFacets } = require("../../utils/api");

const PAGE_SIZE = 10;

Page({
  data: {
    categories: CATEGORIES,
    templates: TEMPLATES,
    activeCategory: "all",
    page: 0,
    hasMore: false,
    loading: false,
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96
  },

  onLoad() {
    const metrics = getNavMetrics();
    this.setData({
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 28
    });
    this.loadCategories();
    this.loadTemplates(true);
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onPullDownRefresh() {
    Promise.all([this.loadCategories(), this.loadTemplates(true)]).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    this.loadMore();
  },

  loadCategories() {
    return fetchFacets()
      .then((data) => {
        const categories = data && data.categories;
        if (Array.isArray(categories) && categories.length) {
          this.setData({
            categories: [{ key: "all", name: "全部" }].concat(
              categories.map((item) => ({ key: item.key, name: item.name }))
            )
          });
        }
      })
      .catch(() => {});
  },

  /** 分页加载服务端模板，失败回退 mock */
  loadTemplates(reset) {
    if (!reset && (this.data.loading || !this.data.hasMore)) return Promise.resolve();
    const pageIndex = reset ? 0 : this.data.page;
    const category = this.data.activeCategory;

    this.setData({ loading: true });
    return fetchTemplates({
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
      category: category === "all" ? undefined : category
    })
      .then((data) => {
        const list = (data && data.items) || [];
        const total = (data && data.total) || 0;
        this.setData({
          templates: reset ? list : this.data.templates.concat(list),
          page: pageIndex + 1,
          hasMore: (pageIndex + 1) * PAGE_SIZE < total,
          loading: false
        });
      })
      .catch(() => {
        if (reset) {
          const mock = category === "all"
            ? TEMPLATES
            : TEMPLATES.filter((item) => item.categoryKey === category);
          this.setData({ templates: mock, page: 1, hasMore: false, loading: false });
        } else {
          this.setData({ loading: false, hasMore: false });
        }
      });
  },

  loadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.loadTemplates(false);
  },

  onCategory(event) {
    const key = event.currentTarget.dataset.key;
    if (!key || key === this.data.activeCategory) return;
    this.setData({ activeCategory: key, templates: [], page: 0, hasMore: false });
    this.loadTemplates(true);
  },

  /** 封面加载失败时回退到渐变占位 */
  onCoverError(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    this.setData({ [`templates[${index}].coverUrl`]: "" });
  },

  onOpenCard(event) {
    const id = event.detail && event.detail.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  goSearch() {
    wx.navigateTo({ url: "/pages/search/search" });
  },

  goList() {
    wx.navigateTo({ url: "/pages/list/list" });
  },

  onShareAppMessage() {
    return { title: "模板宝 · PPT/Word 模板库", path: "/pages/index/index" };
  },

  onShareTimeline() {
    return { title: "模板宝 · PPT/Word 模板库" };
  }
});
