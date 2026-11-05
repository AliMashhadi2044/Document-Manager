import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, logout, unique } from './helpers';

/**
 * حساب کاربر: تغییر رمز، و لینک مستقیم.
 *
 * ادعای اصلی چیزی است که تا پیش از این اصلاً ممکن نبود: **کاربر رمز خودش را عوض
 * می‌کند** و با رمز تازه وارد می‌شود. آزمون روی کاربرِ تازه‌ساختهٔ همین اجرا انجام
 * می‌شود، نه روی `admin` — شکستِ نیمه‌کاره نباید رمز حسابی را عوض کند که بقیهٔ
 * آزمون‌ها با آن وارد می‌شوند.
 */

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
}

test.describe('حساب من', () => {
  test('کاربر رمز خودش را عوض می‌کند و با رمز تازه وارد می‌شود', async ({ page }) => {
    const stamp = Date.now().toString().slice(-7);
    const username = `t.pass${stamp}`;
    const first = `Karpardaz-${stamp}-One`;
    const second = `Karpardaz-${stamp}-Two`;

    // ───── ساخت کاربر ─────
    await login(page, 'admin');
    await gotoSection(page, 'مدیریت کاربران');
    await page.getByRole('button', { name: 'کاربر تازه' }).first().click();
    await page.getByLabel('نام کاربری').fill(username);
    await page.getByLabel('نام و نام خانوادگی').fill(unique('کاربر رمز'));
    await page.getByLabel('رمز عبور').fill(first);
    await page.getByRole('button', { name: 'کارپردازی', exact: true }).click();
    await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
    await expect(page.getByText(`کاربر «${username}» ساخته شد.`)).toBeVisible();

    // ───── تغییر رمز توسط خودش ─────
    await logout(page);
    await signIn(page, username, first);
    await gotoSection(page, 'حساب من');

    // رمز فعلیِ نادرست، رمز را عوض نمی‌کند.
    await page.getByLabel('رمز عبور فعلی').fill('Ghalat-1404-Ghalat');
    await page.getByLabel('رمز عبور تازه').fill(second);
    await page.getByLabel('تکرار رمز تازه').fill(second);
    await page.getByRole('button', { name: 'تغییر رمز' }).click();
    await expect(page.getByText('رمز عبور فعلی نادرست است')).toBeVisible();

    await page.getByLabel('رمز عبور فعلی').fill(first);
    await page.getByLabel('رمز عبور تازه').fill(second);
    await page.getByLabel('تکرار رمز تازه').fill(second);
    await page.getByRole('button', { name: 'تغییر رمز' }).click();
    await expect(page.getByText('رمز عبور عوض شد', { exact: false })).toBeVisible();

    // روی همین دستگاه وارد مانده است — وگرنه کاربر با عوض کردن رمز بیرون می‌افتاد.
    await expect(page.getByRole('navigation', { name: 'بخش‌های سامانه' })).toBeVisible();

    // ───── ورود با رمز تازه، و رد شدن رمز قدیمی ─────
    await logout(page);
    await signIn(page, username, first);
    await expect(page.getByText('نام کاربری یا رمز عبور نادرست است')).toBeVisible();

    await signIn(page, username, second);
    await expect(page.getByRole('navigation', { name: 'بخش‌های سامانه' })).toBeVisible();

    // ───── نظافت: حساب آزمایشی فعال نماند ─────
    await logout(page);
    await login(page, 'admin');
    await gotoSection(page, 'مدیریت کاربران');
    await page.getByLabel('جست‌وجو').fill(username);
    await page.getByRole('button', { name: `غیرفعال کردن ${username}` }).click();
    await expect(page.getByText('کاربر غیرفعال شد', { exact: false })).toBeVisible();
  });
});

test.describe('لینک مستقیم', () => {
  test('نشانی، بخش را باز می‌کند و برگشت مرورگر کار می‌کند', async ({ page }) => {
    await login(page, 'admin');

    // رفتن به یک بخش، نشانی را هم عوض می‌کند.
    await gotoSection(page, 'فروشندگان');
    await expect(page).toHaveURL(/#\/vendors$/u);

    await gotoSection(page, 'اسناد');
    await expect(page).toHaveURL(/#\/documents/u);

    // و دکمهٔ برگشت، به بخش قبلی برمی‌گردد نه بیرون از برنامه.
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'فروشندگان' })).toBeVisible();
  });

  test('نشانی دستکاری‌شده، کاربر را سرگردان نمی‌کند', async ({ page }) => {
    await login(page, 'admin');

    // بخشی که وجود ندارد: برنامه باید بالا بیاید، نه صفحهٔ خالی یا خطا.
    await page.goto('/#/not-a-section');
    await expect(page.getByRole('navigation', { name: 'بخش‌های سامانه' })).toBeVisible();
  });
});
