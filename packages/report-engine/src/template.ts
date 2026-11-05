/**
 * Schema قالب گزارش — نسخه ۱ (docs/09 §۲).
 *
 * قالب یک **سند داده** است: در دیتابیس به‌صورت JSONB می‌نشیند، در طراح بصری فاز ۷ ساخته
 * می‌شود و موتور فقط می‌خواندش. هیچ کد اجرایی در قالب نیست.
 *
 * `schemaVersion` از همین ابتدا هست و `z.literal(1)` است، نه `z.number()`: قالبِ نسخه
 * ناشناخته باید **رد** شود، نه اینکه نیمه‌خوانده و نیمه‌درست رندر شود. مهاجرت نسخه‌ها
 * وقتی نسخه ۲ آمد، یک تابع صریح خواهد بود.
 */

import { z } from 'zod';

import { conditionSchema, expressionSchema, formatSpecSchema } from './expression.js';

const mm = z.number().min(0).max(500);

export const pageSchema = z.object({
  size: z.enum(['A4', 'A5', 'A3', 'LETTER']),
  orientation: z.enum(['portrait', 'landscape']),
  margins: z.object({
    top: mm,
    bottom: mm,
    inlineStart: mm,
    inlineEnd: mm,
  }),
  direction: z.literal('rtl'),
});

export const styleTokensSchema = z.object({
  fontFamily: z.string().max(100),
  baseFontSizePt: z.number().min(5).max(24),
  headingFontSizePt: z.number().min(5).max(36),
  tableFontSizePt: z.number().min(5).max(20),
  borderWidthPx: z.number().min(0).max(5),
  /** پالت چاپ: سیاه‌وسفید، بدون پس‌زمینه کم‌کنتراست (docs/09 §۶). */
  borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  mutedTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
});
export type StyleTokens = z.infer<typeof styleTokensSchema>;

const blockBase = {
  id: z.string().min(1).max(60),
  visibleWhen: conditionSchema.optional(),
};

const textBlockSchema = z.object({
  ...blockBase,
  type: z.literal('text'),
  /** متن با جای‌گذاری `{{path}}`؛ جای‌گذاری با escape کامل انجام می‌شود. */
  text: z.string().max(2000),
  align: z.enum(['start', 'center', 'end']),
  bold: z.boolean().default(false),
  fontSizePt: z.number().min(5).max(36).optional(),
});

const variableBlockSchema = z.object({
  ...blockBase,
  type: z.literal('variable'),
  labelFa: z.string().max(200).optional(),
  value: expressionSchema,
  format: formatSpecSchema,
  align: z.enum(['start', 'center', 'end']).default('start'),
});

const multilineSchema = z.object({
  /** خطوط اضافی همان سلول؛ خط اول خودِ `value` ستون است. */
  lines: z
    .array(
      z.object({
        value: expressionSchema,
        format: formatSpecSchema,
        muted: z.boolean().default(false),
      }),
    )
    .max(4),
});

/**
 * ستونی که **تکرار می‌شود** — یکی به‌ازای هر ردیف یک مجموعه.
 *
 * فرم ریزهزینه برای هر فصلِ بودجه یک ستون دارد، و فصل‌ها **داده مرجع**اند: کاربر
 * اضافه و کم می‌کند. نوشتن هفت ستون در قالب یعنی اولین فصلِ تازه، قالب را هم لازم
 * می‌کند — و تا کسی قالب را عوض نکند، هزینه‌های آن فصل جایی روی کاغذ ندارند.
 *
 * پس قالب **یک** ستون تعریف می‌کند و می‌گوید روی کدام مجموعه تکرار شود. عبارت ستون
 * به `column.key` / `column.title` / `column.code` دسترسی دارد تا بتواند ردیف را با
 * ستون بسنجد؛ بیرون از ستونِ تکرارشونده این مسیرها معنا ندارند و خطای اعتبارسنجی‌اند.
 */
