import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatIsoAsJalali, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TARGET_LABELS,
  useChangeFeedbackStatus,
  useCreateFeedback,
  useDocumentFeedback,
  useReplyToFeedback,
  type FeedbackRow,
  type FeedbackStatus,
  type FeedbackTargetKind,
} from './feedback.api';
import type { CurrentUser } from '../auth/auth.api';

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  OPEN: 'bg-destructive/10 text-destructive',
  ANSWERED: 'bg-warning/10 text-warning',
  RESOLVED: 'bg-success/10 text-success',
  REJECTED: 'bg-muted text-muted-foreground',
};

/** نوع‌هایی که بدون انتخاب فاکتور معنا دارند؛ بقیه به فاکتور گره خورده‌اند. */
const DOCUMENT_LEVEL_TARGETS: readonly FeedbackTargetKind[] = [
  'DOCUMENT',
  'STAD_META',
  'VENDOR',
  'ARCHIVE',
  'TAX_REPORT',
];

/**
 * بازخورد ناظر روی یک سند.
 *
 * تفکیک وظایف در این صفحه **بازتاب مجوزهای سرور** است، نه منبع آن:
 *  - ثبت بازخورد: فقط ناظر (`feedback:create`).
 *  - پاسخ: فقط کارپردازی (`feedback:reply`).
 *  - تأیید رسیدگی: کارپردازی (`feedback:resolve`).
 *  - بازگشایی بازخورد بسته‌شده: فقط ناظر (`feedback:reopen`).
 *
 * دکمه‌ای که کاربر مجوزش را ندارد ساخته نمی‌شود، ولی اگر هم ساخته می‌شد سرور همان
 * درخواست را رد می‌کرد؛ پنهان کردن دکمه کنترل دسترسی نیست.
 *
 * هیچ دکمه حذفی وجود ندارد و این فراموشی نیست: بازخورد حذف نمی‌شود، فقط وضعیتش عوض
 * می‌شود و هر گذار در تاریخچه می‌ماند.
 */
