import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * نام صاحب حساب قبض.
 *
 * سه ادعا:
 *
 *  ۱. فیلد فقط در روش «قبض» دیده می‌شود — در بقیهٔ روش‌ها اصلاً نیست.
 *  ۲. در فاکتور انشعابات، از **نام مدرسه** پر می‌شود.
 *  ۳. کاربر می‌تواند عوضش کند و همان در گزارش شبای ذینفعان چاپ می‌شود.
 */
test.describe('نام صاحب حساب قبض', () => {
  test('از نام مدرسه پر می‌شود، ویرایش‌شدنی است و در گزارش می‌آید', async ({ page }) => {
    const title = unique('سند قبض انشعاب');
    const payee = unique('اداره آب');
    const school = unique('مدرسه قبض');

    await login(page, 'admin');

    /*
      یک مدرسهٔ تازه برای هر اجرا.

      قاعدهٔ «پرداخت تکراری انشعاب» بین اسناد هم کار می‌کند، پس استفادهٔ دوباره از
      یک مدرسه یعنی اجرای دوم به هشدار می‌خورد — شکستی که ربطی به چیزی که این
      آزمون می‌سنجد ندارد.
    */
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

    // ───── فاکتور انشعابات، با روش قبض ─────
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    // فصل انشعابات در گروه عمرانی است و فهرست فصل‌ها همان گروه را نشان می‌دهد.
    await page.locator('label').filter({ hasText: 'عمرانی' }).first().click();
    await pickOption(page, 'فصل', { search: 'انشعابات', nth: 0 });

    const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    if ((await typeSelect.count()) > 0) {
      await pickOption(page, 'نوع فاکتور', { text: 'فاکتور انشعابات' });
    }

    // روش پیش‌فرض انشعابات «قبض» است؛ پیش از انتخاب مدرسه فیلد هست ولی خالی.
    const payeeField = page.getByLabel('نام صاحب حساب');
    await expect(payeeField, 'فیلد نام صاحب حساب در روش قبض نیست').toBeVisible();

    await pickOption(page, 'مدرسه', { search: school, nth: 0 });

    // پیش‌فرض، نام همان مدرسه‌ای است که انتخاب شد.
    await expect(payeeField, 'نام مدرسه در فیلد صاحب حساب ننشست').toHaveValue(school);

    await pickOption(page, 'نوع انشعاب');
    await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
    // «مبلغ» هم برچسب ورودی است و هم بخشی از چند برچسب دیگر؛ نقش، ابهام را برمی‌دارد.
    await page.getByRole('textbox', { name: 'مبلغ', exact: true }).fill('5000000');

    // و کاربر می‌تواند عوضش کند.
    await payeeField.fill(payee);
    await page.getByLabel('شناسه قبض').fill('123456');
    // روش «قبض» شناسهٔ پرداخت را هم الزامی می‌داند؛ بدونش ثبت نهایی رد می‌شود.
    await page.getByLabel('شناسه پرداخت').fill('654321');

    // شرح فاکتور اجباری است؛ همان جمله‌ای که در گزارش مالیات هم می‌نشیند.
    await page.getByLabel('شرح فاکتور').fill(unique('شرح'));
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByRole('button', { name: 'ثبت فاکتور' })).toHaveCount(0);

    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

    // ───── گزارش: همان نام، نه نام فروشنده ─────
    await page.getByRole('button', { name: 'شبای ذینفعان' }).click();
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(table.getByText(payee), 'نام صاحب حساب در گزارش نیامده است').toBeVisible();
  });

  test('در روش تنخواه، فیلد نام صاحب حساب نیست', async ({ page }) => {
    const title = unique('سند تنخواه بی‌قبض');

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();

    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
    await page.getByRole('button', { name: title }).click();

    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });

    // فیلد به روش پرداخت گره خورده است، نه اینکه همیشه باشد و خالی بماند.
    await expect(page.getByLabel('نام صاحب حساب')).toHaveCount(0);
  });
});
