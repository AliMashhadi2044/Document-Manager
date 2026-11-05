import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * چیدمان گزارش مالیات.
 *
 * پنج ادعا، همه با اندازه‌گیری و نه نگاه کردن:
 *
 *  ۱. برچسب «جمع کل» ستون‌های ابتدایی را با هم می‌گیرد — در ستون «ردیف» که چند
 *     میلی‌متر است، می‌شکست و از سلول بیرون می‌زد.
 *  ۲. ردیف‌های خالیِ فرم فقط شماره دارند؛ ستون‌های مبلغشان «۰» نیست.
 *  ۳. سلولی که دو مقدار دارد به دو نیمه تقسیم می‌شود، و سلول تک‌مقداری نه.
 *  ۴. متن‌های بالای گزارش هنگام خروجی ویرایش‌شدنی‌اند.
 *  ۵. چاپ، پوستهٔ برنامه را نمی‌برد.
 */

async function finalizedDocumentWithReport(page: Page, title: string): Promise<void> {
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
  await pickOption(page, 'فروشنده');
  await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');
  // شمارهٔ صورتحساب **و** تاریخ هر دو هستند: سلول باید دوبخشی شود.
  await page.getByLabel('شماره صورتحساب').fill('۱۲۳۴');
  await page.getByLabel('شرح ردیف ۱').fill('کاغذ');
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
  await page.getByRole('button', { name: 'گزارش مالیات' }).click();
  await expect(page.locator('table').first()).toBeVisible();
}

test.describe('چیدمان گزارش مالیات', () => {
  test('جمع کل، ردیف‌های خالی، سلول دوبخشی و ویرایش سربرگ', async ({ page }) => {
    await login(page, 'admin');
    await finalizedDocumentWithReport(page, unique('سند چیدمان گزارش'));

    const table = page.locator('table').first();

    // ───── ۱. برچسب جمع، چند ستون را می‌پوشاند ─────
    const totalsLabel = table.locator('td', { hasText: /^جمع کل$/ }).last();
    await expect(totalsLabel).toBeVisible();
    expect(
      Number(await totalsLabel.getAttribute('colspan')),
      'برچسب جمع هنوز در یک ستون محبوس است',
    ).toBeGreaterThan(1);

    // ───── ۲. ردیف‌های خالی: شمارهٔ پیوسته، بقیه خالی ─────
    const rows = table.locator('tbody tr');
    const second = rows.nth(1);
    await expect(second.locator('td').first()).toHaveText('۲');

    const cells = second.locator('td');
    const count = await cells.count();
    for (let index = 1; index < count - 1; index += 1) {
      await expect(cells.nth(index), 'ردیف خالی هنوز «۰» دارد').toHaveText('');
    }

    // ───── ۳. سلول دوبخشی ─────
    // «شماره صورتحساب — تاریخ»: هر دو مقدار هست، پس دو بخش دارد.
    const firstRow = rows.first();
    const invoiceRef = firstRow.locator('td').filter({ hasText: '۱۴۰۵/۰۷/۱۲' }).first();
    await expect(invoiceRef.locator('> span')).toHaveCount(2);

    // ستون مبلغ یک مقدار دارد و باید یک‌تکه بماند.
    const singleValue = firstRow.locator('td').filter({ hasText: '۱٬۰۰۰٬۰۰۰' }).first();
    await expect(singleValue.locator('> span')).toHaveCount(1);

    // ───── ۴. ویرایش متن‌های سربرگ ─────
    const heading = unique('سربرگ دستی');
    await page.getByRole('button', { name: /ویرایش سربرگ/ }).click();

    const dialog = page.getByRole('dialog', { name: 'ویرایش متن‌های بالای گزارش' });
    await dialog.getByRole('textbox').first().fill(heading);
    await dialog.getByRole('button', { name: 'اعمال روی این خروجی' }).click();

    await expect(page.getByText(heading)).toBeVisible();
    // و دکمه می‌گوید چند متن عوض شده است.
    await expect(page.getByRole('button', { name: /ویرایش سربرگ \(۱\)/ })).toBeVisible();
  });

  test('چاپ، پوستهٔ برنامه را نمی‌برد', async ({ page }) => {
    await login(page, 'admin');
    await finalizedDocumentWithReport(page, unique('سند چاپ گزارش'));

    const shell = page.getByRole('navigation', { name: 'بخش‌های سامانه' });
    await expect(shell).toBeVisible();

    await page.emulateMedia({ media: 'print' });

    // نوار بخش‌ها و دکمه‌های اقدام، رابط‌اند نه محتوا.
    await expect(shell, 'نوار کناری روی کاغذ می‌آید').toBeHidden();
    await expect(page.getByRole('button', { name: 'چاپ' })).toBeHidden();

    // ولی خود گزارش سر جایش است.
    await expect(page.getByText('گزارش مالیات بر ارزش افزوده')).toBeVisible();

    await page.emulateMedia({ media: 'screen' });
  });
});
