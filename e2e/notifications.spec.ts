import { expect, test } from '@playwright/test';

import { gotoSection, login } from './helpers';

/**
 * اعلان‌ها: نشان سربرگ و صفحهٔ کامل.
 *
 * این آزمون‌ها به **وجود اعلان** وابسته نیستند؛ چیزی را می‌سنجند که در هر دو حالت
 * باید درست باشد: باز و بسته شدن، پوشش پشت پاپ‌آپ، و رسیدن به صفحهٔ کامل.
 */
test.describe('اعلان‌ها', () => {
  test('پاپ‌آپ با کلیک بیرون و با Escape بسته می‌شود', async ({ page }) => {
    await login(page, 'admin');

    // دکمهٔ نشان در سربرگ است؛ منوی کناری هم آیتمی به همین نام دارد.
    const trigger = page.locator('header').getByRole('button', { name: /^اعلان‌ها/ });
    await trigger.click();

    const panel = page.getByRole('dialog', { name: 'اعلان‌ها' });
    await expect(panel).toBeVisible();

    // کلیک روی پوشش — جایی دور از خود پاپ‌آپ.
    await page.mouse.click(40, 500);
    await expect(panel).toHaveCount(0);

    await trigger.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    // فوکوس باید به دکمه برگردد، وگرنه کاربر کیبورد از ابتدای صفحه شروع می‌کند.
    await expect(trigger).toBeFocused();
  });

  test('از پاپ‌آپ می‌شود به صفحهٔ کامل اعلان‌ها رفت', async ({ page }) => {
    await login(page, 'admin');

    await page.locator('header').getByRole('button', { name: /^اعلان‌ها/ }).click();
    await page.getByRole('dialog', { name: 'اعلان‌ها' }).getByRole('button', { name: 'همهٔ اعلان‌ها' }).click();

    await expect(page.getByRole('heading', { name: 'اعلان‌ها' })).toBeVisible();
    // فیلترهای صفحه کامل، چیزی است که پاپ‌آپ ندارد.
    await expect(page.getByRole('button', { name: 'همه', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^خوانده‌نشده/ })).toBeVisible();
  });

  test('صفحهٔ اعلان‌ها از منوی کناری هم باز می‌شود', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'اعلان‌ها');
    await expect(page.getByRole('heading', { name: 'اعلان‌ها' })).toBeVisible();
  });
});

/**
 * سال‌های پیش‌فرض سازمان.
 *
 * ادعای اصلی این است که مقدارِ ذخیره‌شده در تنظیمات، در **فرم ایجاد سند** ظاهر
 * می‌شود؛ بدون آن بررسی، این فقط یک فیلد دیگر در یک گفت‌وگوست.
 */
test.describe('سال پیش‌فرض', () => {
  test('ذخیره در تنظیمات، فرم ایجاد سند را از پیش پر می‌کند', async ({ page }) => {
    await login(page, 'admin');

    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: 'تنظیمات سازمان' }).click();

    const dialog = page.getByRole('dialog', { name: 'تنظیمات سازمان' });

    // پاک کردن پیش‌فرضِ احتمالیِ اجرای قبلی: دکمهٔ ذخیره تا وقتی مقدار عوض نشده
    // غیرفعال است، پس آزمون باید از حالت خالی شروع کند.
    const clear = dialog.getByRole('button', { name: 'برداشتن پیش‌فرض' });
    if ((await clear.count()) > 0) {
      await clear.click();
      await expect(clear).toHaveCount(0);
    }

    await dialog.getByLabel('سال مالی پیش‌فرض', { exact: true }).fill('1404');
    await dialog.getByLabel('سال شمسی پیش‌فرض', { exact: true }).fill('1403');
    await dialog.getByRole('button', { name: 'ذخیرهٔ سال‌ها' }).click();
    await expect(dialog.getByText('سال‌های پیش‌فرض ذخیره شد.')).toBeVisible();

    await page.keyboard.press('Escape');

    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const fiscal = page.locator('#fiscalYear');
    const jalali = page.locator('#jalaliYear');
    await expect(fiscal).toHaveValue('1404');
    await expect(jalali).toHaveValue('1403');

    // دکمه‌های کم و زیاد، همان فیلد را یک سال جابه‌جا می‌کنند.
    await page.getByRole('button', { name: 'یک سال بیشتر از سال مالی' }).click();
    await expect(fiscal).toHaveValue('1405');

    // ورودی غیرعددی اصلاً پذیرفته نمی‌شود.
    await jalali.fill('abcd');
    await expect(jalali).toHaveValue('');

    // پاک کردن پیش‌فرض، تا اجراهای بعدی از حالت تمیز شروع کنند.
    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: 'تنظیمات سازمان' }).click();
    await page.getByRole('button', { name: 'برداشتن پیش‌فرض' }).click();
  });
});
