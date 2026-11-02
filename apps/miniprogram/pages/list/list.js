const { TEMPLATES } = require("../../data/mock");
const { getNavMetrics } = require("../../utils/layout");
const { fetchTemplates } = require("../../utils/api");

const PAGE_SIZE = 10;

/** URL query 里可能是 encodeURIComponent 后的中文，安全解码 */
function safeDecode(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

Page({
  data: {
    title: "全部模板",
    templates: TEMPLATES,
    keyword: "",
    categoryKey: "",
    page: 0,
    hasMore: false,
    loading: false,
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96
  },

  onLoad(options) {
    const metrics = getNavMetrics();
    const categoryKey = options.categoryKey || "";
    const keyword = safeDecode(options.q || "");
    const categoryName = safeDecode(options.category || "");
    const title = categoryName || (keyword ? `搜索：${keyword}` : "全部模板");
    this.setData({
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 28,
      title,
      keyword,
      categoryKey
    });
    this.loadTemplates(true);
  },

  onPullDownRefresh() {
    this.loadTemplates(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMore();
  },

  loadTemplates(reset) {
    if (!reset && (this.data.loading || !this.data.hasMore)) return Promise.resolve();
    const pageIndex = reset ? 0 : this.data.page;
    this.setData({ loading: true });
    return fetchTemplates({
      q: this.data.keyword || undefined,
      category: this.data.categoryKey || undefined,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE
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
          this.applyFilter();
          this.setData({ loading: false, page: 1, hasMore: false });
        } else {
          this.setData({ loading: false, hasMore: false });
        }
      });
  },

  loadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.loadTemplates(false);
  },

  applyFilter() {
    const keyword = (this.data.keyword || "").toLowerCase();
    const categoryKey = this.data.categoryKey;
    let list = TEMPLATES;
    if (categoryKey) list = list.filter((item) => item.categoryKey === categoryKey);
    if (keyword) {
      list = list.filter((item) => {
        const haystack = `${item.title} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
        return haystack.indexOf(keyword) >= 0;
      });
    }
    this.setData({ templates: list });
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: "/pages/index/index" });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  onShareAppMessage() {
    return { title: "模板宝 · 模板库", path: "/pages/index/index" };
  },

  onShareTimeline() {
    return { title: "模板宝 · 模板库" };
  }
});
