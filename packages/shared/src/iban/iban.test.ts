import { describe, expect, it } from 'vitest';

import { formatIban, isValidIban, normalizeIban, validateIban } from './iban.js';

/** شباهای معتبر، با checksum واقعی MOD-97 ساخته شده‌اند. */
const VALID = [
  'IR020540102800021273130001',
  'IR270170000000100324200001',
  'IR260620000000000123456789',
] as const;

describe('نرمال‌سازی', () => {
  it('فاصله و خط تیره را حذف می‌کند', () => {
    expect(normalizeIban('IR02 0540 1028 0002 1273 1300 01')).toBe(VALID[0]);
    expect(normalizeIban('IR02-0540-1028-0002-1273-1300-01')).toBe(VALID[0]);
  });

  it('ارقام فارسی را تبدیل می‌کند', () => {
    expect(normalizeIban('IR۰۲۰۵۴۰۱۰۲۸۰۰۰۲۱۲۷۳۱۳۰۰۰۱')).toBe(VALID[0]);
  });

  it('حروف کوچک را بزرگ می‌کند', () => {
    expect(normalizeIban('ir020540102800021273130001')).toBe(VALID[0]);
  });

  it('نیم‌فاصله و نویسه‌های جهت‌دهی را حذف می‌کند', () => {
    expect(normalizeIban('IR02‌0540‏102800021273130001')).toBe(VALID[0]);
  });

  it('در نبود پیشوند، IR اضافه می‌کند', () => {
    expect(normalizeIban('020540102800021273130001')).toBe(VALID[0]);
  });
});

describe('اعتبارسنجی شبای معتبر', () => {
  it.each(VALID)('%s معتبر است', (iban) => {
    const result = validateIban(iban);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(iban);
    expect(result.errorCode).toBeNull();
  });

  it('کد بانک را از پیشوند استخراج می‌کند', () => {
    expect(validateIban(VALID[0]).bankCode).toBe('054');
    expect(validateIban(VALID[1]).bankCode).toBe('017');
  });

  it('ورودی با فاصله هم معتبر تشخیص داده می‌شود', () => {
    expect(isValidIban('IR02 0540 1028 0002 1273 1300 01')).toBe(true);
  });
});

describe('اعتبارسنجی شبای نامعتبر', () => {
  it('ورودی خالی', () => {
    expect(validateIban('').errorCode).toBe('IBAN_EMPTY');
    expect(validateIban('   ').errorCode).toBe('IBAN_EMPTY');
  });

  it('کشور نادرست', () => {
    expect(validateIban('DE89370400440532013000').errorCode).toBe('IBAN_BAD_COUNTRY');
  });

  it('طول نادرست', () => {
    expect(validateIban('IR0205401028000212731300').errorCode).toBe('IBAN_BAD_LENGTH');
    expect(validateIban('IR02054010280002127313000199').errorCode).toBe('IBAN_BAD_LENGTH');
  });

  it('نویسه غیرعددی', () => {
    expect(validateIban('IR0205401028000212731300AB').errorCode).toBe('IBAN_BAD_CHARACTERS');
  });

  it('رقم کنترلی نادرست — تغییر یک رقم', () => {
    const broken = `${VALID[0].slice(0, 25)}${VALID[0][25] === '1' ? '2' : '1'}`;
    const result = validateIban(broken);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('IBAN_BAD_CHECKSUM');
    expect(result.errorMessage).toMatch(/معتبر نیست/);
  });

  it('هر تغییر تک‌رقمی checksum را می‌شکند', () => {
    const base = VALID[0];
    let detected = 0;
    for (let index = 4; index < base.length; index += 1) {
      const digit = Number(base[index]);
      const replacement = String((digit + 1) % 10);
      const mutated = base.slice(0, index) + replacement + base.slice(index + 1);
      if (!isValidIban(mutated)) detected += 1;
    }
    expect(detected).toBe(base.length - 4);
  });

  it('نتیجه نامعتبر، مقدار نرمال‌شده و بانک نمی‌دهد', () => {
    const result = validateIban('IR000000000000000000000000');
    expect(result.normalized).toBeNull();
    expect(result.bankCode).toBeNull();
  });
});

describe('قالب نمایشی', () => {
  it('گروه‌های چهارتایی می‌سازد', () => {
    expect(formatIban(VALID[0])).toBe('IR02 0540 1028 0002 1273 1300 01');
  });
});
