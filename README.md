# 模板宝

[![CI](https://github.com/webB1an/templio/actions/workflows/ci.yml/badge.svg)](https://github.com/webB1an/templio/actions/workflows/ci.yml)

PPT / Word 模板库小程序：微信小程序（用户端）+ Web 管理端 + NestJS 服务端 + 桌面批处理 CLI。

> 产品展示名：**模板宝**；仓库名、包名、域名仍保留 `templio` 技术标识（不影响 CI/CD 与已配置的域名）。
>
> 当前阶段：**P0 打样**。服务端与模板公开接口已上线；小程序搜索/列表/详情已接入真实接口；管理端待开发。
> 线上 API：<https://templio.wdbzk.com/health>
>
> 规划文档见 `docs/`，部署与 CI/CD 见 `docs/04-ci-cd.md`。

## 目录

```
templio/
├── apps/
│   ├── desktop-cli/      桌面批处理 CLI（LibreOffice 渲染 + 物料包 + 上传）
│   ├── api/              服务端（NestJS + Prisma + MySQL，/health 已就绪）
│   ├── admin/            Web 管理端（React + AntD，待建）
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
| `fixtures` | 生成合成 PPT/Word 测试模板（开发用） |

渲染管线特性：SHA-256 幂等（同文件跳过）、`.ledger.jsonl` 断点账本、LibreOffice 独立 profile 并发、字体名抽取告警、图片体积预算内自动降质。

## 公开 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/templates` | 模板列表（`q` / `category` / `tag` / `limit` / `offset`） |
| GET | `/api/templates/facets` | 分类与标签聚合 |
| GET | `/api/templates/:id` | 模板详情（含相关推荐） |
| GET | `/r/:code` | 网盘短链 302 跳转 |

## 小程序

- 目录：`apps/miniprogram`（微信原生 JS + 液态玻璃 UI）
- 用微信开发者工具直接导入该目录（AppID 已写入 `project.config.json`）
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
- **CD**（`.github/workflows/deploy.yml`）：push 到 `main` 自动构建并部署到服务器（当前服务端应用尚未实现，部署会自动跳过）
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
