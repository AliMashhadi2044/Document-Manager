import { useState } from 'react';
import {
  OUTSTANDING_FOLLOW_UP_DAYS,
  PAYMENT_SETTLEMENT_LABELS,
  outstandingAge,
  settlementDifference,
  type PaymentSettlementStatus,
} from '@dm/shared';

import { ApiError } from '../../shared/api/client';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { MoneyInput } from '../../shared/ui/money-input';
import { Segmented } from '../../shared/ui/segmented';
import { formatIsoAsJalali, formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useSavePaymentStatus, type ArchiveDetail } from './archive.api';

/**
 * وضعیت پرداخت سند — کار نقش **بایگانی**.
 *
 * این تنها فیلد مالی‌ای است که بایگان ثبتش می‌کند، و عمداً هم همین یکی: مبلغ سند
 * و فاکتورهایش از دسترس او بیرون است (و سرور هم مجوزش را نمی‌دهد). اینجا فقط
 * گفته می‌شود از آن مبلغ، چقدر پرداخت شده.
 *
 * سه چیز که از دل کار درآمدند:
 *
 *  ۱. **در «پرداخت کامل» هیچ عددی پرسیده نمی‌شود.** پرداخت‌شده همان مبلغ سند است
 *     و شناسایی صفر؛ پرسیدنشان فقط راهی می‌شد برای ثبت تناقض.
 *  ۲. **نوشتن یک مبلغ، دیگری را کامل می‌کند** — مثل تقسیم پرداخت ترکیبی. تقسیم یک
 *     عدد به دو، در عمل یعنی وارد کردن یک عدد.
 *  ۳. **پس از بایگانی هم باز است.** شناسایی اصلاً برای همین وجود دارد: سند
 *     بایگانی شده و پول هنوز نرفته.
 */
