import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_ROUNDING_POLICY,
  FinancialError,
  ROUNDING_MODES,
  ROUNDING_SCOPES,
  calculateInvoice,
  qtyFromString,
  sumLines,
  type LineInput,
  type Money,
  type Qty,
  type RoundingPolicy,
  type TaxMode,
} from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError, type ErrorDetail } from '../../common/errors/app-error';

/**
 * پل بین لایه محاسبات مشترک و دیتابیس.
 *
 * هیچ فرمولی اینجا نوشته نمی‌شود — همه از `@dm/shared` می‌آیند، چون همان کد در
 * مرورگر هم اجرا می‌شود و دو پیاده‌سازی یعنی دو نتیجه (ریسک R1).
 */

export interface ItemInput {
  readonly rowNo: number;
  readonly description: string;
  readonly productCode: string | null;
  readonly quantity: string;
  readonly unitId: string | null;
  readonly unitPrice: string;
  readonly discountAmount: string;
  readonly taxMode: TaxMode;
  readonly taxRateBp: number | null;
  readonly taxAmount: string | null;
}

export interface ComputedItem {
  readonly rowNo: number;
  readonly description: string;
  readonly productCode: string | null;
  readonly quantity: Prisma.Decimal;
  readonly unitId: string | null;
  readonly unitPrice: bigint;
  readonly grossAmount: bigint;
  readonly discountAmount: bigint;
  readonly netAmount: bigint;
  readonly taxMode: TaxMode;
  readonly taxRateBp: number | null;
  readonly taxAmount: bigint;
  readonly totalAmount: bigint;
}

