import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, toAsciiDigits, unique, uniqueIban } from './helpers';

/**
 * پرداخت ترکیبی: بخشی به کارپرداز، بخشی به ذی‌نفع.
 *
 * چهار ادعا:
 *
 *  ۱. روش «ترکیبی» **هر دو** مقصد را با هم می‌خواهد — شبای ذی‌نفع و کارپرداز.
 *  ۲. نوشتن یک سهم، سهم دیگر را از مبلغ کل کامل می‌کند.
 *  ۳. تقسیمِ بیشتر از مبلغ فاکتور، همان‌جا دیده می‌شود.
 *  ۴. سرور تقسیم نادرست را رد می‌کند — نه فقط رابط. (بررسی سمت سرور، نه پنهان
 *     کردن یک دکمه.)
 */

/** همهٔ مبالغ یک متن فارسی ⇒ `bigint`؛ جداکنندهٔ هزارگان اول حذف می‌شود. */
function moneyNumbers(text: string): bigint[] {
  const normalized = toAsciiDigits(text).replace(/[٬,]/gu, '');
  return (normalized.match(/\d+/gu) ?? []).map((value) => BigInt(value));
}

test.describe('پرداخت ترکیبی', () => {
  test('سهم‌ها تقسیم می‌شوند و در سند می‌مانند', async ({ page, request }) => {
    const vendorName = unique('فروشنده ترکیبی');
    const holderName = unique('کارپرداز ترکیبی');
    const title = unique('سند پرداخت ترکیبی');
    const vendorIban = uniqueIban('012');
    const holderIban = uniqueIban('018');

    await login(page, 'admin');

    // ───── فروشنده‌ای با شبای فعال ─────
    await gotoSection(page, 'فروشندگان');
    await page.getByRole('button', { name: 'افزودن فروشنده' }).click();
    const vendorDialog = page.getByRole('dialog', { name: 'فروشنده جدید' });
    await vendorDialog.getByLabel('عنوان شرکت').fill(vendorName);
    await vendorDialog.getByRole('button', { name: 'ثبت فروشنده' }).click();
    await expect(page.getByText('فروشنده ثبت شد.')).toBeVisible();

    await page.getByLabel('جست‌وجو').fill(vendorName);
    const vendorRow = page.getByRole('row').filter({ hasText: vendorName });
    await vendorRow.getByRole('button', { name: `شباهای ${vendorName}` }).click();
    const ibanDialog = page.getByRole('dialog', { name: `شباهای ${vendorName}` });
    await ibanDialog.getByLabel('شماره شبا').fill(vendorIban);
    await ibanDialog.getByLabel('عنوان حساب').fill('حساب جاری');
    await ibanDialog.getByRole('button', { name: 'افزودن شبا' }).click();
    await expect(ibanDialog.getByText('شبا ثبت شد.')).toBeVisible();
    await ibanDialog.getByRole('button', { name: 'بستن' }).first().click();

    // ───── کارپرداز تنخواه‌دار ─────
    await gotoSection(page, 'تنخواه‌داران');
    await page.getByRole('button', { name: 'افزودن تنخواه‌دار' }).first().click();
    const holderDialog = page.getByRole('dialog', { name: 'تنخواه‌دار جدید' });
    await holderDialog.getByLabel('نام و نام خانوادگی').fill(holderName);
    await holderDialog.getByLabel('شبا').fill(holderIban.slice(2));
    await holderDialog.getByRole('button', { name: 'ثبت تنخواه‌دار' }).click();
    await expect(page.getByText('تنخواه‌دار ثبت شد.')).toBeVisible();

    // ───── سند و فاکتور ─────
    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const documentForm = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await documentForm.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });

    const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    if ((await typeSelect.count()) > 0) {
      await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
    }

    await pickOption(page, 'فروشنده', { search: vendorName, text: vendorName });
    await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
    await page.getByLabel('شرح ردیف ۱').fill('ملزومات اداری');
    await page.getByLabel('تعداد').fill('1');
    await pickOption(page, 'واحد');
    await page.getByLabel('مبلغ واحد').fill('2000000');

    // ───── ۱. روش ترکیبی، هر دو مقصد را می‌خواهد ─────
    await pickOption(page, 'روش پرداخت', { text: 'ترکیبی' });
    await pickOption(page, 'شبای ذی‌نفع');
    await pickOption(page, 'کارپرداز', { text: holderName });

    /*
      مبلغ کل از خود رابط خوانده می‌شود، نه از عددی که آزمون حساب کند.

      نرخ مالیات یک دادهٔ پایه است و می‌تواند عوض شود؛ آزمونی که ۲٬۲۰۰٬۰۰۰ را
      در خودش بنویسد، روز تغییر نرخ شکست می‌خورد بی‌آنکه چیزی خراب شده باشد.
    */
    const totalLine = page.getByText('مبلغ کل فاکتور:');
    await expect(totalLine).toBeVisible();
    const total = moneyNumbers((await totalLine.textContent()) ?? '')[0] as bigint;
    expect(total).toBeGreaterThan(0n);

    // ───── ۲. نوشتن یک سهم، سهم دیگر را کامل می‌کند ─────
    const pettyCashField = page.getByLabel('سهم کارپرداز');
    const beneficiaryField = page.getByLabel('سهم ذی‌نفع');

    await pettyCashField.fill('500000');
    await expect(beneficiaryField).toHaveValue(String(total - 500_000n));
    await expect(page.getByText('تقسیم نشده است')).toHaveCount(0);

    // ───── ۳. تقسیم بیشتر از مبلغ فاکتور، همان‌جا دیده می‌شود ─────
    await pettyCashField.fill(String(total + 1n));
    await expect(page.getByText('بیشتر از مبلغ فاکتور است')).toBeVisible();

    await pettyCashField.fill('500000');
    await expect(page.getByText('بیشتر از مبلغ فاکتور است')).toHaveCount(0);

    // شرح فاکتور اجباری است؛ همان جمله‌ای که در گزارش مالیات هم می‌نشیند.
    await page.getByLabel('شرح فاکتور').fill(unique('شرح'));
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();

    // ───── سهم‌ها در برگهٔ سند می‌مانند ─────
    const split = page.getByText('تقسیم پرداخت', { exact: true }).locator('..');
    await expect(split).toContainText('سهم کارپرداز');
    await expect(split).toContainText('سهم ذی‌نفع');

    // دو سهم، همان‌طور که ثبت شدند — و جمعشان همان مبلغ فاکتور.
    const shares = moneyNumbers((await split.textContent()) ?? '');
    expect(shares).toEqual([total - 500_000n, 500_000n]);

    // ───── ۴. سرور هم همین را می‌خواهد، نه فقط رابط ─────
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      'x-csrf-token': cookies.find((cookie) => cookie.name === 'dm_csrf')?.value ?? '',
      'content-type': 'application/json',
    };

    const found = await (
      await request.get(`/api/v1/documents?search=${encodeURIComponent(title)}`, { headers })
    ).json();
    const documentId = found.items[0].id as string;

    const detail = await (
      await request.get(`/api/v1/documents/${documentId}`, { headers })
    ).json();
    const invoiceId = detail.invoices[0].id as string;

    /*
      ورودی را از خودِ سرور می‌گیریم (`draft`)، نه از روی حدس.

      `draft` همان شکلی است که فرم ویرایش پس می‌فرستد؛ ساختن دستی‌اش در آزمون
      یعنی روزی که یک فیلد اضافه شود، این آزمون به خطای اعتبارسنجی بخورد و
      سبز/قرمزش ربطی به چیزی که می‌سنجد نداشته باشد.
    */
    const draft = await (
      await request.get(`/api/v1/documents/invoices/${invoiceId}/draft`, { headers })
    ).json();

    // همان فاکتور، با تقسیمی که یک ریال کم دارد.
    const attempt = await request.put(`/api/v1/documents/invoices/${invoiceId}`, {
      headers,
      data: {
        ...draft,
        payment: {
          ...draft.payment,
          beneficiaryAmount: String(total - 500_001n),
          pettyCashAmount: '500000',
        },
      },
    });

    const body = await attempt.text();
    expect(attempt.status(), `پاسخ سرور: ${body}`).toBe(422);
    expect(body).toContain('جمع سهم‌ها');
  });
});
