/**
 * تجمیع **مقصدهای پرداخت** یک سند.
 *
 * فرم «شماره شبا ذینفعان سند» به یک پرسش جواب می‌دهد: از این سند، چه مبلغی به چه
 * حسابی می‌رود؟ پس واحدِ ردیف، **مقصد** است و نه فاکتور و نه فروشنده — یک فروشنده
 * می‌تواند دو حساب داشته باشد و یک حساب می‌تواند در چند فاکتور تکرار شود.
 *
 * سه مقصد ممکن است:
 *
 *  - `IBAN` — حساب ذی‌نفع، با شبای snapshot‌شدهٔ همان فاکتور.
 *  - `BILL` — قبض، با شناسهٔ قبض و شناسهٔ پرداختش.
 *  - `PETTY_CASH` — کارپرداز تنخواه‌دار.
 *
 * **پرداخت ترکیبی مقصد چهارم نیست**: یک فاکتور ترکیبی سهمش را بین دو مقصد تقسیم
 * می‌کند و در هر دو ردیف دیده می‌شود. همین است که این تجمیع را از «تجمیع بر اساس
 * فروشنده» جدا می‌کند و دلیل وجودش است.
 *
 * قاعده اینجاست و نه در سرویس، چون هم سرور گزارش را با آن می‌سازد و هم دیالوگ
 * «جزئیات» باید دقیقاً همان تقسیم را نشان دهد. دو پیاده‌سازی، دیر یا زود دو عدد.
 */

import type { Money } from '../money/money.js';

export type BeneficiaryKind = 'IBAN' | 'BILL' | 'PETTY_CASH';

export const BENEFICIARY_KIND_LABELS: Record<BeneficiaryKind, string> = {
  IBAN: 'حساب ذی‌نفع',
  BILL: 'قبض',
  PETTY_CASH: 'تنخواه کارپردازی',
};

/** عنوانی که وقتی تنخواه‌دار شبا ندارد، جای شناسه می‌نشیند. */
export const PETTY_CASH_CARD_LABEL = 'تنخواه کارت کارپردازی';

/** بانکِ قبض، بانک نیست؛ ولی ستونش باید چیزی بگوید. */
export const BILL_BANK_LABEL = 'قبض';

/** یک فاکتور، همان‌طور که برای این تجمیع لازم است. */
export interface BeneficiaryInvoiceInput {
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  /** `YYYY-MM-DD`؛ فقط برای نمایش در جزئیات. */
  readonly invoiceDate: string;
  readonly totalAmount: Money;
  readonly vendorName: string;

  readonly methodKind: string | null;
  readonly ibanSnapshot: string | null;
  readonly bankTitleSnapshot: string | null;
  readonly accountTitleSnapshot: string | null;
  readonly paymentIdentifier: string | null;
  readonly billIdentifier: string | null;

  readonly pettyCashHolderNameSnapshot: string | null;
  readonly pettyCashAccountHolderSnapshot: string | null;
  readonly pettyCashBankTitleSnapshot: string | null;
  readonly pettyCashIbanSnapshot: string | null;

  /** سهم هر مقصد در پرداخت ترکیبی؛ در بقیهٔ روش‌ها `null`. */
  readonly beneficiaryAmount: Money | null;
  readonly pettyCashAmount: Money | null;
}

/** سهم یک فاکتور از یک مقصد. */
export interface BeneficiaryShare {
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string;
  readonly vendorName: string;
  readonly amount: Money;
  /** این فاکتور ترکیبی بوده و فقط بخشی از مبلغش به این مقصد می‌رود. */
  readonly isPartial: boolean;
}

export interface BeneficiaryRow {
  /** شناسهٔ پایدار گروه — دیالوگ جزئیات با همین می‌پرسد. */
  readonly key: string;
  readonly kind: BeneficiaryKind;
  /** شبا یا شناسهٔ قبض؛ خط اول سلول. */
  readonly identifier: string;
  /** شناسهٔ پرداخت؛ خط دوم سلول، و اگر نباشد سلول یک‌تکه می‌ماند. */
  readonly secondaryIdentifier: string;
  readonly accountHolder: string;
  readonly bankTitle: string;
  readonly total: Money;
  readonly shares: readonly BeneficiaryShare[];
}

export interface BeneficiaryGrouping {
  readonly rows: readonly BeneficiaryRow[];
  /** فاکتورهایی که روش پرداختشان ثبت نشده و مقصدی ندارند. */
  readonly skippedInvoiceIds: readonly string[];
}

interface Draft {
  key: string;
  kind: BeneficiaryKind;
  identifier: string;
  secondaryIdentifier: string;
  accountHolder: string;
  bankTitle: string;
  total: bigint;
  shares: BeneficiaryShare[];
}

/**
 * تجمیع مقصدها.
 *
 * ترتیب ردیف‌ها **ترتیب اولین دیده شدن** هر مقصد است و نه مرتب‌سازی تازه: ورودی
 * با ترتیب قطعی گزارش می‌آید (تاریخ، سپس ترتیب ثبت) و همان ترتیب باید روی کاغذ
 * بیاید تا دو بار گرفتنِ یک گزارش، دو فرم متفاوت ندهد.
 */
