import type { ReactNode } from 'react';

import { Button } from './button';
import { Modal } from './modal';

/**
 * گفت‌وگوی تأیید — جایگزین `window.confirm`.
 *
 * پنجرهٔ بومی مرورگر سه مشکل داشت که هیچ‌کدام سلیقه‌ای نیستند: فارسی را چپ‌چین
 * نشان می‌داد، با تم سامانه بیگانه بود، و متنش را نمی‌شد از یک جمله بیشتر کرد —
 * پس کاربر پیش از تأیید نمی‌دید دقیقاً چه چیزی را از دست می‌دهد.
 *
 * `tone` فقط رنگ دکمهٔ تأیید را عوض می‌کند: کاری که برگشت‌پذیر نیست باید قرمز
 * باشد، و کاری که فقط یک انتخاب است نباید.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'تأیید',
  cancelLabel = 'انصراف',
  tone = 'destructive',
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'destructive' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-5">
        <div className="text-sm leading-7 text-muted-foreground">{message}</div>

        <div className="flex gap-2 border-t border-border pt-4">
          {/*
            دکمهٔ تأیید اول می‌آید و فوکوس اولیه روی آن **نیست**.

            کاربری که با Enter از فرم آمده، نباید با همان کلید کاری برگشت‌ناپذیر
            را هم تأیید کند.
          */}
          <Button variant={tone === 'destructive' ? 'destructive' : 'primary'} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
