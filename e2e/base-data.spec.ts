import { expect, test } from '@playwright/test';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * مدیریت اطلاعات پایه از راه رابط: مجموعه خریدار و فصل بودجه.
 *
 * هر آزمون چیزی را که می‌سازد، پاک می‌کند. پایگاه داده بین آزمون‌ها مشترک است و
 * ردیف جامانده، شمارش‌های آزمون بعدی را می‌لرزاند.
 */

test.describe('مجموعه‌های خریدار', () => {
  test('ساخت، پیش‌فرض کردن، پر شدن خودکار در فرم سند و حذف', async ({ page }) => {
    const name = unique('مجموعه آزمون');

    await login(page, 'admin');
    await gotoSection(page, 'مجموعه‌های خریدار');

    // ───── ساخت ─────
    await page.getByRole('button', { name: 'افزودن مجموعه' }).click();
    await page.getByLabel('نام / عنوان').fill(name);
    await page.getByRole('button', { name: 'ثبت مجموعه' }).click();
    await expect(page.getByText('مجموعه خریدار ثبت شد.')).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();

    // ───── پیش‌فرض کردن ─────
    await row.getByRole('button', { name: /پیش‌فرض فرم ایجاد سند شود$/ }).click();
    await expect(page.getByText('مجموعه پیش‌فرض تغییر کرد.')).toBeVisible();
    await expect(row.getByText('پیش‌فرض')).toBeVisible();

    /*
     * اثر واقعی: فرم ایجاد سند باید همین مجموعه را از پیش انتخاب کرده باشد.
     *
     * بدون این بررسی، «پیش‌فرض» فقط یک نشان در جدول است و ادعای اصلی — که کاربر
     * دیگر هر بار انتخاب تکراری نمی‌کند — آزموده نشده می‌ماند.
     */
    await gotoSection(page, 'اسناد');
    await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();
    await expect(
      page.getByRole('combobox', { name: 'مجموعه خریدار', exact: true }),
    ).toContainText(name);

    // ───── حذف ─────
    await gotoSection(page, 'مجموعه‌های خریدار');
    const again = page.getByRole('row').filter({ hasText: name });
    page.once('dialog', (dialog) => void dialog.accept());
    await again.getByRole('button', { name: /^حذف مجموعه / }).click();
    await expect(page.getByText('مجموعه حذف شد.')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);
  });
});

