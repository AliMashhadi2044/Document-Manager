import { describe, expect, it } from 'vitest';

import { beneficiaryShareKind } from './beneficiary-share.js';

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
