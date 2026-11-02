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
    loading: true,
    loadError: false,
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 64
  },

  onLoad(options) {
    const metrics = getNavMetrics();
    const id = options.id || "";
    const mockItem = findTemplate(id);
    const related = mockItem
      ? TEMPLATES.filter((template) => template.id !== mockItem.id).slice(0, 4)
      : [];

    this.templateId = id;
    this.setData({
      item: mockItem,
      related,
      loading: !mockItem,
      loadError: false,
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 24
    });

    this.loadFavoriteState(id);
    this.recordView(id);
    this.loadDetail(id);
  },

  loadDetail(id) {
    if (!id) {
      this.setData({ loading: false, loadError: true });
      return Promise.resolve();
    }
    this.setData({ loading: true, loadError: false });
    return fetchTemplateDetail(id)
      .then((data) => {
        if (data && data.id) {
          this.setData({
            item: data,
            related: Array.isArray(data.related) && data.related.length ? data.related : this.data.related,
            loading: false,
            loadError: false
          });
          this.loadFavoriteState(data.id);
          this.recordView(data.id);
        } else {
          this.setData({ loading: false, loadError: !this.data.item });
        }
      })
      .catch(() => {
        this.setData({ loading: false, loadError: !this.data.item });
      });
  },

  retryLoad() {
    this.loadDetail(this.templateId);
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
      wx.showToast({ title: "暂无可用链接", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: item.shortLink,
      success() {
        wx.showToast({ title: "链接已复制", icon: "none" });
      }
    });
    recordClick(item.id, "copy").catch(() => {});
  },

  reportTemplate() {
    wx.showModal({
      title: "举报模板",
      content: "如发现侵权、违规或无法下载的内容，请发送邮件至 475008394@qq.com，并附上模板名称与侵权证据。",
      confirmText: "复制邮箱",
      cancelText: "关闭",
      success: (result) => {
        if (!result.confirm) return;
        wx.setClipboardData({
          data: "475008394@qq.com",
          success() {
            wx.showToast({ title: "邮箱已复制", icon: "none" });
          }
        });
      }
    });
  },

  copyContact() {
    wx.setClipboardData({
      data: "475008394@qq.com",
      success() {
        wx.showToast({ title: "联系邮箱已复制", icon: "none" });
      }
    });
  },

  previewImage(event) {
    const urls = (this.data.item && this.data.item.previewUrls) || [];
    if (!urls.length) return;
    const current = event && event.currentTarget ? event.currentTarget.dataset.src : urls[0];
    wx.previewImage({ current: current || urls[0], urls });
  },

  onCoverError() {
    this.setData({ "item.coverUrl": "" });
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

  onOpenRelatedCard(event) {
    const id = event.detail && event.detail.id;
    if (!id) return;
    wx.redirectTo({ url: `/pages/detail/detail?id=${id}` });
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
