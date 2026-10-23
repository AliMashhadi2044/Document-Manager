import { useState, type ReactNode } from 'react';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  PAYMENT_METHOD_KIND_LABELS,
  ROUNDING_MODE_LABELS,
  ROUNDING_SCOPE_LABELS,
  jalaliMonthName,
  type PaymentMethodKind,
} from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { PlateBadge } from '../../shared/ui/plate-input';
import { Input } from '../../shared/ui/input';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import {
  formatIsoAsJalali,
  formatMoney,
  formatQuantity,
  formatRateBp,
  formatServerMessage,
  toPersianDigits,
} from '../../shared/format/money';
import {
  useDocument,
  useFinalizeDocument,
  useReopenDocument,
  useRevisions,
  useSendBackForRevision,
  useSendToArchive,
  type InvoiceRow,
} from './documents.api';
import { CreateInvoiceForm } from '../invoices/create-invoice-form';
import { DocumentEditDialog } from './document-edit-dialog';
import { useDeleteInvoice } from '../invoices/invoices.api';
import { AttachmentsPanel } from '../files/attachments-panel';
import { FeedbackPanel } from '../feedback/feedback-panel';
import { useCurrentUser } from '../auth/auth.api';
import { ReportPreview } from '../reports/report-preview';

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
  const sendToArchive = useSendToArchive();
  const sendBack = useSendBackForRevision();
  const { data: user } = useCurrentUser();

  const [reason, setReason] = useState('');
  const [showReopen, setShowReopen] = useState(false);
  const [showSendBack, setShowSendBack] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const removeInvoice = useDeleteInvoice();
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  if (isPending) return <LoadingState label="در حال بارگذاری سند…" />;
  if (isError) {
    return <ErrorState message="دریافت سند ناموفق بود" onRetry={() => void refetch()} />;
  }

  const permissions = user?.permissions ?? [];

  if (showReport && user) {
    return (
      <ReportPreview documentId={documentId} user={user} onBack={() => setShowReport(false)} />
    );
  }

  const editable = data.status === 'DRAFT' || data.status === 'REOPENED';
  // «ارجاع به بایگانی» فقط روی سند ثبت‌شده معنا دارد و فقط کار کارپردازی است.
  const canSendToArchive =
    data.status === 'FINALIZED' && permissions.includes('document:send_to_archive');
  // «ارجاع برای اصلاح» کار ناظر است؛ مجوزش همان مجوز ثبت بازخورد است.
  const canSendBack =
    permissions.includes('feedback:create') &&
    (data.status === 'FINALIZED' || data.status === 'PENDING_ARCHIVE' || data.status === 'ARCHIVED');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={onBack}>
          بازگشت به فهرست
        </Button>

        <div className="flex gap-2">
          {editable ? (
            <Button variant="secondary" onClick={() => setShowAddInvoice((value) => !value)}>
              افزودن فاکتور
            </Button>
          ) : null}
          {permissions.includes('report:run') && data.status !== 'DRAFT' ? (
            <Button variant="secondary" onClick={() => setShowReport(true)}>
              گزارش مالیات
            </Button>
          ) : null}
          {canSendToArchive ? (
            <Button
              variant="secondary"
              loading={sendToArchive.isPending}
              onClick={() => {
                setNotice(null);
                sendToArchive.mutate(documentId, {
                  onSuccess: () => {
                    setNotice({
                      kind: 'success',
                      text: 'سند به بایگانی ارجاع شد. ثبت شماره و تاریخ سند و بارگذاری اسکن، کار بایگانی است.',
                    });
                    void refetch();
                  },
                  onError: (error) =>
                    setNotice({
                      kind: 'error',
                      text:
                        error instanceof ApiError
                          ? formatServerMessage(error.message)
                          : 'ارجاع به بایگانی ناموفق بود',
                    }),
                });
              }}
            >
              ارجاع به بایگانی
            </Button>
          ) : null}
          {canSendBack ? (
            <Button variant="secondary" onClick={() => setShowSendBack((value) => !value)}>
              ارجاع برای اصلاح
            </Button>
          ) : null}
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
          ) : permissions.includes('document:reopen') ? (
            <Button variant="secondary" onClick={() => setShowReopen((value) => !value)}>
              بازگشایی سند
            </Button>
          ) : null}
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
                        text:
                          error instanceof ApiError
                            ? formatServerMessage(error.message)
                            : 'خطا در بازگشایی',
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

      {showSendBack && canSendBack ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">ارجاع سند برای اصلاح</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            ثبت علت الزامی است و برای کارپردازی اعلان ساخته می‌شود. وضعیت سند به «نیازمند
            اصلاح» می‌رود و مبالغ دست‌نخورده می‌مانند.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-72 flex-1">
              <Input
                label="علت ارجاع"
                required
                value={sendBackReason}
                onChange={(event) => setSendBackReason(event.target.value)}
              />
            </div>
            <Button
              loading={sendBack.isPending}
              disabled={!sendBackReason.trim()}
              onClick={() => {
                setNotice(null);
                sendBack.mutate(
                  { id: documentId, reason: sendBackReason.trim() },
                  {
                    onSuccess: () => {
                      setSendBackReason('');
                      setShowSendBack(false);
                      setNotice({ kind: 'success', text: 'سند برای اصلاح ارجاع شد.' });
                      void refetch();
                    },
                    onError: (error) =>
                      setNotice({
                        kind: 'error',
                        text:
                          error instanceof ApiError
                            ? formatServerMessage(error.message)
                            : 'ارجاع برای اصلاح ناموفق بود',
                      }),
                  },
                );
              }}
            >
              ارجاع برای اصلاح
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
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-2 py-1 text-xs">
              {DOCUMENT_STATUS_LABELS[data.status]}
            </span>

            {/*
              ویرایش کنار وضعیت است، نه در فهرست اقدام‌های پایین: همین‌جاست که کاربر
              شرح و سال اشتباه را می‌بیند. پس از ثبت نهایی دکمه نیست — سند دیگر
              ویرایش نمی‌شود و بازگشایی راه خودش را دارد.
            */}
            {editable ? (
              <button
                type="button"
                aria-label="ویرایش مشخصات سند"
                title="ویرایش مشخصات سند"
                onClick={() => setEditing(true)}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-90"
              >
                <Icon name="edit" size={15} />
              </button>
            ) : null}
          </div>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Field label="خریدار" value={data.buyerSnapshot.name} />
          <Field label="شماره سند" value={data.documentNumber ?? 'ثبت نشده (بایگانی)'} />
          <Field
            label="سیاست گرد کردن"
            value={`${ROUNDING_SCOPE_LABELS[data.roundingPolicy.scope]} · ${
              ROUNDING_MODE_LABELS[data.roundingPolicy.mode]
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

      {editing ? (
        <DocumentEditDialog
          document={data}
          onClose={() => setEditing(false)}
          onSaved={(text) => {
            setEditing(false);
            void refetch();
            setNotice({ kind: 'success', text });
          }}
        />
      ) : null}

      {showAddInvoice && editable ? (
        <CreateInvoiceForm
          documentId={documentId}
          documentJalaliYear={data.jalaliYear}
          policy={data.roundingPolicy}
          // گروه بودجهٔ سند را اولین فاکتورش تعیین می‌کند؛ بعد از آن قفل است.
          lockedCategoryKey={data.invoices[0]?.chapter.category.key ?? null}
          onClose={() => setShowAddInvoice(false)}
          onCreated={() => {
            void refetch();
            setNotice({ kind: 'success', text: 'فاکتور ثبت شد.' });
          }}
        />
      ) : null}

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">فاکتورها (به ترتیب تاریخ صورتحساب)</h3>

        {data.invoices.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            این سند هنوز فاکتوری ندارد.
            {editable ? ' با دکمه «افزودن فاکتور» اولین فاکتور را ثبت کنید.' : ''}
          </p>
        ) : null}

        {data.invoices.map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice}
            onRemove={
              editable
                ? () => {
                    setNotice(null);
                    removeInvoice.mutate(invoice.id, {
                      onSuccess: () => void refetch(),
                      onError: (error) =>
                        setNotice({
                          kind: 'error',
                          text:
                            error instanceof ApiError
                              ? formatServerMessage(error.message)
                              : 'خطا در حذف فاکتور',
                        }),
                    });
                  }
                : undefined
            }
          />
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

      {permissions.includes('attachment:read') ? (
        <AttachmentsPanel
          documentId={documentId}
          canUpload={permissions.includes('attachment:upload') && data.status !== 'ARCHIVED'}
          canDelete={permissions.includes('attachment:delete') && data.status !== 'ARCHIVED'}
        />
      ) : null}

      {user && permissions.includes('feedback:read') && data.status !== 'DRAFT' ? (
        <FeedbackPanel documentId={documentId} user={user} />
      ) : null}

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

function InvoiceCard({
  invoice,
  onRemove,
}: {
  invoice: InvoiceRow;
  onRemove?: (() => void) | undefined;
}): JSX.Element {
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
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium money">
            {formatMoney(invoice.totalAmount)}
          </span>
          {onRemove ? (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              حذف فاکتور
            </Button>
          ) : null}
        </div>
      </header>

      {/* جزئیات اختصاصی از snapshot خود فاکتور می‌آیند، نه از اطلاعات پایه امروز. */}
      {invoice.utilityDetail ? (
        <dl className="grid gap-4 border-b border-border px-5 py-4 text-sm sm:grid-cols-3">
          <Field label="مدرسه" value={invoice.utilityDetail.schoolTitleSnapshot} />
          <Field label="ناحیه" value={invoice.utilityDetail.districtTitleSnapshot} />
          <Field label="نوع انشعاب" value={invoice.utilityDetail.utilityTypeTitleSnapshot} />
        </dl>
      ) : null}

      {invoice.fuelDetail ? (
        <dl className="grid gap-4 border-b border-border px-5 py-4 text-sm sm:grid-cols-4">
          <Field label="نوع خودرو" value={invoice.fuelDetail.vehicleTypeTitleSnapshot} />
          <Field
            label="پلاک"
            value={<PlateBadge plate={invoice.fuelDetail.plateNumberSnapshot} />}
          />
          <Field label="نوع سوخت" value={invoice.fuelDetail.fuelTypeTitleSnapshot} />
          <Field
            label="ماه"
            value={`${jalaliMonthName(invoice.fuelDetail.jalaliMonth)} ${toPersianDigits(
              String(invoice.fuelDetail.jalaliYear),
            )}`}
          />
        </dl>
      ) : null}

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
        {/* تنخواه‌دار فقط وقتی دیده می‌شود که ثبت شده باشد؛ خانهٔ خالی «—» ارزشی ندارد. */}
        {invoice.payment?.pettyCashHolderNameSnapshot ? (
          <Field
            label="تنخواه‌دار"
            value={
              <>
                {invoice.payment.pettyCashHolderNameSnapshot}
                {invoice.payment.pettyCashAccountHolderSnapshot &&
                invoice.payment.pettyCashAccountHolderSnapshot !==
                  invoice.payment.pettyCashHolderNameSnapshot ? (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {`حساب به نام ${invoice.payment.pettyCashAccountHolderSnapshot}`}
                    {invoice.payment.pettyCashBankTitleSnapshot
                      ? ` · ${invoice.payment.pettyCashBankTitleSnapshot}`
                      : ''}
                  </span>
                ) : null}
              </>
            }
          />
        ) : null}
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
                  <td className="px-3 py-2">
                    {/* ردیف سوخت، تاریخ ذخیره‌شده خودش را نشان می‌دهد. */}
                    {item.fuelEntry
                      ? `سوخت‌گیری ${formatIsoAsJalali(item.fuelEntry.entryDate)}`
                      : item.description}
                  </td>
                  <td className="px-3 py-2 text-center">{formatQuantity(item.quantity)}</td>
                  <td className="px-3 py-2 text-end money">
                    {formatMoney(item.unitPrice, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-end money">
                    {formatMoney(item.grossAmount, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-end money">
                    {formatMoney(item.discountAmount, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-end money">
                    {formatMoney(item.netAmount, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.taxMode === 'PERCENT' ? formatRateBp(item.taxRateBp) : 'دستی'}
                  </td>
                  <td className="px-3 py-2 text-end money">
                    {formatMoney(item.taxAmount, { withUnit: false })}
                  </td>
                  <td className="px-3 py-2 text-end font-medium money">
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
                <td className="px-3 py-2 text-end money">
                  {formatMoney(invoice.grossAmount, { withUnit: false })}
                </td>
                <td className="px-3 py-2 text-end money">
                  {formatMoney(invoice.discountAmount, { withUnit: false })}
                </td>
                <td className="px-3 py-2 text-end money">
                  {formatMoney(invoice.netAmount, { withUnit: false })}
                </td>
                <td />
                <td className="px-3 py-2 text-end money">
                  {formatMoney(invoice.taxAmount, { withUnit: false })}
                </td>
                <td className="px-3 py-2 text-end money">
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
  value: ReactNode;
  strong?: boolean;
}): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? 'mt-0.5 font-bold money' : 'mt-0.5 money'}>{value}</dd>
    </div>
  );
}

/** خطای ثبت نهایی می‌تواند چند مشکل را هم‌زمان داشته باشد؛ همه نمایش داده می‌شوند. */
function describeError(error: ApiError): string {
  const lines =
    error.details.length === 0
      ? [error.message]
      : [error.message, ...error.details.map((detail) => `• ${detail.message}`)];
  // ارقام لاتین پیام سرور در لایه نمایش فارسی می‌شوند.
  return formatServerMessage(lines.join('\n'));
}
