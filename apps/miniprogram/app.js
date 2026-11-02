const { loginWithCode } = require("./utils/api");

App({
  globalData: {
    // 生产 API（需在微信公众平台配置 request 合法域名）
    apiBase: "https://templio.wdbzk.com/api",
    appName: "模板宝",
    theme: "light",
    token: "",
    user: null
  },

  onLaunch() {
    // 静默登录：进入小程序即用 wx.login 的 code 换 openid / token
    this.ensureLogin().catch((error) => {
      console.warn("[templio] 微信登录失败：", error && error.message ? error.message : error);
    });
  },

  /**
   * 保证已登录（静默、无感）。
   * - 本地有 token 直接复用
   * - 没有 token 时走 wx.login -> /api/user/login
   * - force=true 忽略本地 token 重新登录（用于 token 过期）
   */
  ensureLogin(force) {
    // 已有登录请求在进行时复用它，避免多个 401 同时触发多次 wx.login
    if (this.loginPromise) return this.loginPromise;
    const cachedToken = wx.getStorageSync("userToken") || "";
    if (!force && cachedToken) {
      this.globalData.token = cachedToken;
      this.globalData.user = wx.getStorageSync("userInfo") || null;
      return Promise.resolve({ token: cachedToken, user: this.globalData.user });
    }

    this.loginPromise = new Promise((resolve, reject) => {
      wx.login({
        success: (result) => {
          if (!result.code) {
            reject(new Error("微信登录失败：未返回 code"));
            return;
          }
          loginWithCode(result.code)
            .then((data) => {
              if (!data || !data.token) {
                reject(new Error("微信登录失败：服务端未返回 token"));
                return;
              }
              wx.setStorageSync("userToken", data.token);
              if (data.user) wx.setStorageSync("userInfo", data.user);
              this.globalData.token = data.token;
              this.globalData.user = data.user || null;
              resolve(data);
            })
            .catch(reject);
        },
        fail: (error) => {
          reject(new Error((error && error.errMsg) || "微信登录失败"));
        }
      });
    });

    this.loginPromise.catch(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  },

  logout() {
    wx.removeStorageSync("userToken");
    wx.removeStorageSync("userInfo");
    this.globalData.token = "";
    this.globalData.user = null;
    this.loginPromise = null;
  }
});
