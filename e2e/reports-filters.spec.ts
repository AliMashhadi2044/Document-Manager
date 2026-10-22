import { expect, test } from '@playwright/test';

import { gotoSection, login } from './helpers';

/**
 * گزارش‌گیری: تأخیر در درخواست، و تراز ردیف‌های فیلتر.
 *
 * ادعای اول **با شمارش درخواست واقعی** سنجیده می‌شود، نه با نگاه کردن به کد: فیلتر
 * تنظیم می‌شود و تا فشرده نشدن «اجرای گزارش» هیچ درخواستی نباید برود. پیش از این هر
 * نویسه یک اجرای کامل می‌ساخت — روی گزارشی که صدها هزار ردیف را می‌پیماید، همه‌شان
 * جز آخری هدر بودند.
 *
 * ادعای دوم چشمی نیست: بالای هر خانهٔ ردیف شرط اندازه گرفته می‌شود. خط راهنمای زیر
 * انتخابگر تاریخ و ورودی مبلغ، همین‌ها بودند که ردیف را از تراز می‌انداختند.
 */

async function openFilters(page: import('@playwright/test').Page): Promise<void> {
  await login(page, 'admin');
  await gotoSection(page, 'گزارش‌گیری');
  await page.getByRole('button', { name: /^فیلترها/ }).click();
  await page.getByRole('button', { name: 'افزودن شرط' }).click();
}

test.describe('فیلترهای گزارش', () => {
  test('تا فشرده نشدن دکمه، تنظیم فیلتر هیچ درخواستی نمی‌فرستد', async ({ page }) => {
    await openFilters(page);

    // شرط اول روی فیلدی با مقدار متنی می‌نشیند؛ کادر مقدار باید متنی باشد.
    const valueBox = page.getByRole('textbox', { name: 'مقدار' });
    await expect(valueBox).toBeVisible();

    // شمارش از همین لحظه، تا اجرای خودکارِ بار اول در حساب نیاید.
    let queries = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/analytics\/.+\/query$/.test(request.url())) {
        queries += 1;
      }
    });

    await valueBox.pressSequentially('محمدیان', { delay: 40 });
    await page.waitForTimeout(900);

    expect(queries, 'تایپ در فیلتر، گزارش را اجرا کرد').toBe(0);
    await expect(page.getByText('تغییرها هنوز اجرا نشده‌اند')).toBeVisible();

    // و با یک کلیک، دقیقاً **یک** اجرا.
    await page.getByRole('button', { name: 'اجرای گزارش' }).click();
    await expect(page.getByText('تغییرها هنوز اجرا نشده‌اند')).toHaveCount(0);
    await page.waitForTimeout(900);

    expect(queries, 'دکمه یا اجرا نکرد یا بیش از یک بار اجرا کرد').toBe(1);
  });

  test('خانه‌های هر شرط هم‌تراز شروع می‌شوند', async ({ page }) => {
    await openFilters(page);

    /*
      فیلد تاریخ را انتخاب می‌کنیم چون انتخابگر تاریخ، همان کنترلی بود که یک خط
      راهنمای همیشگی داشت و خانهٔ کناری‌اش را جابه‌جا می‌کرد.
    */
    await page.getByRole('combobox', { name: 'فیلد شرط ۱' }).click();
    await page.getByRole('option', { name: /تاریخ/ }).first().click();

    const row = page.getByRole('listitem').filter({ has: page.getByRole('combobox') }).first();
    const cells = row.locator(':scope > *');
    const count = await cells.count();
    expect(count).toBeGreaterThan(2);

    const tops: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const box = await cells.nth(index).boundingBox();
      if (box) tops.push(Math.round(box.y));
    }

    // یک پیکسل اختلاف گرد کردن است؛ بیشتر از آن یعنی ناترازی دیدنی.
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  });

  test('هر بار یک تابلو باز است', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'گزارش‌گیری');

    await page.getByRole('button', { name: /^فیلترها/ }).click();
    await expect(page.getByRole('button', { name: 'افزودن شرط' })).toBeVisible();

    // باز کردن ستون‌ها، فیلترها را می‌بندد — وگرنه جدول به ته صفحه می‌رفت.
    await page.getByRole('button', { name: /^ستون‌ها/ }).click();
    await expect(page.getByRole('button', { name: 'افزودن شرط' })).toHaveCount(0);
    await expect(page.getByText('ترتیب انتخاب، ترتیب ستون‌ها')).toBeVisible();
  });
});
