import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ROLE_KEYS,
  passwordPolicyIssue,
  type Permission,
  type RoleKey,
} from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import {
  orderByArg,
  paginationArgs,
  toPageResult,
  type ListQuery,
  type PageResult,
} from '../../common/query/list-query';

/**
 * مدیریت کاربران و دسترسی نقش‌ها.
 *
 * تا پیش از این کاربر فقط از راه `seed` ساخته می‌شد: مدیر سامانه برای افزودن یک
 * کارپرداز تازه باید به سرور دسترسی خط فرمان می‌داشت. مجوزهای `user:read`،
 * `user:write` و `role:write` از روز اول در فهرست بودند و هیچ مسیری نداشتند.
 *
 * چهار قاعده که کل این سرویس را شکل می‌دهد:
 *
 *  ۱. **رمز هرگز برنمی‌گردد و هرگز لاگ نمی‌شود.** فقط هش argon2id ذخیره می‌شود و
 *     `select` هر پرس‌وجو صریح است؛ هیچ مسیری شیء کامل کاربر را بیرون نمی‌دهد.
 *  ۲. **مدیر، خودش را قفل نمی‌کند.** غیرفعال کردن حساب خود و تغییر نقش‌های خود
 *     بسته است، و هیچ تغییری نمی‌تواند سامانه را بی‌مدیرِ فعال بگذارد.
 *  ۳. **تغییر دسترسی اثر فوری دارد.** نشست در هر درخواست نقش‌ها و مجوزها را از
 *     دیتابیس می‌خواند، پس عوض کردن نقش لازم نیست منتظر ورود بعدی بماند؛ ولی
 *     بازنشانی رمز و غیرفعال‌سازی، نشست‌ها را **می‌بندد**.
 *  ۴. **نقش‌ها ساخته و حذف نمی‌شوند، فقط دسترسی‌شان عوض می‌شود.** کلید نقش در کد
 *     تایپ شده است (`RoleKey`) و جاهای دیگر سامانه رویش حساب می‌کنند.
 */

/** فیلدهایی که از کاربر بیرون می‌روند — `passwordHash` عمداً نیست. */
const USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  isActive: true,
  lastLoginAt: true,
  lockedUntil: true,
  failedLoginCount: true,
  createdAt: true,
  roles: { select: { role: { select: { key: true, titleFa: true } } } },
} satisfies Prisma.UserSelect;

const SORTABLE = ['username', 'fullName', 'createdAt', 'lastLoginAt'] as const;

export interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly isActive: boolean;
  readonly lastLoginAt: Date | null;
  /** قفل فعال است یا نه — تاریخِ گذشته، قفل نیست. */
  readonly isLocked: boolean;
  readonly lockedUntil: Date | null;
  readonly failedLoginCount: number;
  readonly createdAt: Date;
  readonly roles: readonly RoleKey[];
}

export interface CreateUserInput {
  readonly username: string;
  readonly fullName: string;
  readonly password: string;
  readonly roles: readonly RoleKey[];
  readonly isActive: boolean;
}

export interface UpdateUserInput {
  readonly fullName?: string | undefined;
  readonly isActive?: boolean | undefined;
  readonly roles?: readonly RoleKey[] | undefined;
}

