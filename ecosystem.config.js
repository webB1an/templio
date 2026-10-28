/**
 * PM2 进程配置（生产）
 * 部署目录：/www/templio
 * 环境变量：从仓库根 .env 读取（服务器侧手工维护，不入库）
 */
const fs = require('node:fs');
const path = require('node:path');

const env = {};
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

module.exports = {
  apps: [
    {
      name: 'templio-api',
      cwd: __dirname,
      script: 'apps/api/dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      env: { ...env, NODE_ENV: 'production', PORT: '3000' },
      out_file: '/www/templio/logs/api-out.log',
      error_file: '/www/templio/logs/api-err.log',
      time: true,
    },
  ],
};
