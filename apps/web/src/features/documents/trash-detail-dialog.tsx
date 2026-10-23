import { useState } from 'react';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { LoadingState } from '../../shared/ui/states';
import { formatIsoAsJalali, formatMoney, toPersianDigits } from '../../shared/format/money';
import {
  usePurgeDocument,
  useRestoreConflicts,
  useRestoreDocument,
  useTrashedDocument,
  type TrashRow,
} from './documents.api';

/**
 * یک سند در سطل زباله — دیدن کامل، بازگرداندن، یا حذف دائمی.
 *
 * **تداخل پیش از عمل سنجیده می‌شود، نه بعدش.** در نبودِ این سند ممکن است همان
 * انشعابِ همان مدرسه در سند دیگری ثبت شده باشد، یا شمارهٔ سندش به سند دیگری رسیده
 * باشد. دکمهٔ بازگرداندن در آن صورت غیرفعال است و **سندِ طرفِ تداخل نام برده
 * می‌شود** — «نمی‌شود» بدون گفتن اینکه با چه چیزی، کاربر را بی‌کار می‌گذارد.
 */
export function TrashDetailDialog({
  row,
  canRestore,
  canPurge,
  onClose,
  onDone,
  onError,
}: {
  row: TrashRow;
  canRestore: boolean;
  canPurge: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (error: unknown) => void;
}): JSX.Element {
  const detail = useTrashedDocument(row.id);
  const conflicts = useRestoreConflicts(row.id);
  const restore = useRestoreDocument();
  const purge = usePurgeDocument();

  const [confirmText, setConfirmText] = useState('');
  const [purging, setPurging] = useState(false);

  const blocking = conflicts.data?.conflicts ?? [];
  const busy = restore.isPending || purge.isPending;

  return (
    <Modal title={`سند حذف‌شده — ${row.title}`} onClose={onClose}>
      <div className="space-y-4">
        <dl className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-3">
          <Row label="نوع" value={DOCUMENT_TYPE_LABELS[row.type]} />
          <Row label="وضعیت هنگام حذف" value={DOCUMENT_STATUS_LABELS[row.status]} />
          <Row label="خریدار" value={row.buyerSnapshot.name} />
          <Row label="سال مالی" value={toPersianDigits(String(row.fiscalYear))} />
          <Row label="سال شمسی" value={toPersianDigits(String(row.jalaliYear))} />
          <Row label="شماره سند" value={row.documentNumber ?? 'ثبت نشده'} />
          <Row label="جمع کل" value={formatMoney(row.totalAmount)} />
          <Row label="حذف در" value={formatIsoAsJalali(row.deletedAt)} />
          <Row label="حذف توسط" value={row.deletedBy?.fullName ?? '—'} />
        </dl>

        {row.deleteReason ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm">
            <span className="text-xs text-muted-foreground">دلیل حذف: </span>
            {row.deleteReason}
          </p>
        ) : null}

        {/* فاکتورها، همان‌طور که در برگهٔ سند دیده می‌شدند. */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            فاکتورها ({toPersianDigits(String(row._count.invoices))})
          </h3>

          {detail.isPending ? (
            <LoadingState label="در حال خواندن فاکتورها…" />
          ) : detail.data && detail.data.invoices.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {detail.data.invoices.map((invoice) => (
                <li key={invoice.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {invoice.invoiceType.titleFa} · {invoice.chapterTitleSnapshot}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {invoice.vendorSnapshot?.name ?? 'بدون فروشنده'} ·{' '}
                      {formatIsoAsJalali(invoice.invoiceDate)}
                      {invoice.utilityDetail
                        ? ` · ${invoice.utilityDetail.schoolTitleSnapshot} — ${invoice.utilityDetail.utilityTypeTitleSnapshot}`
                        : ''}
                    </div>
                  </div>
                  <span className="money shrink-0 text-sm">{formatMoney(invoice.totalAmount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              این سند فاکتوری نداشت.
            </p>
          )}
        </section>

        {/* تداخل‌های بازگرداندن، با نام سندی که طرف تداخل است. */}
        {conflicts.isPending ? null : blocking.length > 0 ? (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <Icon name="alert" size={16} />
              بازگرداندن این سند ممکن نیست
            </p>
            <ul className="space-y-1.5 text-sm text-destructive/90">
              {blocking.map((conflict) => (
                <li key={`${conflict.kind}-${conflict.documentId}`}>
                  {conflict.message}{' '}
                  <span className="font-medium">سند «{conflict.documentTitle}»</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-destructive/80">
              ابتدا تکلیف آن سند را روشن کنید؛ تا وقتی هست، این سند برنمی‌گردد.
            </p>
          </div>
        ) : null}

        {purging ? (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <Icon name="alert" size={16} />
              حذف دائمی، برگشت ندارد
            </p>
            <p className="text-sm text-destructive/90">
              سند و همهٔ فاکتورها، پرداخت‌ها و پیوست‌هایش برای همیشه پاک می‌شوند. فقط
              یک ردپای حسابرسی از آن باقی می‌ماند.
            </p>
            <Input
              label="برای تأیید، عبارت «حذف دائمی» را بنویسید"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {canRestore ? (
            <Button
              loading={restore.isPending}
              disabled={busy || blocking.length > 0 || conflicts.isPending}
              onClick={() =>
                restore.mutate(row.id, {
                  onSuccess: () => onDone(`سند «${row.title}» بازگردانده شد.`),
                  onError,
                })
              }
            >
              <Icon name="restore" size={15} />
              بازگرداندن
            </Button>
          ) : null}

          {canPurge ? (
            purging ? (
              <Button
                variant="destructive"
                loading={purge.isPending}
                disabled={busy || confirmText.trim() !== 'حذف دائمی'}
                onClick={() =>
                  purge.mutate(row.id, {
                    onSuccess: () => onDone(`سند «${row.title}» برای همیشه پاک شد.`),
                    onError,
                  })
                }
              >
                بله، برای همیشه پاک کن
              </Button>
            ) : (
              <Button variant="destructive" disabled={busy} onClick={() => setPurging(true)}>
                <Icon name="trash" size={15} />
                حذف دائمی
              </Button>
            )
          ) : null}

          <Button variant="ghost" onClick={onClose}>
            بستن
          </Button>
        </div>
      </div>
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
