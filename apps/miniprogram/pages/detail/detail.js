const { TEMPLATES, findTemplate } = require("../../data/mock");
const { getNavMetrics } = require("../../utils/layout");
const { fetchTemplateDetail } = require("../../utils/api");

Page({
  data: {
    item: null,
    related: [],
    fav: false,
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
    const favIds = wx.getStorageSync("favIds") || [];

    this.setData({
      item,
      related,
      fav: favIds.indexOf(item.id) >= 0,
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 24
    });

    fetchTemplateDetail(id)
      .then((data) => {
        if (data && data.id) this.setData({ item: data });
      })
      .catch(() => {
        // 接口未就绪时使用 mock
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
  },

  toggleFav() {
    const item = this.data.item;
    if (!item) return;
    let favIds = wx.getStorageSync("favIds") || [];
    const nextFav = !this.data.fav;
    favIds = nextFav
      ? favIds.concat(item.id).filter((id, index, arr) => arr.indexOf(id) === index)
      : favIds.filter((id) => id !== item.id);
    wx.setStorageSync("favIds", favIds);
    this.setData({ fav: nextFav });
    wx.showToast({ title: nextFav ? "已收藏" : "已取消收藏", icon: "none" });
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
  }
});
