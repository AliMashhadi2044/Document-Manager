import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, toAsciiDigits, unique } from './helpers';

/**
 * شماره و تاریخ گردش، و اختیاری شدن شمارهٔ نیاز.
 *
 * سه ادعا:
 *
 *  ۱. گردش برای **سند عادی** هم هست — پیش از این داخل بلوک ستاد بود و سند عادی
 *     اصلاً جایی برای ثبتش نداشت.
 *  ۲. سند ستاد **بدون شمارهٔ نیاز** ثبت می‌شود؛ الزامی بودنش کار را همان اول
 *     متوقف می‌کرد.
 *  ۳. هر دو مقدار **برمی‌گردند**: پس از ثبت، از سرور خوانده و در برگهٔ سند دیده
 *     می‌شوند. فرمی که چیزی نفرستد هم بدون این ادعا سبز می‌شد.
 */

/**
 * فرم ایجاد سند، با نوع انتخاب‌شده.
 *
 * نوع سند یک کلید دکمه‌ای است و نه فهرست بازشو؛ انتخابش با کلیک روی همان دکمه
 * انجام می‌شود و `aria-pressed` تأییدش می‌کند.
 */
async function openCreateForm(page: Page, type: 'عادی' | 'سامانه ستاد'): Promise<void> {
  await gotoSection(page, 'اسناد');
  await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();

  const typeButton = page.getByRole('button', { name: type, exact: true });
  await typeButton.click();
  await expect(typeButton).toHaveAttribute('aria-pressed', 'true');
}

test.describe('شماره و تاریخ گردش', () => {
  test('سند عادی هم گردش دارد و مقدارش برمی‌گردد', async ({ page }) => {
    const title = unique('سند گردش عادی');
    const workflowNumber = `WF-${Date.now().toString().slice(-6)}`;

    await login(page, 'procurement');
    await openCreateForm(page, 'عادی');

    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');

    // همین که این دو فیلد در سند **عادی** هستند، خودش نیمی از ادعاست.
    await page.getByLabel('شماره گردش').fill(workflowNumber);
    await page.getByLabel('تاریخ گردش').fill('1405/07/20');

    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();

    /*
      مقایسه پس از تبدیل ارقام.

      رابط همه‌جا ارقام را فارسی نشان می‌دهد (`toPersianDigits`)، پس مقایسهٔ مستقیم
      با رشتهٔ تایپ‌شده شکست می‌خورد بی‌آنکه چیزی خراب باشد.
    */
    const workflowField = page.getByText('شماره گردش', { exact: true }).locator('..');
    expect(toAsciiDigits((await workflowField.textContent()) ?? '')).toContain(workflowNumber);

    const dateField = page.getByText('تاریخ گردش', { exact: true }).locator('..');
    expect(toAsciiDigits((await dateField.textContent()) ?? '')).toContain('1405/07/20');
  });

  test('سند ستاد بدون شمارهٔ نیاز ثبت می‌شود', async ({ page }) => {
    const title = unique('سند ستاد بی‌نیاز');

    await login(page, 'procurement');
    await openCreateForm(page, 'سامانه ستاد');

    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');

    // شمارهٔ نیاز عمداً خالی می‌ماند؛ شمارهٔ درخواست همچنان الزامی است.
    await page.getByLabel('شماره درخواست').fill('REQ-1');

    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();

    /*
      «ثبت نشده» و نه خط تیره.

      تفاوتش معنادار است: خط تیره یعنی «مقدار ندارد» و این یعنی «هنوز وارد
      نشده» — در یک سامانهٔ مالی، این دو را یکی نشان دادن، اطلاعات غلط است.
    */
    await expect(page.getByText('شماره نیاز', { exact: true }).locator('..')).toContainText(
      'ثبت نشده',
    );
  });
});
