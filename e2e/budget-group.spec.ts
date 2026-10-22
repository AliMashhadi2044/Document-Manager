import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * یک سند، یک گروه بودجه.
 *
 * سند مالی در دفتر اعتبار یک گروه (جاری یا عمرانی) می‌نشیند؛ سندی که هم‌زمان ردیف
 * جاری و ردیف عمرانی داشته باشد در هیچ‌کدام کامل نیست.
 *
 * ادعای این آزمون دو لایه است: رابط گروه مخالف را **خاموش** می‌کند، و سرور همان
 * درخواست را با پیام روشن **رد** می‌کند — چون خاموش بودن یک دکمه، کنترل نیست.
 */
test.describe('گروه بودجه سند', () => {
  test('بعد از اولین فاکتور، گروه دیگر نه در رابط انتخاب می‌شود نه در API', async ({
    page,
    request,
  }) => {
    const title = unique('سند یک‌گروهی');

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');

    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();

    // ───── فاکتور اول: گروه جاری ─────
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();

    // هنوز فاکتوری نیست، پس هر دو گروه باز است.
    await expect(page.getByRole('radio', { name: /عمرانی/ })).toBeEnabled();

    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });
    const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    if ((await typeSelect.count()) > 0) {
      await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
    }
    await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
    await page.getByLabel('شرح ردیف ۱').fill('کاغذ A4');
    await page.getByLabel('تعداد').fill('1');
    await pickOption(page, 'واحد');
    await page.getByLabel('مبلغ واحد').fill('1000000');
    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();

    // ───── حالا گروه عمرانی باید خاموش باشد ─────
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await expect(page.getByRole('radio', { name: /جاری/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: /عمرانی/ })).toBeDisabled();
    await expect(page.getByText('یک سند فقط فاکتورهای')).toBeVisible();

    // ───── و همان کار، مستقیم روی API ─────
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      'x-csrf-token': cookies.find((cookie) => cookie.name === 'dm_csrf')?.value ?? '',
      'content-type': 'application/json',
    };

    // نشانی صفحه، شناسهٔ سند را ندارد (رابط تک‌صفحه‌ای است)؛ از خود API گرفته می‌شود.
    const found = await (
      await request.get(`/api/v1/documents?search=${encodeURIComponent(title)}`, { headers })
    ).json();
    const documentId = found.items[0].id as string;

    const categories = await (
      await request.get('/api/v1/base-data/chapters/categories', { headers })
    ).json();
    const capital = categories.find(
      (category: { key: string }) => category.key === 'CAPITAL',
    ) as { chapters: { id: string; isActive: boolean }[] };
    const chapter = capital.chapters.find((row) => row.isActive)!;
    const types = await (
      await request.get(`/api/v1/base-data/chapters/${chapter.id}/invoice-types`, { headers })
    ).json();

    const attempt = await request.post(`/api/v1/documents/${documentId}/invoices`, {
      headers,
      data: {
        chapterId: chapter.id,
        invoiceTypeId: types.options[0].invoiceTypeId,
        invoiceDate: '2026-10-04',
        details: {
          kind: types.options[0].kind,
          taxMode: 'PERCENT',
          taxRateBp: 1000,
          items: [
            {
              rowNo: 1,
              description: 'ردیف عمرانی',
              quantity: '1',
              unitPrice: '1000000',
              taxMode: 'PERCENT',
              taxRateBp: 1000,
            },
          ],
        },
      },
    });

    const body = await attempt.text();
    expect(attempt.status(), `پاسخ سرور: ${body}`).toBe(409);
    // پیام باید بگوید سند کدام گروه است، نه یک «خطای نامشخص».
    expect(body).toContain('گروه بودجه این سند');
  });
});
