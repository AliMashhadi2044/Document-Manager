import { Injectable } from '@nestjs/common';
import type { FinancialDocument } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import {
  orderByArg,
  paginationArgs,
  toPageResult,
  type ListQuery,
  type PageResult,
} from '../../common/query/list-query';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from './document-access.service';

/**
 * سطل زباله سند.
 *
 * ─────── قاعدهٔ بنیادی ───────
 *
 * **هیچ حذفی ردیف را پاک نمی‌کند.** «حذف سند» یعنی پر شدن `deleted_at`؛ از آن لحظه
 * سند از همه‌جا کنار می‌رود — فهرست، داشبورد، گزارش‌ها، خروجی‌ها، و قاعده‌های کنترلی
 * مثل «یک مدرسه دوبار برای یک انشعاب فاکتور نخورد». این «همه‌جا» از روی انضباط
 * به‌دست نمی‌آید: شرطش در `DocumentAccessService.scope()` نشسته و هر مسیری که سند را
 * می‌خواند از همان‌جا شرطش را می‌گیرد.
 *
 * پاک کردن واقعی فقط از خود سطل زباله، با مجوز جدا و عمل صریح کاربر انجام می‌شود.
 *
 * ─────── بازگرداندن ───────
 *
 * بازگرداندن می‌تواند **تداخل** بسازد: در نبودِ این سند، کاربر ممکن است همان انشعاب
 * همان مدرسه را در سند دیگری ثبت کرده باشد. پس پیش از بازگرداندن، همان قاعده‌ها
 * دوباره سنجیده می‌شوند و اگر تداخلی هست، **سندِ طرفِ تداخل نام برده می‌شود** — کاربر
 * باید بداند با چه چیزی تصادم دارد، نه فقط اینکه «نمی‌شود».
 */

const TRASH_SORTABLE = ['deletedAt', 'createdAt', 'fiscalYear', 'totalAmount'] as const;

export interface RestoreConflict {
  readonly kind: 'UTILITY_DUPLICATE' | 'DOCUMENT_NUMBER';
  readonly message: string;
  /** سندی که با آن تداخل دارد — کاربر باید بتواند بازش کند. */
  readonly documentId: string;
  readonly documentTitle: string;
}

