import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DOCUMENT_TYPE_LABELS } from '@dm/shared';

import { apiFetch, ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { Select } from '../../shared/ui/select';
import { YearInput } from '../../shared/ui/year-input';
import { JalaliDatePicker } from '../../shared/ui/date-picker';
import { formatServerMessage } from '../../shared/format/money';
import { BuyerDialog } from '../buyers/buyer-dialog';
import { LookupQuickDialog } from '../base-data/lookup-quick-dialog';
import { useActiveBuyers } from '../buyers/buyers.api';
import { useUpdateDocument, type DocumentDetail } from './documents.api';

interface BootstrapData {
  readonly fiscalYears: ReadonlyArray<{ year: number; isClosed: boolean }>;
  readonly stadRequestTypes: ReadonlyArray<{ id: string; title: string }>;
}

/**
 * ویرایش مشخصات سند، پیش از ثبت نهایی.
 *
 * تا پیش از این، همان چیزهایی که در فرم ایجاد پرسیده می‌شد — شرح، سال، خریدار،
 * اطلاعات ستاد — بعد از ساخته شدن سند قفل بودند و کاربری که سال را اشتباه زده بود
 * باید سند را رها می‌کرد و از نو می‌ساخت.
 *
 * **نوع سند اینجا نیست.** نوع، ساختار سند را تعیین می‌کند (سند ستاد فقط یک فاکتور
 * می‌گیرد و جدول اطلاعات ستاد دارد) و روی فاکتورها هم denormal شده است؛ عوض کردنش
 * یعنی ساختن سندی دیگر. پس فقط نشان داده می‌شود.
 */
export function DocumentEditDialog({
  document,
  onClose,
  onSaved,
}: {
  document: DocumentDetail;
  onClose: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const buyers = useActiveBuyers();
  const bootstrap = useQuery({
    queryKey: ['base-data', 'bootstrap'],
    queryFn: () => apiFetch<BootstrapData>('/base-data/bootstrap'),
    staleTime: 5 * 60_000,
  });
  const update = useUpdateDocument();

  const [title, setTitle] = useState(document.title);
  const [fiscalYear, setFiscalYear] = useState(String(document.fiscalYear));
  const [jalaliYear, setJalaliYear] = useState(String(document.jalaliYear));
  const [buyerEntityId, setBuyerEntityId] = useState(document.buyerEntityId);
  const [needNumber, setNeedNumber] = useState(document.stadMetadata?.needNumber ?? '');
  /** گردش روی خودِ سند است، نه اطلاعات ستاد — پس برای سند عادی هم پر می‌شود. */
  const [workflowNumber, setWorkflowNumber] = useState(document.workflowNumber ?? '');
  const [workflowDate, setWorkflowDate] = useState<string | null>(
    document.workflowDate?.slice(0, 10) ?? null,
  );
  const [requestNumber, setRequestNumber] = useState(document.stadMetadata?.requestNumber ?? '');
  const [requestTypeId, setRequestTypeId] = useState(document.stadMetadata?.requestTypeId ?? '');
  const [stadNotes, setStadNotes] = useState(document.stadMetadata?.notes ?? '');
  const [quick, setQuick] = useState<'buyer' | 'stad-request-types' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isStad = document.type === 'STAD';
  const buyerChanged = buyerEntityId !== document.buyerEntityId;

  // سال بسته انتخاب‌شدنی نیست؛ سال فعلیِ سند می‌ماند حتی اگر بعداً بسته شده باشد.
  const years = (bootstrap.data?.fiscalYears ?? [])
    .filter((year) => !year.isClosed || year.year === document.fiscalYear)
    .map((year) => year.year);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    update.mutate(
      {
        id: document.id,
        title: title.trim(),
        fiscalYear: Number(fiscalYear),
        jalaliYear: Number(jalaliYear),
        buyerEntityId,
        workflowNumber: workflowNumber.trim() || null,
        workflowDate,
        ...(isStad
          ? {
              stad: {
                needNumber: needNumber.trim() || null,
                requestNumber: requestNumber.trim(),
                requestTypeId: requestTypeId || null,
                notes: stadNotes.trim() || null,
              },
            }
          : {}),
      },
      {
        onSuccess: () => onSaved('مشخصات سند اصلاح شد.'),
        onError: (caught) =>
          setError(
            caught instanceof ApiError ? formatServerMessage(caught.message) : 'ثبت اصلاح ناموفق بود',
          ),
      },
    );
  };

  return (
    <>
      <Modal title="ویرایش مشخصات سند" onClose={onClose}>
        <form className="grid gap-x-5 gap-y-4 md:grid-cols-2" onSubmit={submit}>
          <div className="md:col-span-2">
            <Input
              label="شرح سند"
              required
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              hint={`نوع سند «${DOCUMENT_TYPE_LABELS[document.type]}» است و تغییر نمی‌کند.`}
            />
          </div>

          <Select
            label="مجموعه خریدار"
            required
            value={buyerEntityId}
            onChange={setBuyerEntityId}
            options={(buyers.data?.items ?? []).map((buyer) => ({
              value: buyer.id,
              label: buyer.name,
              description: buyer.isDefault ? 'پیش‌فرض' : undefined,
            }))}
            emptyLabel="مجموعه خریداری ثبت نشده است"
            onCreate={() => setQuick('buyer')}
            createLabel="افزودن مجموعه خریدار"
            {...(buyerChanged && document.invoices.length > 0
              ? {
                  hint: `مشخصات خریدار روی ${document.invoices.length === 1 ? 'فاکتور این سند' : 'همهٔ فاکتورهای این سند'} هم تازه می‌شود.`,
                }
              : {})}
          />

          <YearInput
            label="سال مالی"
            required
            value={fiscalYear}
            onChange={setFiscalYear}
            suggestions={years}
          />

          <YearInput
            label="سال شمسی"
            required
            value={jalaliYear}
            onChange={setJalaliYear}
            hint="مستقل از سال مالی است."
          />

          {/* گردش — هر دو نوع سند؛ به ستاد ربطی ندارد. */}
          <Input
            label="شماره گردش"
            maxLength={100}
            value={workflowNumber}
            onChange={(event) => setWorkflowNumber(event.target.value)}
            hint="اختیاری"
          />
          <JalaliDatePicker
            label="تاریخ گردش"
            value={workflowDate}
            onChange={setWorkflowDate}
            hint="اختیاری"
          />

          {isStad ? (
            <>
              <div className="md:col-span-2 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">اطلاعات سامانه ستاد</h3>
              </div>

              <Input
                label="شماره نیاز"
                maxLength={50}
                value={needNumber}
                onChange={(event) => setNeedNumber(event.target.value)}
                hint="اختیاری"
              />
              <Input
                label="شماره درخواست"
                required
                value={requestNumber}
                onChange={(event) => setRequestNumber(event.target.value)}
              />
              <Select
                label="نوع درخواست"
                value={requestTypeId}
                onChange={setRequestTypeId}
                options={(bootstrap.data?.stadRequestTypes ?? []).map((item) => ({
                  value: item.id,
                  label: item.title,
                }))}
                onCreate={() => setQuick('stad-request-types')}
                createLabel="افزودن نوع درخواست"
              />
              <div className="md:col-span-2">
                <Input
                  label="توضیحات ستاد"
                  value={stadNotes}
                  onChange={(event) => setStadNotes(event.target.value)}
                />
              </div>
            </>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="md:col-span-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="md:col-span-2 flex gap-2 border-t border-border pt-4">
            <Button
              type="submit"
              loading={update.isPending}
              disabled={title.trim() === '' || buyerEntityId === ''}
            >
              ثبت اصلاح
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              انصراف
            </Button>
          </div>
        </form>
      </Modal>

      {quick === 'buyer' ? (
        <BuyerDialog
          buyer={null}
          onClose={() => setQuick(null)}
          onSaved={(created) => {
            setBuyerEntityId(created.id);
            setQuick(null);
          }}
        />
      ) : null}

      {quick === 'stad-request-types' ? (
        <LookupQuickDialog
          resource="stad-request-types"
          titleFa="نوع درخواست"
          onClose={() => setQuick(null)}
          onCreated={(created) => {
            setRequestTypeId(created.id);
            setQuick(null);
          }}
        />
      ) : null}
    </>
  );
}
