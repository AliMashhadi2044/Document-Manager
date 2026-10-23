import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import type { ReportBlock, TextOverrides } from './reports.api';

/**
 * ویرایش متن‌های بالای گزارش، **برای همین خروجی**.
 *
 * قالب می‌گوید چه چیزی معمولاً بالای گزارش بنشیند؛ ولی یک خروجی مشخص گاهی عنوان یا
 * توضیح دیگری می‌خواهد — نامهٔ همراه، اصلاحیه، عبارتی که اداره خواسته. تا پیش از
 * این تنها راهش عوض کردن خودِ قالب بود: یعنی عوض کردن همهٔ گزارش‌های بعدی برای یک
 * بار نیاز.
 *
 * **قالب دست‌نخورده می‌ماند.** این تغییر به همین اجرا محدود است و با بستن صفحه
 * می‌رود؛ اگر چیزی باید همیشگی باشد، جایش طراح گزارش است.
 *
 * متن‌ها **نهایی**اند، نه قالبِ `{{...}}`: کاربر همان چیزی را ویرایش می‌کند که روی
 * کاغذ می‌بیند، و هیچ متغیری در آن تفسیر نمی‌شود.
 */
export function HeaderEditDialog({
  blocks,
  overrides,
  onClose,
  onApply,
}: {
  /** بلوک‌های چیدمان‌شدهٔ سربرگ و پابرگ — فقط متنی‌ها ویرایش‌شدنی‌اند. */
  blocks: readonly ReportBlock[];
  overrides: TextOverrides;
  onClose: () => void;
  onApply: (next: TextOverrides) => void;
}): JSX.Element {
  const texts = blocks.filter(
    (block): block is Extract<ReportBlock, { kind: 'text' }> => block.kind === 'text',
  );

  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(texts.map((block) => [block.id, overrides[block.id] ?? block.text])),
  );

  const apply = (): void => {
    /*
      فقط آنچه **واقعاً** عوض شده فرستاده می‌شود.

      فرستادن همهٔ متن‌ها یعنی قفل کردن آن‌ها روی مقدار امروز: اگر فردا شمارهٔ سند
      ثبت شود، متنی که از `{{...}}` می‌آمد دیگر تازه نمی‌شد.
    */
    const next: Record<string, string> = {};
    for (const block of texts) {
      const value = (draft[block.id] ?? '').trim();
      if (value !== block.text.trim()) next[block.id] = value;
    }
    onApply(next);
  };

  return (
    <Modal title="ویرایش متن‌های بالای گزارش" onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-lg bg-muted/50 p-3 text-xs leading-6 text-muted-foreground">
          این تغییرها فقط روی همین خروجی اثر دارند — پیش‌نمایش، چاپ و فایل‌های PDF و
          Excel و HTML. قالب گزارش دست‌نخورده می‌ماند؛ برای تغییر همیشگی، از «طراح
          گزارش» استفاده کنید.
        </p>

        {texts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            این گزارش متن ویرایش‌شدنی ندارد.
          </p>
        ) : (
          <div className="space-y-3">
            {texts.map((block) => (
              <Input
                key={block.id}
                label={block.text === '' ? block.id : shorten(block.text)}
                value={draft[block.id] ?? ''}
                maxLength={500}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [block.id]: event.target.value }))
                }
                {...(overrides[block.id] !== undefined ? { hint: 'تغییر داده شده' } : {})}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button onClick={apply} disabled={texts.length === 0}>
            اعمال روی این خروجی
          </Button>
          {Object.keys(overrides).length > 0 ? (
            <Button variant="secondary" onClick={() => onApply({})}>
              بازگشت به متن قالب
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** برچسب فیلد از خود متن می‌آید؛ متن بلند روی برچسب جا نمی‌شود. */
function shorten(text: string): string {
  return text.length <= 40 ? text : `${text.slice(0, 40)}…`;
}
