import { expect, test } from '@playwright/test';

import { gotoSection, login } from './helpers';

/**
 * گزارش‌گیری: تأخیر در درخواست، و تراز ردیف‌های فیلتر.
 *
 * ادعای اول **با شمارش درخواست واقعی** سنجیده می‌شود، نه با نگاه کردن به کد: هشت
 * نویسه تایپ می‌شود و تعداد درخواست‌های اجرای گزارش شمرده می‌شود. بدون تأخیر، هر
 * نویسه یک درخواست می‌سازد — و روی گزارشی که صدها هزار ردیف را می‌پیماید، هفت‌تای
 * آن پیش از رسیدن پاسخ بی‌مصرف شده‌اند.
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
  test('تایپ در مقدار فیلتر، به‌ازای هر نویسه درخواست نمی‌فرستد', async ({ page }) => {
    await openFilters(page);

    // شرط اول روی فیلدی با مقدار متنی می‌نشیند؛ کادر مقدار باید متنی باشد.
    const valueBox = page.getByRole('textbox', { name: 'مقدار' });
    await expect(valueBox).toBeVisible();

    // شمارش از همین لحظه، تا درخواست‌های بارگذاری اولیه در حساب نیایند.
    let queries = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/analytics\/.+\/query$/.test(request.url())) {
        queries += 1;
      }
    });

    await valueBox.pressSequentially('محمدیان', { delay: 40 });

    // تأخیر ۳۵۰ میلی‌ثانیه است؛ این صبر، به نتیجهٔ نهایی فرصت رسیدن می‌دهد.
    await page.waitForTimeout(1200);

    expect(queries, 'برای هر نویسه یک درخواست رفت').toBeLessThanOrEqual(2);
    expect(queries, 'هیچ درخواستی برای مقدار نهایی نرفت').toBeGreaterThan(0);
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
