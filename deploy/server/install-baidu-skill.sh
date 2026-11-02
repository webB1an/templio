#!/usr/bin/env bash
# 安装 / 更新百度网盘官方 bdpan CLI（服务器端，OAuth 授权）
# 用法：APP_ROOT=/www/wwwroot/templio bash deploy/server/install-baidu-skill.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/templio}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "== 下载百度网盘官方 Skill =="
curl -fsSL https://codeload.github.com/baidu-netdisk/bdpan-storage/tar.gz/refs/heads/main \
  -o "${TMP_DIR}/skill.tgz"
tar -xzf "${TMP_DIR}/skill.tgz" -C "${TMP_DIR}"

cd "${TMP_DIR}/bdpan-storage-main/skills/baidu-drive"
echo "== 安装 bdpan CLI =="
bash scripts/install.sh --yes --force

BDPAN_BIN="$(command -v bdpan || true)"
if [ -z "$BDPAN_BIN" ] && [ -x /root/.local/bin/bdpan ]; then
  BDPAN_BIN=/root/.local/bin/bdpan
fi
if [ -z "$BDPAN_BIN" ]; then
  echo "未找到安装后的 bdpan，请检查 /root/.local/bin" >&2
  exit 1
fi

echo "== 写入 BDPAN_PATH =="
ENV_FILE="${APP_ROOT}/apps/api/.env"
if [ -f "$ENV_FILE" ]; then
  sed -i '/^BDPAN_PATH=/d' "$ENV_FILE"
  printf '\nBDPAN_PATH=%s\n' "$BDPAN_BIN" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

echo "✔ 百度网盘 CLI 安装完成：$("$BDPAN_BIN" version 2>/dev/null | head -1)"
echo "下一步：pm2 restart templio-api"
