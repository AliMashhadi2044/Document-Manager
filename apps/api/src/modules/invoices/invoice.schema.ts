import { INVOICE_KINDS, MAX_FUEL_ENTRIES, MAX_JALALI_YEAR, MIN_JALALI_YEAR } from '@dm/shared';
import { z } from 'zod';

/**
 * schema ورودی فاکتور.
 *
 * مبالغ **رشته عددی** هستند، نه `number` — همان قرارداد مرز API (ADR-0003).
 * اگر اینجا `z.number()` می‌گذاشتیم، مبالغ بالای ۲^۵۳ خاموشانه خراب می‌شدند.
 *
 * ساختار ردیف‌ها به خانواده فاکتور بستگی دارد، پس `details` یک **اتحاد تفکیک‌شده**
 * روی `kind` است. مرجع نهایی خانواده، نوع فاکتور در دیتابیس است؛ این `kind` فقط
 * می‌گوید کلاینت کدام فرم را پر کرده و سرور ناسازگاری‌اش را رد می‌کند.
 */

const moneyString = z
  .string()
  .regex(/^\d+$/, 'مبلغ باید عدد صحیح ریالی باشد')
  .max(30);

const quantityString = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, 'مقدار حداکثر سه رقم اعشار دارد')
  .max(25);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'قالب تاریخ باید YYYY-MM-DD باشد');

/** حالت مالیات و فیلدهایش باید سازگار باشند — همان قیدی که در دیتابیس هم هست. */
function refineTaxFields(
  value: { taxMode: 'PERCENT' | 'AMOUNT'; taxRateBp: number | null; taxAmount: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.taxMode === 'PERCENT' && value.taxRateBp === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taxRateBp'],
      message: 'در حالت درصدی، نرخ مالیات الزامی است',
    });
  }
  if (value.taxMode === 'AMOUNT') {
    if (value.taxRateBp !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taxRateBp'],
        message: 'در حالت ورود مستقیم مبلغ، نرخ باید خالی باشد',
      });
    }
    if (value.taxAmount === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taxAmount'],
        message: 'مبلغ مالیات الزامی است',
      });
    }
  }
}

export const invoiceItemSchema = z
  .object({
    rowNo: z.coerce.number().int().min(1).max(9999),
    description: z.string().trim().min(1, 'شرح کالا یا خدمت الزامی است').max(1000),
    productCode: z.string().trim().max(100).nullable().default(null),
    quantity: quantityString,
    unitId: z.string().uuid().nullable().default(null),
    unitPrice: moneyString,
    discountAmount: moneyString.default('0'),
    taxMode: z.enum(['PERCENT', 'AMOUNT']),
    taxRateBp: z.coerce.number().int().min(0).max(10_000).nullable().default(null),
    taxAmount: moneyString.nullable().default(null),
  })
  .superRefine(refineTaxFields);

/**
 * فیلدهای روش پرداخت، جدا از خودِ schema.
 *
 * چون در دو جا با **پیام خطای متفاوت** ساخته می‌شود: اینجا به‌تنهایی، و در
 * فاکتور به‌شکل یک فیلد الزامی که نبودنش باید پیام فارسی بدهد و نه
 * «expected object, received undefined».
 */
const invoicePaymentShape = {
  paymentMethodId: z.string({ error: 'روش پرداخت را انتخاب کنید' }).uuid(),
  vendorBankAccountId: z.string().uuid().nullable().default(null),
  paymentIdentifier: z.string().trim().max(100).nullable().default(null),
  billIdentifier: z.string().trim().max(100).nullable().default(null),
  /** نام صاحب حساب قبض؛ رشتهٔ خالی یعنی ثبت‌نشده، نه مقدار خالی. */
  payeeName: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .default(null)
    .transform((value) => (value === null || value === '' ? null : value)),
  pettyCashHolderId: z.string().uuid().nullable().default(null),
  /**
   * سهم هر مقصد در پرداخت ترکیبی.
   *
   * اینجا فقط **شکل** بررسی می‌شود. اینکه این دو با روش پرداخت سازگارند و جمعشان
   * برابر مبلغ فاکتور است، جایی بررسی می‌شود که مبلغ فاکتور محاسبه شده باشد —
   * سرویس فاکتور، و در نهایت قید دیتابیس.
   */
  beneficiaryAmount: moneyString.nullable().default(null),
  pettyCashAmount: moneyString.nullable().default(null),
  notes: z.string().trim().max(1000).nullable().default(null),
};

export const invoicePaymentSchema = z.object(invoicePaymentShape);

/**
 * خانواده `ITEMS` — فاکتور عادی و ستاد: ردیف‌های کالا/خدمت.
 *
 * شاخه‌های اتحاد باید `ZodObject` خام باشند (محدودیت `discriminatedUnion` در Zod v3)،
 * پس بررسی‌های بین‌فیلدی روی خود اتحاد انجام می‌شوند، نه داخل شاخه.
 */
const itemsDetailsSchema = z.object({
  kind: z.enum(['NORMAL', 'STAD']),
  taxMode: z.enum(['PERCENT', 'AMOUNT']).default('PERCENT'),
  taxRateBp: z.coerce.number().int().min(0).max(10_000).nullable().default(null),
  taxAmount: moneyString.nullable().default(null),
  items: z.array(invoiceItemSchema).min(1, 'فاکتور باید حداقل یک ردیف داشته باشد').max(500),
});

/**
 * خانواده `SINGLE_AMOUNT` — انشعابات: یک مبلغ پایه با تخفیف و مالیات اختیاری.
 *
 * `districtId` عمداً اینجا نیست: ناحیه از رکورد مدرسه خوانده می‌شود (ناحیه خودکار).
 */
