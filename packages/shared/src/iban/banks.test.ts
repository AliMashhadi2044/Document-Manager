import { describe, expect, it } from 'vitest';

import { IRAN_BANKS, bankByCode, bankCodeFromDigits } from './banks.js';
import { validateIban } from './iban.js';

describe('فهرست بانک‌ها', () => {
  it('کد تکراری ندارد و همه کدها سه‌رقمی‌اند', () => {
    const codes = IRAN_BANKS.map((bank) => bank.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^\d{3}$/);
  });

  it('کد ناشناخته، بانک برنمی‌گرداند', () => {
    expect(bankByCode('999')).toBeNull();
    expect(bankByCode(null)).toBeNull();
    expect(bankByCode('')).toBeNull();
  });

  it('کد شناخته‌شده همان بانک را می‌دهد', () => {
    expect(bankByCode('012')?.titleFa).toBe('بانک ملت');
    expect(bankByCode('017')?.titleFa).toBe('بانک ملی ایران');
  });
});

describe('کد بانک از شبای ناقص', () => {
  it('پیش از رقم پنجم چیزی نمی‌گوید', () => {
    expect(bankCodeFromDigits('')).toBeNull();
    expect(bankCodeFromDigits('8401')).toBeNull();
  });

  it('از همان رقم پنجم، کد بانک را می‌دهد', () => {
    expect(bankCodeFromDigits('84012')).toBe('012');
  });

  /**
   * ادعای واقعی: همان کدی که از ارقام ناقص خوانده می‌شود، با کدی که
   * `validateIban` از شبای کامل درمی‌آورد یکی است — وگرنه نمایشِ حین تایپ می‌توانست
   * بانکی غیر از بانک نهایی را نشان دهد.
   */
  it('با کد بانکِ شبای کامل یکی است', () => {
    const digits = '840120000000000123456789';
    const full = validateIban(`IR${digits}`);

    expect(full.valid).toBe(true);
    expect(bankCodeFromDigits(digits)).toBe(full.bankCode);
    expect(bankByCode(full.bankCode)?.titleFa).toBe('بانک ملت');
  });
});
