import { useEffect, useState } from 'react';
import { INVOICE_KIND_REGISTRY, type InvoiceKind } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Modal } from '../../shared/ui/modal';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatIsoAsJalali, formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useAmountDetails, type AmountDetails } from './reports.api';

/**
 * دیالوگ «جزئیات مبالغ» (§۲۲ پرامپت).
 *
 * ردیف گزارش یک تجمیع است و عددش بدون زمینه قابل بررسی نیست. اینجا همان فاکتورهایی
 * که ردیف را ساخته‌اند — به **همان ترتیب قطعی** که تجمیع استفاده می‌کند — با مبالغشان
 * فهرست می‌شوند و ردیف جمع، همان عدد ردیف گزارش است.
 */
export function AmountDetailsDialog({
  documentId,
  vendorId,
  vendorName,
  onClose,
}: {
  documentId: string;
  vendorId: string;
  vendorName: string;
  onClose: () => void;
}): JSX.Element {
  const load = useAmountDetails();
  const [data, setData] = useState<AmountDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load.mutate(
      { documentId, vendorId },
      {
        onSuccess: setData,
        onError: (caught) =>
          setError(
            caught instanceof ApiError
              ? formatServerMessage(caught.message)
              : 'خواندن جزئیات ناموفق بود',
          ),
      },
    );
    // مثل دیالوگ نوع کالا: وابستگی عمداً فقط سند و فروشنده است.
  }, [documentId, vendorId]);

  return (
    <Modal title={`جزئیات مبالغ — ${vendorName}`} onClose={onClose}>
      {error ? <ErrorState message={error} /> : null}
      {!data && !error ? <LoadingState label="در حال خواندن جزئیات…" /> : null}

      {data ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            این ردیف از {toPersianDigits(String(data.invoices.length))} فاکتور ساخته شده است.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-1.5 text-start">فاکتور</th>
                  <th className="px-2 py-1.5 text-end">مبلغ کالا</th>
                  <th className="px-2 py-1.5 text-end">تخفیف</th>
                  <th className="px-2 py-1.5 text-end">خالص</th>
                  <th className="px-2 py-1.5 text-end">مالیات و عوارض</th>
                  <th className="px-2 py-1.5 text-end">جمع</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border">
                    <td className="px-2 py-1.5">
                      <span className="block">
                        {INVOICE_KIND_REGISTRY[invoice.invoiceKind as InvoiceKind]?.titleFa ??
                          invoice.invoiceKind}
                        {invoice.invoiceNumber
                          ? ` — شماره ${toPersianDigits(invoice.invoiceNumber)}`
                          : ''}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {invoice.chapterTitle} · {formatIsoAsJalali(invoice.invoiceDate)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-end money">
                      {formatMoney(invoice.grossAmount, { withUnit: false })}
                    </td>
                    <td className="px-2 py-1.5 text-end money">
                      {formatMoney(invoice.discountAmount, { withUnit: false })}
                    </td>
                    <td className="px-2 py-1.5 text-end money">
                      {formatMoney(invoice.netAmount, { withUnit: false })}
                    </td>
                    <td className="px-2 py-1.5 text-end money">
                      {formatMoney(invoice.taxAmount, { withUnit: false })}
                    </td>
                    <td className="px-2 py-1.5 text-end money">
                      {formatMoney(invoice.totalAmount, { withUnit: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="px-2 py-2">جمع ردیف گزارش</td>
                  <td className="px-2 py-2 text-end money">
                    {formatMoney(data.totals.gross, { withUnit: false })}
                  </td>
                  <td className="px-2 py-2 text-end money">
                    {formatMoney(data.totals.discount, { withUnit: false })}
                  </td>
                  <td className="px-2 py-2 text-end money">
                    {formatMoney(data.totals.net, { withUnit: false })}
                  </td>
                  <td className="px-2 py-2 text-end money">
                    {formatMoney(data.totals.tax, { withUnit: false })}
                  </td>
                  <td className="px-2 py-2 text-end money">
                    {formatMoney(data.totals.total, { withUnit: false })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>
              بستن
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
