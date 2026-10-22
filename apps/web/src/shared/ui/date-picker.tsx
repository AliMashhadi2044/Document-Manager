import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { JalaliError, formatJalali, isoDateToJalali, jalaliToIsoDate, parseJalali } from '@dm/shared';
import { JALALI_MONTH_NAMES } from '@dm/shared';

import { cn } from './cn';
import { Icon } from './icon';
import { HELP_CLASS, LABEL_CLASS, borderClass } from './field';
import { toPersianDigits } from '../format/money';
import { useAnchoredPosition } from './use-anchored-position';
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  isWithin,
  joinDateTime,
  monthOf,
  parseTime,
  quickRanges,
  shiftMonth,
  splitDateTime,
  todayIso,
  type DayCell,
} from './jalali-calendar';

/**
 * انتخابگر تاریخ شمسی — تک‌تاریخ و بازه، با ساعت اختیاری.
 *
 * سه تصمیم که شکل این کنترل را تعیین کرده‌اند:
 *
 *  1. **تایپ از تقویم گرفته نشده است.** بایگان تاریخ را از روی برگهٔ کاغذی وارد
 *     می‌کند و تایپ پیوسته از باز کردن تقویم سریع‌تر است؛ پس ورودی متنی سر جایش
 *     مانده و تقویم یک راه **دوم** است، نه جایگزین.
 *  2. **تبدیل و اعتبارسنجی از `@dm/shared` می‌آید** — همان توابعی که سرور استفاده
 *     می‌کند. پس «۳۱ مهر» هر دو طرف یک‌جور رد می‌شود و تقویم دومی در کلاینت ساخته
 *     نمی‌شود (ریسک R12).
 *  3. **مقدار بیرونی همیشه میلادی است**: `YYYY-MM-DD`، و با ساعت `YYYY-MM-DDTHH:mm`.
 *     قرارداد API همین است و سرور هرگز به تبدیل کلاینت اعتماد نمی‌کند.
 *
 * تقویم در پورتال باز می‌شود و جای‌دهی‌اش با همان قلابی است که فهرست انتخاب از آن
 * استفاده می‌کند — یعنی درون `dialog` و درون سلول‌های `overflow-auto` هم درست
 * می‌نشیند و کادر را به اسکرول نمی‌اندازد.
 */

export interface DateRangeValue {
  readonly from: string | null;
  readonly to: string | null;
}

export function JalaliDatePicker({
  label,
  value,
  onChange,
  withTime = false,
  required = false,
  disabled = false,
  error,
  hint,
  compact = false,
}: {
  label: string;
  /** `YYYY-MM-DD` یا با ساعت `YYYY-MM-DDTHH:mm`. */
  value: string | null;
  onChange: (value: string | null) => void;
  withTime?: boolean;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: ReactNode;
  /** بدون خط راهنمای زیر کادر — برای ردیف‌هایی که باید هم‌تراز بمانند. */
  compact?: boolean;
}): JSX.Element {
  const inputId = useId();
  const parts = splitDateTime(value);

  return (
    <PickerShell
      label={label}
      labelFor={inputId}
      required={required}
      disabled={disabled}
      error={error}
      hint={hint}
      compact={compact}
      summary={parts.date ? describeDate(parts.date, parts.time) : null}
      text={
        <DateTextInput
          id={inputId}
          isoDate={parts.date}
          onChangeDate={(iso) => onChange(joinDateTime(iso, parts.time))}
          disabled={disabled}
          required={required}
        />
      }
      time={
        withTime ? (
          <TimeInput
            label={`ساعت ${label}`}
            value={parts.time}
            onChange={(time) => onChange(joinDateTime(parts.date, time))}
            disabled={disabled || parts.date === null}
          />
        ) : null
      }
      panel={(close) => (
        <CalendarPanel
          selected={parts.date}
          onPick={(iso) => {
            onChange(joinDateTime(iso, parts.time));
            close();
          }}
        />
      )}
    />
  );
}

