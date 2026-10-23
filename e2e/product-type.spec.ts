import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * شرح فاکتور، و «نوع کالا» در گزارش مالیات.
 *
 * ادعاها:
 *
 *  ۱. ستون «نوع کالا» بدون هیچ کاری هم پر است: شرحِ **اولین** فاکتور همان فروشنده
 *     در همین سند، پیش‌فرض است.
 *  ۲. وقتی فروشنده دو فاکتور دارد، هر دو شرح در دیالوگ هستند و انتخاب دومی، ستون
 *     گزارش را عوض می‌کند.
 *  ۳. متن دلخواه هم پذیرفته می‌شود — «نوع کالا» دیگر به فهرست بسته نیست.
 */

/** یک فاکتور عادی با شرح، برای همان فروشنده. */
async function addInvoice(
  page: Page,
  options: { description: string; amount: string },
): Promise<void> {
  await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
  await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });

  const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
  if ((await typeSelect.count()) > 0) {
    await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
  }

  // همان فروشنده برای هر دو فاکتور (گزینهٔ اول فهرست): ردیف گزارش بر اساس فروشنده
  // تجمیع می‌شود، پس هر دو فاکتور باید در یک ردیف بنشینند.
  await pickOption(page, 'فروشنده');

  await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
  await page.getByLabel('شرح فاکتور').fill(options.description);
  await page.getByLabel('شرح ردیف ۱').fill('کالا');
  await page.getByLabel('تعداد').fill('1');
  await pickOption(page, 'واحد');
  await page.getByLabel('مبلغ واحد').fill(options.amount);
  await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
  await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
  await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();
}

test.describe('شرح فاکتور و نوع کالا', () => {
  test('شرح اولین فاکتور، پیش‌فرض ستون نوع کالاست و قابل عوض کردن است', async ({ page }) => {
    const title = unique('سند نوع کالا');
    const firstDescription = unique('خرید ملزومات اداری');
    const secondDescription = unique('خرید مواد پذیرایی');

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');

    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
    await page.getByRole('button', { name: title }).click();

    // دو فاکتور از **یک** فروشنده، با شرح‌های متفاوت.
    await addInvoice(page, { description: firstDescription, amount: '1000000' });
    await addInvoice(page, { description: secondDescription, amount: '2000000' });

    // گزارش مالیات فقط روی سند ثبت‌شده در دسترس است.
    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

    // ───── ۱. پیش‌فرض: شرح فاکتور اول ─────
    await page.getByRole('button', { name: 'گزارش مالیات' }).click();

    /*
      ردیف با **دکمهٔ اقدامش** پیدا می‌شود، نه با متن ستون نوع کالا.

      متنِ همان ستون است که در ادامه عوض می‌شود؛ اگر لنگرِ ردیف همان متن بود، با
      اولین تغییر، لوکیتور دیگر چیزی پیدا نمی‌کرد و شکست به‌جای «مقدار عوض نشد»،
      «ردیف نیست» گزارش می‌شد.
    */
    const reportRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: /نوع کالا/ }) })
      .first();
    await expect(reportRow).toContainText(firstDescription);

    // ───── ۲. هر دو شرح در دیالوگ‌اند؛ دومی انتخاب می‌شود ─────
    await reportRow.getByRole('button', { name: /نوع کالا/ }).click();
    const dialog = page.getByRole('dialog', { name: /نوع کالا/ });

    await expect(dialog.getByText(firstDescription).first()).toBeVisible();
    await expect(dialog.getByText('پیش‌فرض')).toBeVisible();

    await dialog.getByRole('button').filter({ hasText: secondDescription }).first().click();
    await dialog.getByRole('button', { name: 'ثبت نوع کالا' }).click();

    await expect(reportRow).toContainText(secondDescription);

    // ───── ۳. متن دلخواه ─────
    const custom = unique('عنوان دستی');
    await reportRow.getByRole('button', { name: /نوع کالا/ }).click();
    const again = page.getByRole('dialog', { name: /نوع کالا/ });
    await again.getByLabel('یا متن دلخواه').fill(custom);
    await again.getByRole('button', { name: 'ثبت نوع کالا' }).click();

    await expect(reportRow).toContainText(custom);
  });
});
