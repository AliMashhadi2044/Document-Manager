import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * ساخت اطلاعات پایه **بدون خروج از فرم**.
 *
 * ادعای این آزمون‌ها «گفت‌وگو باز می‌شود» نیست؛ این است که مورد تازه در همان فهرست
 * **انتخاب‌شده** برمی‌گردد — یعنی کاربر می‌تواند سند نیمه‌تمامش را ادامه بدهد.
 */
test.describe('ساخت درجا', () => {
  test('مدرسه را می‌شود از صفحهٔ خودش ساخت', async ({ page }) => {
    const name = unique('مدرسه آزمون');

    await login(page, 'admin');
    await gotoSection(page, 'مدارس');

    await page.getByRole('button', { name: 'افزودن مدرسه' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'مدرسهٔ جدید' });
    // «ناحیه» هم فیلتر صفحه است و هم فیلد گفت‌وگو؛ انتخاب باید درون گفت‌وگو باشد.
    await dialog.getByRole('combobox', { name: 'ناحیه', exact: true }).click();
    await page.getByRole('option').first().click();
    await dialog.getByLabel('نام مدرسه').fill(name);
    await dialog.getByRole('button', { name: 'ثبت مدرسه' }).click();
    await expect(page.getByText('مدرسه ثبت شد.')).toBeVisible();

    // از سرور برگردد، نه از حالت فرم.
    await page.reload();
    await gotoSection(page, 'مدارس');
    await page.getByLabel('جست‌وجو').fill(name);
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();

    // پاک‌سازی: مدرسهٔ بی‌فاکتور حذف‌شدنی است.
    page.once('dialog', (confirm) => void confirm.accept());
    await page
      .getByRole('row')
      .filter({ hasText: name })
      .getByRole('button', { name: `حذف ${name}` })
      .click();
    await expect(page.getByText('مدرسه حذف شد.')).toBeVisible();
  });

  test('واحد اندازه‌گیری، وسط ثبت فاکتور ساخته و انتخاب می‌شود', async ({ page }) => {
    const unit = unique('واحد آزمون');
    const title = unique('سند آزمون ساخت درجا');

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

    /*
     * فهرست واحد را باز کن و از پای خودِ فهرست بساز — همان‌جایی که کاربر می‌فهمد
     * گزینه‌اش نیست.
     */
    await page.getByRole('combobox', { name: 'واحد' }).click();
    await page.getByRole('button', { name: 'افزودن واحد' }).click();

    const dialog = page.getByRole('dialog', { name: 'واحد اندازه‌گیری جدید' });
    await dialog.getByLabel('عنوان واحد اندازه‌گیری').fill(unit);
    await dialog.getByRole('button', { name: 'ثبت' }).click();

    // ادعای اصلی: همان واحد تازه، حالا انتخاب‌شده است.
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'واحد' })).toContainText(unit);

    // ───── پاک‌سازی ─────
    await gotoSection(page, 'اطلاعات پایه');
    // منبع‌ها دکمه‌اند، نه فهرست انتخاب.
    await page.getByRole('button', { name: 'واحدهای اندازه‌گیری' }).click();
    await page.getByLabel('جست‌وجو').fill(unit);
    page.once('dialog', (confirm) => void confirm.accept());
    await page
      .getByRole('row')
      .filter({ hasText: unit })
      .getByRole('button', { name: /^حذف/ })
      .click();
  });
});
