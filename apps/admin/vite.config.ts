import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 管理端部署于 https://templio.wdbzk.com/admin，base 必须为 /admin/
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
