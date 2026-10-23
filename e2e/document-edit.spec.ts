import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * ویرایش مشخصات سند، پیش از ثبت نهایی.
 *
 * تا پیش از این فقط «شرح» از راه API عوض می‌شد و رابط هیچ راهی نداشت؛ کاربری که
 * سال یا خریدار را اشتباه زده بود باید سند را رها می‌کرد و از نو می‌ساخت.
 *
 * ادعای آزمون سه چیز است: دکمه کنار وضعیت هست، تغییر واقعاً ذخیره می‌شود، و پس از
 * ثبت نهایی دکمه **نیست** — چون سند ثبت‌شده ویرایش نمی‌شود.
 */
test.describe('ویرایش مشخصات سند', () => {
  test('شرح و سال شمسی سند پیش‌نویس عوض می‌شوند', async ({ page }) => {
    const title = unique('سند ویرایش');
    const newTitle = unique('سند اصلاح‌شده');

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');

    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();

    // ───── دکمه کنار وضعیت ─────
    await page.getByRole('button', { name: 'ویرایش مشخصات سند' }).click();
    const dialog = page.getByRole('dialog', { name: 'ویرایش مشخصات سند' });

    // فرم با مقدارهای فعلی باز می‌شود، نه خالی.
    await expect(dialog.getByLabel('شرح سند')).toHaveValue(title);

    await dialog.getByLabel('شرح سند').fill(newTitle);
    await dialog.getByRole('textbox', { name: 'سال شمسی' }).fill('1406');
    await dialog.getByRole('button', { name: 'ثبت اصلاح' }).click();
    await expect(page.getByText('مشخصات سند اصلاح شد.')).toBeVisible();

    // سربرگ سند با مقدار تازه خوانده می‌شود.
    await expect(page.getByRole('heading', { name: newTitle })).toBeVisible();
    await expect(page.getByText('سال شمسی ۱۴۰۶')).toBeVisible();
  });

  test('سند ثبت‌نهایی‌شده دکمهٔ ویرایش ندارد', async ({ page }) => {
    const title = unique('سند قفل');

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');

    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();
    await expect(page.getByRole('button', { name: 'ویرایش مشخصات سند' })).toBeVisible();

    // ثبت نهایی به یک فاکتور نیاز دارد.
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });
    const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    if ((await typeSelect.count()) > 0) {
      await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
    }
    await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
    await page.getByLabel('شرح ردیف ۱').fill('ملزومات');
    await page.getByLabel('تعداد').fill('1');
    await pickOption(page, 'واحد');
    await page.getByLabel('مبلغ واحد').fill('1000000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();

    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

    await expect(page.getByRole('button', { name: 'ویرایش مشخصات سند' })).toHaveCount(0);
  });
});
