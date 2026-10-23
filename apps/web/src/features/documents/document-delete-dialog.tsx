import { useState, type FormEvent } from 'react';
import { DOCUMENT_STATUS_LABELS } from '@dm/shared';

import { ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useTrashDocument, type DocumentDetail } from './documents.api';

/**
 * انتقال سند به سطل زباله.
 *
 * **هشدار به اندازهٔ کار است، نه بیشتر و نه کمتر.** سند پیش‌نویس هنوز هیچ‌جا اثری
 * نگذاشته، پس یک تأیید ساده کافی است. سند ثبت‌شده یا بایگانی‌شده جای دیگری هم
 * شمرده شده است، پس هشدارش قرمز است و کاربر باید **شرح سند را بنویسد** — همان
 * حرکتی که آدم را وادار می‌کند یک بار دیگر نگاه کند به اینکه کدام سند را دارد
 * حذف می‌کند.
 *
 * هیچ‌کدام از این دو، داده را پاک نمی‌کند: سند به سطل زباله می‌رود و برگشتنی است.
 */
export function DocumentDeleteDialog({
  document,
  onClose,
  onDeleted,
}: {
  document: DocumentDetail;
  onClose: () => void;
  onDeleted: () => void;
}): JSX.Element {
  const trash = useTrashDocument();

  const [reason, setReason] = useState('');
  const [titleEcho, setTitleEcho] = useState('');
  const [error, setError] = useState<string | null>(null);

  // پیش‌نویس هنوز جایی شمرده نشده؛ ثبت‌شده و بایگانی‌شده شده‌اند.
  const severe = document.status !== 'DRAFT' && document.status !== 'REOPENED';
  const echoOk = !severe || titleEcho.trim() === document.title.trim();

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    trash.mutate(
      { id: document.id, reason: reason.trim() },
      {
        onSuccess: onDeleted,
        onError: (caught) =>
          setError(
            caught instanceof ApiError ? formatServerMessage(caught.message) : 'حذف ناموفق بود',
          ),
      },
    );
  };

  return (
    <Modal title="انتقال سند به سطل زباله" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div
          className={
            severe
              ? 'flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3'
              : 'flex gap-3 rounded-lg border border-border bg-muted/40 p-3'
          }
        >
          <Icon
            name="alert"
            size={18}
            className={severe ? 'mt-0.5 shrink-0 text-destructive' : 'mt-0.5 shrink-0 text-muted-foreground'}
          />
          <div className="space-y-1 text-sm">
            {severe ? (
              <p className="font-semibold text-destructive">
                این سند در وضعیت «{DOCUMENT_STATUS_LABELS[document.status]}» است.
              </p>
            ) : null}
            <p className={severe ? 'text-destructive/90' : 'text-muted-foreground'}>
              {severe
                ? 'این سند پیش از این در گزارش‌ها و جمع‌های داشبورد شمرده شده است. با حذف، از همهٔ آن‌ها کنار می‌رود و اعداد عوض می‌شوند.'
                : 'سند به سطل زباله می‌رود و از فهرست، گزارش‌ها و داشبورد کنار گذاشته می‌شود.'}
            </p>
            <p className="text-xs text-muted-foreground">
              چیزی پاک نمی‌شود؛ از بخش «سطل زباله» قابل دیدن و بازگرداندن است.
            </p>
          </div>
        </div>

        {/* همان چیزی که دارد حذف می‌شود، یک بار دیگر جلوی چشم. */}
        <dl className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
          <Row label="شرح سند" value={document.title} />
          <Row label="خریدار" value={document.buyerSnapshot.name} />
          <Row
            label="سال مالی"
            value={toPersianDigits(String(document.fiscalYear))}
          />
          <Row
            label="تعداد فاکتور"
            value={toPersianDigits(String(document.invoices.length))}
          />
          <Row label="جمع کل" value={formatMoney(document.totalAmount)} />
          <Row label="شماره سند" value={document.documentNumber ?? 'ثبت نشده'} />
        </dl>

        <Input
          label="دلیل حذف"
          required
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="در سطل زباله و در رد حسابرسی نوشته می‌شود."
        />

        {severe ? (
          <Input
            label="برای تأیید، شرح سند را بنویسید"
            value={titleEcho}
            onChange={(event) => setTitleEcho(event.target.value)}
            {...(titleEcho !== '' && !echoOk ? { error: 'با شرح سند یکی نیست' } : {})}
            hint={document.title}
          />
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 border-t border-border pt-4">
          <Button
            type="submit"
            variant="destructive"
            loading={trash.isPending}
            disabled={reason.trim() === '' || !echoOk}
          >
            انتقال به سطل زباله
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}
