#!/usr/bin/env bash
# Templio 服务器初始化（幂等）：只准备目录与运行环境，不启动业务。
# 用法：APP_ROOT=/www/wwwroot/templio bash deploy/server/bootstrap.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/templio}"

echo "== Templio server bootstrap =="
echo "APP_ROOT=${APP_ROOT}"

mkdir -p \
  "${APP_ROOT}/apps/api" \
  "${APP_ROOT}/apps/admin" \
  "${APP_ROOT}/logs" \
  "${APP_ROOT}/releases" \
  "${APP_ROOT}/shared" \
  "${APP_ROOT}/storage"

if ! command -v node >/dev/null 2>&1; then
  echo "✘ node 未安装，需要 Node.js >= 22"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "✘ Node.js 版本过低：$(node -v)，需要 >= 22"
  exit 1
fi

for bin in node npm pm2 nginx mysql curl rsync; do
  if command -v "${bin}" >/dev/null 2>&1; then
    echo "✔ ${bin} $(command -v "${bin}")"
  else
    echo "⚠ 缺少 ${bin}"
  fi
done

if command -v pm2 >/dev/null 2>&1; then
  # 开机自启（重复执行是幂等的）
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
  echo "✔ pm2 startup 已配置（首次部署后执行 pm2 save）"
fi

echo "== bootstrap done: ${APP_ROOT} =="