export function JalaliDateRangePicker({
  label,
  value,
  onChange,
  withTime = false,
  required = false,
  disabled = false,
  error,
  hint,
  compact = false,
}: {
  label: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  withTime?: boolean;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: ReactNode;
  /** بدون خط راهنمای زیر کادر — برای ردیف‌هایی که باید هم‌تراز بمانند. */
  compact?: boolean;
}): JSX.Element {
  const from = splitDateTime(value.from);
  const to = splitDateTime(value.to);

  const set = (nextFrom: string | null, nextTo: string | null): void =>
    onChange({
      from: joinDateTime(nextFrom, from.time),
      to: joinDateTime(nextTo, to.time),
    });

  return (
    <PickerShell
      label={label}
      required={required}
      disabled={disabled}
      error={error}
      hint={hint}
      compact={compact}
      summary={
        from.date && to.date
          ? `از ${describeDate(from.date, from.time)} تا ${describeDate(to.date, to.time)}`
          : from.date
            ? `از ${describeDate(from.date, from.time)} — پایان بازه را انتخاب کنید`
            : null
      }
      text={
        <div className="flex items-center gap-2">
          <DateTextInput
            isoDate={from.date}
            onChangeDate={(iso) => set(iso, to.date)}
            disabled={disabled}
            required={required}
            ariaLabel={`${label} — از`}
          />
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            تا
          </span>
          <DateTextInput
            isoDate={to.date}
            onChangeDate={(iso) => set(from.date, iso)}
            disabled={disabled}
            required={required}
            ariaLabel={`${label} — تا`}
          />
        </div>
      }
      time={
        withTime ? (
          <div className="flex items-center gap-2">
            <TimeInput
              label={`${label} — ساعت شروع`}
              value={from.time}
              onChange={(time) =>
                onChange({ from: joinDateTime(from.date, time), to: value.to })
              }
              disabled={disabled || from.date === null}
            />
            <TimeInput
              label={`${label} — ساعت پایان`}
              value={to.time}
              onChange={(time) => onChange({ from: value.from, to: joinDateTime(to.date, time) })}
              disabled={disabled || to.date === null}
            />
          </div>
        ) : null
      }
      panel={(close) => (
        <CalendarPanel
          selected={from.date}
          rangeFrom={from.date}
          rangeTo={to.date}
          onPick={(iso) => {
            /*
              یک کلیک شروع می‌گذارد، کلیک بعدی پایان.
              کلیک روی روزی پیش از شروع، بازه را **از نو** شروع می‌کند و نه یک بازهٔ
              وارونه — وارونه چیزی است که سرور بعداً رد می‌کرد، بی‌آنکه کاربر بفهمد چرا.
            */
            if (from.date === null || to.date !== null) {
              set(iso, null);
              return;
            }
            if (iso < from.date) {
              set(iso, null);
              return;
            }
            set(from.date, iso);
            close();
          }}
          onQuickRange={(range) => {
            set(range.from, range.to);
            close();
          }}
        />
      )}
    />
  );
}

/** کادر مشترک: برچسب، ورودی متنی، دکمهٔ تقویم، پورتالِ پنل و خط راهنما. */
function PickerShell({
  label,
  labelFor,
  required,
  disabled,
  error,
  hint,
  compact = false,
  summary,
  text,
  time,
  panel,
}: {
  label: string;
  /**
   * شناسهٔ ورودیِ متنی در حالت تک‌تاریخ.
   *
   * با آن، برچسب یک `<label for>` واقعی است و کلیک روی برچسب هم فوکوس را به ورودی
   * می‌برد. در حالت بازه دو ورودی هست و برچسبِ گروه نمی‌تواند به یکی اشاره کند؛
   * آنجا هر ورودی `aria-label` خودش را دارد.
   */
  labelFor?: string | undefined;
  required: boolean;
  disabled: boolean;
  error?: string | undefined;
  hint?: ReactNode;
  compact?: boolean;
  summary: string | null;
  text: ReactNode;
  time: ReactNode;
  panel: (close: () => void) => ReactNode;
}): JSX.Element {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const container =
    open && triggerRef.current
      ? (triggerRef.current.closest('dialog') ?? document.body)
      : document.body;
  const position = useAnchoredPosition(triggerRef, open, container);

  // بستن با کلیک بیرون و با Escape؛ فوکوس به دکمهٔ تقویم برمی‌گردد تا کاربر کیبورد
  // از ابتدای صفحه شروع نکند.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="space-y-1.5">
      {/* در حالت فشرده برچسب فقط برای صفحه‌خوان می‌ماند؛ سرستونِ جدول آن را می‌گوید. */}
      <label id={id} htmlFor={labelFor} className={compact ? 'sr-only' : LABEL_CLASS}>
        {label}
        {required ? (
          <span className="text-destructive ms-1" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {/*
        کلیک روی هر جای کادر، فوکوس را به ورودی می‌برد.

        پیش از این فقط خودِ ورودی فوکوس‌پذیر بود و چون باریک‌تر از کادر است، کلیک
        کنار آن هیچ کاری نمی‌کرد و کادر «نیمه‌فعال» به نظر می‌رسید.
      */}
      <div
        onMouseDown={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          event.currentTarget.querySelector('input')?.focus();
        }}
        className={cn(
          'flex h-10 cursor-text items-center gap-1 rounded-lg border bg-card px-2 transition-colors',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
          borderClass(Boolean(error)),
          disabled && 'opacity-60',
        )}
        title={compact ? (summary ?? undefined) : undefined}
      >
        <div className="min-w-0 flex-1">{text}</div>
        {time}

        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="باز کردن تقویم"
          aria-describedby={id}
          title="باز کردن تقویم"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-90 disabled:cursor-not-allowed"
        >
          <Icon name="calendar" size={16} />
        </button>
      </div>

      {/* در حالت فشرده، خلاصه روی خودِ کادر می‌نشیند تا ارتفاع ردیف ثابت بماند. */}
      {compact && !error ? null : (
        <p className={cn(HELP_CLASS, error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? summary ?? hint ?? 'قالب: سال/ماه/روز'}
        </p>
      )}

      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={`تقویم ${label}`}
              style={position}
              className="z-50 w-[min(22rem,92vw)] rounded-xl border border-border bg-popover p-3 shadow-[var(--shadow-lift)] animate-[var(--animate-pop)]"
            >
              {panel(() => {
                setOpen(false);
                triggerRef.current?.focus();
              })}
            </div>,
            container,
          )
        : null}
    </div>
  );
}

