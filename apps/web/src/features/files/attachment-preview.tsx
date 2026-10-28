import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { UPLOAD_TYPES } from '@dm/shared';

import { hasPermission, useCurrentUser } from '../auth/auth.api';
import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { Modal } from '../../shared/ui/modal';
import { toPersianDigits } from '../../shared/format/money';
import {
  attachmentContentUrl,
  useAttachmentRotations,
  useSaveRotations,
  type AttachmentRow,
} from './files.api';
import { RotationControls, useRotations } from './page-rotation';

/*
  pdf.js حدود ۳۵۰ کیلوبایت است و فقط وقتی لازم می‌شود که کاربر یک PDF باز کند.
  بارگذاری تنبل یعنی این وزن روی اولین بارگذاری سامانه ننشیند.
*/
const PdfViewer = lazy(async () => ({ default: (await import('./pdf-viewer')).PdfViewer }));

/**
 * نمایشگر پیوست — تمام‌صفحه.
 *
 * یک اسکن A4 در یک کادر ۵۶rem خوانا نیست؛ کاربر یا باید زوم کند و دنبال متن بگردد،
 * یا فایل را دانلود کند و از سامانه بیرون برود. نمایشگر تمام‌صفحه همان کاری را
 * می‌کند که نمایشگر سیستم می‌کرد، همین‌جا.
 *
 * **بایت‌ها یک‌بار خوانده می‌شوند**، چه PDF چه تصویر: سرویس API هدر
 * `frame-ancestors 'none'` می‌فرستد (عمدی و درست)، پس هیچ پاسخی از آن داخل قاب
 * نمی‌نشیند؛ و برای pdf.js هم بافر لازم است، نه نشانی. از همان بافر، هم نمایش
 * می‌آید و هم دانلود — بدون درخواست دوم.
 *
 * فایلی که مرورگر رندرش نمی‌کند (TIFF) پیام صریح می‌گیرد، نه کادر خالی؛ و تصمیمِ
 * «قابل پیش‌نمایش است یا نه» از فهرست مشترک انواع مجاز می‌آید
 * (`UPLOAD_TYPES[...].previewable`)، نه از حدس اینجا.
 */

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export function AttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: AttachmentRow;
  onClose: () => void;
}): JSX.Element {
  const definition = UPLOAD_TYPES[attachment.typeKey];
  const isImage = attachment.detectedMime.startsWith('image/');
  const isPdf = attachment.detectedMime === 'application/pdf';

  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState<{ pageCount: number; currentPage: number } | null>(null);

  const saved = useAttachmentRotations(attachment.id, isPdf && attachment.previewable);
  const save = useSaveRotations(attachment.id);
  const rotation = useRotations(saved.data?.rotations ?? null, save.mutate);
  // دکمه را پنهان می‌کند، نه بیشتر: مجوز واقعی سمت سرور اعمال می‌شود.
  const canRotate = hasPermission(useCurrentUser().data, 'attachment:upload');

  useEffect(() => {
    if (!attachment.previewable) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(attachmentContentUrl(attachment.id, 'inline'), {
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error(String(response.status));
        const buffer = await response.arrayBuffer();
        if (!cancelled) setBytes(buffer);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.previewable]);

  const changeZoom = (direction: 1 | -1): void => {
    setZoom((current) => {
      const index = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number]);
      const next = index === -1 ? 2 : index + direction;
      return ZOOM_STEPS[Math.min(Math.max(next, 0), ZOOM_STEPS.length - 1)] ?? current;
    });
  };

  /*
    دانلود از همان بایت‌هایی که خوانده شده‌اند.

    لینک مستقیم به API هم کار می‌کرد، ولی یعنی فایل دوبار از شبکه بیاید — روی یک
    اسکن چند ده مگابایتی، همان یک‌بار هم کافی است.
  */
  const download = (): void => {
    /*
      وقتی برگه‌ای چرخانده شده، فایل باید از **سرور** بیاید و نه از بایت‌های داخل
      مرورگر: چرخش در خودِ فایل دانلودی نشانده می‌شود و این کار آنجا انجام می‌گیرد.
      در بقیهٔ موارد همان بایت‌های خوانده‌شده کافی‌اند و فایل دوبار از شبکه نمی‌آید.
    */
    const fromServer = rotation.map.size > 0 || bytes === null;
    const url = fromServer
      ? attachmentContentUrl(attachment.id, 'attachment')
      : URL.createObjectURL(new Blob([bytes], { type: attachment.detectedMime }));

    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.originalFilename;
    link.click();
    if (!fromServer) URL.revokeObjectURL(url);
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {isPdf && pages ? (
        <span className="money me-2 text-xs text-muted-foreground">
          صفحهٔ {toPersianDigits(String(pages.currentPage))} از{' '}
          {toPersianDigits(String(pages.pageCount))}
        </span>
      ) : null}

      {isPdf && canRotate ? (
        <RotationControls
          state={rotation}
          currentPage={pages?.currentPage ?? 1}
          pageCount={pages?.pageCount ?? 0}
          saving={save.isPending}
          failed={save.isError}
        />
      ) : null}

      {attachment.previewable ? (
        <>
          <ToolButton icon="minus" label="کوچک‌نمایی" onClick={() => changeZoom(-1)} />
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="بازگشت به اندازهٔ اصلی"
            className="money h-8 min-w-14 rounded-lg border border-border px-2 text-xs hover:bg-muted"
          >
            {toPersianDigits(String(Math.round(zoom * 100)))}٪
          </button>
          <ToolButton icon="plus" label="بزرگ‌نمایی" onClick={() => changeZoom(1)} />
        </>
      ) : null}

      <ToolButton icon="download" label="دانلود فایل" onClick={download} />
      <Button size="sm" variant="secondary" onClick={onClose}>
        بستن
      </Button>
    </div>
  );

  return (
    <Modal title={attachment.originalFilename} size="full" toolbar={toolbar} onClose={onClose}>
      {!attachment.previewable ? (
        <div className="m-6 rounded-lg border border-warning/40 bg-warning/5 p-5">
          <p className="text-sm font-medium">این فایل در مرورگر قابل نمایش نیست</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            قالب {definition?.titleFa ?? attachment.typeKey} را هیچ مرورگری رندر نمی‌کند. فایل را
            دانلود کنید و با نمایشگر تصویر سیستم خود باز کنید. فایل سالم است و در بایگانی ثبت
            شده؛ فقط پیش‌نمایش آن ممکن نیست.
          </p>
          <Button className="mt-4" onClick={download}>
            دانلود فایل
          </Button>
        </div>
      ) : failed ? (
        <ErrorState
          title="خواندن فایل برای پیش‌نمایش ناموفق بود"
          message="فایل را دانلود کنید؛ رکورد آن در بایگانی سالم است."
        />
      ) : bytes === null ? (
        <LoadingState label="در حال خواندن فایل…" />
      ) : isImage ? (
        <ImageViewer bytes={bytes} mime={attachment.detectedMime} name={attachment.originalFilename} zoom={zoom} />
      ) : isPdf ? (
        <Suspense fallback={<LoadingState label="در حال آماده‌سازی نمایشگر…" />}>
          <PdfViewer data={bytes} scale={zoom} rotations={rotation.map} onState={setPages} />
        </Suspense>
      ) : (
        <ErrorState
          title="این قالب نمایشگر ندارد"
          message="فایل را دانلود کنید؛ رکورد آن در بایگانی سالم است."
        />
      )}
    </Modal>
  );
}

