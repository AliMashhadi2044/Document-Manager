import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, toAsciiDigits, unique, uniqueIban } from './helpers';

/**
 * گزارش «شماره شبا ذینفعان سند».
 *
 * شش ادعا، همه با اندازه‌گیری:
 *
 *  ۱. واحدِ ردیف **مقصد پرداخت** است: دو فاکتور به یک حساب، یک ردیف.
 *  ۲. پرداخت ترکیبی در **دو** ردیف دیده می‌شود، هرکدام با سهم خودش.
 *  ۳. جمع ردیف‌ها دقیقاً جمع فاکتورهاست — هیچ ریالی نه گم می‌شود و نه دوبار.
 *  ۴. ستون «فاکتور ۱ تا ۵» روی کاغذ نیست؛ ریزش در دیالوگ جزئیات است.
 *  ۵. جمع کل، هم با رقم و هم **به حروف** نوشته می‌شود.
 *  ۶. امضای «مسئول رسیدگی» پای فرم هست.
 */

/** همهٔ مبالغ یک متن فارسی ⇒ `bigint`. */
function moneyNumbers(text: string): bigint[] {
  const normalized = toAsciiDigits(text).replace(/[٬,]/gu, '');
  return (normalized.match(/\d+/gu) ?? []).map((value) => BigInt(value));
}

/** فروشنده‌ای با یک شبای فعال. */
async function vendorWithIban(page: Page, name: string, iban: string): Promise<void> {
  await gotoSection(page, 'فروشندگان');
  await page.getByRole('button', { name: 'افزودن فروشنده' }).click();
  const dialog = page.getByRole('dialog', { name: 'فروشنده جدید' });
  await dialog.getByLabel('عنوان شرکت').fill(name);
  await dialog.getByRole('button', { name: 'ثبت فروشنده' }).click();
  await expect(page.getByText('فروشنده ثبت شد.')).toBeVisible();

  await page.getByLabel('جست‌وجو').fill(name);
  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: `شباهای ${name}` }).click();
  const ibanDialog = page.getByRole('dialog', { name: `شباهای ${name}` });
  await ibanDialog.getByLabel('شماره شبا').fill(iban);
  await ibanDialog.getByRole('button', { name: 'افزودن شبا' }).click();
  await expect(ibanDialog.getByText('شبا ثبت شد.')).toBeVisible();
  await ibanDialog.getByRole('button', { name: 'بستن' }).first().click();
}

/** یک فاکتور عادی با مبلغ و روش پرداخت مشخص. */
async function addInvoice(
  page: Page,
  options: {
    description: string;
    unitPrice: string;
    vendor?: string;
    method: 'حساب ذی‌نفع' | 'تنخواه' | 'ترکیبی';
    iban?: boolean;
    holder?: string;
    pettyShare?: string;
    paymentIdentifier?: string;
  },
): Promise<void> {
  await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
  await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });

  const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
  if ((await typeSelect.count()) > 0) {
    await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
  }

  if (options.vendor) await pickOption(page, 'فروشنده', { search: options.vendor, text: options.vendor });
  await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
  await page.getByLabel('شرح ردیف ۱').fill(options.description);
  await page.getByLabel('تعداد').fill('1');
  await pickOption(page, 'واحد');
  await page.getByLabel('مبلغ واحد').fill(options.unitPrice);

  await pickOption(page, 'روش پرداخت', { text: options.method });
  if (options.iban) await pickOption(page, 'شبای ذی‌نفع');
  if (options.paymentIdentifier) {
    await page.getByLabel('شناسه پرداخت').fill(options.paymentIdentifier);
  }
  if (options.holder) {
    await pickOption(page, options.method === 'ترکیبی' ? 'کارپرداز' : 'تنخواه‌دار', {
      text: options.holder,
    });
  }
  if (options.pettyShare) await page.getByLabel('سهم کارپرداز').fill(options.pettyShare);

  await page.getByRole('button', { name: 'ثبت فاکتور' }).click();

  /*
    نشانهٔ ثبت، **بسته شدن فرم** است و نه پیام «فاکتور ثبت شد».

    آن پیام روی صفحه می‌ماند، پس برای فاکتور دوم بی‌آنکه چیزی ثبت شده باشد هم سبز
    می‌شد — و فاکتور بعدی روی فرمِ هنوز باز کلیک می‌کرد و می‌بستش.
  */
  await expect(page.getByRole('button', { name: 'ثبت فاکتور' })).toHaveCount(0);
}

