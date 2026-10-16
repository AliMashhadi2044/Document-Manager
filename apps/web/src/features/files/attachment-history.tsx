import { Button } from '../../shared/ui/button';
import { Modal } from '../../shared/ui/modal';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { formatIsoAsJalali } from '../../shared/format/money';
import { useAttachmentHistory, type AttachmentRow } from './files.api';

/**
 * تاریخچه عملیات روی یک فایل (معیار پذیرش ۵ فاز ۵).
 *
 * منبع، گزارش حسابرسی است نه جدول جداگانه: همان ردیف‌هایی که سرویس هنگام آپلود،
 * دانلود، پیش‌نمایش و حذف می‌نویسد. پس «چه کسی این فایل را دانلود کرد» قابل پاسخ است.
 */
const ACTION_LABELS: Record<string, string> = {
  ATTACHMENT_UPLOAD: 'بارگذاری',
  ATTACHMENT_DOWNLOAD: 'دانلود',
  ATTACHMENT_PREVIEW: 'پیش‌نمایش',
  ATTACHMENT_DELETE: 'حذف',
};

export function AttachmentHistory({
  attachment,
  onClose,
}: {
  attachment: AttachmentRow;
  onClose: () => void;
}): JSX.Element {
  const history = useAttachmentHistory(attachment.id);

  return (
    <Modal title={`تاریخچه ${attachment.originalFilename}`} onClose={onClose}>
      {history.isPending ? <LoadingState label="در حال خواندن تاریخچه…" /> : null}
      {history.isError ? (
        <ErrorState message="دریافت تاریخچه ناموفق بود" onRetry={() => void history.refetch()} />
      ) : null}

      {history.data ? (
        history.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">رویدادی ثبت نشده است.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {history.data.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-3">
                <span className="font-medium">{ACTION_LABELS[row.action] ?? row.action}</span>
                <span className="text-muted-foreground">{row.actor?.fullName ?? 'کاربر حذف‌شده'}</span>
                <span className="text-xs text-muted-foreground">
                  {formatIsoAsJalali(row.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        )
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onClose}>
          بستن
        </Button>
      </div>
    </Modal>
  );
}