/**
 * تصویر با زوم و **جابه‌جایی با کشیدن**.
 *
 * بدون کشیدن، زوم روی یک اسکن بی‌فایده است: کاربر بزرگ می‌کند و بعد باید با دو
 * نوار اسکرول دنبال گوشهٔ برگه بگردد. اینجا با درگ جابه‌جا می‌شود، مثل هر نمایشگر
 * تصویری دیگری.
 */
function ImageViewer({
  bytes,
  mime,
  name,
  zoom,
}: {
  bytes: ArrayBuffer;
  mime: string;
  name: string;
  zoom: number;
}): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
    setUrl(objectUrl);
    // بدون این، هر بار باز کردن نمایشگر یک نسخه از فایل را در حافظه نگه می‌دارد.
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes, mime]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box) return;
    dragging.current = {
      x: event.clientX,
      y: event.clientY,
      left: box.scrollLeft,
      top: box.scrollTop,
    };
    box.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    const start = dragging.current;
    if (!box || !start) return;
    box.scrollLeft = start.left - (event.clientX - start.x);
    box.scrollTop = start.top - (event.clientY - start.y);
  }, []);

  const endDrag = useCallback(() => {
    dragging.current = null;
  }, []);

  if (!url) return <LoadingState label="در حال آماده‌سازی تصویر…" />;

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="h-full w-full cursor-grab overflow-auto p-4 active:cursor-grabbing"
    >
      <img
        src={url}
        alt={`پیش‌نمایش ${name}`}
        draggable={false}
        style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
        className="mx-auto select-none bg-white shadow-[var(--shadow-soft)]"
      />
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: 'plus' | 'minus' | 'download';
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-90"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
