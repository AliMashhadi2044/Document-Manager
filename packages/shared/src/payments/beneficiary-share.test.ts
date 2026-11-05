import { describe, expect, it } from 'vitest';

import { beneficiaryShareKind, paymentPayeeTitle } from './beneficiary-share.js';

describe('سهم ذی‌نفع از یک فاکتور', () => {
  it('پرداخت به حساب ذی‌نفع، کامل است', () => {
    expect(beneficiaryShareKind('BENEFICIARY_ACCOUNT')).toBe('FULL');
  });

  /*
    مهم‌ترین ادعای این تابع.

    پرداخت ترکیبی بخشی از فاکتور را به ذی‌نفع می‌دهد؛ تیکِ کامل برای چنین ردیفی
    روی کاغذ یک حرفِ نادرست است.
  */
  it('پرداخت ترکیبی، جزئی است و نه کامل', () => {
    expect(beneficiaryShareKind('SPLIT')).toBe('PARTIAL');
  });

  it('تنخواه و قبض، سهم ذی‌نفع ندارند', () => {
    expect(beneficiaryShareKind('PETTY_CASH')).toBe('NONE');
    expect(beneficiaryShareKind('BILL')).toBe('NONE');
  });

  // فاکتوری که هنوز روش پرداخت ندارد، «نه» است و نه «نامشخص»: ستون تیک یک خانهٔ
  // خالی می‌خواهد، نه یک حالت سوم روی کاغذ.
  it('فاکتور بدون روش پرداخت، سهمی ندارد', () => {
    expect(beneficiaryShareKind(null)).toBe('NONE');
  });
});

/**
 * «پرداخت به» — ستونی که جای خانهٔ تیک را گرفت.
 *
 * چرا تیک کافی نبود: تیک تنها یک پرسش بله/خیر را جواب می‌داد و هر چه «ذی‌نفع
 * نبود» را یک خانهٔ خالی می‌کرد — پرداخت از تنخواهِ کارپرداز، پرداخت قبض، و
 * فاکتوری که هنوز روش پرداخت ندارد، هر سه یک شکل. روی فرمی که می‌گوید پول به
 * کجا رفت، این سه یکی نیستند.
 */
describe('عنوان مقصد پرداخت', () => {
  it('هر روش پرداخت، واژهٔ خودش را دارد', () => {
    expect(paymentPayeeTitle('PETTY_CASH')).toBe('کارپرداز');
    expect(paymentPayeeTitle('BENEFICIARY_ACCOUNT')).toBe('ذی‌نفع');
    expect(paymentPayeeTitle('BILL')).toBe('قبض');
  });

  // همان حالتی که تیک نمی‌توانست بگوید: بخشی به کارپرداز و بخشی به ذی‌نفع.
  it('پرداخت ترکیبی، هر دو مقصد را می‌نویسد', () => {
    expect(paymentPayeeTitle('SPLIT')).toBe('کارپرداز و ذی‌نفع');
  });

  /*
    سه حالتی که در ستون تیک یکی بودند، اینجا سه چیز متفاوت‌اند — همین دلیلِ
    وجود این تابع در کنار `beneficiaryShareKind` است.
  */
  it('تنخواه و قبض در این ستون یکی نیستند، هرچند سهم ذی‌نفعشان یکی است', () => {
    expect(beneficiaryShareKind('PETTY_CASH')).toBe(beneficiaryShareKind('BILL'));
    expect(paymentPayeeTitle('PETTY_CASH')).not.toBe(paymentPayeeTitle('BILL'));
  });

  // خانه **خالی** می‌ماند و نه «نامشخص»: فرم جای حدس زدن نیست.
  it('فاکتور بدون روش پرداخت، خانه را خالی می‌گذارد', () => {
    expect(paymentPayeeTitle(null)).toBe('');
  });

  it('روش پرداخت ناشناخته هم خانه را خالی می‌گذارد و چیزی از خود نمی‌سازد', () => {
    expect(paymentPayeeTitle('SOMETHING_NEW')).toBe('');
  });
});
