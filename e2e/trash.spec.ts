import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * سطل زباله سند.
 *
 * ادعاها، به ترتیب اهمیت:
 *
 *  ۱. سندِ حذف‌شده **هیچ‌جا نیست** — نه در فهرست اسناد، و مهم‌تر، نه در قاعدهٔ
 *     «یک مدرسه دوبار برای یک انشعاب فاکتور نخورد». این دومی ادعای اصلی است:
 *     یک شرطِ جامانده در یک کوئری، همین‌جا خودش را نشان می‌دهد.
 *  ۲. بازگرداندن، وقتی در این فاصله سند دیگری همان انشعاب را گرفته، **رد می‌شود**
 *     و نام آن سند را می‌گوید.
 *  ۳. حذف دائمی، سند را از سطل زباله هم می‌برد.
 */

async function newDocument(page: Page, title: string): Promise<void> {
  await gotoSection(page, 'اسناد');

  const back = page.getByRole('button', { name: 'بازگشت به فهرست' });
  if ((await back.count()) > 0) await back.first().click();

  if ((await page.getByLabel('شرح سند').count()) === 0) {
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
  }

  const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
  await page.getByLabel('شرح سند').fill(title);
  await pickOption(page, 'مجموعه خریدار');
  await form.getByRole('button', { name: 'ایجاد سند' }).click();
  await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
  await page.getByRole('button', { name: title }).click();
}

/** یک فاکتور انشعاب برای همان مدرسه و همان نوع انشعاب. */
async function addUtilityInvoice(page: Page, school: string, amount: string): Promise<void> {
  await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
  await page.locator('label').filter({ hasText: 'عمرانی' }).first().click();
  await pickOption(page, 'فصل', { search: 'انشعابات', nth: 0 });
  await pickOption(page, 'مدرسه', { search: school, nth: 0 });
  await pickOption(page, 'نوع انشعاب');
  await page.getByRole('textbox', { name: 'مبلغ', exact: true }).fill(amount);
  await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
  await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
  await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();
}

async function deleteDocument(page: Page, reason: string): Promise<void> {
  await page.getByRole('button', { name: 'حذف سند' }).click();
  const dialog = page.getByRole('dialog', { name: 'انتقال سند به سطل زباله' });
  await dialog.getByLabel('دلیل حذف').fill(reason);
  await dialog.getByRole('button', { name: 'انتقال به سطل زباله' }).click();

  /*
    منتظر ماندن تا حذف **واقعاً** انجام شود.

    بدون این، کلیک برمی‌گشت و ادعای بعدی پیش از رسیدن پاسخ سنجیده می‌شد؛ خودِ همین
    یک‌بار شمارش داشبورد را یکی بیشتر نشان داد و آزمون را به‌درستی انداخت.
    نشانهٔ پایان کار: برگهٔ سند بسته شده و فهرست اسناد برگشته است.
  */
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ایجاد سند', exact: true }).first()).toBeVisible();
}

