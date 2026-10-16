import { useRef, useState } from 'react';
import { UPLOAD_ACCEPT_ATTRIBUTE, UPLOAD_TYPES, validateUpload } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { EmptyState, ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatIsoAsJalali, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import {
  attachmentContentUrl,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachments,
  type AttachmentRow,
} from './files.api';
import { AttachmentPreview } from './attachment-preview';
import { AttachmentHistory } from './attachment-history';

/**
 * پیوست‌های سند — فهرست، آپلود، پیش‌نمایش، حذف و تاریخچه.
 *
 * دو تصمیم رابط کاربری که عمدی‌اند:
 *
 *  ۱. **نتیجه هر فایل جدا نشان داده می‌شود.** آپلود چندفایلی می‌تواند نیمه‌موفق باشد؛
 *     «۳ فایل از ۵ ثبت شد» بدون گفتن اینکه کدام دو و چرا، کاربر را سر کار می‌گذارد.
 *
 *  ۲. **اعتبارسنجی سمت کلاینت، تصمیم نیست.** پیش از ارسال همان `validateUpload`
 *     مشترک روی بایت‌های فایل اجرا می‌شود تا کاربر منتظر رفت‌وبرگشت شبکه نماند؛ ولی
 *     مرجع، همان بررسی سمت سرور است و فایل رد‌شده در کلاینت هم با پیام دقیق رد
 *     می‌شود، نه با «فایل نامعتبر».
 */
export function AttachmentsPanel({
  documentId,
  canUpload,
  canDelete,
}: {
  documentId: string;
  canUpload: boolean;
  canDelete: boolean;
}): JSX.Element {
  const attachments = useAttachments(documentId);
  const upload = useUploadAttachments();
  const remove = useDeleteAttachment(documentId);
  const fileInput = useRef<HTMLInputElement>(null);

  const [rejected, setRejected] = useState<readonly { filename: string; message: string }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOf, setPreviewOf] = useState<AttachmentRow | null>(null);
  const [historyOf, setHistoryOf] = useState<AttachmentRow | null>(null);

  if (attachments.isPending) return <LoadingState label="در حال خواندن فایل‌ها…" />;
  if (attachments.isError) {
    return (
      <ErrorState message="دریافت فهرست فایل‌ها ناموفق بود" onRetry={() => void attachments.refetch()} />
    );
  }

  const { items, limits } = attachments.data;
  const totalBytes = items.reduce((sum, item) => sum + Number(item.sizeBytes), 0);

  async function handleFiles(selected: readonly File[]): Promise<void> {
    setNotice(null);
    setError(null);
    setRejected([]);

    if (items.length + selected.length > limits.maxFilesPerDocument) {
      setError(
        `هر سند حداکثر ${toPersianDigits(String(limits.maxFilesPerDocument))} فایل می‌پذیرد؛ اکنون ${toPersianDigits(
          String(items.length),
        )} فایل ثبت شده است.`,
      );
      return;
    }

    const accepted: File[] = [];
    const failedHere: { filename: string; message: string }[] = [];

    for (const file of selected) {
      try {
        // بررسی محتوا پیش از ارسال: فقط ابتدای فایل لازم است، نه کل آن.
        const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
        validateUpload(
          {
            filename: file.name,
            declaredMime: file.type,
            bytes: head,
            sizeBytes: file.size,
          },
          limits,
        );
        accepted.push(file);
      } catch (caught) {
        failedHere.push({
          filename: file.name,
          message: caught instanceof Error ? caught.message : 'فایل نامعتبر است',
        });
      }
    }

    setRejected(failedHere);
    if (accepted.length === 0) return;

    upload.mutate(
      { documentId, files: accepted },
      {
        onSuccess: (result) => {
          if (result.uploaded.length > 0) {
            setNotice(`${toPersianDigits(String(result.uploaded.length))} فایل ثبت شد.`);
          }
          // رد‌شده‌های سرور به رد‌شده‌های کلاینت اضافه می‌شوند، نه جایشان را بگیرند.
          if (result.failed.length > 0) {
            setRejected((previous) => [...previous, ...result.failed]);
          }
        },
        onError: (caught) =>
          setError(
            caught instanceof ApiError ? formatServerMessage(caught.message) : 'آپلود ناموفق بود',
          ),
      },
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">فایل‌های اسکن سند</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {toPersianDigits(String(items.length))} فایل ·{' '}
            {formatSize(String(totalBytes))} از حجم مجاز{' '}
            {formatSize(String(limits.maxTotalBytesPerDocument))}
          </p>
        </div>

        {canUpload ? (
          <div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT_ATTRIBUTE}
              className="sr-only"
              onChange={(event) => {
                const selected = [...(event.target.files ?? [])];
                event.target.value = '';
                if (selected.length > 0) void handleFiles(selected);
              }}
            />
            <Button
              size="sm"
              loading={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              افزودن فایل
            </Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {Object.values(UPLOAD_TYPES)
                .map((type) => type.titleFa)
                .join('، ')}{' '}
              · حداکثر {formatSize(String(limits.maxFileBytes))} برای هر فایل
            </p>
          </div>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="mt-4 rounded-md bg-success/10 p-3 text-sm text-success">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {rejected.length > 0 ? (
        <div role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">
            {toPersianDigits(String(rejected.length))} فایل پذیرفته نشد
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {rejected.map((item, index) => (
              <li key={`${item.filename}-${index}`}>
                <span className="font-medium text-foreground">{item.filename}</span> —{' '}
                {formatServerMessage(item.message)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="فایلی بارگذاری نشده است"
            description={
              canUpload
                ? 'نهایی کردن بایگانی بدون دست‌کم یک فایل اسکن ممکن نیست.'
                : 'بارگذاری فایل در اختیار نقش بایگانی است.'
            }
          />
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.originalFilename}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {UPLOAD_TYPES[item.typeKey]?.titleFa ?? item.typeKey} ·{' '}
                  {formatSize(item.sizeBytes)} · {formatIsoAsJalali(item.createdAt)}
                  {item.uploadedBy ? ` · ${item.uploadedBy.fullName}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setPreviewOf(item)}>
                  پیش‌نمایش
                </Button>
                {/* دانلود از همان مسیر مجوزدار؛ کوکی نشست همراه درخواست می‌رود. */}
                <a
                  href={attachmentContentUrl(item.id, 'attachment')}
                  className="rounded-md px-3 py-1.5 text-sm text-primary hover:bg-muted"
                >
                  دانلود
                </a>
                <Button size="sm" variant="ghost" onClick={() => setHistoryOf(item)}>
                  تاریخچه
                </Button>
                {canDelete ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={remove.isPending}
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      remove.mutate(item.id, {
                        onSuccess: () => setNotice('فایل حذف شد؛ رکورد آن برای حسابرسی می‌ماند.'),
                        onError: (caught) =>
                          setError(
                            caught instanceof ApiError
                              ? formatServerMessage(caught.message)
                              : 'حذف فایل ناموفق بود',
                          ),
                      });
                    }}
                  >
                    حذف
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {previewOf ? (
        <AttachmentPreview attachment={previewOf} onClose={() => setPreviewOf(null)} />
      ) : null}

      {historyOf ? (
        <AttachmentHistory attachment={historyOf} onClose={() => setHistoryOf(null)} />
      ) : null}
    </section>
  );
}

/** اندازه فایل از رشته عددی؛ تقسیم روی مبلغ ممنوع است ولی این بایت است، نه ریال. */
function formatSize(bytes: string): string {
  const value = Number(bytes);
  if (value < 1024) return `${toPersianDigits(String(value))} بایت`;
  if (value < 1024 * 1024) return `${toPersianDigits((value / 1024).toFixed(1))} کیلوبایت`;
  return `${toPersianDigits((value / (1024 * 1024)).toFixed(1))} مگابایت`;
}
