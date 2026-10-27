import { expect, test } from '@playwright/test';

import { gotoSection, login, unique } from './helpers';

/**
 * مشخصات سازمان.
 *
 * دو ادعا:
 *
 *  ۱. نام سازمان از تنظیمات پر می‌شود و **سربرگ گزارش** از همان می‌خواند — تا
 *     امروز فقط از داده مرجع می‌آمد و راهی برای عوض کردنش نبود.
 *  ۲. تغییرش در **رد حسابرسی** ثبت می‌شود. این ادعا مهم است چون پیش از این،
 *     نوشتن در رد حسابرسی خاموشانه شکست می‌خورد: شناسهٔ موجودیت `'1'` فرستاده
 *     می‌شد و ستونش از نوع UUID است.
 */
test.describe('مشخصات سازمان', () => {
  test('نام سازمان ذخیره می‌شود، در گزارش می‌آید و رد حسابرسی می‌گذارد', async ({
    page,
    request,
  }) => {
    const name = unique('اداره کل آزمون');

    await login(page, 'admin');

    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: 'تنظیمات سازمان' }).click();

    const dialog = page.getByRole('dialog', { name: 'تنظیمات سازمان' });
    await dialog.getByLabel('نام سازمان').fill(name);
    await dialog.getByRole('button', { name: 'ذخیرهٔ مشخصات' }).click();
    await expect(page.getByText('مشخصات سازمان ذخیره شد.')).toBeVisible();
    await dialog.getByRole('button', { name: 'بستن' }).click();

    // ───── رد حسابرسی ─────
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      'x-csrf-token': cookies.find((cookie) => cookie.name === 'dm_csrf')?.value ?? '',
      'content-type': 'application/json',
    };

    const audit = await (
      await request.post('/api/v1/analytics/activity/query', {
        headers,
        data: {
          columns: ['createdAt', 'action', 'entityType'],
          filter: {
            combine: 'and',
            conditions: [{ field: 'entityType', op: 'eq', values: ['organizationSettings'] }],
          },
          sort: [{ field: 'createdAt', dir: 'desc' }],
          page: 1,
          pageSize: 5,
        },
      })
    ).json();

    expect(
      audit.total,
      'تغییر مشخصات سازمان در رد حسابرسی ثبت نشده است',
    ).toBeGreaterThan(0);

    // ───── سربرگ گزارش ─────
    await gotoSection(page, 'اسناد');
    await page.getByLabel('جست‌وجو').fill('قبوض مدارس');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /قبوض مدارس/ }).first().click();
    await page.getByRole('button', { name: 'شبای ذینفعان' }).click();

    await expect(page.getByText(name), 'نام سازمان در سربرگ گزارش نیامده است').toBeVisible();
  });
});
