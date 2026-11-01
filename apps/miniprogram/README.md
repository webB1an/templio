# 模板宝 · 小程序

微信原生小程序（JS），液态玻璃 UI。当前为 **P0 演示版**：

- 页面：首页 / 搜索 / 分类 / 列表 / 详情 / 我的
- 自定义玻璃 TabBar、自定义导航栏
- 数据优先请求 `https://templio.wdbzk.com/api/templates`，接口未就绪时回退 `data/mock.js`
- 详情页「复制链接和提取码」已接剪贴板与收藏本地存储

## 本地预览

1. 用微信开发者工具导入本目录 `apps/miniprogram`
2. AppID 已写在 `project.config.json`（`wx5f21980e48e92ae6`）
3. 详情页/接口调试：开发阶段已关闭「校验合法域名」（`urlCheck: false`）
4. 真机预览前，需要在微信公众平台把 `https://templio.wdbzk.com` 加入 **request 合法域名**

## 待接接口

| 页面 | 接口 | 状态 |
| --- | --- | --- |
| 首页/列表 | `GET /api/templates` | 服务端待实现，先用 mock |
| 详情 | `GET /api/templates/:id` | 服务端待实现，先用 mock |
| 登录 | `POST /api/user/login` | 待实现 |
| 收藏 | `GET/POST /api/user/favorites` | 待实现 |

## 设计说明

- 玻璃只用于控制层（导航、搜索、chip、TabBar、信息卡、获取卡），不铺满内容卡片
- 背景光斑保证玻璃有内容可模糊；`backdrop-filter` 不支持时靠半透明白 + 边框 + 阴影降级
- 图标暂用 Unicode 字符，后续可替换为线性图标
