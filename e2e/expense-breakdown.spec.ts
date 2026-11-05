import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login, pickOption, toAsciiDigits, unique } from './helpers';

/**
 * فرم‌های «صورت ریز هزینه‌های عمرانی / جاری انجام شده».
 *
 * آنچه سنجیده می‌شود:
 *
 *  ۱. ستون‌های فصل از **اطلاعات پایه** می‌آیند، با سرستون دوطبقه: عنوان بالا، کد پایین.
 *  ۲. مبلغ هر فاکتور فقط زیر فصلِ خودش می‌نشیند و خانهٔ فصل دیگر خالی می‌ماند.
 *  ۳. شرح هر ردیف ویرایش‌شدنی است و شرح خودِ فاکتور را عوض نمی‌کند.
 *  ۴. ستون «پرداخت به» فقط در فرم جاری است و مقصد پرداخت را **با واژه** می‌نویسد.
 *  ۵. تاریخ صورت‌حساب روی صفحه هست و روی کاغذ نه.
 *
 * دو سند لازم است و نه یکی: یک سند فقط فاکتورهای **یک گروه بودجه** را می‌پذیرد، پس
 * عمرانی و جاری نمی‌توانند در یک سند کنار هم باشند.
 */

/** مبلغ یک خانه ⇒ رشتهٔ ارقام لاتین؛ خانهٔ خالی رشتهٔ خالی می‌شود. */
function amount(text: string): string {
  return toAsciiDigits(text).replace(/[٬,\s]/gu, '');
}

/** سندی تازه با یک عنوان یکتا؛ صفحهٔ سند باز می‌ماند. */
async function newDocument(page: Page, title: string): Promise<void> {
  await gotoSection(page, 'اسناد');

  /*
    اگر از قبل روی صفحهٔ یک سند باشیم، کلیک روی همان بخش در نوار کنار، چیزی را
    عوض نمی‌کند و فهرست باز نمی‌شود.
  */
  const backToList = page.getByRole('button', { name: 'بازگشت به فهرست' });
  if (await backToList.isVisible()) await backToList.click();

  /*
    فرم ایجاد سند ممکن است از سند قبلی باز مانده باشد.

    دکمهٔ نوار ابزار یک کلید دوحالته است، پس کلیک بی‌قید رویش فرمِ باز را می‌بندد؛
    و «ایجاد سند»ِ داخل فرم تا پر نشدنش خاموش است.
  */
  const titleField = page.getByLabel('شرح سند');
  if (!(await titleField.isVisible())) {
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
  }

  const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
  await page.getByLabel('شرح سند').fill(title);
  await pickOption(page, 'مجموعه خریدار');
  await form.getByRole('button', { name: 'ایجاد سند' }).click();
  await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
  await page.getByRole('button', { name: title }).click();
}

async function addInvoice(
  page: Page,
  options: {
    description: string;
    unitPrice: string;
    chapter: string;
    capital?: boolean;
    holder: string;
  },
): Promise<void> {
  await page.getByRole('button', { name: 'افزودن فاکتور' }).click();

  // فهرست فصل‌ها فقط فصل‌های گروه انتخاب‌شده را نشان می‌دهد.
  if (options.capital) {
    await page.locator('label').filter({ hasText: 'عمرانی' }).first().click();
  }

  await pickOption(page, 'فصل', { search: options.chapter, nth: 0 });

  const typeSelect = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
  if ((await typeSelect.count()) > 0) {
    await pickOption(page, 'نوع فاکتور', { text: 'فاکتور عادی' });
  }

  await page.getByLabel('تاریخ صورتحساب').fill('1405/07/12');

  // شرحِ **فاکتور** — همان چیزی که ستون شرحِ فرم ریزهزینه پیش‌فرض از آن می‌گیرد؛
  // شرح ردیف، شرح یک قلم کالاست و چیز دیگری است.
  await page.getByLabel('شرح فاکتور').fill(options.description);
  await page.getByLabel('شرح ردیف ۱').fill(options.description);
  await page.getByLabel('تعداد').fill('1');
  await pickOption(page, 'واحد');
  await page.getByLabel('مبلغ واحد').fill(options.unitPrice);

  await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
  await pickOption(page, 'تنخواه‌دار', { text: options.holder });

  await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
  // نشانهٔ ثبت، بسته شدن فرم است؛ پیام موفقیت روی صفحه می‌ماند.
  await expect(page.getByRole('button', { name: 'ثبت فاکتور' })).toHaveCount(0);
}

