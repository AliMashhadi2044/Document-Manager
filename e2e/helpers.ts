import { expect, type Page } from '@playwright/test';

/**
 * کاربران آزمون — همان‌هایی که `npm run db:seed:dev-users` می‌سازد.
 *
 * رمز عبور از متغیر محیطی می‌آید و مقدار پیش‌فرض فقط برای محیط توسعه و CI است؛
 * هیچ رمز واقعی در مخزن نیست و این کاربران در production ساخته نمی‌شوند
 * (اسکریپت seed در `NODE_ENV=production` متوقف می‌شود).
 */
export const USERS = {
  admin: { username: 'admin', password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin!2345' },
  procurement: { username: 'karpardaz', password: process.env.DEV_USER_PASSWORD ?? 'Dev!2345' },
  archivist: { username: 'bayegan', password: process.env.DEV_USER_PASSWORD ?? 'Dev!2345' },
  supervisor: { username: 'nazer', password: process.env.DEV_USER_PASSWORD ?? 'Dev!2345' },
} as const;

export type UserKey = keyof typeof USERS;

export async function login(page: Page, who: UserKey): Promise<void> {
  const user = USERS[who];
  await page.goto('/');
  await page.getByLabel('نام کاربری').fill(user.username);
  await page.getByLabel('رمز عبور').fill(user.password);
  await page.getByRole('button', { name: 'ورود' }).click();
  // نشانه ورود موفق: نوار بخش‌ها ظاهر شده است.
  await expect(page.getByRole('navigation', { name: 'بخش‌های سامانه' })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'خروج' }).click();
  await expect(page.getByRole('button', { name: 'ورود' })).toBeVisible();
}

export async function gotoSection(page: Page, titleFa: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'بخش‌های سامانه' })
    .getByRole('button', { name: titleFa, exact: true })
    .click();
}

/**
 * انتخاب یک گزینه از کنترل انتخاب.
 *
 * کنترل انتخاب دیگر `select` بومی نیست، پس `selectOption` روی آن کار نمی‌کند: باید
 * باز شود، در صورت نیاز جست‌وجو شود و گزینه از فهرست زده شود — همان کاری که کاربر می‌کند.
 *
 * `nth` از یک شروع می‌شود چون ردیف صفر، همان گزینه خالی («انتخاب کنید…») است.
 */
export async function pickOption(
  page: Page,
  field: string,
  option: { text?: string; nth?: number; search?: string } = {},
): Promise<void> {
  const trigger = page.getByRole('combobox', { name: field, exact: true });
  await trigger.click();

  const list = page.getByRole('listbox', { name: field });
  await expect(list).toBeVisible();

  if (option.search !== undefined) {
    await page.getByPlaceholder('جست‌وجو…').fill(option.search);
  }

  const target =
    option.text === undefined
      ? list.getByRole('option').nth(option.nth ?? 1)
      : list.getByRole('option', { name: option.text }).first();

  await expect(target, `گزینهٔ خواسته‌شده در «${field}» نیست`).toBeVisible();
  await target.click();

  // بسته شدن فهرست، نشانهٔ ثبت شدن انتخاب است.
  await expect(list).toHaveCount(0);
}

/** شناسه یکتا برای داده آزمون تا اجرای دوباره، داده قبلی را نبیند. */
export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString().slice(-8)}`;
}

/** تبدیل ارقام فارسی به ASCII — رابط برای نمایش فارسی‌سازی می‌کند. */
export function toAsciiDigits(value: string): string {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return value.replace(/[۰-۹]/g, (digit) => String(fa.indexOf(digit)));
}
