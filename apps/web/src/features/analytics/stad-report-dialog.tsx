import { useEffect, useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { MoneyInput } from '../../shared/ui/money-input';
import { ApiError } from '../../shared/api/client';
import { formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useSaveStadReportLine, useStadReportLine } from './analytics.api';

/**
 * جزئیات یک ردیف «گزارش مالی سامانه ستاد».
 *
 * دو کار می‌کند و هر دو لازم‌اند:
 *
 *  ۱. **قلم‌های همان فاکتور را نشان می‌دهد.** ردیف گزارش یک سطر است، ولی پشتش
 *     می‌تواند نُه قلم کالا باشد؛ بدون دیدنشان، کسی که توضیح می‌نویسد باید حافظه‌اش
 *     را به کار بگیرد.
 *  ۲. **چهار مقدارِ فرم را می‌گیرد**: عنوان کالا، تعداد، مبلغ نقدی و سایر توضیحات.
 *     هر کدام پیش‌فرضی دارند که از خودِ فاکتور می‌آید و دکمهٔ «پیش‌فرض» برشان
 *     می‌گرداند — بدون آن، کسی که یک بار چیزی نوشته راهی برای پس گرفتنش نداشت.
 *
 * شرح خودِ فاکتور **عوض نمی‌شود**: آن حقیقت تاریخی سند است. آنچه اینجا نوشته
 * می‌شود فقط روی همین گزارش می‌نشیند.
 */
export function StadReportDialog({
  invoiceId,
  canEdit,
  onClose,
}: {
  invoiceId: string;
  canEdit: boolean;
  onClose: () => void;
}): JSX.Element {
  const detail = useStadReportLine(invoiceId);
  const save = useSaveStadReportLine(invoiceId);

  const [itemTitle, setItemTitle] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [cashAmount, setCashAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // مقدارهای سرور یک بار روی فرم می‌نشینند؛ پس از آن، فرم دست کاربر است.
  useEffect(() => {
    const data = detail.data;
    if (!data) return;
    setItemTitle(data.line?.itemTitle ?? data.defaults.itemTitle);
    setQuantity(String(data.line?.quantity ?? data.defaults.quantity));
    setCashAmount(data.line?.cashAmount ?? data.defaults.cashAmount);
    setNotes(data.line?.notes ?? data.defaults.notes);
  }, [detail.data]);

  const data = detail.data;

  return (
    <Modal title="جزئیات ردیف گزارش ستاد" onClose={onClose}>
      {detail.isPending ? <LoadingState label="در حال خواندن ردیف…" /> : null}

      {detail.isError ? (
        <ErrorState
          title="خواندن این ردیف ناموفق بود"
          message={
            detail.error instanceof ApiError
              ? formatServerMessage(detail.error.message)
              : 'خطای نامشخص'
          }
          onRetry={() => void detail.refetch()}
        />
      ) : null}

      {data ? (
        <div className="space-y-5 p-4">
          <section className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium">{data.documentTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              شماره سند: {data.documentNumber ?? '—'}
            </p>
            {data.invoiceDescription ? (
              <p className="mt-1 text-xs text-muted-foreground">
                شرح فاکتور: {data.invoiceDescription}
              </p>
            ) : null}
          </section>

          {/* قلم‌های فاکتور — همان چیزی که کاربر برای نوشتن توضیح لازم دارد. */}
          <section>
            <h3 className="text-sm font-semibold">قلم‌های این فاکتور</h3>
            <div className="mt-2 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-12 px-3 py-2 text-start">ردیف</th>
                    <th className="px-3 py-2 text-start">شرح</th>
                    <th className="w-24 px-3 py-2 text-start">تعداد</th>
                    <th className="w-20 px-3 py-2 text-start">واحد</th>
                    <th className="w-32 px-3 py-2 text-start">مبلغ واحد</th>
                    <th className="w-32 px-3 py-2 text-start">خالص</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-xs text-muted-foreground">
                        این فاکتور قلمی ندارد.
                      </td>
                    </tr>
                  ) : null}
                  {data.items.map((item) => (
                    <tr key={item.rowNo} className="border-t border-border">
                      <td className="money px-3 py-2">{toPersianDigits(String(item.rowNo))}</td>
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="money px-3 py-2">{toPersianDigits(item.quantity)}</td>
                      <td className="px-3 py-2">{item.unitTitle ?? '—'}</td>
                      <td className="money px-3 py-2">{formatMoney(item.unitPrice)}</td>
                      <td className="money px-3 py-2">{formatMoney(item.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">مقدارهای فرم</h3>

            <Field
              label="عنوان کالا"
              onReset={canEdit ? () => setItemTitle(data.defaults.itemTitle) : undefined}
            >
              <Input
                aria-label="عنوان کالا"
                value={itemTitle}
                disabled={!canEdit}
                onChange={(event) => setItemTitle(event.target.value)}
              />
            </Field>

            <Field
              label="تعداد"
              onReset={canEdit ? () => setQuantity(String(data.defaults.quantity)) : undefined}
            >
              <Input
                aria-label="تعداد"
                type="number"
                min={1}
                value={quantity}
                disabled={!canEdit}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>

            <Field
              label="مبلغ نقدی"
              onReset={canEdit ? () => setCashAmount(data.defaults.cashAmount) : undefined}
            >
              <MoneyInput
                ariaLabel="مبلغ نقدی"
                value={cashAmount}
                onChange={setCashAmount}
                disabled={!canEdit}
              />
            </Field>

            {/*
              پیش‌فرضِ توضیحات، شمارشِ قلم‌هاست — «تعداد ۳ قلم کالا مجموعا ۲۸ عدد» —
              تا کاربر خودش نشمارد. جدول بالای همین پنجره هم برای همین است.
            */}
            <Field
              label="سایر توضیحات"
              onReset={canEdit ? () => setNotes(data.defaults.notes) : undefined}
            >
              <textarea
                aria-label="سایر توضیحات"
                rows={3}
                value={notes}
                disabled={!canEdit}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full rounded-lg border border-border bg-background p-2 text-sm disabled:opacity-60"
              />
            </Field>
          </section>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              بستن
            </Button>
            {canEdit ? (
              <Button
                loading={save.isPending}
                onClick={() => {
                  setError(null);
                  const parsed = Math.trunc(Number(quantity));
                  if (!Number.isFinite(parsed) || parsed < 1) {
                    setError('تعداد باید عددی مثبت باشد.');
                    return;
                  }

                  save.mutate(
                    {
                      itemTitle,
                      quantity: parsed,
                      cashAmount: cashAmount === '' ? '0' : cashAmount,
                      notes,
                    },
                    {
                      onSuccess: () => onClose(),
                      onError: (caught) =>
                        setError(
                          caught instanceof ApiError
                            ? formatServerMessage(caught.message)
                            : 'ذخیره ناموفق بود',
                        ),
                    },
                  );
                }}
              >
                ذخیره
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function Field({
  label,
  onReset,
  children,
}: {
  label: string;
  onReset?: (() => void) | undefined;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            بازگشت به پیش‌فرض
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
