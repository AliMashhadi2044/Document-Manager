import { expect, test, type Locator, type Page } from '@playwright/test';

import { gotoSection, login } from './helpers';

/**
 * ورودی پلاک به شکل پلاک ایران.
 *
 * ادعای این آزمون سه چیز است: چهار خانهٔ پلاک جدا از هم‌اند و با پر شدن، فوکوس خودش
 * جلو می‌رود؛ متن ذخیره‌شده همان قالب استاندارد است؛ و هنگام اصلاح، همان متن دوباره
 * به چهار خانه برمی‌گردد (نه یک جعبهٔ متن).
 */

type Parts = { left: string; letter: string; right: string; iran: string };

/** صفحهٔ خودروها هم یک فیلتر «نوع خودرو» دارد؛ انتخاب باید درون گفت‌وگو باشد. */
async function pickVehicleType(page: Page, scope: Locator): Promise<void> {
  await scope.getByRole('combobox').first().click();
  await page.getByRole('option').first().click();
}

/** پر کردن پلاک همان‌طور که کاربر می‌کند: فقط رقم‌ها تایپ می‌شوند، حرف از فهرست. */
async function fillPlate(page: Page, scope: Locator, parts: Parts): Promise<void> {
  await scope.getByLabel('دو رقم اول پلاک').fill(parts.left);

  // با پر شدن دو رقم، نوبت حرف است — بدون فشردن Tab.
  await expect(scope.getByRole('button', { name: 'حرف پلاک' })).toBeFocused();
  await scope.getByRole('button', { name: 'حرف پلاک' }).click();
  await page.getByRole('listbox', { name: 'سری پلاک' }).getByText(parts.letter, { exact: true }).click();

  await expect(scope.getByLabel('سه رقم پلاک')).toBeFocused();
  await scope.getByLabel('سه رقم پلاک').fill(parts.right);

  await expect(scope.getByLabel('کد شهرستان پلاک')).toBeFocused();
  await scope.getByLabel('کد شهرستان پلاک').fill(parts.iran);
}

test.describe('پلاک خودرو', () => {
  test('در قالب پلاک ایران گرفته و در همان قالب باز می‌شود', async ({ page }) => {
    // پلاکی که در هیچ اجرای دیگری تکرار نشود؛ یکتایی روی صورت نرمال‌شده است.
    const stamp = String(Date.now()).slice(-5);
    const parts: Parts = {
      left: stamp.slice(0, 2),
      letter: 'ب',
      right: stamp.slice(2, 5),
      iran: '11',
    };

    await login(page, 'admin');
    await gotoSection(page, 'خودروها');

    await page.getByRole('button', { name: 'افزودن خودرو' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'خودروی جدید' });

    await pickVehicleType(page, dialog);
    await fillPlate(page, dialog, parts);

    // ارقام فارسی دیده می‌شوند، هرچند ورودی لاتین بود.
    await expect(dialog.getByLabel('سه رقم پلاک')).toHaveValue(
      parts.right.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!),
    );

    await dialog.getByRole('button', { name: 'ثبت خودرو' }).click();
    await expect(page.getByText('خودرو ثبت شد.')).toBeVisible();

    // ───── در فهرست، پلاک به شکل پلاک دیده می‌شود ─────
    const badge = page.locator(`[title="${parts.left} ${parts.letter} ${parts.right} ایران ${parts.iran}"]`);
    await expect(badge.first()).toBeVisible();

    // ───── اصلاح: همان چهار خانه، پر ─────
    await page.getByRole('button', { name: `اصلاح پلاک ${parts.left} ${parts.letter} ${parts.right} ایران ${parts.iran}` }).click();
    const edit = page.getByRole('dialog', { name: 'اصلاح خودرو' });
    await expect(edit.getByLabel('دو رقم اول پلاک')).toHaveValue(
      parts.left.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!),
    );
    await expect(edit.getByRole('button', { name: 'حرف پلاک' })).toHaveText(parts.letter);
  });

  test('پلاک ناقص ثبت نمی‌شود', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'خودروها');

    await page.getByRole('button', { name: 'افزودن خودرو' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'خودروی جدید' });

    await pickVehicleType(page, dialog);
    await dialog.getByLabel('دو رقم اول پلاک').fill('44');

    // سه بخش دیگر خالی است: نه دکمهٔ ثبت فعال می‌شود، نه کاربر بی‌خبر می‌ماند.
    await expect(dialog.getByText('پلاک کامل نیست')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'ثبت خودرو' })).toBeDisabled();
  });
});
