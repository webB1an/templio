const { TEMPLATES } = require("../../data/mock");
const { getNavMetrics } = require("../../utils/layout");
const { fetchTemplates } = require("../../utils/api");

const HOT_KEYWORDS = ["答辩 PPT", "商务汇报", "简历", "合同", "教学课件", "工作总结"];
const HISTORY_KEY = "searchHistory";

Page({
  data: {
    keyword: "",
    inputValue: "",
    results: [],
    hasSearched: false,
    autoFocus: true,
    hotKeywords: HOT_KEYWORDS,
    history: [],
    navTop: 20,
    navHeight: 44,
    menuRight: 96,
    contentTop: 96
  },

  onLoad() {
    const metrics = getNavMetrics();
    const history = wx.getStorageSync(HISTORY_KEY) || [];
    this.setData({
      navTop: metrics.statusBarHeight,
      navHeight: metrics.navHeight,
      menuRight: metrics.menuRight,
      contentTop: metrics.statusBarHeight + metrics.navHeight + 28,
      history: Array.isArray(history) ? history : []
    });
  },

  onInput(event) {
    const value = event.detail.value || "";
    this.setData({ inputValue: value });
    this.runSearch(value, false);
  },

  onConfirm(event) {
    const value = (event.detail.value || this.data.inputValue || "").trim();
    this.runSearch(value, true);
    this.setData({ autoFocus: false });
  },

  onClearInput() {
    this.setData({
      inputValue: "",
      keyword: "",
      results: [],
      hasSearched: false,
      autoFocus: true
    });
  },

  onCancel() {
    wx.navigateBack();
  },

  onHotTap(event) {
    this.applyKeyword(event.currentTarget.dataset.keyword);
  },

  onHistoryTap(event) {
    this.applyKeyword(event.currentTarget.dataset.keyword);
  },

  onClearHistory() {
    wx.removeStorageSync(HISTORY_KEY);
    this.setData({ history: [] });
  },

  applyKeyword(keyword) {
    const value = String(keyword || "").trim();
    if (!value) return;
    this.setData({ inputValue: value, autoFocus: false });
    this.runSearch(value, true);
  },

  runSearch(rawKeyword, saveHistory) {
    const keyword = String(rawKeyword || "").trim();
    const normalized = keyword.toLowerCase();

    let results = [];
    if (keyword) {
      results = TEMPLATES.filter((item) => {
        const haystack = `${item.title} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
        return haystack.indexOf(normalized) >= 0;
      });
    }

    this.setData({
      keyword,
      results,
      hasSearched: keyword.length > 0
    });

    if (saveHistory && keyword) {
      const previous = wx.getStorageSync(HISTORY_KEY) || [];
      const history = [keyword]
        .concat(previous.filter((item) => item !== keyword))
        .slice(0, 10);
      wx.setStorageSync(HISTORY_KEY, history);
      this.setData({ history });
    }

    if (saveHistory && keyword) this.loadRemote(keyword);
  },

  loadRemote(keyword) {
    fetchTemplates({ q: keyword })
      .then((data) => {
        const list = Array.isArray(data) ? data : data && data.items;
        if (list && list.length) this.setData({ results: list });
      })
      .catch(() => {
        // 接口未就绪时使用 mock 结果
      });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  onShareAppMessage() {
    return { title: "模板宝 · 模板搜索", path: "/pages/search/search" };
  },

  onShareTimeline() {
    return { title: "模板宝 · 模板搜索" };
  }
});
