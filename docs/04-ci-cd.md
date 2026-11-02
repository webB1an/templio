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
| API 健康检查 | `GET https://templio.wdbzk.com/health` → `{"ok":true,"version":"0.1.0","commit":"<sha>","db":"ok"}` |
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
| 微信登录 | `POST /api/user/login`（fake code）→ 401「微信登录失败（40029: invalid code）」，证明 AppID/Secret 与微信网络通 |
| 用户收藏 | 测试 token：`/user/me` 200、未登录 401、收藏增/查/删、favoriteCount 1→0 |
| 浏览/复制计数 | 匿名 view → 201、登录 copy → 201；`/user/downloads` 返回 1 条；无 token 401 |
| 管理端计数 | 管理端模板列表 `viewCount=1 / copyCount=1`；测试后清理归零 |
| 数据看板 | `/api/admin/stats` 返回 total=13 / published=10 / pendingReview=3 / 总浏览 1935 / 今日互动 / 热门模板 5 条 |
| AI 自动应用 | `/api/admin/ai/auto-apply`（≥0.9）→ 3/3 应用，`needsReview=false`，3 条仍待人工上架 |
| 源文件上传 | `templio upload --with-source` → `source` 暂存 `/storage/private/sources/<hash8>/`，大小 68688 字节 |
| 源文件下载 | `GET /api/admin/templates/:id/source` → 200，`Content-Disposition` 中文文件名正确 |
| 源文件清理 | `DELETE .../source` → 删除文件与 `TemplateFile` 记录；再次下载 404 |
| 网盘同步任务 | 配置 mock `NETDISK_SYNC_COMMAND` 后：任务 success、短链 302、源文件自动清理 |
| 7 天趋势 | `/api/admin/stats` 返回 7 个 date/views/copies 桶 |
| 存储清理 | 构造 2 个孤儿目录 → dry-run 列出 → `--delete` 删除 → 再次运行 storage 干净 |
| 模板删除 | DELETE 返回 `{deleted:true}`；DB 记录、公开图片目录、私有源文件目录全部清理；统计回到 13/10/3 |
| CSV 导出 | `templates.csv` 3136B / UTF-8 BOM / 13 条；`clicks.csv` 表头正常；无 token → 401 |
| 系统状态 | `/api/admin/system` 返回 Node/运行时长/内存/磁盘/最近备份/version+commit |

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
| 概览 | 模板总数、已上架、待复核、已下架；总浏览/下载/收藏、今日互动；热门模板 Top5；最近更新；分类分布 |
| 模板库 | 搜索 / 状态 / 分类筛选；分页；行内编辑（标题/简介/分类/状态）；单条上下架；批量上下架；删除；封面缩略图；网盘配置；源文件管理；AI 标注；模板/点击 CSV 导出 |
| 网盘配置 | 模板行「网盘」弹窗：选百度/夸克 → 填分享链接/提取码 → 自动生成短链，可复制/移除；同时管理服务器源文件（下载/删除/一键同步） |
| AI 标注 | 模板行「AI」弹窗：DeepSeek 读取 `textContent` 生成标题/分类/标签/简介，显示置信度，可「重新标注」/「应用建议」 |
| AI 批量标注 | 工具栏「AI 批量标注」：一次最多 5 个，自动挑选「已导入/草稿且未标注」的模板，成功后转「待复核」 |
| AI 自动应用 | 工具栏「AI 自动应用」：置信度 ≥90% 且 safe 的建议批量写回模板（最多 20 条），仍保留待复核状态，需人工上架 |
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
| GET | `/api/admin/templates/:id/source` | 下载服务器暂存源文件 |
| DELETE | `/api/admin/templates/:id/source` | 删除服务器暂存源文件 |
| POST | `/api/admin/templates/:id/netdisk/sync` | 创建网盘同步任务 |
| GET | `/api/admin/tasks/:id` | 查询网盘同步任务状态 |
| GET/POST | `/api/admin/storage-accounts` | 网盘账号列表 / 新增 |
| PATCH | `/api/admin/storage-accounts/:id` | 改名 |
| POST | `/api/admin/storage-accounts/:id/default` | 设为默认账号 |
| POST | `/api/admin/storage-accounts/:id/probe` | 探活 |
| DELETE | `/api/admin/storage-accounts/:id` | 删除/停用账号 |
| POST | `/api/admin/storage-accounts/:id/baidu-cookie` | 百度 Cookie 授权 |
| POST | `/api/admin/storage-accounts/:id/quark-auth/start\|finish` | 夸克授权码授权 |
| POST | `/api/admin/ai/templates/:id` | DeepSeek 标注（生成 AiAnalysis） |
| POST | `/api/admin/ai/templates/:id/apply` | 应用 AI 建议（标题/分类/标签/简介） |
| POST | `/api/admin/ai/batch` | 批量标注（一次最多 5 个） |
| POST | `/api/admin/ai/auto-apply` | 自动应用 ≥ 阈值的 AI 建议（默认 0.9） |
| GET | `/api/admin/export/templates.csv` | 导出模板 CSV |
| GET | `/api/admin/export/clicks.csv?days=30` | 导出最近 N 天点击 CSV |

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

