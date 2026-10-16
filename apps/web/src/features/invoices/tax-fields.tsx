import type { TaxMode } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { MoneyInput } from '../../shared/ui/money-input';
import { toPersianDigits } from '../../shared/format/money';

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
  return (
    <fieldset className="rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-medium">{label}</legend>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <span className="block text-xs text-muted-foreground">روش</span>
          <div className="mt-1.5 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={draft.mode === 'PERCENT' ? 'primary' : 'secondary'}
              aria-pressed={draft.mode === 'PERCENT'}
              onClick={() =>
                onChange({ mode: 'PERCENT', rateBp: draft.rateBp ?? defaultRateBp, amount: '' })
              }
            >
              درصدی
            </Button>
            <Button
              type="button"
              size="sm"
              variant={draft.mode === 'AMOUNT' ? 'primary' : 'secondary'}
              aria-pressed={draft.mode === 'AMOUNT'}
              // در حالت مبلغ، نرخ باید **خالی** شود؛ قید دیتابیس هم همین را می‌خواهد.
              onClick={() => onChange({ mode: 'AMOUNT', rateBp: null, amount: draft.amount })}
            >
              ورود مبلغ
            </Button>
          </div>
        </div>

        {draft.mode === 'PERCENT' ? (
          <div className="w-40">
            <Input
              label="درصد"
              required
              inputMode="decimal"
              value={draft.rateBp === null ? '' : percentText(draft.rateBp)}
              onChange={(event) => onChange({ ...draft, rateBp: parsePercent(event.target.value) })}
              hint={
                draft.rateBp === null
                  ? 'مثلاً ۱۰ یا ۹٫۵'
                  : `معادل ${toPersianDigits(String(draft.rateBp))} basis point`
              }
            />
          </div>
        ) : (
          <div className="w-56">
            <MoneyInput
              label="مبلغ مالیات"
              required
              value={draft.amount}
              onChange={(amount) => onChange({ ...draft, amount })}
            />
          </div>
        )}
      </div>
    </fieldset>
  );
}

function percentText(rateBp: number): string {
  const percent = rateBp / 100;
  return Number.isInteger(percent) ? String(percent) : String(percent);
}

/**
 * «۹٫۵» ⇒ ۹۵۰. ارقام فارسی و ممیز فارسی هم پذیرفته می‌شوند.
 * مقدار نامعتبر `null` می‌شود تا سرور خطای صریح بدهد، نه اینکه صفر فرض شود.
 */
function parsePercent(raw: string): number | null {
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
