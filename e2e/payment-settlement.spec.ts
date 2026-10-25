import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { gotoSection, login, logout, pickOption, toAsciiDigits, unique } from './helpers';

/**
 * وضعیت پرداخت سند — کار نقش بایگانی، و آنچه از آن به بقیه می‌رسد.
 *
 * پنج ادعا، همه با اندازه‌گیری:
 *
 *  ۱. بایگان «نیازمندی» را با دو مبلغ ثبت می‌کند، و نوشتن یکی دیگری را کامل می‌کند.
 *  ۲. نشان وضعیت، **فوریت** را هم می‌گوید (مهلت ده‌روزه).
 *  ۳. داشبورد همان سند را می‌شمارد و مبلغ باقی‌مانده را **دقیقاً** اضافه می‌کند.
 *  ۴. هر کاشی داشبورد علامت راهنما دارد و دامنه‌اش را می‌گوید.
 *  ۵. کارپردازی اعلانش را در **دستهٔ جدا** می‌بیند و اعلان‌های گردش سند آنجا نیستند.
 */

/** همهٔ مبالغ یک متن فارسی ⇒ `bigint`؛ جداکنندهٔ هزارگان اول حذف می‌شود. */
function moneyNumbers(text: string): bigint[] {
  const normalized = toAsciiDigits(text).replace(/[٬,]/gu, '');
  return (normalized.match(/\d+/gu) ?? []).map((value) => BigInt(value));
}

/**
 * کاشی داشبورد: عدد بزرگ و مبلغِ زیرنویسش، **جدا از هم**.
 *
 * دو نکته که هر دو یک‌بار آزمون را گمراه کردند:
 *
 *  ۱. لنگرگاه، دکمهٔ راهنمای خودِ کاشی است و نه متنِ عنوان: عنوان‌ها در این صفحه
 *     تکرار می‌شوند (کاشی، کلید فیلتر، کارت پیگیری).
 *  ۲. عدد و زیرنویس **جدا** خوانده می‌شوند. با خواندن یک‌جا، «۰» و «۵۶٬۰۰۰٬۰۰۰»
 *     به هم می‌چسبیدند و یک عدد واحد می‌شدند.
 */
async function tileNumbers(
  page: Page,
  title: string,
): Promise<{ count: bigint; money: bigint }> {
  const tile = page
    .getByRole('button', { name: `راهنمای ${title}`, exact: true })
    // از دکمهٔ راهنما تا بدنهٔ کاشی: عنوان، عدد و زیرنویس، همه در همین جعبه‌اند.
    .locator('xpath=ancestor::div[contains(@class,"flex-1")][1]');
  await expect(tile).toBeVisible();

  const paragraphs = tile.locator('p');
  const count = moneyNumbers((await paragraphs.nth(1).textContent()) ?? '');
  const money = moneyNumbers((await paragraphs.nth(2).textContent()) ?? '');

  return { count: count[0] ?? 0n, money: money[0] ?? 0n };
}

/** سندی ثبت‌نهایی‌شده و ارجاع‌شده به بایگانی، با یک فاکتور. */
async function documentInArchive(page: Page, title: string): Promise<void> {
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
  await page.getByLabel('شرح ردیف ۱').fill('ملزومات اداری');
  await page.getByLabel('تعداد').fill('1');
  await pickOption(page, 'واحد');
  await page.getByLabel('مبلغ واحد').fill('2000000');
  await pickOption(page, 'روش پرداخت', { text: 'تنخواه' });
  await page.getByRole('button', { name: 'ثبت فاکتور' }).click();
  await expect(page.getByText('فاکتور ثبت شد.')).toBeVisible();

  await page.getByRole('button', { name: 'ثبت نهایی' }).click();
  await expect(page.getByText('سند با موفقیت ثبت شد', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'ارجاع به بایگانی' }).click();
  await expect(page.getByText('به بایگانی ارجاع شد', { exact: false })).toBeVisible();
}

/**
 * خلاصهٔ وضعیت پرداخت، **از خود سرور**.
 *
 * درستی این اعداد کار سرور است، پس همان‌جا سنجیده می‌شود. خواندنشان از رابط،
 * آزمون را به زمان‌بندی کش و انیمیشن گره می‌زد بی‌آنکه چیز بیشتری ثابت کند؛ آنچه
 * از رابط می‌خواهیم جداگانه و صریح سنجیده می‌شود: کاشی هست و راهنما دارد.
 */
