# 模板宝

[![CI](https://github.com/webB1an/templio/actions/workflows/ci.yml/badge.svg)](https://github.com/webB1an/templio/actions/workflows/ci.yml)

PPT / Word 模板库小程序：微信小程序（用户端）+ Web 管理端 + NestJS 服务端 + 桌面批处理 CLI。

> 产品展示名：**模板宝**；仓库名、包名、域名仍保留 `templio` 技术标识（不影响 CI/CD 与已配置的域名）。
>
> 当前阶段：**P0 打样**。服务端、模板公开接口、Web 管理端已上线；小程序搜索/列表/详情已接入真实接口。
> 线上 API：<https://templio.wdbzk.com/health>　管理端：<https://templio.wdbzk.com/admin/>
>
> 规划文档见 `docs/`，交付与运营见 [docs/05-交付与运营手册.md](docs/05-交付与运营手册.md)，验收清单见 [docs/06-验收清单.md](docs/06-验收清单.md)，微信上线与隐私指引见 [docs/07-微信上线与隐私指引.md](docs/07-微信上线与隐私指引.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 目录

```
templio/
├── apps/
│   ├── desktop-cli/      桌面批处理 CLI（LibreOffice 渲染 + 物料包 + 上传）
│   ├── api/              服务端（NestJS + Prisma + MySQL，/health 已就绪）
│   ├── admin/            Web 管理端（React + AntD，已上线）
│   └── miniprogram/      微信原生小程序（液态玻璃 UI，P0 演示已初始化）
├── packages/
│   └── shared/           跨端契约：枚举、物料包 schema、图片规格
├── docs/                 规划与设计文档
├── scripts/              运维 / 验收脚本、git hooks 安装
└── deploy/               部署：服务器 bootstrap、发布脚本、PM2、Nginx 示例
```

## 快速开始

```bash
npm ci

# 类型检查 + 构建（CI 同款）
npm run typecheck
npm run build

# 1. 渲染环境检查（需要 LibreOffice + 中文字体）
npm run doctor

# 2. 生成合成测试模板（真实模板到位后跳过）
npm run fixtures

# 3. 批量渲染 → 标准物料包
npm run render -- fixtures/samples -o fixtures/packages

# 4. 检查物料包完整性
npm run status -- fixtures/packages

# 5. 生产验收（15 项）
TEMPLIO_ADMIN_PASSWORD=<服务器 .env 的 ADMIN_PASSWORD> npm run verify:prod
```

物料包结构（详见 `docs/01-流程确认稿-v1.md` §5）：

```
<dist>/<hash8>-<slug>/
├── manifest.json
├── text.json
├── source/原始文件
└── images/{cover,thumb,preview-01..}.webp
```

| CLI 命令 | 说明 |
| --- | --- |
| `doctor` | 检查 LibreOffice / 中文字体 / Node / 图片预算 |
| `render <srcDir> -o <out>` | 批量渲染：OOXML 抽文字 → LibreOffice 转 PDF → 图片 → 物料包 |
| `status [distDir]` | 校验物料包 manifest 与文件完整性 |
| `upload <distDir>` | 上传物料包（`--with-source` 同时暂存源文件；支持 `--limit` / `--dry-run`） |
| `fixtures` | 生成合成 PPT/Word 测试模板（开发用） |

渲染管线特性：SHA-256 幂等（同文件跳过）、`.ledger.jsonl` 断点账本、LibreOffice 独立 profile 并发、字体名抽取告警、图片体积预算内自动降质。

## 公开 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/templates` | 模板列表（`q` / `category` / `tag` / `limit` / `offset`） |
| GET | `/api/templates/facets` | 分类与标签聚合 |
| GET | `/api/templates/:id` | 模板详情（含相关推荐） |
| GET | `/r/:code` | 网盘短链 302 跳转 |

## 内容导入（桌面 CLI → 服务端）

```bash
# 1. 渲染物料包（Windows 桌面，需要 LibreOffice）
templio render D:\templates -o D:\templates-dist

# 2. 上传（密码建议用环境变量，避免出现在命令行历史）
set TEMPLIO_ADMIN_PASSWORD=服务器 .env 中的 ADMIN_PASSWORD
templio upload D:\templates-dist --api https://templio.wdbzk.com
```

- 物料包按源文件 SHA-256 幂等，重复上传会返回 duplicate，不会重复创建
- 导入后模板状态为 `imported`，在管理端「模板库」复核：可点「AI」让 DeepSeek 生成标题/分类/标签/简介并一键应用，再点「网盘」补齐分享链接/提取码（自动生成短链），最后「上架」
- 封面/缩略图/预览图保存到 `storage/public/templates/<hash8>/`，由 `/assets/` 直出
- `--with-source` 可把源文件暂存到 `storage/private/sources/<hash8>/`；管理端「网盘」弹窗可下载/删除/同步，确认源文件已上传网盘后务必删除服务器源文件
- 配置 `NETDISK_SYNC_COMMAND` 后可在管理端点「同步到网盘」自动上传并回写链接、清理源文件

## 用户登录与收藏

小程序**静默登录**：打开即 `wx.login` → 服务端 `jscode2session` 换 openid → 下发 30 天 token，无需授权弹窗。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/user/login` | 微信 code 换 openid + token |
| GET | `/api/user/me` | 当前用户 |
| GET | `/api/user/favorites` | 收藏列表（含封面/短链） |
| GET | `/api/user/favorites/:templateId` | 是否已收藏 |
| POST | `/api/user/favorites` | 收藏 |
| DELETE | `/api/user/favorites/:templateId` | 取消收藏 |
| POST | `/api/templates/:id/click` | 浏览/复制计数（匿名也记录） |
| GET | `/api/user/downloads` | 下载记录（最近复制的模板） |

## 管理端

- 地址：<https://templio.wdbzk.com/admin/>
- 账号：`admin`，密码在服务器 `/www/wwwroot/templio/apps/api/.env` 的 `ADMIN_PASSWORD`
- 本地开发：`npm run dev:admin`（Vite 5174，`/api` 代理到线上）
- 功能：登录、概览数据看板（模板/浏览/下载/收藏/待复核/热门模板/近 7 天趋势/系统状态）、模板库（筛选 / 编辑 / 单条上下架 / 批量上下架 / 删除 / 网盘链接与短链配置 / 源文件下载与自动同步 / 服务器源文件清理 / AI 单条与批量标注 / AI 自动应用 / 待复核队列 / 模板与点击 CSV 导出）、导入说明

## 小程序

- 目录：`apps/miniprogram`（微信原生 JS + 液态玻璃 UI）
- 用微信开发者工具直接导入该目录（AppID 已写入 `project.config.json`）
- **微信静默登录**：进入小程序自动 `wx.login`，无需用户点击授权；token 失效自动重登
- **云端收藏**：详情页收藏/取消同步服务端，「我的」→ 我的收藏可查看
- **下载记录**：详情页复制下载链接后记录到服务端，「我的」→ 下载记录可查看
- **账号注销**：「我的」→ 注销账号可删除个人收藏/下载/浏览记录
- 生产接口域名：`https://templio.wdbzk.com`（需在微信公众平台配置 request 合法域名）
- 静态检查：`npm run check:miniprogram`（页面四件套 / JSON / JS 语法 / WXML 标签闭合）
- 详细说明：`apps/miniprogram/README.md`

## 约束（个人开发者）

- 服务器：2 核 / 2G / 40G，**不使用 Redis**，图片直出（无 CDN/OSS）
- 源文件上传网盘并校验后**立即删除**，服务器只保留封面/预览/文字
- 渲染在 Windows 桌面完成，服务器只做存储、任务调度与小体积图片分发

详见 `docs/03-资源受限部署修订.md`。

## CI / CD

- **CI**（`.github/workflows/ci.yml`）：提交信息校验 + typecheck/build + LibreOffice 渲染管线冒烟测试
- **CD**（`.github/workflows/deploy.yml`）：push 到 `main` 自动构建并部署（API + 管理端 + PM2 + 数据库迁移 + 健康检查）
- **服务器初始化**：`APP_ROOT=/www/wwwroot/templio bash deploy/server/bootstrap.sh`
- 部署细节与 GitHub Secrets 配置见 [docs/04-ci-cd.md](docs/04-ci-cd.md)

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)，本地 husky `commit-msg` 钩子与 CI commitlint 双重校验。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

```
feat(cli): 支持 PPT/Word 批量渲染为标准物料包
fix(cli): 修复 Windows 下 soffice 版本探测失败
ci: 增加渲染冒烟测试
```

## 文档

- [00 思路可行性与流程拷打](docs/00-思路可行性与流程拷打.md)
- [01 流程确认稿 v1](docs/01-流程确认稿-v1.md)
- [02 可行性复核（产品 × 技术）](docs/02-可行性复核-产品与技术.md)
- [03 资源受限部署修订](docs/03-资源受限部署修订.md)
- [04 CI/CD 与提交规范](docs/04-ci-cd.md)
- [贡献指南](CONTRIBUTING.md)
