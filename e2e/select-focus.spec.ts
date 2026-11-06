import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, logout, unique } from './helpers';

/**
 * Tab از فهرستِ بازشده، به کنترل بعدیِ **همان فرم** می‌رود.
 *
 * با ترجیح «فهرست‌های انتخاب با Tab ← با رسیدن فوکوس باز شود»، فهرست به محض
 * رسیدن فوکوس باز می‌شود و فوکوس روی کادر جست‌وجوی آن می‌نشیند. آن کادر در یک
 * پورتال و در انتهای `document.body` است، پس Tab — که ترتیب DOM را دنبال می‌کند
 * — کاربر را از فرم بیرون می‌انداخت و سر از منوی کنار صفحه درمی‌آورد؛ یعنی کسی
 * که نمی‌خواست چیزی انتخاب کند، جای خودش در فرم را گم می‌کرد.
 *
 * آزمون روی کاربرِ تازهٔ همین اجرا انجام می‌شود و نه روی `admin`: ترجیح‌ها سمت
 * سرور و **برای هر کاربر** ذخیره می‌شوند، و عوض کردن ترجیحِ `admin` رفتار
 * فرم‌ها را برای آزمون‌هایی که هم‌زمان با همان حساب کار می‌کنند عوض می‌کرد.
 */

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page.getByRole('navigation', { name: 'بخش‌های سامانه' })).toBeVisible();
}

test.describe('فوکوس و فهرست‌های انتخاب', () => {
  test('Tab از فهرستِ باز، به فیلد بعدی فرم می‌رود و نه بیرون از آن', async ({ page }) => {
    const stamp = Date.now().toString().slice(-7);
    const username = `t.focus${stamp}`;
    const password = `Fokus-${stamp}-Ok`;

    // ───── کاربر مخصوص همین آزمون ─────
    await login(page, 'admin');
    await gotoSection(page, 'مدیریت کاربران');
    await page.getByRole('button', { name: 'کاربر تازه' }).first().click();
    await page.getByLabel('نام کاربری').fill(username);
    await page.getByLabel('نام و نام خانوادگی').fill(unique('کاربر فوکوس'));
    await page.getByLabel('رمز عبور').fill(password);
    await page.getByRole('button', { name: 'کارپردازی', exact: true }).click();
    await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
    await expect(page.getByText(`کاربر «${username}» ساخته شد.`)).toBeVisible();
    await logout(page);

    await signIn(page, username, password);

    // ───── روشن کردن «باز شدن با رسیدن فوکوس» ─────
    await gotoSection(page, 'حساب من');
    const preference = page.getByRole('group', { name: 'فهرست‌های انتخاب با Tab' });
    // رادیوی Segmented خودش sr-only است؛ کاربر روی برچسبش می‌زند.
    await preference.locator('label').filter({ hasText: 'با رسیدن فوکوس باز شود' }).click();
    await expect(preference.getByRole('radio', { name: 'با رسیدن فوکوس باز شود' })).toBeChecked();

    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();

    const listbox = page.getByRole('listbox', { name: 'مجموعه خریدار' });
    const where = (): Promise<{ inForm: boolean; inNav: boolean; id: string }> =>
      page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        return {
          inForm: active !== null && active.closest('form') !== null,
          inNav: active !== null && active.closest('nav') !== null,
          id: active?.id ?? '',
        };
      });

    // ───── فوکوس که به فهرست می‌رسد، باز می‌شود ─────
    await page.getByLabel('شرح سند').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'مجموعه خریدار' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(listbox).toBeVisible();

    // ───── و Tab بعدی، داخل همان فرم می‌ماند ─────
    await page.keyboard.press('Tab');
    await expect(listbox).toBeHidden();

    const after = await where();
    expect(after.inNav, `فوکوس روی «${after.id}» رفت`).toBe(false);
    expect(after.inForm).toBe(true);
    // فیلد بعدیِ فرم، سال مالی است — همان جایی که اگر فهرست باز نشده بود می‌رفت.
    expect(after.id).toBe('fiscalYear');

    // ───── و Shift+Tab هم به عقب برمی‌گردد، نه به بیرون ─────
    await page.keyboard.press('Shift+Tab'); // بازگشت روی فهرست، که باز می‌شود
    await expect(listbox).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(listbox).toBeHidden();

    const back = await where();
    expect(back.inNav, `فوکوس روی «${back.id}» رفت`).toBe(false);
    expect(back.inForm).toBe(true);
  });
});
