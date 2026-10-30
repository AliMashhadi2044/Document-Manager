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
 * کنترل انتخاب، در حالت باز.
 *
 * بازرسی axe روی صفحهٔ بسته، درخت فهرست بازشده را **نمی‌بیند** — و دقیقاً همانجاست
 * که نقش‌های ARIA خراب می‌شوند: `listbox` که فرزند غیرمجاز دارد، یا دکمه‌ای درون
 * `option`. این آزمون هر دو حالت را می‌سنجد: انتخاب و مدیریت ترتیب.
 */
test.describe('کنترل انتخاب', () => {
  const FIELD = 'وضعیت';

  /** باز کردن فیلتر وضعیت در کارتابل بایگانی — سه گزینه ثابت و مستقل از داده. */
  async function openFilter(page: Page): Promise<void> {
    await gotoSection(page, 'بایگانی');
    await page.getByRole('combobox', { name: FIELD, exact: true }).click();
    await expect(page.getByRole('listbox', { name: FIELD })).toBeVisible();
  }

  test('فهرست باز، در هر دو حالت، تخطی ندارد', async ({ page }) => {
    await login(page, 'admin');
    await openFilter(page);
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'پین و ترتیب' }).click();
    await expect(page.getByRole('button', { name: /^پین کردن / }).first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  /**
   * پین کردن، واقعاً گزینه را بالا می‌برد و پس از بارگذاری دوباره می‌ماند.
   *
   * ادعای «ذخیره می‌شود» بدون بارگذاری دوباره، چیزی را ثابت نمی‌کند.
   */
  test('گزینه پین‌شده بالا می‌آید و ماندگار است', async ({ page }) => {
    await login(page, 'admin');
    await openFilter(page);

    /*
      از چیدمان تمیز شروع می‌کنیم.

      ترجیح‌ها دیگر در `localStorage` همان مرورگر نیستند، در پروفایل کاربر روی
      سرور می‌مانند؛ پس پینی که اجرای قبلی گذاشته، به این اجرا هم می‌رسد و
      ترتیب گزینه‌ها را عوض می‌کند.
    */
    const reset = page.getByRole('button', { name: 'بازنشانی' });
    if ((await reset.count()) > 0) {
      await reset.click();
      await expect(page.getByRole('group', { name: 'پین‌شده' })).toHaveCount(0);
    }

    // گزینه سوم انتخاب شده تا بالا آمدنش قابل تشخیص باشد (ردیف صفر «همه» است).
    const list = page.getByRole('listbox', { name: FIELD });
    const target = ((await list.getByRole('option').nth(3).textContent()) ?? '').trim();
    expect(target, 'فیلتر وضعیت گزینه کافی ندارد').toBeTruthy();

    await page.getByRole('button', { name: 'پین و ترتیب' }).click();
    await page.getByRole('button', { name: `پین کردن ${target}` }).click();
    await page.keyboard.press('Escape');

    await page.reload();
    await openFilter(page);

    // گروه «پین‌شده» باید همان گزینه را داشته باشد — بالاتر از بقیه.
    await expect(
      page.getByRole('group', { name: 'پین‌شده' }).getByRole('option'),
    ).toHaveText([target]);

    // و بازنشانی، همه چیز را به حال اول برمی‌گرداند — وگرنه کاربر در چیدمانی گیر می‌افتد.
    await page.getByRole('button', { name: 'بازنشانی' }).click();
    await expect(page.getByRole('group', { name: 'پین‌شده' })).toHaveCount(0);
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

  /**
   * رنگ اصلی غیرپیش‌فرض، در تم تاریک.
   *
   * هر رنگ اصلی مقدار جداگانه‌ای برای تم روشن و تاریک دارد و کنتراست همه‌شان جداگانه
   * حساب شده است. این آزمون یکی از رنگ‌های تازه را واقعاً روی صفحه می‌سنجد؛ محاسبه
   * درست ولی توکنِ اشتباه نوشته‌شده، فقط همین‌جا پیدا می‌شود.
   */
  test('رنگ اصلی کهربایی در تم تاریک', async ({ page }) => {
    await login(page, 'admin');

    /*
      رنگ از **منوی ظاهر** انتخاب می‌شود، نه با نوشتن در localStorage.

      ترجیح‌ها حالا در پروفایل کاربر روی سرور می‌مانند و مرورگر فقط نسخهٔ موقتی
      برای نخستین رنگ‌آمیزی نگه می‌دارد؛ نوشتن در آن نسخه، با رسیدن پاسخ سرور
      بی‌اثر می‌شد. در عوض انتخاب در پایان برگردانده می‌شود، وگرنه برای آزمون‌های
      بعدی هم کهربایی می‌ماند.
    */
    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('button', { name: 'کهربایی' }).click();
    await page.keyboard.press('Escape');

    await gotoSection(page, 'داشبورد');
    await expect(page.locator('html')).toHaveAttribute('data-primary', 'amber');
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('button', { name: 'نیلی' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-primary', 'amber');
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
    // `exact` لازم است: ردیف «مطابق سیستم» تمِ حل‌شده را هم کنارش می‌نویسد، پس
    // نام دسترس‌پذیرش وقتی سیستم تاریک است «مطابق سیستم تاریک» می‌شود.
    await page.getByRole('menuitemradio', { name: 'تاریک', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // و برگرداندنش هم کار می‌کند — وگرنه کاربر در تمی گیر می‌افتد که نمی‌خواهد.
    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: 'روشن', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    /*
      و در پایان، «مطابق سیستم».

      ترجیح حالا در پروفایل کاربر روی سرور می‌ماند، پس انتخابِ این آزمون به
      آزمون‌های بعدی هم می‌رسد — آزمون‌هایی که با `colorScheme: 'dark'` سیستم را
      تاریک می‌کنند و از سامانه انتظار دارند تابعش باشد.
    */
    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: /^مطابق سیستم/ }).click();
    await page.keyboard.press('Escape');
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

/**
 * رفتارهای پوسته که کاربر هر روز با آن‌ها روبه‌رو می‌شود.
 */
test.describe('پوسته برنامه', () => {
  test('تغییر تم از گذار دایره‌ای مرورگر استفاده می‌کند', async ({ page }) => {
    // پیش از بارگذاری برنامه، فراخوانی API گذار را علامت‌گذاری می‌کنیم.
    //
    // ادعای «انیمیشن قشنگ است» قابل آزمون نیست، ولی این قابل آزمون است: تغییر تم
    // باید از مسیر View Transitions برود، نه یک جایگزینی ناگهانی کلاس.
    await page.addInitScript(() => {
      const original = document.startViewTransition?.bind(document);
      if (!original) return;
      (window as unknown as { __viewTransitions: number }).__viewTransitions = 0;
      document.startViewTransition = ((callback: () => void) => {
        (window as unknown as { __viewTransitions: number }).__viewTransitions += 1;
        return original(callback);
      }) as typeof document.startViewTransition;
    });

    await login(page, 'admin');
    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: 'تاریک', exact: true }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const started = await page.evaluate(
      () => (window as unknown as { __viewTransitions: number }).__viewTransitions,
    );
    expect(started, 'تغییر تم بدون گذار انجام شد').toBeGreaterThan(0);

    // برگرداندن تم تا اجراهای بعدی از حالت تمیز شروع کنند — ترجیح در پروفایل
    // کاربر می‌ماند و «روشن» گذاشتنش، آزمون‌های تم تاریک را می‌شکست.
    await page.getByRole('button', { name: 'تنظیمات ظاهر' }).click();
    await page.getByRole('menuitemradio', { name: /^مطابق سیستم/ }).click();
    await page.keyboard.press('Escape');
  });

  test('آخرین بخش پس از بارگذاری دوباره باز می‌ماند', async ({ page }) => {
    await login(page, 'admin');

    await gotoSection(page, 'فروشندگان');
    await expect(page.getByRole('heading', { name: 'فروشندگان' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'فروشندگان' })).toBeVisible();

    // و برگشت به بخش پیش‌فرض هم باید ماندگار باشد، وگرنه کاربر در یک بخش گیر می‌کند.
    await gotoSection(page, 'اسناد');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'اسناد' })).toBeVisible();
  });
});
