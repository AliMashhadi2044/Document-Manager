import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';

/**
 * شرحِ یک فاکتور **روی فرم ریزهزینه**.
 *
 * ─────── چرا جدا از شرح خودِ فاکتور ───────
 *
 * شرح فاکتور حقیقتِ تاریخیِ سند است: چیزی که موقع ثبت نوشته شده و در بازبینی به آن
 * استناد می‌شود. عبارتی که روی فرم ریزهزینه می‌نشیند گاهی همان نیست — کوتاه‌تر، یا
 * یکی از «انواع کالا». تغییر دادنش نباید سند را عوض کند.
 *
 * ─────── مقدار از کجا می‌آید ───────
 *
 *  ۱. آنچه کاربر برای همین فاکتور **ثبت کرده** — یکی از انواع کالا یا متن آزاد.
 *  ۲. وگرنه **شرح خودِ فاکتور**.
 *  ۳. وگرنه خالی.
 *
 * پس ستون شرح بدون هیچ کاری هم درست است و تغییرش یک کلیک فاصله دارد.
 *
 * قاعده و کلیدِ `(invoice)` عمداً با «نوع کالا»ی گزارش مالیات فرق دارد: آنجا واحدِ
 * ردیف **فروشنده در یک سند** است و اینجا خودِ فاکتور، چون فرم ریزهزینه هر فاکتور را
 * یک ردیف می‌کند.
 */
@Injectable()
export class ReportLinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: DocumentAccessService,
  ) {}

  /** گزینه‌های شرح یک ردیف: آنچه حالا هست، شرح فاکتور، و انواع کالا. */
  async suggestions(documentId: string, invoiceId: string, user: AuthenticatedUser) {
    await this.access.assertDocumentVisible(documentId, user);

    const invoice = await this.invoiceInDocument(documentId, invoiceId);

    const [productTypes, current] = await Promise.all([
      this.prisma.productType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true },
      }),
      this.prisma.invoiceReportTitle.findUnique({
        where: { invoiceId },
        include: { productType: { select: { id: true, title: true } } },
      }),
    ]);

    return {
      current: current
        ? {
            id: current.productType?.id ?? null,
            title: current.productType?.title ?? (current.customTitle as string),
          }
        : null,
      /** پیش‌فرض، وقتی چیزی ثبت نشده باشد. */
      invoiceDescription: invoice.description ?? '',
      allTypes: productTypes,
    };
  }

  /**
   * ثبت، تغییر یا **برداشتن** شرح یک ردیف.
   *
   * هر سه، یکی: فرستادن هر دو مقدار به‌صورت خالی یعنی «برگرد به پیش‌فرض» و ردیف
   * حذف می‌شود. نگه داشتن ردیفی که هیچ‌کدام را ندارد، فقط پیش‌فرض را پنهان می‌کرد.
   */
  async set(
    documentId: string,
    invoiceId: string,
    input: { productTypeId: string | null; customTitle: string | null },
    user: AuthenticatedUser,
  ) {
    await this.access.assertDocumentVisible(documentId, user);
    const invoice = await this.invoiceInDocument(documentId, invoiceId);

    const previous = await this.prisma.invoiceReportTitle.findUnique({
      where: { invoiceId },
      select: { productTypeId: true, customTitle: true },
    });

    if (input.productTypeId === null && input.customTitle === null) {
      return this.prisma.$transaction(async (tx) => {
        if (previous) await tx.invoiceReportTitle.delete({ where: { invoiceId } });
        await this.audit.record(
          {
            actorId: user.id,
            action: 'REPORT_LINE_TITLE_SET',
            entityType: 'invoiceReportTitle',
            entityId: invoiceId,
            documentId,
            before: previous,
            after: null,
          },
          tx,
        );
        return { id: null, title: invoice.description ?? '' };
      });
    }

    let title: string;

    if (input.productTypeId) {
      const productType = await this.prisma.productType.findFirst({
        where: { id: input.productTypeId, isActive: true },
        select: { id: true, title: true },
      });
      if (!productType) {
        throw AppError.validation('نوع کالا یافت نشد یا غیرفعال است', [
          { path: 'productTypeId', message: 'نوع کالای معتبر انتخاب کنید' },
        ]);
      }
      title = productType.title;
    } else {
      title = input.customTitle as string;
    }

    const data = {
      productTypeId: input.productTypeId,
      customTitle: input.productTypeId ? null : input.customTitle,
    };

    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceReportTitle.upsert({
        where: { invoiceId },
        create: { invoiceId, ...data, setById: user.id },
        update: { ...data, setById: user.id, setAt: new Date() },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'REPORT_LINE_TITLE_SET',
          entityType: 'invoiceReportTitle',
          entityId: invoiceId,
          documentId,
          before: previous,
          after: { ...data, title },
        },
        tx,
      );

      return { id: input.productTypeId, title };
    });
  }

  /**
   * فاکتور باید واقعاً در همین سند باشد.
   *
   * وگرنه کاربر می‌توانست با فرستادن شناسهٔ دلخواه، وجود فاکتوری در سندی که حق
   * دیدنش را ندارد استنباط کند — همان IDOR که بررسی دسترسیِ سند جلویش را می‌گیرد.
   */
  private async invoiceInDocument(documentId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, documentId },
      select: { id: true, description: true },
    });
    if (!invoice) throw AppError.notFound('این فاکتور در این سند نیست');
    return invoice;
  }
}
