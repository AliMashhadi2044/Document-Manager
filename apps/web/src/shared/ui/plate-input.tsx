import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import {
  EMPTY_PLATE,
  PLATE_LETTERS,
  plateLetterFor,
  formatPlate,
  isPlateComplete,
  parsePlate,
  plateDigits,
  type PlateParts,
} from '@dm/shared';

import { cn } from './cn';
import { HELP_CLASS, LABEL_CLASS } from './field';
import { Icon } from './icon';
import { Input } from './input';
import { useAnchoredPosition } from './use-anchored-position';
import { toPersianDigits } from '../format/money';

/**
 * ورودی پلاک، به شکل خودِ پلاک.
 *
 * چرا نه یک جعبهٔ متن: پلاک ایران چهار بخش با طول ثابت دارد و کاربر آن را از روی
 * یک شیء فیزیکی رونویسی می‌کند. یک جعبهٔ آزاد یعنی هر کس به سلیقهٔ خودش فاصله و
 * خط تیره بگذارد — که نرمال‌سازی بعداً جمعش می‌کند، اما هنگام **تایپ** هیچ کمکی به
 * کاربر نمی‌کند و غلط‌های طول (سه رقم به جای دو رقم) را هم نمی‌گیرد. وقتی کادر،
 * خودِ پلاک باشد، چشم کاربر بی‌واسطه تطبیق می‌دهد.
 *
 * پلاک‌های غیرمعمول (موتورسیکلت، تشریفات) این قالب را ندارند؛ کلید «پلاک غیرمعمول»
 * به همان متن آزاد برمی‌گردد تا قالب، در را نبندد.
 */

/** پرچم — در اندازهٔ واقعی چند پیکسل است، پس ساده و بدون جزئیات کشیده شده. */
function IranFlag(): JSX.Element {
  return (
    <svg viewBox="0 0 30 20" className="h-3 w-[1.15rem] rounded-[1px]" aria-hidden="true">
      <rect width="30" height="20" fill="#ffffff" />
      <rect width="30" height="6.67" fill="#239f40" />
      <rect y="13.33" width="30" height="6.67" fill="#da0000" />
      <path
        d="M15 7.6v4.2M12.9 8.6c0 2.2 1 3 2.1 3.5 1.1-.5 2.1-1.3 2.1-3.5"
        fill="none"
        stroke="#da0000"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** یک خانهٔ رقمی پلاک. */
function DigitCell({
  value,
  length,
  label,
  placeholder,
  inputRef,
  onValue,
  onFull,
  onEmptyBack,
}: {
  value: string;
  length: number;
  label: string;
  placeholder: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onValue: (next: string) => void;
  onFull?: () => void;
  onEmptyBack?: () => void;
}): JSX.Element {
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      dir="ltr"
      aria-label={label}
      value={toPersianDigits(value)}
      placeholder={placeholder}
      onChange={(event) => {
        const next = plateDigits(event.target.value, length);
        onValue(next);
        // پر شدن خانه یعنی نوبت خانهٔ بعدی؛ کاربر نباید دست به tab ببرد.
        if (next.length === length) onFull?.();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Backspace' && value === '') {
          event.preventDefault();
          onEmptyBack?.();
        }
      }}
      onFocus={(event) => event.target.select()}
      style={{ width: `${length + 0.6}ch` }}
      className={cn(
        'money bg-transparent text-center text-[1.6rem] ring-transparent rounded-md outline-none shadow-none font-bold leading-none tracking-wide',
        'text-black outline-none placeholder:font-normal placeholder:text-black/25',
        'outline-none transition-colors hover:bg-amber-100/50 focus:bg-amber-100/60 ',
      )}
    />
  );
}

