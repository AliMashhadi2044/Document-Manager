import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * فرم افزودن فاکتور: کلید گروه بودجه و انتخابگر تاریخ.
 *
 * هر دو آزمون یک سند تازه می‌سازند و دست‌نخورده رهایش می‌کنند (پیش‌نویس می‌ماند)؛
 * ساختن سند ارزان‌تر از وابسته شدن به داده‌ای است که آزمون دیگری ممکن است عوضش کند.
 */
async function newDraft(
  page: import('@playwright/test').Page,
  title: string,
  options: { signIn?: boolean } = {},
): Promise<void> {
  // آزمونی که از پیش وارد شده، نباید دوباره وارد شود: صفحهٔ ورود اصلاً نمی‌آید و
  //  تا ابد منتظر فیلد نام کاربری می‌ماند.
  if (options.signIn !== false) await login(page, 'admin');
  await gotoSection(page, 'اسناد');

  await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();

  // دکمهٔ بازکنندهٔ فرم و دکمهٔ ثبت هر دو «ایجاد سند» نام دارند؛ پس دکمهٔ ثبت از
  // درون خود فرم گرفته می‌شود.
  const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
  await page.getByLabel('شرح سند').fill(title);
  await pickOption(page, 'مجموعه خریدار');
  await form.getByRole('button', { name: 'ایجاد سند' }).click();
  await expect(page.getByText('سند ایجاد شد.')).toBeVisible();

  await page.getByRole('button', { name: title }).click();
  await page.getByRole('button', { name: 'افزودن فاکتور' }).click();
}

test.describe('فرم فاکتور', () => {
  test('کلید گروه بودجه، فهرست فصل‌ها را عوض می‌کند', async ({ page }) => {
    await newDraft(page, unique('سند آزمون گروه'));

    /*
     * رادیوی خودِ کلید سر‌آمده (sr-only) است و برچسب رویش می‌نشیند — کاربر هم روی
     * برچسب کلیک می‌کند، پس آزمون هم همان کار را می‌کند.
     */
    const current = page.getByRole('radio', { name: /جاری/ });
    const capital = page.getByRole('radio', { name: /عمرانی/ });
    const capitalLabel = page.locator('label').filter({ hasText: 'عمرانی' }).first();
    await expect(current).toBeChecked();

    // فهرست فصل‌ها باید **فقط** فصل‌های گروه انتخاب‌شده را داشته باشد. فصل‌های
    // عمرانی در داده اولیه کد فصل دارند («فصل ۱»)، جاری‌ها ندارند.
    await page.getByRole('combobox', { name: 'فصل' }).click();
    const currentOptions = await page.getByRole('option').allTextContents();
    expect(currentOptions.join(' ')).not.toContain('فصل ۱');
    await page.keyboard.press('Escape');

    await capitalLabel.click();
    await expect(capital).toBeChecked();

    await page.getByRole('combobox', { name: 'فصل' }).click();
    const capitalOptions = await page.getByRole('option').allTextContents();
    expect(capitalOptions.join(' ')).toContain('فصل');
    expect(capitalOptions).not.toEqual(currentOptions);
    await page.keyboard.press('Escape');
  });

  test('تقویم شمسی، تاریخ صورتحساب را پر می‌کند', async ({ page }) => {
    await newDraft(page, unique('سند آزمون تقویم'));

    // تا فصل انتخاب نشود، بقیهٔ فرم ساخته نمی‌شود.
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });

    /*
     * تایپ دستی با ماسک: کاربر فقط رقم می‌زند و «/» خودش می‌آید؛ خروجی هم با ارقام
     * فارسی نوشته می‌شود، مثل بقیهٔ سامانه.
     */
    const field = page.getByLabel('تاریخ صورتحساب');
    await field.fill('14050712');
    await expect(field).toHaveValue('۱۴۰۵/۰۷/۱۲');

    // حرف و نشانه اصلاً وارد نمی‌شود؛ رقم‌ها جایشان را می‌گیرند.
    await field.fill('');
    await field.pressSequentially('1405a07b12');
    await expect(field).toHaveValue('۱۴۰۵/۰۷/۱۲');

    await page.getByRole('button', { name: 'باز کردن تقویم' }).click();
    const calendar = page.getByRole('dialog', { name: 'تقویم تاریخ صورتحساب' });
    await expect(calendar).toBeVisible();

    /*
     * تقویم باید روی ماهِ همان تاریخ باز شود و نه ماه جاری — وگرنه کاربر برای
     * اصلاح یک روز، باید دوباره ماه را پیدا کند.
     */
    await expect(calendar.getByText('مهر ۱۴۰۵')).toBeVisible();

    /*
     * انتخاب یک روز، همان روز را در ورودی می‌نشاند.
     *
     * نام دکمهٔ روز، تاریخ کامل است و نه «۲۰»: «۲۰» به‌تنهایی برای صفحه‌خوان
     * بی‌معناست. نمایش هم با ارقام فارسی است، همان‌طور که بقیهٔ سامانه.
     */
    await calendar.getByRole('button', { name: '۱۴۰۵/۰۷/۲۰' }).click();
    await expect(calendar).toHaveCount(0);
    await expect(field).toHaveValue('۱۴۰۵/۰۷/۲۰');

    // ماه قبل: مهر ⇒ شهریور، بدون عوض شدن سال.
    await page.getByRole('button', { name: 'باز کردن تقویم' }).click();
    await calendar.getByRole('button', { name: 'ماه قبل' }).click();
    await expect(calendar.getByText('شهریور ۱۴۰۵')).toBeVisible();

    // سال قبل از همان ماه.
    await calendar.getByRole('button', { name: 'سال قبل' }).click();
    await expect(calendar.getByText('شهریور ۱۴۰۴')).toBeVisible();

    // Escape می‌بندد و فوکوس به دکمهٔ تقویم برمی‌گردد.
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'باز کردن تقویم' })).toBeFocused();
    // تاریخ با بستنِ بی‌انتخاب عوض نمی‌شود.
    await expect(field).toHaveValue('۱۴۰۵/۰۷/۲۰');
  });
});

