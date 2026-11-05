import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * گزارش جدای انشعابات.
 *
 * شکایت این بود: برای پیدا کردن قبض یک مدرسه باید اول «نوع فاکتور: انشعابات» را
 * فیلتر می‌کردی و بعد از میان ده‌ها فیلد بی‌ربط دنبال «مدرسه» می‌گشتی.
 *
 * سه ادعا:
 *
 *  ۱. گزارش انشعابات **خودش** هست و شرط نوع فاکتور در تعریفش نشسته — پس فیلد
 *     «نوع فاکتور» اصلاً در فهرست فیلترها نیست.
 *  ۲. مدرسه فهرست انتخاب دارد و نه جعبهٔ متن خالی؛ گزینه‌ها از خودِ داده می‌آیند.
 *  ۳. فیلتر مدرسه واقعاً کار می‌کند.
 */

test.describe('گزارش انشعابات', () => {
  test('گزارش جدا، با فهرست انتخاب مدرسه', async ({ page }) => {
    const school = unique('مدرسه انشعاب');
    const title = unique('سند انشعاب گزارش');

    await login(page, 'admin');

    // مدرسه‌ای تازه: قاعدهٔ «پرداخت تکراری انشعاب» بین اسناد هم کار می‌کند.
    await gotoSection(page, 'مدارس');
    await page.getByRole('button', { name: 'افزودن مدرسه' }).first().click();
    const schoolDialog = page.getByRole('dialog', { name: 'مدرسهٔ جدید' });
    await schoolDialog.getByRole('combobox', { name: 'ناحیه', exact: true }).click();
    await page.getByRole('option').first().click();
    await schoolDialog.getByLabel('نام مدرسه').fill(school);
    await schoolDialog.getByRole('button', { name: 'ثبت مدرسه' }).click();
    await expect(page.getByText('مدرسه ثبت شد.')).toBeVisible();

    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
    await page.getByRole('button', { name: title }).click();

    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await page.locator('label').filter({ hasText: 'عمرانی' }).first().click();
    await pickOption(page, 'فصل', { search: 'انشعابات', nth: 0 });
    await pickOption(page, 'مدرسه', { search: school, nth: 0 });
    await pickOption(page, 'نوع انشعاب');
    await page.getByRole('textbox', { name: 'مبلغ', exact: true }).fill('1500000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    // شرح فاکتور اجباری است؛ همان جمله‌ای که در گزارش مالیات هم می‌نشیند.
    await page.getByLabel('شرح فاکتور').fill(unique('شرح'));
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByRole('button', { name: 'ثبت فاکتور' })).toHaveCount(0);

    // ───── گزارش انشعابات ─────
    await gotoSection(page, 'گزارش‌گیری');
    const tab = page.getByRole('button', { name: 'انشعابات', exact: true });
    await expect(tab, 'گزارش انشعابات در فهرست گزارش‌ها نیست').toBeVisible();
    await tab.click();

    await page.getByRole('button', { name: /^فیلترها/ }).click();
    await page.getByRole('button', { name: 'افزودن شرط' }).click();

    await page.getByRole('combobox', { name: 'فیلد شرط ۱' }).click();

    // نوع فاکتور اینجا همیشه «انشعابات» است؛ فیلتری که همیشه یک جواب دارد، فیلتر نیست.
    await expect(
      page.getByRole('option', { name: 'نوع فاکتور', exact: true }),
      'فیلد نوع فاکتور در گزارش انشعابات هم آمده است',
    ).toHaveCount(0);

    await page.getByRole('option', { name: 'مدرسه', exact: true }).click();

    /*
      مقدار مدرسه فهرست انتخاب است و نه جعبهٔ متن: گزینه‌ها از خودِ داده می‌آیند،
      پس کاربر لازم نیست نام را درست حدس بزند.
    */
    const value = page.getByRole('combobox', { name: 'مقدار' }).last();
    await expect(value, 'مقدار مدرسه فهرست انتخاب ندارد').toBeVisible();
    await value.click();
    await page.getByRole('option', { name: school, exact: true }).click();

    await page.getByRole('button', { name: 'اجرای گزارش' }).click();

    const table = page.getByRole('table');
    await expect(table.getByText(school).first()).toBeVisible();
    await expect(table.getByText(title).first()).toBeVisible();
  });
});
