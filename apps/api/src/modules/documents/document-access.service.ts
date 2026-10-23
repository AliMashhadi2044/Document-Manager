import { Injectable } from '@nestjs/common';
import type { FinancialDocument, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';

/**
 * دامنه دسترسی سند بر اساس نقش — **لایه دوم** کنترل دسترسی
 * (docs/06-roles-permissions.md §۴).
 *
 * چرا یک سرویس جداست و در `DocumentsService` نمانده: با فاز ۵، سه مسیر دیگر هم به
 * همین قاعده نیاز پیدا کردند (پیوست، بازخورد، بایگانی). اگر هر کدام نسخه خودش را
 * می‌نوشت، اولین تغییرِ قاعده یکی از آن‌ها را جا می‌گذاشت و همان می‌شد راه دور زدن
 * محدودیت نقش. حالا قاعده یک‌جاست و همه از آن می‌خوانند.
 *
 * قاعده کلیدی: رکورد **خارج از دامنه، ۴۰۴ می‌گیرد نه ۴۰۳** — تا وجود سندی که کاربر
 * حق دیدنش را ندارد لو نرود (ضد IDOR).
 */
@Injectable()
export class DocumentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * شرط کوئری دامنه دسترسی.
   *
   * ناظر پیش‌نویس را نمی‌بیند (تصمیم Q8)؛ بایگانی فقط اسناد ارجاع‌شده را می‌بیند.
   *
   * **و سندِ در سطل زباله را هیچ‌کس نمی‌بیند.** این شرط عمداً در همین تابع نشسته و
   * نه در تک‌تک کوئری‌ها: هر مسیری که سند را می‌خواند — فهرست، گزارش‌گیری، داشبورد،
   * بایگانی، بازخورد — از همین‌جا شرطش را می‌گیرد، پس اولین مسیری که فردا اضافه
   * شود هم خودبه‌خود درست است. حذف‌شده نه در گزارش می‌آید، نه در داشبورد شمرده
   * می‌شود، نه روی قاعده‌های کنترلی مثل تکرار انشعاب اثر می‌گذارد.
   *
   * به همین دلیل خروجی **هیچ‌وقت خالی نیست**، حتی برای کاربری که همه‌چیز را
   * می‌بیند؛ فراخوان‌هایی که «شرط خالی یعنی بدون محدودیت» فرض می‌کردند، دیگر این
   * شرط را دور نمی‌زنند.
   */
  scope(user: AuthenticatedUser): Prisma.FinancialDocumentWhereInput {
    return { deletedAt: null, ...this.roleScope(user) };
  }

  /**
   * دامنهٔ نقش **بدون** شرط حذف — فقط برای سطل زباله.
   *
   * سطل زباله هم دامنهٔ نقش را رعایت می‌کند: کسی که پیش‌نویس دیگران را نمی‌دید، در
   * سطل زباله هم نمی‌بیند.
   */
  deletedScope(user: AuthenticatedUser): Prisma.FinancialDocumentWhereInput {
    return { deletedAt: { not: null }, ...this.roleScope(user) };
  }

  private roleScope(user: AuthenticatedUser): Prisma.FinancialDocumentWhereInput {
    if (user.permissions.includes('document:read_draft')) return {};

    if (user.permissions.includes('archive:write')) {
      return { status: { in: ['PENDING_ARCHIVE', 'ARCHIVED', 'NEEDS_REVISION'] } };
    }

    return { status: { not: 'DRAFT' } };
  }

  /** سند را در دامنه دسترسی کاربر برمی‌گرداند، یا ۴۰۴ می‌دهد. */
  async assertDocumentVisible(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<FinancialDocument> {
    const document = await this.prisma.financialDocument.findFirst({
      where: { id: documentId, ...this.scope(user) },
    });
    if (!document) throw AppError.notFound('سند یافت نشد');
    return document;
  }
}