/**
 * روش‌های پرداخت مجاز، به تفکیک نوع فاکتور.
 *
 * ادعای این آزمون این نیست که «گفت‌وگو باز می‌شود»، بلکه این است که تیک‌ها واقعاً
 * **فرم فاکتور** را محدود می‌کنند. آزمون در پایان محدودیت را برمی‌دارد، چون این یک
 * تنظیم سراسری است و جا ماندنش روی اجراهای بعدی اثر می‌گذارد.
 */
test.describe('روش پرداخت مجاز', () => {
  test('تیک‌های یک نوع فاکتور، فهرست فرم را محدود می‌کند', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'فصل‌ها و انواع فاکتور');

    /*
     * ردیف را با **دکمه‌اش** پیدا می‌کنیم و نه فقط با متن: نام نوع فاکتور در فهرست
     * فصل‌ها هم می‌آید و آنجا دکمه‌ای نیست.
     */
    const typeRow = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: 'روش‌های پرداخت' }) })
      .filter({ hasText: 'فاکتور عادی' });
    await typeRow.getByRole('button', { name: 'روش‌های پرداخت' }).click();

    const dialog = page.getByRole('dialog', { name: /روش‌های پرداخت/ });
    await expect(dialog).toBeVisible();

    /*
     * از حالت معلوم شروع کن.
     *
     * این یک تنظیم سراسری است؛ اگر آزمون حالت اولیه را **فرض** کند، یک اجرای ناتمام
     * اجرای بعدی را می‌شکند. پس اول هر تیکی که هست برداشته می‌شود.
     */
    const ticked = dialog.locator('input[type="checkbox"]:checked');
    for (let index = (await ticked.count()) - 1; index >= 0; index -= 1) {
      await ticked.nth(index).uncheck();
    }
    await expect(dialog.getByText(/محدودیتی اعمال نمی‌شود/)).toBeVisible();

    // فقط «تنخواه» مجاز باشد — پس «قبض» نباید در فرم دیده شود.
    await dialog.getByRole('checkbox', { name: /تنخواه/ }).check();
    await dialog.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.getByText('روش‌های پرداخت مجاز ذخیره شد.')).toBeVisible();

    // ───── اثرش در فرم فاکتور ─────
    await newDraft(page, unique('سند آزمون روش پرداخت'), { signIn: false });
    await pickOption(page, 'فصل', { search: 'مواد مصرفی', nth: 0 });

    await page.getByRole('combobox', { name: 'روش پرداخت' }).click();
    const options = await page.getByRole('option').allTextContents();
    expect(options.join(' ')).toContain('تنخواه');
    expect(options.join(' '), 'روش غیرمجاز هنوز در فهرست است').not.toContain('قبض');
    await page.keyboard.press('Escape');

    // ───── پاک‌سازی: برداشتن محدودیت ─────
    await gotoSection(page, 'فصل‌ها و انواع فاکتور');
    await typeRow.getByRole('button', { name: 'روش‌های پرداخت' }).click();
    await dialog.getByRole('checkbox', { name: /تنخواه/ }).uncheck();
    await dialog.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.getByText(/محدودیت برداشته شد/)).toBeVisible();
  });
});
