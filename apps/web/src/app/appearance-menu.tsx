import { useRef, useState } from 'react';

import { Button } from '../shared/ui/button';
import { Icon } from '../shared/ui/icon';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../shared/ui/menu';
import { Modal } from '../shared/ui/modal';
import { ApiError } from '../shared/api/client';
import { formatServerMessage } from '../shared/format/money';
import {
  PRIMARY_COLORS,
  PRIMARY_COLOR_LABELS,
  PRIMARY_COLOR_SWATCHES,
  THEME_MODES,
  THEME_MODE_LABELS,
  useTheme,
  type ThemeMode,
} from '../shared/theme/theme';
import { OrganizationMark } from '../features/organization/organization-mark';
import {
  useOrganization,
  useRemoveLogo,
  useUploadLogo,
} from '../features/organization/organization.api';

const MODE_ICONS: Record<ThemeMode, 'sun' | 'moon' | 'monitor'> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
};

/**
 * تنظیمات ظاهر، در سربرگ.
 *
 * پیش از این یک «صفحه» جدا در منو بود. تم و رنگ، تنظیماتی هستند که کاربر می‌خواهد
 * همان لحظه و **در کنار محتوا** عوض کند تا اثرش را ببیند؛ فرستادنش به یک صفحه جدا
 * یعنی کاربر برای دیدن نتیجه باید برگردد.
 */
export function AppearanceMenu({ canManageBranding }: { canManageBranding: boolean }): JSX.Element {
  const { mode, setMode, primary, setPrimary, resolved } = useTheme();
  const [brandingOpen, setBrandingOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  /**
   * مرکز دکمه ظاهر — نقطه‌ای که موج تغییر تم از آن باز می‌شود.
   *
   * مرکزِ **دکمه** گرفته می‌شود نه مرکزِ گزینه‌ای که کاربر زد: موج باید از همان
   * چیزی شروع شود که کاربر آن را «دکمه تم» می‌شناسد، و منو همان لحظه بسته می‌شود.
   */
  const originFromButton = (): { x: number; y: number } | undefined => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  return (
    <>
      <Menu
        ref={anchorRef}
        align="end"
        label="تنظیمات ظاهر"
        trigger={
          <>
            <Icon name={MODE_ICONS[mode]} />
            <span className="sr-only">تنظیمات ظاهر</span>
          </>
        }
        triggerTitle="تنظیمات ظاهر"
      >
        <MenuLabel>تم</MenuLabel>
        {THEME_MODES.map((item) => (
          <MenuItem
            key={item}
            selected={mode === item}
            onSelect={() => setMode(item, originFromButton())}
          >
            <Icon name={MODE_ICONS[item]} />
            <span className="flex-1">{THEME_MODE_LABELS[item]}</span>
            {item === 'system' ? (
              <span className="text-[11px] text-muted-foreground">
                {resolved === 'dark' ? 'تاریک' : 'روشن'}
              </span>
            ) : null}
            {mode === item ? <Icon name="check" size={16} /> : null}
          </MenuItem>
        ))}

        <MenuSeparator />
        <MenuLabel>رنگ اصلی</MenuLabel>
        <div className="grid grid-cols-5 gap-1.5 px-2.5 pb-2 pt-1">
          {PRIMARY_COLORS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPrimary(item)}
              aria-label={PRIMARY_COLOR_LABELS[item]}
              aria-pressed={primary === item}
              title={PRIMARY_COLOR_LABELS[item]}
              className={
                primary === item
                  ? 'flex size-7 items-center justify-center rounded-full ring-2 ring-foreground ring-offset-2 ring-offset-popover'
                  : 'size-7 rounded-full ring-1 ring-border transition-transform duration-150 hover:scale-110 active:scale-95'
              }
              style={{ background: PRIMARY_COLOR_SWATCHES[item] }}
            >
              {primary === item ? <Icon name="check" size={14} className="text-white" /> : null}
            </button>
          ))}
        </div>

        {canManageBranding ? (
          <>
            <MenuSeparator />
            <MenuItem selected={false} onSelect={() => setBrandingOpen(true)}>
              <Icon name="image" />
              <span className="flex-1">نشان سازمان</span>
            </MenuItem>
          </>
        ) : null}
      </Menu>

      {brandingOpen ? <BrandingDialog onClose={() => setBrandingOpen(false)} /> : null}
    </>
  );
}

/** بارگذاری و حذف نشان سازمان. */
function BrandingDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const organization = useOrganization();
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasLogo = organization.data?.logoPath !== null && organization.data?.logoPath !== undefined;

  const send = (file: File | undefined): void => {
    if (!file) return;
    setMessage(null);
    upload.mutate(file, {
      onSuccess: () => setMessage('نشان سازمان به‌روز شد.'),
      onError: (error) =>
        setMessage(
          error instanceof ApiError ? formatServerMessage(error.message) : 'بارگذاری ناموفق بود',
        ),
    });
  };

  return (
    <Modal title="نشان سازمان" onClose={onClose}>
      <div className="flex items-center gap-4">
        <span className="flex size-20 items-center justify-center rounded-xl border border-border bg-muted/50">
          <OrganizationMark size={56} />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-medium">{organization.data?.name ?? 'سازمان'}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            تصویر PNG یا JPEG، حداکثر یک مگابایت. نشان در نوار کناری و سربرگ دیده می‌شود.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={(event) => {
          send(event.target.files?.[0]);
          // بدون این، انتخاب دوباره همان فایل رویداد change تولید نمی‌کند.
          event.target.value = '';
        }}
      />

      {message ? (
        <p
          role="status"
          className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button loading={upload.isPending} onClick={() => inputRef.current?.click()}>
          <Icon name="upload" />
          {hasLogo ? 'جایگزینی نشان' : 'بارگذاری نشان'}
        </Button>

        {hasLogo ? (
          <Button
            variant="secondary"
            loading={remove.isPending}
            onClick={() => {
              setMessage(null);
              remove.mutate(undefined, {
                onSuccess: () => setMessage('نشان سازمان حذف شد.'),
                onError: () => setMessage('حذف نشان ناموفق بود'),
              });
            }}
          >
            <Icon name="trash" />
            حذف نشان
          </Button>
        ) : null}

        <Button variant="ghost" onClick={onClose}>
          بستن
        </Button>
      </div>
    </Modal>
  );
}
