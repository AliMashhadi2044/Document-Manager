import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import {
  downloadReport,
  useReportPreview,
  type ReportBlock,
  type ReportTableBlock,
} from './reports.api';
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
  const preview = useReportPreview(REPORT_TYPE_KEY, documentId);
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

      <article
        dir="rtl"
        className="rounded-lg border border-border bg-card p-6 print:border-0 print:p-0"
      >
        <header className="space-y-1 text-center">
          {report.header.map((block) => (
            <RenderBlock key={block.id} block={block} />
          ))}
        </header>

        <div className="mt-5 space-y-5">
          {report.body.map((block) =>
            block.kind === 'table' ? (
              <ReportTable
                key={block.id}
                table={block}
                rowVendorIds={rowVendorIds}
                onProductType={
                  canSetProductType
                    ? (vendorId, vendorName) => setProductTypeFor({ vendorId, vendorName })
                    : undefined
                }
                onDetails={(vendorId, vendorName) => setDetailsFor({ vendorId, vendorName })}
              />
            ) : (
              <RenderBlock key={block.id} block={block} />
            ),
          )}
        </div>

        <footer className="mt-8">
          {report.footer.map((block) => (
            <RenderBlock key={block.id} block={block} />
          ))}
        </footer>
      </article>

      {productTypeFor ? (
        <ProductTypeDialog
          documentId={documentId}
          vendorId={productTypeFor.vendorId}
          vendorName={productTypeFor.vendorName}
          reportTypeKey={REPORT_TYPE_KEY}
          onClose={() => setProductTypeFor(null)}
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

function RenderBlock({ block }: { block: ReportBlock }): JSX.Element | null {
  switch (block.kind) {
    case 'text':
      return (
        <p
          className={[
            block.bold ? 'font-bold' : '',
            block.align === 'center' ? 'text-center' : block.align === 'end' ? 'text-end' : 'text-start',
          ].join(' ')}
          style={block.fontSizePt === null ? undefined : { fontSize: `${block.fontSizePt}pt` }}
        >
          {block.text}
        </p>
      );

    case 'variable':
      return (
        <p className="text-sm">
          {block.labelFa ? <span className="text-muted-foreground">{block.labelFa}: </span> : null}
          {block.text}
        </p>
      );

    case 'divider':
      return <hr className="my-3 border-border" />;

    case 'spacer':
      return <div style={{ height: `${block.heightMm}mm` }} />;

    case 'signature':
      return <SignatureBlock block={block} />;

    case 'signatureRow':
      return (
        <div className="flex flex-wrap justify-between gap-10">
          {block.blocks.map((item) => (
            <SignatureBlock key={item.id} block={item} />
          ))}
        </div>
      );

    case 'pageNumber':
      return null; // شماره صفحه را موتور چاپ پر می‌کند، نه نمایش روی صفحه.

    case 'table':
      return null; // جدول مسیر خودش را دارد (اقدام‌های ردیف).
  }
}

function SignatureBlock({
  block,
}: {
  block: Extract<ReportBlock, { kind: 'signature' }>;
}): JSX.Element {
  return (
    <div className="min-w-48 break-inside-avoid text-center">
      <div className="font-bold">{block.positionTitle}</div>
      <div style={{ height: `${block.spaceMm}mm` }} />
      <div className="font-bold">{block.fullName}</div>
    </div>
  );
}

function ReportTable({
  table,
  rowVendorIds,
  onProductType,
  onDetails,
}: {
  table: ReportTableBlock;
  rowVendorIds: readonly string[];
  onProductType?: ((vendorId: string, vendorName: string) => void) | undefined;
  onDetails: (vendorId: string, vendorName: string) => void;
}): JSX.Element {
  // شناسه فروشنده ستون گزارش نیست؛ از همان ردیف خوانده می‌شود تا اقدام‌ها بدانند روی
  // کدام فروشنده کار می‌کنند. ستون «طرف قرارداد» نام را دارد.
  const nameIndex = table.columns.findIndex((column) => column.key === 'counterparty');

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          {table.columns.map((column) => (
            <col
              key={column.key}
              style={
                column.width.unit === 'auto' || column.width.value === undefined
                  ? undefined
                  : {
                      width:
                        column.width.unit === 'mm'
                          ? `${column.width.value}mm`
                          : `${column.width.value}%`,
                    }
              }
            />
          ))}
          <col className="no-print" style={{ width: '22mm' }} />
        </colgroup>

        <thead>
          <tr>
            {table.columns.map((column) => (
              <th
                key={column.key}
                className="border border-border px-1.5 py-1 text-center font-bold"
              >
                {column.titleFa}
              </th>
            ))}
            <th className="no-print border border-border px-1.5 py-1 text-center">اقدام</th>
          </tr>
        </thead>

        <tbody>
          {table.rows.map((row, rowIndex) => {
            const vendorName = nameIndex >= 0 ? (row[nameIndex]?.text ?? '') : '';
            const vendorId = rowVendorIds[rowIndex] ?? '';

            return (
              <tr key={`row-${rowIndex}`} className="break-inside-avoid">
                {row.map((cell, cellIndex) => (
                  <td
                    key={table.columns[cellIndex]?.key ?? cellIndex}
                    className={`border border-border px-1.5 py-1 align-middle ${alignClass(cell.align)}`}
                  >
                    <span className="block leading-6">{cell.text}</span>
                    {cell.extraLines.map((line, lineIndex) => (
                      <span
                        key={`line-${lineIndex}`}
                        className={`block leading-6 ${line.muted ? 'text-[0.9em] text-muted-foreground' : ''}`}
                      >
                        {line.text}
                      </span>
                    ))}
                  </td>
                ))}
                <td className="no-print border border-border px-1 py-1 text-center">
                  <RowActions
                    vendorId={vendorId}
                    vendorName={vendorName}
                    onProductType={onProductType}
                    onDetails={onDetails}
                  />
                </td>
              </tr>
            );
          })}

          {/* ردیف‌های خالی فرم چاپی — در پیش‌نمایش هم همان شکل را دارد. */}
          {Array.from({ length: table.fildlerRowCount }, (_, index) => (
            <tr key={`filler-${index}`}>
              {table.columns.map((column) => (
                <td
                  key={column.key}
                  className={`h-8 border border-border px-1.5 py-1 ${alignClass(column.align)}`}
                >
                  {column.isNumeric ? '۰' : ''}
                </td>
              ))}
              <td className="no-print border border-border" />
            </tr>
          ))}
        </tbody>

        {/*
          ردیف جمع آخرین ردیف بدنه است، نه tfoot: tfoot در چاپ روی هر صفحه تکرار
          می‌شود و «جمع کل» تکرارشده، به‌جای جمع همه ردیف‌ها، جمع همان صفحه خوانده
          می‌شود.
        */}
        {table.totals ? (
          <tbody>
            <tr className="font-bold">
              {table.totals.map((cell, index) => (
                <td
                  key={table.columns[index]?.key ?? index}
                  className={`border border-border px-1.5 py-1 ${alignClass(cell.align)}`}
                >
                  {index === 0 && table.totalsLabel !== null ? table.totalsLabel : cell.text}
                </td>
              ))}
              <td className="no-print border border-border" />
            </tr>
          </tbody>
        ) : null}
      </table>
    </div>
  );
}

function RowActions({
  vendorId,
  vendorName,
  onProductType,
  onDetails,
}: {
  vendorId: string;
  vendorName: string;
  onProductType?: ((vendorId: string, vendorName: string) => void) | undefined;
  onDetails: (vendorId: string, vendorName: string) => void;
}): JSX.Element | null {
  if (vendorId === '') return null;

  return (
    <div className="flex flex-col gap-0.5">
      {onProductType ? (
        <button
          type="button"
          className="rounded px-1 py-0.5 text-[11px] text-primary hover:bg-muted"
          onClick={() => onProductType(vendorId, vendorName)}
        >
          نوع کالا
        </button>
      ) : null}
      <button
        type="button"
        className="rounded px-1 py-0.5 text-[11px] text-primary hover:bg-muted"
        onClick={() => onDetails(vendorId, vendorName)}
      >
        جزئیات
      </button>
    </div>
  );
}

function alignClass(align: 'start' | 'center' | 'end'): string {
  return align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start';
}
