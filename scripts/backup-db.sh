#!/usr/bin/env bash
# 手动备份线上库到服务器 /www/backup/
set -euo pipefail
STAMP="$(date +%Y%m%d-%H%M%S)"
ssh templio-server "mkdir -p /www/backup && mysqldump --defaults-extra-file=/root/.my.cnf --single-transaction --quick templio | gzip > /www/backup/templio-${STAMP}.sql.gz && ls -lh /www/backup/templio-${STAMP}.sql.gz"
