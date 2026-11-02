const { getNavMetrics } = require("../../utils/layout");
const { fetchFavorites, removeFavorite } = require("../../utils/api");

Page({
  data: {
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96,
    items: [],
    loading: true
  },

  onLoad() {
    const metrics = getNavMetrics();
    this.setData({
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 28
    });
    this.loadFavorites();
  },

  loadFavorites() {
    const app = getApp();
    this.setData({ loading: true });
    const ready = app && app.ensureLogin ? app.ensureLogin() : Promise.resolve();
    ready
      .then(() => fetchFavorites())
      .then((data) => {
        this.setData({ items: (data && data.items) || [], loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "收藏加载失败", icon: "none" });
      });
  },

  onPullDownRefresh() {
    this.loadFavorites();
    setTimeout(() => wx.stopPullDownRefresh(), 800);
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: "/pages/index/index" });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  onOpenCard(event) {
    const id = event.detail && event.detail.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onRemoveCard(event) {
    const id = event.detail && event.detail.id;
    if (!id) return;
    removeFavorite(id)
      .then(() => {
        this.setData({ items: this.data.items.filter((item) => item.id !== id) });
        wx.showToast({ title: "已取消收藏", icon: "none" });
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || "操作失败", icon: "none" });
      });
  },

  onShareAppMessage() {
    return { title: "模板宝 · 我的收藏", path: "/pages/favorites/favorites" };
  },

  onShareTimeline() {
    return { title: "模板宝 · 我的收藏" };
  }
});