const utilityDetailsSchema = z.object({
  kind: z.literal('UTILITY'),
  schoolId: z.string().uuid('مدرسه را انتخاب کنید'),
  utilityTypeId: z.string().uuid('نوع انشعاب را انتخاب کنید'),
  baseAmount: moneyString,
  discountAmount: moneyString.default('0'),
  taxMode: z.enum(['PERCENT', 'AMOUNT']).default('PERCENT'),
  taxRateBp: z.coerce.number().int().min(0).max(10_000).nullable().default(null),
  taxAmount: moneyString.nullable().default(null),
});

/**
 * خانواده `DAILY_ENTRIES` — سوخت: ماه شمسی و ردیف‌های روز/مبلغ.
 *
 * مالیات و تخفیف اینجا **وجود ندارند** (تصمیم Q10)، پس در schema هم نیستند؛
 * نبودنشان در ساختار، از صفر گذاشتنشان در کد مطمئن‌تر است.
 */
const fuelDetailsSchema = z.object({
  kind: z.literal('FUEL'),
  vehicleId: z.string().uuid('پلاک خودرو را انتخاب کنید'),
  fuelTypeId: z.string().uuid('نوع سوخت را انتخاب کنید'),
  jalaliYear: z.coerce.number().int().min(MIN_JALALI_YEAR).max(MAX_JALALI_YEAR),
  jalaliMonth: z.coerce.number().int().min(1).max(12),
  entries: z
    .array(
      z.object({
        // اعتبار واقعی روز (۳۱ مهر، ۳۰ اسفند غیرکبیسه) در لایه دامنه بررسی می‌شود؛
        // اینجا فقط بازه نحوی است.
        day: z.coerce.number().int().min(1).max(31),
        amount: moneyString,
      }),
    )
    .min(1, 'حداقل یک ردیف سوخت‌گیری لازم است')
    .max(MAX_FUEL_ENTRIES),
});

export const invoiceDetailsSchema = z
  .discriminatedUnion('kind', [itemsDetailsSchema, utilityDetailsSchema, fuelDetailsSchema])
  .superRefine((value, ctx) => {
    // سوخت مالیات ندارد، پس بررسی مالیات هم ندارد.
    if (value.kind !== 'FUEL') {
      refineTaxFields(value, ctx);
    }

    if (value.kind === 'NORMAL' || value.kind === 'STAD') {
      const rowNumbers = value.items.map((item) => item.rowNo);
      if (new Set(rowNumbers).size !== rowNumbers.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items'],
          message: 'شماره ردیف‌ها نباید تکراری باشند',
        });
      }
    }
  });

export const createInvoiceSchema = z.object({
  chapterId: z.string().uuid('فصل را انتخاب کنید'),
  invoiceTypeId: z.string().uuid('نوع فاکتور را انتخاب کنید'),
  vendorId: z.string().uuid().nullable().default(null),
  invoiceNumber: z.string().trim().max(100).nullable().default(null),
  invoiceDate: isoDate,
  /**
   * شرح فاکتور — یک خط که می‌گوید این فاکتور بابت چیست.
   *
   * جدا از `notes` است: آن یادداشت آزاد است، این یک **عنوان**، و همین است که در
   * گزارش مالیات پیش‌فرضِ ستون «نوع کالا» می‌شود.
   */
  description: z.string().trim().min(1, 'شرح فاکتور الزامی است').max(500),
  /** توضیحات اختصاصی همان فاکتور (§۱۲ پرامپت). */
  notes: z.string().trim().max(2000).nullable().default(null),
  details: invoiceDetailsSchema,
  /**
   * روش پرداخت — **الزامی**.
   *
   * پیش از این اختیاری بود و فرم حتی گزینهٔ صریحِ «ثبت نشود» داشت. نتیجه،
   * فاکتورهایی بود که نمی‌شد گفت پولشان به کجا رفت: در فرم ریزهزینه خانهٔ
   * «پرداخت به» خالی می‌ماند و از گزارش شبای ذی‌نفعان بیرون می‌افتادند. ثبت
   * نهایی سند از قبل جلویشان را می‌گرفت، ولی آن‌قدر دیر که کاربر باید به هر
   * فاکتور برمی‌گشت.
   *
   * پس همان‌جا که فاکتور نوشته می‌شود الزامی است؛ «ثبت نشده» دیگر یک حالت
   * نیست. فاکتورهای قدیمی‌ترِ بدون روش پرداخت دست‌نخورده می‌مانند و همان گیرِ
   * ثبت نهایی سرِ جایش است، پس اصلاحشان لازم است و ممکن.
   */
  payment: z.object(invoicePaymentShape, { error: 'روش پرداخت فاکتور الزامی است' }),
  /**
   * تأیید صریح کاربر که این فاکتور با وجود تکراری بودن ثبت شود.
   *
   * پیش‌فرض `false` است و باید **صریح** بیاید: تکرار پرداخت انشعاب یک اشتباه گران
   * است و نباید با یک درخواست معمولی رد شود. خود تأیید هم در رد حسابرسی می‌نشیند.
   */
  acknowledgeDuplicate: z.boolean().default(false),
});

export type CreateInvoiceBody = z.infer<typeof createInvoiceSchema>;
export type InvoiceDetailsBody = z.infer<typeof invoiceDetailsSchema>;

/** نگهبان: هر خانواده‌ای در enum باید در این اتحاد پوشش داده شده باشد. */
export const SCHEMA_COVERED_KINDS = INVOICE_KINDS;
