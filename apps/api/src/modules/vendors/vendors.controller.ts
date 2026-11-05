import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { formatIban, validateIban } from '@dm/shared';

import {
  CurrentUser,
  ReadOnlyRoute,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { listQuerySchema } from '../../common/query/list-query';
import {
  VendorsService,
  bankAccountInputSchema,
  vendorFieldsSchema,
  vendorInputSchema,
  type BankAccountInput,
  type VendorInput,
} from './vendors.service';
import { PrismaService } from '../../common/prisma/prisma.service';

// نسخهٔ `partial` از شکل **خام** ساخته می‌شود: قاعدهٔ «نماینده فقط برای حقوقی» روی
// شیءِ ناقص معنا ندارد و zod هم اجازه‌اش را نمی‌دهد.
const vendorUpdateSchema = vendorFieldsSchema.partial();
const bankAccountUpdateSchema = bankAccountInputSchema.omit({ iban: true }).partial();

const duplicateCheckSchema = z.object({
  name: z.string().trim().max(300).optional(),
  economicCode: z.string().trim().max(30).optional(),
  nationalId: z.string().trim().max(20).optional(),
});

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermission('vendor:read')
  @Get()
  @ApiOperation({ summary: 'جست‌وجوی فروشندگان بر اساس نام، نماینده یا شناسه‌های هویتی' })
  async list(@Query(new ZodBody(listQuerySchema)) query: ReturnType<typeof listQuerySchema.parse>) {
    return this.vendors.list(query);
  }

  @RequirePermission('vendor:read')
  @ReadOnlyRoute()
  @Post('check-duplicate')
  @ApiOperation({ summary: 'یافتن فروشندگان مشابه پیش از ثبت رکورد جدید' })
  async checkDuplicate(
    @Body(new ZodBody(duplicateCheckSchema)) body: z.infer<typeof duplicateCheckSchema>,
  ) {
    const matches = await this.vendors.findPotentialDuplicates({
      economicCode: body.economicCode ?? null,
      nationalId: body.nationalId ?? null,
      ...(body.name !== undefined ? { name: body.name } : {}),
    });
    return {
      matches: matches.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        personType: vendor.personType,
        // گزینه‌ها باید به‌اندازه کافی از هم قابل تشخیص باشند (§۱۱.۲).
        economicCode: vendor.economicCode,
        nationalId: vendor.nationalId,
        addressLine: vendor.addressLine,
        isActive: vendor.isActive,
      })),
    };
  }

  /** اعتبارسنجی شبا بدون ذخیره — برای بازخورد لحظه‌ای فرم. */
  @RequirePermission('vendor:read')
  @ReadOnlyRoute()
  @Post('validate-iban')
  @ApiOperation({ summary: 'بررسی شبا و تشخیص بانک (بدون ذخیره)' })
  async validateIbanEndpoint(
    @Body(new ZodBody(z.object({ iban: z.string().max(34) }))) body: { iban: string },
  ) {
    const result = validateIban(body.iban);
    if (!result.valid || result.normalized === null) {
      return { valid: false, errorCode: result.errorCode, message: result.errorMessage };
    }

    const bank = result.bankCode
      ? await this.prisma.bank.findUnique({ where: { code: result.bankCode } })
      : null;

    return {
      valid: true,
      normalized: result.normalized,
      formatted: formatIban(result.normalized),
      bankCode: result.bankCode,
      bankTitle: bank?.titleFa ?? null,
      // یادآوری صریح تا UI این را تأیید حساب جا نزند.
      notice: 'تشخیص بانک به‌معنای تأیید مالکیت یا فعال بودن حساب نیست.',
    };
  }

  @RequirePermission('vendor:read')
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.vendors.get(id);
  }

  @RequirePermission('vendor:write')
  @Post()
  @ApiOperation({ summary: 'ثبت فروشنده جدید' })
  async create(
    @Body(new ZodBody(vendorInputSchema)) body: VendorInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendors.create(body, user.id);
  }

  @RequirePermission('vendor:write')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(vendorUpdateSchema)) body: Partial<VendorInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendors.update(id, body, user.id);
  }

  @RequirePermission('vendor_bank_account:write')
  @Post(':id/bank-accounts')
  @ApiOperation({ summary: 'افزودن شبا برای فروشنده' })
  async addBankAccount(
    @Param('id') vendorId: string,
    @Body(new ZodBody(bankAccountInputSchema)) body: BankAccountInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendors.addBankAccount(vendorId, body, user.id);
  }

  @RequirePermission('vendor_bank_account:write')
  @Patch(':id/bank-accounts/:accountId')
  @ApiOperation({ summary: 'ویرایش، غیرفعال کردن یا پیش‌فرض کردن شبا' })
  async updateBankAccount(
    @Param('id') vendorId: string,
    @Param('accountId') accountId: string,
    @Body(new ZodBody(bankAccountUpdateSchema)) body: Partial<Omit<BankAccountInput, 'iban'>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendors.updateBankAccount(vendorId, accountId, body, user.id);
  }
}
