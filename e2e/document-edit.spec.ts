import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, toAsciiDigits, unique } from './helpers';

/**
 * ویرایش مشخصات سند، پیش از ثبت نهایی.
 *
 * تا پیش از این فقط «شرح» از راه API عوض می‌شد و رابط هیچ راهی نداشت؛ کاربری که
 * سال یا خریدار را اشتباه زده بود باید سند را رها می‌کرد و از نو می‌ساخت.
 *
 * ادعای آزمون سه چیز است: دکمه کنار وضعیت هست، تغییر واقعاً ذخیره می‌شود، و پس از
 * ثبت نهایی دکمه **نیست** — چون سند ثبت‌شده ویرایش نمی‌شود.
 *
 * «تغییر واقعاً ذخیره می‌شود» باید **برای هر فیلدِ فرم** سنجیده شود و نه یکی‌دو تا.
 * شماره و تاریخ گردش در schema سرور نبودند و zod خاموشانه دورشان می‌انداخت: پاسخ
 * ۲۰۰ و پیام «مشخصات سند اصلاح شد» می‌آمد و هیچ‌چیز عوض نمی‌شد. آزمونی که فقط
 * شرح و سال را می‌سنجید، سبز می‌ماند.
 */
test.describe('ویرایش مشخصات سند', () => {
  test('شرح و سال شمسی سند پیش‌نویس عوض می‌شوند', async ({ page }) => {
    const title = unique('سند ویرایش');
    const newTitle = unique('سند اصلاح‌شده');
    const workflowNumber = `WF-${Date.now().toString().slice(-6)}`;

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');

    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();

    // ───── دکمه کنار وضعیت ─────
    await page.getByRole('button', { name: 'ویرایش مشخصات سند' }).click();
    const dialog = page.getByRole('dialog', { name: 'ویرایش مشخصات سند' });

    // فرم با مقدارهای فعلی باز می‌شود، نه خالی.
    await expect(dialog.getByLabel('شرح سند')).toHaveValue(title);

    await dialog.getByLabel('شرح سند').fill(newTitle);
    await dialog.getByRole('textbox', { name: 'سال شمسی' }).fill('1406');

    // گردش هم در همین فرم است؛ تا پیش از این سرور نادیده‌اش می‌گرفت.
    await dialog.getByLabel('شماره گردش').fill(workflowNumber);
    await dialog.getByLabel('تاریخ گردش').fill('1405/07/20');

    await dialog.getByRole('button', { name: 'ثبت اصلاح' }).click();
    await expect(page.getByText('مشخصات سند اصلاح شد.')).toBeVisible();
    await expect(dialog).toBeHidden();

    // سربرگ سند با مقدار تازه خوانده می‌شود.
    await expect(page.getByRole('heading', { name: newTitle })).toBeVisible();
    await expect(page.getByText('سال شمسی ۱۴۰۶')).toBeVisible();

    /*
      و گردش، از سرور خوانده می‌شود.

      ارقام در رابط فارسی‌اند، پس مقایسه پس از تبدیل انجام می‌شود — وگرنه آزمون
      بی‌آنکه چیزی خراب باشد شکست می‌خورد.
    */
    const workflowField = page.getByText('شماره گردش', { exact: true }).locator('..');
    expect(toAsciiDigits((await workflowField.textContent()) ?? '')).toContain(workflowNumber);
    const dateField = page.getByText('تاریخ گردش', { exact: true }).locator('..');
    expect(toAsciiDigits((await dateField.textContent()) ?? '')).toContain('1405/07/20');

    // ───── و بار دوم، پاک کردنشان هم ذخیره می‌شود ─────
    await page.getByRole('button', { name: 'ویرایش مشخصات سند' }).click();
    const again = page.getByRole('dialog', { name: 'ویرایش مشخصات سند' });
    // فرم با مقدار ذخیره‌شده باز می‌شود، نه خالی.
    expect(toAsciiDigits(await again.getByLabel('شماره گردش').inputValue())).toBe(workflowNumber);
    await again.getByLabel('شماره گردش').fill('');
    await again.getByRole('button', { name: 'ثبت اصلاح' }).click();
    await expect(page.getByText('مشخصات سند اصلاح شد.')).toBeVisible();
    // تا گفت‌وگو بسته نشود، برچسب «شماره گردش» دو جا هست: در فرم و در برگهٔ سند.
    await expect(again).toBeHidden();

    const cleared = page.getByText('شماره گردش', { exact: true }).locator('..');
    expect(toAsciiDigits((await cleared.textContent()) ?? '')).not.toContain(workflowNumber);
  });

  /**
   * سند ستاد: اطلاعات ستاد هم در همان فرم ویرایش می‌شود.
   *
   * اینجا هم همان ادعا است — هر فیلدی که فرم نشان می‌دهد باید **برگردد**. اطلاعات
   * ستاد در یک شیء تودرتو (`stad`) می‌رود و کلیدِ گم‌شده در شیء تودرتو همان‌قدر
   * بی‌صدا گم می‌شود.
   */
  test('اطلاعات ستاد و گردشِ سند ستاد هم ذخیره می‌شوند', async ({ page }) => {
    const title = unique('سند ستاد ویرایش');
    const stamp = Date.now().toString().slice(-6);

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');

    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const typeButton = page.getByRole('button', { name: 'سامانه ستاد', exact: true });
    await typeButton.click();
    await expect(typeButton).toHaveAttribute('aria-pressed', 'true');

    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await page.getByLabel('شماره درخواست').fill(`RQ-${stamp}`);
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();
    await page.getByRole('button', { name: 'ویرایش مشخصات سند' }).click();
    const dialog = page.getByRole('dialog', { name: 'ویرایش مشخصات سند' });

    await dialog.getByLabel('شماره نیاز').fill(`ND-${stamp}`);
    await dialog.getByLabel('شماره درخواست').fill(`RQ2-${stamp}`);
    await dialog.getByLabel('شماره گردش').fill(`WF-${stamp}`);
    await dialog.getByRole('button', { name: 'ثبت اصلاح' }).click();
    await expect(page.getByText('مشخصات سند اصلاح شد.')).toBeVisible();
    await expect(dialog).toBeHidden();

    const value = async (label: string): Promise<string> =>
      toAsciiDigits((await page.getByText(label, { exact: true }).locator('..').textContent()) ?? '');

    expect(await value('شماره نیاز')).toContain(`ND-${stamp}`);
    expect(await value('شماره درخواست')).toContain(`RQ2-${stamp}`);
    expect(await value('شماره گردش')).toContain(`WF-${stamp}`);
  });

  test('سند ثبت‌نهایی‌شده دکمهٔ ویرایش ندارد', async ({ page }) => {
    const title = unique('سند قفل');

    await login(page, 'admin');
    await gotoSection(page, 'اسناد');

    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
    await page.getByLabel('شرح سند').fill(title);
    await pickOption(page, 'مجموعه خریدار');
    await form.getByRole('button', { name: 'ایجاد سند' }).click();
    await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

    await page.getByRole('button', { name: title }).click();
    await expect(page.getByRole('button', { name: 'ویرایش مشخصات سند' })).toBeVisible();

    // ثبت نهایی به یک فاکتور نیاز دارد.
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
    // شرح فاکتور اجباری است؛ همان جمله‌ای که در گزارش مالیات هم می‌نشیند.
    await page.getByLabel('شرح فاکتور').fill(unique('شرح'));
    await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
    await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();

    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

    await expect(page.getByRole('button', { name: 'ویرایش مشخصات سند' })).toHaveCount(0);
  });
});
