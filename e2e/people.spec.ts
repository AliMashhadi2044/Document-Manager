import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique, uniqueIban } from './helpers';

/**
 * اشخاص سازمان: امضاکنندگان و تنخواه‌داران.
 *
 * هر دو تا پیش از این فقط از راه seed وارد می‌شدند — نام پای گزارش‌ها قابل تغییر
 * نبود و تنخواه‌دار اصلاً انتخاب‌شدنی نبود.
 *
 * ادعای آزمون دوم مهم‌تر است: اطلاعات حسابِ تنخواه‌دار در لحظهٔ ثبت فاکتور
 * **snapshot** می‌شود و همان در برگهٔ سند دیده می‌شود.
 */

test.describe('امضاکنندگان', () => {
  test('ساخته، اصلاح و غیرفعال می‌شوند', async ({ page }) => {
    const name = unique('امضاکننده');

    await login(page, 'admin');
    await gotoSection(page, 'امضاکنندگان');

    await page.getByRole('button', { name: 'افزودن امضاکننده' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'امضاکنندهٔ جدید' });
    await dialog.getByLabel('نام و نام خانوادگی').fill(name);
    await dialog.getByLabel('سمت').fill('کارشناس مالی');
    await dialog.getByRole('button', { name: 'ثبت امضاکننده' }).click();
    await expect(page.getByText('امضاکننده ثبت شد.')).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toContainText('کارشناس مالی');
    await expect(row).toContainText('مسئول کارپردازی');

    // اصلاح: همان چیزی که کاربر برای عوض کردن نامِ پای گزارش می‌کند.
    await page.getByRole('button', { name: `اصلاح ${name}` }).click();
    const edit = page.getByRole('dialog', { name: 'اصلاح امضاکننده' });
    await edit.getByLabel('سمت').fill('معاون پشتیبانی');
    await edit.getByRole('button', { name: 'ثبت اصلاح' }).click();
    await expect(page.getByText('امضاکننده اصلاح شد.')).toBeVisible();
    await expect(row).toContainText('معاون پشتیبانی');

    await page.getByRole('button', { name: `غیرفعال کردن ${name}` }).click();
    await expect(page.getByText('امضاکننده غیرفعال شد.')).toBeVisible();
    await expect(row).toContainText('غیرفعال');
  });
});

test.describe('تنخواه‌دار', () => {
  test('در فاکتور انتخاب می‌شود و اطلاعات حسابش در سند می‌ماند', async ({ page }) => {
    const holder = unique('تنخواه‌دار');
    const accountHolder = unique('صاحب حساب');
    const title = unique('سند تنخواه');
    const iban = uniqueIban('018');

    await login(page, 'admin');

    // ───── تعریف تنخواه‌دار با حسابی به نام شخص دیگر ─────
    await gotoSection(page, 'تنخواه‌داران');
    await page.getByRole('button', { name: 'افزودن تنخواه‌دار' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'تنخواه‌دار جدید' });
    await dialog.getByLabel('نام و نام خانوادگی').fill(holder);
    await dialog.getByLabel('نام صاحب حساب').fill(accountHolder);
    await dialog.getByLabel('شبا').fill(iban.slice(2));
    await dialog.getByRole('button', { name: 'ثبت تنخواه‌دار' }).click();
    await expect(page.getByText('تنخواه‌دار ثبت شد.')).toBeVisible();

    // بانک از خود شبا تشخیص داده می‌شود، نه از یک پرسش جدا.
    await expect(page.getByRole('row').filter({ hasText: holder })).toContainText('تجارت');

    // ───── یک فاکتور با روش تنخواه ─────
    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();
    await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });

    const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    if ((await typeSelect.count()) > 0) {
      await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
    }

    await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
    await page.getByLabel('شرح ردیف ۱').fill('ملزومات اداری');
    await page.getByLabel('تعداد').fill('1');
    await pickOption(page, 'واحد');
    await page.getByLabel('مبلغ واحد').fill('2000000');

    await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });

    // پیام «پس از افزودن مدیریت کاربران…» دیگر نباید باشد؛ جایش یک انتخاب واقعی است.
    await expect(page.getByText('مدیریت کاربران')).toHaveCount(0);
    await pickOption(page, 'تنخواه‌دار', { text: holder });

    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();

    // ───── برگهٔ سند: نام تنخواه‌دار و نام صاحب حساب، هر دو ─────
    const detail = page.getByText('تنخواه‌دار', { exact: true }).locator('..');
    await expect(detail).toContainText(holder);
    await expect(detail).toContainText(accountHolder);
  });
});
