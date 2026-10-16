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
  // `vite preview` نسخه ساخته‌شده را سرو می‌کند و در آزمون E2E و CI همین اجرا می‌شود؛
  // بدون همین proxy، رابط ساخته‌شده به API نمی‌رسد و خطای آن به‌جای باگ برنامه دیده می‌شود.
  preview: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
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
        //
        // شکل تابعی، نه شیء: Rollup نسخه جدید (همراه Vite 8) شکل شیء را حذف کرده است.
        manualChunks(id: string): string | undefined {
          // مسیر روی ویندوز با backslash می‌آید؛ یکدست می‌شود تا تطبیق یکسان بماند.
          const path = id.replaceAll(String.fromCharCode(92), '/'); // backslash ویندوز
          const react = ['react', 'react-dom', 'react-router', 'react-router-dom'];
          if (react.some((name) => path.includes('node_modules/' + name + '/'))) return 'react';
          if (path.includes('node_modules/@tanstack/react-query/')) return 'query';
          return undefined;
        },
      },
    },
  },
});
