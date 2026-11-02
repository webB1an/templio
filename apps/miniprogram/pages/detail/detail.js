const { TEMPLATES, findTemplate } = require("../../data/mock");
const { getNavMetrics } = require("../../utils/layout");
const {
  fetchTemplateDetail,
  fetchFavoriteStatus,
  addFavorite,
  removeFavorite,
  recordClick
} = require("../../utils/api");

Page({
  data: {
    item: null,
    related: [],
    fav: false,
    favPending: false,
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 64
  },

  onLoad(options) {
    const metrics = getNavMetrics();
    const id = options.id || "demo-01";
    const item = findTemplate(id);
    const related = TEMPLATES.filter((template) => template.id !== item.id).slice(0, 4);

    this.setData({
      item,
      related,
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 24
    });

    this.loadFavoriteState(id);
    this.recordView(id);

    fetchTemplateDetail(id)
      .then((data) => {
        if (data && data.id) {
          this.setData({
            item: data,
            related: Array.isArray(data.related) && data.related.length ? data.related : related
          });
          this.loadFavoriteState(data.id);
          this.recordView(data.id);
        }
      })
      .catch(() => {
        // 接口未就绪时使用 mock
      });
  },

  recordView(id) {
    if (!id || this.viewRecordedFor === id) return;
    this.viewRecordedFor = id;
    recordClick(id, "view").catch(() => {});
  },

  loadFavoriteState(id) {
    const app = getApp();
    if (!app || !app.ensureLogin) return;
    app
      .ensureLogin()
      .then(() => fetchFavoriteStatus(id))
      .then((data) => this.setData({ fav: Boolean(data && data.favorited) }))
      .catch(() => {
        // 静默登录失败时保持未收藏状态
      });
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: "/pages/index/index" });
  },

  copyLink() {
    const item = this.data.item;
    if (!item || !item.shortLink) {
      wx.showToast({ title: "暂无可用下载链接", icon: "none" });
      return;
    }
    const text = item.passcode
      ? `${item.shortLink} 提取码 ${item.passcode}`
      : item.shortLink;
    wx.setClipboardData({
      data: text,
      success() {
        wx.showToast({ title: "已复制，请打开网盘 App 保存", icon: "none" });
      }
    });
    recordClick(item.id, "copy").catch(() => {});
  },

  previewImage(event) {
    const urls = (this.data.item && this.data.item.previewUrls) || [];
    if (!urls.length) return;
    const current = event && event.currentTarget ? event.currentTarget.dataset.src : urls[0];
    wx.previewImage({ current: current || urls[0], urls });
  },

  toggleFav() {
    const item = this.data.item;
    if (!item || !item.id || this.data.favPending) return;
    const nextFav = !this.data.fav;
    this.setData({ fav: nextFav, favPending: true });

    const app = getApp();
    const ready = app && app.ensureLogin ? app.ensureLogin() : Promise.resolve();
    ready
      .then(() => (nextFav ? addFavorite(item.id) : removeFavorite(item.id)))
      .then((data) => {
        this.setData({ fav: Boolean(data && data.favorited), favPending: false });
        wx.showToast({ title: data && data.favorited ? "已收藏" : "已取消收藏", icon: "none" });
      })
      .catch((error) => {
        this.setData({ fav: !nextFav, favPending: false });
        wx.showToast({ title: (error && error.message) || "操作失败", icon: "none" });
      });
  },

  openRelated(event) {
    wx.redirectTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  onShareAppMessage() {
    const item = this.data.item || {};
    return {
      title: item.title || "模板宝 模板",
      path: `/pages/detail/detail?id=${item.id || "demo-01"}`
    };
  },

  onShareTimeline() {
    const item = this.data.item || {};
    return {
      title: item.title || "模板宝 模板",
      query: `id=${item.id || "demo-01"}`
    };
  }
});
