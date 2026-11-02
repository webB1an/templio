# 模板宝 · CI / CD 与提交规范

> CI/CD 已上线并完成首次真实部署（2026-11-01）。
> 文件：`.github/workflows/ci.yml`、`.github/workflows/deploy.yml`

---

## 1. 提交规范（Conventional Commits）

格式：

```
<type>(<scope>): <subject>
```

类型：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`。

常用 scope：`cli` / `shared` / `api` / `admin` / `miniprogram` / `ci` / `deploy` / `deps` / `docs`。

示例：

```
feat(cli): 支持 PPT/Word 批量渲染为标准物料包
fix(deploy): 服务器端按本机 OpenSSL target 重新生成 Prisma Client
ci: 增加渲染冒烟测试
```

**三层校验：**

| 层 | 机制 |
| --- | --- |
| 本地提交 | husky `commit-msg` → commitlint（`npm install` 时自动安装） |
| CI | `ci.yml` 的 `commitlint` job（wagoid/commitlint-github-action） |
| 配置 | `commitlint.config.mjs`（标题 ≤100 字符，正文 ≤200 字符/行） |

---

## 2. CI（`.github/workflows/ci.yml`）

触发：push 到 `main`、所有 PR。

| Job | 内容 |
| --- | --- |
| `commitlint` | 校验提交信息 |
| `verify` | `npm ci` → `npm run typecheck` → `npm run build`（shared / cli / api） |
| `render-smoke` | 安装 LibreOffice + Noto CJK 字体 → 生成测试模板 → 渲染 → 校验物料包 |

CI 使用 Node.js 22，依赖 npm 缓存。

---

## 3. CD（`.github/workflows/deploy.yml`）

触发：push 到 `main`、手动 `workflow_dispatch`。

```
checkout → npm ci → build（shared / cli / api）
  → 安装 api + shared 的生产依赖（仅 CI 侧，不碰服务器）
  → 检测 apps/api/dist、apps/admin/dist
  → 检测 GitHub Secrets
  → SSH mkdir 目标目录
  → rsync：dist / prisma / node_modules / package 清单 / deploy / scripts
  → SSH 执行 deploy/server/deploy.sh
       1. 校验 node_modules（缺失则报错，不在服务器安装）
       2. 加载 apps/api/.env
       3. npx prisma generate（按服务器本机 target 重新生成）
       4. npx prisma migrate deploy
       5. pm2 startOrReload + pm2 save
       6. curl /health 健康检查（30s 超时则失败）
