import { expect, test } from '@playwright/test';

import { gotoSection, login } from './helpers';

/**
 * مهلت بی‌تحرکی نشست، در دست مدیر سامانه.
 *
 * ادعای آزمون سه لایه است: عدد **ذخیره** می‌شود، در `/auth/me` همان عددی
 * برمی‌گردد که نشست با آن باطل می‌شود (یعنی رابط و سرور یک حرف می‌زنند)، و
 * عددِ بی‌معنا از سمت سرور **رد** می‌شود — چون اعتبارسنجی مرورگر کنترل نیست.
 */
test.describe('سیاست نشست', () => {
  test('مدیر سامانه مهلت بی‌تحرکی را عوض می‌کند و سرور همان را اعمال می‌کند', async ({
    page,
    request,
  }) => {
    await login(page, 'admin');
    await gotoSection(page, 'مدیریت کاربران');

    // رادیوی Segmented خودش sr-only است؛ کاربر روی برچسبش می‌زند.
    await page.locator('label').filter({ hasText: 'امنیت نشست' }).first().click();
    const field = page.getByLabel('مهلت (دقیقه)');
    await expect(field).toBeVisible();

    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      'x-csrf-token': cookies.find((cookie) => cookie.name === 'dm_csrf')?.value ?? '',
      'content-type': 'application/json',
    };

    try {
      // ───── ذخیرهٔ یک عدد مشخص ─────
      await field.fill('90');
      await page.getByRole('button', { name: 'ذخیره' }).click();
      await expect(page.getByText('مهلت بی‌تحرکی ذخیره شد', { exact: false })).toBeVisible();
      await expect(page.getByText('مقدار حاکم در این لحظه')).toBeVisible();

      // همان عددی که نشست با آن باطل می‌شود، به رابط هم می‌رسد.
      const me = await (await request.get('/api/v1/auth/me', { headers })).json();
      expect(me.sessionIdleMinutes).toBe(90);

      // ───── عدد بیرون از بازه، سمت سرور رد می‌شود ─────
      const tooSmall = await request.put('/api/v1/auth/session-policy', {
        headers,
        data: { idleMinutes: 1 },
      });
      expect(tooSmall.status(), await tooSmall.text()).toBe(422);
      expect(await tooSmall.text()).toContain('مهلت بی‌تحرکی');

      // و مهلت، همان مقدار معتبر پیشین می‌ماند.
      const unchanged = await (
        await request.get('/api/v1/auth/session-policy', { headers })
      ).json();
      expect(unchanged.effectiveIdleMinutes).toBe(90);

      // ───── خالی کردن کادر یعنی «پیش‌فرض سرور»، نه بی‌نهایت ─────
      await field.fill('');
      await page.getByRole('button', { name: 'ذخیره' }).click();
      await expect(page.getByText('مهلت بی‌تحرکی ذخیره شد', { exact: false })).toBeVisible();

      const reset = await (await request.get('/api/v1/auth/session-policy', { headers })).json();
      expect(reset.policy.idleMinutes).toBeNull();
      expect(reset.effectiveIdleMinutes).toBe(reset.envIdleMinutes);
    } finally {
      // آزمون نباید سیاست نشستِ محیط را عوض شده رها کند.
      await request.put('/api/v1/auth/session-policy', {
        headers,
        data: { idleMinutes: null },
      });
    }
  });

  test('کارپرداز نه زبانهٔ امنیت نشست را می‌بیند و نه مسیرش را', async ({ page, request }) => {
    await login(page, 'procurement');

    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      'x-csrf-token': cookies.find((cookie) => cookie.name === 'dm_csrf')?.value ?? '',
      'content-type': 'application/json',
    };

    /*
      و این لایهٔ اصلی است: پنهان بودن زبانه در رابط، کنترل دسترسی نیست. کسی که
      مجوز ندارد باید از خودِ مسیر ۴۰۳ بگیرد.
    */
    const read = await request.get('/api/v1/auth/session-policy', { headers });
    expect(read.status()).toBe(403);

    const write = await request.put('/api/v1/auth/session-policy', {
      headers,
      data: { idleMinutes: 600 },
    });
    expect(write.status()).toBe(403);
  });
});