const repeatForSchema = z.object({
  /** کلید مجموعه‌ای که ستون‌ها از آن ساخته می‌شوند؛ باید در Data Dictionary باشد. */
  over: z.string().min(1).max(120),
  /** نام فیلدی که کلید یکتای هر ستون از آن خوانده می‌شود. */
  keyFrom: z.string().min(1).max(60).default('key'),
  /** نام فیلدی که سرستون (خط بالا) از آن خوانده می‌شود. */
  titleFrom: z.string().min(1).max(60).default('title'),
  /** نام فیلدی که خط دوم سرستون از آن خوانده می‌شود؛ نبودنش یعنی سرستون یک‌خطی. */
  subtitleFrom: z.string().min(1).max(60).optional(),
  /**
   * بیشترین تعداد ستونی که این تکرار می‌سازد.
   *
   * بدون سقف، بررسیِ «ستون‌ها از عرض صفحه بیرون نمی‌زنند» بی‌معنا می‌شد: موقع ذخیرهٔ
   * قالب معلوم نیست مجموعه چند ردیف خواهد داشت. با سقف، اعتبارسنجی بدترین حالت را
   * می‌سنجد و اجرا هم اگر مجموعه بزرگ‌تر شد **خطا می‌دهد** و نه ستونِ بریده روی کاغذ.
   */
  maxColumns: z.number().int().min(1).max(40).default(8),
});
export type RepeatForSpec = z.infer<typeof repeatForSchema>;

export const tableColumnSchema = z.object({
  key: z.string().min(1).max(60),
  titleFa: z.string().min(1).max(120),
  /**
   * خط دوم سرستون.
   *
   * فرم کاغذی سرستون را دو تکه می‌کند: بالا عنوان فصل، پایین کدش. دو ستون جدا
   * نیستند — یک ستون‌اند با سرستون دوطبقه، و جمعشان هم یکی است.
   */
  subtitleFa: z.string().max(120).optional(),
  repeatFor: repeatForSchema.optional(),
  width: z.object({
    unit: z.enum(['mm', 'percent', 'auto']),
    value: z.number().min(0).max(500).optional(),
  }),
  align: z.enum(['start', 'center', 'end']),
  value: expressionSchema,
  format: formatSpecSchema,
  multiline: multilineSchema.optional(),
  /**
   * این ستون، **شمارهٔ ردیف** است.
   *
   * ردیف‌های خالیِ پرکننده هم شماره می‌گیرند و شمارش پیوسته می‌ماند؛ بدون این
   * نشان، موتور نمی‌داند کدام ستون شماره است و همه‌شان خالی می‌مانند.
   */
  rowNumber: z.boolean().default(false),
  visibleWhen: conditionSchema.optional(),
});
export type TableColumn = z.infer<typeof tableColumnSchema>;

/**
 * چه چیزی در ردیف جمع بنشیند.
 *
 * `{ kind: 'sumInWords', of: 'total' }` جمعِ **ستون دیگری** را به حروف فارسی
 * می‌نویسد — کاری که فرم کاغذی می‌کند: رقم را می‌شود با یک قلم عوض کرد، حروف را نه.
 *
 * چرا `of` لازم است و نه جمعِ ستون خودش: خانه‌ای که حروف در آن می‌نشیند، ستونی
 * متنی است (نام صاحب حساب) و جمعش صفر است. عدد باید از همان ستونی بیاید که روی
 * کاغذ هم کنارش چاپ می‌شود، وگرنه رقم و حروف دو چیز متفاوت می‌گویند.
 *
 * سلولش تا ستون عددیِ بعدی کشیده می‌شود، چون یک عبارت بلند در یک ستون باریک
 * خوانده نمی‌شود.
 */
export const aggregateSchema = z.union([
  z.enum(['sum', 'count', 'none']),
  z.object({
    kind: z.literal('sumInWords'),
    of: z.string().min(1).max(60),
    /**
     * واحدی که پس از حروف می‌آید («ریال»).
     *
     * در قالب است و نه در موتور: واحد پول یک **تصمیم گزارش** است و نه قاعدهٔ
     * تبدیل عدد به حروف. سفت کردنش در موتور یعنی اولین گزارشی که واحد دیگری
     * بخواهد، باید موتور را عوض کند.
     */
    suffix: z.string().max(20).default(''),
  }),
]);
export type AggregateSpec = z.infer<typeof aggregateSchema>;

