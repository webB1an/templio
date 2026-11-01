#!/usr/bin/env bash
# Templio 服务器发布脚本：由 GitHub Actions 通过 SSH 调用。
# 前置：代码/产物已通过 rsync 同步到 APP_ROOT，且 apps/api/.env 已存在。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/templio}"
cd "${APP_ROOT}"

echo "== Templio deploy: $(date -Iseconds) =="

if [ ! -f apps/api/dist/main.js ]; then
  echo "ℹ apps/api/dist/main.js 不存在（服务端尚未实现），跳过启动"
  exit 0
fi

if [ ! -f apps/api/.env ]; then
  echo "✘ 缺少 apps/api/.env，请先在服务器上创建（参考 deploy/production.env.example）"
  exit 1
fi

# 加载 .env（Prisma 迁移与 PM2 健康检查需要）
set -a
# shellcheck disable=SC1091
. apps/api/.env
set +a

echo "-- 安装生产依赖（仅 api + shared workspace）"
npm ci --omit=dev --no-audit --no-fund \
  --workspace @templio/api \
  --workspace @templio/shared

echo "-- Prisma generate"
npx prisma generate --schema apps/api/prisma/schema.prisma

echo "-- Prisma migrate deploy"
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "-- 启动/重载 PM2"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

echo "-- 健康检查"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-4000}/health" >/dev/null 2>&1; then
    echo "✔ api healthy"
    exit 0
  fi
  sleep 1
done

echo "✘ API 健康检查失败（查看 logs/api.err.log）"
exit 1