### 3.11 小程序静默登录与云端收藏（已上线）

**登录流程：**

```
小程序 onLaunch → wx.login → POST /api/user/login { code }
→ 服务端 jscode2session（MINIPROGRAM_APPID / WECHAT_APP_SECRET）
→ 按 openid upsert User → 下发 HMAC token（30 天）
→ 小程序存本地；所有请求自动带 Authorization
→ 401 时清 token、静默重登并重试一次
```

**收藏接口：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/user/me` | 当前用户 |
| GET | `/api/user/favorites` | 收藏列表（公开模板 DTO + favoritedAt） |
| GET | `/api/user/favorites/:templateId` | 是否已收藏 |
| POST | `/api/user/favorites` | 收藏（favoriteCount +1） |
| DELETE | `/api/user/favorites/:templateId` | 取消收藏（favoriteCount -1） |
| DELETE | `/api/user/me` | 注销账号：删除收藏/下载/浏览个人数据 |

**小程序改动：**

- `app.js`：静默登录 + `ensureLogin(force)`，token 复用/过期重登
- `utils/api.js`：请求自动附带 token，401 自动重登重试；新增登录/收藏 API
- 详情页收藏改为服务端同步；「我的」显示登录状态与收藏数
- 新增「我的收藏」页（封面卡片、取消收藏、空态）

**已验证：**

- fake code 调登录 → 401 `微信登录失败（40029: invalid code）`，说明 AppID/Secret 与微信接口已通
- 测试用户 token：`/user/me` 200、无 token 401、收藏增/查/删、模板 favoriteCount 1→0
- 小程序静态检查 8 个页面通过；真实登录需在开发者工具/真机用 `wx.login` 的 code，无感完成

### 3.12 浏览/下载统计与下载记录（已上线）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/templates/:id/click` | 请求体 `{kind:"view"\|"copy"}`；带用户 token 时记录 userId，匿名也计数 |
| GET | `/api/user/downloads` | 最近「复制链接」的模板（按模板去重，含公开 DTO + downloadedAt） |

- `Template.viewCount / copyCount` 累加，同时写 `TemplateClick` 明细
- 小程序：详情页进入记 `view`，复制链接成功记 `copy`
- 「我的」→「下载记录」页可查看已复制过的模板；下载数展示在「我的」统计里
- 管理端模板列表标题下展示「N 浏览 · N 下载」

**已验证：**

- 匿名 view → 201；登录 copy → 201
- 下载记录 `total=1`、无 token → 401
- 管理端 `viewCount=1 / copyCount=1`
- 测试数据清理后计数归零

### 3.13 数据看板与 AI 自动应用（已上线）

**数据看板：**

- `GET /api/admin/stats` 扩展：总浏览/下载/收藏、今日互动（view/copy）、待复核数、热门模板 Top5
- 管理端概览页：
  - 第一行：模板总数 / 已上架 / 待复核 / 已下架
  - 第二行：总浏览 / 总下载 / 总收藏 / 今日互动
  - 热门模板表（封面 + 浏览/下载/收藏）
  - 最近更新、分类分布
  - 近 7 天浏览/下载趋势（纯 CSS 柱状图）

**AI 自动应用：**

- `POST /api/admin/ai/auto-apply` `{minConfidence:0.9, limit:20}`
- 挑选 `needsReview=true`、`safe=true`、`confidence ≥ 阈值`、模板处于 `pending_review/imported/draft/ai_processing` 的 AI 结果
- 批量写回标题/分类/标签/简介，应用后 `needsReview=false`
- 状态保持 `pending_review`，仍需人工点「上架」
- 模板库工具栏「AI 自动应用」按钮

