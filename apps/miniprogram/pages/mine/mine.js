const { getNavMetrics } = require("../../utils/layout");

Page({
  data: {
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96,
    favCount: 0,
    menu: [
      { key: "favorites", icon: "♡", label: "我的收藏", tip: "已收藏模板" },
      { key: "downloads", icon: "↓", label: "下载记录", tip: "最近获取" },
      { key: "about", icon: "ⓘ", label: "关于模板宝", tip: "v0.1.0 P0" },
      { key: "feedback", icon: "✉", label: "意见反馈", tip: "帮助改进" }
    ]
  },

  onLoad() {
    const metrics = getNavMetrics();
    this.setData({
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 28
    });
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    const favIds = wx.getStorageSync("favIds") || [];
    this.setData({ favCount: favIds.length });
  },

  onMenu(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "favorites") {
      if (this.data.favCount === 0) {
        wx.showToast({ title: "还没有收藏的模板", icon: "none" });
        return;
      }
      wx.switchTab({ url: "/pages/index/index" });
      wx.showToast({ title: "收藏列表将在 P1 开放", icon: "none" });
      return;
    }
    if (key === "about") {
      wx.showModal({
        title: "模板宝",
        content: "PPT / Word 模板库\nP0 打样版本 v0.1.0\n模板仅供学习交流",
        showCancel: false
      });
      return;
    }
    if (key === "feedback") {
      wx.showModal({
        title: "意见反馈",
        content: "欢迎反馈模板需求或问题：\nfeedback@wdbzk.com",
        showCancel: false
      });
      return;
    }
    wx.showToast({ title: "功能开发中", icon: "none" });
  },

  onShareAppMessage() {
    return { title: "模板宝 · 模板库", path: "/pages/index/index" };
  }
});