export interface RoleRow {
  readonly key: RoleKey;
  readonly titleFa: string;
  readonly isSystem: boolean;
  readonly userCount: number;
  readonly permissions: readonly Permission[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  async list(query: ListQuery): Promise<PageResult<UserRow>> {
    const where: Prisma.UserWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: orderByArg(query, SORTABLE, [{ username: 'asc' }]),
        ...paginationArgs(query),
      }),
      this.prisma.user.count({ where }),
    ]);

    return toPageResult(items.map(toRow), total, query);
  }

  async roles(): Promise<readonly RoleRow[]> {
    const roles = await this.prisma.role.findMany({
      select: {
        key: true,
        titleFa: true,
        isSystem: true,
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
      orderBy: { key: 'asc' },
    });

    return roles.map((role) => ({
      key: role.key as RoleKey,
      titleFa: role.titleFa,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissions: role.permissions.map((link) => link.permission.key as Permission),
    }));
  }

  async create(input: CreateUserInput, actorId: string): Promise<UserRow> {
    const issue = passwordPolicyIssue(input.password);
    if (issue) throw AppError.validation(issue, [{ path: 'password', message: issue }]);

    const username = input.username.toLowerCase();
    const duplicate = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (duplicate) {
      throw AppError.conflict('USERNAME_TAKEN', 'این نام کاربری قبلاً ثبت شده است');
    }

    const roleIds = await this.resolveRoles(input.roles);
    const passwordHash = await AuthService.hashPassword(input.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          fullName: input.fullName,
          passwordHash,
          isActive: input.isActive,
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
        select: USER_SELECT,
      });

      await this.audit.record(
        {
          actorId,
          action: 'USER_CREATE',
          entityType: 'user',
          entityId: user.id,
          // `after` فقط چیزهای غیرحساس — رمز و هشش هیچ‌جا ثبت نمی‌شوند.
          after: {
            username: user.username,
            fullName: user.fullName,
            isActive: user.isActive,
            roles: user.roles.map((link) => link.role.key),
          },
        },
        tx,
      );

      return user;
    });

    return toRow(created);
  }

  async update(id: string, input: UpdateUserInput, actorId: string): Promise<UserRow> {
    const before = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!before) throw AppError.notFound('کاربر یافت نشد');

    /*
      حساب خودِ مدیر: نه غیرفعال می‌شود و نه نقشش عوض.

      کسی که به اشتباه نقش «مدیر سامانه» را از خودش بردارد، همان لحظه از این صفحه
      بیرون می‌افتد و راهی برای برگشتن ندارد جز دسترسی به خط فرمان سرور. این
      محدودیت در سرور است و نه فقط پنهان کردن یک دکمه.
    */
    if (id === actorId) {
      if (input.isActive === false) {
        throw AppError.conflict(
          'SELF_DEACTIVATE',
          'نمی‌توانید حساب خودتان را غیرفعال کنید. از مدیر سامانهٔ دیگری بخواهید.',
        );
      }
      if (input.roles !== undefined) {
        throw AppError.conflict(
          'SELF_ROLE_CHANGE',
          'نقش‌های حساب خودتان را از همین‌جا نمی‌توانید عوض کنید. از مدیر سامانهٔ دیگری بخواهید.',
        );
      }
    }

    const roleIds = input.roles === undefined ? null : await this.resolveRoles(input.roles);

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(roleIds === null
            ? {}
            : { roles: { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) } }),
        },
        select: USER_SELECT,
      });

      await assertAdminRemains(tx);

      await this.audit.record(
        {
          actorId,
          action: 'USER_UPDATE',
          entityType: 'user',
          entityId: id,
          before: snapshot(before),
          after: snapshot(user),
        },
        tx,
      );

      return user;
    });

    // کاربر غیرفعال، نشستش باید همین حالا بسته شود و نه در درخواست بعدی‌اش.
    if (input.isActive === false) await this.sessions.revokeAllForUser(id);

    return toRow(updated);
  }

  /** بازنشانی رمز توسط مدیر — رمز قدیمی لازم نیست و نشست‌ها بسته می‌شوند. */
  async resetPassword(id: string, password: string, actorId: string): Promise<{ revoked: number }> {
    const issue = passwordPolicyIssue(password);
    if (issue) throw AppError.validation(issue, [{ path: 'password', message: issue }]);

    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw AppError.notFound('کاربر یافت نشد');

    const passwordHash = await AuthService.hashPassword(password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });

      // نه `before` و نه `after`: رمز و هشش داده‌ای نیستند که در حسابرسی بنشینند.
      await this.audit.record(
        { actorId, action: 'USER_PASSWORD_RESET', entityType: 'user', entityId: id },
        tx,
      );
    });

    /*
      نشست‌های باز بسته می‌شوند.

      رمز را وقتی عوض می‌کنند که احتمال لو رفتنش هست؛ نشستی که با رمز قبلی باز
      شده، با عوض شدن رمز خودبه‌خود باطل نمی‌شود — نشست به رمز گره نخورده است.
    */
    const revoked = await this.sessions.revokeAllForUser(id);
    return { revoked };
  }

  /** باز کردن قفلِ ناشی از تلاش‌های ناموفق. */
  async unlock(id: string, actorId: string): Promise<UserRow> {
    const before = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!before) throw AppError.notFound('کاربر یافت نشد');

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { failedLoginCount: 0, lockedUntil: null },
        select: USER_SELECT,
      });

      await this.audit.record(
        { actorId, action: 'USER_UNLOCK', entityType: 'user', entityId: id },
        tx,
      );

      return user;
    });

    return toRow(updated);
  }

  /** بستن همهٔ نشست‌های یک کاربر، بدون عوض کردن رمزش. */
  async revokeSessions(id: string, actorId: string): Promise<{ revoked: number }> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw AppError.notFound('کاربر یافت نشد');

    const revoked = await this.sessions.revokeAllForUser(id);
    await this.audit.record({
      actorId,
      action: 'USER_SESSIONS_REVOKE',
      entityType: 'user',
      entityId: id,
      after: { revoked },
    });

    return { revoked };
  }

  /**
   * دسترسی‌های یک نقش.
   *
   * تخصیص مجوز به نقش **داده** است و نه کد (`permissions.ts`): فهرست مجوزها در کد
   * تایپ شده تا بازبینی‌شدنی باشد، ولی اینکه هر نقش کدامشان را دارد از همین‌جا
   * عوض می‌شود. فهرست به‌طور کامل جایگزین می‌شود تا «برداشتن» هم ممکن باشد.
   */
  async setRolePermissions(
    key: RoleKey,
    permissions: readonly Permission[],
    actorId: string,
  ): Promise<RoleRow> {
    const role = await this.prisma.role.findUnique({
      where: { key },
      select: {
        id: true,
        key: true,
        titleFa: true,
        isSystem: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });
    if (!role) throw AppError.notFound('نقش یافت نشد');

    const rows = await this.prisma.permission.findMany({
      where: { key: { in: [...permissions] } },
      select: { id: true, key: true },
    });
    if (rows.length !== new Set(permissions).size) {
      throw AppError.validation('یکی از مجوزهای انتخاب‌شده شناخته نشد');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (rows.length > 0) {
        await tx.rolePermission.createMany({
          data: rows.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        });
      }

      await assertAdminRemains(tx);

      await this.audit.record(
        {
          actorId,
          action: 'ROLE_PERMISSIONS_UPDATE',
          entityType: 'role',
          entityId: role.id,
          before: { permissions: role.permissions.map((link) => link.permission.key).sort() },
          after: { permissions: rows.map((permission) => permission.key).sort() },
        },
        tx,
      );

      return tx.role.findUniqueOrThrow({
        where: { id: role.id },
        select: {
          key: true,
          titleFa: true,
          isSystem: true,
          permissions: { select: { permission: { select: { key: true } } } },
          _count: { select: { users: true } },
        },
      });
    });

    return {
      key: updated.key as RoleKey,
      titleFa: updated.titleFa,
      isSystem: updated.isSystem,
      userCount: updated._count.users,
      permissions: updated.permissions.map((link) => link.permission.key as Permission),
    };
  }

  /** شناسهٔ نقش‌ها، با رد کردن کلید ناشناس پیش از هر نوشتنی. */
  private async resolveRoles(roles: readonly RoleKey[]): Promise<readonly string[]> {
    const unique = [...new Set(roles)];
    if (unique.length === 0) {
      throw AppError.validation('دست‌کم یک نقش انتخاب کنید', [
        { path: 'roles', message: 'دست‌کم یک نقش انتخاب کنید' },
      ]);
    }
    for (const role of unique) {
      if (!(ROLE_KEYS as readonly string[]).includes(role)) {
        throw AppError.validation('نقش انتخاب‌شده معتبر نیست');
      }
    }

    const rows = await this.prisma.role.findMany({
      where: { key: { in: unique } },
      select: { id: true },
    });
    if (rows.length !== unique.length) throw AppError.notFound('نقش انتخاب‌شده یافت نشد');

    return rows.map((row) => row.id);
  }
}

