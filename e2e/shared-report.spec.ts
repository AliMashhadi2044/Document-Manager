import { expect, test } from '@playwright/test';

import { gotoSection, login, logout, unique } from './helpers';

/**
 * فرستادن یک گزارش برای بررسی.
 *
 * مسیر کامل، با دو کاربر واقعی:
 *
 *  ۱. کارپردازی جدول را فیلتر می‌کند، عنوان و شرح می‌گذارد و می‌فرستد.
 *  ۲. ناظر **اعلان** می‌گیرد.
 *  ۳. با کلیک روی اعلان، همان گزارش با همان فیلترها باز می‌شود — با عنوان و شرح
 *     فرستنده بالای جدول.
 *
 * آنچه فرستاده می‌شود تعریف گزارش است و نه ردیف‌هایش؛ ناظر جدول را با دسترسی
 * خودش می‌بیند. همین نکته را آزمون واحد `shared-reports.service.test.ts` از سمت
 * سرور می‌سنجد.
 */

test.describe('ارسال گزارش برای بررسی', () => {
  test('کارپردازی می‌فرستد، ناظر اعلان می‌گیرد و بازش می‌کند', async ({ page }) => {
    const title = unique('بررسی قبض‌ها');
    const description = 'این فاکتورها را بررسی کنید؛ مبلغشان غیرعادی است.';

    // ───── کارپردازی: ساختن و فرستادن ─────
    await login(page, 'procurement');
    await gotoSection(page, 'گزارش‌گیری');

    await page.getByRole('button', { name: 'فاکتورها', exact: true }).click();

    const share = page.getByRole('button', { name: 'ارسال برای بررسی' });
    await expect(share, 'کارپردازی دکمهٔ ارسال را نمی‌بیند').toBeVisible();
    await share.click();

    await page.getByRole('textbox', { name: 'عنوان گزارش' }).fill(title);
    await page.getByRole('textbox', { name: 'شرح گزارش' }).fill(description);
    await page.getByRole('button', { name: 'ارسال گزارش' }).click();

    await expect(page.getByText(`گزارش «${title}» فرستاده شد.`)).toBeVisible();

    // دکمهٔ «خروجی Excel» در همین صفحه هم با «خروج» می‌خواند؛ از صفحهٔ دیگری خارج می‌شویم.
    await gotoSection(page, 'اسناد');
    await logout(page);

    // ───── ناظر: اعلان و باز کردن ─────
    await login(page, 'supervisor');
    await gotoSection(page, 'اعلان‌ها');

    const card = page.getByText(`گزارش تازه: ${title}`);
    await expect(card, 'ناظر اعلان گزارش را نگرفت').toBeVisible();
    await expect(page.getByText(description).first()).toBeVisible();

    await page.getByRole('button', { name: 'نمایش گزارش' }).first().click();

    // عنوان و شرح فرستنده بالای جدول‌اند، و جدول همان گزارش است.
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(description).first()).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    // ناظر خودش نمی‌تواند بفرستد — مجوزش را ندارد.
    await expect(
      page.getByRole('button', { name: 'ارسال برای بررسی' }),
      'ناظر دکمهٔ ارسال گزارش را می‌بیند',
    ).toHaveCount(0);
  });
});
