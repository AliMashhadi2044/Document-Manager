import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PASSWORD_MAX_LENGTH,
  PERMISSIONS,
  ROLE_KEYS,
  type Permission,
  type RoleKey,
} from '@dm/shared';
import { z } from 'zod';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { AppError } from '../../common/errors/app-error';
import { listQuerySchema } from '../../common/query/list-query';
import { UsersService, type RoleRow, type UserRow } from './users.service';
import type { PageResult } from '../../common/query/list-query';

/**
 * مدیریت کاربران.
 *
 * همهٔ مسیرها `user:read` یا `user:write` می‌خواهند — یعنی فقط نقش «مدیر سامانه».
 * ویرایش دسترسی نقش‌ها مجوز جداگانهٔ `role:write` دارد: دادن نقش به یک کاربر و
 * عوض کردن معنای خودِ نقش، دو کار هم‌وزن نیستند.
 *
 * رمز عبور فقط **ورودی** است: هیچ مسیری رمز یا هشش را برنمی‌گرداند و سیاستش در
 * `@dm/shared` نوشته شده تا رابط همان قاعده را نشان دهد که سرور اعمال می‌کند.
 */

const roleKeysSchema = z
  .array(z.enum(ROLE_KEYS))
  .min(1, 'دست‌کم یک نقش انتخاب کنید')
  .max(ROLE_KEYS.length);

/*
  رمز اینجا فقط **طول بیشینه** می‌گیرد.

  قاعدهٔ واقعی در `passwordPolicyIssue` است و پیامش فارسی و مشخص؛ اگر همان قاعده
  اینجا هم تکرار می‌شد، دو جا می‌شد که باید هم‌زمان عوض شوند.
*/
const passwordSchema = z.string().min(1, 'رمز عبور الزامی است').max(PASSWORD_MAX_LENGTH);

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'نام کاربری باید دست‌کم ۳ نویسه باشد')
    .max(100)
    // نام کاربری در URL و لاگ می‌نشیند؛ نویسهٔ آزاد در آن دردسر است، نه امکان.
    .regex(/^[A-Za-z0-9._-]+$/u, 'نام کاربری فقط حروف لاتین، رقم، نقطه، خط تیره و زیرخط'),
  fullName: z.string().trim().min(1, 'نام و نام خانوادگی الزامی است').max(200),
  password: passwordSchema,
  roles: roleKeysSchema,
  isActive: z.boolean().default(true),
});

const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1, 'نام و نام خانوادگی الزامی است').max(200).optional(),
    isActive: z.boolean().optional(),
    roles: roleKeysSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'چیزی برای تغییر فرستاده نشد' });

const passwordBodySchema = z.object({ password: passwordSchema });

const rolePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
});

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermission('user:read')
  @Get()
  @ApiOperation({ summary: 'فهرست کاربران' })
  list(
    @Query(new ZodBody(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ): Promise<PageResult<UserRow>> {
    return this.users.list(query);
  }

  /*
    `roles` پیش از `:id` می‌آید، وگرنه «roles» به‌عنوان شناسهٔ یک کاربر خوانده
    می‌شد و کاربر «کاربر یافت نشد» می‌گرفت.
  */
  @RequirePermission('user:read')
  @Get('roles')
  @ApiOperation({ summary: 'نقش‌ها، تعداد کاربران و دسترسی‌هایشان' })
  roles(): Promise<readonly RoleRow[]> {
    return this.users.roles();
  }

  @RequirePermission('user:write')
  @Post()
  @ApiOperation({ summary: 'ساخت کاربر' })
  create(
    @Body(new ZodBody(createUserSchema)) body: z.infer<typeof createUserSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserRow> {
    return this.users.create(
      {
        username: body.username,
        fullName: body.fullName,
        password: body.password,
        roles: body.roles as readonly RoleKey[],
        isActive: body.isActive,
      },
      user.id,
    );
  }

  @RequirePermission('user:write')
  @Patch(':id')
  @ApiOperation({ summary: 'اصلاح نام، وضعیت یا نقش‌های کاربر' })
  update(
    @Param('id') id: string,
    @Body(new ZodBody(updateUserSchema)) body: z.infer<typeof updateUserSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserRow> {
    return this.users.update(
      id,
      {
        fullName: body.fullName,
        isActive: body.isActive,
        roles: body.roles as readonly RoleKey[] | undefined,
      },
      user.id,
    );
  }

  @RequirePermission('user:write')
  @Post(':id/password')
  @ApiOperation({ summary: 'بازنشانی رمز عبور کاربر' })
  resetPassword(
    @Param('id') id: string,
    @Body(new ZodBody(passwordBodySchema)) body: z.infer<typeof passwordBodySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ revoked: number }> {
    return this.users.resetPassword(id, body.password, user.id);
  }

  @RequirePermission('user:write')
  @Post(':id/unlock')
  @ApiOperation({ summary: 'باز کردن قفل حساب' })
  unlock(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<UserRow> {
    return this.users.unlock(id, user.id);
  }

  @RequirePermission('user:write')
  @Post(':id/revoke-sessions')
  @ApiOperation({ summary: 'بستن همهٔ نشست‌های کاربر' })
  revokeSessions(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ revoked: number }> {
    return this.users.revokeSessions(id, user.id);
  }

  @RequirePermission('role:write')
  @Put('roles/:key/permissions')
  @ApiOperation({ summary: 'جایگزینی دسترسی‌های یک نقش' })
  setRolePermissions(
    @Param('key') key: string,
    @Body(new ZodBody(rolePermissionsSchema)) body: z.infer<typeof rolePermissionsSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RoleRow> {
    const roleKey = ROLE_KEYS.find((candidate) => candidate === key);
    if (!roleKey) throw AppError.notFound('نقش یافت نشد');
    return this.users.setRolePermissions(
      roleKey,
      body.permissions as readonly Permission[],
      user.id,
    );
  }
}
