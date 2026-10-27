import { useEffect, useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { Select } from '../../shared/ui/select';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage } from '../../shared/format/money';
import { LookupQuickDialog } from '../base-data/lookup-quick-dialog';
import { useLineTitleSuggestions, useSetLineTitle, type LineTitleSuggestions } from './reports.api';

/**
 * دیالوگ «شرح ردیف» در فرم ریزهزینه.
 *
 * ستون شرح بدون هیچ کاری هم پر است: پیش‌فرضش شرح خودِ فاکتور است. این دیالوگ برای
 * وقتی است که عبارتِ روی فرم باید فرق کند — کوتاه‌تر، یا یکی از «انواع کالا».
 *
 * شرح خودِ فاکتور **عوض نمی‌شود**: آن حقیقتِ تاریخیِ سند است و در بازبینی به آن
 * استناد می‌شود. پس دکمهٔ «بازگشت به پیش‌فرض» هم هست — بدون آن، کاربری که یک بار
 * عبارتی نوشته راهی برای پس گرفتنش نداشت.
 */
export function LineTitleDialog({
  documentId,
  invoiceId,
  reportTypeKey,
  onClose,
}: {
  documentId: string;
  invoiceId: string;
  reportTypeKey: string;
  onClose: () => void;
}): JSX.Element {
  const load = useLineTitleSuggestions();
  const save = useSetLineTitle(reportTypeKey, documentId);

  const [data, setData] = useState<LineTitleSuggestions | null>(null);
  /** انتخاب از فهرست انواع؛ خالی یعنی مقدار از متن می‌آید. */
  const [typeId, setTypeId] = useState('');
  const [text, setText] = useState('');
  const [newType, setNewType] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = (preselect: boolean): void => {
    load.mutate(
      { documentId, invoiceId },
      {
        onSuccess: (result) => {
          setData(result);
          if (!preselect) return;

          if (result.current?.id) {
            setTypeId(result.current.id);
            setText('');
          } else {
            // ثبت‌نشده: پیش‌فرض همان چیزی است که فرم هم نشان می‌دهد.
            setTypeId('');
            setText(result.current?.title ?? result.invoiceDescription);
          }
        },
        onError: (caught) =>
          setError(
            caught instanceof ApiError
              ? formatServerMessage(caught.message)
              : 'خواندن گزینه‌ها ناموفق بود',
          ),
      },
    );
  };

  useEffect(() => {
    refresh(true);
    // عمداً فقط به سند و فاکتور وابسته است: شیء mutation در هر رندر تازه ساخته
    // می‌شود و گذاشتنش در وابستگی‌ها یعنی درخواست بی‌پایان.
  }, [documentId, invoiceId]);

  /** انتخاب یک متن: فهرست انواع آزاد می‌شود تا دو منبع هم‌زمان فعال نباشند. */
  const pickText = (value: string): void => {
    setText(value);
    setTypeId('');
  };

  const value = typeId !== '' ? (data?.allTypes.find((t) => t.id === typeId)?.title ?? '') : text;

  const fail = (caught: unknown): void =>
    setError(
      caught instanceof ApiError ? formatServerMessage(caught.message) : 'ثبت شرح ناموفق بود',
    );

  return (
    <>
      <Modal title="شرح ردیف در فرم ریزهزینه" onClose={onClose}>
        {error ? <ErrorState message={error} /> : null}
        {!data && !error ? <LoadingState label="در حال خواندن گزینه‌ها…" /> : null}

        {data ? (
          <div className="space-y-5">
            {/* ۱. پیش‌فرض: شرح خودِ فاکتور */}
            <section>
              <h4 className="text-sm font-semibold">شرح این فاکتور</h4>
              {data.invoiceDescription === '' ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  این فاکتور شرحی ندارد، پس ستون شرح بدون انتخاب شما خالی می‌ماند.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => pickText(data.invoiceDescription)}
                  className={
                    text === data.invoiceDescription && typeId === ''
                      ? 'mt-2 w-full rounded-lg border border-primary bg-primary/10 p-2.5 text-start text-sm'
                      : 'mt-2 w-full rounded-lg border border-border p-2.5 text-start text-sm hover:bg-muted'
                  }
                >
                  {data.invoiceDescription}
                  <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    پیش‌فرض
                  </span>
                </button>
              )}
            </section>

            {/* ۲. انواع تعریف‌شده */}
            <section className="border-t border-border pt-4">
              <Select
                label="یا یکی از انواع کالا"
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

            {/* ۳. متن آزاد */}
            <Input
              label="یا متن دلخواه"
              maxLength={500}
              value={text}
              onChange={(event) => pickText(event.target.value)}
              hint="همین متن در ستون «شرح» فرم می‌نشیند؛ شرح خودِ فاکتور عوض نمی‌شود."
            />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {value === '' ? (
                  'هنوز چیزی انتخاب نشده است.'
                ) : (
                  <>
                    <Icon name="check" size={13} className="me-1 inline align-[-2px]" />
                    در فرم می‌نشیند: <span className="font-medium text-foreground">{value}</span>
                  </>
                )}
              </p>

              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onClose}>
                  انصراف
                </Button>
                {/*
                  بازگشت به پیش‌فرض فقط وقتی معنا دارد که چیزی ثبت شده باشد؛ وگرنه
                  دکمه‌ای است که هیچ کاری نمی‌کند.
                */}
                {data.current ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={save.isPending}
                    onClick={() => {
                      setError(null);
                      save.mutate(
                        { invoiceId, productTypeId: null, customTitle: null },
                        { onSuccess: () => onClose(), onError: fail },
                      );
                    }}
                  >
                    بازگشت به پیش‌فرض
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  loading={save.isPending}
                  disabled={value.trim() === ''}
                  onClick={() => {
                    setError(null);
                    save.mutate(
                      typeId !== ''
                        ? { invoiceId, productTypeId: typeId }
                        : { invoiceId, customTitle: text.trim() },
                      { onSuccess: () => onClose(), onError: fail },
                    );
                  }}
                >
                  ثبت شرح
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
