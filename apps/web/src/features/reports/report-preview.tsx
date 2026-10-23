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
import type { CurrentUser } from '../auth/auth.api';

const REPORT_TYPE_KEY = 'TAX_REPORT';

/**
 * پیش‌نمایش گزارش مالیات.
 *
 * نکته‌ای که شکل این صفحه را تعیین می‌کند: **اینجا هیچ قاعده‌ای از گزارش پیاده نشده
 * است.** ستون‌ها، ترتیبشان، قالب اعدادشان و ردیف جمع همگی از سند چیدمانی می‌آیند که
 * سرور با قالب ساخته است. اگر فردا قالب در طراح بصری عوض شود، این صفحه بدون تغییر
 * همان را نشان می‌دهد — که اصل «گزارش تازه بدون تغییر کد» است.
 *
 * دو اقدام روی هر ردیف هست که جزو خود گزارش نیستند و کار کاربرند: «تعیین نوع کالا» و
 * «جزئیات مبالغ».
 */
export function ReportPreview({
  documentId,
  user,
  onBack,
}: {
  documentId: string;
  user: CurrentUser;
  onBack: () => void;
}): JSX.Element {
  /*
    متن‌های سربرگ که کاربر برای همین خروجی عوض کرده است.

    در حالت صفحه می‌مانند، نه در قالب: تغییر به همین اجرا محدود است و همان متن‌ها
    با هر خروجی (چاپ، PDF، Excel، HTML) می‌روند، تا فایل با آنچه روی صفحه دیده
    می‌شود یکی باشد.
  */
  const [textOverrides, setTextOverrides] = useState<TextOverrides>({});
  const [editingHeader, setEditingHeader] = useState(false);

  const preview = useReportPreview(REPORT_TYPE_KEY, documentId, textOverrides);
  const [productTypeFor, setProductTypeFor] = useState<{ vendorId: string; vendorName: string } | null>(
    null,
  );
  const [detailsFor, setDetailsFor] = useState<{ vendorId: string; vendorName: string } | null>(null);
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

  const { report, skippedInvoiceCount, rowCount, rowVendorIds } = preview.data;
  const canSetProductType = user.permissions.includes('document:update');
  const canExport = user.permissions.includes('report:export');

  async function download(format: 'excel' | 'html' | 'pdf'): Promise<void> {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadReport(
        REPORT_TYPE_KEY,
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

      {/* هشدار شمارش‌شده §۸: کاربر باید بداند چند فاکتور در گزارش نیامده‌اند. */}
      {skippedInvoiceCount > 0 ? (
        <p role="status" className="no-print rounded-md bg-warning/10 p-3 text-sm text-warning">
          {toPersianDigits(String(skippedInvoiceCount))} فاکتور بدون فروشنده در این گزارش نیامده
          است. گزارش مالیات بر اساس فروشنده تجمیع می‌شود و فاکتور بدون فروشنده ردیفی ندارد.
        </p>
      ) : null}

      {rowCount === 0 ? (
        <p className="no-print rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">
          هیچ فروشنده‌ای در این سند فاکتور ندارد، پس گزارش ردیفی ندارد.
        </p>
      ) : null}

      <ReportView
        report={report}
        rowVendorIds={rowVendorIds}
        onProductType={
          canSetProductType
            ? (vendorId, vendorName) => setProductTypeFor({ vendorId, vendorName })
            : undefined
        }
        onDetails={(vendorId, vendorName) => setDetailsFor({ vendorId, vendorName })}
      />

      {productTypeFor ? (
        <ProductTypeDialog
          documentId={documentId}
          vendorId={productTypeFor.vendorId}
          vendorName={productTypeFor.vendorName}
          reportTypeKey={REPORT_TYPE_KEY}
          onClose={() => setProductTypeFor(null)}
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
