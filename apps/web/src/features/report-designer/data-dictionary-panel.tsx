import { useState } from 'react';

import { toPersianDigits } from '../../shared/format/money';
import type { DataSourceDto } from './templates.api';

const TYPE_LABELS: Record<DataSourceDto['fields'][number]['type'], string> = {
  money: 'مبلغ ریالی',
  integer: 'عدد صحیح',
  text: 'متن',
  date: 'تاریخ',
  jalaliDate: 'تاریخ شمسی',
  boolean: 'بله/خیر',
};

/**
 * مرورگر فهرست داده (Data Dictionary).
 *
 * دو چیز را روشن می‌کند و هر دو مهم‌اند:
 *
 *  ۱. **قالب فقط به همین مسیرها می‌تواند اشاره کند.** هر چیز دیگری خطای اعتبارسنجی
 *     است، نه یک سلول خالی. پس این فهرست «همه چیزِ» در دسترس طراح است.
 *
 *  ۲. **این فهرست با مجوزهای شما فیلتر شده است.** سرور منابعی را که کاربر حق دیدنشان
 *     را ندارد حتی نام‌شان را هم نمی‌فرستد؛ نشان دادن نام ستون‌های غیرمجاز، خودش
 *     افشای اطلاعات است.
 */
export function DataDictionaryPanel({
  sources,
}: {
  sources: readonly DataSourceDto[];
}): JSX.Element {
  const [open, setOpen] = useState<string | null>(sources[0]?.key ?? null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(path);
    } catch {
      // کلیپ‌بورد در زمینه‌های ناامن یا با رد اجازه کار نمی‌کند؛ مسیر روی صفحه هست.
      setCopied(null);
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">فهرست داده</h3>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          قالب تنها به این مسیرها می‌تواند اشاره کند و این فهرست با مجوزهای شما فیلتر
          شده است.
        </p>
      </div>

      {sources.length === 0 ? (
        <p className="text-xs text-muted-foreground">هیچ منبع داده‌ای در دسترس شما نیست.</p>
      ) : null}

      <ul className="space-y-1">
        {sources.map((source) => {
          const isOpen = open === source.key;

          return (
            <li key={source.key} className="rounded-md border border-border">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : source.key)}
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-start"
              >
                <span className="truncate text-xs font-medium">{source.titleFa}</span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {source.cardinality === 'list'
                    ? `مجموعه · ${toPersianDigits(String(source.fields.length))} ستون`
                    : `تکی · ${toPersianDigits(String(source.fields.length))} فیلد`}
                </span>
              </button>

              {isOpen ? (
                <ul className="border-t border-border p-1.5">
                  {source.fields.map((field) => {
                    const path =
                      source.cardinality === 'list'
                        ? `row.${field.key}`
                        : `${source.key}.${field.key}`;

                    return (
                      <li key={field.key}>
                        <button
                          type="button"
                          onClick={() => void copy(path)}
                          title="برای کپی مسیر کلیک کنید"
                          className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-start hover:bg-muted"
                        >
                          <span className="truncate text-[11px]">{field.titleFa}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {TYPE_LABELS[field.type]}
                            </span>
                            <code dir="ltr" className="text-[10px] text-primary">
                              {copied === path ? 'کپی شد' : path}
                            </code>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {source.cardinality === 'list' ? (
                    <li className="px-1.5 pt-1 text-[10px] leading-4 text-muted-foreground">
                      ستون‌های یک مجموعه با پیشوند <code dir="ltr">row.</code> و تنها داخل
                      جدولی که منبع دادهٔ آن همین مجموعه است در دسترس‌اند.
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
