import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { validateIban } from '@dm/shared';
import { z } from 'zod';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import {
  listQuerySchema,
  orderByArg,
  paginationArgs,
  toPageResult,
  type PageResult,
} from '../../common/query/list-query';

/**
 * تنخواه‌داران — اطلاعات پایهٔ روش پرداخت «کارپرداز / تنخواه».
 *
 * چرا جدا از کاربران: تنخواه‌دار لزوماً کاربر سامانه نیست و اطلاعاتی دارد (صاحب
 * حساب، بانک، شبا) که به حساب کاربری ربطی ندارد. گره زدنش به `users` یعنی تعریف
 * تنخواه‌دار در گرو ساختن حساب کاربری.
 *
 * **نام صاحب حساب جدا از نام تنخواه‌دار است**: پول ممکن است به حساب همسر یا حساب
 * واحد واریز شود و در گزارش، آنچه باید بنشیند نام همان حساب است.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const holderInputSchema = z.object({
  fullName: z.string().trim().min(1, 'نام تنخواه‌دار الزامی است').max(200),
  positionTitle: optionalText(200),
  nationalId: optionalText(20),
  phone: optionalText(30),
  accountHolderName: optionalText(200),
  iban: optionalText(34),
  accountNumber: optionalText(50),
  notes: optionalText(1000),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

const SORTABLE = ['fullName', 'sortOrder', 'createdAt', 'updatedAt'] as const;

@ApiTags('base-data')
@Controller('base-data/petty-cash-holders')
export class PettyCashHoldersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('base_data:read')
  @Get()
  @ApiOperation({ summary: 'فهرست تنخواه‌داران با بانکشان' })
  async list(
    @Query(new ZodBody(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ): Promise<PageResult<unknown>> {
    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) where['isActive'] = query.isActive;
    if (query.search) {
      where['OR'] = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { accountHolderName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.pettyCashHolder.findMany({
        where,
        orderBy: orderByArg(query, SORTABLE, [{ sortOrder: 'asc' }, { fullName: 'asc' }]),
        ...paginationArgs(query),
        include: { bank: { select: { code: true, titleFa: true } } },
      }),
      this.prisma.pettyCashHolder.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  @RequirePermission('base_data:write')
  @Post()
  async create(
    @Body(new ZodBody(holderInputSchema)) body: z.infer<typeof holderInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const created = await this.prisma.pettyCashHolder.create({
      data: { ...body, ...this.ibanFields(body.iban) },
      include: { bank: { select: { code: true, titleFa: true } } },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_CREATE',
      entityType: 'petty_cash_holder',
      entityId: created.id,
      after: created,
    });

    return created;
  }

  @RequirePermission('base_data:write')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(holderInputSchema.partial()))
    body: Partial<z.infer<typeof holderInputSchema>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const before = await this.prisma.pettyCashHolder.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('تنخواه‌دار یافت نشد');

    const updated = await this.prisma.pettyCashHolder.update({
      where: { id },
      // شبا که در بدنه نیامده دست‌نخورده می‌ماند؛ آمده و خالی یعنی برداشته شود.
      data: { ...body, ...('iban' in body ? this.ibanFields(body.iban ?? null) : {}) },
      include: { bank: { select: { code: true, titleFa: true } } },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_UPDATE',
      entityType: 'petty_cash_holder',
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }

  @RequirePermission('base_data:write')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const before = await this.prisma.pettyCashHolder.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('تنخواه‌دار یافت نشد');

    const usage = await this.prisma.invoicePayment.count({ where: { pettyCashHolderId: id } });
    if (usage > 0) {
      throw AppError.conflict(
        'BASE_DATA_IN_USE',
        `این تنخواه‌دار در ${usage} فاکتور استفاده شده است و حذف نمی‌شود. برای کنار گذاشتن او، غیرفعالش کنید.`,
      );
    }

    await this.prisma.pettyCashHolder.delete({ where: { id } });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_DELETE',
      entityType: 'petty_cash_holder',
      entityId: id,
      before,
    });
  }

  /**
   * شبا: اعتبارسنجی و استخراج بانک.
   *
   * بانک از خود شبا درمی‌آید و جدا پرسیده نمی‌شود — رقم‌های سوم تا پنجم همان کد
   * بانک‌اند، و پرسیدنش یعنی ساختن فرصتی برای ناسازگاری.
   */
  private ibanFields(iban: string | null): {
    iban: string | null;
    ibanNormalized: string | null;
    bankCode: string | null;
  } {
    if (!iban) return { iban: null, ibanNormalized: null, bankCode: null };

    const result = validateIban(iban);
    if (!result.valid || result.normalized === null) {
      throw AppError.validation(result.errorMessage ?? 'شماره شبا معتبر نیست', [
        { path: 'iban', message: result.errorMessage ?? 'شماره شبا معتبر نیست' },
      ]);
    }

    return {
      iban,
      ibanNormalized: result.normalized,
      bankCode: result.bankCode ?? null,
    };
  }
}
