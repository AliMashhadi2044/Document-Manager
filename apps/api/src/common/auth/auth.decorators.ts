import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@dm/shared';

import { AppError } from '../errors/app-error';

export const PERMISSIONS_KEY = 'required_permissions';
export const PUBLIC_KEY = 'is_public';

/**
 * اعلام مجوز لازم یک endpoint.
 *
 * هر مسیر باید یا `@RequirePermission(...)` داشته باشد یا صریحاً `@Public()`.
 * یک تست خودکار در CI هر مسیر بدون اعلام را fail می‌کند، تا endpoint فراموش‌شده
 * ممکن نباشد (docs/06-roles-permissions.md §۴).
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** مسیر عمومی و بدون نیاز به نشست (مثل ورود و health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

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