**已验证：**

- `/api/admin/stats` → total 13 / published 10 / pendingReview 3 / 总浏览 1935 / 热门模板 5 条
- `/api/admin/ai/auto-apply`（≥0.9）→ 3/3 应用成功；3 条待复核 AI 建议 `needsReview=false`，标题更新为 AI 建议

### 3.14 源文件暂存、下载与清理（已上线）

**流程（当前手动网盘版）：**

```
templio upload <dist> --with-source
→ 服务端校验 sourceBytes/扩展名 → 暂存 storage/private/sources/<hash8>/<文件名>
→ 管理端「网盘」弹窗下载源文件
→ 手动上传百度/夸克网盘，填分享链接/提取码
→ 确认后「删除服务器源文件」
```

| 能力 | 说明 |
| --- | --- |
| CLI | `upload --with-source`，multipart 字段 `source`；上限 80MB；Nginx `client_max_body_size 108m` |
| 导入校验 | 源文件大小需与 `manifest.sourceBytes` 一致；扩展名需匹配格式（pptx/docx） |
| 存储 | `storage/private/sources/<hash8>/`，`TemplateFile.role=source` |
| 管理端 | 「网盘」弹窗显示源文件名/大小；下载（带 token fetch → blob）；删除 |
| 接口 | `GET/DELETE /api/admin/templates/:id/source` |

**已验证：**

- 上传 68688 字节源文件 → 管理端 DTO 返回中文文件名、大小 67 KB
- 下载 → 200，字节数一致，`Content-Disposition` 中文编码正确
- 删除 → `{removed:true}`；文件被删；再次下载 404
- 测试模板与存储目录已清理

### 3.15 网盘同步任务框架（已上线，等网盘账号授权）

**接口：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/admin/templates/:id/netdisk/sync` | 创建 `netdisk_sync` 任务（需源文件） |
| GET | `/api/admin/tasks/:id` | 轮询任务状态/进度/结果 |

**执行逻辑：**

1. 校验模板/源文件/provider
2. 创建 `Task(type=netdisk_sync, status=queued)` 并异步执行
3. 执行服务器命令 `NETDISK_SYNC_COMMAND`，支持 `{file}` / `{provider}` 占位符
4. 命令 stdout 需输出 JSON：`{"url":"https://pan.baidu.com/s/xxx","passcode":"abcd"}`
5. 成功后写 `NetdiskLink` + 短链；`DELETE_SOURCE_AFTER_SYNC !== "false"` 时删除服务器源文件
6. 未配置命令时任务直接 `failed`，提示走手动下载/上传流程

**管理端：**

- 「网盘」弹窗内「同步到网盘」按钮，轮询任务到成功/失败；成功自动刷新模板

**已验证（mock 命令）：**

- 配置 `/tmp/templio-mock-netdisk.sh` 输出固定 JSON
- 任务 `success`，result 含 `shortLink=https://templio.wdbzk.com/r/eb991c7e98`
- 模板 `hasNetdisk=true`、`passcode=sync`、`source=null`；短链 302 到 mock 地址
- 测试后已移除 mock 环境变量与脚本并重启 API

> 接入真实百度/夸克 Skill 时，只需在服务器 `.env` 配置 `NETDISK_SYNC_COMMAND`，无需改代码。

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
2. 百度网盘 / 夸克网盘官方 Skill 安装与账号授权，并配置 `NETDISK_SYNC_COMMAND`（任务框架已就绪）
3. 数据库备份 / 监控告警 / 日志轮转
4. 数据趋势图/周报与自动上架阈值配置（当前只有 Top5 与今日汇总）

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
| 上传源文件中文名乱码 | multipart filename 被 busboy 按 latin1 解码 | 服务端按 latin1→UTF-8 还原，失败保留原值 |
| 微信登录报「服务端未配置 AppID/AppSecret」，但 `.env` 里有值 | PM2 带着空值环境启动，dotenv 默认不覆盖已存在的空变量 | `main.ts` 改为 `dotenv.config({ override: true })`，以 `.env` 为准 |
| PM2 显示 errored 但日志为空 | 应用启动即崩，PM2 日志未落盘 | 手动 `node dist/main.js` 捕获真实报错 |
