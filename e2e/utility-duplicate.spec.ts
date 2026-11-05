import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * پرداخت تکراری انشعاب.
 *
 * قاعده: یک مدرسه نباید دوبار برای یک نوع انشعاب در یک سال مالی فاکتور بخورد.
 * ادعای این آزمون سه چیز است: هشدار **پیش از ثبت** می‌آید، **جزئیات کامل** پرداخت
 * قبلی را دارد، و بدون تأیید صریح، ثبت انجام نمی‌شود.
 */

/** یک سند تازه با فصل انشعابات، تا پای فرم فاکتور. */
async function utilityForm(page: import('@playwright/test').Page, title: string): Promise<void> {
  await gotoSection(page, 'اسناد');

  // اگر سندی باز است، «اسناد» در منو ما را به فهرست برنمی‌گرداند؛ باید بست.
  const back = page.getByRole('button', { name: 'بازگشت به فهرست' });
  if ((await back.count()) > 0) await back.first().click();

  // فرم ممکن است از قبل باز مانده باشد؛ دکمهٔ بازکننده و دکمهٔ ثبت هم‌نام‌اند.
  if ((await page.getByLabel('شرح سند').count()) === 0) {
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
  }

  const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
  await page.getByLabel('شرح سند').fill(title);
  await pickOption(page, 'مجموعه خریدار');
  await form.getByRole('button', { name: 'ایجاد سند' }).click();
  await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

  await page.getByRole('button', { name: title }).click();
  await page.getByRole('button', { name: 'افزودن فاکتور' }).click();

  // فصل انشعابات در گروه عمرانی است.
  await page.locator('label').filter({ hasText: 'عمرانی' }).first().click();
  await pickOption(page, 'فصل', { search: 'انشعابات', nth: 0 });
}

test.describe('پرداخت تکراری انشعاب', () => {
  test('بار دوم هشدار کامل می‌دهد و بدون تأیید ثبت نمی‌شود', async ({ page }) => {
    const school = unique('مدرسه تکرار');
    const first = unique('سند انشعاب اول');
    const second = unique('سند انشعاب دوم');

    await login(page, 'admin');

    // ───── یک مدرسهٔ تازه، تا آزمون به دادهٔ قبلی وابسته نباشد ─────
    await gotoSection(page, 'مدارس');
    await page.getByRole('button', { name: 'افزودن مدرسه' }).first().click();
    const schoolDialog = page.getByRole('dialog', { name: 'مدرسهٔ جدید' });
    await schoolDialog.getByRole('combobox', { name: 'ناحیه', exact: true }).click();
    await page.getByRole('option').first().click();
    await schoolDialog.getByLabel('نام مدرسه').fill(school);
    await schoolDialog.getByRole('button', { name: 'ثبت مدرسه' }).click();
    await expect(page.getByText('مدرسه ثبت شد.')).toBeVisible();

    // ───── فاکتور اول: هیچ هشداری نباید باشد ─────
    await utilityForm(page, first);
    await pickOption(page, 'مدرسه', { search: school, nth: 0 });
    await pickOption(page, 'نوع انشعاب');

    await expect(page.getByRole('alert').filter({ hasText: 'پیش از این' })).toHaveCount(0);

    await page.getByRole('textbox', { name: 'مبلغ', exact: true }).fill('5000000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    // شرح فاکتور اجباری است؛ همان جمله‌ای که در گزارش مالیات هم می‌نشیند.
    await page.getByLabel('شرح فاکتور').fill(unique('شرح'));
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('جمع سند').locator('..')).toContainText('۵٬۵۰۰٬۰۰۰');

    // ───── فاکتور دوم، همان مدرسه و همان انشعاب ─────
    await utilityForm(page, second);
    await pickOption(page, 'مدرسه', { search: school, nth: 0 });
    await pickOption(page, 'نوع انشعاب');

    const warning = page.getByRole('alert').filter({ hasText: 'پیش از این' });
    await expect(warning).toBeVisible();

    // جزئیات کامل: سند، تاریخ، مبلغ و روش پرداخت.
    await expect(warning).toContainText(school);
    await expect(warning).toContainText(first);
    await expect(warning).toContainText('۵٬۵۰۰٬۰۰۰');
    await expect(warning).toContainText('تنخواه');

    await page.getByRole('textbox', { name: 'مبلغ', exact: true }).fill('3000000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });

    /*
     * بدون تأیید، سرور باید رد کند — و پیام خطا هم باید همان جزئیات را داشته باشد،
     * نه یک «خطای نامشخص».
     */
    // شرح فاکتور اجباری است؛ همان جمله‌ای که در گزارش مالیات هم می‌نشیند.
    await page.getByLabel('شرح فاکتور').fill(unique('شرح'));
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText(/پیش از این برای/).first()).toBeVisible();

    // با تأیید صریح، ثبت انجام می‌شود.
    await warning.getByRole('checkbox').check();
    // شرح فاکتور اجباری است؛ همان جمله‌ای که در گزارش مالیات هم می‌نشیند.
    await page.getByLabel('شرح فاکتور').fill(unique('شرح'));
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('جمع سند').locator('..')).toContainText('۳٬۳۰۰٬۰۰۰');
  });
});
