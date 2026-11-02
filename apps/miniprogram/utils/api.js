/**
 * 小程序 API 封装。
 * 服务端统一返回 JSON；后续若加 { code, data } 信封，在这里统一拆包。
 * 登录：进入小程序由 app.js 静默 wx.login，token 存本地并自动附带。
 */
function getBase() {
  const app = getApp();
  return (app && app.globalData && app.globalData.apiBase) || "https://templio.wdbzk.com/api";
}

function request(path, options, retried) {
  const opts = options || {};
  const withAuth = opts.auth !== false;
  const token = withAuth ? wx.getStorageSync("userToken") || "" : "";

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBase()}${path}`,
      method: opts.method || "GET",
      data: opts.data,
      timeout: opts.timeout || 15000,
      header: Object.assign(
        { "content-type": "application/json" },
        token ? { authorization: `Bearer ${token}` } : {},
        opts.header || {}
      ),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const body = res.data;
          resolve(body && typeof body === "object" && "data" in body ? body.data : body);
          return;
        }
        // token 过期：清掉本地 token，静默重登后重试一次
        if (res.statusCode === 401 && withAuth && !retried) {
          const app = getApp();
          wx.removeStorageSync("userToken");
          if (app && app.ensureLogin) {
            app
              .ensureLogin(true)
              .then(() => request(path, opts, true))
              .then(resolve)
              .catch(reject);
            return;
          }
        }
        const message =
          res.data && typeof res.data === "object" && res.data.message
            ? res.data.message
            : `HTTP ${res.statusCode}`;
        reject(new Error(message));
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || "网络请求失败"));
      }
    });
  });
}

/* ---------------- 模板 ---------------- */

function fetchTemplates(params) {
  return request("/templates", { data: params || {} });
}

function fetchTemplateDetail(id) {
  return request(`/templates/${id}`);
}

function fetchFacets() {
  return request("/templates/facets");
}

function recordClick(templateId, kind) {
  return request(`/templates/${templateId}/click`, {
    method: "POST",
    data: { kind: kind || "view" }
  });
}

/* ---------------- 用户 / 登录 ---------------- */

function loginWithCode(code) {
  return request("/user/login", { method: "POST", data: { code }, auth: false });
}

function fetchMe() {
  return request("/user/me");
}

function deleteAccount() {
  return request("/user/me", { method: "DELETE" });
}

/* ---------------- 收藏 ---------------- */

function fetchFavorites() {
  return request("/user/favorites");
}

function fetchDownloads() {
  return request("/user/downloads");
}

function fetchFavoriteStatus(templateId) {
  return request(`/user/favorites/${templateId}`);
}

function addFavorite(templateId) {
  return request("/user/favorites", { method: "POST", data: { templateId } });
}

function removeFavorite(templateId) {
  return request(`/user/favorites/${templateId}`, { method: "DELETE" });
}

module.exports = {
  request,
  loginWithCode,
  fetchMe,
  deleteAccount,
  fetchTemplates,
  fetchTemplateDetail,
  fetchFacets,
  fetchFavorites,
  fetchDownloads,
  fetchFavoriteStatus,
  addFavorite,
  removeFavorite,
  recordClick
};