/**
 * سامانه بی‌مدیرِ فعال نمی‌ماند.
 *
 * یک درِ پشتی لازم است و همین است: اگر هیچ کاربر فعالی مجوز `user:write` نداشته
 * باشد، هیچ‌کس دیگر نمی‌تواند کاربری بسازد یا نقشی بدهد — تنها راه، دسترسی خط
 * فرمان به دیتابیس است. پس **داخل همان تراکنش** بررسی می‌شود و تغییر برمی‌گردد.
 *
 * دو راه به این حالت می‌رسد و هر دو بسته‌اند: برداشتن نقش از آخرین مدیر، و
 * برداشتن مجوز `user:write` از نقشِ آخرین مدیر.
 */
async function assertAdminRemains(tx: Prisma.TransactionClient): Promise<void> {
  const admins = await tx.user.count({
    where: {
      isActive: true,
      roles: {
        some: { role: { permissions: { some: { permission: { key: 'user:write' } } } } },
      },
    },
  });

  if (admins === 0) {
    throw AppError.conflict(
      'NO_ADMIN_LEFT',
      'با این تغییر هیچ کاربر فعالی مجوز مدیریت کاربران نداشت و سامانه بی‌مدیر می‌ماند.',
    );
  }
}

type UserRecord = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toRow(user: UserRecord): UserRow {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    lockedUntil: user.lockedUntil,
    isLocked: user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now(),
    failedLoginCount: user.failedLoginCount,
    createdAt: user.createdAt,
    roles: user.roles.map((link) => link.role.key as RoleKey),
  };
}

/** تصویرِ حسابرسی — فقط فیلدهایی که تغییرشان معنا دارد. */
function snapshot(user: UserRecord): Record<string, unknown> {
  return {
    username: user.username,
    fullName: user.fullName,
    isActive: user.isActive,
    roles: user.roles.map((link) => link.role.key).sort(),
  };
}
