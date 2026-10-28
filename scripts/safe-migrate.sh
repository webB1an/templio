#!/usr/bin/env bash
# 安全迁移：先备份线上库（mysqldump → 服务器 /www/backup），再执行 prisma migrate deploy
# 用法: bash scripts/safe-migrate.sh [--yes]
# 前置: 1) SSH 免密可连 templio-server；2) 服务器 /root/.my.cnf 配置了 mysqldump 凭证
#       3) 本地已开隧道: npm run tunnel:db
set -euo pipefail
cd "$(dirname "$0")/.."

SCHEMA="apps/api/prisma/schema.prisma"
STAMP="$(date +%Y%m%d-%H%M%S)"
CONFIRM="n"
if [[ "${1:-}" == "--yes" ]]; then CONFIRM="y"; fi

# 1) 本地隧道检查
if ! (exec 3<>/dev/tcp/127.0.0.1/3307) 2>/dev/null; then
  echo "✗ 检测不到本地隧道 127.0.0.1:3307。请先运行: npm run tunnel:db"
  exit 1
fi
echo "✓ SSH 隧道 3307 可用"

# 2) 备份线上库
echo "→ 备份线上库 templio → 服务器 /www/backup/templio-${STAMP}.sql.gz"
ssh templio-server "mkdir -p /www/backup && mysqldump --defaults-extra-file=/root/.my.cnf --single-transaction --quick templio | gzip > /www/backup/templio-${STAMP}.sql.gz"
ssh templio-server "ls -lh /www/backup/templio-${STAMP}.sql.gz"

# 3) 迁移
if [[ "$CONFIRM" != "y" ]]; then
  read -r -p "确认执行 prisma migrate deploy？[y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "已取消"; exit 0; }
fi
npx prisma migrate deploy --schema "$SCHEMA"
echo "✓ 迁移完成（备份已留在服务器 /www/backup/）"
