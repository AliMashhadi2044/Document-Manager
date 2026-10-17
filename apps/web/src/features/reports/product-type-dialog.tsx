import { useEffect, useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Modal } from '../../shared/ui/modal';
import { Select } from '../../shared/ui/select';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatIsoAsJalali, formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import {
  useProductTypeSuggestions,
  useSetProductType,
  type ProductTypeSuggestions,
} from './reports.api';

/**
 * دیالوگ «تعیین نوع کالا» (§۲۲ پرامپت).
 *
 * سه چیز با هم نشان داده می‌شوند، چون تصمیمِ درست بدون هر سه سخت است:
 *  ۱. انتخاب فعلی، اگر قبلاً ثبت شده باشد.
 *  ۲. **پیشنهادهای اختصاصی همین فروشنده** بر اساس انتخاب‌های قبلی، با تعداد استفاده.
 *  ۳. **خریدهای قبلی همین فروشنده** — چون «این فروشنده چه می‌فروشد» را از فاکتورهایش
 *     بهتر می‌شود فهمید تا از فهرست انواع کالا.
 *
 * خریدهای قبلی فقط از اسنادی می‌آیند که همین کاربر حق دیدنشان را دارد؛ فیلتر در
 * کوئری سرور است، نه بعد از خواندن.
 */
export function ProductTypeDialog({
  documentId,
  vendorId,
  vendorName,
  reportTypeKey,
  onClose,
}: {
  documentId: string;
  vendorId: string;
  vendorName: string;
  reportTypeKey: string;
  onClose: () => void;
}): JSX.Element {
  const load = useProductTypeSuggestions();
  const save = useSetProductType(reportTypeKey, documentId);

  const [data, setData] = useState<ProductTypeSuggestions | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load.mutate(
      { documentId, vendorId },
      {
        onSuccess: (result) => {
          setData(result);
          setSelected(result.current?.id ?? '');
        },
        onError: (caught) =>
          setError(
            caught instanceof ApiError
              ? formatServerMessage(caught.message)
              : 'خواندن پیشنهادها ناموفق بود',
          ),
      },
    );
    // عمداً فقط به سند و فروشنده وابسته است: شیء mutation در هر رندر تازه ساخته
    // می‌شود و گذاشتنش در وابستگی‌ها یعنی درخواست بی‌پایان.
  }, [documentId, vendorId]);

  return (
    <Modal title={`نوع کالا — ${vendorName}`} onClose={onClose}>
      {error ? <ErrorState message={error} /> : null}
      {!data && !error ? <LoadingState label="در حال خواندن پیشنهادها…" /> : null}

      {data ? (
        <div className="space-y-5">
          {data.suggestions.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold">پیشنهاد بر اساس انتخاب‌های قبلی</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => setSelected(suggestion.id)}
                    className={
                      selected === suggestion.id
                        ? 'rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm text-primary'
                        : 'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted'
                    }
                  >
                    {suggestion.title}
                    <span className="ms-1.5 text-xs text-muted-foreground">
                      ({toPersianDigits(String(suggestion.useCount))} بار)
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Select
            label="نوع کالا"
            required
            placeholder="انتخاب کنید"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            options={data.allTypes.map((type) => ({ value: type.id, label: type.title }))}
          />

          <div>
            <h4 className="text-sm font-semibold">خریدهای قبلی از این فروشنده</h4>
            {data.recentPurchases.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                خرید قبلی ثبت‌شده‌ای از این فروشنده در دسترس شما نیست.
              </p>
            ) : (
              <ul className="mt-2 max-h-48 divide-y divide-border overflow-y-auto text-sm">
                {data.recentPurchases.map((purchase) => (
                  <li key={purchase.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate">{purchase.document.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {purchase.chapterTitle} · {formatIsoAsJalali(purchase.invoiceDate)}
                        {purchase.invoiceNumber
                          ? ` · شماره ${toPersianDigits(purchase.invoiceNumber)}`
                          : ''}
                      </p>
                    </div>
                    <span className="money">{formatMoney(purchase.totalAmount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              انصراف
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              disabled={selected === ''}
              onClick={() => {
                setError(null);
                save.mutate(
                  { vendorId, productTypeId: selected },
                  {
                    onSuccess: () => onClose(),
                    onError: (caught) =>
                      setError(
                        caught instanceof ApiError
                          ? formatServerMessage(caught.message)
                          : 'ثبت نوع کالا ناموفق بود',
                      ),
                  },
                );
              }}
            >
              ثبت نوع کالا
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