```

**关键设计（针对 2C2G 服务器）：**

- **服务器上不执行 `npm install`**：依赖在 CI 安装后随 rsync 同步，避免 2G 内存被 npm 安装过程拖垮。
- **Prisma Client 在服务器上重新生成**：CI runner（debian-openssl-3.0.x）与服务器（debian-openssl-1.0.x）平台不同，必须按服务器 target 生成，否则运行时报找不到 query engine。
- **rsync 使用 `--no-owner --no-group`**：避免把 GitHub runner 的 uid 映射成服务器上的 `mysql` 用户。
- **同步 `scripts/` 目录**：根 `prepare` 脚本依赖 `scripts/git-hooks/install.mjs`，缺失会导致服务器安装阶段失败（已保留容错）。

### 3.1 GitHub Secrets（已配置）

仓库 **Settings → Secrets and variables → Actions**：

| Secret | 说明 |
| --- | --- |
| `DEPLOY_HOST` | 服务器地址（不写入仓库） |
| `DEPLOY_USER` | SSH 用户 |
| `DEPLOY_SSH_KEY` | 部署私钥完整内容 |
| `DEPLOY_PORT` | 可选，默认 22 |
| `DEPLOY_PATH` | 可选，默认 `/www/wwwroot/templio` |

> 私钥、服务器 IP 等敏感信息不写入仓库；GitHub Actions 使用加密 Secrets 注入。

**跳过逻辑**：如果 `apps/api/dist` 与 `apps/admin/dist` 都不存在，或 Secrets 未配置，部署会输出 notice 并安全跳过。

### 3.2 服务器初始化（已执行）

```bash
APP_ROOT=/www/wwwroot/templio bash deploy/server/bootstrap.sh
```

脚本创建目录、检查 Node/PM2/Nginx/MySQL/rsync/curl、配置 PM2 开机自启（幂等）。

服务器目录：

```
/www/wwwroot/templio/
├── apps/api/          # 服务端（dist/ + package.json + prisma/ + .env）
├── apps/admin/       # 管理端静态产物（待实现）
├── node_modules/     # 由 CI 同步的生产依赖
├── packages/shared/  # 跨端共享包
├── deploy/           # 部署脚本、PM2 配置、Nginx 示例
├── scripts/          # git hooks 等脚本
├── logs/             # PM2 日志
└── storage/          # 封面/预览图 + 源文件临时区
```

### 3.3 服务器环境变量（已配置）

```bash
cp deploy/production.env.example /www/wwwroot/templio/apps/api/.env
chmod 600 /www/wwwroot/templio/apps/api/.env
# 已填入 DATABASE_URL / DEEPSEEK_API_KEY / JWT_SECRET / ADMIN_PASSWORD / APP_ORIGIN
```

`.env` 不在 rsync 范围内，部署不会覆盖，也不进入 Git。

### 3.4 回滚

当前采用"重新部署旧提交"的方式：

```bash
git revert <bad-commit>
git push origin main
```

后续可扩展为 `releases/<sha>` + `current` 软链的原子发布。

### 3.5 线上验收（2026-11-02）

| 项 | 结果 |
| --- | --- |
| API 健康检查 | `GET https://templio.wdbzk.com/health` → `{"ok":true,"service":"templio-api","db":"ok"}` |
| API 根路由 | `GET https://templio.wdbzk.com/api` → `{"service":"templio-api","status":"ok"}` |
| HTTP → HTTPS | 301 跳转正常 |
| TLS 证书 | Let's Encrypt（acme.sh 自动续期，到期 2027-01-30） |
| 数据库 | MySQL 8 `templio`，Prisma 迁移已应用（14 张表） |
| PM2 | `templio-api` online，内存约 105MB，0 次重启 |
| 开机自启 | `pm2-root.service` enabled / active |
| 模板列表 | `GET /api/templates?limit=2` → 8 条演示模板，含 `shortLink` / `passcode` |
| 模板详情 | `GET /api/templates/:id` → 含 `related` 相关推荐 |
| 分类聚合 | `GET /api/templates/facets` → 7 个分类与标签 |
| 短链跳转 | `GET /r/demo01` → 302 `https://pan.baidu.com/s/1demo01` |
| 演示数据 | `seed done: 7 categories, 8 templates` |
| 管理端页面 | `https://templio.wdbzk.com/admin/` → 200 HTML，JS/CSS 资源 200 |
| 管理端登录 | `POST /api/admin/login` → 返回 token；`/api/admin/templates` 可读 |
| 管理端上下架 | PATCH 状态后公开接口总数 8 → 7 → 8（已验证并恢复） |
| CLI 导入 | `templio upload` 导入 2 个物料包 → `imported` 2 条 |
| 导入封面 | 上架后公开接口 total 10；封面 `/assets/templates/<hash8>/cover.webp` → 200 image/webp |
| 重复导入 | 同一物料包再次上传 → `duplicate`，不重复创建 |
| 网盘配置 | `PUT /api/admin/templates/:id/netdisk` → 返回 `shortLink` / `passcode` / `hasNetdisk` |
| 公开详情 | 配置后 `/api/templates/:id` 返回 `shortLink` + `passcode`，详情页可复制 |
| 短链跳转 | `/r/0b1a5f71fa` → 302 `https://pan.baidu.com/s/1templio-contract` |
| AI 标注 | `POST /api/admin/ai/templates/:id` → 标题「技术服务合同模板」/ 分类「合同文书」/ 3 标签 / 置信度 0.97 |
| AI 应用 | `POST .../apply` → 模板标题/分类/标签写回数据库（published 保持上架） |
| AI 批量标注 | `POST /api/admin/ai/batch {"limit":3}` → 3/3 成功；3 条转「待复核」，公开总数保持 10 |
| 新导入封面 | 3 个新导入模板 `/assets/templates/<hash8>/cover.webp` 均生成 |

### 3.6 公开 API（已上线）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/templates` | 模板列表；支持 `q` / `category`（slug）/ `tag` / `limit` / `offset` |
| GET | `/api/templates/facets` | 分类与标签聚合（小程序分类 chips 使用） |
| GET | `/api/templates/:id` | 模板详情（含 `related` 相关推荐） |
| GET | `/r/:code` | 网盘短链跳转（302），Nginx 重写到 `/api/r/:code` |

返回字段与小程序页面 DTO 对齐：`id/title/category/categoryKey/format/pageCount/sizeText/tags/tone/summary/coverUrl/previewUrls/shortLink/passcode`。

### 3.7 演示数据（seed）

```bash
cd /www/wwwroot/templio/apps/api
set -a; . ./.env; set +a
node prisma/seed.cjs
```

幂等：按 `sourceHash` / `category.slug` / `tag.name` / `shortLink.code` upsert。seed 中的网盘链接为占位地址（`pan.baidu.com/s/1demoXX`），接入真实模板后由管理端替换。

