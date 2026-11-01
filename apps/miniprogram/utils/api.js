/**
 * 小程序 API 封装。
 * 服务端统一返回 JSON；后续若加 { code, data } 信封，在这里统一拆包。
 */
function getBase() {
  const app = getApp();
  return (app && app.globalData && app.globalData.apiBase) || "https://templio.wdbzk.com/api";
}

function request(path, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBase()}${path}`,
      method: opts.method || "GET",
      data: opts.data,
      timeout: opts.timeout || 10000,
      header: Object.assign({ "content-type": "application/json" }, opts.header || {}),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const body = res.data;
          resolve(body && typeof body === "object" && "data" in body ? body.data : body);
          return;
        }
        reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || "网络请求失败"));
      }
    });
  });
}

function fetchTemplates(params) {
  return request("/templates", { data: params || {} });
}

function fetchTemplateDetail(id) {
  return request(`/templates/${id}`);
}

module.exports = { request, fetchTemplates, fetchTemplateDetail };
