App({
  globalData: {
    // 生产 API（需在微信公众平台配置 request 合法域名）
    apiBase: "https://templio.wdbzk.com/api",
    appName: "Templio",
    theme: "light"
  },

  onLaunch() {
    // TODO: wx.login -> 服务端 /api/user/login 换 openid / JWT
  }
});
