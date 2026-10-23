import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * ویرایش فاکتور، پیش از ثبت نهایی.
 *
 * ادعاها: فرم با مقدارهای فعلی باز می‌شود (نه خالی)، تغییر واقعاً ذخیره و جمع سند
 * بازمحاسبه می‌شود، و پس از ثبت نهایی دکمهٔ ویرایش نیست.
 *
 * نکتهٔ پشت صحنه: ویرایش، **بازسازی** فاکتور در جای خودش است — ردیف‌ها و پرداخت از
 * نو ساخته می‌شوند — ولی شناسهٔ فاکتور می‌ماند. همین آزمون، بازمحاسبهٔ جمع سند را
 * می‌سنجد که نشانهٔ درست اجرا شدن همان مسیر است.
 */
test.describe('ویرایش فاکتور', () => {
  test('فاکتور پیش‌نویس ویرایش می‌شود و جمع سند بازمحاسبه می‌گردد', async ({ page }) => {
    const title = unique('سند ویرایش فاکتور');
    const firstDescription = unique('خرید اول');
    const newDescription = unique('خرید اصلاح‌شده');

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');

    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
    await page.getByRole('button', { name: title }).click();

    // ───── فاکتور اولیه: ۱ × ۱٬۰۰۰٬۰۰۰ با ۱۰٪ مالیات ─────
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });
    const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    if ((await typeSelect.count()) > 0) {
      await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
    }
    await pickOption(page, 'فروشنده');
    await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
    await page.getByLabel('شرح فاکتور').fill(firstDescription);
    await page.getByLabel('شرح ردیف ۱').fill('کاغذ');
    await page.getByLabel('تعداد').fill('1');
    await pickOption(page, 'واحد');
    await page.getByLabel('مبلغ واحد').fill('1000000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();

    await expect(page.getByText('جمع سند').locator('..')).toContainText('۱٬۱۰۰٬۰۰۰');

    // ───── ویرایش: فرم باید پر باز شود ─────
    await page.getByRole('button', { name: 'ویرایش', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'ویرایش فاکتور', exact: true })).toBeVisible();

    await expect(page.getByLabel('شرح فاکتور')).toHaveValue(firstDescription);
    await expect(page.getByLabel('شرح ردیف ۱')).toHaveValue('کاغذ');
    await expect(page.getByLabel('مبلغ واحد')).toHaveValue('1000000');

    await page.getByLabel('شرح فاکتور').fill(newDescription);
    await page.getByLabel('مبلغ واحد').fill('3000000');
    await page.getByRole('button', { name: 'ثبت ویرایش' }).click();
    await expect(page.getByText('فاکتور اصلاح شد.')).toBeVisible();

    // ───── جمع سند با مقدار تازه بازمحاسبه شده است ─────
    await expect(page.getByText('جمع سند').locator('..')).toContainText('۳٬۳۰۰٬۰۰۰');
    await expect(page.getByText(newDescription)).toBeVisible();

    // و فاکتور **یکی** مانده است؛ ویرایش، نسخهٔ دوم نساخته.
    await expect(page.getByRole('button', { name: 'ویرایش', exact: true })).toHaveCount(1);

    // ───── پس از ثبت نهایی، ویرایش نیست ─────
    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ویرایش', exact: true })).toHaveCount(0);
  });
});
