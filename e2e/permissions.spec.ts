import { expect, test } from '@playwright/test';

import { gotoSection, login } from './helpers';

/**
 * تفکیک وظایف از دید کاربر — و مهم‌تر، از دید **سرور**.
 *
 * پنهان بودن دکمه کنترل دسترسی نیست؛ بنابراین هر بررسی رابط، یک بررسی مستقیم روی
 * API هم دارد: همان کاری که دکمه‌اش دیده نمی‌شود، با درخواست مستقیم هم باید رد شود.
 */
test.describe('ناظر', () => {
  test('هیچ مسیر نوشتنی ندارد — نه در رابط، نه در API', async ({ page, request }) => {
    await login(page, 'supervisor');

    // ناظر طبق تعریف نقش، اطلاعات پایه و فروشندگان را **می‌خواند** — پس بخش‌هایشان
    // هست. چیزی که نباید باشد، دکمه‌های ساخت و ویرایش است.
    await gotoSection(page, 'فروشندگان');
    await expect(page.getByRole('button', { name: 'افزودن فروشنده' })).toHaveCount(0);

    await gotoSection(page, 'اسناد');
    await expect(page.getByRole('button', { name: 'ایجاد سند', exact: true })).toHaveCount(0);

    // و همان ساخت سند، مستقیم روی API: کوکی نشست ناظر از همین صفحه می‌آید.
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const csrf = cookies.find((c) => c.name === 'dm_csrf')?.value ?? '';

    const attempt = await request.post('/api/v1/documents', {
      headers: { cookie: cookieHeader, 'x-csrf-token': csrf, 'content-type': 'application/json' },
      data: { title: 'ناظر نباید بتواند', type: 'NORMAL', fiscalYear: 1405, jalaliYear: 1405 },
    });
    expect(attempt.status(), 'ناظر توانست سند بسازد').toBe(403);
  });
});

test.describe('بایگان', () => {
  test('پیش‌نویس دیگران را نمی‌بیند', async ({ page }) => {
    await login(page, 'archivist');
    await gotoSection(page, 'بایگانی');

    // کارتابل بایگانی فقط اسناد در جریان بایگانی را دارد؛ هیچ ردیفی نباید وضعیت
    // «پیش‌نویس» داشته باشد.
    await expect(page.getByText('پیش‌نویس')).toHaveCount(0);
  });
});

test.describe('بدون نشست', () => {
  test('API بدون کوکی ۴۰۱ می‌دهد', async ({ request }) => {
    const response = await request.get('/api/v1/documents');
    expect(response.status()).toBe(401);
  });

  test('متد نوشتنی بدون CSRF رد می‌شود', async ({ page, request }) => {
    await login(page, 'admin');
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    // نشست معتبر است ولی هدر CSRF فرستاده نمی‌شود.
    const response = await request.post('/api/v1/documents', {
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      data: { title: 'بدون CSRF', type: 'NORMAL', fiscalYear: 1405, jalaliYear: 1405 },
    });
    expect(response.status(), 'نوشتن بدون هدر CSRF پذیرفته شد').toBe(403);
  });
});
