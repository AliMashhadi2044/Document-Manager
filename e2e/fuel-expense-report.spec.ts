import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, toAsciiDigits, toPersianDigits, unique } from './helpers';

/**
 * فرم «لیست هزینه سوخت بنزین و CNG خودروهای اداری».
 *
 * آنچه سنجیده می‌شود:
 *
 *  ۱. ترتیب ستون‌ها: نوع خودرو، شماره خودرو، نوع سوخت، مبلغ فاکتور — همان ترتیب
 *     فرم کاغذی.
 *  ۲. هر فاکتور سوخت یک ردیف است، پس خودرویی که هم بنزین گرفته و هم گاز، دو ردیف
 *     می‌شود و ردیف‌هایش کنار هم‌اند.
 *  ۳. ردیف «جمع کل» جمع همان مبلغ‌هاست.
 */

function amount(text: string): string {
  return toAsciiDigits(text).replace(/[٬,\s]/gu, '');
}

/** یک خودرو با پلاک یکتا؛ نوع خودرو از فهرست انتخاب می‌شود. */
async function newVehicle(page: Page, stamp: string): Promise<void> {
  await gotoSection(page, 'خودروها');
  await page.getByRole('button', { name: 'افزودن خودرو' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'خودروی جدید' });
  /*
    صفحهٔ خودروها خودش یک فیلتر «نوع خودرو» دارد، پس انتخاب باید **درون گفت‌وگو**
    باشد. همان نوعی انتخاب می‌شود که فاکتور هم با آن ساخته می‌شود — فهرست پلاک‌ها
    به نوع خودرو وابسته است.
  */
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option').first().click();

  await dialog.getByLabel('دو رقم اول پلاک').fill(stamp.slice(0, 2));
  await dialog.getByRole('button', { name: 'حرف پلاک' }).click();
  await page.getByRole('listbox', { name: 'سری پلاک' }).getByText('ب', { exact: true }).click();
  await dialog.getByLabel('سه رقم پلاک').fill(stamp.slice(2, 5));
  await dialog.getByLabel('کد شهرستان پلاک').fill('11');

  await dialog.getByRole('button', { name: 'ثبت خودرو' }).click();
  await expect(page.getByText('خودرو ثبت شد.')).toBeVisible();
}

/** یک فاکتور سوخت روی همان خودرو، با یک نوع سوخت و یک مبلغ. */
async function addFuelInvoice(
  page: Page,
  options: { fuelType: string; amount: string; holder: string; plate: string },
): Promise<void> {
  await page.getByRole('button', { name: 'افزودن فاکتور' }).click();

  await pickOption(page, 'فصل', { search: 'سوخت', nth: 0 });
  await pickOption(page, 'فروشنده');
  await pickOption(page, 'نوع خودرو', { nth: 1 });
  /*
    پلاکِ **همین** آزمون، نه هر پلاکی که از اجرای قبلی مانده.

    فهرستِ جست‌وجوشده گزینهٔ خالی ندارد، پس شمارهٔ گزینه از صفر شروع می‌شود.
  */
  await pickOption(page, 'پلاک', { search: toPersianDigits(options.plate), nth: 0 });
  await pickOption(page, 'نوع سوخت', { text: options.fuelType });

  await pickOption(page, 'روز ردیف ۱', { nth: 1 });
  await page.getByRole('textbox', { name: 'مبلغ ردیف ۱' }).fill(options.amount);

  await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
  await pickOption(page, 'تنخواه‌دار', { text: options.holder });

  // شرح فاکتور اجباری است؛ همان جمله‌ای که در گزارش مالیات هم می‌نشیند.
  await page.getByLabel('شرح فاکتور').fill(unique('شرح'));
  await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
  await expect(page.getByRole('button', { name: 'ثبت فاکتور' })).toHaveCount(0);
}

test.describe('فرم هزینه سوخت', () => {
  test('یک ردیف برای هر فاکتور سوخت، با ترتیب ستون‌های فرم و جمع کل', async ({ page }) => {
    const stamp = String(Date.now()).slice(-5);
    const title = unique('سند سوخت');
    const holder = unique('کارپرداز سوخت');

    await login(page, 'admin');

    await gotoSection(page, 'تنخواه‌داران');
    await page.getByRole('button', { name: 'افزودن تنخواه‌دار' }).first().click();
    const holderDialog = page.getByRole('dialog', { name: 'تنخواه‌دار جدید' });
    await holderDialog.getByLabel('نام و نام خانوادگی').fill(holder);
    await holderDialog.getByRole('button', { name: 'ثبت تنخواه‌دار' }).click();
    await expect(page.getByText('تنخواه‌دار ثبت شد.')).toBeVisible();

    await newVehicle(page, stamp);

    // ───── سندی با دو فاکتور سوخت روی همان خودرو ─────
    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
    await page.getByRole('button', { name: title }).click();

    const plate = stamp.slice(2, 5);
    await addFuelInvoice(page, { fuelType: 'بنزین', amount: '1750000', holder, plate });
    await addFuelInvoice(page, { fuelType: 'گاز', amount: '90000', holder, plate });

    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

    // ───── فرم سوخت ─────
    await page.getByRole('button', { name: 'هزینه سوخت' }).click();

    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    const headers = await table.locator('thead th').allTextContents();
    expect(
      headers.map((text) => text.trim()),
      'ترتیب ستون‌های فرم سوخت با فرم کاغذی نمی‌خواند',
    ).toEqual(['نوع خودرو', 'شماره خودرو', 'نوع سوخت', 'مبلغ فاکتور']);

    /*
      دو ردیف برای یک خودرو — یکی بنزین و یکی گاز.

      ادعا روی **شمارش** است و نه روی ترتیبِ دو ردیف نسبت به هم: ترتیب میانشان را
      نام نوع سوخت تعیین می‌کند و آن داده مرجع است.
    */
    const petrol = table.locator('tbody tr').filter({ hasText: 'بنزین' }).first();
    const gas = table.locator('tbody tr').filter({ hasText: 'گاز' }).first();
    await expect(petrol).toBeVisible();
    await expect(gas).toBeVisible();

    expect(amount(await petrol.locator('td').nth(3).innerText())).toBe('1750000');
    expect(amount(await gas.locator('td').nth(3).innerText())).toBe('90000');

    // هر دو ردیف همان خودرو را دارند؛ ستون دوم شماره خودروست.
    const printed = toAsciiDigits(await petrol.locator('td').nth(1).innerText());
    expect(printed).toContain(plate);
    expect(toAsciiDigits(await gas.locator('td').nth(1).innerText())).toBe(printed);

    // ───── جمع کل ─────
    const totals = table.getByRole('row').filter({ hasText: 'جمع کل' }).first();
    await expect(totals).toBeVisible();
    expect(amount(await totals.innerText())).toContain('1840000');
  });
});
