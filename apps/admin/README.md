# 模板宝 · 管理端（Web）

React 19 + Vite 8 + Ant Design 6，构建产物由 Nginx 托管在 `/admin/`。

## 本地开发

```bash
# 仓库根目录
npm install
npm run dev:admin
```

- 开发地址：http://localhost:5174
- `/api` 由 Vite 代理到 `https://templio.wdbzk.com`（可用 `VITE_API_PROXY` 覆盖）
- 登录账号：`admin`，密码见服务器 `apps/api/.env` 的 `ADMIN_PASSWORD`

## 构建

```bash
npm run build -w @templio/admin
# 产物：apps/admin/dist（base 为 /admin/）
```

CI 会在部署时自动构建并同步到服务器 `/www/wwwroot/templio/apps/admin/dist/`。

## 页面

| 页面 | 说明 |
| --- | --- |
| 登录 | 账号密码 → `POST /api/admin/login`，JWT 存 localStorage |
| 概览 | 模板总数/已上架/待复核/已下架；总浏览/下载/收藏/今日互动；热门模板 Top5；7 天趋势；系统状态（Node/内存/磁盘/备份/版本） |
| 网盘账号 | 点击「授权」弹窗展示跳转链接（百度登录页 / 夸克 OAuth），支持打开/复制链接；百度粘贴 Cookie、夸克粘贴授权码；多账号、默认账号、探活、改名、删除 |
| 模板库 | 搜索 / 状态 / 分类筛选，分页；编辑标题/简介/分类/状态；单条与批量上下架；删除模板；封面缩略图；网盘链接/提取码配置与短链复制；源文件下载/删除/一键同步；AI 单条/批量标注与应用建议；待复核快捷筛选与 AI 列；模板/点击 CSV 导出 |
| 导入模板 | CLI 导入链路说明、可复制命令、当前限制说明 |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/admin/login` | 登录 |
| GET | `/api/admin/me` | 校验登录态 |
| GET | `/api/admin/stats` | 概览统计 |
| GET | `/api/admin/templates` | 模板列表 |
| PATCH | `/api/admin/templates/:id` | 更新模板 |
| POST | `/api/admin/templates/bulk` | 批量上下架 |
| GET | `/api/admin/facets` | 分类与标签 |
| POST | `/api/admin/import/package` | 物料包导入（multipart） |
| PUT | `/api/admin/templates/:id/netdisk` | 配置网盘链接并生成短链 |
| DELETE | `/api/admin/templates/:id/netdisk` | 移除网盘链接 |
| GET | `/api/admin/templates/:id/source` | 下载服务器暂存源文件 |
| DELETE | `/api/admin/templates/:id/source` | 删除服务器暂存源文件 |
| POST | `/api/admin/templates/:id/netdisk/sync` | 创建网盘同步任务 |
| GET | `/api/admin/tasks/:id` | 查询网盘同步任务 |
| GET/POST | `/api/admin/storage-accounts` | 网盘账号列表 / 新增 |
| PATCH | `/api/admin/storage-accounts/:id` | 账号改名 |
| POST | `/api/admin/storage-accounts/:id/default` | 设为默认 |
| POST | `/api/admin/storage-accounts/:id/probe` | 探活 |
| DELETE | `/api/admin/storage-accounts/:id` | 删除账号 |
| POST | `/api/admin/storage-accounts/:id/baidu-cookie` | 百度 Cookie 授权 |
| POST | `/api/admin/storage-accounts/:id/quark-auth/start` | 夸克授权开始 |
| POST | `/api/admin/storage-accounts/:id/quark-auth/finish` | 夸克授权完成 |
| POST | `/api/admin/ai/templates/:id` | DeepSeek 标注 |
| POST | `/api/admin/ai/templates/:id/apply` | 应用 AI 建议 |
| POST | `/api/admin/ai/batch` | 批量标注（最多 5 个） |
| POST | `/api/admin/ai/auto-apply` | 自动应用 ≥ 阈值的 AI 建议 |
| GET | `/api/admin/export/templates.csv` | 导出模板 CSV |
| GET | `/api/admin/export/clicks.csv?days=30` | 导出点击 CSV |