/** ورودی متنی یک تاریخ شمسی. */
function DateTextInput({
  id,
  isoDate,
  onChangeDate,
  disabled,
  required,
  ariaLabel,
}: {
  id?: string | undefined;
  isoDate: string | null;
  onChangeDate: (iso: string | null) => void;
  disabled: boolean;
  required: boolean;
  ariaLabel?: string | undefined;
}): JSX.Element {
  const canonical = isoDate ? formatJalali(isoDateToJalali(isoDate)) : '';
  /*
    متنِ در حال تایپ جدا از مقدار نگه داشته می‌شود: «۱۴۰۵/» هنوز تاریخ معتبری نیست،
    و اگر مقدار مرجع باشد هر نویسهٔ ناقص بی‌صدا پاک می‌شود و تایپ ناممکن می‌شود.
  */
  const [typing, setTyping] = useState<string | null>(null);

  return (
    <input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      placeholder="۱۴۰۵/۰۷/۲۴"
      value={typing ?? canonical}
      onBlur={() => setTyping(null)}
      onChange={(event) => {
        /*
          ماسک: کاربر فقط رقم می‌زند و «/» خودش سر جایش می‌نشیند.

          این هم تایپ را کوتاه‌تر می‌کند و هم ورودی بی‌ربط («abc»، «۱۴۰۵-۰۷») را از
          اول ناممکن می‌کند — به‌جای اینکه بعداً با پیام خطا ردش کنیم.
        */
        const next = maskJalali(event.target.value);
        setTyping(next);

        if (next === '') {
          onChangeDate(null);
          return;
        }

        try {
          onChangeDate(jalaliToIsoDate(parseJalali(next)));
        } catch {
          // تا وقتی تاریخ کامل و معتبر نشده، مقدار بیرونی خالی می‌ماند؛ پیام خطا را
          // خط راهنمای کادر می‌دهد، نه این‌جا.
          onChangeDate(null);
        }
      }}
      maxLength={10}
      className="money w-full min-w-0 bg-transparent px-1 text-sm outline-none focus-visible:shadow-none placeholder:text-muted-foreground/60 "
    />
  );
}

/**
 * ماسک تاریخ شمسی: فقط رقم، با «/» خودکار پس از سال و ماه.
 *
 * ارقام فارسی و عربی به همان شکل فارسی نگه داشته می‌شوند (خروجی با ارقام فارسی
 * نوشته می‌شود) چون `parseJalali` هر دو را می‌خواند و کاربر فارسی‌نویس نباید ببیند
 * که ارقامش وسط تایپ عوض می‌شوند.
 */
export function maskJalali(raw: string): string {
  let digits = '';
  for (const char of raw) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) digits += char;
    else if (code >= 0x06f0 && code <= 0x06f9) digits += String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) digits += String(code - 0x0660);
  }

  digits = digits.slice(0, 8);
  if (digits.length <= 4) return toPersianDigits(digits);
  if (digits.length <= 6) return toPersianDigits(`${digits.slice(0, 4)}/${digits.slice(4)}`);
  return toPersianDigits(`${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`);
}

function TimeInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (time: string | null) => void;
  disabled: boolean;
}): JSX.Element {
  const [typing, setTyping] = useState<string | null>(null);

  return (
    <input
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      aria-label={label}
      placeholder="۰۰:۰۰"
      value={typing ?? value ?? ''}
      onBlur={() => setTyping(null)}
      onChange={(event) => {
        setTyping(event.target.value);
        onChange(parseTime(event.target.value));
      }}
      className="money w-16 shrink-0 rounded-md border border-input bg-card px-1.5 py-1 text-center text-xs outline-none focus:border-primary disabled:opacity-50"
    />
  );
}

