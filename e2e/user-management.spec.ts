import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, logout, unique } from './helpers';

/**
 * مدیریت کاربران، و ویترین گزارش‌ها.
 *
 * ادعای اصلی این فایل چیزی است که تا پیش از این فقط با `seed` ممکن بود: **مدیر
 * سامانه از خودِ سامانه کاربر می‌سازد**، و کاربر تازه واقعاً می‌تواند وارد شود.
 * بعد غیرفعالش می‌کند و همان کاربر دیگر وارد نمی‌شود — یعنی وضعیت، تزئین رابط
 * نیست.
 *
 * و یک ادعای دوم: حساب خودِ مدیر دکمهٔ غیرفعال‌سازی ندارد. کسی که خودش را
 * غیرفعال کند همان لحظه بیرون می‌افتد و راه برگشتی جز خط فرمان سرور ندارد
 * (سرور هم ردش می‌کند — تستش در `users.service.test.ts` است).
 */

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
}

test.describe('مدیریت کاربران', () => {
  test('ساخت کاربر، ورودش، و غیرفعال شدنش', async ({ page }) => {
    const stamp = Date.now().toString().slice(-7);
    const username = `t.user${stamp}`;
    // رمز آزمایشیِ همین اجرا — سیاست رمز را برآورده می‌کند.
    const password = `Karpardaz-${stamp}-Test`;

    await login(page, 'admin');
    await gotoSection(page, 'مدیریت کاربران');

    // ───── ساخت ─────
    await page.getByRole('button', { name: 'کاربر تازه' }).first().click();
    await page.getByLabel('نام کاربری').fill(username);
    await page.getByLabel('نام و نام خانوادگی').fill(unique('کاربر آزمایشی'));
    await page.getByLabel('رمز عبور').fill(password);
    await page.getByRole('button', { name: 'کارپردازی', exact: true }).click();
    await page.getByRole('button', { name: 'ذخیره', exact: true }).click();

    await expect(page.getByText(`کاربر «${username}» ساخته شد.`)).toBeVisible();

    // حساب خودِ مدیر، دکمهٔ غیرفعال‌سازی ندارد.
    await expect(page.getByRole('button', { name: 'غیرفعال کردن admin' })).toHaveCount(0);

    // ───── ورود با همان کاربر ─────
    await logout(page);
    await signIn(page, username, password);
    await expect(
      page.getByRole('navigation', { name: 'بخش‌های سامانه' }),
      'کاربر تازه نتوانست وارد شود',
    ).toBeVisible();
    // نقشش کارپردازی است، پس اسناد را می‌بیند و مدیریت کاربران را نه.
    await expect(
      page.getByRole('navigation', { name: 'بخش‌های سامانه' }).getByRole('button', {
        name: 'مدیریت کاربران',
        exact: true,
      }),
    ).toHaveCount(0);

    // ───── غیرفعال‌سازی ─────
    await logout(page);
    await login(page, 'admin');
    await gotoSection(page, 'مدیریت کاربران');
    await page.getByLabel('جست‌وجو').fill(username);
    await page.getByRole('button', { name: `غیرفعال کردن ${username}` }).click();
    await expect(page.getByText('کاربر غیرفعال شد', { exact: false })).toBeVisible();

    // و همان کاربر دیگر وارد نمی‌شود.
    await logout(page);
    await signIn(page, username, password);
    await expect(page.getByText('نام کاربری یا رمز عبور نادرست است')).toBeVisible();
  });
});

test.describe('ویترین گزارش‌ها', () => {
  test('کارت گزارش، گزارش‌گیری را روی همان گزارش باز می‌کند', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'فهرست گزارش‌ها');

    const card = page
      .getByRole('button')
      .filter({ hasText: 'گزارش مالی سامانه ستاد' })
      .first();
    await expect(card, 'کارت گزارش ستاد در ویترین نیست').toBeVisible();
    await card.click();

    /*
      پس از کلیک باید در گزارش‌گیری باشیم و همان گزارش انتخاب شده باشد.

      `aria-current="page"` همان نشانی است که خودِ نوار گزارش‌ها برای گزارش فعال
      می‌گذارد؛ دیدنِ عنوان کافی نبود، چون عنوان همهٔ گزارش‌ها آنجا هست.
    */
    const activeTab = page.getByRole('button', { name: 'گزارش مالی سامانه ستاد', exact: true });
    await expect(activeTab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'اجرای گزارش' })).toBeVisible();
  });
});
