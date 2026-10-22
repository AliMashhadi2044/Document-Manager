import { useState } from 'react';
import { DOCUMENT_STATUS_LABELS } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { JalaliDatePicker } from '../../shared/ui/date-picker';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatIsoAsJalali, formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useArchiveDetail, useCompleteArchive, useSaveArchiveInfo } from './archive.api';
import { AttachmentsPanel } from '../files/attachments-panel';
import { FeedbackPanel } from '../feedback/feedback-panel';
import type { CurrentUser } from '../auth/auth.api';

/**
 * میز کار بایگانی برای یک سند.
 *
 * محدوده کار عمداً باریک است و همین‌جا دیده می‌شود: شماره سند، تاریخ سند، توضیح
 * بایگانی، فایل‌ها و نهایی کردن. **هیچ فیلد مالی‌ای در این صفحه نیست** — و این فقط
 * یک انتخاب رابط کاربری نیست؛ نقش بایگانی مجوز `document:update` و `invoice:*` را
 * ندارد و سرور همان درخواست را هم رد می‌کند (معیار پذیرش ۲).
 */
export function ArchiveWorkspace({
  documentId,
  user,
  onBack,
}: {
  documentId: string;
  user: CurrentUser;
  onBack: () => void;
}): JSX.Element {
  const detail = useArchiveDetail(documentId);
  const saveInfo = useSaveArchiveInfo(documentId);
  const complete = useCompleteArchive(documentId);

  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [problems, setProblems] = useState<readonly string[]>([]);

  if (detail.isPending) return <LoadingState label="در حال بارگذاری سند…" />;
  if (detail.isError) {
    return <ErrorState message="دریافت سند ناموفق بود" onRetry={() => void detail.refetch()} />;
  }

  const data = detail.data;
  const canWrite = user.permissions.includes('archive:write');
  const isCompleted = data.status === 'ARCHIVED';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={onBack}>
          بازگشت به کارتابل
        </Button>

        {canWrite && !isCompleted ? (
          <Button
            loading={complete.isPending}
            onClick={() => {
              setNotice(null);
              setProblems([]);
              complete.mutate(undefined, {
                onSuccess: () => {
                  setNotice({ kind: 'success', text: 'بایگانی این سند نهایی شد.' });
                  void detail.refetch();
                },
                onError: (error) => {
                  if (error instanceof ApiError && error.details.length > 0) {
                    // همه پیش‌نیازهای کم با هم نشان داده می‌شوند، نه اولینشان.
                    setProblems(error.details.map((item) => formatServerMessage(item.message)));
                    setNotice({ kind: 'error', text: formatServerMessage(error.message) });
                    return;
                  }
                  setNotice({
                    kind: 'error',
                    text:
                      error instanceof ApiError
                        ? formatServerMessage(error.message)
                        : 'نهایی کردن بایگانی ناموفق بود',
                  });
                },
              });
            }}
          >
            نهایی کردن بایگانی
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={
            notice.kind === 'error'
              ? 'rounded-md bg-destructive/10 p-3 text-sm text-destructive'
              : 'rounded-md bg-success/10 p-3 text-sm text-success'
          }
        >
          {notice.text}
        </p>
      ) : null}

      {problems.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          {problems.map((problem) => (
            <li key={problem} className="text-muted-foreground">
              • {problem}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">{data.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              سال مالی {toPersianDigits(String(data.fiscalYear))} · جمع کل{' '}
              {formatMoney(data.totalAmount)}
            </p>
          </div>
          <span className="rounded bg-muted px-2 py-1 text-xs">
            {DOCUMENT_STATUS_LABELS[data.status]}
          </span>
        </div>

        {data.archiveMetadata?.archivedAt ? (
          <p className="mt-4 rounded-md bg-success/10 p-3 text-sm text-success">
            بایگانی در {formatIsoAsJalali(data.archiveMetadata.archivedAt)} توسط{' '}
            {data.archiveMetadata.archivedBy?.fullName ?? 'کاربر حذف‌شده'} نهایی شد.
          </p>
        ) : null}
      </section>

      <ArchiveInfoForm
        key={`${data.documentNumber ?? ''}-${data.documentDate ?? ''}`}
        documentNumber={data.documentNumber}
        documentDate={data.documentDate}
        notes={data.archiveMetadata?.notes ?? null}
        disabled={!canWrite || isCompleted}
        isSaving={saveInfo.isPending}
        onSave={(input) => {
          setNotice(null);
          setProblems([]);
          saveInfo.mutate(input, {
            onSuccess: () => {
              setNotice({ kind: 'success', text: 'اطلاعات سند ثبت شد.' });
              void detail.refetch();
            },
            onError: (error) =>
              setNotice({
                kind: 'error',
                text:
                  error instanceof ApiError
                    ? formatServerMessage(error.message)
                    : 'ثبت اطلاعات ناموفق بود',
              }),
          });
        }}
      />

      <AttachmentsPanel
        documentId={documentId}
        canUpload={user.permissions.includes('attachment:upload') && !isCompleted}
        canDelete={user.permissions.includes('attachment:delete') && !isCompleted}
      />

      <FeedbackPanel documentId={documentId} user={user} />
    </div>
  );
}

function ArchiveInfoForm({
  documentNumber,
  documentDate,
  notes,
  disabled,
  isSaving,
  onSave,
}: {
  documentNumber: string | null;
  documentDate: string | null;
  notes: string | null;
  disabled: boolean;
  isSaving: boolean;
  onSave: (input: { documentNumber: string; documentDate: string; notes: string | null }) => void;
}): JSX.Element {
  const [number, setNumber] = useState(documentNumber ?? '');
  const [isoDate, setIsoDate] = useState<string | null>(documentDate?.slice(0, 10) ?? null);
  const [note, setNote] = useState(notes ?? '');

  const canSave = number.trim() !== '' && isoDate !== null && !disabled;

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-sm font-semibold">شماره و تاریخ سند</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        یکتایی شماره سند در هر سال مالی را پایگاه داده تضمین می‌کند؛ شماره تکراری با پیام صریح
        رد می‌شود.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="شماره سند"
          required
          disabled={disabled}
          value={number}
          maxLength={50}
          onChange={(event) => setNumber(event.target.value)}
        />
        <JalaliDatePicker
          label="تاریخ سند"
          required
          disabled={disabled}
          value={isoDate}
          onChange={setIsoDate}
        />
      </div>

      <div className="mt-4">
        <Input
          label="توضیح بایگانی"
          disabled={disabled}
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
          hint="اختیاری"
        />
      </div>

      <div className="mt-4">
        <Button
          loading={isSaving}
          disabled={!canSave}
          onClick={() =>
            onSave({
              documentNumber: number.trim(),
              documentDate: isoDate as string,
              notes: note.trim() === '' ? null : note.trim(),
            })
          }
        >
          ثبت اطلاعات سند
        </Button>
      </div>
    </section>
  );
}
