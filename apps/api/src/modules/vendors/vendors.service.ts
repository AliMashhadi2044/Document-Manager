import { Injectable } from '@nestjs/common';
import { Prisma, type Vendor, type VendorBankAccount } from '@prisma/client';
import { z } from 'zod';
import { validateIban } from '@dm/shared';

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

const identitySchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9]*$/, 'این شناسه فقط می‌تواند رقم باشد')
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

export const vendorInputSchema = z
  .object({
    personType: z.enum(['NATURAL', 'LEGAL']),
    name: z.string().trim().min(1, 'نام یا عنوان الزامی است').max(300),
    representativeName: z.string().trim().max(200).optional().transform(emptyToNull),
    economicCode: identitySchema,
    registrationNumber: z.string().trim().max(30).optional().transform(emptyToNull),
    nationalId: identitySchema,
    addressLine: z.string().trim().max(2000).optional().transform(emptyToNull),
    postalCode: z
      .string()
      .trim()
      .max(10)
      .regex(/^[0-9]*$/, 'کدپستی فقط رقم است')
      .optional()
      .transform(emptyToNull),
    phone: z.string().trim().max(30).optional().transform(emptyToNull),
    fax: z.string().trim().max(30).optional().transform(emptyToNull),
    isActive: z.boolean().default(true),
    notes: z.string().trim().max(2000).optional().transform(emptyToNull),
  })
  .superRefine((value, ctx) => {
    // نماینده فقط برای شخص حقوقی معنا دارد؛ برای حقیقی فرم آن را نشان نمی‌دهد.
    if (value.personType === 'NATURAL' && value.representativeName !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representativeName'],
        message: 'برای شخص حقیقی، نام نماینده کاربرد ندارد',
      });
    }
  });

export type VendorInput = z.infer<typeof vendorInputSchema>;

export const bankAccountInputSchema = z.object({
  iban: z.string().trim().min(1, 'شماره شبا الزامی است').max(34),
  accountTitle: z.string().trim().max(200).optional().transform(emptyToNull),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional().transform(emptyToNull),
});

export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;