test.describe('فرم ریزهزینه', () => {
  test('ستون فصل دوطبقه، مبلغ زیر فصل خودش، و شرح ویرایش‌شدنی', async ({ page }) => {
    const holder = unique('کارپرداز ریزهزینه');
    const capitalTitle = unique('سند عمرانی ریزهزینه');

    await login(page, 'admin');

    await gotoSection(page, 'تنخواه‌داران');
    await page.getByRole('button', { name: 'افزودن تنخواه‌دار' }).first().click();
    const holderDialog = page.getByRole('dialog', { name: 'تنخواه‌دار جدید' });
    await holderDialog.getByLabel('نام و نام خانوادگی').fill(holder);
    await holderDialog.getByRole('button', { name: 'ثبت تنخواه‌دار' }).click();
    await expect(page.getByText('تنخواه‌دار ثبت شد.')).toBeVisible();

    // ───────────────── سند عمرانی ─────────────────
    await newDocument(page, capitalTitle);
    await addInvoice(page, {
      description: 'رنگ‌آمیزی کلاس',
      unitPrice: '3000000',
      chapter: 'تعمیرات',
      capital: true,
      holder,
    });
    await addInvoice(page, {
      description: 'میز و نیمکت',
      unitPrice: '5000000',
      chapter: 'تجهیزات',
      capital: true,
      holder,
    });

    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

    // فرمِ گروه دیگر اصلاً دکمه‌ای ندارد: همیشه خالی درمی‌آمد.
    await expect(page.getByRole('button', { name: 'ریزهزینه جاری' })).toHaveCount(0);

    await page.getByRole('button', { name: 'ریزهزینه عمرانی' }).click();
    const capital = page.locator('table').first();
    await expect(capital).toBeVisible();

    /*
      سرستون دوطبقه: عنوان فصل بالا، کدش پایین.

      ستون‌ها از اطلاعات پایه می‌آیند، پس ادعا دربارهٔ **وجود** تعمیرات و کدش است
      و نه دربارهٔ تعداد ستون‌ها؛ فصل‌ها داده مرجع‌اند و کاربر عوضشان می‌کند.
    */
    const topRow = capital.locator('thead tr').first();
    const bottomRow = capital.locator('thead tr').nth(1);
    await expect(topRow.getByText('تعمیرات', { exact: true })).toBeVisible();
    await expect(bottomRow.getByText('فصل ۱', { exact: true })).toBeVisible();

    const headers = await topRow.locator('th').allTextContents();
    const repairIndex = headers.indexOf('تعمیرات');
    const equipmentIndex = headers.indexOf('تجهیزات');
    expect(repairIndex).toBeGreaterThan(0);
    expect(equipmentIndex).toBeGreaterThan(0);

    /*
      مبلغ فقط زیر فصلِ خودش.

      خانهٔ فصلِ دیگر **خالی** است و نه صفر: در یک فرم مالی، نبودنِ عدد با صفر
      بودنش یکی نیست.
    */
    const paintRow = capital.locator('tbody tr').filter({ hasText: 'رنگ‌آمیزی کلاس' });
    expect(amount(await paintRow.locator('td').nth(repairIndex).innerText())).toBe('3300000');
    expect(amount(await paintRow.locator('td').nth(equipmentIndex).innerText())).toBe('');

    // ستون تیکِ ذی‌نفع فقط در فرم جاری است.
    expect(headers.join('|')).not.toContain('ذی‌نفع');

    // ───────────────── شرح ردیف ─────────────────
    await paintRow.getByRole('button', { name: 'شرح' }).click();
    const lineDialog = page.getByRole('dialog', { name: 'شرح ردیف در فرم ریزهزینه' });
    await lineDialog.getByLabel('یا متن دلخواه').fill('تعمیر رنگ و نقاشی');
    await lineDialog.getByRole('button', { name: 'ثبت شرح' }).click();
    await expect(lineDialog).toHaveCount(0);

    await expect(capital.getByText('تعمیر رنگ و نقاشی')).toBeVisible();
    await expect(capital.getByText('رنگ‌آمیزی کلاس')).toHaveCount(0);

    /*
      شرح خودِ فاکتور دست‌نخورده می‌ماند.

      همین است که این ستون را از «ویرایش سند» جدا می‌کند: سندِ ثبت‌شده همان چیزی
      می‌ماند که در بازبینی به آن استناد می‌شود.
    */
    await page.getByRole('button', { name: 'بازگشت به سند' }).click();
    await expect(page.getByText('رنگ‌آمیزی کلاس').first()).toBeVisible();

    // ───────────────── سند جاری ─────────────────
    await newDocument(page, unique('سند جاری ریزهزینه'));
    await addInvoice(page, {
      description: 'کاغذ و لوازم',
      unitPrice: '1200000',
      chapter: 'مواد مصرفی',
      holder,
    });
    await page.getByRole('button', { name: 'ثبت نهایی' }).click();
    await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'ریزهزینه جاری' }).click();
    const current = page.locator('table').first();
    await expect(current).toBeVisible();
    await expect(current.getByText('کاغذ و لوازم')).toBeVisible();

    const currentHeaders = await current
      .locator('thead tr')
      .first()
      .locator('th')
      .allTextContents();
    expect(currentHeaders.join('|')).toContain('پرداخت به');
    // خانهٔ تیکِ قبلی برنگردد: واژه جایش را گرفته است.
    expect(currentHeaders.join('|')).not.toContain('پرداخت ذی‌نفع');

    /*
      مقصد پرداخت، با واژه.

      پیش از این یک خانهٔ تیک بود و همین ردیف — که از تنخواهِ کارپرداز پرداخت
      شده — خانه‌اش **خالی** می‌ماند؛ یعنی فرم دربارهٔ مقصد پول چیزی نمی‌گفت و
      خواننده نمی‌دانست خالی بودنش «کارپرداز» است یا «قبض» یا «هنوز معلوم نیست».
    */
    const payeeIndex = currentHeaders.indexOf('پرداخت به');
    const paperRow = current.locator('tbody tr').filter({ hasText: 'کاغذ و لوازم' });
    expect((await paperRow.locator('td').nth(payeeIndex).innerText()).trim()).toBe('کارپرداز');

    /*
      تاریخ صورت‌حساب: روی صفحه هست، روی کاغذ نه.

      فرم شکل قانونیِ ثابتی دارد و ستون تازه در آن جا ندارد؛ ولی کسی که فرم را
      روی صفحه بررسی می‌کند باید بفهمد هر ردیف کدام فاکتور است. نشانِ `no-print`
      همان چیزی است که این ستون را از چاپِ مرورگر بیرون می‌برد (خروجی HTML و PDF
      سرور هم چیدمان جداگانهٔ خودشان را دارند و ستون در آن‌ها ساخته نمی‌شود).
    */
    const dateIndex = currentHeaders.indexOf('تاریخ صورت حساب');
    expect(dateIndex).toBeGreaterThan(0);
    expect(toAsciiDigits(await paperRow.locator('td').nth(dateIndex).innerText()).trim()).toBe(
      '1405/07/12',
    );
    await expect(
      current.locator('thead tr').first().locator('th').nth(dateIndex),
    ).toHaveClass(/no-print/);

    /*
      کد فصل، **کد** است و نه مبلغ.

      پس همان‌طور که در اطلاعات پایه ثبت شده چاپ می‌شود: نه جداکنندهٔ هزارگان
      می‌گیرد و نه به ارقام فارسی برمی‌گردد — وگرنه روی فرم مالی شبیه یک عدد
      می‌شد که کسی باید جمعش کند.
    */
    await expect(
      current.locator('thead tr').nth(1).getByText('2213000', { exact: true }),
    ).toBeVisible();

    // امضای «مسئول امور اداری و رفاه» فقط پای فرم جاری است.
    await expect(page.getByText('مسئول امور اداری و رفاه')).toBeVisible();
  });
});
