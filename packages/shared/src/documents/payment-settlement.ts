/**
 * وضعیت پرداخت سند — آخرین حلقهٔ چرخهٔ عمر سند.
 *
 * سند که بایگانی می‌شود، کار مالی‌اش لزوماً تمام نشده: گاهی کل مبلغ پرداخت شده و
 * گاهی بخشی از آن مانده و باید پیگیری شود. تا پیش از این، سامانه این تفاوت را
 * نمی‌دانست و «شناسایی» فقط در ذهن بایگان و کارپرداز بود.
 *
 * دو وضعیت، و هیچ وضعیت سوم:
 *
 *  - `FULLY_PAID` — کل مبلغ سند پرداخت شده. **تاریخ پرداخت** همان لحظه‌ای است که
 *    بایگان این وضعیت را ثبت می‌کند؛ یک فیلد تاریخِ دستی اضافه، یعنی دو روایت از
 *    یک رویداد که می‌توانند واگرا شوند.
 *  - `OUTSTANDING` — بخشی پرداخت شده و بخشی مانده. هر دو مبلغ ثبت می‌شوند.
 *
 * نبودِ وضعیت (`null`) یعنی بایگان هنوز تعیین نکرده است — و این با «پرداخت کامل»
 * یکی نیست. داشبورد و گزارش‌ها هر سه حالت را جدا می‌شمارند.
 */

export const PAYMENT_SETTLEMENT_STATUSES = ['FULLY_PAID', 'OUTSTANDING'] as const;
export type PaymentSettlementStatus = (typeof PAYMENT_SETTLEMENT_STATUSES)[number];

export const PAYMENT_SETTLEMENT_LABELS: Record<PaymentSettlementStatus, string> = {
  FULLY_PAID: 'پرداخت کامل',
  OUTSTANDING: 'شناسایی',
};

/** کلید نمای «تعیین‌نشده» در فیلترها — وضعیت نیست، نبودِ وضعیت است. */
export const PAYMENT_SETTLEMENT_UNSET = 'UNSET';

/** مهلت پیگیری شناسایی؛ پس از آن، کار از «در جریان» به «معوق» می‌رود. */
export const OUTSTANDING_FOLLOW_UP_DAYS = 10;

export type SettlementProblem =
  /** مبلغ پرداخت‌شده یا مبلغ شناسایی وارد نشده است. */
  | { readonly code: 'MISSING' }
  /** شناساییِ صفر یعنی پرداخت کامل، نه شناسایی. */
  | { readonly code: 'NOT_OUTSTANDING' }
  /** مبلغ منفی. */
  | { readonly code: 'NEGATIVE' }
  /** جمع پرداخت‌شده و شناسایی با مبلغ سند نمی‌خواند. */
  | {
      readonly code: 'MISMATCH';
      readonly sum: bigint;
      readonly total: bigint;
      readonly difference: bigint;
    };

/**
 * قاعدهٔ مبالغ وضعیت پرداخت — یک جا، برای سرور و رابط.
 *
 * مثل تقسیم پرداخت ترکیبی، اینجا هم یک بی‌چون‌وچرا هست: **پرداخت‌شده + شناسایی =
 * مبلغ کل سند**. اگر جمعشان کمتر باشد، بخشی از پول نه پرداخت شده و نه پیگیری
 * می‌شود — یعنی گم شده؛ اگر بیشتر باشد، سند بیش از مبلغش تعهد نشان می‌دهد.
 *
 * در `FULLY_PAID` هیچ عددی از کاربر گرفته نمی‌شود: پرداخت‌شده همان مبلغ سند است و
 * شناسایی صفر. پرسیدنشان فقط راهی می‌شد برای ثبت تناقض.
 */
export function checkSettlement(
  status: PaymentSettlementStatus,
  paidAmount: bigint | null,
  outstandingAmount: bigint | null,
  totalAmount: bigint,
): SettlementProblem | null {
  if (status === 'FULLY_PAID') {
    // مقدارها مشتق‌اند، نه ورودی؛ این فقط نگهبان است.
    return paidAmount === totalAmount && outstandingAmount === 0n
      ? null
      : { code: 'MISMATCH', sum: (paidAmount ?? 0n) + (outstandingAmount ?? 0n), total: totalAmount, difference: totalAmount - ((paidAmount ?? 0n) + (outstandingAmount ?? 0n)) };
  }

  if (paidAmount === null || outstandingAmount === null) return { code: 'MISSING' };
  if (paidAmount < 0n || outstandingAmount < 0n) return { code: 'NEGATIVE' };
  if (outstandingAmount === 0n) return { code: 'NOT_OUTSTANDING' };

  const sum = paidAmount + outstandingAmount;
  if (sum !== totalAmount) {
    return { code: 'MISMATCH', sum, total: totalAmount, difference: totalAmount - sum };
  }

  return null;
}

/** مبلغ تقسیم‌نشدهٔ سند؛ برای نمایش زندهٔ اختلاف در فرم. */
export function settlementDifference(
  paidAmount: bigint | null,
  outstandingAmount: bigint | null,
  totalAmount: bigint,
): bigint {
  return totalAmount - ((paidAmount ?? 0n) + (outstandingAmount ?? 0n));
}

/**
 * فوریت پیگیری یک شناسایی.
 *
 * خواستهٔ کار این است: شناساییِ تازه آبی باشد و هرچه به مهلت ده روزه نزدیک‌تر
 * می‌شود قرمزتر، و پس از آن بحرانی. محاسبه از **لحظهٔ ثبت شناسایی** است و نه
 * تاریخ سند: ساعت پیگیری از وقتی شروع می‌شود که کسی فهمیده پولی مانده.
 *
 * همین‌جا و نه در پایگاه داده: رنگ، تابعی از «حالا» است. ذخیره‌اش یعنی یک کار
 * زمان‌بندی‌شده که هر شب ردیف‌ها را رنگ کند — و روزی که نچرخد، سامانه دروغ بگوید.
 */
export type OutstandingLevel = 'fresh' | 'due-soon' | 'urgent' | 'overdue';

export interface OutstandingAge {
  /** روزهای کاملِ سپری‌شده از ثبت شناسایی. */
  readonly days: number;
  /** روز باقی‌مانده تا مهلت؛ صفر یا منفی یعنی مهلت گذشته است. */
  readonly daysLeft: number;
  readonly level: OutstandingLevel;
}

export const OUTSTANDING_LEVEL_LABELS: Record<OutstandingLevel, string> = {
  fresh: 'در جریان',
  'due-soon': 'نزدیک مهلت',
  urgent: 'فوری',
  overdue: 'معوق',
};

export function outstandingAge(since: Date, now: Date = new Date()): OutstandingAge {
  const elapsedMs = now.getTime() - since.getTime();
  const days = Math.max(0, Math.floor(elapsedMs / 86_400_000));
  const daysLeft = OUTSTANDING_FOLLOW_UP_DAYS - days;

  const level: OutstandingLevel =
    daysLeft <= 0 ? 'overdue' : daysLeft <= 2 ? 'urgent' : daysLeft <= 5 ? 'due-soon' : 'fresh';

  return { days, daysLeft, level };
}
