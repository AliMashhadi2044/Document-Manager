import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * پیوست سند: بارگذاری توسط کارپردازی، و نمایشگر تمام‌صفحه.
 *
 * دو ادعا:
 *
 *  ۱. **کارپردازی خودش اسکن را بارگذاری می‌کند.** تا پیش از این فقط بایگانی این
 *     مجوز را داشت و کارپرداز باید برای هر پیوست منتظر کس دیگری می‌ماند.
 *  ۲. نمایشگر **تمام‌صفحه** باز می‌شود و زوم دارد — نه یک کادر کوچک وسط صفحه.
 *     اندازه مستقیم اندازه‌گیری می‌شود، نه چشمی.
 */

/** کوچک‌ترین PNG معتبر — یک پیکسل. محتوا مهم نیست، نوع فایل مهم است. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function newDocument(page: Page, title: string): Promise<void> {
  await gotoSection(page, 'اسناد');
  await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();

  const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
  await page.getByLabel('شرح سند').fill(title);
  await pickOption(page, 'مجموعه خریدار');
  await form.getByRole('button', { name: 'ایجاد سند' }).click();
  await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
  await page.getByRole('button', { name: title }).click();
}

test.describe('پیوست سند', () => {
  test('کارپردازی اسکن را بارگذاری می‌کند و تمام‌صفحه می‌بیند', async ({ page }) => {
    const title = unique('سند پیوست');

    // کارپردازی، نه مدیر: مجوز `attachment:upload` تازه به این نقش رسیده است.
    await login(page, 'procurement');
    await newDocument(page, title);

    const upload = page.getByRole('button', { name: 'افزودن فایل' });
    await expect(upload, 'کارپردازی دکمهٔ بارگذاری را نمی‌بیند').toBeVisible();

    // ورودی فایل عمداً sr-only است؛ آزمون همان ورودی را پر می‌کند.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'scan.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    });

    await expect(page.getByText('scan.png')).toBeVisible();

    // ───── نمایشگر تمام‌صفحه ─────
    await page.getByRole('button', { name: 'پیش‌نمایش' }).first().click();
    const viewer = page.getByRole('dialog', { name: 'scan.png' });
    await expect(viewer).toBeVisible();

    const box = await viewer.boundingBox();
    const size = page.viewportSize();
    expect(box, 'نمایشگر اندازه ندارد').not.toBeNull();
    expect(size).not.toBeNull();

    /*
      تمام‌صفحه یعنی تمام‌صفحه.

      مقایسه با ۹۵٪ است و نه تساوی دقیق، چون پهنای نوار اسکرول از ناحیهٔ دید کم
      می‌شود. کادر قبلی ۵۶rem بود — روی همین پنجره حدود ۶۲٪ — پس این آستانه
      همان چیزی را می‌گیرد که باید.
    */
    expect((box as { width: number }).width).toBeGreaterThan(
      (size as { width: number }).width * 0.95,
    );
    expect((box as { height: number }).height).toBeGreaterThan(
      (size as { height: number }).height * 0.95,
    );

    // زوم کار می‌کند و درصدش دیده می‌شود.
    await expect(viewer.getByText('۱۰۰٪')).toBeVisible();
    await viewer.getByRole('button', { name: 'بزرگ‌نمایی' }).click();
    await expect(viewer.getByText('۱۲۵٪')).toBeVisible();
    await viewer.getByRole('button', { name: 'کوچک‌نمایی' }).click();
    await expect(viewer.getByText('۱۰۰٪')).toBeVisible();

    // و دکمهٔ دانلود سر جایش است.
    await expect(viewer.getByRole('button', { name: 'دانلود فایل' })).toBeVisible();

    await viewer.getByRole('button', { name: 'بستن' }).click();
    await expect(viewer).toHaveCount(0);
  });
});
