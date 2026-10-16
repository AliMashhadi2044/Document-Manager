import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@dm/shared';

import { apiFetch, ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import type { PageResult } from '../base-data/base-data.api';
import { useCreateDocument } from './documents.api';

interface BuyerOption {
  readonly id: string;
  readonly name: string;
}

interface BootstrapData {
  readonly fiscalYears: ReadonlyArray<{ year: number; isClosed: boolean }>;
  readonly stadRequestTypes: ReadonlyArray<{ id: string; title: string }>;
}

export function CreateDocumentForm({ onClose }: { onClose: () => void }): JSX.Element {
  const buyers = useQuery({
    queryKey: ['buyers', 'options'],
    queryFn: () => apiFetch<PageResult<BuyerOption>>('/buyers?isActive=true&pageSize=100'),
  });
  const bootstrap = useQuery({
    queryKey: ['base-data', 'bootstrap'],
    queryFn: () => apiFetch<BootstrapData>('/base-data/bootstrap'),
    staleTime: 5 * 60_000,
  });

  const create = useCreateDocument();

  const [type, setType] = useState<DocumentType>('NORMAL');
  const [title, setTitle] = useState('');
  const [fiscalYear, setFiscalYear] = useState('1405');
  const [jalaliYear, setJalaliYear] = useState('1405');
  const [buyerEntityId, setBuyerEntityId] = useState('');
  const [needNumber, setNeedNumber] = useState('');
  const [workflowNumber, setWorkflowNumber] = useState('');
  const [requestNumber, setRequestNumber] = useState('');
  const [requestTypeId, setRequestTypeId] = useState('');
  const [stadNotes, setStadNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // سال‌های بسته برای سند جدید قابل انتخاب نیستند — سرور هم همین را اجبار می‌کند.
  const openYears = (bootstrap.data?.fiscalYears ?? []).filter((year) => !year.isClosed);

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-sm font-semibold">ایجاد سند جدید</h3>

      <form
        className="mt-4 grid gap-4 md:grid-cols-2"
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
              stad:
                type === 'STAD'
                  ? {
                      needNumber: needNumber.trim(),
                      workflowNumber: workflowNumber.trim(),
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

        <div>
          <label className="block text-sm font-medium" htmlFor="buyer">
            مجموعه خریدار <span className="text-destructive">*</span>
          </label>
          <select
            id="buyer"
            required
            value={buyerEntityId}
            onChange={(event) => setBuyerEntityId(event.target.value)}
            className="mt-1.5 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="">انتخاب کنید…</option>
            {buyers.data?.items.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>
                {buyer.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="fiscalYear">
            سال مالی <span className="text-destructive">*</span>
          </label>
          {/* قابل انتخاب از فهرست و قابل تایپ دستی (§۹ پرامپت). */}
          <input
            id="fiscalYear"
            list="fiscal-years"
            inputMode="numeric"
            required
            value={fiscalYear}
            onChange={(event) => setFiscalYear(event.target.value)}
            className="mt-1.5 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          />
          <datalist id="fiscal-years">
            {openYears.map((year) => (
              <option key={year.year} value={year.year} />
            ))}
          </datalist>
        </div>

        <div>
          <Input
            label="سال شمسی"
            required
            inputMode="numeric"
            value={jalaliYear}
            onChange={(event) => setJalaliYear(event.target.value)}
            hint="مستقل از سال مالی است."
          />
        </div>

        {/* فیلدهای شرطی سند ستاد — در همان مرحله ایجاد (§۹). */}
        {type === 'STAD' ? (
          <>
            <Input
              label="شماره نیاز"
              required
              maxLength={50}
              value={needNumber}
              onChange={(event) => setNeedNumber(event.target.value)}
              hint="حداکثر ۵۰ نویسه"
            />
            <Input
              label="شماره گردش"
              required
              value={workflowNumber}
              onChange={(event) => setWorkflowNumber(event.target.value)}
            />
            <Input
              label="شماره درخواست"
              required
              value={requestNumber}
              onChange={(event) => setRequestNumber(event.target.value)}
            />
            <div>
              <label className="block text-sm font-medium" htmlFor="requestType">
                نوع درخواست
              </label>
              <select
                id="requestType"
                value={requestTypeId}
                onChange={(event) => setRequestTypeId(event.target.value)}
                className="mt-1.5 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
              >
                <option value="">انتخاب کنید…</option>
                {bootstrap.data?.stadRequestTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
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
                ? 'rounded-md bg-success/10 p-3 text-sm text-success md:col-span-2'
                : 'rounded-md bg-destructive/10 p-3 text-sm text-destructive md:col-span-2'
            }
          >
            {message}
          </p>
        ) : null}

        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" loading={create.isPending} disabled={!title.trim() || !buyerEntityId}>
            ایجاد سند
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </section>
  );
}
