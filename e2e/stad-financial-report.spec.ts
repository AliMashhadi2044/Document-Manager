import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, toAsciiDigits, unique } from './helpers';

/**
 * «گزارش مالی سامانه ستاد».
 *
 * گزارشی در صفحهٔ گزارش‌گیری و نه در صفحهٔ سند: یک ردیف برای هر سند ستادی، با
 * شماره‌های نیاز و درخواست و گردش، عنوان کالا، مبالغ و توضیحات.
 *
 * چهار ادعا:
 *
 *  ۱. ردیفِ سند در گزارش هست و شماره‌هایش درست‌اند.
 *  ۲. عنوان کالا پیش‌فرض از **شرح فاکتور** می‌آید.
 *  ۳. توضیحات پیش‌فرض، قلم‌ها را می‌شمارد: «تعداد ۲ قلم کالا مجموعا ۵ عدد».
 *  ۴. در جزئیات، قلم‌های همان فاکتور دیده می‌شوند و عنوان کالا دستی عوض می‌شود.
 *
 * و یک ادعای پنجم دربارهٔ رابط سند: سند ستادی فاکتور دوم نمی‌گیرد و پیامش **پیش
 * از** باز شدن فرم می‌آید، نه بعد از پر کردنش.
 */

async function newStadDocument(
  page: Page,
  options: { title: string; needNumber: string; requestNumber: string; workflowNumber: string },
): Promise<void> {
  await gotoSection(page, 'اسناد');
  await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();

  const typeButton = page.getByRole('button', { name: 'سامانه ستاد', exact: true });
  await typeButton.click();
  await expect(typeButton).toHaveAttribute('aria-pressed', 'true');

  const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
  await page.getByLabel('شرح سند').fill(options.title);
  await pickOption(page, 'مجموعه خریدار');
  await page.getByLabel('شماره نیاز').fill(options.needNumber);
  await page.getByLabel('شماره درخواست').fill(options.requestNumber);
  await page.getByLabel('شماره گردش').fill(options.workflowNumber);

  await form.getByRole('button', { name: 'ایجاد سند' }).click();
  await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
  await page.getByRole('button', { name: options.title }).click();
}

test.describe('گزارش مالی سامانه ستاد', () => {
  test('ردیف سند ستادی با شماره‌ها، عنوان کالا و شمارش قلم‌ها', async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const title = unique('سند ستاد گزارش');
    const invoiceDescription = unique('کولر گازی مدارس');
    const needNumber = `NEED-${stamp}`;
    const requestNumber = `REQ-${stamp}`;
    const workflowNumber = `WF-${stamp}`;

    await login(page, 'procurement');
    await newStadDocument(page, { title, needNumber, requestNumber, workflowNumber });

    // ───── یک فاکتور با دو قلم: ۲ عدد و ۳ عدد ─────
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });
    await pickOption(page, 'فروشنده');
    await page.getByLabel('تاریخ صورتحساب').fill('1405/06/02');
    await page.getByLabel('شرح فاکتور').fill(invoiceDescription);

    await page.getByLabel('شرح ردیف ۱').fill('کولر گازی');
    await page.getByLabel('تعداد').first().fill('2');
    await pickOption(page, 'واحد', { nth: 1 });
    await page.getByLabel('مبلغ واحد').first().fill('1000000');

    await page.getByRole('button', { name: 'افزودن ردیف' }).first().click();
    await page.getByLabel('شرح ردیف ۲').fill('لوله مسی');
    await page.getByLabel('تعداد').nth(1).fill('3');
    await page.getByLabel('مبلغ واحد').nth(1).fill('500000');

    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    await pickOption(page, 'تنخواه‌دار', { nth: 1 });
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByRole('button', { name: 'ثبت فاکتور' })).toHaveCount(0);

    /*
      ───── فاکتور دوم: پیام پیش از باز شدن فرم ─────

      نقصی که این ادعا می‌بندد: کاربر فرم را باز می‌کرد، فروشنده و قلم‌ها و مبلغ را
      پر می‌کرد و خطا را تازه موقع ثبت می‌گرفت.
    */
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await expect(page.getByText('سند سامانه ستاد فقط یک فاکتور دارد', { exact: false })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'ثبت فاکتور' }),
      'فرم فاکتور دوم با وجود پیام باز شد',
    ).toHaveCount(0);

    // ───── گزارش‌گیری ─────
    await gotoSection(page, 'گزارش‌گیری');
    const tab = page.getByRole('button', { name: 'گزارش مالی سامانه ستاد', exact: true });
    await expect(tab, 'گزارش مالی سامانه ستاد در فهرست گزارش‌ها نیست').toBeVisible();
    await tab.click();

    await page.getByRole('button', { name: /^فیلترها/ }).click();
    await page.getByRole('button', { name: 'افزودن شرط' }).click();
    await page.getByRole('combobox', { name: 'فیلد شرط ۱' }).click();
    await page.getByRole('option', { name: 'شماره درخواست', exact: true }).click();
    await page.getByRole('textbox', { name: 'مقدار' }).last().fill(requestNumber);
    await page.getByRole('button', { name: 'اجرای گزارش' }).click();

    const row = page.getByRole('row').filter({ hasText: requestNumber });
    await expect(row).toBeVisible();

    await expect(row, 'شمارهٔ نیاز در ردیف نیست').toContainText(needNumber);
    await expect(row, 'شمارهٔ گردش در ردیف نیست').toContainText(workflowNumber);
    // عنوان کالا پیش‌فرض از شرح فاکتور می‌آید.
    await expect(row, 'عنوان کالا از شرح فاکتور پر نشده').toContainText(invoiceDescription);
    // توضیحات پیش‌فرض، قلم‌ها را می‌شمارد: ۲ قلم، مجموعاً ۵ عدد.
    await expect(row).toContainText('تعداد 2 قلم کالا مجموعا 5 عدد');

    // ───── جزئیات ردیف ─────
    await row.getByRole('button', { name: 'جزئیات' }).click();
    const dialog = page.getByRole('dialog', { name: 'جزئیات ردیف گزارش ستاد' });
    await expect(dialog).toBeVisible();

    // قلم‌های همان فاکتور در جزئیات دیده می‌شوند.
    await expect(dialog.getByText('کولر گازی', { exact: true })).toBeVisible();
    await expect(dialog.getByText('لوله مسی', { exact: true })).toBeVisible();

    // عنوان کالا دستی عوض می‌شود و در جدول می‌نشیند.
    const manualTitle = unique('عنوان دستی');
    await dialog.getByRole('textbox', { name: 'عنوان کالا' }).fill(manualTitle);
    await dialog.getByRole('button', { name: 'ذخیره' }).click();
    await expect(dialog).toHaveCount(0);

    const updated = page.getByRole('row').filter({ hasText: requestNumber });
    await expect(updated, 'عنوان دستی در جدول ننشست').toContainText(manualTitle);

    // مبلغ کل با ارزش افزوده: ۲×۱٬۰۰۰٬۰۰۰ + ۳×۵۰۰٬۰۰۰ = ۳٬۵۰۰٬۰۰۰ پیش از مالیات.
    expect(toAsciiDigits(await updated.innerText()).replace(/[٬,\s]/gu, '')).toContain('3500000');
  });
});
