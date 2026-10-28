# Templio（万用模板）

微信小程序模板资源库 + NestJS 管理后台。产品/技术基线见 `docs/PRD.md`（v4，评审已冻结）。

## 结构

```
apps/api           NestJS API + Prisma（端口 3000，仅监听本机，由 Nginx 反代）
apps/admin         React + Vite + AntD 管理端（部署于 /admin）
apps/miniprogram   微信原生小程序 TS 源码（AppID wx5f21980e48e92ae6）
packages/shared    共享枚举/常量/类型
scripts/           备份与安全迁移脚本
docs/              PRD 快照
```

## 快速开始

```bash
npm install          # npmmirror 源
npm run tunnel:db    # 开 SSH 隧道（3307→线上MySQL，6380→线上Redis），保持运行
cp .env.example .env # 填入凭证
npm run prisma:generate
npm run dev:api      # http://127.0.0.1:3000/api/health
npm run dev:admin    # http://localhost:5173/admin
```

小程序用微信开发者工具打开 `apps/miniprogram/`。

## 数据库迁移（线上单库，务必走安全脚本）

```bash
npm run prisma:migrate   # 先 mysqldump 备份到服务器 /www/backup，再 migrate deploy
npm run db:backup        # 仅备份
```

首次配置需在服务器创建 `/root/.my.cnf`（600 权限）供 mysqldump 使用：

```ini
[client]
user=templio_user
password=********
host=127.0.0.1
```

## 常用检查

```bash
npm run typecheck        # 全仓类型检查（含小程序 tsc --noEmit）
npm run lint
npm run prisma:validate
```

## 提交规范（Conventional Commits，husky + commitlint 强制）

```
<type>(<scope>): <subject>

示例：
feat(api): 模板解锁原子扣减
fix(admin): 修复登录页回车不触发提交
chore(deps): 升级 prisma 到 6.3.1
```

- **type**：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`
- **scope**：`api` / `admin` / `miniprogram`（或 `mp`）/ `shared` / `prisma` / `infra` / `repo` / `deps`
- subject 不超过 72 字符；一次提交只做一件事。

## CI/CD

- **CI**（`.github/workflows/ci.yml`）：push/PR 触发 → prisma validate → typecheck → lint → test。
- **CD**（`.github/workflows/cd.yml`）：push 到 `main` 触发 → CI 构建 → 产物 scp 到服务器 `/www/templio/releases/` → 服务器解包 + `npm ci --omit=dev` + `prisma migrate deploy` + pm2 reload + 健康检查。服务器不编译（1.6G 内存）。
- 需在 GitHub 仓库 Settings → Secrets 配置：`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`。

## 环境纪律（PRD §7.4）

- 开发/测试直连线上单库 `templio`（SSH 隧道），**迁移前必须备份**（safe-migrate 已内置）。
- 禁止 drop/truncate 等破坏性操作；破坏性迁移必须先确认。
- 所有密钥只进 `.env`（已 gitignore），不入仓库。