### 3.8 管理端（已上线）

- 地址：<https://templio.wdbzk.com/admin/>
- 账号：`admin`
- 密码：服务器 `/www/wwwroot/templio/apps/api/.env` 中的 `ADMIN_PASSWORD`

**功能（P0）：**

| 页面 | 能力 |
| --- | --- |
| 登录 | 账号密码登录，JWT（HMAC-SHA256）12 小时有效 |
| 概览 | 模板总数、已上架、待处理、已下架；最近更新；分类分布 |
| 模板库 | 搜索 / 状态 / 分类筛选；分页；行内编辑（标题/简介/分类/状态）；单条上下架；批量上下架；封面缩略图 |
| 网盘配置 | 模板行「网盘」弹窗：选百度/夸克 → 填分享链接/提取码 → 自动生成短链，可复制/移除 |
| AI 标注 | 模板行「AI」弹窗：DeepSeek 读取 `textContent` 生成标题/分类/标签/简介，显示置信度，可「重新标注」/「应用建议」 |
| AI 批量标注 | 工具栏「AI 批量标注」：一次最多 5 个，自动挑选「已导入/草稿且未标注」的模板，成功后转「待复核」 |
| 待复核队列 | 工具栏「待复核」快捷筛选；列表新增 AI 列展示建议标题/分类/置信度 |
| 导入模板 | CLI 导入链路说明、可复制命令、当前限制说明 |

**相关接口：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/admin/login` | 账号密码登录 |
| GET | `/api/admin/me` | 校验登录态 |
| GET | `/api/admin/stats` | 概览统计 |
| GET | `/api/admin/templates` | 管理端模板列表 |
| PATCH | `/api/admin/templates/:id` | 更新标题/简介/分类/状态 |
| POST | `/api/admin/templates/bulk` | 批量 `publish` / `offline` |
| GET | `/api/admin/facets` | 分类与标签 |
| POST | `/api/admin/import/package` | 物料包导入（multipart：`manifest` / `text` / `cover` / `thumb` / `previews`） |
| PUT | `/api/admin/templates/:id/netdisk` | 配置网盘链接/提取码并生成短链 |
| DELETE | `/api/admin/templates/:id/netdisk` | 移除网盘链接（短链随之失效） |
| POST | `/api/admin/ai/templates/:id` | DeepSeek 标注（生成 AiAnalysis） |
| POST | `/api/admin/ai/templates/:id/apply` | 应用 AI 建议（标题/分类/标签/简介） |
| POST | `/api/admin/ai/batch` | 批量标注（一次最多 5 个） |

本地开发：`npm run dev:admin`（Vite 5174，`/api` 代理到 `https://templio.wdbzk.com`）。

### 3.9 内容导入链路（已上线）

```bash
# Windows 桌面
templio render D:\templates -o D:\templates-dist
set TEMPLIO_ADMIN_PASSWORD=<服务器 .env 的 ADMIN_PASSWORD>
templio upload D:\templates-dist --api https://templio.wdbzk.com
```

| 环节 | 说明 |
| --- | --- |
| 物料包 | `manifest.json` + `text.json` + `images/{cover,thumb,preview-*.webp}` + 源文件 |
| CLI 上传 | `upload` 命令登录管理端 → 逐包 POST `/api/admin/import/package`（multipart，源文件暂不传） |
| 服务端 | 校验 shared schema → 按 `sourceHash` 去重 → 图片写入 `storage/public/templates/<hash8>/` → 创建 `Template(status=imported)` + `TemplateFile` + `textContent` |
| 管理端 | 模板库筛「已导入」→ 可选「AI」生成标题/分类/标签/简介并应用 → 点「网盘」配置链接/提取码（自动生成短链）→ 上架；上架后公开接口返回 `coverUrl` / `previewUrls` / `shortLink` / `passcode` |
| 图片访问 | Nginx `location /assets/ { alias /www/wwwroot/templio/storage/public/; }` |

已验证：导入 2 条 → 配置网盘 → 上架后公开 total 10，封面 200；短链 `/r/0b1a5f71fa` 302 到网盘；重复上传返回 duplicate。

### 3.10 AI 标注（DeepSeek，已上线）

