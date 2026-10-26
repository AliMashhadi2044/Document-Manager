import { useEffect, useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Modal } from '../../shared/ui/modal';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import {
  formatIsoAsJalali,
  formatMoney,
  formatServerMessage,
  toPersianDigits,
} from '../../shared/format/money';
import { useBeneficiaryDetails, type BeneficiaryDetails } from './reports.api';

/**
 * جزئیات یک مقصد پرداخت.
 *
 * فرم کاغذی مرجع پنج ستون «فاکتور ۱ تا ۵» داشت. آن ستون‌ها برای سندی که شش فاکتور
 * دارد کم می‌آورند و برای سندی که یکی دارد، چهار ستون خالی چاپ می‌کنند — پس روی
 * کاغذ فقط **جمع** هر مقصد می‌آید و ریزش اینجاست، جایی که فضا محدود نیست.
 *
 * ستون «سهم این مقصد» کنار «مبلغ فاکتور» می‌آید و نه به‌جای آن: در پرداخت ترکیبی
 * این دو با هم فرق دارند، و کاربری که فقط سهم را ببیند فکر می‌کند مبلغ فاکتور
 * اشتباه ثبت شده است.
 */
export function BeneficiaryDetailsDialog({
  documentId,
  beneficiaryKey,
  title,
  onClose,
}: {
  documentId: string;
  beneficiaryKey: string;
  title: string;
  onClose: () => void;
}): JSX.Element {
  const load = useBeneficiaryDetails();
  const [data, setData] = useState<BeneficiaryDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load.mutate(
      { documentId, key: beneficiaryKey },
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
    // وابستگی عمداً فقط سند و مقصد است؛ تابع mutate هر رندر تازه ساخته می‌شود.
  }, [documentId, beneficiaryKey]);

  const hasPartial = data?.invoices.some((invoice) => invoice.isPartial) ?? false;

  return (
    <Modal title={`جزئیات مقصد پرداخت — ${title}`} onClose={onClose}>
      {error ? <ErrorState message={error} /> : null}
      {!data && !error ? <LoadingState label="در حال خواندن جزئیات…" /> : null}

      {data ? (
        <div className="space-y-4">
          <dl className="grid gap-3 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
            <Field label="شماره شبا / شناسه" value={toPersianDigits(data.identifier)} />
            {data.secondaryIdentifier ? (
              <Field label="شناسه پرداخت" value={toPersianDigits(data.secondaryIdentifier)} />
            ) : null}
            <Field label="نام صاحب حساب" value={data.accountHolder} />
            <Field label="نام بانک" value={data.bankTitle || '—'} />
          </dl>

          <p className="text-sm text-muted-foreground">
            این ردیف از {toPersianDigits(String(data.invoices.length))} فاکتور ساخته شده است.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-1.5 text-start">فاکتور</th>
                  <th className="px-2 py-1.5 text-end">مبلغ فاکتور</th>
                  <th className="px-2 py-1.5 text-end">سهم این مقصد</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border">
                    <td className="px-2 py-1.5">
                      <span className="block">
                        {invoice.invoiceTypeTitle}
                        {invoice.invoiceNumber
                          ? ` — شماره ${toPersianDigits(invoice.invoiceNumber)}`
                          : ''}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {invoice.vendorName || 'بدون فروشنده'} · {invoice.chapterTitle} ·{' '}
                        {formatIsoAsJalali(invoice.invoiceDate)}
                      </span>
                    </td>
                    <td className="money px-2 py-1.5 text-end text-muted-foreground">
                      {formatMoney(invoice.invoiceTotal, { withUnit: false })}
                    </td>
                    <td className="money px-2 py-1.5 text-end font-medium">
                      {formatMoney(invoice.amount, { withUnit: false })}
                      {invoice.isPartial ? (
                        <span className="ms-1 text-[10px] font-normal text-warning">(ترکیبی)</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="px-2 py-2">جمع این مقصد</td>
                  <td />
                  <td className="money px-2 py-2 text-end">
                    {formatMoney(data.total, { withUnit: false })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {hasPartial ? (
            <p className="rounded-md bg-warning/10 p-3 text-xs leading-6 text-warning">
              فاکتور «ترکیبی» پرداختش بین کارپرداز و ذی‌نفع تقسیم شده است، پس فقط بخشی از
              مبلغش به این مقصد می‌رود. بخش دیگرش در ردیف مقصد دیگر دیده می‌شود.
            </p>
          ) : null}

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

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
