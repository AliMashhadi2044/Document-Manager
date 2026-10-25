import { Injectable } from '@nestjs/common';
import { Prisma, type FinancialDocument } from '@prisma/client';
import {
  PAYMENT_SETTLEMENT_LABELS,
  checkSettlement,
  type PaymentSettlementStatus,
} from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, type ErrorDetail } from '../../common/errors/app-error';
import {
  orderByArg,
  paginationArgs,
  toPageResult,
  type ListQuery,
  type PageResult,
} from '../../common/query/list-query';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * وضعیت پرداخت، همان‌طور که بایگان ثبتش می‌کند.
 *
 * مبالغ فقط در «نیازمندی» می‌آیند؛ در «پرداخت کامل» مشتق‌اند و پرسیدنشان فقط راهی
 * می‌شد برای ثبت تناقض.
 */
export interface PaymentStatusInput {
  readonly status: PaymentSettlementStatus;
  readonly paidAmount: string | null;
  readonly outstandingAmount: string | null;
}

export interface ArchiveInfoInput {
  readonly documentNumber: string;
  /** تاریخ سند به‌صورت `YYYY-MM-DD` میلادی؛ تبدیل شمسی سمت کلاینت انجام شده است. */
  readonly documentDate: string;
  readonly notes: string | null;
}

const ARCHIVE_SORTABLE = ['createdAt', 'fiscalYear', 'documentDate', 'totalAmount'] as const;

/**
 * کارتابل بایگانی.
 *
 * محدوده کار بایگانی عمداً باریک است: شماره سند، تاریخ سند، توضیح بایگانی، فایل‌ها، و
 * نهایی کردن بایگانی. **هیچ مبلغی** از این مسیر قابل تغییر نیست — نه چون کد اینجا
 * مراقب است، بلکه چون نقش بایگانی اصلاً مجوز `document:update` و `invoice:*` ندارد و
 * نگهبان مجوز پیش از رسیدن به این سرویس جلویش را می‌گیرد (معیار پذیرش ۲).
 */