@Injectable()
export class DocumentTrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: DocumentAccessService,
  ) {}

  /**
   * انتقال به سطل زباله.
   *
   * در هر وضعیتی ممکن است — رابط برای سند ثبت‌شده هشدار سخت‌تری می‌دهد، ولی مرجعِ
   * «چه چیزی حذف شد» رد حسابرسی است، نه سختیِ هشدار. دلیل **الزامی** است: سندی که
   * بی‌دلیل در سطل زباله است، چند ماه بعد قابل داوری نیست.
   */
  async softDelete(
    id: string,
    reason: string,
    user: AuthenticatedUser,
  ): Promise<FinancialDocument> {
    const before = await this.access.assertDocumentVisible(id, user);

    const updated = await this.prisma.financialDocument.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id, deleteReason: reason },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'DOCUMENT_SOFT_DELETE',
      entityType: 'financialDocument',
      entityId: id,
      documentId: id,
      before,
      after: updated,
      reason,
    });

    return updated;
  }

  /** فهرست سطل زباله — با همان دامنهٔ نقش که فهرست عادی دارد. */
  async list(query: ListQuery, user: AuthenticatedUser): Promise<PageResult<unknown>> {
    const where = this.access.deletedScope(user);

    const [items, total] = await Promise.all([
      this.prisma.financialDocument.findMany({
        where,
        orderBy: orderByArg(query, TRASH_SORTABLE, [{ deletedAt: 'desc' }]),
        ...paginationArgs(query),
        include: {
          buyerSnapshot: { select: { name: true } },
          deletedBy: { select: { id: true, fullName: true } },
          _count: { select: { invoices: true } },
        },
      }),
      this.prisma.financialDocument.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  /** یک سندِ حذف‌شده با همهٔ جزئیاتش — همان چیزی که برگهٔ سند نشان می‌دهد. */
  async get(id: string, user: AuthenticatedUser) {
    const document = await this.prisma.financialDocument.findFirst({
      where: { id, ...this.access.deletedScope(user) },
      include: {
        buyerSnapshot: true,
        deletedBy: { select: { id: true, fullName: true } },
        stadMetadata: { include: { requestType: true } },
        invoices: {
          orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          include: {
            vendorSnapshot: true,
            chapter: { select: { title: true, category: { select: { key: true } } } },
            invoiceType: { select: { titleFa: true, kind: true } },
            payment: { include: { paymentMethod: true } },
            items: { orderBy: { rowNo: 'asc' }, include: { fuelEntry: true } },
            utilityDetail: true,
            fuelDetail: true,
          },
        },
      },
    });

    if (!document) throw AppError.notFound('سند یافت نشد');
    return document;
  }

  /**
   * تداخل‌های بازگرداندن — بدون تغییر دادن چیزی.
   *
   * رابط پیش از نشان دادن دکمهٔ بازگرداندن همین را می‌پرسد، و خودِ بازگرداندن هم
   * دوباره می‌سنجد: فاصلهٔ میان پرسش و عمل، جای یک سند تازه است.
   */
  async restoreConflicts(id: string, user: AuthenticatedUser): Promise<RestoreConflict[]> {
    const document = await this.get(id, user);
    const conflicts: RestoreConflict[] = [];

    /*
      تکرار انشعاب.

      در نبودِ این سند، همان مدرسه و همان انشعاب ممکن است در سند دیگری ثبت شده
      باشد. بازگرداندن بی‌بررسی یعنی ساختن همان حالتی که قاعده برای جلوگیری از آن
      هست — و این بار بی‌آنکه کسی هشداری دیده باشد.
    */
    for (const invoice of document.invoices) {
      if (!invoice.utilityDetail) continue;

      const clash = await this.prisma.invoiceUtilityDetail.findFirst({
        where: {
          schoolId: invoice.utilityDetail.schoolId,
          utilityTypeId: invoice.utilityDetail.utilityTypeId,
          invoice: {
            document: {
              id: { not: id },
              fiscalYear: document.fiscalYear,
              status: { not: 'NEEDS_REVISION' },
              deletedAt: null,
            },
          },
        },
        include: { invoice: { include: { document: { select: { id: true, title: true } } } } },
      });

      if (clash) {
        conflicts.push({
          kind: 'UTILITY_DUPLICATE',
          message:
            `انشعاب «${invoice.utilityDetail.utilityTypeTitleSnapshot}» مدرسهٔ ` +
            `«${invoice.utilityDetail.schoolTitleSnapshot}» در سال مالی ` +
            `${document.fiscalYear} پس از حذف این سند، در سند دیگری ثبت شده است.`,
          documentId: clash.invoice.document.id,
          documentTitle: clash.invoice.document.title,
        });
      }
    }

    /*
      شماره سند.

      شماره را بایگانی می‌زند و در هر سال مالی یکتاست (ایندکس جزئی). سندِ حذف‌شده
      شماره‌اش را با خودش نگه می‌دارد، پس اگر همان شماره در این فاصله به سند دیگری
      داده شده باشد، بازگرداندن به خطای دیتابیس می‌خورد — که پیام قابل فهمی نیست.
    */
    if (document.documentNumber) {
      const clash = await this.prisma.financialDocument.findFirst({
        where: {
          id: { not: id },
          documentNumber: document.documentNumber,
          fiscalYear: document.fiscalYear,
          deletedAt: null,
        },
        select: { id: true, title: true },
      });

      if (clash) {
        conflicts.push({
          kind: 'DOCUMENT_NUMBER',
          message:
            `شماره سند «${document.documentNumber}» در سال مالی ${document.fiscalYear} ` +
            `به سند دیگری داده شده است.`,
          documentId: clash.id,
          documentTitle: clash.title,
        });
      }
    }

    return conflicts;
  }

  /** بازگرداندن از سطل زباله — فقط وقتی هیچ تداخلی نباشد. */
  async restore(id: string, user: AuthenticatedUser): Promise<FinancialDocument> {
    const before = await this.get(id, user);
    const conflicts = await this.restoreConflicts(id, user);

    if (conflicts.length > 0) {
      throw AppError.conflict(
        'RESTORE_CONFLICT',
        `بازگرداندن این سند با ${conflicts.length === 1 ? 'یک سند دیگر' : 'چند سند دیگر'} تداخل دارد: ` +
          conflicts.map((item) => `${item.message} (سند «${item.documentTitle}»)`).join(' '),
        conflicts.map((item) => ({ path: item.kind, message: item.message })),
      );
    }

    const updated = await this.prisma.financialDocument.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, deleteReason: null },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'DOCUMENT_RESTORE',
      entityType: 'financialDocument',
      entityId: id,
      documentId: id,
      before,
      after: updated,
    });

    return updated;
  }

  /**
   * حذف دائمی.
   *
   * تنها جایی در سامانه که داده واقعاً از بین می‌رود، و فقط از داخل سطل زباله:
   * سندی که در سطل زباله نباشد، از این مسیر هم پاک نمی‌شود. پس «حذف ناگهانی»
   * ممکن نیست؛ هر پاک شدنی دو عمل صریح و دو تصمیم جدا لازم دارد.
   *
   * رد حسابرسی **پیش از** پاک شدن نوشته می‌شود و خودش پاک نمی‌شود: عکسِ سند پیش از
   * نابودی، تنها چیزی است که باقی می‌ماند.
   */
  async purge(id: string, user: AuthenticatedUser): Promise<void> {
    const before = await this.get(id, user);

    await this.audit.record({
      actorId: user.id,
      action: 'DOCUMENT_PURGE',
      entityType: 'financialDocument',
      entityId: id,
      /*
        `document_id` در جدول حسابرسی کلید خارجی **نیست**، پس این ردیف از پاک شدن
        سند جان سالم به در می‌برد و همان‌جا می‌ماند — با `before` که عکس کامل سند و
        فاکتورهایش است.
      */
      documentId: id,
      before,
      reason: before.deleteReason,
    });

    await this.prisma.financialDocument.delete({ where: { id } });
  }
}