test.describe('سطل زباله', () => {
  test('سند حذف‌شده نه در فهرست است، نه روی قاعدهٔ تکرار انشعاب اثر دارد', async ({ page }) => {
    const school = unique('مدرسه سطل');
    const first = unique('سند حذفی');
    const second = unique('سند جانشین');

    await login(page, 'admin');

    // مدرسهٔ تازه، تا آزمون به دادهٔ قبلی وابسته نباشد.
    await gotoSection(page, 'مدارس');
    await page.getByRole('button', { name: 'افزودن مدرسه' }).first().click();
    const schoolDialog = page.getByRole('dialog', { name: 'مدرسهٔ جدید' });
    await schoolDialog.getByRole('combobox', { name: 'ناحیه', exact: true }).click();
    await page.getByRole('option').first().click();
    await schoolDialog.getByLabel('نام مدرسه').fill(school);
    await schoolDialog.getByRole('button', { name: 'ثبت مدرسه' }).click();
    await expect(page.getByText('مدرسه ثبت شد.')).toBeVisible();

    // ───── سند اول، با یک فاکتور انشعاب ─────
    await newDocument(page, first);
    await addUtilityInvoice(page, school, '5000000');

    await deleteDocument(page, 'ثبت اشتباه');

    // برگهٔ سند بسته می‌شود و سند در فهرست نیست.
    await expect(page.getByRole('button', { name: first })).toHaveCount(0);

    // ───── و قاعدهٔ تکرار، دیگر آن را نمی‌بیند ─────
    await newDocument(page, second);
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await page.locator('label').filter({ hasText: 'عمرانی' }).first().click();
    await pickOption(page, 'فصل', { search: 'انشعابات', nth: 0 });
    await pickOption(page, 'مدرسه', { search: school, nth: 0 });
    await pickOption(page, 'نوع انشعاب');

    await expect(
      page.getByRole('alert').filter({ hasText: 'پیش از این' }),
      'سند حذف‌شده هنوز روی قاعدهٔ تکرار اثر دارد',
    ).toHaveCount(0);

    // همان فاکتور در سند تازه ثبت می‌شود.
    await page.getByRole('textbox', { name: 'مبلغ', exact: true }).fill('4000000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();

    // ───── حالا بازگرداندن باید رد شود، با نام سند طرف تداخل ─────
    await gotoSection(page, 'سطل زباله');
    await page.getByRole('row').filter({ hasText: first }).getByRole('button', { name: 'بررسی' }).click();

    const detail = page.getByRole('dialog', { name: new RegExp(first) });
    await expect(detail.getByText('بازگرداندن این سند ممکن نیست')).toBeVisible();
    await expect(detail.getByRole('alert')).toContainText(second);
    await expect(detail.getByRole('button', { name: 'بازگرداندن' })).toBeDisabled();

    // ───── حذف دائمی، سند را از سطل زباله هم می‌برد ─────
    await detail.getByRole('button', { name: 'حذف دائمی' }).click();
    await detail.getByLabel('برای تأیید، عبارت «حذف دائمی» را بنویسید').fill('حذف دائمی');
    await detail.getByRole('button', { name: 'بله، برای همیشه پاک کن' }).click();

    await expect(page.getByText('برای همیشه پاک شد')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: first })).toHaveCount(0);
  });

  /*
    ادعای «هیچ‌جا نیست»، مستقیم روی API.

    رابط می‌تواند چیزی را نشان ندهد و داده همچنان در جمع‌ها باشد؛ این آزمون خودِ
    پاسخ داشبورد و گزارش را پیش و پس از حذف می‌سنجد.
  */
  test('سند حذف‌شده نه در داشبورد شمرده می‌شود نه در گزارش می‌آید', async ({ page, request }) => {
    const title = unique('سند نامرئی');

    await login(page, 'admin');
    await newDocument(page, title);

    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      'x-csrf-token': cookies.find((cookie) => cookie.name === 'dm_csrf')?.value ?? '',
      'content-type': 'application/json',
    };

    const countDocuments = async (): Promise<number> => {
      const response = await request.get('/api/v1/analytics/dashboard', { headers });
      const body = (await response.json()) as { documentCount: number };
      return body.documentCount;
    };

    const findInReport = async (): Promise<number> => {
      const response = await request.post('/api/v1/analytics/documents/query', {
        headers,
        data: {
          columns: ['title'],
          filter: { combine: 'and', conditions: [{ field: 'title', op: 'eq', values: [title] }] },
          sort: [],
          page: 1,
          pageSize: 10,
        },
      });
      const body = (await response.json()) as { total: number };
      return body.total;
    };

    const before = await countDocuments();
    expect(await findInReport(), 'سند تازه در گزارش نیست').toBe(1);

    await deleteDocument(page, 'آزمون نامرئی بودن');

    expect(await countDocuments(), 'داشبورد هنوز سند حذف‌شده را می‌شمارد').toBe(before - 1);
    expect(await findInReport(), 'گزارش هنوز سند حذف‌شده را برمی‌گرداند').toBe(0);
  });

  test('سند حذف‌شدهٔ بی‌تداخل برمی‌گردد', async ({ page }) => {
    const title = unique('سند برگشتی');

    await login(page, 'admin');
    await newDocument(page, title);
    await deleteDocument(page, 'اشتباه بود');

    await gotoSection(page, 'سطل زباله');
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toContainText('اشتباه بود');
    await row.getByRole('button', { name: 'بررسی' }).click();

    const detail = page.getByRole('dialog', { name: new RegExp(title) });
    await expect(detail.getByText('بازگرداندن این سند ممکن نیست')).toHaveCount(0);
    await detail.getByRole('button', { name: 'بازگرداندن' }).click();

    await expect(page.getByText('بازگردانده شد')).toBeVisible();

    // و دوباره در فهرست اسناد است.
    await gotoSection(page, 'اسناد');
    await expect(page.getByRole('button', { name: title })).toBeVisible();
  });

  test('حذف سند ثبت‌شده، تأیید سخت‌تری می‌خواهد', async ({ page }) => {
    const title = unique('سند نهایی حذفی');

    await login(page, 'admin');
    await newDocument(page, title);

    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });
    const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    if ((await typeSelect.count()) > 0) {
      await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
    }
    await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
    await page.getByLabel('شرح ردیف ۱').fill('ملزومات');
    await page.getByLabel('تعداد').fill('1');
    await pickOption(page, 'واحد');
    await page.getByLabel('مبلغ واحد').fill('1000000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();

    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'حذف سند' }).click();
    const dialog = page.getByRole('dialog', { name: 'انتقال سند به سطل زباله' });

    // هشدار سخت‌تر، و دکمه تا نوشتن شرح سند غیرفعال می‌ماند.
    await expect(dialog.getByText('در گزارش‌ها و جمع‌های داشبورد شمرده شده')).toBeVisible();
    await dialog.getByLabel('دلیل حذف').fill('ابطال');
    await expect(dialog.getByRole('button', { name: 'انتقال به سطل زباله' })).toBeDisabled();

    await dialog.getByLabel('برای تأیید، شرح سند را بنویسید').fill(title);
    await dialog.getByRole('button', { name: 'انتقال به سطل زباله' }).click();

    await gotoSection(page, 'سطل زباله');
    await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible();
  });
});
