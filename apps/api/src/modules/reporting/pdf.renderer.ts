import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser } from 'playwright-core';

import { AppError } from '../../common/errors/app-error';

/**
 * تولید PDF از HTML با Chromium واقعی (docs/09 §۷).
 *
 * چرا Chromium و نه یک کتابخانه PDF: جدول ۱۲ ستونی با متن راست‌به‌چپ، تکرار سرستون در
 * صفحه بعد و شکستن نشدن ردیف، همگی رفتارهای **موتور چیدمان مرورگر**اند. بازنویسی‌شان
 * روی یک کتابخانه PDF یعنی ساختن یک موتور چیدمان دوم که هیچ‌وقت با نسخه چاپی مرورگر
 * یکی نمی‌شود.
 *
 * محدودیت‌های اجباری، همه در یک جا:
 *  - **شبکه قطع است**: صفحه هیچ درخواست خارجی نمی‌دهد. HTML تولیدی ما هم هیچ منبع
 *    خارجی ندارد، ولی تکیه بر «نداریم» کافی نیست؛ مسدود کردن، تضمین است.
 *  - **JavaScript خاموش است**: صفحه فقط چیدمان است و اسکریپتی برای اجرا ندارد.
 *  - **timeout و همزمانی محدود**: رندر گران است و بدون سقف، یک درخواست می‌تواند
 *    سرویس را بخواباند.
 *  - مرورگر **یک‌بار** باز می‌شود و بین درخواست‌ها می‌ماند؛ هر درخواست فقط یک context
 *    جدا می‌گیرد، چون راه‌اندازی مرورگر چند ثانیه طول می‌کشد.
 */
@Injectable()
export class PdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderer.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  /** حداکثر دو رندر هم‌زمان (docs/09 §۷). */
  private active = 0;
  private static readonly MAX_CONCURRENT = 2;
  private static readonly TIMEOUT_MS = 60_000;

  async render(
    html: string,
    options: { landscape: boolean; marginsMm: { top: number; bottom: number; left: number; right: number } },
  ): Promise<Buffer> {
    if (this.active >= PdfRenderer.MAX_CONCURRENT) {
      throw new AppError(
        'REPORT_RENDER_BUSY',
        'تولید خروجی PDF در حال حاضر شلوغ است؛ چند لحظه بعد دوباره تلاش کنید',
        503,
      );
    }

    this.active += 1;
    try {
      const browser = await this.ensureBrowser();
      const context = await browser.newContext({
        javaScriptEnabled: false,
        // هر درخواست خارجی مسدود می‌شود؛ صفحه باید کاملاً خودبسنده باشد.
        offline: true,
      });

      try {
        const page = await context.newPage();
        await page.route('**/*', (route) => {
          const url = route.request().url();
          return url.startsWith('data:') || url.startsWith('about:')
            ? route.continue()
            : route.abort();
        });

        await page.setContent(html, { waitUntil: 'load', timeout: PdfRenderer.TIMEOUT_MS });

        const pdf = await page.pdf({
          format: 'A4',
          landscape: options.landscape,
          printBackground: false,
          margin: {
            top: `${options.marginsMm.top}mm`,
            bottom: `${options.marginsMm.bottom}mm`,
            left: `${options.marginsMm.left}mm`,
            right: `${options.marginsMm.right}mm`,
          },
        });

        return Buffer.from(pdf);
      } finally {
        await context.close();
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`تولید PDF ناموفق بود: ${String(error)}`);
      throw new AppError('REPORT_RENDER_FAILED', 'تولید خروجی PDF ناموفق بود', 500);
    } finally {
      this.active -= 1;
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;

    // چند درخواست هم‌زمان نباید چند مرورگر باز کنند.
    this.launching ??= chromium
      .launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] })
      .then((browser) => {
        this.browser = browser;
        this.launching = null;
        return browser;
      })
      .catch((error: unknown) => {
        this.launching = null;
        throw error;
      });

    return this.launching;
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
  }
}
