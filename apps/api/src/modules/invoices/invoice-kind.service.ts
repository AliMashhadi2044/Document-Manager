import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  FinancialError,
  INVOICE_KIND_REGISTRY,
  formatJalali,
  invoiceKindLineModel,
  resolveFuelEntries,
  type InvoiceKind,
  type InvoiceLineModel,
  type Money,
  type TaxMode,
} from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { ItemInput } from '../financial/financial.service';
import type { InvoiceDetailsBody } from './invoice.schema';

/**
 * ترجمه «جزئیات خانواده فاکتور» به ردیف‌های مالی یکسان.
 *
 * نکته مرکزی فاز ۴: هر سه خانواده در نهایت به **همان** `invoice_items` و همان
 * محاسبه‌گر می‌رسند. انشعابات یک ردیف می‌سازد، سوخت به‌ازای هر روز یک ردیف، و فاکتور
 * عادی ردیف‌های کاربر را می‌برد. پس مالیات انشعابات با فاکتور عادی **لزوماً** یکی
 * است (معیار پذیرش ۵)، نه اینکه اتفاقی یکی باشد.
 *
 * انتخاب مسیر با `lineModel` از رجیستری مشترک انجام می‌شود — هیچ‌جا شرطی روی عنوان
 * فصل یا کلید نوع فاکتور نیست (معیار پذیرش ۱).
 */

export interface PreparedInvoice {
  readonly items: readonly ItemInput[];
  readonly invoiceTax: {
    readonly mode: TaxMode;
    readonly rateBp: number | null;
    readonly amount: string | null;
  };
  /**
   * نوشتن ردیف جزئیات اختصاصی، **پس از** ساخت فاکتور و ردیف‌هایش.
   * چون ردیف تاریخ سوخت به شناسه ردیف مالی گره می‌خورد، این مرحله به شناسه‌ها نیاز دارد.
   */
  readonly writeDetails: (
    tx: Prisma.TransactionClient,
    invoice: { readonly id: string; readonly items: ReadonlyArray<{ id: string; rowNo: number }> },
  ) => Promise<void>;
}

/** هیچ جزئیات اختصاصی‌ای برای نوشتن نیست (فاکتور عادی و ستاد). */
const noDetails: PreparedInvoice['writeDetails'] = async () => {
  /* خالی به‌عمد */
};

