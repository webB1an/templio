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
| 概览 | 模板总数、已上架、待处理、已下架；最近更新；分类分布 |
| 模板库 | 搜索 / 状态 / 分类筛选，分页；编辑标题/简介/分类/状态；单条与批量上下架；封面缩略图 |
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
