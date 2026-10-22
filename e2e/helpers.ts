import { expect, type Page } from '@playwright/test';
import { isValidIban } from '@dm/shared';

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

    /*
      فهرست‌های سمت‌سرور با تأخیر جست‌وجو می‌کنند (۳۰۰ms) تا هر نویسه یک درخواست
      نسازد. بدون این صبر، آزمون گزینهٔ nth را از **نتیجهٔ قبلی** برمی‌داشت — خطایی
      که خودش را به‌صورت «فاکتور ثبت نشد» نشان می‌داد، نه به‌صورت انتخاب اشتباه.
    */
    await page.waitForTimeout(400);
    await expect(list.getByText('در حال جست‌وجو…')).toHaveCount(0);
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

/**
 * یک شبای معتبر و یکتا برای هر اجرا.
 *
 * شبا در پایگاه داده **یکتای سراسری** است، پس یک شماره ثابت فقط بار اول ثبت
 * می‌شود و اجرای بعدی به خطای تکراری می‌خورد. شماره حساب از زمان ساخته می‌شود و
 * رقم کنترلی با همان MOD-97-10ی که سامانه بررسی می‌کند به‌دست می‌آید؛ درستی‌اش را
 * `isValidIban` همین‌جا تأیید می‌کند تا یک مولد خراب، به‌جای خودش، رابط را متهم نکند.
 */
export function uniqueIban(bankCode = '012'): string {
  const account = Date.now().toString().padStart(19, '0').slice(-19);
  const bban = bankCode + account;

  for (let candidate = 2; candidate <= 98; candidate += 1) {
    const iban = `IR${String(candidate).padStart(2, '0')}${bban}`;
    if (mod97(iban) === 1n) {
      if (!isValidIban(iban)) throw new Error(`شبای ساخته‌شده معتبر نیست: ${iban}`);
      return iban;
    }
  }

  throw new Error('ساخت شبای معتبر ناموفق بود');
}

function mod97(iban: string): bigint {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0n;

  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const value = code >= 48 && code <= 57 ? BigInt(code - 48) : BigInt(code - 55);
    remainder = (remainder * (value >= 10n ? 100n : 10n) + value) % 97n;
  }

  return remainder;
}

/** تبدیل ارقام فارسی به ASCII — رابط برای نمایش فارسی‌سازی می‌کند. */
export function toAsciiDigits(value: string): string {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return value.replace(/[۰-۹]/g, (digit) => String(fa.indexOf(digit)));
}
