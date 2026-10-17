import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { gotoSection, login } from './helpers';

/**
 * دسترس‌پذیری با **ابزار**، نه با چشم.
 *
 * axe-core قواعد WCAG 2.1 سطح A و AA را روی صفحه واقعی اجرا می‌کند. تخطی‌ها اینجا
 * «هشدار» نیستند؛ آزمون را رد می‌کنند. اگر موردی آگاهانه پذیرفته شود، باید با دلیل
 * در همین فایل کنار گذاشته شود تا پنهان نماند.
 */
/**
 * صبر تا پایان همه انیمیشن‌ها.
 *
 * بدون این، axe ممکن است وسط انیمیشن ورودی صفحه اندازه بگیرد؛ در آن لحظه متن
 * شفافیت کامل ندارد و رنگش با زمینه ترکیب شده، پس کنتراست **گذرا** زیر حد گزارش
 * می‌شود. آن یک حالت ماندگار نیست و رفعش با تیره‌تر کردن رنگ، پاک کردن صورت مسئله
 * است. چیزی که باید سنجیده شود، رنگ نهایی صفحه است.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => {
      if (animation.playState !== 'running') return true;
      // انیمیشن بی‌پایان (درخشش اسکلت بارگذاری) هرگز تمام نمی‌شود؛ انتظار برایش
      // یعنی قفل شدن آزمون. چنین انیمیشنی هم روی رنگ متن اثر ندارد.
      return animation.effect?.getComputedTiming().iterations === Infinity;
    }),
  );
}

async function violations(page: Page): Promise<unknown[]> {
  await settle(page);

  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  // گزارش شامل **انتخابگر عنصر** است، نه فقط شماره قاعده؛ بدون آن، خطا قابل رفع نیست.
  return result.violations.map((violation) => ({
    id: violation.id,
    help: violation.help,
    nodes: violation.nodes.length,
    where: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5),
    why: violation.nodes[0]?.failureSummary?.split(String.fromCharCode(10)).slice(0, 3).join(' | '),
  }));
}

test.describe('دسترس‌پذیری', () => {
  test('صفحه ورود', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ورود' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('فهرست اسناد', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'اسناد');
    await expect(page.getByRole('table')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('گزارش‌گیری', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'گزارش‌گیری');
    expect(await violations(page)).toEqual([]);
  });

  test('داشبورد', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'داشبورد');
    expect(await violations(page)).toEqual([]);
  });

  /**
   * پیمایش با صفحه‌کلید: فرم ورود باید بدون ماوس کامل قابل استفاده باشد و حلقه
   * فوکوس دیده شود. این چیزی است که axe نمی‌سنجد.
   */
  test('ورود فقط با صفحه‌کلید', async ({ page }) => {
    await page.goto('/');
    // اولین فیلد خودش فوکوس می‌گیرد (autoFocus).
    await expect(page.getByLabel('نام کاربری')).toBeFocused();

    await page.keyboard.type('admin');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('رمز عبور')).toBeFocused();

    await page.keyboard.type(process.env.SEED_ADMIN_PASSWORD ?? 'Admin!2345');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'ورود' })).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('navigation', { name: 'بخش‌های سامانه' })).toBeVisible();
  });
});

/**
 * تم تاریک، نسخه دوم همین صفحه‌ها نیست؛ توکن‌های رنگش جداگانه تعریف شده‌اند و
 * کنتراستش هم باید جداگانه سنجیده شود.
 */
test.describe('دسترس‌پذیری تم تاریک', () => {
  test.use({ colorScheme: 'dark' });

  test('فهرست اسناد در تم تاریک', async ({ page }) => {
    await login(page, 'admin');
    await gotoSection(page, 'اسناد');
    await expect(page.getByRole('table')).toBeVisible();
    // تم «مطابق سیستم» است، پس سیستمِ تاریک یعنی صفحه تاریک.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await violations(page)).toEqual([]);
  });
});

/**
 * تنظیمات ظاهر در سربرگ.
 *
 * این آزمون سه چیز را با هم می‌سنجد که هر کدام جداگانه ممکن است درست به‌نظر برسند:
 * منو با صفحه‌کلید قابل استفاده است، انتخاب تم **اثر واقعی** روی ریشه سند می‌گذارد،
 * و انتخاب پس از بارگذاری دوباره صفحه باقی می‌ماند.
 */
test.describe('تنظیمات ظاهر', () => {
  test('تم تاریک انتخاب و ماندگار می‌شود', async ({ page }) => {
    await login(page, 'admin');

    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: /تاریک/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // و برگرداندنش هم کار می‌کند — وگرنه کاربر در تمی گیر می‌افتد که نمی‌خواهد.
    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: /روشن/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('منوی ظاهر با Escape بسته می‌شود و فوکوس برمی‌گردد', async ({ page }) => {
    await login(page, 'admin');

    const trigger = page.getByRole('button', { name: 'تنظیمات ظاهر' });
    await trigger.click();
    await expect(page.getByRole('menu', { name: 'تنظیمات ظاهر' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'تنظیمات ظاهر' })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