export function PaymentStatusPanel({
  documentId,
  detail,
  canWrite,
  onSaved,
}: {
  documentId: string;
  detail: ArchiveDetail;
  canWrite: boolean;
  onSaved: () => void;
}): JSX.Element {
  const save = useSavePaymentStatus(documentId);

  const total = BigInt(detail.totalAmount || '0');
  const [status, setStatus] = useState<PaymentSettlementStatus>(
    detail.paymentStatus ?? 'FULLY_PAID',
  );
  const [paid, setPaid] = useState(detail.paidAmount ?? '');
  const [outstanding, setOutstanding] = useState(detail.outstandingAmount ?? '');
  const [error, setError] = useState<string | null>(null);

  const paidValue = paid === '' ? null : BigInt(paid);
  const outstandingValue = outstanding === '' ? null : BigInt(outstanding);
  const difference =
    status === 'FULLY_PAID' ? 0n : settlementDifference(paidValue, outstandingValue, total);

  /** نوشتن یک مبلغ، مبلغ دیگر را از جمع کل سند کامل می‌کند. */
  const setPart = (part: 'paid' | 'outstanding', value: string): void => {
    const entered = value === '' ? null : BigInt(value);
    const complement = entered === null || entered > total ? null : (total - entered).toString();

    if (part === 'paid') {
      setPaid(value);
      if (complement !== null) setOutstanding(complement);
    } else {
      setOutstanding(value);
      if (complement !== null) setPaid(complement);
    }
  };

  const submit = (): void => {
    setError(null);
    save.mutate(
      {
        status,
        paidAmount: status === 'FULLY_PAID' ? null : paid || null,
        outstandingAmount: status === 'FULLY_PAID' ? null : outstanding || null,
      },
      {
        onSuccess: onSaved,
        onError: (cause) =>
          setError(
            cause instanceof ApiError
              ? formatServerMessage(cause.message)
              : 'ثبت وضعیت پرداخت ناموفق بود',
          ),
      },
    );
  };

  const canSubmit =
    canWrite &&
    (status === 'FULLY_PAID' ||
      (paidValue !== null && outstandingValue !== null && outstandingValue > 0n && difference === 0n));

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">وضعیت پرداخت</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            از مبلغ {formatMoney(detail.totalAmount)} این سند، چقدر پرداخت شده است. پس از نهایی
            شدن بایگانی هم قابل تغییر است.
          </p>
        </div>
        <SettlementBadge detail={detail} />
      </div>

      {detail.paymentStatus !== null ? (
        <p className="mt-4 rounded-md bg-muted/50 p-3 text-xs leading-6 text-muted-foreground">
          {detail.paymentStatus === 'FULLY_PAID' && detail.paymentDate
            ? `تاریخ پرداخت: ${formatIsoAsJalali(detail.paymentDate)}`
            : detail.paymentStatusAt
              ? `ثبت شناسایی: ${formatIsoAsJalali(detail.paymentStatusAt)}`
              : ''}
          {detail.paymentStatusBy ? ` · توسط ${detail.paymentStatusBy.fullName}` : ''}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        <Segmented
          label="وضعیت پرداخت"
          size="lg"
          value={status}
          onChange={(next) => setStatus(next as PaymentSettlementStatus)}
          options={[
            {
              value: 'FULLY_PAID',
              label: PAYMENT_SETTLEMENT_LABELS.FULLY_PAID,
              icon: 'check',
              hint: 'کل مبلغ سند پرداخت شده است',
              disabled: !canWrite,
              ...(canWrite ? {} : { disabledReason: 'ثبت وضعیت پرداخت، مجوز بایگانی می‌خواهد' }),
            },
            {
              value: 'OUTSTANDING',
              label: PAYMENT_SETTLEMENT_LABELS.OUTSTANDING,
              icon: 'alert',
              hint: 'بخشی از مبلغ مانده و باید پیگیری شود',
              disabled: !canWrite,
              ...(canWrite ? {} : { disabledReason: 'ثبت وضعیت پرداخت، مجوز بایگانی می‌خواهد' }),
            },
          ]}
        />

        {status === 'OUTSTANDING' ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <MoneyInput
                label="مبلغ پرداخت‌شده"
                required
                disabled={!canWrite}
                value={paid}
                onChange={(value) => setPart('paid', value)}
              />
              <MoneyInput
                label="مبلغ شناسایی"
                required
                disabled={!canWrite}
                value={outstanding}
                onChange={(value) => setPart('outstanding', value)}
                hint={`پس از ${toPersianDigits(
                  String(OUTSTANDING_FOLLOW_UP_DAYS),
                )} روز، این سند «معوق» شمرده می‌شود.`}
              />
            </div>

            {difference !== 0n ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {difference > 0n
                  ? `${formatMoney(difference.toString())} از مبلغ سند مشخص نشده است.`
                  : `جمع مبالغ ${formatMoney((-difference).toString())} بیشتر از مبلغ سند است.`}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            کل مبلغ سند ({formatMoney(detail.totalAmount)}) پرداخت‌شده ثبت می‌شود و تاریخ پرداخت،
            همین امروز خواهد بود.
          </p>
        )}

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {canWrite ? (
          <Button loading={save.isPending} disabled={!canSubmit} onClick={submit}>
            ثبت وضعیت پرداخت
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * نشان وضعیت پرداخت، با **فوریت** شناسایی.
 *
 * رنگ از آبی تا قرمز، تابعی از فاصلهٔ امروز تا مهلت ده‌روزه است و همین‌جا حساب
 * می‌شود؛ ذخیره‌اش یعنی یک کار شبانه که هر بار نچرخد، سامانه دروغ بگوید.
 */
export function SettlementBadge({
  detail,
  now,
}: {
  detail: {
    paymentStatus: PaymentSettlementStatus | null;
    paymentStatusAt: string | null;
  };
  now?: Date;
}): JSX.Element {
  if (detail.paymentStatus === null) {
    return <Badge tone="neutral">وضعیت پرداخت تعیین نشده</Badge>;
  }

  if (detail.paymentStatus === 'FULLY_PAID') {
    return <Badge tone="success" dot>{PAYMENT_SETTLEMENT_LABELS.FULLY_PAID}</Badge>;
  }

  const since = detail.paymentStatusAt === null ? null : new Date(detail.paymentStatusAt);
  if (since === null) return <Badge tone="info" dot>{PAYMENT_SETTLEMENT_LABELS.OUTSTANDING}</Badge>;

  const age = outstandingAge(since, now);
  const tone: BadgeTone =
    age.level === 'overdue'
      ? 'danger'
      : age.level === 'urgent'
        ? 'danger'
        : age.level === 'due-soon'
          ? 'warning'
          : 'info';

  const caption =
    age.daysLeft <= 0
      ? `${toPersianDigits(String(age.days))} روز گذشته`
      : `${toPersianDigits(String(age.daysLeft))} روز تا مهلت`;

  return (
    <Badge tone={tone} dot>
      {PAYMENT_SETTLEMENT_LABELS.OUTSTANDING}
      {/*
        بدون `opacity`: همین کم کردن شفافیت، تضاد رنگ این متن را به ۳٫۴۶ می‌رساند
        و از حد ۴٫۵ می‌افتد — روی متنی که کارش اعلام فوریت است.
      */}
      <span className="money ms-1">· {caption}</span>
    </Badge>
  );
}
