#!/usr/bin/env bash
# 健康检查 + 磁盘监控。由 deploy/server/install-ops.sh 安装 cron（每 5 分钟）。
# 可选：在服务器 .env 配置 ALERT_WEBHOOK_URL（企业微信/飞书等支持 text 的 webhook）。
set -uo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/templio}"
ENV_FILE="${ENV_FILE:-${APP_ROOT}/apps/api/.env}"
LOG_FILE="${APP_ROOT}/logs/healthcheck.log"
ALERT_LOG="${APP_ROOT}/logs/alert.log"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/health}"
DISK_THRESHOLD="${DISK_THRESHOLD:-85}"

mkdir -p "${APP_ROOT}/logs"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

alert() {
  local message="$1"
  echo "[alert] $(date -Iseconds) ${message}" | tee -a "$ALERT_LOG"
  echo "[healthcheck] $(date -Iseconds) ✘ ${message}" >> "$LOG_FILE"
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -fsS --max-time 5 -H "content-type: application/json" \
      -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"[模板宝] ${message}\"}}" \
      "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
}

STATUS=0

health="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
if echo "$health" | grep -q '"ok":true'; then
  echo "[healthcheck] $(date -Iseconds) API ok ${health}" >> "$LOG_FILE"
else
  alert "API 健康检查失败：${health:-无响应}"
  STATUS=1
fi

PID="$(pm2 pid templio-api 2>/dev/null | head -1 | tr -d '[:space:]')"
if [ -z "$PID" ] || [ "$PID" = "0" ]; then
  alert "PM2 进程 templio-api 不在线"
  STATUS=1
fi

DISK_USED="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
DISK_USED="${DISK_USED:-0}"
if [ "$DISK_USED" -ge "$DISK_THRESHOLD" ]; then
  alert "磁盘使用率 ${DISK_USED}% ≥ ${DISK_THRESHOLD}%"
  STATUS=1
else
  echo "[healthcheck] $(date -Iseconds) disk ${DISK_USED}%" >> "$LOG_FILE"
fi

MEM_AVAILABLE="$(free -m | awk '/^Mem:/{print $7}')"
MEM_AVAILABLE="${MEM_AVAILABLE:-0}"
if [ "$MEM_AVAILABLE" -lt 80 ]; then
  alert "可用内存仅 ${MEM_AVAILABLE}MB"
  STATUS=1
else
  echo "[healthcheck] $(date -Iseconds) mem available ${MEM_AVAILABLE}MB" >> "$LOG_FILE"
fi

# 控制日志体积（logrotate 之外再兜底）
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt 5000 ]; then
  tail -n 2000 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

exit "$STATUS"
