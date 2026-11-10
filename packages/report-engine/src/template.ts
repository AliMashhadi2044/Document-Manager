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
  /*
    `headingFontSizePt` اینجا بود و **هیچ رندری نمی‌خواندش**.

    دلیلش ساده است: این موتور بلوکی به نام «عنوان» ندارد. عنوان گزارش یک بلوک
    متنی در سربرگ است و اندازهٔ قلمِ خودش را دارد (`fontSizePt` همان بلوک). پس
    این توکن یک کنترل در طراح بود که هر عددی می‌گرفت و هیچ اثری نداشت — بدتر از
    نبودنش. قالب‌های ذخیره‌شده‌ای که هنوز این کلید را دارند مشکلی ندارند: zod
    کلید ناشناخته را کنار می‌گذارد.
  */
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
        /**
         * عنوان این خط در سرستون — فقط وقتی ستون `titleParts` دارد.
         *
         * سرستونِ «شماره صورت حساب — تاریخ صورت حساب» دو تکه است و هر تکه به یک
         * خطِ سلول اشاره می‌کند. بدون این، سرستون یک رشتهٔ یکپارچه بود و موتور
         * نمی‌توانست بفهمد کدام نیمه‌اش به کدام داده مربوط است.
         */
        titleFa: z.string().max(120).optional(),
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
  /**
   * این ستون **روی کاغذ نمی‌آید** — فقط روی صفحه.
   *
   * فرم‌های ریزهزینه شکلِ قانونیِ ثابتی دارند و ستون تازه در آن‌ها جا ندارد؛ ولی
   * کسی که فرم را روی صفحه بررسی می‌کند به تاریخ صورت‌حساب نیاز دارد تا بفهمد
   * هر ردیف کدام فاکتور است. دو نیاز متفاوت از یک داده، و تنها فرقشان این است
   * که یکی چاپ می‌شود و دیگری نه.
   *
   * جداسازی در **چیدمان** انجام می‌شود و نه در خروجی‌گیرها: ستون پیش از ساخته
   * شدن حذف می‌شود، پس پهنای ردیف جمع، ادغام خانه‌ها و ردیف‌های پرکننده همه با
   * همان کدِ موجود و برای همان ستون‌هایی حساب می‌شوند که واقعاً چاپ می‌شوند.
   * جمعِ عرض ستون‌ها هم همین را می‌گوید: ستونی که چاپ نمی‌شود، عرضِ کاغذ را
   * نمی‌خورد.
   *
   * «چاپ» شامل خروجی HTML و PDF است. خروجی Excel یک فایل کار است و نه فرم، پس
   * ستون را دارد.
   */
  screenOnly: z.boolean().default(false),
  /**
   * ستونی که در این گزارش **همه‌جا صفر است**، در گزارش نیاید.
   *
   * فرم ریزهزینه برای هر فصلِ بودجه یک ستون دارد و فصل‌ها داده مرجع‌اند؛ سازمانی
   * که ده فصل تعریف کرده، روی هر فرم ده ستون می‌گیرد — حتی اگر آن سند فقط در دو
   * فصل خرج داشته باشد. هشت ستونِ صفر، عرضِ کاغذ را می‌خورند و خواندنِ همان دو
   * ستونی را که داده دارند سخت می‌کنند.
   *
   * تصمیم **به ازای هر اجرا** گرفته می‌شود و نه در قالب: کدام فصل صفر است، به
   * دادهٔ همان سند بند است. پس این نشان فقط می‌گوید «اجازه داری حذفش کنی»، و
   * خودِ حذف در چیدمان و پس از محاسبهٔ ردیف‌ها انجام می‌شود.
   *
   * «صفر» یعنی سلولی که نه عددِ ناصفر دارد و نه متن: `null`، `0` و رشتهٔ خالی.
   * ردیف‌های پرکننده شمرده نمی‌شوند — خالی بودنشان دربارهٔ ستون چیزی نمی‌گوید.
   */
  dropWhenAllZero: z.boolean().default(false),
  /**
   * سرستون از همان تکه‌هایی ساخته شود که در این گزارش **واقعاً داده دارند**.
   *
   * سرستون «شماره صورت حساب — تاریخ صورت حساب» وقتی درست است که هر دو در جدول
   * باشند. ولی فروشنده‌ای که چند فاکتور دارد شمارهٔ صورت‌حساب نمی‌گیرد (قاعدهٔ
   * تجمیع)، و گزارشی که هیچ ردیفش شماره ندارد، سرستونی می‌گرفت که به ستونی
   * اشاره می‌کرد که در کل جدول خالی است — یعنی خواننده دنبال عددی می‌گشت که
   * هیچ‌جا نیست.
   *
   * پس تکه‌ای که در **هیچ ردیفی** مقدار ندارد از سرستون می‌افتد. اگر در یک ردیف
   * هم آمده باشد، می‌ماند: سرستون دربارهٔ ستون است و نه دربارهٔ یک ردیف.
   *
   * وقتی هیچ تکه‌ای داده ندارد، `titleFa` ثابتِ ستون می‌ماند — سرستونِ خالی،
   * جدول را بدتر می‌کند. در ستون تکرارشونده معنا ندارد و نادیده گرفته می‌شود:
   * سرستونِ آن از خودِ مجموعه می‌آید.
   */
  titleParts: z
    .object({
      /** عنوان تکهٔ اول، یعنی خط اولِ سلول (`value` خود ستون). */
      mainTitleFa: z.string().min(1).max(120),
      separator: z.string().max(10).default(' — '),
    })
    .optional(),
  /**
   * سلول‌هایی که این شرط برایشان درست است، **پس‌زمینهٔ خاکستری** می‌گیرند.
   *
   * چرا در قالب و با یک شرطِ عمومی، و نه یک قاعدهٔ «مبلغ بزرگ» در موتور: آستانه و
   * اینکه کدام ستون علامت بخورد، یک **تصمیم گزارش** است. گزارش مالیات مبلغ کل را
   * بالاتر از آستانهٔ تنظیمات خاکستری می‌کند؛ موتور فقط شرط را می‌سنجد.
   *
   * رنگ، **فقط پس‌زمینه** است و رنگ متن دست نمی‌خورد: علامتِ خوانا و نه متنِ
   * کم‌کنتراست. شرط در دامنهٔ همان سلول سنجیده می‌شود، پس به `row.*` و در ستون
   * تکرارشونده به `column.*` دسترسی دارد.
   */
  shadeWhen: conditionSchema.optional(),
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