test.describe('فصل‌های بودجه', () => {
  test('ساخت فصل، اتصال نوع فاکتور، حذف اتصال و حذف فصل', async ({ page }) => {
    const title = unique('فصل آزمون');

    await login(page, 'admin');
    await gotoSection(page, 'فصل‌ها و انواع فاکتور');

    // ───── ساخت فصل در گروه اول ─────
    await page.getByRole('button', { name: 'فصل جدید' }).first().click();
    await page.getByLabel('عنوان فصل').fill(title);
    await page.getByRole('button', { name: 'ساخت فصل' }).click();
    await expect(page.getByText('فصل ساخته شد.')).toBeVisible();

    const item = page.getByRole('listitem').filter({ hasText: title });
    await expect(item).toBeVisible();

    /** کنش‌های هر فصل پشت یک منوی «سه نقطه» اند، نه چند دکمه در ردیف. */
    const openMenu = async (): Promise<void> => {
      await page
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByRole('button', { name: `کنش‌های ${title}` })
        .click();
      await expect(page.getByRole('menu', { name: `کنش‌های ${title}` })).toBeVisible();
    };
    // فصل تازه هیچ نوع فاکتوری ندارد و رابط باید همین را صریح بگوید.
    await expect(item.getByText('هیچ نوع فاکتوری متصل نیست')).toBeVisible();

    // ───── اتصال نوع فاکتور ─────
    await openMenu();
    await page.getByRole('menuitem', { name: 'اتصال نوع فاکتور' }).click();

    /*
     * فهرست انتخاب درون گفت‌وگوی پوشا باید **کنار دکمهٔ خودش** باز شود.
     *
     * انیمیشن ورود گفت‌وگو یک transform باقی می‌گذارد و عنصر ترانسفورم‌شده، ظرفِ
     * فرزندان `fixed` خود می‌شود؛ نتیجه‌اش یک‌بار فهرستی بود که چند صد پیکسل آن‌طرف‌تر
     * باز می‌شد. این بررسی همان حالت را می‌گیرد.
     */
    const typeBox = page.getByRole('combobox', { name: 'نوع فاکتور', exact: true });
    await typeBox.click();
    const list = page.getByRole('listbox', { name: 'نوع فاکتور' });
    await expect(list).toBeVisible();

    const anchor = await typeBox.boundingBox();
    const popover = await list.boundingBox();
    expect(anchor && popover).toBeTruthy();
    expect(Math.abs((popover?.x ?? 0) - (anchor?.x ?? 0)), 'فهرست کنار دکمه‌اش باز نشد').toBeLessThan(
      40,
    );
    expect((popover?.y ?? 0) - (anchor?.y ?? 0), 'فهرست زیر دکمه‌اش باز نشد').toBeGreaterThan(0);

    /*
     * و باید از کادر **بیرون بزند**، نه اینکه داخل گفت‌وگو اسکرول بسازد: فهرست
     * `fixed` است و در جریان چیدمان گفت‌وگو نمی‌نشیند.
     */
    const overflow = await page.evaluate(() => {
      const element = document.querySelector('dialog[open]');
      if (!element) return null;
      return { scroll: element.scrollHeight, client: element.clientHeight };
    });
    expect(overflow, 'گفت‌وگوی باز پیدا نشد').toBeTruthy();
    expect(
      (overflow?.scroll ?? 0) - (overflow?.client ?? 0),
      'باز شدن فهرست، داخل گفت‌وگو اسکرول ساخت',
    ).toBeLessThanOrEqual(1);

    await list.getByRole('option').first().click();
    await page.getByRole('button', { name: 'اتصال', exact: true }).click();
    await expect(page.getByText('نوع فاکتور به فصل متصل شد.')).toBeVisible();

    const linked = page.getByRole('listitem').filter({ hasText: title });
    await expect(linked.getByText('هیچ نوع فاکتوری متصل نیست')).toHaveCount(0);

    // ───── حذف اتصال ─────
    await linked.getByRole('button', { name: /^حذف اتصال / }).first().click();
    await expect(page.getByText('اتصال حذف شد.')).toBeVisible();

    // ───── حذف فصل ─────
    await openMenu();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('menuitem', { name: 'حذف فصل' }).click();
    await expect(page.getByText('فصل حذف شد.')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);
  });
});

test.describe('فیلتر سال داشبورد', () => {
  test('تغییر مبنا به سال شمسی، فهرست سال‌ها و عنوان روند را عوض می‌کند', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'داشبورد');

    // پیش‌فرض: مبنای سال مالی، و تازه‌ترین سال — نه «همه سال‌ها».
    const basis = page.getByRole('combobox', { name: 'بر اساس', exact: true });
    await expect(basis).toContainText('سال مالی');
    await expect(page.getByRole('combobox', { name: 'سال مالی', exact: true })).not.toContainText(
      'همه سال‌ها',
    );

    await pickOption(page, 'بر اساس', { text: 'سال شمسی' });

    // فیلتر سال، برچسبش را عوض می‌کند و داشبورد هم همان مبنا را گزارش می‌دهد.
    await expect(page.getByRole('combobox', { name: 'سال شمسی', exact: true })).toBeVisible();
    await expect(page.getByText('روند ماهانه فاکتورها').locator('..')).toContainText('سال شمسی');
  });

  /**
   * نمودار روند و ردیف برچسب‌هایش باید **هم‌جهت** باشند.
   *
   * باگی که این آزمون را لازم کرد: ردیف برچسب‌ها یک `flex` راست‌به‌چپ است و اولین
   * ماه را سمت راست می‌گذارد، ولی SVG مختصاتش فیزیکی است و همان ماه را سمت چپ
   * می‌کشید. نتیجه این بود که هاور روی نقطهٔ یک ماه، عدد را زیر برچسب ماه دیگری
   * می‌نشاند و قلهٔ روند با قلهٔ نمودار میله‌ای یکی نبود.
   */
  test('نقطهٔ روند، بالای برچسب خودش است', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'داشبورد');

    const trend = page.getByText('روند پیوسته همان داده').locator('..');
    const labels = trend.locator('span').filter({ hasText: /^[^\d]+$/ });
    const first = trend.getByRole('img', { name: 'روند مبلغ ماهانه' });
    await expect(first).toBeVisible();

    // نقطه‌ها عنصر HTML اند (و نه `circle`)، چون SVG کشیده می‌شود و دایره بیضی می‌شد.
    const dots = trend.locator('span[aria-hidden="true"].absolute');
    const dotCount = await dots.count();
    expect(dotCount).toBeGreaterThan(1);

    const dot = dots.first();
    const dotBox = await dot.boundingBox();
    await dot.hover();

    // برچسبی که با هاور عوض می‌شود، باید **همان‌جایی** باشد که نقطه است.
    const changed = trend.locator('span.font-medium').first();
    await expect(changed).toBeVisible();
    const labelBox = await changed.boundingBox();

    expect(dotBox && labelBox).toBeTruthy();
    const dotCenter = (dotBox?.x ?? 0) + (dotBox?.width ?? 0) / 2;
    const labelCenter = (labelBox?.x ?? 0) + (labelBox?.width ?? 0) / 2;
    expect(
      Math.abs(dotCenter - labelCenter),
      'نقطهٔ روند و برچسبی که روشن می‌شود، در یک جا نیستند',
    ).toBeLessThan(40);

    await expect(labels.first()).toBeVisible();
  });
});

