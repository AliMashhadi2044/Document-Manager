import { useEffect, useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { Select } from '../../shared/ui/select';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import {
  formatIsoAsJalali,
  formatMoney,
  formatServerMessage,
  toPersianDigits,
} from '../../shared/format/money';
import { LookupQuickDialog } from '../base-data/lookup-quick-dialog';
import {
  useProductTypeSuggestions,
  useSetProductType,
  type ProductTypeSuggestions,
} from './reports.api';

/**
 * دیالوگ «تعیین نوع کالا» (§۲۲ پرامپت).
 *
 * ─────── مقدار از کجا می‌آید ───────
 *
 * «نوع کالا» در عمل همان **شرح فاکتور** است. پس ستون گزارش بدون هیچ کاری هم پر
 * است: اگر کاربر چیزی ثبت نکرده باشد، شرح اولین فاکتور همان فروشنده در همین سند
 * می‌نشیند. این دیالوگ برای وقتی است که کاربر بخواهد عوضش کند.
 *
 * چهار راه، به ترتیبی که معمولاً به کار می‌آیند:
 *
 *  ۱. **شرح فاکتورهای همین سند** — اگر فروشنده دو فاکتور داشته باشد، هر دو شرح
 *     اینجاست و کاربر یکی را می‌زند. اولی، همان پیش‌فرض است.
 *  ۲. **تاریخچه**: شرحی که برای همین فروشنده در اسناد قبلی نوشته شده، با سند و
 *     فصل و تاریخ و مبلغش. فاکتور بی‌شرح اصلاً در فهرست نمی‌آید.
 *  ۳. **انواع تعریف‌شده**، با پیشنهاد بر اساس انتخاب‌های قبلی همین فروشنده — و
 *     ساخت نوع تازه، همان‌جا.
 *  ۴. **نوشتن متن آزاد**.
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
  /** انتخاب از فهرست انواع؛ خالی یعنی مقدار از متن می‌آید. */
  const [typeId, setTypeId] = useState('');
  const [text, setText] = useState('');
  const [newType, setNewType] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = (preselect: boolean): void => {
    load.mutate(
      { documentId, vendorId },
      {
        onSuccess: (result) => {
          setData(result);
          if (!preselect) return;

          if (result.current?.id) {
            setTypeId(result.current.id);
            setText('');
          } else {
            // ثبت‌نشده: پیش‌فرض همان چیزی است که گزارش هم نشان می‌دهد.
            setTypeId('');
            setText(result.current?.title ?? result.invoiceDescriptions[0]?.description ?? '');
          }
        },
        onError: (caught) =>
          setError(
            caught instanceof ApiError
              ? formatServerMessage(caught.message)
              : 'خواندن پیشنهادها ناموفق بود',
          ),
      },
    );
  };

  useEffect(() => {
    refresh(true);
    // عمداً فقط به سند و فروشنده وابسته است: شیء mutation در هر رندر تازه ساخته
    // می‌شود و گذاشتنش در وابستگی‌ها یعنی درخواست بی‌پایان.
  }, [documentId, vendorId]);

  /** انتخاب یک متن: فهرست انواع آزاد می‌شود تا دو منبع هم‌زمان فعال نباشند. */
  const pickText = (value: string): void => {
    setText(value);
    setTypeId('');
  };

  const value = typeId !== '' ? (data?.allTypes.find((t) => t.id === typeId)?.title ?? '') : text;

  return (
    <>
      <Modal title={`نوع کالا — ${vendorName}`} onClose={onClose}>
        {error ? <ErrorState message={error} /> : null}
        {!data && !error ? <LoadingState label="در حال خواندن پیشنهادها…" /> : null}

        {data ? (
          <div className="space-y-5">
            {/* ۱. شرح فاکتورهای همین سند */}
            {data.invoiceDescriptions.length > 0 ? (
              <section>
                <h4 className="text-sm font-semibold">
                  شرح فاکتورهای این فروشنده در همین سند
                  {data.invoiceDescriptions.length > 1
                    ? ` (${toPersianDigits(String(data.invoiceDescriptions.length))} فاکتور)`
                    : ''}
                </h4>
                <ul className="mt-2 space-y-1.5">
                  {data.invoiceDescriptions.map((invoice, index) => (
                    <li key={invoice.invoiceId}>
                      <button
                        type="button"
                        onClick={() => pickText(invoice.description)}
                        className={
                          text === invoice.description && typeId === ''
                            ? 'flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-primary bg-primary/10 p-2.5 text-start'
                            : 'flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-start hover:bg-muted'
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {invoice.description}
                            {index === 0 ? (
                              <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                پیش‌فرض
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {invoice.invoiceTypeTitle} · {invoice.chapterTitle} ·{' '}
                            {formatIsoAsJalali(invoice.invoiceDate)}
                          </span>
                        </span>
                        <span className="money shrink-0 text-sm">
                          {formatMoney(invoice.totalAmount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* ۲. تاریخچه — فقط فاکتورهایی که شرح دارند */}
            <section>
              <h4 className="text-sm font-semibold">آنچه قبلاً برای این فروشنده نوشته شده</h4>
              {data.recentPurchases.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  فاکتور شرح‌داری از این فروشنده در اسناد قابل مشاهدهٔ شما نیست.
                </p>
              ) : (
                <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                  {data.recentPurchases.map((purchase) => (
                    <li key={purchase.id}>
                      <button
                        type="button"
                        onClick={() => pickText(purchase.description)}
                        className={
                          text === purchase.description && typeId === ''
                            ? 'flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-primary bg-primary/10 p-2.5 text-start'
                            : 'flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-start hover:bg-muted'
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {purchase.description}
                          </span>
                          {/* همان جمله‌ای که کاربر لازم دارد: کجا، چه فصلی، کِی، چند. */}
                          <span className="block truncate text-xs text-muted-foreground">
                            در سند «{purchase.document.title}» · فصل {purchase.chapterTitle} ·{' '}
                            {formatIsoAsJalali(purchase.invoiceDate)}
                          </span>
                        </span>
                        <span className="money shrink-0 text-sm">
                          {formatMoney(purchase.totalAmount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ۳. انواع تعریف‌شده */}
            <section className="space-y-2 border-t border-border pt-4">
              {data.suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => {
                        setTypeId(suggestion.id);
                        setText('');
                      }}
                      className={
                        typeId === suggestion.id
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
              ) : null}

              <Select
                label="یا یکی از انواع تعریف‌شده"
                placeholder="انتخاب نشده"
                value={typeId}
                onChange={(next) => {
                  setTypeId(next);
                  if (next !== '') setText('');
                }}
                options={data.allTypes.map((type) => ({ value: type.id, label: type.title }))}
                onCreate={() => setNewType(true)}
                createLabel="افزودن نوع کالا"
              />
            </section>

            {/* ۴. متن آزاد */}
            <Input
              label="یا متن دلخواه"
              value={text}
              onChange={(event) => pickText(event.target.value)}
              hint="همین متن در ستون «نوع کالا»ی گزارش می‌نشیند."
            />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {value === '' ? (
                  'هنوز چیزی انتخاب نشده است.'
                ) : (
                  <>
                    <Icon name="check" size={13} className="me-1 inline align-[-2px]" />
                    در گزارش می‌نشیند: <span className="font-medium text-foreground">{value}</span>
                  </>
                )}
              </p>

              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onClose}>
                  انصراف
                </Button>
                <Button
                  size="sm"
                  loading={save.isPending}
                  disabled={value.trim() === ''}
                  onClick={() => {
                    setError(null);
                    save.mutate(
                      typeId !== ''
                        ? { vendorId, productTypeId: typeId }
                        : { vendorId, customTitle: text.trim() },
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
          </div>
        ) : null}
      </Modal>

      {newType ? (
        <LookupQuickDialog
          resource="product-types"
          titleFa="نوع کالا"
          onClose={() => setNewType(false)}
          onCreated={(created) => {
            // فهرست تازه خوانده می‌شود تا نوعِ نو در `allTypes` باشد؛ انتخاب
            // دست‌نخورده می‌ماند و همان‌جا روی نوع تازه می‌نشیند.
            setTypeId(created.id);
            setText('');
            setNewType(false);
            refresh(false);
          }}
        />
      ) : null}
    </>
  );
}
