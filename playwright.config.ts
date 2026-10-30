import { defineConfig, devices } from '@playwright/test';

/**
 * آزمون E2E روی **نسخه ساخته‌شده** رابط، نه سرور توسعه.
 *
 * دلیل: چیزی که به production می‌رود همین خروجی build است. اجرای آزمون روی dev server
 * یعنی تفاوت‌های bundling و تقسیم chunk هرگز آزموده نمی‌شوند.
 *
 * هر دو سرویس را خود Playwright بالا می‌آورد مگر اینکه از قبل در حال اجرا باشند
 * (روی ماشین توسعه). در CI با `reuseExistingServer: false` همیشه از نو بالا می‌آیند
 * تا آزمون به حالت ماشین وابسته نباشد.
 */
const WEB_PORT = Number(process.env.WEB_PORT ?? 5180);
const API_PORT = Number(process.env.API_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // مسیر مالی چند مرحله دارد؛ مهلت پیش‌فرض ۳۰ ثانیه برای رندر PDF کم است.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // یک worker و بدون موازی‌کاری: همه سناریوها روی یک پایگاه داده مشترک کار می‌کنند و
  // اجرای هم‌زمان، شمارش‌ها و کارتابل‌ها را می‌لرزاند. نتیجه قابل تکرار، به قیمت زمان.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['json', { outputFile: 'playwright-report/results.json' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    // شواهد شکست: هر آزمون ناموفق عکس و ردیابی دارد.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'npm run -w @dm/api start:prod',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      /*
        سقف نرخِ ورود در این اجرا بالا برده می‌شود.

        همهٔ سناریوها از یک نشانی (localhost) و پشت سر هم وارد می‌شوند؛ سقف
        واقعی اینجا چیزی را اثبات نمی‌کند و فقط اجرای آزمون را می‌شکند. خودِ
        سقف، تستِ واحد خودش را دارد.
      */
      env: { ...process.env, AUTH_RATE_LIMIT_MAX: '10000' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npm run -w @dm/web preview -- --port ${WEB_PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
