import { useId, useState } from 'react';
import type { TaxMode } from '@dm/shared';

import { cn } from '../../shared/ui/cn';
import { HELP_CLASS, LABEL_CLASS, borderClass } from '../../shared/ui/field';
import { groupDigits, toPersianDigits } from '../../shared/format/money';

export interface TaxDraft {
  readonly mode: TaxMode;
  /** basis point؛ ۱۰ درصد ⇒ ۱۰۰۰ (ADR-0003). فقط در حالت درصدی معنا دارد. */
  readonly rateBp: number | null;
  readonly amount: string;
}

/**
 * ورود مالیات: درصدی یا مبلغ دستی.
 *
 * تصمیم Q4: کاربر باید **هم** درصد متفاوت بتواند بزند و **هم** مستقیم مبلغ. نرخ
 * به‌صورت basis point صحیح نگه داشته می‌شود، نه اعشار؛ ۹٫۵ درصد یعنی ۹۵۰.
 *
 * چرا این‌قدر جمع‌وجور: این کنترل در **هر ردیف کالا** تکرار می‌شود. شکل پیشینش یک
 * `fieldset` با کادر و دو دکمهٔ تمام‌عرض و یک ورودی برچسب‌دار بود که تقریباً دو برابر
 * بقیهٔ فیلدهای ردیف ارتفاع می‌گرفت. حالا یک کنترل ترکیبی است: کلید روش چسبیده به
 * ورودی، هم‌ارتفاع با بقیهٔ فیلدها.
 *
 * واحد هم بیرون از ورودی نوشته می‌شود (٪ یا ریال)، تا کاربر لازم نباشد حدس بزند عددی
 * که می‌زند درصد است یا مبلغ.
 */
export function TaxFields({
  draft,
  onChange,
  label = 'مالیات',
  defaultRateBp = 1000,
}: {
  draft: TaxDraft;
  onChange: (next: TaxDraft) => void;
  label?: string;
  defaultRateBp?: number;
}): JSX.Element {
  const inputId = useId();
  const helpId = `${inputId}-help`;

  /*
    متنِ در حال تایپِ درصد، جدا از مقدار ذخیره‌شده.

    مقدار واقعی basis point صحیح است، پس «۹٫» پس از تبدیل می‌شود ۹۰۰ و دوباره «۹»
    نمایش داده می‌شود — یعنی ممیز همان لحظه ناپدید می‌شد و تایپِ «۹٫۵» عملاً «۹۵»
    (یعنی ۹۵ درصد) می‌داد. تا وقتی فوکوس در کادر است متن کاربر دست‌نخورده می‌ماند و
    با خروج از کادر به شکل متعارف برمی‌گردد.
  */
  const [typing, setTyping] = useState<string | null>(null);

  const percentMode = draft.mode === 'PERCENT';
  const rateInvalid = percentMode && draft.rateBp === null;

  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className={LABEL_CLASS}>{label}</legend>

      <div
        className={cn(
          'flex h-10 items-stretch overflow-hidden rounded-lg border bg-card transition-colors',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
          borderClass(rateInvalid),
        )}
      >
        {/*
          کلید روش. `aria-pressed` وضعیت را می‌گوید و نام دسترس‌پذیر کامل است؛ «٪» و
          «ریال» روی دکمه فقط نشانهٔ دیداری‌اند.
        */}
        <div role="group" aria-label="روش محاسبهٔ مالیات" className="flex shrink-0">
          <ModeButton
            active={percentMode}
            label="محاسبهٔ درصدی"
            text="٪"
            onClick={() => {
              setTyping(null);
              onChange({ mode: 'PERCENT', rateBp: draft.rateBp ?? defaultRateBp, amount: '' });
            }}
          />
          <ModeButton
            active={!percentMode}
            label="ورود مستقیم مبلغ"
            text="ریال"
            // در حالت مبلغ، نرخ باید **خالی** شود؛ قید دیتابیس هم همین را می‌خواهد.
            onClick={() => onChange({ mode: 'AMOUNT', rateBp: null, amount: draft.amount })}
          />
        </div>

        <input
          id={inputId}
          required
          autoComplete="off"
          inputMode={percentMode ? 'decimal' : 'numeric'}
          aria-label={percentMode ? 'درصد مالیات' : 'مبلغ مالیات'}
          aria-describedby={helpId}
          aria-invalid={rateInvalid ? true : undefined}
          value={
            percentMode
              ? (typing ?? (draft.rateBp === null ? '' : percentText(draft.rateBp)))
              : draft.amount
          }
          onBlur={() => setTyping(null)}
          onChange={(event) => {
            if (!percentMode) {
              onChange({ ...draft, amount: normalizeAmount(event.target.value) });
              return;
            }
            const text = sanitizePercentText(event.target.value);
            setTyping(text);
            onChange({ ...draft, rateBp: parsePercent(text) });
          }}
          placeholder={percentMode ? '۱۰' : '۰'}
          className="money min-w-0 flex-1 border-s border-input bg-transparent px-3 text-sm outline-none"
        />
      </div>

      {/*
        خط راهنما همیشه هست (حتی خالی)، تا ارتفاع ردیف با عوض شدن حالت نپرد.
        جای «معادل ۱۰۰۰ basis point» را گرفته: basis point واحد ذخیره‌سازی داخلی است
        و برای کسی که فاکتور می‌زند معنایی ندارد؛ آنچه به کارش می‌آید این است که درصد
        روی **چه مبلغی** اعمال می‌شود.
      */}
      <p
        id={helpId}
        className={cn(HELP_CLASS, rateInvalid ? 'text-destructive' : 'text-muted-foreground')}
      >
        {percentMode
          ? draft.rateBp === null
            ? 'درصد را بنویسید؛ مثلاً ۱۰ یا ۹٫۵'
            : `${toPersianDigits(percentText(draft.rateBp))}٪ از مبلغ پس از تخفیف`
          : draft.amount
            ? `${toPersianDigits(groupDigits(draft.amount))} ریال`
            : 'مبلغ مالیات را مستقیم بنویسید'}
      </p>
    </fieldset>
  );
}

