import { Injectable } from '@nestjs/common';
import { formatJalali, isoDateToJalali } from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * تشخیص پرداخت تکراریِ انشعاب.
 *
 * قاعده: یک **مدرسه** نباید دوبار برای یک **نوع انشعاب** در یک **سال مالی** فاکتور
 * بخورد. سه تصمیم پشت این تعریف:
 *
 *  ۱. **دامنه، سال مالی است و نه «برای همیشه».** قبض برق هر دوره می‌آید؛ قاعدهٔ
 *     «یک‌بار برای همیشه» پرداخت دورهٔ بعد را ناممکن می‌کرد. سال مالی همان دوره‌ای
 *     است که کل سامانه حولش چیده شده.
 *  ۲. **سند باطل‌شده به حساب نمی‌آید.** فاکتوری که سندش رد شده یا نیازمند اصلاح
 *     است، پرداخت محسوب نمی‌شود و نباید جلوی ثبت درست را بگیرد.
 *  ۳. **هشدار، نه دیوار.** تکرار واقعاً ممکن است درست باشد (دورهٔ بعد، کنتور دوم).
 *     پس سرور جلویش را می‌گیرد مگر کاربر **صریحاً** تأیید کند، و همان تأیید در
 *     رد حسابرسی می‌نشیند.
 */

export interface UtilityDuplicate {
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  /** تاریخ صورتحساب، شمسی و آمادهٔ نمایش. */
  readonly invoiceDateJalali: string;
  readonly totalAmount: string;

  readonly documentId: string;
  readonly documentTitle: string;
  readonly documentNumber: string | null;
  readonly documentStatus: string;
  readonly fiscalYear: number;

  readonly schoolTitle: string;
  readonly utilityTypeTitle: string;

  readonly paymentMethodTitle: string | null;
  readonly paymentIdentifier: string | null;
  readonly billIdentifier: string | null;
  readonly ibanSnapshot: string | null;

  readonly createdByName: string | null;
}

/** وضعیت‌هایی که یعنی «این سند پرداخت نیست». */
const VOID_STATUSES = ['NEEDS_REVISION'] as const;

@Injectable()
export class UtilityDuplicateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * آخرین فاکتور انشعاب همین مدرسه و همین نوع انشعاب در همین سال مالی.
   *
   * «آخرین» و نه «اولین»: اگر چند تا باشد، آن‌که به کاربر کمک می‌کند تازه‌ترین است.
   */
  async find(input: {
    readonly schoolId: string;
    readonly utilityTypeId: string;
    readonly fiscalYear: number;
    /** سندِ جاری؛ فاکتورهای خودش هم شمرده می‌شوند، ولی برای ویرایش کنار گذاشتنی است. */
    readonly excludeInvoiceId?: string;
  }): Promise<UtilityDuplicate | null> {
    const detail = await this.prisma.invoiceUtilityDetail.findFirst({
      where: {
        schoolId: input.schoolId,
        utilityTypeId: input.utilityTypeId,
        ...(input.excludeInvoiceId ? { invoiceId: { not: input.excludeInvoiceId } } : {}),
        invoice: {
          document: {
            fiscalYear: input.fiscalYear,
            status: { notIn: [...VOID_STATUSES] },
          },
        },
      },
      orderBy: { invoice: { invoiceDate: 'desc' } },
      include: {
        invoice: {
          include: {
            document: { select: { id: true, title: true, documentNumber: true, status: true, fiscalYear: true } },
            payment: { include: { paymentMethod: { select: { titleFa: true } } } },
            createdBy: { select: { fullName: true } },
          },
        },
      },
    });

    if (!detail) return null;

    const { invoice } = detail;
    const iso = invoice.invoiceDate.toISOString().slice(0, 10);

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDateJalali: formatJalali(isoDateToJalali(iso)),
      totalAmount: invoice.totalAmount.toString(),

      documentId: invoice.document.id,
      documentTitle: invoice.document.title,
      documentNumber: invoice.document.documentNumber,
      documentStatus: invoice.document.status,
      fiscalYear: invoice.document.fiscalYear,

      schoolTitle: detail.schoolTitleSnapshot,
      utilityTypeTitle: detail.utilityTypeTitleSnapshot,

      paymentMethodTitle: invoice.payment?.paymentMethod.titleFa ?? null,
      paymentIdentifier: invoice.payment?.paymentIdentifier ?? null,
      billIdentifier: invoice.payment?.billIdentifier ?? null,
      ibanSnapshot: invoice.payment?.ibanSnapshot ?? null,

      createdByName: invoice.createdBy.fullName,
    };
  }

  /**
   * همان هشدار، به‌صورت یک جملهٔ کامل فارسی.
   *
   * چرا پیام کامل و نه فقط یک کد خطا: این پیام در پاسخ ۴۰۹ می‌نشیند و باید **به‌تنهایی**
   * به کاربر بگوید کجا و کی و چقدر پرداخت شده — حتی اگر رابط، کارت هشدار را هم نشان
   * داده باشد.
   */
  describe(duplicate: UtilityDuplicate): string {
    const parts = [
      `«${duplicate.schoolTitle}» پیش از این برای «${duplicate.utilityTypeTitle}»`,
      `در سند «${duplicate.documentTitle}»`,
      duplicate.documentNumber ? `به شماره ${duplicate.documentNumber}` : 'بدون شماره بایگانی',
      `در تاریخ ${duplicate.invoiceDateJalali}`,
      `به مبلغ ${duplicate.totalAmount} ریال`,
      duplicate.paymentMethodTitle ? `با روش «${duplicate.paymentMethodTitle}»` : null,
      duplicate.billIdentifier ? `شناسهٔ قبض ${duplicate.billIdentifier}` : null,
      duplicate.paymentIdentifier ? `شناسهٔ پرداخت ${duplicate.paymentIdentifier}` : null,
      'پرداخت شده است.',
    ].filter((part): part is string => part !== null);

    return parts.join(' ');
  }
}
