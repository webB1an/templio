const { getNavMetrics } = require("../../utils/layout");
const { fetchFavorites, fetchDownloads } = require("../../utils/api");

Page({
  data: {
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96,
    userName: "微信用户",
    userSub: "微信静默登录 · 收藏/下载记录云端同步",
    favCount: 0,
    downloadCount: 0
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
    const app = getApp();
    const cachedUser = wx.getStorageSync("userInfo") || {};
    this.setData({
      userName: cachedUser.nickname || "微信用户",
      userSub: app && app.globalData.token ? "微信静默登录 · 收藏云端同步" : "正在静默登录..."
    });
    this.syncFavorites();
  },

  onPullDownRefresh() {
    this.syncFavorites();
    setTimeout(() => wx.stopPullDownRefresh(), 800);
  },

  syncFavorites() {
    const app = getApp();
    if (!app || !app.ensureLogin) return;
    app
      .ensureLogin()
      .then(() => Promise.all([fetchFavorites(), fetchDownloads()]))
      .then(([favData, downloadData]) => {
        const favorites = (favData && favData.items) || [];
        const downloads = (downloadData && downloadData.items) || [];
        this.setData({
          favCount: favorites.length,
          downloadCount: downloads.length,
          userSub: "微信静默登录 · 收藏/下载记录云端同步"
        });
      })
      .catch(() => {
        this.setData({ userSub: "登录失败，收藏暂不可用" });
      });
  },

  onMenu(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "favorites") {
      wx.navigateTo({ url: "/pages/favorites/favorites" });
      return;
    }
    if (key === "downloads") {
      wx.navigateTo({ url: "/pages/downloads/downloads" });
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
  },

  onShareTimeline() {
    return { title: "模板宝 · PPT/Word 模板库" };
  }
});
