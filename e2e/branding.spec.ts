import { expect, test } from '@playwright/test';

import { login } from './helpers';

/**
 * نشان سازمان — از بارگذاری تا دیده شدن در نوار کناری و حذف.
 *
 * آزمون در پایان نشان را **پاک می‌کند**: این یک تنظیم سراسری سازمان است، نه داده‌ای
 * مخصوص یک آزمون؛ جا ماندنش روی اجراهای بعدی و روی خودِ محیط اثر می‌گذارد.
 */

/** کوچک‌ترین PNG معتبر (۱×۱ شفاف). */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('نشان سازمان', () => {
  test('بارگذاری، نمایش و حذف', async ({ page }) => {
    await login(page, 'admin');

    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: 'تنظیمات سازمان' }).click();

    const dialog = page.getByRole('dialog', { name: 'تنظیمات سازمان' });
    await expect(dialog).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    });

    await expect(dialog.getByText('نشان سازمان به‌روز شد.')).toBeVisible();

    // نشان باید **واقعاً** از سرور خوانده شود، نه فقط پیام موفقیت نشان داده شود.
    const logo = page.locator('img[alt]').first();
    await expect(logo).toBeVisible();
    const source = await logo.getAttribute('src');
    expect(source).toContain('/base-data/organization/logo');

    const response = await page.request.get(source as string);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');

    // ───── پاک‌سازی ─────
    await dialog.getByRole('button', { name: 'حذف نشان' }).click();
    await expect(dialog.getByText('نشان سازمان حذف شد.')).toBeVisible();
    await dialog.getByRole('button', { name: 'بستن' }).click();

    const afterRemoval = await page.request.get(source as string);
    expect(afterRemoval.status(), 'نشان پس از حذف هنوز سرو می‌شود').toBe(404);
  });

  test('فایل غیرتصویری پذیرفته نمی‌شود', async ({ page }) => {
    await login(page, 'admin');

    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: 'تنظیمات سازمان' }).click();

    // محتوای HTML با نام و نوع اعلام‌شده PNG — امضای فایل باید لو بدهد.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'evil.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<html><script>alert(1)</script></html>'),
    });

    const dialog = page.getByRole('dialog', { name: 'تنظیمات سازمان' });
    await expect(dialog.getByRole('status')).toBeVisible();
    await expect(dialog.getByText('نشان سازمان به‌روز شد.')).toHaveCount(0);
  });
});
