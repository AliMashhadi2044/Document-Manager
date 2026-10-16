import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@dm/shared';

import { AppError } from '../errors/app-error';

export const PERMISSIONS_KEY = 'required_permissions';
export const PUBLIC_KEY = 'is_public';
export const READ_ONLY_KEY = 'is_read_only_route';

/**
 * اعلام مجوز لازم یک endpoint.
 *
 * هر مسیر باید یا `@RequirePermission(...)` داشته باشد یا صریحاً `@Public()`.
 * یک تست خودکار در CI هر مسیر بدون اعلام را fail می‌کند، تا endpoint فراموش‌شده
 * ممکن نباشد (docs/06-roles-permissions.md §۴).
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * مسیر فقط نیازمند **ورود**، بدون مجوز خاص (مثل خروج از همه دستگاه‌ها).
 *
 * معادل `@RequirePermission()` بدون آرگومان است، ولی نیت را صریح می‌کند: «عمداً بدون
 * مجوز» در برابر «مجوزش یادم رفت». تست‌های پوشش دسترسی به همین تفاوت تکیه می‌کنند.
 */
export const Authenticated = () => SetMetadata(PERMISSIONS_KEY, []);

/** مسیر عمومی و بدون نیاز به نشست (مثل ورود و health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * مسیر POST که **هیچ چیزی را تغییر نمی‌دهد**.
 *
 * چند مسیر خواندنی ناچارند POST باشند، چون ورودی‌شان داده هویتی است و داده حساس در
 * URL ممنوع است (مثل بررسی تکراری بودن فروشنده یا اعتبارسنجی شبا). بدون این نشان،
 * تست تفکیک وظایف آن‌ها را «مسیر نوشتنی» می‌شمارد و هشدار دروغ می‌دهد.
 *
 * گذاشتن این نشان روی مسیری که واقعاً می‌نویسد، یعنی خاموش کردن یک کنترل امنیتی؛
 * پس فقط جایی استفاده می‌شود که بدنه متد هیچ نوشتنی ندارد.
 */
export const ReadOnlyRoute = () => SetMetadata(READ_ONLY_KEY, true);

export interface AuthenticatedUser {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly roles: readonly string[];
  readonly permissions: readonly Permission[];
  readonly sessionId: string;
}

/** خواندن کاربر جاری از نشست سروری. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      throw AppError.unauthorized();
    }
    return request.user;
  },
);