export function groupBeneficiaries(
  invoices: readonly BeneficiaryInvoiceInput[],
): BeneficiaryGrouping {
  const drafts = new Map<string, Draft>();
  const skippedInvoiceIds: string[] = [];

  const add = (draft: Omit<Draft, 'total' | 'shares'>, share: BeneficiaryShare): void => {
    // سهم صفر ردیف نمی‌سازد: مقصدی که چیزی نمی‌گیرد، مقصد نیست.
    if (share.amount <= 0n) return;

    const existing = drafts.get(draft.key);
    if (existing) {
      existing.total += share.amount;
      existing.shares.push(share);
      return;
    }
    drafts.set(draft.key, { ...draft, total: share.amount, shares: [share] });
  };

  for (const invoice of invoices) {
    const base = {
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      vendorName: invoice.vendorName,
    };

    if (invoice.methodKind === null) {
      skippedInvoiceIds.push(invoice.invoiceId);
      continue;
    }

    if (invoice.methodKind === 'BILL') {
      add(billDraft(invoice), { ...base, amount: invoice.totalAmount, isPartial: false });
      continue;
    }

    if (invoice.methodKind === 'BENEFICIARY_ACCOUNT') {
      add(ibanDraft(invoice), { ...base, amount: invoice.totalAmount, isPartial: false });
      continue;
    }

    if (invoice.methodKind === 'PETTY_CASH') {
      add(pettyDraft(invoice), { ...base, amount: invoice.totalAmount, isPartial: false });
      continue;
    }

    if (invoice.methodKind === 'SPLIT') {
      /*
        یک فاکتور، دو ردیف.

        سهم‌ها `isPartial` می‌گیرند تا دیالوگ جزئیات بتواند بگوید این عدد **بخشی**
        از مبلغ فاکتور است؛ وگرنه کاربری که جمع ردیف‌ها را با جمع فاکتورها مقایسه
        می‌کند، فکر می‌کند جایی اشتباه شده.
      */
      add(ibanDraft(invoice), {
        ...base,
        amount: (invoice.beneficiaryAmount ?? (0n as Money)) as Money,
        isPartial: true,
      });
      add(pettyDraft(invoice), {
        ...base,
        amount: (invoice.pettyCashAmount ?? (0n as Money)) as Money,
        isPartial: true,
      });
      continue;
    }

    // روش ناشناخته: مثل فاکتور بی‌روش کنار گذاشته می‌شود، نه اینکه در ردیفی
    // بی‌نام جمع شود.
    skippedInvoiceIds.push(invoice.invoiceId);
  }

  return {
    rows: [...drafts.values()].map((draft) => ({
      key: draft.key,
      kind: draft.kind,
      identifier: draft.identifier,
      secondaryIdentifier: draft.secondaryIdentifier,
      accountHolder: draft.accountHolder,
      bankTitle: draft.bankTitle,
      total: draft.total as Money,
      shares: draft.shares,
    })),
    skippedInvoiceIds,
  };
}

function ibanDraft(invoice: BeneficiaryInvoiceInput): Omit<Draft, 'total' | 'shares'> {
  const iban = invoice.ibanSnapshot ?? '';
  return {
    // شبا کلید است: یک فروشنده می‌تواند دو حساب داشته باشد و هر حساب ردیف خودش.
    key: `IBAN:${iban}`,
    kind: 'IBAN',
    identifier: iban,
    secondaryIdentifier: '',
    // عنوان حساب اختیاری است؛ نبودش یعنی حساب به نام خود فروشنده است.
    accountHolder: invoice.accountTitleSnapshot ?? invoice.vendorName,
    bankTitle: invoice.bankTitleSnapshot ?? '',
  };
}

function billDraft(invoice: BeneficiaryInvoiceInput): Omit<Draft, 'total' | 'shares'> {
  const bill = invoice.billIdentifier ?? '';
  const payment = invoice.paymentIdentifier ?? '';
  return {
    // هر دو شناسه در کلید: دو قبض با شناسهٔ قبضِ یکسان و پرداختِ متفاوت، دو ردیف‌اند.
    key: `BILL:${bill}|${payment}`,
    kind: 'BILL',
    identifier: bill,
    secondaryIdentifier: payment,
    accountHolder: invoice.vendorName,
    bankTitle: BILL_BANK_LABEL,
  };
}

function pettyDraft(invoice: BeneficiaryInvoiceInput): Omit<Draft, 'total' | 'shares'> {
  const iban = invoice.pettyCashIbanSnapshot ?? '';
  const name = invoice.pettyCashHolderNameSnapshot ?? '';
  return {
    key: `PETTY:${iban}|${name}`,
    kind: 'PETTY_CASH',
    /*
      شبا **و** عنوان کارت، هر دو.

      روی فرم کاغذی، ردیف کارپرداز با «تنخواه کارت کارپردازی» شناخته می‌شود و نه
      با یک شبای بیست‌وشش‌رقمی میان بقیهٔ شباها. پس عنوان خط دوم همان سلول می‌شود —
      همان جایی که سلول‌های دوشناسه‌ای (قبض و پرداخت) هم می‌نشینند.

      تنخواه‌دارِ بدون شبا، فقط همان عنوان را می‌گیرد: خط دومِ تکراری، چیزی به
      خواننده نمی‌گوید.
    */
    identifier: iban === '' ? PETTY_CASH_CARD_LABEL : iban,
    secondaryIdentifier: iban === '' ? '' : PETTY_CASH_CARD_LABEL,
    accountHolder: invoice.pettyCashAccountHolderSnapshot ?? name,
    bankTitle: invoice.pettyCashBankTitleSnapshot ?? '',
  };
}
