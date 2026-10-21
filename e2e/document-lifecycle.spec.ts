import { expect, test } from '@playwright/test';

import { gotoSection, login, logout, pickOption, toAsciiDigits, unique } from './helpers';

/**
 * سناریوی اصلی سند (docs/11-testing-plan.md §۴) از راه **رابط کاربری**:
 * ایجاد سند → فاکتور عادی با ردیف کالا → ثبت نهایی → گزارش مالیات → خروجی Excel
 * → ارجاع به بایگانی.
 *
 * هدف این آزمون «کلیک شدن دکمه‌ها» نیست؛ اعدادی که کاربر می‌بیند بررسی می‌شوند:
 * جمع فاکتور باید همان چیزی باشد که از تعداد × مبلغ واحد درمی‌آید.
 */
test.describe('چرخه کامل سند', () => {
  test('ایجاد تا خروجی مالیات، با بررسی مبالغ', async ({ page }) => {
    const title = unique('سند آزمون E2E');

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');

    // ───── ایجاد سند ─────
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();

    // دکمه بازکننده فرم و دکمه ثبت، هر دو «ایجاد سند» نام دارند؛ بنابراین دکمه ثبت
    // از درون خود فرم گرفته می‌شود، نه از کل صفحه.
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    // ───── باز کردن سند ─────
    await page.getByRole('button', { name: title }).click();
    await expect(page.getByRole('button', { name: 'افزودن فاکتور' })).toBeVisible();

    // ───── فاکتور عادی با یک ردیف کالا ─────
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    // برچسب گزینه شامل دسته و کد فصل هم هست («جاری — مواد مصرفی (۲۲۱۳۰۰۰)»)،
    // پس بخشی از متنش برای یافتن کافی است.
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });

    const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    if ((await typeSelect.count()) > 0) {
      await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
    }

    // فروشنده: گزارش مالیات بر اساس فروشنده تجمیع می‌شود، پس فاکتور بدون فروشنده
    // هیچ ردیفی در گزارش ندارد. فهرست فروشنده سمت سرور جست‌وجو می‌شود.
    await pickOption(page, 'فروشنده');

    await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
    await page.getByLabel('شرح ردیف ۱').fill('کاغذ A4');
    await page.getByLabel('تعداد').fill('2');
    await pickOption(page, 'واحد');
    await page.getByLabel('مبلغ واحد').fill('1500000');

    // پیش‌نمایش جمع، سمت کلاینت محاسبه می‌شود و باید ۲ × ۱٬۵۰۰٬۰۰۰ باشد.
    const preview = page.getByText('۳٬۰۰۰٬۰۰۰', { exact: false }).first();
    await expect(preview).toBeVisible();

    // روش پرداخت اختیاری **نیست**: سرور در ثبت نهایی آن را لازم می‌داند.
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });

    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();

    // ───── مبلغ سند، از سرور ─────
    const total = page.getByText('جمع سند').locator('..');
    await expect(total).toContainText('۳٬۰۰۰٬۰۰۰');

    // ───── ثبت نهایی ─────
    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();
    // پس از ثبت نهایی، افزودن فاکتور دیگر ممکن نیست.
    await expect(page.getByRole('button', { name: 'افزودن فاکتور' })).toHaveCount(0);

    // ───── گزارش مالیات ─────
    await page.getByRole('button', { name: 'گزارش مالیات' }).click();

    // گزارش بر اساس فروشنده تجمیع می‌شود؛ ردیف این سند باید همان مبالغ را نشان دهد:
    // ۳٬۰۰۰٬۰۰۰ خالص، ۳۰۰٬۰۰۰ مالیات و عوارض (۱۰٪) و ۳٬۳۰۰٬۰۰۰ جمع کل.
    const reportRow = page.getByRole('row').filter({ hasText: '۳٬۳۰۰٬۰۰۰' }).first();
    await expect(reportRow).toBeVisible();
    await expect(reportRow).toContainText('۳٬۰۰۰٬۰۰۰');
    await expect(reportRow).toContainText('۳۰۰٬۰۰۰');

    // ───── فهرست انتخاب درون گفت‌وگوی پوشا ─────
    //
    // گفت‌وگوی showModal در «لایه بالا»ی مرورگر نقاشی می‌شود؛ فهرستی که در body
    // باز شود زیر آن پنهان می‌ماند. این بررسی، همان حالت را می‌سنجد.
    await page.getByRole('button', { name: 'نوع کالا' }).first().click();
    await page.getByRole('combobox', { name: 'نوع کالا', exact: true }).click();
    await expect(page.getByRole('listbox', { name: 'نوع کالا' })).toBeVisible();
    // یک Escape فهرست را می‌بندد و دومی گفت‌وگو را — فهرست باز نباید Escape را به
    // گفت‌وگو بدهد، وگرنه کاربر با یک کلید هر دو را از دست می‌دهد.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox', { name: 'نوع کالا' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('combobox', { name: 'نوع کالا', exact: true })).toHaveCount(0);

    // ───── خروجی Excel: فایل واقعی دانلود می‌شود ─────
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'خروجی Excel' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
    expect((await file.path()) !== null).toBe(true);

    // ───── ارجاع به بایگانی ─────
    await page.getByRole('button', { name: 'بازگشت به سند' }).click();
    await page.getByRole('button', { name: 'ارجاع به بایگانی' }).click();
    await expect(page.getByText('سند به بایگانی ارجاع شد', { exact: false })).toBeVisible();

    // ───── همان سند، در کارتابل بایگان ─────
    //
    // این مرحله تحویل کار بین دو نقش را می‌سنجد: چیزی که کارپردازی ارجاع داده،
    // باید در کارتابل کاربر دیگری دیده شود — نه فقط در صفحه خودِ ارجاع‌دهنده.
    await logout(page);
    await login(page, 'archivist');
    await gotoSection(page, 'بایگانی');
    await expect(page.getByText(title)).toBeVisible();
  });
});

/** ارقام فارسی رابط، در مقایسه عددی کار نمی‌کنند؛ این کمک‌تابع آزموده می‌شود. */
test('تبدیل ارقام فارسی به ASCII', () => {
  expect(toAsciiDigits('۳٬۰۰۰')).toBe('3٬000');
});
