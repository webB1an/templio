# 模板宝 · 小程序

微信原生小程序（JS），液态玻璃 UI。当前已接真实模板数据：

- 页面：首页 / 搜索 / 分类 / 列表 / 详情 / 我的 / 我的收藏
- 自定义玻璃 TabBar、自定义导航栏
- 进入小程序即 **微信静默登录**（`wx.login` → openid → 30 天 token），无需授权弹窗；401 自动重登
- 收藏已改为**服务端同步**，详情页收藏/取消、「我的收藏」页均可增删
- 数据优先请求 `https://templio.wdbzk.com/api/templates`，接口未就绪时回退 `data/mock.js`
- 列表/搜索结果展示真实封面图（`coverUrl`），详情页展示封面与预览图（`previewUrls`），无图时回退渐变占位
- 详情页「复制链接和提取码」已接剪贴板

## 本地预览

1. 用微信开发者工具导入本目录 `apps/miniprogram`
2. AppID 已写在 `project.config.json`（`wx5f21980e48e92ae6`）
3. 详情页/接口调试：开发阶段已关闭「校验合法域名」（`urlCheck: false`）
4. 真机预览前，需要在微信公众平台把 `https://templio.wdbzk.com` 加入 **request 合法域名**

## 待接接口

| 页面 | 接口 | 状态 |
| --- | --- | --- |
| 首页/列表 | `GET /api/templates` | ✅ 已接入（失败回退 mock） |
| 详情 | `GET /api/templates/:id` | ✅ 已接入 |
| 分类 | `GET /api/templates/facets` | ✅ 已接入 |
| 搜索 | `GET /api/templates?q=` | ✅ 已接入 |
| 登录 | `POST /api/user/login` | ✅ 静默登录（openid） |
| 收藏 | `GET/POST/DELETE /api/user/favorites` | ✅ 已接服务端 |

> 网盘链接由管理端配置；配置后详情页会复制短链（`/r/xxx` 302 到网盘）+ 提取码。当前演示数据中的链接为占位地址，真实模板需在管理端替换。

## 设计说明

- 玻璃只用于控制层（导航、搜索、chip、TabBar、信息卡、获取卡），不铺满内容卡片
- 背景光斑保证玻璃有内容可模糊；`backdrop-filter` 不支持时靠半透明白 + 边框 + 阴影降级
- 图标暂用 Unicode 字符，后续可替换为线性图标