function ModeButton({
  active,
  label,
  text,
  onClick,
}: {
  active: boolean;
  label: string;
  text: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'px-2.5 text-xs transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {text}
    </button>
  );
}

function percentText(rateBp: number): string {
  return String(rateBp / 100);
}

/** ارقام لاتین و حداکثر یک ممیز؛ هر چیز دیگری کنار گذاشته می‌شود. */
function sanitizePercentText(raw: string): string {
  let text = '';
  let hasDot = false;

  for (const char of raw) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) text += char;
    else if (code >= 0x06f0 && code <= 0x06f9) text += String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) text += String(code - 0x0660);
    else if ((char === '.' || char === '٫' || char === '،') && !hasDot) {
      text += '.';
      hasDot = true;
    }
  }

  return text;
}

/** فقط رقم، با تبدیل ارقام فارسی و عربی — همان قاعدهٔ `MoneyInput` (ADR-0003). */
function normalizeAmount(raw: string): string {
  let digits = '';
  for (const char of raw) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) digits += char;
    else if (code >= 0x06f0 && code <= 0x06f9) digits += String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) digits += String(code - 0x0660);
  }
  return digits.replace(/^0+(?=\d)/u, '');
}

/**
 * «۹٫۵» ⇒ ۹۵۰. ارقام فارسی و ممیز فارسی هم پذیرفته می‌شوند.
 * مقدار نامعتبر `null` می‌شود تا سرور خطای صریح بدهد، نه اینکه صفر فرض شود.
 */
export function parsePercent(raw: string): number | null {
  let normalized = '';
  for (const char of raw) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) normalized += char;
    else if (code >= 0x06f0 && code <= 0x06f9) normalized += String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) normalized += String(code - 0x0660);
    else if (char === '.' || char === '٫' || char === '،') normalized += '.';
  }

  if (normalized === '' || normalized === '.') return null;

  const percent = Number(normalized);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;

  // گرد کردن به نزدیک‌ترین basis point صحیح: ۹٫۵۵۵ ⇒ ۹۵۶.
  return Math.round(percent * 100);
}
