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
  useUpdateOrganization,
  useUploadLogo,
  type OrganizationDto,
} from '../features/organization/organization.api';
import { Input } from '../shared/ui/input';
import { YearInput } from '../shared/ui/year-input';

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
              <Icon name="settings" />
              <span className="flex-1">تنظیمات سازمان</span>
            </MenuItem>
          </>
        ) : null}
      </Menu>

      {brandingOpen ? <BrandingDialog onClose={() => setBrandingOpen(false)} /> : null}
    </>
  );
}

/** نشان سازمان و سال‌های پیش‌فرض. */
function BrandingDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const organization = useOrganization();
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const save = useUpdateOrganization();
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
    <Modal title="تنظیمات سازمان" onClose={onClose}>
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

      {/*
        هویت سازمان.

        نام سازمان سربرگ **هر گزارشی** است که چاپ می‌شود؛ تا امروز فقط از داده
        مرجع می‌آمد و راهی برای عوض کردنش نبود، پس روی فرم‌ها «سازمان» چاپ می‌شد.
      */}
      <OrganizationIdentity
        organization={organization.data ?? null}
        saving={save.isPending}
        onSave={(input) => {
          setMessage(null);
          save.mutate(input, {
            onSuccess: () => setMessage('مشخصات سازمان ذخیره شد.'),
            onError: (error) =>
              setMessage(
                error instanceof ApiError ? formatServerMessage(error.message) : 'ذخیره ناموفق بود',
              ),
          });
        }}
      />

      <DefaultYears
        fiscal={organization.data?.defaultFiscalYear ?? null}
        jalali={organization.data?.defaultJalaliYear ?? null}
        saving={save.isPending}
        onSave={(input) => {
          setMessage(null);
          save.mutate(input, {
            onSuccess: () => setMessage('سال‌های پیش‌فرض ذخیره شد.'),
            onError: (error) =>
              setMessage(
                error instanceof ApiError ? formatServerMessage(error.message) : 'ذخیره ناموفق بود',
              ),
          });
        }}
      />

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

/**
 * سال مالی و سال شمسی پیش‌فرض.
 *
 * این دو عدد در فرم ایجاد سند از پیش پر می‌شوند. نگه داشتنشان در تنظیمات سازمان —
 * نه در مرورگرِ هر کاربر — عمدی است: سال جاری یک واقعیت سازمانی است، نه سلیقهٔ شخصی، و
 * نباید بین دو کاربر فرق کند.
 */
/**
 * نام و مشخصات سازمان.
 *
 * نام **الزامی** است و بقیه اختیاری: سربرگِ بی‌نام، فرمی می‌سازد که معلوم نیست از
 * کجاست، ولی سازمانی که نمابر ندارد هم وجود دارد.
 *
 * فرم با `key` از روی مقدار سرور ساخته می‌شود تا پس از ذخیره، همان چیزی را نشان
 * دهد که ذخیره شده — نه نوشتهٔ نیمه‌کارهٔ قبلی.
 */
function OrganizationIdentity({
  organization,
  saving,
  onSave,
}: {
  organization: OrganizationDto | null;
  saving: boolean;
  onSave: (input: {
    name: string;
    addressLine: string | null;
    postalCode: string | null;
    phone: string | null;
    fax: string | null;
  }) => void;
}): JSX.Element {
  const [name, setName] = useState(organization?.name ?? '');
  const [addressLine, setAddressLine] = useState(organization?.addressLine ?? '');
  const [postalCode, setPostalCode] = useState(organization?.postalCode ?? '');
  const [phone, setPhone] = useState(organization?.phone ?? '');
  const [fax, setFax] = useState(organization?.fax ?? '');

  return (
    <section className="mt-5 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">مشخصات سازمان</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        نام سازمان در سربرگ همهٔ گزارش‌های چاپی می‌آید. بقیهٔ فیلدها اختیاری‌اند و در
        قالب‌هایی که به آن‌ها اشاره کنند استفاده می‌شوند.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="نام سازمان"
            required
            maxLength={300}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            label="نشانی"
            maxLength={1000}
            value={addressLine}
            onChange={(event) => setAddressLine(event.target.value)}
            hint="اختیاری"
          />
        </div>
        <Input
          label="تلفن"
          maxLength={30}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          hint="اختیاری"
        />
        <Input
          label="کد پستی"
          maxLength={10}
          value={postalCode}
          onChange={(event) => setPostalCode(event.target.value)}
          hint="اختیاری"
        />
        <Input
          label="نمابر"
          maxLength={30}
          value={fax}
          onChange={(event) => setFax(event.target.value)}
          hint="اختیاری"
        />
      </div>

      <Button
        className="mt-4"
        size="sm"
        loading={saving}
        disabled={name.trim() === ''}
        onClick={() =>
          onSave({
            name: name.trim(),
            addressLine: addressLine.trim() || null,
            postalCode: postalCode.trim() || null,
            phone: phone.trim() || null,
            fax: fax.trim() || null,
          })
        }
      >
        ذخیرهٔ مشخصات
      </Button>
    </section>
  );
}

function DefaultYears({
  fiscal,
  jalali,
  saving,
  onSave,
}: {
  fiscal: number | null;
  jalali: number | null;
  saving: boolean;
  onSave: (input: { defaultFiscalYear: number | null; defaultJalaliYear: number | null }) => void;
}): JSX.Element {
  const [fiscalYear, setFiscalYear] = useState(fiscal === null ? '' : String(fiscal));
  const [jalaliYear, setJalaliYear] = useState(jalali === null ? '' : String(jalali));

  const toYear = (value: string): number | null => (value.length === 4 ? Number(value) : null);
  const dirty = toYear(fiscalYear) !== fiscal || toYear(jalaliYear) !== jalali;

  return (
    <section className="mt-5 border-t border-border pt-5">
      <h4 className="text-sm font-semibold">سال‌های پیش‌فرض</h4>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        فرم ایجاد سند این دو را از پیش پر می‌کند. خالی گذاشتنشان یعنی تازه‌ترین سال مالی باز.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <YearInput label="سال مالی پیش‌فرض" value={fiscalYear} onChange={setFiscalYear} />
        <YearInput label="سال شمسی پیش‌فرض" value={jalaliYear} onChange={setJalaliYear} />
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          loading={saving}
          disabled={!dirty}
          onClick={() =>
            onSave({
              defaultFiscalYear: toYear(fiscalYear),
              defaultJalaliYear: toYear(jalaliYear),
            })
          }
        >
          ذخیرهٔ سال‌ها
        </Button>

        {fiscal !== null || jalali !== null ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFiscalYear('');
              setJalaliYear('');
              onSave({ defaultFiscalYear: null, defaultJalaliYear: null });
            }}
          >
            برداشتن پیش‌فرض
          </Button>
        ) : null}
      </div>
    </section>
  );
}