@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: DocumentAccessService,
    private readonly documents: DocumentsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** کارتابل: اسنادی که در جریان بایگانی‌اند، با فیلتر وضعیت و سال مالی. */
  async inbox(
    query: ListQuery & {
      status?: 'PENDING_ARCHIVE' | 'ARCHIVED' | 'NEEDS_REVISION' | undefined;
      fiscalYear?: number | undefined;
      hasOpenFeedback?: boolean | undefined;
      /** `UNSET` یعنی هنوز تعیین‌نشده — که با «پرداخت کامل» یکی نیست. */
      paymentStatus?: PaymentSettlementStatus | 'UNSET' | undefined;
    },
    user: AuthenticatedUser,
  ): Promise<PageResult<unknown>> {
    const where: Prisma.FinancialDocumentWhereInput = {
      ...this.access.scope(user),
      status: query.status ?? { in: ['PENDING_ARCHIVE', 'ARCHIVED', 'NEEDS_REVISION'] },
      ...(query.fiscalYear ? { fiscalYear: query.fiscalYear } : {}),
      ...(query.hasOpenFeedback === undefined
        ? {}
        : query.hasOpenFeedback
          ? { openFeedbackCount: { gt: 0 } }
          : { openFeedbackCount: 0 }),
      ...(query.paymentStatus === undefined
        ? {}
        : query.paymentStatus === 'UNSET'
          ? { paymentStatus: null }
          : { paymentStatus: query.paymentStatus }),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { documentNumber: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.financialDocument.findMany({
        where,
        orderBy: orderByArg(query, ARCHIVE_SORTABLE, [{ createdAt: 'desc' }]),
        ...paginationArgs(query),
        include: {
          buyerSnapshot: { select: { name: true } },
          archiveMetadata: true,
          _count: { select: { invoices: true, attachments: true } },
        },
      }),
      this.prisma.financialDocument.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  /**
   * ثبت یا اصلاح شماره و تاریخ سند.
   *
   * یکتایی شماره در هر سال مالی را **ایندکس دیتابیس** تضمین می‌کند
   * (`financial_documents_number_per_year_uk`، تصمیم Q5)؛ این متد فقط خطای خام را به
   * پیام فارسی ترجمه می‌کند. بررسی «قبلش وجود دارد؟» جایگزین قید نیست: بین بررسی و
   * نوشتن، درخواست دیگری می‌تواند همان شماره را ثبت کند (معیار پذیرش ۴).
   */
  async saveInfo(
    documentId: string,
    input: ArchiveInfoInput,
    user: AuthenticatedUser,
  ): Promise<FinancialDocument> {
    const document = await this.access.assertDocumentVisible(documentId, user);

    if (document.status === 'ARCHIVED') {
      throw AppError.conflict(
        'DOCUMENT_ARCHIVED',
        'بایگانی این سند نهایی شده است؛ برای تغییر باید سند بازگشایی شود.',
      );
    }
    if (document.status !== 'PENDING_ARCHIVE' && document.status !== 'NEEDS_REVISION') {
      throw AppError.conflict(
        'DOCUMENT_NOT_IN_ARCHIVE',
        'این سند هنوز به بایگانی ارجاع نشده است',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.financialDocument.update({
          where: { id: documentId },
          data: {
            documentNumber: input.documentNumber,
            documentDate: new Date(`${input.documentDate}T00:00:00.000Z`),
          },
        });

        await tx.archiveMetadata.upsert({
          where: { documentId },
          create: { documentId, status: 'IN_PROGRESS', notes: input.notes },
          update: { status: 'IN_PROGRESS', notes: input.notes },
        });

        await this.audit.record(
          {
            actorId: user.id,
            action: 'ARCHIVE_INFO_SAVE',
            entityType: 'financialDocument',
            entityId: documentId,
            documentId,
            before: {
              documentNumber: document.documentNumber,
              documentDate: document.documentDate,
            },
            after: {
              documentNumber: updated.documentNumber,
              documentDate: updated.documentDate,
            },
          },
          tx,
        );

        return updated;
      });
    } catch (error) {
      throw this.translateConstraint(error, document.fiscalYear, input.documentNumber);
    }
  }

  /**
   * نهایی کردن بایگانی.
   *
   * پیش‌نیازها **همه با هم** گزارش می‌شوند، نه اولین مورد؛ بایگان باید یک‌بار بداند
   * چه چیزی کم است.
   */
  async complete(documentId: string, user: AuthenticatedUser): Promise<FinancialDocument> {
    const document = await this.access.assertDocumentVisible(documentId, user);

    const problems: ErrorDetail[] = [];

    if (!document.documentNumber || !document.documentDate) {
      problems.push({
        path: 'documentNumber',
        message: 'شماره و تاریخ سند پیش از نهایی کردن بایگانی باید ثبت شوند',
      });
    }

    const attachments = await this.prisma.attachment.count({
      where: { documentId, deletedAt: null, status: 'READY' },
    });
    if (attachments === 0) {
      problems.push({
        path: 'attachments',
        message: 'حداقل یک فایل اسکن سند باید بارگذاری شده باشد',
      });
    }

    if (document.openFeedbackCount > 0) {
      problems.push({
        path: 'feedbacks',
        message: `این سند ${document.openFeedbackCount} بازخورد رسیدگی‌نشده دارد`,
      });
    }

    if (problems.length > 0) {
      throw new AppError('ARCHIVE_NOT_READY', 'سند برای نهایی شدن بایگانی آماده نیست', 422, problems);
    }

    const updated = await this.documents.archive(documentId, user);

    await this.prisma.archiveMetadata.upsert({
      where: { documentId },
      create: {
        documentId,
        status: 'COMPLETED',
        archivedById: user.id,
        archivedAt: new Date(),
      },
      update: { status: 'COMPLETED', archivedById: user.id, archivedAt: new Date() },
    });

    await this.notifications.notifyUsers([document.createdById], {
      kind: 'DOCUMENT_ARCHIVED',
      title: `بایگانی سند «${document.title}» نهایی شد`,
      body: document.documentNumber ? `شماره سند: ${document.documentNumber}` : null,
      documentId,
    });

    return updated;
  }

  /**
   * ثبت وضعیت پرداخت سند.
   *
   * سه تصمیم که ارزش نوشتن دارند:
   *
   *  ۱. **پس از بایگانی هم قابل تغییر است.** نیازمندی اصلاً برای همین وجود دارد:
   *     سند بایگانی شده و پول هنوز نرفته. قفل کردنش روی `ARCHIVED` یعنی بستن تنها
   *     جایی که می‌شد پیگیری را به پایان رساند.
   *
   *  ۲. **تاریخ پرداخت ورودی نیست.** همان لحظه‌ای است که وضعیت «پرداخت کامل» ثبت
   *     می‌شود؛ یک فیلد تاریخِ دستی، یعنی دو روایت از یک رویداد.
   *
   *  ۳. **اعلان فقط روی تغییر وضعیت.** ذخیرهٔ دوبارهٔ همان نیازمندی (مثلاً اصلاح
   *     مبلغ) نباید کارتابل کارپرداز را پر کند.
   */
  async paymentStatus(
    documentId: string,
    input: PaymentStatusInput,
    user: AuthenticatedUser,
  ): Promise<FinancialDocument> {
    const document = await this.access.assertDocumentVisible(documentId, user);

    if (
      document.status !== 'PENDING_ARCHIVE' &&
      document.status !== 'NEEDS_REVISION' &&
      document.status !== 'ARCHIVED'
    ) {
      throw AppError.conflict(
        'DOCUMENT_NOT_IN_ARCHIVE',
        'وضعیت پرداخت پس از ارجاع سند به بایگانی ثبت می‌شود',
      );
    }

    const fullyPaid = input.status === 'FULLY_PAID';
    const paidAmount = fullyPaid
      ? document.totalAmount
      : input.paidAmount === null
        ? null
        : BigInt(input.paidAmount);
    const outstandingAmount = fullyPaid
      ? 0n
      : input.outstandingAmount === null
        ? null
        : BigInt(input.outstandingAmount);

    const problem = checkSettlement(
      input.status,
      paidAmount,
      outstandingAmount,
      document.totalAmount,
    );
    if (problem !== null) throw this.settlementError(problem, document.totalAmount);

    const now = new Date();
    const changed = document.paymentStatus !== input.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.financialDocument.update({
        where: { id: documentId },
        data: {
          paymentStatus: input.status,
          paidAmount,
          outstandingAmount,
          // ساعت پیگیری فقط با **تغییر وضعیت** از نو شروع می‌شود؛ اصلاح مبلغِ همان
          // نیازمندی، مهلت ده‌روزه را عقب نمی‌اندازد.
          ...(changed ? { paymentStatusAt: now } : {}),
          paymentStatusById: user.id,
          paymentDate: fullyPaid ? (document.paymentDate ?? now) : null,
        },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'DOCUMENT_PAYMENT_STATUS',
          entityType: 'financialDocument',
          entityId: documentId,
          documentId,
          before: {
            paymentStatus: document.paymentStatus,
            paidAmount: document.paidAmount?.toString() ?? null,
            outstandingAmount: document.outstandingAmount?.toString() ?? null,
          },
          after: {
            paymentStatus: next.paymentStatus,
            paidAmount: next.paidAmount?.toString() ?? null,
            outstandingAmount: next.outstandingAmount?.toString() ?? null,
          },
        },
        tx,
      );

      return next;
    });

    if (changed) await this.announceSettlement(document, updated, user);

    return updated;
  }

  /**
   * اعلان تغییر وضعیت پرداخت به کارپردازی.
   *
   * گیرنده با **مجوز** انتخاب می‌شود و نه با نام نقش: کاری که اینجا باید انجام
   * شود ساختن و اصلاح سند است، پس هرکس `document:create` دارد همان کسی است که
   * می‌تواند پیگیری کند. سازندهٔ سند هم جداگانه خبر می‌شود، حتی اگر امروز دیگر آن
   * مجوز را نداشته باشد.
   */
  private async announceSettlement(
    before: FinancialDocument,
    after: FinancialDocument,
    user: AuthenticatedUser,
  ): Promise<void> {
    const outstanding = after.paymentStatus === 'OUTSTANDING';

    const input = outstanding
      ? {
          kind: 'DOCUMENT_PAYMENT_OUTSTANDING' as const,
          title: `نیازمندی پرداخت: «${after.title}»`,
          body:
            `مبلغ باقی‌مانده ${(after.outstandingAmount ?? 0n).toString()} ریال از ` +
            `${after.totalAmount.toString()} ریال. لطفاً پیگیری کنید.`,
          documentId: after.id,
        }
      : {
          kind: 'DOCUMENT_PAYMENT_SETTLED' as const,
          title: `پرداخت سند «${after.title}» کامل شد`,
          body:
            before.paymentStatus === 'OUTSTANDING'
              ? 'نیازمندی این سند بسته شد.'
              : `وضعیت پرداخت: ${PAYMENT_SETTLEMENT_LABELS.FULLY_PAID}`,
          documentId: after.id,
        };

    await this.notifications.notifyPermissionHolders('document:create', input, {
      exceptUserId: user.id,
    });
    await this.notifications.notifyUsers([after.createdById], input, { exceptUserId: user.id });
  }

  /** ترجمهٔ قاعدهٔ مشترک به پیام فارسی و مسیر فیلد. */
  private settlementError(
    problem: NonNullable<ReturnType<typeof checkSettlement>>,
    totalAmount: bigint,
  ): AppError {
    if (problem.code === 'MISSING') {
      return AppError.validation('مبلغ پرداخت‌شده و مبلغ نیازمندی باید وارد شوند', [
        { path: 'paidAmount', message: 'مبلغ پرداخت‌شده وارد نشده است' },
        { path: 'outstandingAmount', message: 'مبلغ نیازمندی وارد نشده است' },
      ]);
    }

    if (problem.code === 'NEGATIVE') {
      return AppError.validation('مبلغ نمی‌تواند منفی باشد', [
        { path: 'paidAmount', message: 'مبلغ باید صفر یا بیشتر باشد' },
      ]);
    }

    if (problem.code === 'NOT_OUTSTANDING') {
      return AppError.validation('نیازمندیِ صفر یعنی پرداخت کامل', [
        {
          path: 'outstandingAmount',
          message: 'اگر چیزی باقی نمانده، وضعیت «پرداخت کامل» را انتخاب کنید',
        },
      ]);
    }

    return AppError.validation(
      `جمع مبلغ پرداخت‌شده و نیازمندی باید برابر مبلغ کل سند (${totalAmount.toString()} ریال) باشد`,
      [
        {
          path: 'outstandingAmount',
          message: `اکنون ${problem.sum.toString()} ریال است`,
        },
      ],
    );
  }

  /** جزئیات بایگانی یک سند برای صفحه کارتابل. */
  async detail(documentId: string, user: AuthenticatedUser) {
    await this.access.assertDocumentVisible(documentId, user);

    return this.prisma.financialDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        status: true,
        fiscalYear: true,
        documentNumber: true,
        documentDate: true,
        openFeedbackCount: true,
        totalAmount: true,
        paymentStatus: true,
        paidAmount: true,
        outstandingAmount: true,
        paymentStatusAt: true,
        paymentDate: true,
        paymentStatusBy: { select: { id: true, fullName: true } },
        archiveMetadata: {
          include: { archivedBy: { select: { id: true, fullName: true } } },
        },
      },
    });
  }

  /**
   * ترجمه نقض یکتایی شماره سند.
   *
   * Prisma نام **ستون‌ها** را گزارش می‌دهد، نه نام ایندکس جزئی؛ پس تشخیص از ترکیب
   * ستون‌هاست (همان درسی که در فاز ۳ با ایندکس ستاد گرفته شد).
   */
  private translateConstraint(error: unknown, fiscalYear: number, documentNumber: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.['target'];
      const columns = Array.isArray(target) ? target.map(String) : [String(target ?? '')];

      if (columns.includes('document_number')) {
        return AppError.conflict(
          'DOCUMENT_NUMBER_DUPLICATE',
          `شماره سند «${documentNumber}» در سال مالی ${fiscalYear} قبلاً ثبت شده است`,
        );
      }
    }
    return error;
  }
}