const VENDOR_SORTABLE = ['name', 'createdAt', 'updatedAt'] as const;

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * جست‌وجوی فروشنده.
   *
   * §۱۱.۲: جست‌وجو فقط بر اساس نام نیست — شماره ملی، شناسه ملی و شماره اقتصادی هم
   * برای یافتن رکورد موجود به کار می‌روند، چون نام مشابه فراوان است.
   */
  async list(query: ListQuery): Promise<PageResult<Vendor & { bankAccountCount: number }>> {
    const where: Prisma.VendorWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;

    if (query.search) {
      const term = query.search;
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { representativeName: { contains: term, mode: 'insensitive' } },
        { economicCode: { contains: term } },
        { nationalId: { contains: term } },
        { registrationNumber: { contains: term } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        orderBy: orderByArg(query, VENDOR_SORTABLE, [{ name: 'asc' }]),
        ...paginationArgs(query),
        include: { _count: { select: { bankAccounts: true } } },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    const mapped = items.map(({ _count, ...vendor }) => ({
      ...vendor,
      bankAccountCount: _count.bankAccounts,
    }));

    return toPageResult(mapped, total, query);
  }

  async get(id: string): Promise<Vendor & { bankAccounts: VendorBankAccount[] }> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: { bankAccounts: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } },
    });
    if (!vendor) throw AppError.notFound('فروشنده یافت نشد');
    return vendor;
  }

  /**
   * فروشندگان مشابه، برای هشدار پیش از ثبت تکراری.
   * تشخیص بر اساس **شناسه‌های هویتی** است، نه نام.
   */
  async findPotentialDuplicates(input: {
    economicCode?: string | null;
    nationalId?: string | null;
    name?: string;
  }): Promise<Vendor[]> {
    const conditions: Prisma.VendorWhereInput[] = [];
    if (input.economicCode) conditions.push({ economicCode: input.economicCode });
    if (input.nationalId) conditions.push({ nationalId: input.nationalId });
    if (input.name) conditions.push({ name: { equals: input.name, mode: 'insensitive' } });

    if (conditions.length === 0) return [];
    return this.prisma.vendor.findMany({ where: { OR: conditions }, take: 10 });
  }

  async create(input: VendorInput, actorId: string): Promise<Vendor> {
    await this.assertIdentityAvailable(input, null);

    const created = await this.prisma.vendor.create({ data: input });

    await this.audit.record({
      actorId,
      action: 'VENDOR_CREATE',
      entityType: 'vendor',
      entityId: created.id,
      after: created,
    });

    return created;
  }

  async update(id: string, input: Partial<VendorInput>, actorId: string): Promise<Vendor> {
    const before = await this.prisma.vendor.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('فروشنده یافت نشد');

    await this.assertIdentityAvailable(input, id);

    const updated = await this.prisma.vendor.update({ where: { id }, data: input });

    await this.audit.record({
      actorId,
      action: 'VENDOR_UPDATE',
      entityType: 'vendor',
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }

  /**
   * بررسی تکراری نبودن شناسه هویتی.
   *
   * ایندکس یکتای جزئی در دیتابیس هم همین را تضمین می‌کند؛ این بررسی برای دادن **پیام
   * فارسی روشن** است، نه جایگزین قید دیتابیس.
   */
  private async assertIdentityAvailable(
    input: { economicCode?: string | null; nationalId?: string | null },
    excludeId: string | null,
  ): Promise<void> {
    const checks: Array<{ field: 'economicCode' | 'nationalId'; value: string; label: string }> = [];
    if (input.economicCode) {
      checks.push({ field: 'economicCode', value: input.economicCode, label: 'شماره اقتصادی' });
    }
    if (input.nationalId) {
      checks.push({ field: 'nationalId', value: input.nationalId, label: 'شماره/شناسه ملی' });
    }

    for (const check of checks) {
      const existing = await this.prisma.vendor.findFirst({
        where: {
          [check.field]: check.value,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true, name: true },
      });

      if (existing) {
        throw AppError.conflict(
          'VENDOR_DUPLICATE_IDENTITY',
          `فروشنده دیگری با همین ${check.label} ثبت شده است: ${existing.name}`,
        );
      }
    }
  }

  // ───────────────────────── شبا ─────────────────────────

  async addBankAccount(
    vendorId: string,
    input: BankAccountInput,
    actorId: string,
  ): Promise<VendorBankAccount> {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw AppError.notFound('فروشنده یافت نشد');

    const result = validateIban(input.iban);
    if (!result.valid || result.normalized === null) {
      throw AppError.validation(result.errorMessage ?? 'شماره شبا معتبر نیست', [
        { path: 'iban', message: result.errorMessage ?? 'شماره شبا معتبر نیست' },
      ]);
    }

    const duplicate = await this.prisma.vendorBankAccount.findUnique({
      where: { ibanNormalized: result.normalized },
      include: { vendor: { select: { name: true } } },
    });
    if (duplicate) {
      throw AppError.conflict(
        'IBAN_ALREADY_REGISTERED',
        `این شبا قبلاً برای «${duplicate.vendor.name}» ثبت شده است`,
      );
    }

    // تشخیص بانک از پیشوند — صرفاً اطلاعاتی، نه تأیید مالکیت یا فعال بودن حساب.
    const bank = result.bankCode
      ? await this.prisma.bank.findUnique({ where: { code: result.bankCode } })
      : null;

    const created = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.vendorBankAccount.updateMany({
          where: { vendorId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.vendorBankAccount.create({
        data: {
          vendorId,
          iban: input.iban.trim(),
          ibanNormalized: result.normalized as string,
          bankCode: bank?.code ?? null,
          accountTitle: input.accountTitle,
          isDefault: input.isDefault,
          isActive: input.isActive,
          notes: input.notes,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'VENDOR_BANK_ACCOUNT_CREATE',
      entityType: 'vendorBankAccount',
      entityId: created.id,
      after: created,
    });

    return created;
  }

  async updateBankAccount(
    vendorId: string,
    accountId: string,
    input: Partial<Omit<BankAccountInput, 'iban'>>,
    actorId: string,
  ): Promise<VendorBankAccount> {
    const before = await this.prisma.vendorBankAccount.findFirst({
      where: { id: accountId, vendorId },
    });
    if (!before) throw AppError.notFound('حساب بانکی یافت نشد');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.vendorBankAccount.updateMany({
          where: { vendorId, isDefault: true, id: { not: accountId } },
          data: { isDefault: false },
        });
      }
      return tx.vendorBankAccount.update({ where: { id: accountId }, data: input });
    });

    await this.audit.record({
      actorId,
      action: 'VENDOR_BANK_ACCOUNT_UPDATE',
      entityType: 'vendorBankAccount',
      entityId: accountId,
      before,
      after: updated,
    });

    return updated;
  }
}

function emptyToNull(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value.trim();
}
