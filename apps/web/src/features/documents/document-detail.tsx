import { useState } from 'react';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  PAYMENT_METHOD_KIND_LABELS,
  type PaymentMethodKind,
} from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import {
  formatIsoAsJalali,
  formatMoney,
  formatQuantity,
  formatRateBp,
  toPersianDigits,
} from '../../shared/format/money';
import {
  useDocument,
  useFinalizeDocument,
  useReopenDocument,
  useRevisions,
  type InvoiceRow,
} from './documents.api';

export function DocumentDetailView({
  documentId,
  onBack,
}: {
  documentId: string;
  onBack: () => void;
}): JSX.Element {
  const { data, isPending, isError, refetch } = useDocument(documentId);
  const revisions = useRevisions(documentId);
  const finalize = useFinalizeDocument();
  const reopen = useReopenDocument();

  const [reason, setReason] = useState('');
  const [showReopen, setShowReopen] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  if (isPending) return <LoadingState label="در حال بارگذاری سند…" />;
  if (isError) {
    return <ErrorState message="دریافت سند ناموفق بود" onRetry={() => void refetch()} />;
  }

  const editable = data.status === 'DRAFT' || data.status === 'REOPENED';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={onBack}>
          بازگشت به فهرست
        </Button>

        <div className="flex gap-2">
          {editable ? (
            <Button
              loading={finalize.isPending}
              onClick={() => {
                setNotice(null);
                finalize.mutate(documentId, {
                  onSuccess: (result) => {
                    setNotice({
                      kind: 'success',
                      text: result.suggestedReport
                        ? `سند با موفقیت ثبت شد. آیا مایل به مشاهده و چاپ ${result.suggestedReport.titleFa} هستید؟`
                        : 'سند با موفقیت ثبت شد.',
                    });
                    void refetch();
                    void revisions.refetch();
                  },
                  onError: (error) =>
                    setNotice({
                      kind: 'error',
                      text: error instanceof ApiError ? describeError(error) : 'خطا در ثبت نهایی',
                    }),
                });
              }}
            >
              ثبت نهایی
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setShowReopen((value) => !value)}>
              بازگشایی سند
            </Button>
          )}
        </div>
      </div>

      {notice ? (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={
            notice.kind === 'error'
              ? 'whitespace-pre-line rounded-md bg-destructive/10 p-3 text-sm text-destructive'
              : 'rounded-md bg-success/10 p-3 text-sm text-success'
          }
        >
          {notice.text}
        </p>
      ) : null}

      {showReopen && !editable ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">بازگشایی سند</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            ثبت علت الزامی است و وضعیت فعلی سند پیش از هر تغییری به‌عنوان یک نسخه ذخیره می‌شود.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-72 flex-1">
              <Input
                label="علت بازگشایی"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button
              loading={reopen.isPending}
              disabled={!reason.trim()}
              onClick={() => {
                setNotice(null);
                reopen.mutate(
                  { id: documentId, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setReason('');
                      setShowReopen(false);
                      setNotice({ kind: 'success', text: 'سند بازگشایی شد و قابل ویرایش است.' });
                      void refetch();
                      void revisions.refetch();
                    },
                    onError: (error) =>
                      setNotice({
                        kind: 'error',
                        text: error instanceof ApiError ? error.message : 'خطا در بازگشایی',
                      }),
                  },
                );
              }}
            >
              بازگشایی
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">{data.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {DOCUMENT_TYPE_LABELS[data.type]} · سال مالی {toPersianDigits(String(data.fiscalYear))}{' '}
              · سال شمسی {toPersianDigits(String(data.jalaliYear))}
            </p>
          </div>
          <span className="rounded bg-muted px-2 py-1 text-xs">
            {DOCUMENT_STATUS_LABELS[data.status]}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Field label="خریدار" value={data.buyerSnapshot.name} />
          <Field label="شماره سند" value={data.documentNumber ?? 'ثبت نشده (بایگانی)'} />
          <Field
            label="سیاست گرد کردن"
            value={`${data.roundingPolicy.scope === 'LINE' ? 'سطح ردیف' : 'سطح فاکتور'} · ${
              data.roundingPolicy.mode === 'HALF_UP' ? 'نیم به بالا' : data.roundingPolicy.mode
            }`}
          />
          <Field label="تعداد فاکتور" value={toPersianDigits(String(data.invoices.length))} />
        </dl>
      </section>

      {data.stadMetadata ? (
        <section className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-semibold">اطلاعات سامانه ستاد</h3>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Field label="شماره نیاز" value={toPersianDigits(data.stadMetadata.needNumber)} />
            <Field label="شماره گردش" value={data.stadMetadata.workflowNumber} />
            <Field label="شماره درخواست" value={data.stadMetadata.requestNumber} />
            <Field label="نوع درخواست" value={data.stadMetadata.requestType?.title ?? '—'} />
          </dl>
          {data.stadMetadata.notes ? (
            <p className="mt-3 text-sm text-muted-foreground">{data.stadMetadata.notes}</p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">
          فاکتورها (به ترتیب تاریخ صورتحساب)
        </h3>
        {data.invoices.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} />
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-semibold">جمع سند</h3>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <Field label="مبلغ کالا" value={formatMoney(data.totalGross)} />
          <Field label="تخفیف" value={formatMoney(data.totalDiscount)} />
          <Field label="خالص" value={formatMoney(data.totalNet)} />
          <Field label="مالیات و عوارض" value={formatMoney(data.totalTax)} />
          <Field label="جمع کل" value={formatMoney(data.totalAmount)} strong />
        </dl>
      </section>

      {revisions.data && revisions.data.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-semibold">نسخه‌های سند</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {revisions.data.map((revision) => (
              <li key={revision.id} className="flex flex-wrap gap-3 text-muted-foreground">
                <span className="font-medium text-foreground">
                  نسخه {toPersianDigits(String(revision.revisionNo))}
                </span>
                <span>{TRIGGER_LABELS[revision.trigger] ?? revision.trigger}</span>
                <span>{formatIsoAsJalali(revision.createdAt)}</span>
                {revision.reason ? <span>· {revision.reason}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const TRIGGER_LABELS: Record<string, string> = {
  FINALIZE: 'ثبت نهایی',
  REOPEN: 'بازگشایی',
  ARCHIVE: 'بایگانی',
  CORRECTION: 'اصلاح',
};

function InvoiceCard({ invoice }: { invoice: InvoiceRow }): JSX.Element {
  return (
    <article className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h4 className="text-sm font-semibold">
            {invoice.invoiceType.titleFa}
            {invoice.invoiceNumber ? ` — شماره ${toPersianDigits(invoice.invoiceNumber)}` : ''}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            فصل {invoice.chapterTitleSnapshot} · تاریخ صورتحساب{' '}
            {formatIsoAsJalali(invoice.invoiceDate)}
          </p>
        </div>
        <span className="text-sm font-medium tabular-nums">{formatMoney(invoice.totalAmount)}</span>
      </header>

      <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
        <Field
          label="فروشنده"
          value={
            invoice.vendorSnapshot
              ? invoice.vendorSnapshot.representativeName
                ? `${invoice.vendorSnapshot.name} (نماینده: ${invoice.vendorSnapshot.representativeName})`
                : invoice.vendorSnapshot.name
              : 'بدون فروشنده'
          }
        />
        <Field
          label="روش پرداخت"
          value={
            invoice.payment
              ? `${PAYMENT_METHOD_KIND_LABELS[invoice.payment.methodKind as PaymentMethodKind]}${
                  invoice.payment.bankTitleSnapshot ? ` · ${invoice.payment.bankTitleSnapshot}` : ''
                }`
              : 'انتخاب نشده'
          }
        />
      </div>

      {invoice.items.length > 0 ? (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">ردیف</th>
                <th className="px-3 py-2 text-start">شرح</th>
                <th className="px-3 py-2 text-center">تعداد</th>
                <th className="px-3 py-2 text-end">مبلغ واحد</th>
                <th className="px-3 py-2 text-end">مبلغ کل</th>
                <th className="px-3 py-2 text-end">تخفیف</th>
                <th className="px-3 py-2 text-end">خالص</th>
                <th className="px-3 py-2 text-center">نرخ</th>
                <th className="px-3 py-2 text-end">مالیات و عوارض</th>
                <th className="px-3 py-2 text-end">مبلغ نهایی</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-3 py-2">{toPersianDigits(String(item.rowNo))}</td>
                  <td className="px-3 py-2">{item.description}</td>
                  <td className="px-3 py-2 text-center">{formatQuantity(item.quantity)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {formatMoney(item.unitPrice, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {formatMoney(item.grossAmount, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {formatMoney(item.discountAmount, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {formatMoney(item.netAmount, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.taxMode === 'PERCENT' ? formatRateBp(item.taxRateBp) : 'دستی'}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {formatMoney(item.taxAmount, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-end font-medium tabular-nums">
                    {formatMoney(item.totalAmount, { withUnit: false })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/30 font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={4}>
                  جمع فاکتور
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {formatMoney(invoice.grossAmount, { withUnit: false })}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {formatMoney(invoice.discountAmount, { withUnit: false })}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {formatMoney(invoice.netAmount, { withUnit: false })}
                </td>
                <td />
                <td className="px-3 py-2 text-end tabular-nums">
                  {formatMoney(invoice.taxAmount, { withUnit: false })}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {formatMoney(invoice.totalAmount, { withUnit: false })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </article>
  );
}

function Field({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? 'mt-0.5 font-bold tabular-nums' : 'mt-0.5 tabular-nums'}>{value}</dd>
    </div>
  );
}

/** خطای ثبت نهایی می‌تواند چند مشکل را هم‌زمان داشته باشد؛ همه نمایش داده می‌شوند. */
function describeError(error: ApiError): string {
  if (error.details.length === 0) return error.message;
  return [error.message, ...error.details.map((detail) => `• ${detail.message}`)].join('\n');
}
