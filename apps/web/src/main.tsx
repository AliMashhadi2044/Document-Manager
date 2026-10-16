import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/app';

/*
 * قلم فارسی، **درون بسته** — نه از CDN.
 *
 * تا پیش از این، توکن قلم نام Vazirmatn را داشت ولی هیچ فایل قلمی در پروژه نبود؛
 * در عمل Tahoma یا قلم پیش‌فرض سیستم نمایش داده می‌شد. بارگذاری محلی عمدی است:
 * سامانه در شبکه داخلی اجرا می‌شود و نباید برای نمایش درست به اینترنت وابسته باشد.
 *
 * ورود از اینجا (نه با @import داخل CSS) عمدی است: فقط در این حالت Vite فایل‌های
 * woff2 را به خروجی build منتقل و نشانی‌شان را بازنویسی می‌کند.
 */
import '@fontsource-variable/vazirmatn';
import './shared/styles/globals.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('عنصر ریشه پیدا نشد');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
