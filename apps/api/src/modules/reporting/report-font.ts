import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * قلم فارسی خروجی‌های HTML و PDF، **به‌صورت data URI درون خود سند**.
 *
 * چرا این شکل و نه نصب قلم روی سیستم: رندر PDF با شبکهٔ قطع انجام می‌شود (هر درخواست
 * خارجی در `PdfRenderer` مسدود است) و تکیه بر «قلم‌های نصب‌شده روی سرور» یعنی خروجی
 * به ماشین وابسته می‌شود — روی کانتینری بدون قلم فارسی، گزارش به مربع تبدیل می‌شود و
 * بدتر از آن، عرض ستون‌ها هم عوض می‌شود چون محاسبهٔ چیدمان با قلم دیگری انجام شده.
 *
 * فقط زیرمجموعهٔ عربی/فارسی و لاتین پایه جاسازی می‌شود (حدود ۸۰ کیلوبایت پیش از
 * base64). قلم یک‌بار خوانده و نتیجه نگه داشته می‌شود؛ هر گزارش آن را از نو نمی‌خواند.
 *
 * نام هر دو خانواده اعلام می‌شود: قالب‌های موجود `Vazirmatn` می‌نویسند و بستهٔ قلم
 * نامش `Vazirmatn Variable` است.
 */
const SUBSETS = [
  '@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2',
  '@fontsource-variable/vazirmatn/files/vazirmatn-latin-wght-normal.woff2',
];

const FAMILIES = ['Vazirmatn', 'Vazirmatn Variable'];

let cached: string | null = null;

export function reportFontFaceCss(): string {
  if (cached !== null) return cached;

  // ماژول‌های این سرویس CommonJS هستند، پس `import.meta.url` در دسترس نیست.
  const resolver = createRequire(__filename);
  const sources = SUBSETS.map((specifier) => {
    const base64 = readFileSync(resolver.resolve(specifier)).toString('base64');
    return `url(data:font/woff2;base64,${base64}) format('woff2-variations')`;
  });

  cached = FAMILIES.flatMap((family) =>
    sources.map(
      (src) =>
        `@font-face{font-family:'${family}';font-style:normal;font-weight:100 900;src:${src};}`,
    ),
  ).join('\n');

  return cached;
}
