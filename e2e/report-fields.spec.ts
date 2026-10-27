import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * آنچه در گزارش‌گیری می‌شود روی آن فیلتر گذاشت.
 *
 * دو شکایت واقعی، دو ادعا:
 *
 *  ۱. فاکتور انشعابات **مدرسه** دارد؛ بدون این فیلد، کاربری که روی «نوع فاکتور:
 *     انشعابات» فیلتر گذاشته هیچ راهی نداشت بگوید کدام مدرسه.
 *  ۲. «شرح فاکتور» اختیاری است و اغلب خالی می‌ماند؛ چیزی که کاربر واقعاً نوشته،
 *     شرح تک‌تک **ردیف‌ها**ست. جست‌وجو روی ستونی که معمولاً خالی است، جست‌وجویی
 *     است که کار نمی‌کند.
 *
 * و یک ادعای سوم دربارهٔ رابط: نماهای ذخیره‌شده بدون باز کردن هیچ تابلویی دیده و
 * اعمال می‌شوند.
 */

/** یک شرط فیلتر روی گزارش فاکتورها. */
async function addCondition(
  page: Page,
  index: number,
  field: string | RegExp,
  value: string,
): Promise<void> {
  await page.getByRole('button', { name: 'افزودن شرط' }).click();
  await pickOption(page, `فیلد شرط ${toPersianIndex(index)}`, { text: field });
  await page.getByRole('textbox', { name: 'مقدار' }).last().fill(value);
}

function toPersianIndex(index: number): string {
  return String(index).replace(/\d/gu, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] as string);
}

test.describe('فیلدهای گزارش‌گیری', () => {
  test('مدرسهٔ انشعابات و شرح ردیف‌ها، هر دو فیلترشدنی‌اند', async ({ page }) => {
    const school = unique('مدرسه گزارش');
    const title = unique('سند گزارش انشعاب');
    const itemText = unique('کنتور آب');

    await login(page, 'admin');

    // مدرسه‌ای تازه برای هر اجرا: قاعدهٔ «پرداخت تکراری انشعاب» بین اسناد هم کار
    // می‌کند و استفادهٔ دوباره از یک مدرسه، اجرای دوم را به هشدار می‌خورد.
    await gotoSection(page, 'مدارس');
    await page.getByRole('button', { name: 'افزودن مدرسه' }).first().click();
    const schoolDialog = page.getByRole('dialog', { name: 'مدرسهٔ جدید' });
    await schoolDialog.getByRole('combobox', { name: 'ناحیه', exact: true }).click();
    await page.getByRole('option').first().click();
    await schoolDialog.getByLabel('نام مدرسه').fill(school);
    await schoolDialog.getByRole('button', { name: 'ثبت مدرسه' }).click();
    await expect(page.getByText('مدرسه ثبت شد.')).toBeVisible();

    // ───── سندی با یک فاکتور انشعاب، و شرح فقط روی **ردیف** ─────
    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
    await page.getByRole('button', { name: title }).click();

    // فاکتور اول: انشعاب همان مدرسه. فرم انشعابات ردیف کالا ندارد و یک «مبلغ» دارد.
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await page.locator('label').filter({ hasText: 'عمرانی' }).first().click();
    await pickOption(page, 'فصل', { search: 'انشعابات', nth: 0 });
    await pickOption(page, 'مدرسه', { search: school, nth: 0 });
    await pickOption(page, 'نوع انشعاب');
    await page.getByRole('textbox', { name: 'مبلغ', exact: true }).fill('1500000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByRole('button', { name: 'ثبت فاکتور' })).toHaveCount(0);

    /*
      فاکتور دوم: عادی، در همان گروه بودجه.

      شرح فقط روی **ردیف** نوشته می‌شود و «شرح فاکتور» عمداً خالی می‌ماند — همان
      حالتی که شکایت از آن آمد.
    */
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await pickOption(page, 'فصل', { search: 'تعمیرات', nth: 0 });
    const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    if ((await typeSelect.count()) > 0) {
      await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
    }
    await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
    await page.getByLabel('شرح ردیف ۱').fill(itemText);
    await page.getByLabel('تعداد').fill('1');
    await pickOption(page, 'واحد');
    await page.getByLabel('مبلغ واحد').fill('2000000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByRole('button', { name: 'ثبت فاکتور' })).toHaveCount(0);

    // ───── گزارش‌گیری: فاکتورها ─────
    await gotoSection(page, 'گزارش‌گیری');
    await page.getByRole('button', { name: 'فاکتورها', exact: true }).click();
    await page.getByRole('button', { name: /^فیلترها/ }).click();

    await addCondition(page, 1, 'مدرسه (انشعابات)', school);
    await page.getByRole('button', { name: 'اجرای گزارش' }).click();

    const table = page.getByRole('table');
    await expect(table.getByText(title)).toBeVisible();

    /*
      و حالا همان سند، از راه شرح ردیف.

      شرحِ **فاکتور** این ردیف خالی است، پس اگر فقط آن ستون فیلترشدنی بود، این
      جست‌وجو هیچ‌وقت جواب نمی‌داد.
    */
    await page.getByRole('button', { name: `حذف شرط ${toPersianIndex(1)}` }).click();
    await addCondition(page, 1, 'شرح ردیف‌ها', itemText);
    await page.getByRole('button', { name: 'اجرای گزارش' }).click();
    await expect(table.getByText(title)).toBeVisible();

    // همان شرط روی «شرح فاکتور» هیچ ردیفی نمی‌دهد — چون آنجا چیزی ننوشته شده.
    await page.getByRole('button', { name: `حذف شرط ${toPersianIndex(1)}` }).click();
    await addCondition(page, 1, 'شرح فاکتور', itemText);
    await page.getByRole('button', { name: 'اجرای گزارش' }).click();
    await expect(table.getByText(title)).toHaveCount(0);
  });

  test('نمای ذخیره‌شده بدون باز کردن تابلو، بالا دیده و اعمال می‌شود', async ({ page }) => {
    const viewName = unique('نمای آزمون');

    await login(page, 'admin');
    await gotoSection(page, 'گزارش‌گیری');

    await page.getByRole('button', { name: /^نماها/ }).click();
    await page.getByLabel('نام نما').fill(viewName);
    await page.getByRole('button', { name: 'ذخیره نما' }).click();
    await expect(page.getByText(`نمای «${viewName}» ذخیره شد.`)).toBeVisible();

    // تابلو بسته می‌شود؛ تراشهٔ نما باید همچنان دیده شود.
    await page.getByRole('button', { name: /^نماها/ }).click();
    await expect(page.getByRole('button', { name: 'ذخیره نما' })).toHaveCount(0);

    const chip = page.getByRole('button', { name: viewName, exact: true });
    await expect(chip, 'نمای ذخیره‌شده بیرون از تابلو دیده نمی‌شود').toBeVisible();

    await chip.click();
    await expect(page.getByText(`نمای «${viewName}» اعمال شد.`)).toBeVisible();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  });
});
