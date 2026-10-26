import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatIsoAsJalali, formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useDocuments } from '../documents/documents.api';
import { downloadReport, useReportRuns, type ReportPreview } from '../reports/reports.api';
import { ReportView } from '../reports/report-view';
import { usePreviewVersion, useReproduceRun } from './templates.api';

/**
 * پیش‌نمایش طراح با **داده واقعی**، و تاریخچه خروجی‌ها.
 *
 * دو چیز اینجا اثبات می‌شوند، نه ادعا:
 *
 *  ۱. **پیش‌نمایش از سرور می‌آید.** قالب ذخیره‌شده (نسخه پیش‌نویس) روی یک سند واقعی
 *     اجرا می‌شود و همان موتور و همان مجوزهای زمان اجرا را می‌بیند. اگر پیش‌نمایش را
 *     مرورگر می‌ساخت، «درست بودنش» چیزی درباره خروجی واقعی نمی‌گفت.
 *
 *  ۲. **بازتولید خروجی تاریخی.** هر اجرا شناسه نسخه قالبش را نگه داشته؛ «بازتولید»
 *     همان نسخه را اجرا می‌کند، نه نسخه جاری. پس می‌شود با چشم دید که انتشار نسخه ۲،
 *     خروجی نسخه ۱ را عوض نکرده است.
 */
