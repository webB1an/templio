const { CATEGORIES, TEMPLATES } = require("../../data/mock");
const { getNavMetrics } = require("../../utils/layout");
const { fetchTemplates, fetchFacets } = require("../../utils/api");

Page({
  data: {
    categories: CATEGORIES,
    templates: TEMPLATES,
    allTemplates: TEMPLATES,
    activeCategory: "all",
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
    this.loadRemote();
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  /** 优先用服务端数据，接口未就绪时回退 mock */
  loadRemote() {
    fetchTemplates({})
      .then((data) => {
        const list = Array.isArray(data) ? data : data && data.items;
        if (list && list.length) {
          this.setData({ templates: list, allTemplates: list });
        }
      })
      .catch(() => {
        // 接口未就绪，保留 mock 数据
      });

    fetchFacets()
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

  onCategory(event) {
    const key = event.currentTarget.dataset.key;
    if (!key || key === this.data.activeCategory) return;
    const all = this.data.allTemplates || [];
    this.setData({
      activeCategory: key,
      templates: key === "all" ? all : all.filter((item) => item.categoryKey === key)
    });
  },

  goSearch() {
    wx.navigateTo({ url: "/pages/search/search" });
  },

  goList() {
    wx.navigateTo({ url: "/pages/list/list" });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  onShareAppMessage() {
    return { title: "模板宝 · PPT/Word 模板库", path: "/pages/index/index" };
  }
});