/** پنل تقویم: پیمایش ماه و سال، شبکهٔ روزها، و بازه‌های آماده. */
function CalendarPanel({
  selected,
  rangeFrom,
  rangeTo,
  onPick,
  onQuickRange,
}: {
  selected: string | null;
  rangeFrom?: string | null;
  rangeTo?: string | null;
  onPick: (iso: string) => void;
  onQuickRange?: (range: { from: string; to: string }) => void;
}): JSX.Element {
  const [view, setView] = useState(() => monthOf(selected ?? rangeFrom ?? null));
  const today = todayIso();
  const cells = buildMonthGrid(view.year, view.month);

  const go = (delta: number): void => setView((current) => shiftMonth(current.year, current.month, delta));

  return (
    <div className="space-y-3">
      {/*
        ترتیب DOM در صفحهٔ راست‌به‌چپ از راست خوانده می‌شود: «قبلی» سمت راست می‌نشیند
        و پیکانش هم به راست اشاره می‌کند. پیکان تک برای ماه و دوتایی برای سال.
      */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <NavButton label="سال قبل" icon="chevrons-right" onClick={() => go(-12)} />
          <NavButton label="ماه قبل" icon="chevron-right" onClick={() => go(-1)} />
        </div>

        <span className="money text-sm font-medium">
          {JALALI_MONTH_NAMES[view.month - 1]} {toPersianDigits(String(view.year))}
        </span>

        <div className="flex items-center gap-1">
          <NavButton label="ماه بعد" icon="chevron-left" onClick={() => go(1)} />
          <NavButton label="سال بعد" icon="chevrons-left" onClick={() => go(12)} />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAY_LABELS.map((day, index) => (
          <span
            key={day}
            className={cn('py-1 text-[11px]', index === 6 ? 'text-destructive/70' : 'text-muted-foreground')}
          >
            {day}
          </span>
        ))}

        {cells.map((cell) => (
          <DayButton
            key={cell.iso}
            cell={cell}
            today={today}
            selected={selected}
            rangeFrom={rangeFrom ?? null}
            rangeTo={rangeTo ?? null}
            onPick={onPick}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-t border-border pt-2">
        {onQuickRange ? (
          quickRanges(today).map((range) => (
            <button
              key={range.key}
              type="button"
              onClick={() => onQuickRange({ from: range.from, to: range.to })}
              className="rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {range.label}
            </button>
          ))
        ) : (
          <button
            type="button"
            onClick={() => onPick(today)}
            className="rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            امروز
          </button>
        )}
      </div>
    </div>
  );
}

function DayButton({
  cell,
  today,
  selected,
  rangeFrom,
  rangeTo,
  onPick,
}: {
  cell: DayCell;
  today: string;
  selected: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  onPick: (iso: string) => void;
}): JSX.Element {
  const isEdge = cell.iso === rangeFrom || cell.iso === rangeTo;
  const isSelected = cell.iso === selected || isEdge;
  const inRange = isWithin(cell.iso, rangeFrom, rangeTo);

  return (
    <button
      type="button"
      onClick={() => onPick(cell.iso)}
      aria-current={cell.iso === today ? 'date' : undefined}
      aria-pressed={isSelected}
      // نام کامل، چون «۱۲» به‌تنهایی برای صفحه‌خوان بی‌معناست.
      aria-label={formatJalali(cell.jalali)}
      className={cn(
        'money rounded-md py-1.5 text-xs transition-colors',
        cell.outside && 'text-muted-foreground/40',
        !cell.outside && 'text-foreground hover:bg-muted',
        inRange && !isEdge && 'bg-primary/10',
        isSelected && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
        cell.iso === today && !isSelected && 'ring-1 ring-primary/50',
      )}
    >
      {toPersianDigits(String(cell.jalali.day))}
    </button>
  );
}

/** دکمهٔ پیمایش تقویم — کادر خاکستری کوچک، تا دکمه بودنش دیده شود. */
function NavButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: 'chevron-right' | 'chevron-left' | 'chevrons-right' | 'chevrons-left';
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-90"
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

function describeDate(iso: string, time: string | null): string {
  try {
    const text = formatJalali(isoDateToJalali(iso), { persianDigits: true });
    return time ? `${text} ساعت ${toPersianDigits(time)}` : text;
  } catch (caught) {
    return caught instanceof JalaliError ? caught.message : 'تاریخ نامعتبر';
  }
}
