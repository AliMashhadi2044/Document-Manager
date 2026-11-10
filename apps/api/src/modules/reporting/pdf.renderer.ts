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
/** کاغذهایی که موتور می‌شناسد، به همان نامی که چاپگر بی‌سر می‌فهمد. */
export type PdfPaperSize = 'A3' | 'A4' | 'A5' | 'Letter';

export interface PdfRenderOptions {
  readonly pageSize: PdfPaperSize;
  readonly landscape: boolean;
  readonly marginsMm: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
  };
  /**
   * متن شمارهٔ صفحه، با جای‌گذارهای `{{page}}` و `{{pages}}`؛ `null` یعنی
   * قالب بلوک «شماره صفحه» ندارد و پابرگ چاپ اصلاً روشن نمی‌شود.
   */
  readonly pageNumberTemplate: string | null;
}

/**
 * پابرگِ چاپ: متن قالب، با شمارهٔ صفحهٔ خودِ چاپگر.
 *
 * `pageNumber` و `totalPages` دو کلاسِ شناخته‌شدهٔ موتور چاپ‌اند و محتوایشان را
 * خودش پر می‌کند. متن کاربر **escape** می‌شود؛ این رشته از قالبی می‌آید که کاربر
 * ویرایشش می‌کند و نباید به HTML پابرگ تزریق شود.
 *
 * پابرگ ارث‌بری سبک از صفحه ندارد و قلمش پیش‌فرضِ خیلی ریزِ موتور است، پس اندازه
 * و چینش صریح نوشته می‌شوند. فضای پایین هم باید دست‌کم به اندازهٔ حاشیهٔ پایین
 * باشد وگرنه پابرگ بیرون از ناحیهٔ چاپ می‌افتد و دیده نمی‌شود.
 */
function pageFooterHtml(template: string, bottomMarginMm: number): string {
  const safe = template
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

  const body = safe
    .replace(/\{\{\s*page\s*\}\}/gu, '<span class="pageNumber"></span>')
    .replace(/\{\{\s*pages\s*\}\}/gu, '<span class="totalPages"></span>');

  return (
    `<div style="width:100%;font-size:8pt;font-family:sans-serif;direction:rtl;` +
    `text-align:center;padding:0 10mm ${Math.max(bottomMarginMm - 6, 2)}mm;color:#555">` +
    `${body}</div>`
  );
}

@Injectable()
export class PdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderer.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  /** حداکثر دو رندر هم‌زمان (docs/09 §۷). */
  private active = 0;
  private static readonly MAX_CONCURRENT = 2;
  private static readonly TIMEOUT_MS = 60_000;

  async render(html: string, options: PdfRenderOptions): Promise<Buffer> {
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
          /*
            اندازهٔ کاغذ از **قالب** می‌آید.

            پیش از این `'A4'` ثابت بود: کسی که در طراح A3 را انتخاب می‌کرد، در
            HTML کاغذ بزرگ می‌گرفت و در PDF همان A4 — یعنی ستون‌های یک فرم
            عریض روی کاغذ بریده می‌شدند، بی‌آنکه هیچ خطایی بدهد.
          */
          format: options.pageSize,
          landscape: options.landscape,
          /*
            پس‌زمینه چاپ می‌شود.

            شیوه‌نامهٔ گزارش عمداً سیاه‌وسفید است و پس‌زمینه‌ای ندارد، جز
            سلول‌هایی که از آستانهٔ تنظیم‌ها گذشته‌اند و باید خاکستری دیده شوند.
            با `false`، آن علامت در PDF **ناپدید** می‌شد در حالی که در HTML بود.
          */
          printBackground: true,
          margin: {
            top: `${options.marginsMm.top}mm`,
            bottom: `${options.marginsMm.bottom}mm`,
            left: `${options.marginsMm.left}mm`,
            right: `${options.marginsMm.right}mm`,
          },
          /*
            شمارهٔ صفحه، تنها جایی که می‌شود ساختش.

            HTML شمارهٔ صفحه را نمی‌داند — صفحه‌بندی کارِ چاپگر است. پس بلوک
            «شماره صفحه» در خودِ HTML رندر نمی‌شود و اینجا به پابرگِ چاپ تبدیل
            می‌شود. قالب فقط می‌گوید چه بنویسد.
          */
          displayHeaderFooter: options.pageNumberTemplate !== null,
          headerTemplate: '<span></span>',
          footerTemplate:
            options.pageNumberTemplate === null
              ? '<span></span>'
              : pageFooterHtml(options.pageNumberTemplate, options.marginsMm.bottom),
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
