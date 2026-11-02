#!/usr/bin/env bash
# 安装备份/健康检查 cron + logrotate（幂等，可重复执行）。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/templio}"
CRON_MARKER="templio/deploy/server"
TMP_CRON="$(mktemp)"

mkdir -p "${APP_ROOT}/logs" "${APP_ROOT}/backups/mysql" "${APP_ROOT}/backups/storage"

chmod +x "${APP_ROOT}/deploy/server/backup.sh" "${APP_ROOT}/deploy/server/healthcheck.sh"

install -m 644 "${APP_ROOT}/deploy/server/templio-logrotate.conf" /etc/logrotate.d/templio

crontab -l 2>/dev/null | grep -v "$CRON_MARKER" > "$TMP_CRON" || true
cat >> "$TMP_CRON" <<CRON
# templio ops (managed by deploy/server/install-ops.sh)
0 3 * * * /bin/bash ${APP_ROOT}/deploy/server/backup.sh >> ${APP_ROOT}/logs/backup-cron.log 2>&1
*/5 * * * * /bin/bash ${APP_ROOT}/deploy/server/healthcheck.sh >> ${APP_ROOT}/logs/healthcheck-cron.log 2>&1
CRON
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

logrotate -d /etc/logrotate.d/templio >/dev/null
echo "✔ ops installed: backup 03:00 / healthcheck every 5min / logrotate daily"
crontab -l | grep -A2 "templio ops"