export function FeedbackPanel({
  documentId,
  user,
}: {
  documentId: string;
  user: CurrentUser;
}): JSX.Element {
  const feedback = useDocumentFeedback(documentId);
  const create = useCreateFeedback(documentId);

  const canCreate = user.permissions.includes('feedback:create');
  const [showForm, setShowForm] = useState(false);
  const [targetKind, setTargetKind] = useState<FeedbackTargetKind>('DOCUMENT');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (feedback.isPending) return <LoadingState label="در حال خواندن بازخوردها…" />;
  if (feedback.isError) {
    return <ErrorState message="دریافت بازخوردها ناموفق بود" onRetry={() => void feedback.refetch()} />;
  }

  const items = feedback.data.items;
  const open = items.filter((item) => item.status === 'OPEN' || item.status === 'ANSWERED');

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">بازخورد ناظر</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {toPersianDigits(String(items.length))} بازخورد ·{' '}
            {toPersianDigits(String(open.length))} رسیدگی‌نشده
          </p>
        </div>

        {canCreate ? (
          <Button size="sm" variant="secondary" onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'انصراف' : 'ثبت بازخورد'}
          </Button>
        ) : null}
      </div>

      {showForm && canCreate ? (
        <div className="mt-4 space-y-4 rounded-md border border-border p-4">
          <Select
            label="موضوع بازخورد"
            required
            placeholder={null}
            value={targetKind}
            onChange={(event) => setTargetKind(event.target.value as FeedbackTargetKind)}
            options={DOCUMENT_LEVEL_TARGETS.map((kind) => ({
              value: kind,
              label: FEEDBACK_TARGET_LABELS[kind],
            }))}
            hint="بازخورد روی فاکتور و ردیف، از صفحه خود فاکتور ثبت می‌شود."
          />

          <Input
            label="متن بازخورد"
            required
            value={body}
            maxLength={4000}
            onChange={(event) => setBody(event.target.value)}
          />

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            loading={create.isPending}
            disabled={body.trim() === ''}
            onClick={() => {
              setError(null);
              create.mutate(
                {
                  targetKind,
                  invoiceId: null,
                  invoiceItemId: null,
                  sectionKey: null,
                  body: body.trim(),
                },
                {
                  onSuccess: () => {
                    setBody('');
                    setShowForm(false);
                  },
                  onError: (caught) =>
                    setError(
                      caught instanceof ApiError
                        ? formatServerMessage(caught.message)
                        : 'ثبت بازخورد ناموفق بود',
                    ),
                },
              );
            }}
          >
            ثبت بازخورد
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">
          بازخوردی روی این سند ثبت نشده است.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {items.map((item) => (
            <FeedbackCard key={item.id} feedback={item} documentId={documentId} user={user} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedbackCard({
  feedback,
  documentId,
  user,
}: {
  feedback: FeedbackRow;
  documentId: string;
  user: CurrentUser;
}): JSX.Element {
  const reply = useReplyToFeedback(documentId);
  const changeStatus = useChangeFeedbackStatus(documentId);

  const [replyBody, setReplyBody] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const canReply = user.permissions.includes('feedback:reply');
  const canResolve = user.permissions.includes('feedback:resolve');
  const canReopen = user.permissions.includes('feedback:reopen');
  const isOpen = feedback.status === 'OPEN' || feedback.status === 'ANSWERED';

  function fail(caught: unknown, fallback: string): void {
    setError(caught instanceof ApiError ? formatServerMessage(caught.message) : fallback);
  }

  return (
    <li className="rounded-md border border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">{feedback.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {FEEDBACK_TARGET_LABELS[feedback.targetKind]} ·{' '}
            {feedback.createdBy?.fullName ?? 'کاربر حذف‌شده'} ·{' '}
            {formatIsoAsJalali(feedback.createdAt)}
          </p>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[feedback.status]}`}>
          {FEEDBACK_STATUS_LABELS[feedback.status]}
        </span>
      </div>

      {feedback.replies.length > 0 ? (
        <ol className="divide-y divide-border">
          {feedback.replies.map((item) => (
            <li key={item.id} className="px-4 py-3">
              <p className="text-sm">{item.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.createdBy?.fullName ?? 'کاربر حذف‌شده'} · {formatIsoAsJalali(item.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="space-y-3 px-4 py-3">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {canReply && isOpen ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Input
                label="پاسخ"
                value={replyBody}
                maxLength={4000}
                onChange={(event) => setReplyBody(event.target.value)}
              />
            </div>
            <Button
              size="sm"
              loading={reply.isPending}
              disabled={replyBody.trim() === ''}
              onClick={() => {
                setError(null);
                reply.mutate(
                  { feedbackId: feedback.id, body: replyBody.trim() },
                  {
                    onSuccess: () => setReplyBody(''),
                    onError: (caught) => fail(caught, 'ثبت پاسخ ناموفق بود'),
                  },
                );
              }}
            >
              ثبت پاسخ
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          {canResolve && isOpen ? (
            <>
              <div className="min-w-56 flex-1">
                <Input
                  label="توضیح تغییر وضعیت"
                  value={note}
                  maxLength={2000}
                  onChange={(event) => setNote(event.target.value)}
                  hint="اختیاری؛ در تاریخچه ثبت می‌شود"
                />
              </div>
              <Button
                size="sm"
                loading={changeStatus.isPending}
                onClick={() => {
                  setError(null);
                  changeStatus.mutate(
                    {
                      feedbackId: feedback.id,
                      status: 'RESOLVED',
                      note: note.trim() === '' ? null : note.trim(),
                    },
                    {
                      onSuccess: () => setNote(''),
                      onError: (caught) => fail(caught, 'تغییر وضعیت ناموفق بود'),
                    },
                  );
                }}
              >
                تأیید رسیدگی
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={changeStatus.isPending}
                onClick={() => {
                  setError(null);
                  changeStatus.mutate(
                    {
                      feedbackId: feedback.id,
                      status: 'REJECTED',
                      note: note.trim() === '' ? null : note.trim(),
                    },
                    {
                      onSuccess: () => setNote(''),
                      onError: (caught) => fail(caught, 'تغییر وضعیت ناموفق بود'),
                    },
                  );
                }}
              >
                رد بازخورد
              </Button>
            </>
          ) : null}

          {/* بازگشایی، اختیار ناظر است: اگر پاسخ یا رسیدگی قانع‌کننده نبود. */}
          {canReopen && feedback.status !== 'OPEN' ? (
            <Button
              size="sm"
              variant="secondary"
              loading={changeStatus.isPending}
              onClick={() => {
                setError(null);
                changeStatus.mutate(
                  {
                    feedbackId: feedback.id,
                    status: 'OPEN',
                    note: note.trim() === '' ? null : note.trim(),
                  },
                  {
                    onSuccess: () => setNote(''),
                    onError: (caught) => fail(caught, 'بازگشایی ناموفق بود'),
                  },
                );
              }}
            >
              بازگشایی بازخورد
            </Button>
          ) : null}

          {feedback.statusHistory.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((value) => !value)}>
              {showHistory ? 'بستن تاریخچه' : 'تاریخچه وضعیت'}
            </Button>
          ) : null}
        </div>

        {showHistory ? (
          <ol className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {feedback.statusHistory.map((event) => (
              <li key={event.id}>
                {FEEDBACK_STATUS_LABELS[event.fromStatus]} →{' '}
                <span className="font-medium text-foreground">
                  {FEEDBACK_STATUS_LABELS[event.toStatus]}
                </span>{' '}
                · {event.actor?.fullName ?? 'کاربر حذف‌شده'} · {formatIsoAsJalali(event.createdAt)}
                {event.note ? ` · ${event.note}` : ''}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </li>
  );
}