async function settlementSummary(
  page: Page,
  request: APIRequestContext,
): Promise<{ count: bigint; remaining: bigint }> {
  const cookies = await page.context().cookies();
  const response = await request.get('/api/v1/analytics/dashboard', {
    headers: { cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') },
  });
  expect(response.status(), 'خواندن داشبورد ناموفق بود').toBe(200);

  const body = await response.json();
  const outstanding = body.settlementSummary.outstanding;
  return { count: BigInt(outstanding.count), remaining: BigInt(outstanding.remaining) };
}

test.describe('وضعیت پرداخت سند', () => {
  test('نیازمندی ثبت می‌شود، در داشبورد شمرده می‌شود و کارپردازی خبر می‌شود', async ({
    page,
    request,
  }) => {
    const title = unique('سند نیازمندی');

    // ───── کارپردازی سند را می‌سازد و به بایگانی می‌دهد ─────
    await login(page, 'procurement');
    await documentInArchive(page, title);
    await logout(page);

    // ───── بایگان: داشبورد پیش از ثبت ─────
    await login(page, 'archivist');
    const before = await settlementSummary(page, request);

    // ───── ثبت وضعیت پرداخت ─────
    await gotoSection(page, 'بایگانی');
    await page.getByLabel('جست‌وجو').fill(title);
    await page.getByRole('button', { name: title }).click();

    const panel = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'وضعیت پرداخت' }) });
    await expect(panel).toBeVisible();

    // رادیوی کلید چندحالته sr-only است و کاربر روی برچسب کلیک می‌کند؛ آزمون هم.
    await panel.locator('label').filter({ hasText: 'نیازمندی' }).first().click();
    await expect(panel.getByRole('radio', { name: /نیازمندی/ })).toBeChecked();

    /*
      نوشتن یک مبلغ، دیگری را کامل می‌کند.

      مبلغ باقی‌مانده را از خودِ فیلد می‌خوانیم و در آزمون ننوشته‌ایم: نرخ مالیات
      یک دادهٔ پایه است و می‌تواند عوض شود؛ عددِ سفت‌شده روز تغییر نرخ می‌شکست
      بی‌آنکه چیزی خراب شده باشد.
    */
    await panel.getByLabel('مبلغ پرداخت‌شده').fill('1000000');
    const remaining = BigInt(await panel.getByLabel('مبلغ نیازمندی').inputValue());
    expect(remaining, 'مبلغ نیازمندی خودکار پر نشد').toBeGreaterThan(0n);

    await panel.getByRole('button', { name: 'ثبت وضعیت پرداخت' }).click();
    await expect(page.getByText('وضعیت پرداخت ثبت شد.')).toBeVisible();

    // نشان وضعیت، فوریت را هم می‌گوید — نیازمندیِ امروز، ده روز تا مهلت دارد.
    await expect(panel.getByText('روز تا مهلت')).toBeVisible();

    // ───── داشبورد: یک سند بیشتر، و دقیقاً همان مبلغ باقی‌مانده ─────
    const after = await settlementSummary(page, request);
    expect(after.count, 'تعداد نیازمندی‌ها یکی زیاد نشد').toBe(before.count + 1n);
    expect(after.remaining, 'مبلغ باقی‌مانده درست جمع نشد').toBe(before.remaining + remaining);

    /*
      و روی داشبورد: کاشی هست و عددی غیرصفر دارد.

      عددِ کاشی با عددِ بالا مقایسه نمی‌شود، چون دامنه‌شان یکی نیست: داشبورد
      پیش‌فرض روی تازه‌ترین سال است و آن خواندن روی همهٔ سال‌ها. برابر گرفتنشان،
      آزمونی می‌ساخت که با داده‌های چندساله به‌هم می‌ریخت بی‌آنکه چیزی خراب باشد.
    */
    await gotoSection(page, 'داشبورد');
    await expect
      .poll(async () => (await tileNumbers(page, 'نیازمندی')).count, {
        message: 'کاشی نیازمندی، سند تازه را نشان نمی‌دهد',
      })
      .toBeGreaterThan(0n);

    // ───── راهنما: کاشی باید بگوید چه چیزی را می‌شمارد ─────
    const help = page.getByRole('button', { name: 'راهنمای جمع کل' });
    await expect(help, 'کاشی «جمع کل» علامت راهنما ندارد').toBeVisible();
    await help.click();
    await expect(page.getByRole('tooltip')).toContainText('دامنه:');

    await logout(page);

    // ───── کارپردازی: اعلان در دستهٔ «پیگیری پرداخت» ─────
    await login(page, 'procurement');
    await gotoSection(page, 'اعلان‌ها');

    const paymentTab = page.getByRole('button', { name: /پیگیری پرداخت/ });
    await expect(paymentTab).toBeVisible();
    await paymentTab.click();

    // عنوان در نشان سربرگ هم تکرار می‌شود؛ اینجا فهرست صفحه مقصود است.
    await expect(page.getByText(`نیازمندی پرداخت: «${title}»`).first()).toBeVisible();

    /*
      دستهٔ جدا یعنی **جدا**.

      همین سند چند دقیقه پیش اعلان «بایگانی» هم ساخته است، پس اگر فیلتر دسته کار
      نکند، این ادعا شکست می‌خورد.
    */
    await expect(page.getByText('ارجاع برای اصلاح')).toHaveCount(0);
    await expect(page.getByText('بایگانی نهایی')).toHaveCount(0);
  });

  test('پرداخت کامل، تاریخ پرداخت می‌سازد و نیازمندی را می‌بندد', async ({ page }) => {
    const title = unique('سند پرداخت کامل');

    await login(page, 'procurement');
    await documentInArchive(page, title);
    await logout(page);

    await login(page, 'archivist');
    await gotoSection(page, 'بایگانی');
    await page.getByLabel('جست‌وجو').fill(title);
    await page.getByRole('button', { name: title }).click();

    const panel = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'وضعیت پرداخت' }) });

    // «پرداخت کامل» هیچ مبلغی نمی‌پرسد: مبالغ مشتق‌اند.
    await panel.locator('label').filter({ hasText: 'پرداخت کامل' }).first().click();
    await expect(panel.getByLabel('مبلغ پرداخت‌شده')).toHaveCount(0);

    await panel.getByRole('button', { name: 'ثبت وضعیت پرداخت' }).click();
    await expect(page.getByText('وضعیت پرداخت ثبت شد.')).toBeVisible();

    /*
      تاریخ پرداخت ورودی نیست؛ همان لحظهٔ ثبت است.

      پس وجودش — و نه مقدارش — همان چیزی است که باید سنجیده شود: فیلدی برای وارد
      کردنش در کار نیست.
    */
    await expect(panel.getByText('تاریخ پرداخت:')).toBeVisible();
  });
});
