const { getNavMetrics } = require("../../utils/layout");
const { fetchDownloads } = require("../../utils/api");

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

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
  },

  onShow() {
    this.loadDownloads();
  },

  loadDownloads() {
    const app = getApp();
    this.setData({ loading: true });
    const ready = app && app.ensureLogin ? app.ensureLogin() : Promise.resolve();
    ready
      .then(() => fetchDownloads())
      .then((data) => {
        const items = ((data && data.items) || []).map((item) =>
          Object.assign({}, item, { downloadedText: formatDate(item.downloadedAt) })
        );
        this.setData({ items, loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "下载记录加载失败", icon: "none" });
      });
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: "/pages/mine/mine" });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  onShareAppMessage() {
    return { title: "模板宝 · 下载记录", path: "/pages/downloads/downloads" };
  }
});
