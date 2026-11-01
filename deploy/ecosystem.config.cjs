/**
 * PM2 配置（生产）
 * 由 deploy/server/deploy.sh 通过 `pm2 startOrReload deploy/ecosystem.config.cjs` 使用。
 */
module.exports = {
  apps: [
    {
      name: "templio-api",
      cwd: "/www/wwwroot/templio/apps/api",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: "4000",
      },
      out_file: "/www/wwwroot/templio/logs/api.out.log",
      error_file: "/www/wwwroot/templio/logs/api.err.log",
      time: true,
    },
  ],
};
