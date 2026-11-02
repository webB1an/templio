#!/usr/bin/env bash
# 安装 / 更新官方夸克网盘 Skill（服务器端）
# 用法：APP_ROOT=/www/wwwroot/templio bash deploy/server/install-quark-skill.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/templio}"
SKILL_ROOT="${APP_ROOT}/skills/quarkclouddrive_offical"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "${APP_ROOT}/skills"
echo "== 下载夸克官方 Skill =="
curl -fsSL https://codeload.github.com/quark-clouddrive/quarkclouddrive_offical/tar.gz/refs/heads/main \
  -o "${TMP_DIR}/skill.tgz"
tar -xzf "${TMP_DIR}/skill.tgz" -C "${TMP_DIR}"

rm -rf "$SKILL_ROOT"
mv "${TMP_DIR}/quarkclouddrive_offical-main" "$SKILL_ROOT"

echo "== 安装 CLI =="
cd "${SKILL_ROOT}/skills/quarkclouddrive"
bash install.sh

SKILL_DIR="$(pwd)"
echo "== 写入 QUARK_SKILL_DIR =="
ENV_FILE="${APP_ROOT}/apps/api/.env"
if [ -f "$ENV_FILE" ]; then
  sed -i '/^QUARK_SKILL_DIR=/d' "$ENV_FILE"
  printf '\nQUARK_SKILL_DIR=%s\n' "$SKILL_DIR" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

echo "✔ 夸克 Skill 安装完成：${SKILL_DIR}"
echo "下一步：pm2 restart templio-api"
