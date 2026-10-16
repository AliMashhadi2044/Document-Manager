import { expect, test } from '@playwright/test';

import { USERS, login, logout } from './helpers';

/**
 * ورود، خروج و **باطل شدن واقعی نشست** — بند «نشست پس از خروج واقعاً باطل است»
 * از چک‌لیست امنیتی (docs/10-security-plan.md §۱۰).
 */
test.describe('ورود و نشست', () => {
  test('رمز اشتباه پیام می‌دهد و وارد نمی‌شود', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('نام کاربری').fill(USERS.admin.username);
    await page.getByLabel('رمز عبور').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'ورود' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    // پیام نباید بگوید کدام‌یک غلط بوده؛ شمارش کاربران معتبر هم اطلاعات است.
    await expect(page.getByRole('alert')).not.toContainText('کاربر یافت نشد');
    await expect(page.getByRole('button', { name: 'ورود' })).toBeVisible();
  });

  test('ورود موفق و سپس خروج، کوکی نشست را بی‌اثر می‌کند', async ({ page, request }) => {
    await login(page, 'admin');

    // کوکی نشست پس از ورود وجود دارد و HttpOnly است.
    const afterLogin = (await page.context().cookies()).find((c) => c.name === 'dm_session');
    expect(afterLogin, 'کوکی نشست ساخته نشد').toBeTruthy();
    expect(afterLogin?.httpOnly, 'کوکی نشست باید HttpOnly باشد').toBe(true);

    const stolen = `dm_session=${afterLogin?.value ?? ''}`;

    await logout(page);

    // همان مقدار کوکی، **پس از خروج**، دیگر نباید کار کند. این از «ناپدید شدن دکمه»
    // قوی‌تر است: سمت سرور سنجیده می‌شود، نه سمت رابط.
    const replay = await request.get('/api/v1/auth/me', { headers: { cookie: stolen } });
    expect(replay.status(), 'نشست پس از خروج هنوز معتبر است').toBe(401);
  });

  test('بدون ورود، صفحه ورود دیده می‌شود', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ورود' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'بخش‌های سامانه' })).toHaveCount(0);
  });
});