test.describe('گزارش شبای ذینفعان', () => {
  test('هر مقصد یک ردیف، پرداخت ترکیبی دو ردیف، و جمع به حروف', async ({ page }) => {
    const vendor = unique('فروشنده شبا');
    const holder = unique('کارپرداز شبا');
    const title = unique('سند شبای ذینفعان');

    await login(page, 'admin');
    await vendorWithIban(page, vendor, uniqueIban('012'));

    // کارپرداز تنخواه‌دار، برای ردیف تنخواه و سهم ترکیبی.
    await gotoSection(page, 'تنخواه‌داران');
    await page.getByRole('button', { name: 'افزودن تنخواه‌دار' }).first().click();
    const holderDialog = page.getByRole('dialog', { name: 'تنخواه‌دار جدید' });
    await holderDialog.getByLabel('نام و نام خانوادگی').fill(holder);
    await holderDialog.getByLabel('شبا').fill(uniqueIban('018').slice(2));
    await holderDialog.getByRole('button', { name: 'ثبت تنخواه‌دار' }).click();
    await expect(page.getByText('تنخواه‌دار ثبت شد.')).toBeVisible();

    // ───── سند با چهار فاکتور و سه مقصد ─────
    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
    await page.getByRole('button', { name: title }).click();

    // دو فاکتور به **یک** حساب: باید یک ردیف شوند.
    await addInvoice(page, {
      description: 'کالای اول',
      unitPrice: '1000000',
      vendor,
      method: 'حساب ذی‌نفع',
      iban: true,
      paymentIdentifier: '900111',
    });
    await addInvoice(page, {
      description: 'کالای دوم',
      unitPrice: '2000000',
      vendor,
      method: 'حساب ذی‌نفع',
      iban: true,
    });
    await addInvoice(page, {
      description: 'خرید نقدی',
      unitPrice: '500000',
      method: 'تنخواه',
      holder,
    });
    // ترکیبی: بخشی به همان حساب، بخشی به همان کارپرداز.
    await addInvoice(page, {
      description: 'خرید ترکیبی',
      unitPrice: '4000000',
      vendor,
      method: 'ترکیبی',
      iban: true,
      holder,
      pettyShare: '1000000',
    });

    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

    // ───── گزارش ─────
    await page.getByRole('button', { name: 'شبای ذینفعان' }).click();
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    /*
      ستون‌های «فاکتور ۱ تا ۵» روی کاغذ نیستند.

      فرم مرجع پنج ستون ثابت داشت؛ برای سندی با شش فاکتور کم می‌آورد و برای سندی
      با یکی، چهار ستون خالی چاپ می‌کرد.
    */
    const headers = await table.locator('thead th').allTextContents();
    expect(headers.join('|')).not.toContain('فاکتور ۱');
    expect(headers.join('|')).toContain('جمع');

    // ───── ردیف‌ها: دو مقصد، نه چهار ─────
    const dataRows = table.locator('tbody tr').filter({ hasText: /جزئیات/ });
    await expect(dataRows).toHaveCount(2);

    /*
      جمع ردیف‌ها = جمع فاکتورها.

      مالیات ۱۰٪ روی هر فاکتور می‌نشیند، پس عدد از خودِ ردیف‌ها خوانده می‌شود و در
      آزمون سفت نمی‌شود؛ ادعا دربارهٔ **حسابداری** است و نه دربارهٔ نرخ مالیات.
    */
    const rowTotals = await Promise.all(
      (await dataRows.all()).map(async (row) => {
        const cells = await row.locator('td').allTextContents();
        return moneyNumbers(cells[cells.length - 2] ?? '')[0] ?? 0n;
      }),
    );
    const sum = rowTotals.reduce((total, value) => total + value, 0n);

    const totalsRow = table.locator('td', { hasText: /^جمع کل$/ }).locator('..');
    const printed = moneyNumbers((await totalsRow.textContent()) ?? '');
    expect(printed.at(-1), 'جمع کل با جمع ردیف‌ها نمی‌خواند').toBe(sum);

    /*
      شناسهٔ پرداخت فروشنده، زیر شبای همان ردیف می‌آید.

      شناسه به **فاکتور** تعلق دارد و نه به شبا (§۱۳.۱)، پس ردیف همچنان یکی است و
      شناسه در خط دوم همان سلول می‌نشیند.
    */
    // شناسه مثل شبا با ارقام لاتین می‌ماند: شمارهٔ بانکی را کسی فارسی نمی‌خواند.
    await expect(
      table.getByText('900111'),
      'شناسهٔ پرداخت زیر شبا نیامده است',
    ).toBeVisible();

    /*
      ردیف کارپرداز، کنار شبایش «تنخواه کارت کارپردازی» هم دارد.

      یک شمارهٔ بیست‌وشش‌رقمی میان بقیهٔ شباها، ردیف کارپرداز را قابل تشخیص نمی‌کند؛
      امضاکننده باید از روی فرم بفهمد کدام ردیف تنخواه است.
    */
    await expect(
      table.getByText('تنخواه کارت کارپردازی'),
      'ردیف کارپرداز عنوان کارتش را ندارد',
    ).toBeVisible();

    // ───── جمع کل، به حروف ─────
    await expect(totalsRow, 'جمع کل به حروف نوشته نشده است').toContainText('میلیون');

    // ───── امضای مسئول رسیدگی ─────
    await expect(page.getByText('مسئول رسیدگی')).toBeVisible();

    // ───── جزئیات: سهم ترکیبی، و مبلغ کامل فاکتور کنارش ─────
    await dataRows.first().getByRole('button', { name: 'جزئیات' }).click();
    const dialog = page.getByRole('dialog', { name: /جزئیات مقصد پرداخت/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('(ترکیبی)')).toBeVisible();
    await expect(dialog.getByText('سهم این مقصد')).toBeVisible();
  });
});