export interface ComputedInvoice {
  readonly items: readonly ComputedItem[];
  readonly grossAmount: bigint;
  readonly discountAmount: bigint;
  readonly netAmount: bigint;
  readonly taxAmount: bigint;
  readonly totalAmount: bigint;
}

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  /** سیاست پیش‌فرض سازمان — سند در لحظه ایجاد از این snapshot می‌گیرد. */
  async organizationRoundingPolicy(): Promise<RoundingPolicy> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'rounding_policy' },
    });
    return parseRoundingPolicy(setting?.value);
  }

  /** نرخ مالیات پیش‌فرض یک سال مالی. نبودش یعنی حالت درصدی در دسترس نیست. */
  async defaultTaxRateBp(fiscalYear: number, invoiceTypeId?: string): Promise<number | null> {
    if (invoiceTypeId) {
      const specific = await this.prisma.taxRate.findFirst({
        where: { fiscalYear, invoiceTypeId },
      });
      if (specific) return specific.rateBp;
    }
    const fallback = await this.prisma.taxRate.findFirst({
      where: { fiscalYear, invoiceTypeId: null },
    });
    return fallback?.rateBp ?? null;
  }

  /**
   * محاسبه فاکتور چندردیفی از ورودی خام.
   *
   * خطاهای اعتبارسنجی **همه با هم** برمی‌گردند، نه اولین خطا، تا کاربر یک‌بار همه
   * مشکلات را ببیند (docs/07-document-workflow.md §۴).
   */
  computeInvoice(
    items: readonly ItemInput[],
    policy: RoundingPolicy,
    invoiceTax: { mode: TaxMode; rateBp: number | null; amount: string | null },
  ): ComputedInvoice {
    if (items.length === 0) {
      throw AppError.validation('فاکتور باید حداقل یک ردیف داشته باشد', [
        { path: 'items', message: 'حداقل یک ردیف لازم است' },
      ]);
    }

    const details: ErrorDetail[] = [];
    const lineInputs: LineInput[] = [];

    items.forEach((item, index) => {
      try {
        lineInputs.push({
          quantity: qtyFromString(item.quantity) as Qty,
          unitPrice: BigInt(item.unitPrice) as Money,
          discount: BigInt(item.discountAmount) as Money,
          taxMode: item.taxMode,
          taxRateBp: item.taxRateBp,
          taxAmount: item.taxAmount === null ? null : (BigInt(item.taxAmount) as Money),
        });
      } catch (error) {
        details.push({
          path: `items.${index}`,
          message: error instanceof Error ? error.message : 'مقدار نامعتبر',
        });
      }
    });

    if (details.length > 0) {
      throw AppError.validation('اطلاعات ردیف‌ها معتبر نیست', details);
    }

    let result;
    try {
      result = calculateInvoice(lineInputs, policy, {
        mode: invoiceTax.mode,
        rateBp: invoiceTax.rateBp,
        amount: invoiceTax.amount === null ? null : (BigInt(invoiceTax.amount) as Money),
      });
    } catch (error) {
      if (error instanceof FinancialError) {
        throw AppError.validation(error.message, [
          { path: error.path ?? 'items', message: error.message },
        ]);
      }
      throw error;
    }

    const computed: ComputedItem[] = result.lines.map((line, index) => {
      const source = items[index] as ItemInput;
      return {
        rowNo: source.rowNo,
        description: source.description,
        productCode: source.productCode,
        quantity: new Prisma.Decimal(source.quantity),
        unitId: source.unitId,
        unitPrice: BigInt(source.unitPrice),
        grossAmount: line.gross,
        discountAmount: line.discount,
        netAmount: line.net,
        taxMode: source.taxMode,
        // در حالت تخصیص سطح فاکتور، نرخ ردیف معنا ندارد و باید خالی بماند
        // وگرنه قید `invoice_items_tax_mode_ck` نقض می‌شود.
        taxRateBp: source.taxMode === 'PERCENT' ? source.taxRateBp : null,
        taxAmount: line.tax,
        totalAmount: line.total,
      };
    });

    return {
      items: computed,
      grossAmount: result.totals.gross,
      discountAmount: result.totals.discount,
      netAmount: result.totals.net,
      taxAmount: result.totals.tax,
      totalAmount: result.totals.total,
    };
  }

  /**
   * بازمحاسبه و **تطبیق** مبالغ ذخیره‌شده یک سند.
   *
   * اختلاف، خطا است نه چیزی که بی‌صدا تصحیح شود: اگر جمع ذخیره‌شده با بازمحاسبه
   * نخواند، یعنی جایی اشکال دارد و ثبت نهایی باید متوقف شود.
   */
  async verifyDocumentTotals(documentId: string): Promise<ErrorDetail[]> {
    const document = await this.prisma.financialDocument.findUnique({
      where: { id: documentId },
      include: { invoices: { include: { items: { orderBy: { rowNo: 'asc' } } } } },
    });

    if (!document) throw AppError.notFound('سند یافت نشد');

    const policy = parseRoundingPolicy(document.roundingPolicy);
    const problems: ErrorDetail[] = [];

    for (const invoice of document.invoices) {
      if (invoice.items.length === 0) continue;

      const recomputed = this.computeInvoice(
        invoice.items.map((item) => ({
          rowNo: item.rowNo,
          description: item.description,
          productCode: item.productCode,
          quantity: item.quantity.toFixed(3),
          unitId: item.unitId,
          unitPrice: item.unitPrice.toString(),
          discountAmount: item.discountAmount.toString(),
          taxMode: item.taxMode,
          taxRateBp: item.taxRateBp,
          taxAmount: item.taxMode === 'AMOUNT' ? item.taxAmount.toString() : null,
        })),
        policy,
        {
          mode: invoice.taxMode,
          rateBp: invoice.taxRateBp,
          amount: invoice.taxMode === 'AMOUNT' ? invoice.taxAmount.toString() : null,
        },
      );

      compare(problems, `invoices.${invoice.id}.grossAmount`, invoice.grossAmount, recomputed.grossAmount);
      compare(problems, `invoices.${invoice.id}.netAmount`, invoice.netAmount, recomputed.netAmount);
      compare(problems, `invoices.${invoice.id}.taxAmount`, invoice.taxAmount, recomputed.taxAmount);
      compare(problems, `invoices.${invoice.id}.totalAmount`, invoice.totalAmount, recomputed.totalAmount);
    }

    // جمع سند = مجموع فاکتورها
    const documentTotals = sumLines(
      document.invoices.map((invoice) => ({
        gross: invoice.grossAmount as Money,
        discount: invoice.discountAmount as Money,
        net: invoice.netAmount as Money,
        tax: invoice.taxAmount as Money,
        total: invoice.totalAmount as Money,
      })),
    );

    compare(problems, 'document.totalGross', document.totalGross, documentTotals.gross);
    compare(problems, 'document.totalNet', document.totalNet, documentTotals.net);
    compare(problems, 'document.totalTax', document.totalTax, documentTotals.tax);
    compare(problems, 'document.totalAmount', document.totalAmount, documentTotals.total);

    return problems;
  }

  /** به‌روزرسانی جمع‌های سند از روی فاکتورهایش، داخل همان تراکنش. */
  async refreshDocumentTotals(tx: Prisma.TransactionClient, documentId: string): Promise<void> {
    const invoices = await tx.invoice.findMany({
      where: { documentId },
      select: {
        grossAmount: true,
        discountAmount: true,
        netAmount: true,
        taxAmount: true,
        totalAmount: true,
      },
    });

    const totals = sumLines(
      invoices.map((invoice) => ({
        gross: invoice.grossAmount as Money,
        discount: invoice.discountAmount as Money,
        net: invoice.netAmount as Money,
        tax: invoice.taxAmount as Money,
        total: invoice.totalAmount as Money,
      })),
    );

    await tx.financialDocument.update({
      where: { id: documentId },
      data: {
        totalGross: totals.gross,
        totalDiscount: totals.discount,
        totalNet: totals.net,
        totalTax: totals.tax,
        totalAmount: totals.total,
      },
    });
  }
}

function compare(
  problems: ErrorDetail[],
  path: string,
  stored: bigint,
  recomputed: bigint,
): void {
  if (stored !== recomputed) {
    problems.push({
      path,
      message: 'مبلغ ذخیره‌شده با بازمحاسبه نمی‌خواند',
      expected: recomputed.toString(),
      actual: stored.toString(),
    });
  }
}

/** خواندن امن سیاست گرد کردن از JSON؛ مقدار نامعتبر به پیش‌فرض برمی‌گردد. */
export function parseRoundingPolicy(value: unknown): RoundingPolicy {
  if (value === null || typeof value !== 'object') return DEFAULT_ROUNDING_POLICY;

  const source = value as Record<string, unknown>;
  const scope = source['scope'];
  const mode = source['mode'];

  const validScope = ROUNDING_SCOPES.includes(scope as never) ? (scope as RoundingPolicy['scope']) : null;
  const validMode = ROUNDING_MODES.includes(mode as never) ? (mode as RoundingPolicy['mode']) : null;

  if (!validScope || !validMode) return DEFAULT_ROUNDING_POLICY;
  return { scope: validScope, mode: validMode };
}
