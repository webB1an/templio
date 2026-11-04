const { CATEGORIES, TEMPLATES } = require("../../data/mock");
const { getNavMetrics } = require("../../utils/layout");
const { fetchFacets } = require("../../utils/api");

const HOT_LIMIT = 6;

const ICONS = {
  business: "◐",
  thesis: "✎",
  education: "✿",
  resume: "▤",
  contract: "⚖",
  party: "★",
  report: "▦"
};

function toViewItem(item, index) {
  return {
    key: item.key,
    name: item.name,
    icon: ICONS[item.key] || "◇",
    initial: (item.name || "分").slice(0, 1),
    ordinal: (index + 1 < 10 ? "0" : "") + (index + 1),
    count: item.count || 0
  };
}

function sortByHot(items) {
  return items
    .slice()
    .sort((left, right) => (right.count || 0) - (left.count || 0))
    .map(toViewItem);
}

function fallbackCategories() {
  return CATEGORIES.filter((item) => item.key !== "all").map((item) => ({
    key: item.key,
    name: item.name,
    count: TEMPLATES.filter((template) => template.categoryKey === item.key).length
  }));
}

Page({
  data: {
    categories: [],
    totalCategories: 0,
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96
  },

  onLoad() {
    const metrics = getNavMetrics();
    const fallback = sortByHot(fallbackCategories());
    this.setData({
      categories: fallback.slice(0, HOT_LIMIT),
      totalCategories: fallback.length,
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 28
    });
    this.loadCategories();
  },

  onPullDownRefresh() {
    this.loadCategories().finally(() => wx.stopPullDownRefresh());
  },

  loadCategories() {
    return fetchFacets()
      .then((data) => {
        const remote = data && data.categories;
        if (!Array.isArray(remote) || remote.length === 0) return;
        const all = sortByHot(remote);
        this.setData({
          categories: all.slice(0, HOT_LIMIT),
          totalCategories: all.length
        });
      })
      .catch(() => {});
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  openCategory(event) {
    const key = event.currentTarget.dataset.key;
    const name = event.currentTarget.dataset.name;
    wx.navigateTo({
      url: `/pages/list/list?categoryKey=${key}&category=${encodeURIComponent(name)}`
    });
  },

  openAllCategories() {
    wx.navigateTo({ url: "/pages/categories/categories" });
  },

  onShareAppMessage() {
    return { title: "模板宝 · 模板分类", path: "/pages/category/category" };
  }
});

