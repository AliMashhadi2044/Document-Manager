import { useState } from 'react';
import { UPLOAD_TYPES } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { ApiError } from '../../shared/api/client';
import { formatIsoAsJalali, formatServerMessage } from '../../shared/format/money';
import { formatFileSize } from '../../shared/format/bytes';
import {
  useDeletedAttachments,
  usePurgeAttachment,
  useRestoreAttachment,
  type DeletedAttachmentRow,
} from './files.api';

/**
 * فایل‌های حذف‌شدهٔ سند — بازگرداندن، یا پاک کردن برای همیشه.
 *
 * چرا یک بخشِ تاشو و نه یک صفحهٔ جدا: فایلِ حذف‌شده همیشه **به یک سند** تعلق دارد و
 * تصمیم دربارهٔ آن («این اسکن را اشتباهی برداشتم» یا «این دیگر لازم نیست») فقط در
 * کنار همان سند معنا دارد. سطل زبالهٔ سراسریِ فایل، کاربر را وامی‌داشت نام سند را
 * از حفظ باشد.
 *
 * و بسته شروع می‌شود: سندی که فایل حذف‌شده‌ای ندارد، نباید بخشی داشته باشد که
 * می‌گوید «هیچ».
 */
export function DeletedAttachments({
  documentId,
  canRestore,
  canPurge,
  standalone = false,
}: {
  documentId: string;
  canRestore: boolean;
  canPurge: boolean;
  /**
   * بدون پنل پیوست‌ها، روی پای خودش.
   *
   * مدیر سامانه `attachment:read` **ندارد** — عمداً، تا حق دیدن محتوای اسناد با
   * حق پاک کردنشان یکی نشود. ولی پنل پیوست‌ها پشت همان مجوز است، و اگر این بخش
   * فقط درون آن زندگی می‌کرد، مجوز `attachment:purge` دکمه‌ای در رابط نداشت.
   */
  standalone?: boolean;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const deleted = useDeletedAttachments(documentId, open && (canRestore || canPurge));
  const restore = useRestoreAttachment(documentId);
  const purge = usePurgeAttachment(documentId);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** شناسهٔ فایلی که کاربر در حال تأیید حذف دائمی آن است. */
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  if (!canRestore && !canPurge) return null;

  const items = deleted.data?.items ?? [];

  function fail(caught: unknown, fallback: string): void {
    setNotice(null);
    setError(caught instanceof ApiError ? formatServerMessage(caught.message) : fallback);
  }

  return (
    <section
      className={
        standalone
          ? 'rounded-lg border border-border bg-card p-6'
          : 'mt-5 border-t border-border pt-4'
      }
    >
      <button
        type="button"
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => {
          setOpen((previous) => !previous);
          setNotice(null);
          setError(null);
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-start'} size={14} />
        فایل‌های حذف‌شدهٔ این سند
      </button>

      {open ? (
        <div className="mt-3">
          {deleted.isPending ? (
            <p className="text-xs text-muted-foreground">در حال خواندن…</p>
          ) : deleted.isError ? (
            <p role="alert" className="text-xs text-destructive">
              خواندن فهرست فایل‌های حذف‌شده ناموفق بود.
            </p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              فایلی از این سند حذف نشده است.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((item) => (
                <li key={item.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-muted-foreground line-through">
                        {item.originalFilename}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {UPLOAD_TYPES[item.typeKey]?.titleFa ?? item.typeKey} ·{' '}
                        {formatFileSize(item.sizeBytes)} · حذف در {formatIsoAsJalali(item.deletedAt)}
                        {item.deletedBy ? ` توسط ${item.deletedBy.fullName}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {canRestore ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={restore.isPending}
                          onClick={() => {
                            setError(null);
                            restore.mutate(item.id, {
                              onSuccess: () => {
                                setNotice(`«${item.originalFilename}» به سند برگشت.`);
                                setError(null);
                              },
                              onError: (caught) => fail(caught, 'بازگرداندن فایل ناموفق بود'),
                            });
                          }}
                        >
                          <Icon name="restore" size={14} />
                          بازگرداندن
                        </Button>
                      ) : null}

                      {canPurge ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPurgingId(purgingId === item.id ? null : item.id);
                            setConfirmText('');
                            setError(null);
                          }}
                        >
                          <Icon name="trash" size={14} />
                          حذف دائمی
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/*
                    هشدار همان‌جا زیر همان ردیف می‌آید و نه در پنجره‌ای جدا: کاربر
                    باید در لحظهٔ تأیید، نامِ همان فایل را ببیند. و عبارت تأیید
                    تایپ می‌شود، چون این کار برگشت ندارد.
                  */}
                  {purgingId === item.id ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                        <Icon name="alert" size={16} />
                        حذف دائمی، برگشت ندارد
                      </p>
                      <ul className="list-inside list-disc space-y-1 text-sm text-destructive/90">
                        <li>
                          فایل «{item.originalFilename}» از فضای ذخیره‌سازی پاک می‌شود و دیگر قابل
                          بازگرداندن نیست.
                        </li>
                        <li>
                          اگر نسخهٔ دیگری از این اسکن جایی ندارید، سندِ کاغذی هم دیگر پشتوانهٔ
                          دیجیتال ندارد.
                        </li>
                        <li>
                          یک ردپای حسابرسی با نام، اندازه و checksum فایل باقی می‌ماند — ولی خودِ
                          فایل نه.
                        </li>
                      </ul>
                      <Input
                        label="برای تأیید، عبارت «حذف دائمی» را بنویسید"
                        value={confirmText}
                        onChange={(event) => setConfirmText(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          loading={purge.isPending}
                          disabled={confirmText.trim() !== 'حذف دائمی'}
                          onClick={() =>
                            purge.mutate(item.id, {
                              onSuccess: () => {
                                setNotice(
                                  `«${item.originalFilename}» برای همیشه پاک شد؛ ردپای حسابرسی‌اش ماند.`,
                                );
                                setError(null);
                                setPurgingId(null);
                                setConfirmText('');
                              },
                              onError: (caught) => fail(caught, 'حذف دائمی ناموفق بود'),
                            })
                          }
                        >
                          بله، برای همیشه پاک کن
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPurgingId(null);
                            setConfirmText('');
                          }}
                        >
                          انصراف
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {notice ? (
            <p role="status" className="mt-3 rounded-md bg-success/10 p-3 text-sm text-success">
              {notice}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}


export type { DeletedAttachmentRow };
