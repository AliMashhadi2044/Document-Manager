import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@dm/shared';

import { apiFetch, ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { BuyerDialog } from '../buyers/buyer-dialog';
import { LookupQuickDialog } from '../base-data/lookup-quick-dialog';
import { Card, CardHeader } from '../../shared/ui/card';
import { YearInput } from '../../shared/ui/year-input';
import { JalaliDatePicker } from '../../shared/ui/date-picker';
import { useOrganization } from '../organization/organization.api';
import { useActiveBuyers } from '../buyers/buyers.api';
import { useCreateDocument } from './documents.api';

interface BootstrapData {
  readonly fiscalYears: ReadonlyArray<{ year: number; isClosed: boolean }>;
  readonly stadRequestTypes: ReadonlyArray<{ id: string; title: string }>;
}

export function CreateDocumentForm({ onClose }: { onClose: () => void }): JSX.Element {
  const buyers = useActiveBuyers();
  const bootstrap = useQuery({
    queryKey: ['base-data', 'bootstrap'],
    queryFn: () => apiFetch<BootstrapData>('/base-data/bootstrap'),
    staleTime: 5 * 60_000,
  });

  const create = useCreateDocument();
  const organization = useOrganization();

  const [type, setType] = useState<DocumentType>('NORMAL');
  const [title, setTitle] = useState('');
  const [fiscalYear, setFiscalYear] = useState('');
  const [jalaliYear, setJalaliYear] = useState('');
  const [yearsTouched, setYearsTouched] = useState(false);
  const [buyerEntityId, setBuyerEntityId] = useState('');
  const [buyerTouched, setBuyerTouched] = useState(false);
  /*
    گفت‌وگوی «ساخت سریع» که از داخل همین فرم باز می‌شود.

    یک متغیر برای همهٔ آن‌ها و نه یکی برای هرکدام: هم‌زمان بیش از یکی باز نمی‌شود و
    با چند متغیر بولی، حالت‌های ناممکن (دو گفت‌وگوی باز) قابل بیان می‌شد.
  */
  const [quick, setQuick] = useState<'buyer' | 'stad-request-types' | null>(null);
  const [needNumber, setNeedNumber] = useState('');
  /** گردش: برای **هر دو نوع سند**، پس بیرون از بلوک ستاد زندگی می‌کند. */
  const [workflowNumber, setWorkflowNumber] = useState('');
  const [workflowDate, setWorkflowDate] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState('');
  const [requestTypeId, setRequestTypeId] = useState('');
  const [stadNotes, setStadNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  /**
   * مجموعه پیش‌فرض، از پیش انتخاب می‌شود.
   *
   * در عمل همیشه یک مجموعه غالب است؛ بدون این، کاربر هر بار یک انتخاب تکراری
   * انجام می‌دهد. `buyerTouched` جلوی بازگرداندن انتخابِ خودِ کاربر را می‌گیرد.
   */
  useEffect(() => {
    if (buyerTouched || buyerEntityId !== '') return;
    const fallback = buyers.data?.items.find((buyer) => buyer.isDefault);
    if (fallback) setBuyerEntityId(fallback.id);
  }, [buyerTouched, buyerEntityId, buyers.data]);

  /**
   * سال‌های پیش‌فرض از تنظیمات سازمان.
   *
   * اگر تنظیم نشده باشند، تازه‌ترین سال مالی باز جایشان را می‌گیرد — عددی که در کد
   * نوشته نشده و با گذشت سال، کهنه نمی‌شود.
   */
  useEffect(() => {
    if (yearsTouched) return;

    const settings = organization.data;
    const latestOpen = (bootstrap.data?.fiscalYears ?? []).find((year) => !year.isClosed);

    const fiscalDefault = settings?.defaultFiscalYear ?? latestOpen?.year ?? null;
    const jalaliDefault = settings?.defaultJalaliYear ?? fiscalDefault;

    if (fiscalYear === '' && fiscalDefault !== null) setFiscalYear(String(fiscalDefault));
    if (jalaliYear === '' && jalaliDefault !== null) setJalaliYear(String(jalaliDefault));
  }, [yearsTouched, fiscalYear, jalaliYear, organization.data, bootstrap.data]);

  // سال‌های بسته برای سند جدید قابل انتخاب نیستند — سرور هم همین را اجبار می‌کند.
  const openYears = (bootstrap.data?.fiscalYears ?? []).filter((year) => !year.isClosed);

  return (
    <Card>
      <CardHeader
        icon="plus"
        title="ایجاد سند جدید"
        description="نوع سند، مجموعه خریدار و سال مالی پس از ایجاد قابل تغییر نیستند."
      />

      <form
        className="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          create.mutate(
            {
              title: title.trim(),
              type,
              fiscalYear: Number(fiscalYear),
              jalaliYear: Number(jalaliYear),
              buyerEntityId,
              workflowNumber: workflowNumber.trim() || null,
              workflowDate,
              stad:
                type === 'STAD'
                  ? {
                      needNumber: needNumber.trim() || null,
                      requestNumber: requestNumber.trim(),
                      requestTypeId: requestTypeId || null,
                      notes: stadNotes.trim() || null,
                    }
                  : null,
            },
            {
              onSuccess: () => {
                setTitle('');
                setMessage('سند ایجاد شد.');
              },
              onError: (error) =>
                setMessage(error instanceof ApiError ? error.message : 'خطا در ایجاد سند'),
            },
          );
        }}
      >
        <div className="md:col-span-2">
          <span className="block text-sm font-medium">نوع سند</span>
          <div className="mt-1.5 flex gap-2">
            {(['NORMAL', 'STAD'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={type === value ? 'primary' : 'secondary'}
                aria-pressed={type === value}
                onClick={() => setType(value)}
              >
                {DOCUMENT_TYPE_LABELS[value]}
              </Button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <Input
            label="شرح سند"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <Select
          id="buyer"
          label="مجموعه خریدار"
          required
          value={buyerEntityId}
          onChange={(nextValue) => {
            setBuyerTouched(true);
            setBuyerEntityId(nextValue);
          }}
          options={(buyers.data?.items ?? []).map((buyer) => ({
            value: buyer.id,
            label: buyer.name,
            description: buyer.isDefault ? 'پیش‌فرض' : undefined,
          }))}
          emptyLabel="مجموعه خریداری ثبت نشده است"
          onCreate={() => setQuick('buyer')}
          createLabel="افزودن مجموعه خریدار"
          hint="اگر مجموعه‌ای که می‌خواهید نیست، از پایین همین فهرست بسازیدش."
        />

        {/* قابل انتخاب از فهرست و قابل تایپ دستی (§۹ پرامپت). */}
        <YearInput
          id="fiscalYear"
          label="سال مالی"
          required
          value={fiscalYear}
          onChange={(next) => {
            setYearsTouched(true);
            setFiscalYear(next);
          }}
          suggestions={openYears.map((year) => year.year)}
          hint="از تنظیمات سازمان پر می‌شود؛ با دکمه‌ها یا کلید بالا/پایین تغییر بدهید."
        />

        <YearInput
          id="jalaliYear"
          label="سال شمسی"
          required
          value={jalaliYear}
          onChange={(next) => {
            setYearsTouched(true);
            setJalaliYear(next);
          }}
          hint="مستقل از سال مالی است."
        />

        {/*
          گردش — برای **هر دو نوع سند**.

          پیش از این شمارهٔ گردش داخل بلوک ستاد بود و سند عادی جایی برای ثبتش
          نداشت، در حالی که گردش کاغذی به ستاد ربطی ندارد. هر دو اختیاری‌اند:
          گردش ممکن است هنوز شماره نگرفته باشد.
        */}
        <Input
          label="شماره گردش"
          value={workflowNumber}
          maxLength={100}
          onChange={(event) => setWorkflowNumber(event.target.value)}
          hint="اختیاری"
        />
        <JalaliDatePicker
          label="تاریخ گردش"
          value={workflowDate}
          onChange={setWorkflowDate}
          hint="اختیاری"
        />

        {/* فیلدهای شرطی سند ستاد — در همان مرحله ایجاد (§۹). */}
        {type === 'STAD' ? (
          <>
            <Input
              label="شماره نیاز"
              maxLength={50}
              value={needNumber}
              onChange={(event) => setNeedNumber(event.target.value)}
              hint="اختیاری · حداکثر ۵۰ نویسه"
            />
            <Input
              label="شماره درخواست"
              required
              value={requestNumber}
              onChange={(event) => setRequestNumber(event.target.value)}
            />
            <Select
              id="requestType"
              label="نوع درخواست"
              value={requestTypeId}
              onChange={(nextValue) => setRequestTypeId(nextValue)}
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

        {message ? (
          <p
            role="status"
            className={
              message === 'سند ایجاد شد.'
                ? 'rounded-lg bg-success/10 p-3 text-sm text-success md:col-span-2'
                : 'rounded-lg bg-destructive/10 p-3 text-sm text-destructive md:col-span-2'
            }
          >
            {message}
          </p>
        ) : null}

        <div className="flex gap-2 border-t border-border pt-4 md:col-span-2">
          <Button type="submit" loading={create.isPending} disabled={!title.trim() || !buyerEntityId}>
            ایجاد سند
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>

      {quick === 'buyer' ? (
        <BuyerDialog
          buyer={null}
          onClose={() => setQuick(null)}
          onSaved={(created) => {
            // همان رکورد تازه، بی‌درنگ انتخاب می‌شود؛ وگرنه کاربر باید دوباره دنبالش
            // بگردد و ساختِ درجا نصفه می‌ماند.
            setBuyerTouched(true);
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
    </Card>
  );
}
