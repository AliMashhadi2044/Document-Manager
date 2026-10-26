import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { downloadReport, useReportPreview, type TextOverrides } from './reports.api';
import { HeaderEditDialog } from './header-edit-dialog';
import { ReportView } from './report-view';
import { ProductTypeDialog } from './product-type-dialog';
import { AmountDetailsDialog } from './amount-details-dialog';
import { BeneficiaryDetailsDialog } from './beneficiary-details-dialog';
import type { CurrentUser } from '../auth/auth.api';

const TAX = 'TAX_REPORT';
const BENEFICIARY = 'BENEFICIARY_IBAN';

/**
 * پیش‌نمایش یک گزارش سند.
 *
 * نکته‌ای که شکل این صفحه را تعیین می‌کند: **اینجا هیچ قاعده‌ای از گزارش پیاده نشده
 * است.** ستون‌ها، ترتیبشان، قالب اعدادشان و ردیف جمع همگی از سند چیدمانی می‌آیند که
 * سرور با قالب ساخته است. اگر فردا قالب در طراح بصری عوض شود، این صفحه بدون تغییر
 * همان را نشان می‌دهد — که اصل «گزارش تازه بدون تغییر کد» است.
 *
 * تنها چیزی که به گزارش بستگی دارد، **اقدام‌های روی ردیف** است؛ آن‌ها جزو گزارش
 * نیستند و کار کاربرند: گزارش مالیات «نوع کالا» و «جزئیات مبالغ» دارد، گزارش شبای
 * ذینفعان «جزئیات مقصد». نوار ابزار، چاپ، ویرایش سربرگ و خروجی‌ها برای هر دو یکی
 * است و همین باعث شد گزارش دوم بدون کپی کردن این صفحه بنشیند.
 */