const tableBlockSchema = z.object({
  ...blockBase,
  type: z.literal('table'),
  /** باید کلیدی از Data Dictionary باشد؛ بررسی‌اش کار لایه API است. */
  dataSource: z.string().min(1).max(120),
  columns: z.array(tableColumnSchema).min(1).max(40),
  sortBy: z
    .array(z.object({ path: z.string().max(120), dir: z.enum(['asc', 'desc']) }))
    .max(5)
    .default([]),
  totalsRow: z
    .object({
      enabled: z.boolean(),
      labelFa: z.string().max(100),
      /** برای هر کلید ستون: چه چیزی در ردیف جمع بنشیند. */
      cells: z.record(z.string(), aggregateSchema),
    })
    .optional(),
  /** حداقل تعداد ردیف چاپی؛ کمبود با ردیف خالی پر می‌شود (docs/15 §۳). */
  minRows: z.number().int().min(0).max(100).default(0),
  pagination: z.object({
    repeatHeaderOnNewPage: z.boolean(),
    avoidRowBreak: z.boolean(),
  }),
});

const signatureBlockSchema = z.object({
  ...blockBase,
  type: z.literal('signature'),
  /** `roleKey` امضاکننده در اطلاعات پایه؛ نام و سمت در لحظه تولید snapshot می‌شوند. */
  signatoryRoleKey: z.string().min(1).max(50),
  align: z.enum(['start', 'center', 'end']),
  /** ارتفاع فضای امضا بر حسب میلی‌متر. */
  spaceMm: z.number().min(0).max(60).default(18),
});

const signatureRowBlockSchema = z.object({
  ...blockBase,
  type: z.literal('signatureRow'),
  blocks: z.array(signatureBlockSchema).min(1).max(4),
});

const dividerBlockSchema = z.object({ ...blockBase, type: z.literal('divider') });
const spacerBlockSchema = z.object({
  ...blockBase,
  type: z.literal('spacer'),
  heightMm: z.number().min(0).max(100),
});
const pageNumberBlockSchema = z.object({
  ...blockBase,
  type: z.literal('pageNumber'),
  templateFa: z.string().max(100).default('صفحه {{page}} از {{pages}}'),
});
const generatedAtBlockSchema = z.object({
  ...blockBase,
  type: z.literal('generatedAt'),
  labelFa: z.string().max(100).default('تاریخ تولید گزارش'),
});

export const blockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  variableBlockSchema,
  tableBlockSchema,
  signatureBlockSchema,
  signatureRowBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema,
  pageNumberBlockSchema,
  generatedAtBlockSchema,
]);
export type Block = z.infer<typeof blockSchema>;
export type TableBlock = z.infer<typeof tableBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type SignatureBlock = z.infer<typeof signatureBlockSchema>;

export const templateV1Schema = z.object({
  schemaVersion: z.literal(1),
  reportTypeKey: z.string().min(1).max(60),
  titleFa: z.string().min(1).max(200),
  page: pageSchema,
  styles: styleTokensSchema,
  header: z.object({ blocks: z.array(blockSchema).max(30), repeatOnEveryPage: z.boolean() }),
  body: z.array(blockSchema).max(60),
  footer: z.object({ blocks: z.array(blockSchema).max(30), repeatOnEveryPage: z.boolean() }),
});
export type TemplateV1 = z.infer<typeof templateV1Schema>;

/** همه بلوک‌های قالب، به‌صورت تخت — برای شمارش گره و بررسی مسیرها. */
export function allBlocks(template: TemplateV1): Block[] {
  const blocks = [...template.header.blocks, ...template.body, ...template.footer.blocks];
  const out: Block[] = [];
  for (const block of blocks) {
    out.push(block);
    if (block.type === 'signatureRow') out.push(...block.blocks);
  }
  return out;
}

/** متغیرهای `{{path}}` داخل متن یک بلوک متنی. */
export function textPlaceholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/gu)].map((match) => match[1] as string);
}
