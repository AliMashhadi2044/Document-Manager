import { z } from 'zod';

/**
 * schema ورودی فاکتور.
 *
 * مبالغ **رشته عددی** هستند، نه `number` — همان قرارداد مرز API (ADR-0003).
 * اگر اینجا `z.number()` می‌گذاشتیم، مبالغ بالای ۲^۵۳ خاموشانه خراب می‌شدند.
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
  .superRefine((value, ctx) => {
    // حالت مالیات و فیلدهایش باید سازگار باشند — همان قیدی که در دیتابیس هم هست.
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
  });

export const invoicePaymentSchema = z.object({
  paymentMethodId: z.string().uuid(),
  vendorBankAccountId: z.string().uuid().nullable().default(null),
  paymentIdentifier: z.string().trim().max(100).nullable().default(null),
  billIdentifier: z.string().trim().max(100).nullable().default(null),
  pettyCashHolderId: z.string().uuid().nullable().default(null),
  notes: z.string().trim().max(1000).nullable().default(null),
});

export const createInvoiceSchema = z
  .object({
    chapterId: z.string().uuid('فصل را انتخاب کنید'),
    invoiceTypeId: z.string().uuid('نوع فاکتور را انتخاب کنید'),
    vendorId: z.string().uuid().nullable().default(null),
    invoiceNumber: z.string().trim().max(100).nullable().default(null),
    invoiceDate: isoDate,
    taxMode: z.enum(['PERCENT', 'AMOUNT']).default('PERCENT'),
    taxRateBp: z.coerce.number().int().min(0).max(10_000).nullable().default(null),
    taxAmount: moneyString.nullable().default(null),
    notes: z.string().trim().max(2000).nullable().default(null),
    items: z.array(invoiceItemSchema).min(1, 'فاکتور باید حداقل یک ردیف داشته باشد').max(500),
    payment: invoicePaymentSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    const rowNumbers = value.items.map((item) => item.rowNo);
    if (new Set(rowNumbers).size !== rowNumbers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'شماره ردیف‌ها نباید تکراری باشند',
      });
    }
  });

export type CreateInvoiceBody = z.infer<typeof createInvoiceSchema>;
