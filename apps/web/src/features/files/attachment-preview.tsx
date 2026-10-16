import { useEffect, useState } from 'react';
import { UPLOAD_TYPES } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { Modal } from '../../shared/ui/modal';
import { attachmentContentUrl, type AttachmentRow } from './files.api';

/**
 * پیش‌نمایش فایل.
 *
 * معیار پذیرش ۶ فاز ۵: فایلی که مرورگر نمی‌تواند رندر کند (TIFF) باید **پیام صریح**
 * بگیرد، نه کادر خالی. تصمیمِ «قابل پیش‌نمایش است یا نه» از فهرست مشترک انواع مجاز
 * می‌آید (`UPLOAD_TYPES[...].previewable`)، نه از حدس اینجا؛ پس اگر فردا نوع تازه‌ای
 * اضافه شود، همان یک‌جا تعیین می‌کند.
 *
 * چرا PDF از راه blob می‌آید و تصویر مستقیم:
 * سرویس API هدر `Content-Security-Policy: frame-ancestors 'none'` می‌فرستد، یعنی هیچ
 * پاسخی از آن — حتی هم‌مبدأ — داخل iframe قرار نمی‌گیرد. این هدر عمدی و درست است و
 * برای یک پیش‌نمایش ضعیف نمی‌شود. پس بایت‌ها با `fetch` هم‌مبدأ (با کوکی نشست)
 * خوانده و به `blob:` تبدیل می‌شوند؛ آن URL به خود صفحه تعلق دارد و قاب شدنش را
 * سیاست API محدود نمی‌کند. برای `<img>` اصلاً چنین محدودیتی وجود ندارد، پس تصویر
 * همان مسیر مستقیم و سبک‌تر را می‌گیرد.
 *
 * این محدودیت در آزمون مرورگری فاز ۵ پیدا شد: پیش‌نمایش PDF کادر خالی نشان می‌داد و
 * در کنسول `net::ERR_BLOCKED_BY_RESPONSE` ثبت شده بود.
 */
export function AttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: AttachmentRow;
  onClose: () => void;
}): JSX.Element {
  const definition = UPLOAD_TYPES[attachment.typeKey];
  const isImage = attachment.detectedMime.startsWith('image/');
  const needsBlob = attachment.previewable && !isImage;

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!needsBlob) return undefined;

    let revoked = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const response = await fetch(attachmentContentUrl(attachment.id, 'inline'), {
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      revoked = true;
      // بدون این، هر بار باز کردن پیش‌نمایش یک نسخه از فایل را در حافظه نگه می‌دارد.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, needsBlob]);

  return (
    <Modal title={attachment.originalFilename} onClose={onClose}>
      {!attachment.previewable ? (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-5">
          <p className="text-sm font-medium">این فایل در مرورگر قابل نمایش نیست</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            قالب {definition?.titleFa ?? attachment.typeKey} را هیچ مرورگری رندر نمی‌کند. فایل را
            دانلود کنید و با نمایشگر تصویر سیستم خود باز کنید. فایل سالم است و در بایگانی ثبت
            شده؛ فقط پیش‌نمایش آن ممکن نیست.
          </p>
          <a
            href={attachmentContentUrl(attachment.id, 'attachment')}
            className="mt-4 inline-block rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            دانلود فایل
          </a>
        </div>
      ) : isImage ? (
        <img
          src={attachmentContentUrl(attachment.id, 'inline')}
          alt={`پیش‌نمایش ${attachment.originalFilename}`}
          className="mx-auto max-h-[70vh] w-auto rounded border border-border bg-muted"
        />
      ) : failed ? (
        <ErrorState
          title="خواندن فایل برای پیش‌نمایش ناموفق بود"
          message="فایل را دانلود کنید؛ رکورد آن در بایگانی سالم است."
        />
      ) : blobUrl === null ? (
        <LoadingState label="در حال آماده‌سازی پیش‌نمایش…" />
      ) : (
        <iframe
          src={blobUrl}
          title={`پیش‌نمایش ${attachment.originalFilename}`}
          className="h-[70vh] w-full rounded border border-border bg-muted"
        />
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onClose}>
          بستن
        </Button>
      </div>
    </Modal>
  );
}