- 服务端 env：`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`（当前 `deepseek-flash`）
- `POST /api/admin/ai/templates/:id`：读取模板 `textContent`（标题/大纲/前几页文字）+ 分类列表 → 调用 DeepSeek 输出 JSON → upsert `AiAnalysis`；`imported` 状态自动转 `pending_review`
- `POST /api/admin/ai/templates/:id/apply`：把建议写回模板标题/简介/分类/标签；`published` 保持上架，其余转 `pending_review`
- `POST /api/admin/ai/batch`：批量标注「已导入/草稿且未标注」的模板，一次最多 5 个，返回逐条成功/失败
- 管理端模板库「AI」弹窗：展示标题/分类/标签/简介/置信度，支持「重新标注」「应用建议」
- 管理端工具栏：「AI 批量标注」+「待复核」快捷筛选；列表 AI 列展示建议标题/分类/置信度

已验证：
- 单条：技术服务合同模板 → 标题「技术服务合同模板」、分类「合同文书」、标签 3 个、置信度 0.97；应用后数据库同步更新。
- 批量：3 个已导入模板 → 3/3 成功（经营分析/business、论文答辩/thesis、求职简历/resume），全部转「待复核」，公开总数保持 10。

---

## 4. 服务器现状（不含敏感信息）

| 项 | 值 |
| --- | --- |
| 系统 | Alibaba Cloud Linux 4 |
| CPU / 内存 / 磁盘 | 2 核 / 1.67G（可用约 520M + 3G swap）/ 40G（已用 12G） |
| Node / npm / PM2 | 22.22.2 / 10.9.7 / 7.1.1 |
| Nginx / MySQL / Redis | 1.30.6 / 8.0.46 / 已运行 |
| 域名 | `templio.wdbzk.com`（HTTPS） |
| 额外负载 | 宝塔面板、MySQL（约 430MB）、Docker（astrbot 容器） |

> 内存仍然偏紧：API 由 PM2 `max_memory_restart: 500M` 兜底；部署时不要在服务器跑 npm/构建。
> 渲染（LibreOffice）只在 Windows 桌面执行，不在服务器上跑。

**待办：**

1. 微信小程序：AppID / AppSecret 已在服务器 `.env` 配置；还需要公众平台下载的「代码上传密钥」才能让 CI 上传体验版
2. 百度网盘 / 夸克网盘官方 Skill 安装与账号授权（目前网盘链接需在管理端手动填写）
3. AI 高置信度自动应用 / 自动上架（当前仍需人工点「应用建议」）
4. 小程序登录 / 收藏接口（当前收藏仅本地存储）
5. 源文件上传 → 网盘同步 → 校验后删除服务器源文件

---

## 5. 本地验证命令

```bash
npm ci
npm run typecheck
npm run build

# 渲染管线冒烟
npm run fixtures
npm run render -- fixtures/samples -o fixtures/packages
npm run status -- fixtures/packages

# 本地起 API（数据库走线上，SSH 隧道，不在本地装 MySQL）
ssh -N -L 13306:127.0.0.1:3306 <ssh-alias>
# 然后在 apps/api/.env 里把 DATABASE_URL 指向 127.0.0.1:13306
npm run dev:api
```

---

## 6. 已踩过的坑（Runbook）

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| Actions 部署 `Sync release` 失败 | 服务器目标子目录不存在 | 部署前 SSH `mkdir -p` 所有目标目录 |
| 服务器文件属主变成 `mysql` | rsync `-a` 保留 CI runner 的 uid(1001) | rsync 加 `--no-owner --no-group` |
| 服务器安装阶段 `Cannot find module scripts/git-hooks/install.mjs` | 未同步 `scripts/` | rsync 同步 scripts 目录；安装脚本加容错 |
| 部署时 npm 把 2C2G 服务器拖死 | 服务器上执行两次 `npm ci` | 依赖改为 CI 侧安装并随 rsync 同步 |
| API 启动报 Prisma query engine 找不到 | CI 与服务器 OpenSSL target 不同 | 部署时在服务器执行 `prisma generate` |
| API 启动报 `ERR_PACKAGE_PATH_NOT_EXPORTED`，PM2 反复 errored | `@templio/shared` 只有 ESM 输出，API 是 CommonJS | shared 增加 `dist-cjs` 双构建 + `exports.require` + `dist-cjs/package.json {"type":"commonjs"}`，部署同步 `dist-cjs/` |
| 导入后封面 URL `/assets/public/templates/...` 404 | objectKey 里多带了一层 `public/`（Nginx `/assets/` 已指向 `storage/public`） | objectKey 改为 `templates/<hash8>/...`，并修正历史数据 |
| 导入新模板报 500 `ENOENT storage/templates/<hash>/cover.webp` | writeFile 路径漏了 `storage/public` 前缀 | 写入使用 `join(STORAGE_ROOT, "public", objectKey)` |
| PM2 显示 errored 但日志为空 | 应用启动即崩，PM2 日志未落盘 | 手动 `node dist/main.js` 捕获真实报错 |
