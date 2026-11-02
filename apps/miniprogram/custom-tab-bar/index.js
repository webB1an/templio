Component({
  data: {
    selected: 0,
    tabs: [
      {
        pagePath: "/pages/index/index",
        text: "首页",
        icon: "/assets/icons/home.png",
        iconActive: "/assets/icons/home-active.png"
      },
      {
        pagePath: "/pages/category/category",
        text: "分类",
        icon: "/assets/icons/category.png",
        iconActive: "/assets/icons/category-active.png"
      },
      {
        pagePath: "/pages/mine/mine",
        text: "我的",
        icon: "/assets/icons/mine.png",
        iconActive: "/assets/icons/mine-active.png"
      }
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