/** خانهٔ حرف — فهرست سری‌ها، چون حرف‌ها محدود و معنادارند. */
function LetterCell({
  value,
  onChange,
  onPicked,
  buttonRef,
}: {
  value: string;
  onChange: (letter: string) => void;
  onPicked: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const container =
    open && buttonRef.current ? (buttonRef.current.closest('dialog') ?? document.body) : document.body;
  // دکمهٔ حرف یک نویسه پهنا دارد؛ شبکهٔ چهارستونی سری‌ها با آن عرض خوانا نیست.
  const position = useAnchoredPosition(buttonRef, open, container, 380);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, buttonRef]);

  const pick = (letter: string): void => {
    onChange(letter);
    setOpen(false);
    onPicked();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="حرف پلاک"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          // تایپ مستقیم حرف: کاربری که پلاک را از رو می‌خواند، دستش روی صفحه‌کلید است.
          const match = plateLetterFor(event.key);
          if (match !== null) {
            event.preventDefault();
            pick(match);
          }
        }}
        className={cn(
          'min-w-[2.6rem] rounded px-1 text-center text-[1.6rem] font-bold leading-none text-black',
          'outline-none transition-colors hover:bg-amber-100/50 focus:bg-amber-100/60',
          value === '' && 'text-black/25',
        )}
      >
        {value === '' ? '—' : value}
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              style={position}
              role="listbox"
              aria-label="سری پلاک"
              className={cn(
                'z-50 overflow-auto rounded-xl border border-border bg-popover p-2',
                'shadow-[var(--shadow-lift)] animate-[var(--animate-pop)]',
              )}
            >
              <div className="grid grid-cols-4 gap-1.5">
                {PLATE_LETTERS.map((item) => (
                  <button
                    key={item.char}
                    type="button"
                    role="option"
                    aria-selected={item.char === value}
                    title={item.usage}
                    onClick={() => pick(item.char)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border border-transparent px-1 py-1.5',
                      'transition-colors hover:bg-primary/10',
                      item.char === value && 'border-primary bg-primary/10',
                    )}
                  >
                    <span className="text-base font-bold leading-none">{item.char}</span>
                    <span className="text-[10px] leading-none text-muted-foreground">
                      {item.usage}
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            container,
          )
        : null}
    </>
  );
}

