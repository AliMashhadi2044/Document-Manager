import { Injectable } from '@nestjs/common';
import { Prisma, type Invoice } from '@prisma/client';
import { isEditableStatus, validateIban, type DocumentStatus } from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { FinancialService, parseRoundingPolicy } from '../financial/financial.service';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { InvoiceKindService } from './invoice-kind.service';
import { UtilityDuplicateService } from './utility-duplicate.service';
import type { InvoiceDetailsBody } from './invoice.schema';

export interface CreateInvoiceInput {
  readonly chapterId: string;
  readonly invoiceTypeId: string;
  readonly vendorId: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string;
  /** شرح فاکتور — عنوانی یک‌خطی؛ پیش‌فرضِ «نوع کالا» در گزارش مالیات. */
  readonly description: string | null;
  readonly notes: string | null;
  /** ساختار ردیف‌ها، وابسته به خانواده فاکتور (فاز ۴). */
  readonly details: InvoiceDetailsBody;
  readonly payment: {
    readonly paymentMethodId: string;
    readonly vendorBankAccountId: string | null;
    readonly paymentIdentifier: string | null;
    readonly billIdentifier: string | null;
    readonly pettyCashHolderId: string | null;
    readonly notes: string | null;
  } | null;
  /** تأیید صریح ثبت با وجود هشدار تکرار (فقط انشعابات). */
  readonly acknowledgeDuplicate?: boolean;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly financial: FinancialService,
    private readonly kinds: InvoiceKindService,
    private readonly duplicates: UtilityDuplicateService,
  ) {}

  async create(
    documentId: string,
    input: CreateInvoiceInput,
    user: AuthenticatedUser,
  ): Promise<Invoice> {
    const document = await this.prisma.financialDocument.findFirst({
      // سندِ در سطل زباله فاکتور نمی‌گیرد؛ «یافت نشد» هم همان چیزی است که کاربر
      // باید بشنود، چون آن سند دیگر در فهرستش نیست.
      where: { id: documentId, deletedAt: null },
      include: { buyerSnapshot: true },
    });
    if (!document) throw AppError.notFound('سند یافت نشد');

    /** اگر کاربر تکرار را تأیید کرده، همان متن هشدار در رد حسابرسی می‌نشیند. */
    let duplicateNotice: string | null = null;

    if (!isEditableStatus(document.status as DocumentStatus)) {
      throw AppError.conflict(
        'DOCUMENT_NOT_EDITABLE',
        'سند در وضعیت فعلی قابل ویرایش نیست. برای اصلاح، آن را بازگشایی کنید.',
      );
    }

    // اتصال فصل و نوع فاکتور باید در اطلاعات پایه تعریف شده باشد. UI هم همین را
    // نشان می‌دهد، ولی مرجع سرور است.
    const link = await this.prisma.chapterInvoiceType.findUnique({
      where: {
        chapterId_invoiceTypeId: {
          chapterId: input.chapterId,
          invoiceTypeId: input.invoiceTypeId,
        },
      },
      include: { chapter: true, invoiceType: true },
    });

    if (!link) {
      throw AppError.validation('این نوع فاکتور برای فصل انتخاب‌شده مجاز نیست', [
        { path: 'invoiceTypeId', message: 'نوع فاکتور با فصل سازگار نیست' },
      ]);
    }
    if (!link.chapter.isActive || !link.invoiceType.isActive) {
      throw AppError.validation('فصل یا نوع فاکتور انتخاب‌شده غیرفعال است', [
        { path: 'chapterId', message: 'فصل یا نوع فاکتور غیرفعال است' },
      ]);
    }

    /*
      یک سند، یک گروه بودجه.

      سند مالی در دفتر اعتبار یک گروه (جاری یا عمرانی) می‌نشیند؛ سندی که هم‌زمان
      ردیف جاری و ردیف عمرانی داشته باشد، در هیچ‌کدام کامل نیست. رابط هم گروه مخالف
      را خاموش می‌کند، ولی قاعده همین‌جاست.

      پیام، فاکتوری را که گروه سند را تعیین کرده نام می‌برد — وگرنه کاربر می‌ماند که
      چرا سندی که خودش تازه ساخته «عمرانی» است.
    */
    const otherGroup = await this.prisma.invoice.findFirst({
      where: { documentId, chapter: { categoryId: { not: link.chapter.categoryId } } },
      orderBy: { sortIndex: 'asc' },
      include: { chapter: { include: { category: true } } },
    });

    if (otherGroup) {
      const current = await this.prisma.budgetCategory.findUnique({
        where: { id: link.chapter.categoryId },
      });
      throw AppError.conflict(
        'DOCUMENT_BUDGET_GROUP',
        `گروه بودجه این سند «${otherGroup.chapter.category.titleFa}» است؛ ` +
          `فاکتور «${otherGroup.chapterTitleSnapshot}» پیش از این در همین سند ثبت شده است. ` +
          `در یک سند نمی‌توان فاکتور «${current?.titleFa ?? 'گروه دیگر'}» ثبت کرد — ` +
          `برای آن سند جداگانه‌ای بسازید.`,
      );
    }

    /*
      پرداخت تکراری انشعاب.

      پیش از ساخت بررسی می‌شود و نه بعد از آن: فاکتور نیمه‌ساخته‌ای که بعداً حذف شود،
      شمارهٔ ردیف و رد حسابرسی را بی‌دلیل شلوغ می‌کند. رابط هم همین را از قبل نشان
      می‌دهد، ولی مرجع همین‌جاست — درخواست می‌تواند از هر جایی بیاید.
    */
    if (input.details.kind === 'UTILITY') {
      const duplicate = await this.duplicates.find({
        schoolId: input.details.schoolId,
        utilityTypeId: input.details.utilityTypeId,
        fiscalYear: document.fiscalYear,
      });

      if (duplicate && !input.acknowledgeDuplicate) {
        throw AppError.conflict('UTILITY_DUPLICATE', this.duplicates.describe(duplicate));
      }
      if (duplicate) {
        duplicateNotice = this.duplicates.describe(duplicate);
      }
    }

    // خانواده فاکتور را **دیتابیس** تعیین می‌کند؛ از آن، ردیف‌های مالی ساخته می‌شوند.
    const prepared = await this.kinds.prepare(link.invoiceType.kind, input.details);

    const policy = parseRoundingPolicy(document.roundingPolicy);
    const computed = this.financial.computeInvoice(prepared.items, policy, prepared.invoiceTax);

    const vendor = input.vendorId
      ? await this.prisma.vendor.findUnique({ where: { id: input.vendorId } })
      : null;
    if (input.vendorId && !vendor) {
      throw AppError.validation('فروشنده انتخاب‌شده یافت نشد', [
        { path: 'vendorId', message: 'فروشنده یافت نشد' },
      ]);
    }

    const paymentData = await this.resolvePayment(input, vendor?.id ?? null);

    try {
      const invoice = await this.prisma.$transaction(async (tx) => {
        // snapshot فروشنده: ردیف اختصاصی همین فاکتور، تغییرناپذیر (ADR-0005).
        const vendorSnapshotId = vendor
          ? (
              await tx.vendorSnapshot.create({
                data: {
                  vendorId: vendor.id,
                  personType: vendor.personType,
                  name: vendor.name,
                  representativeName: vendor.representativeName,
                  economicCode: vendor.economicCode,
                  registrationNumber: vendor.registrationNumber,
                  nationalId: vendor.nationalId,
                  addressLine: vendor.addressLine,
                  postalCode: vendor.postalCode,
                  phone: vendor.phone,
                  fax: vendor.fax,
                },
              })
            ).id
          : null;

        const created = await tx.invoice.create({
          data: {
            documentId: document.id,
            // از خود سند خوانده می‌شود؛ FK ترکیبی سازگاری را تضمین می‌کند.
            documentType: document.type,
            invoiceTypeId: link.invoiceTypeId,
            invoiceKind: link.invoiceType.kind,
            chapterId: link.chapterId,
            chapterCodeSnapshot: link.chapter.code,
            chapterTitleSnapshot: link.chapter.title,
            vendorId: vendor?.id ?? null,
            vendorSnapshotId,
            buyerSnapshotId: document.buyerSnapshotId,
            invoiceNumber: input.invoiceNumber,
            invoiceDate: new Date(`${input.invoiceDate}T00:00:00.000Z`),
            taxMode: prepared.invoiceTax.mode,
            taxRateBp: prepared.invoiceTax.mode === 'PERCENT' ? prepared.invoiceTax.rateBp : null,
            grossAmount: computed.grossAmount,
            discountAmount: computed.discountAmount,
            netAmount: computed.netAmount,
            taxAmount: computed.taxAmount,
            totalAmount: computed.totalAmount,
            description: input.description,
            notes: input.notes,
            createdById: user.id,
            items: {
              create: computed.items.map((item) => ({
                rowNo: item.rowNo,
                description: item.description,
                productCode: item.productCode,
                quantity: item.quantity,
                unitId: item.unitId,
                unitPrice: item.unitPrice,
                grossAmount: item.grossAmount,
                discountAmount: item.discountAmount,
                netAmount: item.netAmount,
                taxMode: item.taxMode,
                taxRateBp: item.taxRateBp,
                taxAmount: item.taxAmount,
                totalAmount: item.totalAmount,
              })),
            },
            ...(paymentData ? { payment: { create: paymentData } } : {}),
          },
          // شناسه ردیف‌ها لازم است: ردیف تاریخ سوخت به ردیف مالی خودش گره می‌خورد.
          include: { items: { select: { id: true, rowNo: true } } },
        });

        // جزئیات اختصاصی در **همان** تراکنش نوشته می‌شوند؛ فاکتور بی‌جزئیات نمی‌ماند.
        await prepared.writeDetails(tx, created);

        await this.financial.refreshDocumentTotals(tx, document.id);

        await this.audit.record(
          {
            actorId: user.id,
            action: 'INVOICE_CREATE',
            entityType: 'invoice',
            entityId: created.id,
            documentId: document.id,
            after: {
              id: created.id,
              totalAmount: created.totalAmount.toString(),
              // تأیید تکرار، بخشی از همان رویداد است: بعداً باید بشود فهمید چه کسی
              // با چه هشداری ثبت را ادامه داده.
              ...(duplicateNotice === null ? {} : { acknowledgedDuplicate: duplicateNotice }),
            },
          },
          tx,
        );

        return created;
      });

      return invoice;
    } catch (error) {
      throw this.translateConstraint(error, document.type);
    }
  }

  async remove(invoiceId: string, user: AuthenticatedUser): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { document: true },
    });
    if (!invoice) throw AppError.notFound('فاکتور یافت نشد');

    if (!isEditableStatus(invoice.document.status as DocumentStatus)) {
      throw AppError.conflict(
        'DOCUMENT_NOT_EDITABLE',
        'سند در وضعیت فعلی قابل ویرایش نیست',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.delete({ where: { id: invoiceId } });
      await this.financial.refreshDocumentTotals(tx, invoice.documentId);

      await this.audit.record(
        {
          actorId: user.id,
          action: 'INVOICE_DELETE',
          entityType: 'invoice',
          entityId: invoiceId,
          documentId: invoice.documentId,
          before: { id: invoiceId, totalAmount: invoice.totalAmount.toString() },
        },
        tx,
      );
    });
  }

  /** ساخت داده پرداخت با snapshot شبا. */
  private async resolvePayment(
    input: CreateInvoiceInput,
    vendorId: string | null,
  ): Promise<Prisma.InvoicePaymentCreateWithoutInvoiceInput | null> {
    if (!input.payment) return null;

    const method = await this.prisma.paymentMethod.findUnique({
      where: { id: input.payment.paymentMethodId },
    });
    if (!method || !method.isActive) {
      throw AppError.validation('روش پرداخت انتخاب‌شده معتبر نیست', [
        { path: 'payment.paymentMethodId', message: 'روش پرداخت معتبر نیست' },
      ]);
    }

    const base = {
      paymentMethod: { connect: { id: method.id } },
      methodKind: method.kind,
      notes: input.payment.notes,
    };

    if (method.kind === 'BENEFICIARY_ACCOUNT') {
      if (!input.payment.vendorBankAccountId) {
        throw AppError.validation('برای حساب ذی‌نفع، انتخاب شبا الزامی است', [
          { path: 'payment.vendorBankAccountId', message: 'شبا انتخاب نشده است' },
        ]);
      }

      const account = await this.prisma.vendorBankAccount.findUnique({
        where: { id: input.payment.vendorBankAccountId },
        include: { bank: true },
      });

      if (!account || !account.isActive) {
        throw AppError.validation('شبای انتخاب‌شده معتبر یا فعال نیست', [
          { path: 'payment.vendorBankAccountId', message: 'شبا معتبر نیست' },
        ]);
      }
      // شبا باید متعلق به همان فروشنده فاکتور باشد.
      if (vendorId === null || account.vendorId !== vendorId) {
        throw AppError.validation('شبای انتخاب‌شده متعلق به فروشنده این فاکتور نیست', [
          { path: 'payment.vendorBankAccountId', message: 'شبا متعلق به این فروشنده نیست' },
        ]);
      }
      if (!validateIban(account.ibanNormalized).valid) {
        throw AppError.validation('شبای ذخیره‌شده معتبر نیست', [
          { path: 'payment.vendorBankAccountId', message: 'شبا معتبر نیست' },
        ]);
      }

      return {
        ...base,
        vendorBankAccount: { connect: { id: account.id } },
        ibanSnapshot: account.ibanNormalized,
        bankTitleSnapshot: account.bank?.titleFa ?? null,
        accountTitleSnapshot: account.accountTitle,
        paymentIdentifier: input.payment.paymentIdentifier,
      };
    }

    if (method.kind === 'BILL') {
      return {
        ...base,
        billIdentifier: input.payment.billIdentifier,
        paymentIdentifier: input.payment.paymentIdentifier,
      };
    }

    /*
      تنخواه.

      تنخواه‌دار **اختیاری** است (فاکتورهای قدیمی بدون او ثبت شده‌اند)، ولی اگر
      انتخاب شود، نام و اطلاعات حسابش همین‌جا snapshot می‌شوند: گزارشی که شش ماه
      بعد گرفته می‌شود باید همان نامی را نشان دهد که آن روز پول به حسابش رفت، نه
      نام امروزِ اطلاعات پایه.
    */
    if (!input.payment.pettyCashHolderId) return base;

    const holder = await this.prisma.pettyCashHolder.findUnique({
      where: { id: input.payment.pettyCashHolderId },
      include: { bank: { select: { titleFa: true } } },
    });
    if (!holder || !holder.isActive) {
      throw AppError.validation('تنخواه‌دار انتخاب‌شده معتبر یا فعال نیست', [
        { path: 'payment.pettyCashHolderId', message: 'تنخواه‌دار معتبر نیست' },
      ]);
    }

    return {
      ...base,
      pettyCashHolder: { connect: { id: holder.id } },
      pettyCashHolderNameSnapshot: holder.fullName,
      // نبودِ صاحب حساب یعنی حساب به نام خود تنخواه‌دار است.
      pettyCashAccountHolderSnapshot: holder.accountHolderName ?? holder.fullName,
      pettyCashBankTitleSnapshot: holder.bank?.titleFa ?? null,
      pettyCashIbanSnapshot: holder.ibanNormalized,
    };
  }

  /**
   * ترجمه قیدهای دیتابیس به پیام فارسی.
   *
   * قید همچنان مرجع است؛ این فقط خطای خام را قابل فهم می‌کند.
   *
   * نکته: Prisma برای نقض ایندکس یکتای جزئی، **نام ستون** را گزارش می‌دهد
   * (`target: ["document_id"]`)، نه نام ایندکس را. پس تشخیص از ترکیب ستون و نوع سند
   * انجام می‌شود، نه از نام ایندکس.
   */
  private translateConstraint(error: unknown, documentType: 'NORMAL' | 'STAD'): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.['target'];
      const columns = Array.isArray(target) ? target.map(String) : [String(target ?? '')];

      if (documentType === 'STAD' && columns.includes('document_id')) {
        return AppError.conflict(
          'STAD_SINGLE_INVOICE',
          'سند سامانه ستاد فقط می‌تواند یک فاکتور داشته باشد',
        );
      }
    }
    return error;
  }
}
