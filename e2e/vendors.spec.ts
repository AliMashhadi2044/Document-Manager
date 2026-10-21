import { expect, test } from '@playwright/test';

import { gotoSection, login, unique, uniqueIban } from './helpers';

/**
 * فروشنده: فرم کامل، اصلاح، و مدیریت شباها.
 *
 * ادعای اصلی این آزمون‌ها «فیلد وجود دارد» نیست، بلکه این است که مقدار واردشده
 * **برمی‌گردد**: پس از ثبت یا اصلاح، صفحه بازخوانی می‌شود و همان مقدار باید از
 * سرور بیاید. بدون آن، یک فرم که هیچ‌چیز را نمی‌فرستد هم سبز می‌شد.
 *
 * فروشنده حذف نمی‌شود (فاکتورها به آن ارجاع می‌دهند)، پس پاک‌سازی این آزمون‌ها
 * غیرفعال کردن است.
 */
test.describe('فروشندگان', () => {
  test('ثبت با همه فیلدها، اصلاح و غیرفعال کردن', async ({ page }) => {
    const name = unique('فروشنده آزمون');

    await login(page, 'admin');
    await gotoSection(page, 'فروشندگان');

    // ───── ثبت ─────
    await page.getByRole('button', { name: 'افزودن فروشنده' }).click();
    const dialog = page.getByRole('dialog', { name: 'فروشنده جدید' });

    await dialog.getByLabel('عنوان شرکت').fill(name);
    await dialog.getByLabel('نام نماینده').fill('نمایندهٔ آزمون');
    await dialog.getByLabel('کد پستی').fill('1234567890');
    await dialog.getByLabel('تلفن').fill('02112345678');
    await dialog.getByLabel('نمابر').fill('02187654321');
    await dialog.getByLabel('نشانی').fill('تهران، خیابان آزمون');
    await dialog.getByRole('button', { name: 'ثبت فروشنده' }).click();
    await expect(page.getByText('فروشنده ثبت شد.')).toBeVisible();

    // ───── مقدارها باید از سرور برگردند، نه از حالت فرم ─────
    await page.reload();
    await gotoSection(page, 'فروشندگان');
    await page.getByLabel('جست‌وجو').fill(name);

    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    // کدپستی و تلفن، همان دو فیلدی که پیش از این در فرم نبودند.
    await expect(row).toContainText('۰۲۱۱۲۳۴۵۶۷۸');
    await expect(row).toContainText('۱۲۳۴۵۶۷۸۹۰');

    // ───── اصلاح: تغییر تلفن و پاک کردن نمابر ─────
    await row.getByRole('button', { name: `اصلاح ${name}` }).click();
    const editDialog = page.getByRole('dialog', { name: 'اصلاح فروشنده' });
    await expect(editDialog.getByLabel('نمابر')).toHaveValue('02187654321');

    await editDialog.getByLabel('تلفن').fill('02199999999');
    // پاک کردن یک مقدار ثبت‌شده باید واقعاً پاکش کند، نه نادیده گرفته شود.
    await editDialog.getByLabel('نمابر').fill('');
    await editDialog.getByRole('button', { name: 'ثبت اصلاح' }).click();
    await expect(page.getByText('فروشنده اصلاح شد.')).toBeVisible();

    await row.getByRole('button', { name: `اصلاح ${name}` }).click();
    await expect(editDialog.getByLabel('تلفن')).toHaveValue('02199999999');
    await expect(editDialog.getByLabel('نمابر')).toHaveValue('');
    await page.keyboard.press('Escape');

    // ───── پاک‌سازی: غیرفعال کردن ─────
    await row.getByRole('button', { name: `غیرفعال کردن ${name}` }).click();
    await expect(page.getByText('فروشنده غیرفعال شد.')).toBeVisible();
    await expect(row).toContainText('غیرفعال');
  });

  test('افزودن چند شبا، پیش‌فرض کردن و غیرفعال کردن یکی', async ({ page }) => {
    const name = unique('فروشنده شبا');
    const first = uniqueIban('012');
    const second = uniqueIban('017');

    await login(page, 'admin');
    await gotoSection(page, 'فروشندگان');

    await page.getByRole('button', { name: 'افزودن فروشنده' }).click();
    await page.getByRole('dialog', { name: 'فروشنده جدید' }).getByLabel('عنوان شرکت').fill(name);
    await page.getByRole('dialog', { name: 'فروشنده جدید' })
      .getByRole('button', { name: 'ثبت فروشنده' })
      .click();
    await expect(page.getByText('فروشنده ثبت شد.')).toBeVisible();

    await page.getByLabel('جست‌وجو').fill(name);
    const row = page.getByRole('row').filter({ hasText: name });
    await row.getByRole('button', { name: `شباهای ${name}` }).click();

    const dialog = page.getByRole('dialog', { name: `شباهای ${name}` });
    await expect(dialog).toBeVisible();

    // ───── شبای اول: اولین حساب، خودکار پیش‌فرض است ─────
    await dialog.getByLabel('شماره شبا').fill(first);

    /*
     * سه ادعا در یک جا:
     *  - `IR` بیرون از کادر ویرایش است، پس مقدار خودِ ورودی فقط رقم‌هاست (گروه‌های چهارتایی).
     *  - بانک **حین تایپ** و بدون رفت‌وبرگشت به سرور تشخیص داده می‌شود.
     *  - نشان همان بانک، از کد سه‌رقمی بارگذاری می‌شود.
     */
    const grouped = (first.slice(2).match(/.{1,4}/gu) ?? []).join(' ');
    await expect(dialog.getByLabel('شماره شبا')).toHaveValue(grouped);
    await expect(dialog.getByText('بانک ملت').first()).toBeVisible();

    const logo = dialog.locator('img[src="/bank-logos/012.svg"]');
    await expect(logo).toBeVisible();
    // نشان باید **واقعاً** سرو شود؛ آدرس درست با تصویر نداشته فرقی نمی‌کند.
    const logoResponse = await page.request.get('/bank-logos/012.svg');
    expect(logoResponse.status()).toBe(200);
    expect(logoResponse.headers()['content-type']).toContain('image/svg');

    await dialog.getByLabel('عنوان حساب').fill('حساب جاری');
    await dialog.getByRole('button', { name: 'افزودن شبا' }).click();
    await expect(dialog.getByText('شبا ثبت شد.')).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'حساب جاری' })).toContainText(
      'پیش‌فرض',
    );

    // ───── شبای دوم ─────
    await dialog.getByLabel('شماره شبا').fill(second);
    // بانک دوم، نشان دیگری دارد — یعنی تشخیص به کد بستگی دارد نه به یک مقدار ثابت.
    await expect(dialog.locator('img[src="/bank-logos/017.svg"]')).toBeVisible();
    await dialog.getByLabel('عنوان حساب').fill('حساب دوم');
    await dialog.getByRole('button', { name: 'افزودن شبا' }).click();
    await expect(dialog.getByText('شبا ثبت شد.')).toBeVisible();

    const secondItem = dialog.getByRole('listitem').filter({ hasText: 'حساب دوم' });
    await expect(secondItem).toBeVisible();

    // ───── جابه‌جایی پیش‌فرض: دقیقاً یکی باید پیش‌فرض بماند ─────
    await secondItem.getByRole('button', { name: `${second} پیش‌فرض شود` }).click();
    await expect(dialog.getByText('شبای پیش‌فرض تغییر کرد.')).toBeVisible();
    await expect(dialog.getByText('پیش‌فرض', { exact: true })).toHaveCount(1);
    await expect(secondItem).toContainText('پیش‌فرض');

    // ───── غیرفعال کردن، جایگزین حذف ─────
    const firstItem = dialog.getByRole('listitem').filter({ hasText: 'حساب جاری' });
    await firstItem.getByRole('button', { name: `غیرفعال کردن ${first}` }).click();
    await expect(dialog.getByText('حساب غیرفعال شد.')).toBeVisible();
    await expect(firstItem).toContainText('غیرفعال');

    // شمارش ستون «شبا» در فهرست، هر دو حساب را می‌شمارد.
    await page.keyboard.press('Escape');
    await expect(row).toContainText('۲');

    // ───── پاک‌سازی ─────
    await row.getByRole('button', { name: `غیرفعال کردن ${name}` }).click();
    await expect(page.getByText('فروشنده غیرفعال شد.')).toBeVisible();
  });

  test('شبای نامعتبر ثبت نمی‌شود', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'فروشندگان');

    const row = page.getByRole('row').nth(1);
    await row.getByRole('button', { name: /^شباهای / }).click();

    const dialog = page.getByRole('dialog', { name: /^شباهای / });
    // جای‌گذاری با پیشوند IR هم باید کار کند: پیشوند کنار گذاشته می‌شود، رقم‌ها نه.
    await dialog.getByLabel('شماره شبا').fill('IR000000000000000000000000');
    await expect(dialog.getByLabel('شماره شبا')).toHaveValue('0000 0000 0000 0000 0000 0000');

    await expect(dialog.getByText(/رقم کنترلی/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'افزودن شبا' })).toBeDisabled();
  });
});