export function PlateInput({
  value,
  onChange,
  error,
  label = 'پلاک',
  required,
  align = 'start',
}: {
  /** متن ذخیره‌شده؛ رشتهٔ خالی یعنی هنوز پلاک معتبری نداریم. */
  value: string;
  onChange: (plate: string) => void;
  error?: string | undefined;
  label?: string;
  required?: boolean;
  /** کادر پلاک عرض خودش را دارد؛ `center` آن را وسط ستونش می‌نشاند. */
  align?: 'start' | 'center';
}): JSX.Element {
  const groupId = useId();
  const hintId = `${groupId}-hint`;

  /*
    حالت اولیه از روی متن ذخیره‌شده: پلاکی که قالب استاندارد ندارد (ردیف‌های قدیمی،
    موتورسیکلت) باید در همان حالت متن آزاد باز شود، نه اینکه خاموش حذف شود.
  */
  const [freeText, setFreeText] = useState(() => value !== '' && parsePlate(value) === null);
  const [parts, setParts] = useState<PlateParts>(() => parsePlate(value) ?? EMPTY_PLATE);

  const leftRef = useRef<HTMLInputElement>(null);
  const letterRef = useRef<HTMLButtonElement>(null);
  const rightRef = useRef<HTMLInputElement>(null);
  const iranRef = useRef<HTMLInputElement>(null);

  const update = (next: PlateParts): void => {
    setParts(next);
    // پلاک ناقص، پلاک نیست: مقدار خالی می‌ماند تا دکمهٔ ثبت فعال نشود.
    onChange(isPlateComplete(next) ? formatPlate(next) : '');
  };

  const started =
    parts.left !== '' || parts.letter !== '' || parts.right !== '' || parts.iran !== '';
  const incomplete = started && !isPlateComplete(parts);

  const centered = align === 'center';

  if (freeText) {
    return (
      <div className={cn('space-y-1.5', centered && 'mx-auto w-full max-w-sm')}>
        <Input
          label={label}
          required={required}
          dir="ltr"
          autoFocus
          value={value}
          error={error}
          onChange={(event) => onChange(event.target.value)}
          hint="پلاک غیرمعمول — همان‌طور که روی فاکتور نوشته شده است."
        />
        <button
          type="button"
          onClick={() => {
            setParts(parsePlate(value) ?? EMPTY_PLATE);
            setFreeText(false);
          }}
          className="text-xs font-medium text-primary hover:underline"
        >
          بازگشت به پلاک استاندارد
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={groupId}
      className={cn('space-y-1.5', centered && 'flex flex-col items-center')}
    >
      <span id={groupId} className={LABEL_CLASS}>
        {label}
        {required ? (
          <span className="text-destructive ms-1" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>

      <div
        dir="ltr"
        aria-describedby={hintId}
        className={cn(
          'flex h-[4.25rem] w-fit items-stretch overflow-hidden rounded-xl bg-white',
          'border-[3px] shadow-sm transition-colors',
          error ? 'border-destructive' : 'border-black',
        )}
      >
        {/* نوار آبی کشوری — سمت چپ پلاک، مثل خودِ پلاک. */}
        <div className="flex w-[2.1rem] shrink-0 flex-col items-center justify-center gap-1 bg-[#163a92] px-1">
          <IranFlag />
          <span className="text-center text-[7px] font-bold leading-[1.05] text-white">
            I.R.
            <br />
            IRAN
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center gap-1 px-3">
          <DigitCell
            value={parts.left}
            length={2}
            label="دو رقم اول پلاک"
            placeholder="۱۲"
            inputRef={leftRef}
            onValue={(left) => update({ ...parts, left })}
            onFull={() => letterRef.current?.focus()}
          />
          <LetterCell
            value={parts.letter}
            buttonRef={letterRef}
            onChange={(letter) => update({ ...parts, letter })}
            onPicked={() => rightRef.current?.focus()}
          />
          <DigitCell
            value={parts.right}
            length={3}
            label="سه رقم پلاک"
            placeholder="۳۴۵"
            inputRef={rightRef}
            onValue={(right) => update({ ...parts, right })}
            onFull={() => iranRef.current?.focus()}
            onEmptyBack={() => letterRef.current?.focus()}
          />
        </div>

        {/* کد شهرستان، پشت خط جداکننده. */}
        <div className="flex w-[3.4rem] shrink-0 flex-col items-center justify-center gap-0.5 border-l-[3px] border-black px-1">
          <span className="text-[9px] font-bold leading-none text-black">ایران</span>
          <DigitCell
            value={parts.iran}
            length={2}
            label="کد شهرستان پلاک"
            placeholder="۱۱"
            inputRef={iranRef}
            onValue={(iran) => update({ ...parts, iran })}
            onEmptyBack={() => rightRef.current?.focus()}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className={cn(HELP_CLASS, 'text-destructive')}>
          {error}
        </p>
      ) : (
        <p id={hintId} className={cn(HELP_CLASS, 'text-muted-foreground')}>
          {incomplete ? 'پلاک کامل نیست — هر چهار بخش را پر کنید.' : 'همان‌طور که روی پلاک خودرو نوشته شده است.'}
        </p>
      )}

      <button
        type="button"
        onClick={() => setFreeText(true)}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Icon name="edit" size={12} />
        پلاک غیرمعمول (موتورسیکلت، تشریفات)
      </button>
    </div>
  );
}

/**
 * نمایش فشردهٔ پلاک در فهرست‌ها و برگهٔ سند.
 *
 * همان قالب، در یک خط جدول: وقتی ورودی شکل پلاک دارد، خروجی هم باید همان باشد —
 * وگرنه کاربر دو بازنمایی متفاوت از یک چیز می‌بیند. پلاکی که قالب استاندارد ندارد
 * به همان متن ساده برمی‌گردد.
 */
export function PlateBadge({ plate, className }: { plate: string; className?: string }): JSX.Element {
  const parts = parsePlate(plate);

  if (!parts) {
    return (
      <span dir="ltr" className={cn('money', className)}>
        {toPersianDigits(plate)}
      </span>
    );
  }

  return (
    <span
      dir="ltr"
      title={plate}
      className={cn(
        'inline-flex h-7  items-stretch overflow-hidden rounded-md border-2 border-black bg-white align-middle',
        className,
      )}
    >
      <span className="flex w-3 items-center justify-center bg-[#163a92] px-2">
        <span className="text-[10px] font-bold leading-none text-white">IR</span>
      </span>
      <span className="money flex min-w-20 justify-center items-center gap-1 px-1.5 text-sm font-bold leading-none text-black">
        <span>{toPersianDigits(parts.left)}</span>
        <span>{parts.letter}</span>
        <span>{toPersianDigits(parts.right)}</span>
      </span>
      <span className="money flex w-7 items-center justify-center border-l-2 border-black text-sm font-bold leading-none text-black">
        {toPersianDigits(parts.iran)}
      </span>
    </span>
  );
}
