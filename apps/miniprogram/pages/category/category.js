const { CATEGORIES, TEMPLATES } = require("../../data/mock");
const { getNavMetrics } = require("../../utils/layout");

const ICONS = {
  business: "◐",
  thesis: "✎",
  education: "✿",
  resume: "▤",
  contract: "⚖",
  party: "★",
  report: "▦"
};

Page({
  data: {
    categories: [],
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96
  },

  onLoad() {
    const metrics = getNavMetrics();
    const categories = CATEGORIES.filter((item) => item.key !== "all").map((item) => ({
      key: item.key,
      name: item.name,
      icon: ICONS[item.key] || "◇",
      count: TEMPLATES.filter((template) => template.categoryKey === item.key).length
    }));
    this.setData({
      categories,
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 28
    });
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

  onShareAppMessage() {
    return { title: "Templio · 模板分类", path: "/pages/category/category" };
  }
});
