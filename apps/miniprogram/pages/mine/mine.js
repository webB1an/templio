const { getNavMetrics } = require("../../utils/layout");
const { fetchFavorites, fetchDownloads, deleteAccount } = require("../../utils/api");

Page({
  data: {
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96,
    userName: "微信用户",
    userSub: "微信静默登录 · 收藏/下载记录云端同步",
    favCount: 0,
    downloadCount: 0,
    menu: [
      { key: "favorites", iconPath: "/assets/icons/heart.png", label: "我的收藏", tip: "已收藏模板" },
      { key: "downloads", iconPath: "/assets/icons/download.png", label: "下载记录", tip: "最近获取" },
      { key: "about", iconPath: "/assets/icons/info.png", label: "关于模板宝", tip: "v0.11.0" },
      { key: "feedback", iconPath: "/assets/icons/feedback.png", label: "意见反馈", tip: "帮助改进" },
      { key: "deleteAccount", iconPath: "/assets/icons/logout-red.png", label: "注销账号", tip: "删除个人数据" }
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

  confirmDeleteAccount() {
    const app = getApp();
    const ready = app && app.ensureLogin ? app.ensureLogin() : Promise.resolve();
    ready
      .then(() => deleteAccount())
      .then(() => {
        if (app && app.logout) app.logout();
        wx.removeStorageSync("favIds");
        this.setData({
          favCount: 0,
          downloadCount: 0,
          userSub: "账号已注销，重新进入会自动创建新账号"
        });
        wx.showToast({ title: "个人数据已删除", icon: "none" });
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || "注销失败", icon: "none" });
      });
  },

  onStat(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "favorites") wx.navigateTo({ url: "/pages/favorites/favorites" });
    if (key === "downloads") wx.navigateTo({ url: "/pages/downloads/downloads" });
  },

  onMenu(event) {
    const key = event.currentTarget.dataset.key;    if (key === "favorites") {
      wx.navigateTo({ url: "/pages/favorites/favorites" });
      return;
    }
    if (key === "downloads") {
      wx.navigateTo({ url: "/pages/downloads/downloads" });
      return;
    }
    if (key === "deleteAccount") {
      wx.showModal({
        title: "注销账号",
        content: "将删除收藏、下载记录、浏览记录等个人数据，且不可恢复。确定继续？",
        confirmText: "注销",
        confirmColor: "#d93025",
        success: (result) => {
          if (result.confirm) this.confirmDeleteAccount();
        }
      });
      return;
    }
    if (key === "about") {
      wx.showModal({
        title: "模板宝",
        content: "PPT / Word 模板库\nv0.10.0\n模板仅供学习交流",
        showCancel: false
      });
      return;
    }
    if (key === "feedback") {
      wx.showModal({
        title: "意见反馈",
        content: "欢迎反馈模板需求或问题：\n475008394@qq.com",
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
