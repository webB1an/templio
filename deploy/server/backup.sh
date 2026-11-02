#!/usr/bin/env bash
# 数据库 + 图片存储每日备份。由 deploy/server/install-ops.sh 安装 cron。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/templio}"
ENV_FILE="${ENV_FILE:-${APP_ROOT}/apps/api/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-${APP_ROOT}/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STORAGE_KEEP_DAYS="${STORAGE_BACKUP_KEEP_DAYS:-7}"

DB_DIR="${BACKUP_ROOT}/mysql"
STORAGE_BACKUP_DIR="${BACKUP_ROOT}/storage"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DB_DIR" "$STORAGE_BACKUP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "[backup] $(date -Iseconds) 缺少 env 文件：$ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] $(date -Iseconds) DATABASE_URL 为空"
  exit 1
fi

IFS=$'\t' read -r DB_USER DB_PASS DB_HOST DB_PORT DB_NAME < <(
  node -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write([decodeURIComponent(u.username),decodeURIComponent(u.password),u.hostname,u.port||"3306",u.pathname.replace(/^\//,"")].join("\t")+"\n")'
)

DB_FILE="${DB_DIR}/templio-${STAMP}.sql.gz"
echo "[backup] $(date -Iseconds) 开始备份数据库 ${DB_NAME} -> ${DB_FILE}"

MYSQL_PWD="$DB_PASS" mysqldump \
  --single-transaction \
  --quick \
  --no-tablespaces \
  --default-character-set=utf8mb4 \
  -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" \
  | gzip -9 > "${DB_FILE}.tmp"

mv "${DB_FILE}.tmp" "$DB_FILE"
gzip -t "$DB_FILE"
DB_SIZE="$(du -h "$DB_FILE" | cut -f1)"
echo "[backup] $(date -Iseconds) 数据库备份完成 ${DB_SIZE}"

if [ -d "${APP_ROOT}/storage/public" ]; then
  STORAGE_FILE="${STORAGE_BACKUP_DIR}/storage-${STAMP}.tar.gz"
  echo "[backup] $(date -Iseconds) 开始备份图片存储 -> ${STORAGE_FILE}"
  tar -czf "$STORAGE_FILE" -C "${APP_ROOT}/storage" public
  STORAGE_SIZE="$(du -h "$STORAGE_FILE" | cut -f1)"
  echo "[backup] $(date -Iseconds) 图片备份完成 ${STORAGE_SIZE}"
  find "$STORAGE_BACKUP_DIR" -maxdepth 1 -name 'storage-*.tar.gz' -mtime "+${STORAGE_KEEP_DAYS}" -delete
fi

find "$DB_DIR" -maxdepth 1 -name 'templio-*.sql.gz' -mtime "+${KEEP_DAYS}" -delete
echo "[backup] $(date -Iseconds) 清理完成（数据库保留 ${KEEP_DAYS} 天 / 图片保留 ${STORAGE_KEEP_DAYS} 天）"
