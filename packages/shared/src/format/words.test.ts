import { describe, expect, it } from 'vitest';

import { moneyToPersianWords, numberToPersianWords } from './words';

/**
 * عدد به حروف.
 *
 * سنگ محک، همان عددی است که روی فرم کاغذی مرجع نوشته شده بود:
 * ۹٬۴۲۴٬۳۴۳٬۴۰۰ ⇒ «نه میلیارد و چهارصد و بیست و چهار میلیون و سیصد و چهل و سه
 * هزار و چهارصد». اگر این یکی درست باشد، بقیه هم همان قاعده‌اند.
 */

describe('عدد به حروف فارسی', () => {
  it('جمع کل فرم مرجع', () => {
    expect(numberToPersianWords(9_424_343_400n)).toBe(
      'نه میلیارد و چهارصد و بیست و چهار میلیون و سیصد و چهل و سه هزار و چهارصد',
    );
  });

  it('جمع کل فرم مرجع دوم', () => {
    expect(numberToPersianWords(3_090_481_510n)).toBe(
      'سه میلیارد و نود میلیون و چهارصد و هشتاد و یک هزار و پانصد و ده',
    );
  });

  it('یکان و دهگان و صدگان', () => {
    expect(numberToPersianWords(1n)).toBe('یک');
    expect(numberToPersianWords(15n)).toBe('پانزده');
    expect(numberToPersianWords(21n)).toBe('بیست و یک');
    expect(numberToPersianWords(100n)).toBe('صد');
    expect(numberToPersianWords(999n)).toBe('نهصد و نود و نه');
  });

  it('ده تا نوزده، نه «ده و یک»', () => {
    // این بازه قاعدهٔ خودش را دارد؛ بدون آن، ۱۲ می‌شد «ده و دو».
    expect(numberToPersianWords(12n)).toBe('دوازده');
    expect(numberToPersianWords(19n)).toBe('نوزده');
    expect(numberToPersianWords(119n)).toBe('صد و نوزده');
  });

  it('سه‌رقمی خالی در میانه حذف می‌شود، نه اینکه «صفر هزار» شود', () => {
    expect(numberToPersianWords(1_000_000n)).toBe('یک میلیون');
    expect(numberToPersianWords(1_000_001n)).toBe('یک میلیون و یک');
    expect(numberToPersianWords(2_000_300n)).toBe('دو میلیون و سیصد');
  });

  it('صفر، «صفر» است و نه رشتهٔ خالی', () => {
    // در ردیف جمعِ یک فرم مالی، جای خالی یعنی «نوشته نشده» و صفر یعنی «هیچ».
    expect(numberToPersianWords(0n)).toBe('صفر');
  });

  it('مبالغ بزرگ‌تر از محدودهٔ عدد جاوااسکریپت', () => {
    // همان دلیلی که ورودی `bigint` است: با `number`، رقم‌های آخر از دست می‌رفتند.
    expect(numberToPersianWords(9_007_199_254_740_993n)).toContain('بیلیارد');
    expect(numberToPersianWords(9_007_199_254_740_993n)).toMatch(/سه$/u);
  });

  it('عدد بزرگ‌تر از فهرست مقیاس‌ها، خطا می‌دهد', () => {
    // نامی که کسی نمی‌خواند، بدتر از خطاست.
    expect(() => numberToPersianWords(10n ** 24n)).toThrow(RangeError);
  });

  it('واحد پول کنار حروف می‌آید', () => {
    expect(moneyToPersianWords(1_500n)).toBe('یک هزار و پانصد ریال');
  });
});