@Injectable()
export class InvoiceKindService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * آماده‌سازی ردیف‌ها بر اساس خانواده‌ای که **دیتابیس** برای نوع فاکتور اعلام کرده.
   *
   * اگر فرم پرشده کلاینت با آن خانواده نخواند، درخواست رد می‌شود؛ کلاینت تعیین‌کننده
   * خانواده نیست، فقط گزارش‌دهنده آن است.
   */
  async prepare(kind: InvoiceKind, details: InvoiceDetailsBody): Promise<PreparedInvoice> {
    if (details.kind !== kind) {
      throw AppError.validation(
        `نوع فاکتور انتخاب‌شده «${INVOICE_KIND_REGISTRY[kind].titleFa}» است؛ اطلاعات ارسالی با آن نمی‌خواند`,
        [{ path: 'details.kind', message: 'فرم ارسالی با نوع فاکتور سازگار نیست' }],
      );
    }

    const lineModel: InvoiceLineModel = invoiceKindLineModel(kind);

    switch (lineModel) {
      case 'ITEMS':
        return this.prepareItems(details);
      case 'SINGLE_AMOUNT':
        return this.prepareUtility(details);
      case 'DAILY_ENTRIES':
        return this.prepareFuel(details);
      default:
        // خانواده‌ای به رجیستری اضافه شده و اینجا دست نخورده — خطای برنامه‌نویسی است،
        // نه خطای کاربر. اجازه نمی‌دهیم خاموش رد شود.
        return assertUnreachable(lineModel);
    }
  }

  private prepareItems(details: InvoiceDetailsBody): PreparedInvoice {
    if (details.kind === 'UTILITY' || details.kind === 'FUEL') {
      throw AppError.validation('اطلاعات ارسالی با نوع فاکتور سازگار نیست', [
        { path: 'details.kind', message: 'فرم ارسالی با نوع فاکتور سازگار نیست' },
      ]);
    }

    return {
      items: details.items,
      invoiceTax: {
        mode: details.taxMode,
        rateBp: details.taxRateBp,
        amount: details.taxAmount,
      },
      writeDetails: noDetails,
    };
  }

  private async prepareUtility(details: InvoiceDetailsBody): Promise<PreparedInvoice> {
    if (details.kind !== 'UTILITY') {
      throw AppError.validation('اطلاعات فاکتور انشعابات ارسال نشده است', [
        { path: 'details', message: 'اطلاعات انشعابات الزامی است' },
      ]);
    }

    // ناحیه از مدرسه خوانده می‌شود، نه از ورودی — «ناحیه خودکار» یک قاعده سرور است.
    const school = await this.prisma.school.findUnique({
      where: { id: details.schoolId },
      include: { district: true },
    });
    if (!school || !school.isActive) {
      throw AppError.validation('مدرسه انتخاب‌شده معتبر یا فعال نیست', [
        { path: 'details.schoolId', message: 'مدرسه معتبر نیست' },
      ]);
    }
    if (!school.district.isActive) {
      throw AppError.validation('ناحیه این مدرسه غیرفعال است', [
        { path: 'details.schoolId', message: 'ناحیه مدرسه غیرفعال است' },
      ]);
    }

    const utilityType = await this.prisma.utilityType.findUnique({
      where: { id: details.utilityTypeId },
    });
    if (!utilityType || !utilityType.isActive) {
      throw AppError.validation('نوع انشعاب انتخاب‌شده معتبر یا فعال نیست', [
        { path: 'details.utilityTypeId', message: 'نوع انشعاب معتبر نیست' },
      ]);
    }

    const item: ItemInput = {
      rowNo: 1,
      // شرح از همان داده‌هایی ساخته می‌شود که snapshot شده‌اند، تا با جزئیات نخواند.
      description: `${utilityType.title} — ${school.title}`,
      productCode: null,
      quantity: '1',
      unitId: null,
      unitPrice: details.baseAmount,
      discountAmount: details.discountAmount,
      taxMode: details.taxMode,
      taxRateBp: details.taxRateBp,
      taxAmount: details.taxAmount,
    };

    return {
      items: [item],
      invoiceTax: {
        mode: details.taxMode,
        rateBp: details.taxRateBp,
        amount: details.taxAmount,
      },
      writeDetails: async (tx, invoice) => {
        await tx.invoiceUtilityDetail.create({
          data: {
            invoiceId: invoice.id,
            invoiceKind: 'UTILITY',
            schoolId: school.id,
            schoolTitleSnapshot: school.title,
            districtId: school.districtId,
            districtTitleSnapshot: school.district.title,
            utilityTypeId: utilityType.id,
            utilityTypeTitleSnapshot: utilityType.title,
          },
        });
      },
    };
  }

  private async prepareFuel(details: InvoiceDetailsBody): Promise<PreparedInvoice> {
    if (details.kind !== 'FUEL') {
      throw AppError.validation('اطلاعات فاکتور سوخت ارسال نشده است', [
        { path: 'details', message: 'اطلاعات سوخت الزامی است' },
      ]);
    }

    // نوع خودرو از خود خودرو مشتق می‌شود؛ کلاینت فقط پلاک را انتخاب می‌کند.
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: details.vehicleId },
      include: { vehicleType: true },
    });
    if (!vehicle || !vehicle.isActive) {
      throw AppError.validation('خودرو انتخاب‌شده معتبر یا فعال نیست', [
        { path: 'details.vehicleId', message: 'خودرو معتبر نیست' },
      ]);
    }
    if (!vehicle.vehicleType.isActive) {
      throw AppError.validation('نوع این خودرو غیرفعال است', [
        { path: 'details.vehicleId', message: 'نوع خودرو غیرفعال است' },
      ]);
    }

    const fuelType = await this.prisma.fuelType.findUnique({ where: { id: details.fuelTypeId } });
    if (!fuelType || !fuelType.isActive) {
      throw AppError.validation('نوع سوخت انتخاب‌شده معتبر یا فعال نیست', [
        { path: 'details.fuelTypeId', message: 'نوع سوخت معتبر نیست' },
      ]);
    }

    // اعتبارسنجی روزها و ساختن تاریخ کامل — سرور، نه کلاینت.
    let resolved;
    try {
      resolved = resolveFuelEntries(
        details.jalaliYear,
        details.jalaliMonth,
        details.entries.map((entry) => ({
          day: entry.day,
          amount: BigInt(entry.amount) as Money,
        })),
      );
    } catch (error) {
      if (error instanceof FinancialError) {
        throw AppError.validation(error.message, [
          { path: `details.${error.path ?? 'entries'}`, message: error.message },
        ]);
      }
      throw error;
    }

    const items: ItemInput[] = resolved.map((entry, index) => ({
      rowNo: index + 1,
      description: `سوخت‌گیری ${formatJalali(
        { year: details.jalaliYear, month: details.jalaliMonth, day: entry.day },
        { persianDigits: false },
      )}`,
      productCode: null,
      quantity: '1',
      unitId: null,
      unitPrice: entry.amount.toString(),
      discountAmount: '0',
      // تصمیم Q10: سوخت مالیات ندارد. حالت «مبلغ» با مقدار صفر، صریح‌ترین بیان آن است.
      taxMode: 'AMOUNT',
      taxRateBp: null,
      taxAmount: '0',
    }));

    return {
      items,
      invoiceTax: { mode: 'AMOUNT', rateBp: null, amount: '0' },
      writeDetails: async (tx, invoice) => {
        await tx.invoiceFuelDetail.create({
          data: {
            invoiceId: invoice.id,
            invoiceKind: 'FUEL',
            vehicleId: vehicle.id,
            plateNumberSnapshot: vehicle.plateNumber,
            vehicleTypeId: vehicle.vehicleTypeId,
            vehicleTypeTitleSnapshot: vehicle.vehicleType.title,
            fuelTypeId: fuelType.id,
            fuelTypeTitleSnapshot: fuelType.title,
            jalaliYear: details.jalaliYear,
            jalaliMonth: details.jalaliMonth,
          },
        });

        const byRowNo = new Map(invoice.items.map((item) => [item.rowNo, item.id]));

        await tx.invoiceFuelEntry.createMany({
          data: resolved.map((entry, index) => {
            const itemId = byRowNo.get(index + 1);
            if (!itemId) {
              // نشانه ناسازگاری درون همین تراکنش؛ تراکنش باید برگردد، نه اینکه ردیف
              // تاریخ بی‌صاحب بماند.
              throw new Error(`ردیف مالی متناظر ردیف سوخت ${index + 1} ساخته نشده است`);
            }
            return {
              invoiceId: invoice.id,
              invoiceItemId: itemId,
              jalaliDay: entry.day,
              entryDate: new Date(`${entry.entryDate}T00:00:00.000Z`),
            };
          }),
        });
      },
    };
  }
}

function assertUnreachable(value: never): never {
  throw new Error(`خانواده فاکتور پشتیبانی‌نشده: ${String(value)}`);
}
