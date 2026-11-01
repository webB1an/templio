const { TEMPLATES } = require("../../data/mock");
const { getNavMetrics } = require("../../utils/layout");
const { fetchTemplates } = require("../../utils/api");

Page({
  data: {
    title: "全部模板",
    templates: TEMPLATES,
    keyword: "",
    categoryKey: "",
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96
  },

  onLoad(options) {
    const metrics = getNavMetrics();
    const categoryKey = options.categoryKey || "";
    const title = options.category || (options.q ? "搜索结果" : "全部模板");
    this.setData({
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 28,
      title,
      keyword: options.q || "",
      categoryKey
    });
    this.applyFilter();
    this.loadRemote();
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

  loadRemote() {
    fetchTemplates({
      q: this.data.keyword || undefined,
      category: this.data.categoryKey || undefined
    })
      .then((data) => {
        const list = Array.isArray(data) ? data : data && data.items;
        if (list && list.length) this.setData({ templates: list });
      })
      .catch(() => {});
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: "/pages/index/index" });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  onShareAppMessage() {
    return { title: "Templio · 模板库", path: "/pages/index/index" };
  }
});
