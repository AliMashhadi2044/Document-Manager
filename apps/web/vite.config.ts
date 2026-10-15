import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      // درخواست‌ها به API از همان origin عبور می‌کنند تا کوکی نشست بدون
      // پیچیدگی cross-origin کار کند — همان شکلی که در production خواهد بود.
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3100',
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // جداسازی وابستگی‌های بزرگ برای بارگذاری بهتر (الزام بهینگی).
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
