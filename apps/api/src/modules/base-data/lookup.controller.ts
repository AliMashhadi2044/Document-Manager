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
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { AppError } from '../../common/errors/app-error';
import { listQuerySchema, type PageResult } from '../../common/query/list-query';
import {
  LOOKUP_RESOURCES,
  LOOKUP_RESOURCE_KEYS,
  isLookupResource,
  type LookupResource,
} from './lookup.registry';
import {
  LookupService,
  lookupInputSchema,
  type LookupInput,
  type LookupRecord,
} from './lookup.service';

const updateSchema = lookupInputSchema.partial();

/**
 * مسیر مشترک فهرست‌های ساده اطلاعات پایه.
 *
 * `:resource` در برابر رجیستری اعتبارسنجی می‌شود، پس نام دلخواه به مدل Prisma نمی‌رسد.
 */
@ApiTags('base-data')
// پیشوند اختصاصی: اگر این controller روی `base-data` می‌نشست، الگوی `:resource`
// مسیرهای ثابتی مثل `base-data/bootstrap` و `base-data/chapters` را می‌بلعید و
// درستی مسیرها به ترتیب ثبت ماژول‌ها وابسته می‌شد — یک وابستگی شکننده.
@Controller('base-data/lookups')
export class LookupController {
  constructor(private readonly lookups: LookupService) {}

  @RequirePermission('base_data:read')
  @Get('resources')
  @ApiOperation({ summary: 'فهرست منابع اطلاعات پایه قابل مدیریت' })
  resources(): Array<{ key: string; titleFa: string }> {
    return LOOKUP_RESOURCE_KEYS.map((key) => ({
      key,
      titleFa: LOOKUP_RESOURCES[key].titleFa,
    }));
  }

  @RequirePermission('base_data:read')
  @Get(':resource')
  @ApiParam({ name: 'resource', enum: LOOKUP_RESOURCE_KEYS })
  @ApiOperation({ summary: 'فهرست موارد یک منبع، با جست‌وجو و صفحه‌بندی سمت سرور' })
  async list(
    @Param('resource') resource: string,
    @Query(new ZodBody(listQuerySchema)) query: ReturnType<typeof listQuerySchema.parse>,
  ): Promise<PageResult<LookupRecord>> {
    return this.lookups.list(assertResource(resource), query);
  }

  @RequirePermission('base_data:read')
  @Get(':resource/:id')
  async get(
    @Param('resource') resource: string,
    @Param('id') id: string,
  ): Promise<LookupRecord> {
    return this.lookups.get(assertResource(resource), id);
  }

  @RequirePermission('base_data:write')
  @Post(':resource')
  @ApiOperation({ summary: 'افزودن مورد جدید' })
  async create(
    @Param('resource') resource: string,
    @Body(new ZodBody(lookupInputSchema)) body: LookupInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LookupRecord> {
    return this.lookups.create(assertResource(resource), body, user.id);
  }

  @RequirePermission('base_data:write')
  @Patch(':resource/:id')
  @ApiOperation({ summary: 'ویرایش یا فعال/غیرفعال کردن' })
  async update(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body(new ZodBody(updateSchema)) body: Partial<LookupInput>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LookupRecord> {
    return this.lookups.update(assertResource(resource), id, body, user.id);
  }

  @RequirePermission('base_data:write')
  @Delete(':resource/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'حذف — فقط اگر در هیچ رکوردی استفاده نشده باشد' })
  async remove(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.lookups.remove(assertResource(resource), id, user.id);
  }
}

function assertResource(value: string): LookupResource {
  if (!isLookupResource(value)) {
    throw AppError.notFound('منبع اطلاعات پایه یافت نشد');
  }
  return value;
}