export function DesignerPreview({
  versionId,
  reportTypeKey,
  canExport,
  isActiveDefinition,
}: {
  versionId: string | null;
  reportTypeKey: string;
  canExport: boolean;
  isActiveDefinition: boolean;
}): JSX.Element {
  const [search, setSearch] = useState('');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const documents = useDocuments(1, search);
  const runs = useReportRuns(documentId);
  const run = usePreviewVersion();
  const reproduce = useReproduceRun();

  function runPreview(target: string): void {
    if (versionId === null) return;
    setError(null);
    run.mutate(
      { versionId, documentId: target },
      {
        onSuccess: (result) => {
          setPreview(result);
          setPreviewLabel('پیش‌نمایش نسخه در حال ویرایش');
        },
        onError: (caught) =>
          setError(
            caught instanceof ApiError
              ? formatServerMessage(caught.message)
              : 'اجرای پیش‌نمایش ناموفق بود',
          ),
      },
    );
  }

  async function download(format: 'excel' | 'pdf'): Promise<void> {
    if (documentId === null) return;
    setError(null);
    setDownloading(true);
    try {
      await downloadReport(reportTypeKey, documentId, format, `report.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? formatServerMessage(caught.message) : 'دریافت خروجی ناموفق بود',
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">سندی را برای پیش‌نمایش انتخاب کنید</h3>

        <Input
          label="جست‌وجوی سند"
          value={search}
          placeholder="شرح یا شماره سند"
          onChange={(event) => setSearch(event.target.value)}
        />

        {documents.isPending ? <LoadingState label="در حال خواندن اسناد…" /> : null}
        {documents.isError ? (
          <ErrorState message="خواندن فهرست اسناد ناموفق بود" onRetry={() => void documents.refetch()} />
        ) : null}

        {documents.data ? (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {documents.data.items.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">سندی پیدا نشد.</li>
            ) : null}
            {documents.data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDocumentId(item.id);
                    setPreview(null);
                  }}
                  className={[
                    'flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted',
                    documentId === item.id ? 'bg-primary/5' : '',
                  ].join(' ')}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {toPersianDigits(String(item.jalaliYear))} ·{' '}
                    {formatMoney(item.totalAmount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={documentId === null || versionId === null}
            loading={run.isPending}
            onClick={() => (documentId === null ? undefined : runPreview(documentId))}
          >
            اجرای پیش‌نمایش
          </Button>

          {canExport && isActiveDefinition ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={documentId === null}
                loading={downloading}
                onClick={() => void download('excel')}
              >
                خروجی Excel
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={documentId === null}
                loading={downloading}
                onClick={() => void download('pdf')}
              >
                خروجی PDF
              </Button>
            </>
          ) : null}
        </div>

        {canExport && !isActiveDefinition ? (
          <p className="text-xs text-muted-foreground">
            خروجی Excel و PDF از «قالب فعال» این نوع گزارش ساخته می‌شود. تا این قالب را
            فعال نکنید، دانلود همان قالب قبلی را می‌دهد؛ پس عمداً در دسترس نیست.
          </p>
        ) : null}

        {versionId === null ? (
          <p className="text-xs text-warning">
            برای پیش‌نمایش، ابتدا پیش‌نویس را ذخیره کنید: قالب هرگز همراه درخواست اجرا
            فرستاده نمی‌شود و اجرا با شناسه نسخه ذخیره‌شده انجام می‌شود.
          </p>
        ) : null}

        {error ? <ErrorState message={error} /> : null}
      </section>

      {documentId !== null ? (
        <section className="space-y-2 rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">تاریخچه خروجی‌های این سند</h3>

          {runs.isPending ? <LoadingState label="در حال خواندن تاریخچه…" /> : null}
          {runs.data?.length === 0 ? (
            <p className="text-xs text-muted-foreground">هنوز خروجی‌ای از این سند گرفته نشده است.</p>
          ) : null}

          {runs.data && runs.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-2 py-1.5 text-start">زمان</th>
                    <th className="px-2 py-1.5 text-start">قالب</th>
                    <th className="px-2 py-1.5 text-start">خروجی</th>
                    <th className="px-2 py-1.5 text-start">ردیف</th>
                    <th className="px-2 py-1.5 text-start">کاربر</th>
                    <th className="px-2 py-1.5 text-start">اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.map((item) => (
                    <tr key={item.id} className="border-b border-border">
                      <td className="px-2 py-1.5">{formatIsoAsJalali(item.createdAt)}</td>
                      <td className="px-2 py-1.5">
                        {item.version
                          ? `نسخه ${toPersianDigits(String(item.version.versionNo))}`
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5">{item.outputFormat}</td>
                      <td className="px-2 py-1.5">
                        {item.rowCount === null ? '—' : toPersianDigits(String(item.rowCount))}
                      </td>
                      <td className="px-2 py-1.5">{item.requestedBy?.fullName ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => {
                            setError(null);
                            reproduce.mutate(
                              { runId: item.id },
                              {
                                onSuccess: (result) => {
                                  setPreview(result);
                                  setPreviewLabel(
                                    `بازتولید اجرای ${formatIsoAsJalali(item.createdAt)} با نسخه ${toPersianDigits(
                                      String(item.version?.versionNo ?? 0),
                                    )}`,
                                  );
                                },
                                onError: (caught) =>
                                  setError(
                                    caught instanceof ApiError
                                      ? formatServerMessage(caught.message)
                                      : 'بازتولید ناموفق بود',
                                  ),
                              },
                            );
                          }}
                        >
                          بازتولید
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="text-[11px] leading-5 text-muted-foreground">
            بازتولید، همان نسخه قالبِ آن اجرا را دوباره اجرا می‌کند. محدودیت صادقانه:
            داده سند از امروز خوانده می‌شود، نه از نسخه ثبت‌شده سند؛ پس بازتولید «همان
            قالب» را تضمین می‌کند، نه «همان داده».
          </p>
        </section>
      ) : null}

      {preview ? (
        <section className="space-y-2">
          <div className="no-print flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{previewLabel}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{toPersianDigits(String(preview.rowCount))} ردیف</span>
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                چاپ
              </Button>
            </div>
          </div>

          {preview.skippedInvoiceCount > 0 ? (
            <p role="status" className="no-print rounded-md bg-warning/10 p-3 text-sm text-warning">
              {toPersianDigits(String(preview.skippedInvoiceCount))} فاکتور بدون فروشنده در این
              گزارش نیامده است.
            </p>
          ) : null}

          <ReportView report={preview.report} />
        </section>
      ) : null}
    </div>
  );
}