test.describe('ترتیب اطلاعات پایه', () => {
  test('جابه‌جایی با صفحه‌کلید، ذخیره می‌شود و پس از بارگذاری دوباره می‌ماند', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'اطلاعات پایه');

    const titles = page.getByRole('row').locator('td:nth-child(2)');
    await expect(titles.first()).toBeVisible();

    const before = await titles.allInnerTexts();
    expect(before.length, 'این منبع برای آزمون ترتیب، کم‌ردیف است').toBeGreaterThan(1);

    // آخرین ردیف یک پله بالا می‌رود.
    const lastIndex = before.length - 1;
    await page.getByRole('button', { name: new RegExp(`^جابه‌جایی ردیف`) }).nth(lastIndex).click();
    await page.keyboard.press('ArrowUp');

    const expected = [...before];
    const moved = expected.splice(lastIndex, 1)[0] as string;
    expected.splice(lastIndex - 1, 0, moved);

    await expect(titles).toHaveText(expected);

    /*
     * بارگذاری دوباره، تفاوت «ترتیب در مرورگر عوض شد» و «ترتیب ذخیره شد» را
     * روشن می‌کند — بدون آن، یک به‌روزرسانی خوشبینانه هم آزمون را سبز می‌کرد.
     */
    await page.reload();
    await expect(page.getByRole('row').locator('td:nth-child(2)')).toHaveText(expected);
  });

  test('کشیدن با ماوس هم همان ترتیب را ذخیره می‌کند', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'اطلاعات پایه');

    const titles = page.getByRole('row').locator('td:nth-child(2)');
    // صبر برای **داده**، نه اسکلت بارگذاری: بدون این، فهرست ردیف‌ها در یک اجرای
    // کندتر نیمه‌ساخته خوانده می‌شد و شمارش با دستگیره‌ها نمی‌خواند.
    await expect(titles.first()).toBeVisible();

    const before = await titles.allInnerTexts();
    expect(before.length).toBeGreaterThan(1);

    // دستگیره ردیف اول، تا میانه ردیف آخر کشیده می‌شود.
    const handles = page.getByRole('button', { name: /^جابه‌جایی ردیف/ });
    await expect(handles).toHaveCount(before.length);
    const from = await handles.first().boundingBox();
    const to = await handles.nth(before.length - 1).boundingBox();
    expect(from && to).toBeTruthy();

    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    // یک گام میانی لازم است: بدون حرکت، مقصدی ثبت نمی‌شود.
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 });
    await page.mouse.up();

    const expected = [...before.slice(1), before[0] as string];
    await expect(titles).toHaveText(expected);

    await page.reload();
    await expect(page.getByRole('row').locator('td:nth-child(2)')).toHaveText(expected);
  });
});
