# CI / CD 与提交规范

> 本文说明模板库项目的持续集成、持续部署与 Git 提交规范。
> CI/CD 文件：`.github/workflows/ci.yml`、`.github/workflows/deploy.yml`。

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
fix(cli): 修复 Windows 下 soffice 版本探测失败
ci: 增加 commitlint 与渲染冒烟测试
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
| `verify` | `npm ci` → `npm run typecheck` → `npm run build` |
| `render-smoke` | 安装 LibreOffice + Noto CJK 字体 → `npm run fixtures` → `npm run render` → `npm run status`，验证渲染管线在 Linux 上可用 |

CI 使用 Node.js 22，依赖 npm 缓存。

---

## 3. CD（`.github/workflows/deploy.yml`）

触发：push 到 `main`、手动 `workflow_dispatch`。

流程：

```
checkout → npm ci → build
  → 检测 apps/api/dist、apps/admin/dist 是否存在
  → 检测 GitHub Secrets 是否配置
  → rsync 产物到服务器
  → SSH 执行 deploy/server/deploy.sh
      → 安装生产依赖（有 lock 时 npm ci --omit=dev）
      → pm2 startOrReload
      → curl /health 健康检查
```

**当前状态：** `apps/api`、`apps/admin` 尚未实现，工作流会自动跳过部署并在 Actions 日志中给出 notice。

### 3.1 必要的 GitHub Secrets

进入仓库 **Settings → Secrets and variables → Actions → New repository secret** 添加：

| Secret | 是否必需 | 说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | 必需 | 服务器 IP 或域名 |
| `DEPLOY_USER` | 必需 | SSH 用户（当前为 `root`） |
| `DEPLOY_SSH_KEY` | 必需 | 部署私钥完整内容（含 `BEGIN/END` 行，本地 `~/.ssh/templio_server`） |
| `DEPLOY_PORT` | 可选 | SSH 端口，默认 22 |
| `DEPLOY_PATH` | 可选 | 部署目录，默认 `/www/wwwroot/templio` |

> 私钥、服务器 IP 等敏感信息**不写入仓库**。

### 3.2 服务器初始化

服务器（Node 22 / PM2 / Nginx / MySQL 已就绪）执行一次：

```bash
APP_ROOT=/www/wwwroot/templio bash deploy/server/bootstrap.sh
```

脚本会创建目录、检查依赖、配置 PM2 开机自启（幂等，可重复执行）。

服务器目录：

```
/www/wwwroot/templio/
├── apps/api/          # 服务端产物（dist/ + package.json + .env）
├── apps/admin/       # 管理端静态产物（dist/）
├── deploy/           # 部署脚本与 PM2 配置（CI 同步）
├── logs/             # PM2 日志
└── storage/          # 封面/预览图 + 源文件临时区
```

### 3.3 服务器环境变量

```bash
cp deploy/production.env.example /www/wwwroot/templio/apps/api/.env
chmod 600 /www/wwwroot/templio/apps/api/.env
# 填入 DEEPSEEK_API_KEY / DATABASE_URL / JWT_SECRET 等
```

`.env` 不在 rsync 范围内，部署不会覆盖。

### 3.4 回滚

当前采用"重新部署旧提交"的方式：

```bash
git revert <bad-commit>        # 生成一个 revert 提交
git push origin main           # 自动触发部署
```

后续可扩展为 `releases/<sha>` + `current` 软链的原子发布。

---

## 4. 服务器现状（不含敏感信息）

| 项 | 值 |
| --- | --- |
| 系统 | Alibaba Cloud Linux 4 |
| CPU / 内存 / 磁盘 | 2 核 / 2G（可用约 1.6G）/ 40G（已用 12G） |
| Node / npm / PM2 | 22.22.2 / 10.9.7 / 7.1.1 |
| Nginx / MySQL / Redis | 1.30.6 / 8.0.46 / 已运行 |
| 额外负载 | 宝塔面板、MySQL（约 430MB）、Docker（astrbot 容器） |

> 内存偏紧：API 进程通过 PM2 `max_memory_restart: 500M` 限制；部署/安装依赖期间注意 OOM。
> 渲染（LibreOffice）只在 Windows 桌面执行，不在服务器上跑。

**待办（需要人工提供）：**

1. 域名（已备案）+ HTTPS 证书 → 配置 `deploy/nginx/templio.conf.example`
2. MySQL 数据库 `templio` 与账号（宝塔面板创建或提供 root 密码）
3. 微信小程序 AppID / 上传密钥
4. 百度网盘 / 夸克网盘官方 Skill 安装与账号授权

---

## 5. 本地验证命令

```bash
npm ci
npm run typecheck
npm run build
npm run fixtures
npm run render -- fixtures/samples -o fixtures/packages
npm run status -- fixtures/packages
```
