Component({
  data: {
    selected: 0,
    tabs: [
      { pagePath: "/pages/index/index", text: "首页", icon: "⌂" },
      { pagePath: "/pages/category/category", text: "分类", icon: "▦" },
      { pagePath: "/pages/mine/mine", text: "我的", icon: "◍" }
    ]
  },

  methods: {
    onTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      const tab = this.data.tabs[index];
      if (!tab) return;
      wx.switchTab({ url: tab.pagePath });
      this.setData({ selected: index });
    }
  }
});