export function ReportPreview({
  documentId,
  user,
  onBack,
  reportTypeKey = TAX,
}: {
  documentId: string;
  user: CurrentUser;
  onBack: () => void;
  reportTypeKey?: string;
}): JSX.Element {
  /*
    متن‌های سربرگ که کاربر برای همین خروجی عوض کرده است.

    در حالت صفحه می‌مانند، نه در قالب: تغییر به همین اجرا محدود است و همان متن‌ها
    با هر خروجی (چاپ، PDF، Excel، HTML) می‌روند، تا فایل با آنچه روی صفحه دیده
    می‌شود یکی باشد.
  */
  const [textOverrides, setTextOverrides] = useState<TextOverrides>({});
  const [editingHeader, setEditingHeader] = useState(false);

  const preview = useReportPreview(reportTypeKey, documentId, textOverrides);
  const [productTypeFor, setProductTypeFor] = useState<{ vendorId: string; vendorName: string } | null>(
    null,
  );
  const [detailsFor, setDetailsFor] = useState<{ vendorId: string; vendorName: string } | null>(null);
  const [beneficiaryFor, setBeneficiaryFor] = useState<{ key: string; title: string } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  if (preview.isPending) return <LoadingState label="در حال تولید گزارش…" />;
  if (preview.isError) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" size="sm" onClick={onBack}>
          بازگشت
        </Button>
        <ErrorState
          title="تولید گزارش ناموفق بود"
          message={
            preview.error instanceof ApiError
              ? formatServerMessage(preview.error.message)
              : 'خطای نامشخص'
          }
          onRetry={() => void preview.refetch()}
        />
      </div>
    );
  }

  const { report, skippedInvoiceCount, skippedPaymentCount, rowCount, rowVendorIds, rowKeys } =
    preview.data;
  const isBeneficiary = reportTypeKey === BENEFICIARY;
  const canSetProductType = user.permissions.includes('document:update');
  const canExport = user.permissions.includes('report:export');

  async function download(format: 'excel' | 'html' | 'pdf'): Promise<void> {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadReport(
        reportTypeKey,
        documentId,
        format,
        `${report.titleFa}.${format === 'excel' ? 'xlsx' : format}`,
        textOverrides,
      );
    } catch (error) {
      setDownloadError(
        error instanceof ApiError ? formatServerMessage(error.message) : 'دریافت خروجی ناموفق بود',
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={onBack}>
          بازگشت به سند
        </Button>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditingHeader(true)}>
            ویرایش سربرگ
            {Object.keys(textOverrides).length > 0
              ? ` (${toPersianDigits(String(Object.keys(textOverrides).length))})`
              : ''}
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            چاپ
          </Button>
          {canExport ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                loading={downloading}
                onClick={() => void download('excel')}
              >
                خروجی Excel
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={downloading}
                onClick={() => void download('pdf')}
              >
                خروجی PDF
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={downloading}
                onClick={() => void download('html')}
              >
                خروجی HTML
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {downloadError ? (
        <p role="alert" className="no-print rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {downloadError}
        </p>
      ) : null}

      {/*
        هشدار شمارش‌شده §۸ — با **دلیل درست** برای همین گزارش.

        فاکتور بدون فروشنده از گزارش مالیات می‌افتد و فاکتور بدون روش پرداخت از
        گزارش شبا؛ نشان دادن دلیل دیگری، کاربر را دنبال چیزی می‌فرستد که خراب نیست.
      */}
      {!isBeneficiary && skippedInvoiceCount > 0 ? (
        <p role="status" className="no-print rounded-md bg-warning/10 p-3 text-sm text-warning">
          {toPersianDigits(String(skippedInvoiceCount))} فاکتور بدون فروشنده در این گزارش نیامده
          است. گزارش مالیات بر اساس فروشنده تجمیع می‌شود و فاکتور بدون فروشنده ردیفی ندارد.
        </p>
      ) : null}

      {isBeneficiary && skippedPaymentCount > 0 ? (
        <p role="status" className="no-print rounded-md bg-warning/10 p-3 text-sm text-warning">
          {toPersianDigits(String(skippedPaymentCount))} فاکتور بدون روش پرداخت در این گزارش
          نیامده است. این گزارش بر اساس مقصد پرداخت تجمیع می‌شود و فاکتوری که روش پرداختش ثبت
          نشده، مقصدی ندارد.
        </p>
      ) : null}

      {rowCount === 0 ? (
        <p className="no-print rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">
          {isBeneficiary
            ? 'هیچ فاکتوری در این سند روش پرداخت ثبت‌شده ندارد، پس گزارش ردیفی ندارد.'
            : 'هیچ فروشنده‌ای در این سند فاکتور ندارد، پس گزارش ردیفی ندارد.'}
        </p>
      ) : null}

      <ReportView
        report={report}
        renderRowActions={(rowIndex, cells) => {
          if (isBeneficiary) {
            const key = rowKeys[rowIndex] ?? '';
            if (key === '') return null;
            // عنوان دیالوگ از خودِ ردیف می‌آید؛ ستون دوم شبا یا شناسهٔ قبض است.
            const label = cells[1]?.text ?? '';
            return (
              <RowButton onClick={() => setBeneficiaryFor({ key, title: label })}>
                جزئیات
              </RowButton>
            );
          }

          const vendorId = rowVendorIds[rowIndex] ?? '';
          if (vendorId === '') return null;
          const vendorName = cells[1]?.text ?? '';

          return (
            <div className="flex flex-col gap-0.5">
              {canSetProductType ? (
                <RowButton onClick={() => setProductTypeFor({ vendorId, vendorName })}>
                  نوع کالا
                </RowButton>
              ) : null}
              <RowButton onClick={() => setDetailsFor({ vendorId, vendorName })}>
                جزئیات
              </RowButton>
            </div>
          );
        }}
      />

      {productTypeFor ? (
        <ProductTypeDialog
          documentId={documentId}
          vendorId={productTypeFor.vendorId}
          vendorName={productTypeFor.vendorName}
          reportTypeKey={reportTypeKey}
          onClose={() => setProductTypeFor(null)}
        />
      ) : null}

      {beneficiaryFor ? (
        <BeneficiaryDetailsDialog
          documentId={documentId}
          beneficiaryKey={beneficiaryFor.key}
          title={beneficiaryFor.title}
          onClose={() => setBeneficiaryFor(null)}
        />
      ) : null}

      {editingHeader ? (
        <HeaderEditDialog
          blocks={[...report.header, ...report.footer]}
          overrides={textOverrides}
          onClose={() => setEditingHeader(false)}
          onApply={(next) => {
            setTextOverrides(next);
            setEditingHeader(false);
          }}
        />
      ) : null}

      {detailsFor ? (
        <AmountDetailsDialog
          documentId={documentId}
          vendorId={detailsFor.vendorId}
          vendorName={detailsFor.vendorName}
          onClose={() => setDetailsFor(null)}
        />
      ) : null}
    </div>
  );
}

/** دکمهٔ کوچک ستون «اقدام» — تنها چیزی که در این صفحه ظاهرِ مشترک دارد. */
function RowButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className="rounded px-1 py-0.5 text-[11px] text-primary hover:bg-muted"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
