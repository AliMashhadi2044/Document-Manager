import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@dm/shared';

import { AppError } from '../errors/app-error';
import { PERMISSIONS_KEY, PUBLIC_KEY, type AuthenticatedUser } from './auth.decorators';

/**
 * لایه ۲ — مجوز.
 *
 * نکته مهم: endpoint **بدون اعلام مجوز** رد می‌شود (fail closed). اگر توسعه‌دهنده
 * `@RequirePermission` را فراموش کند، مسیر باز نمی‌ماند بلکه بسته می‌شود.
 * یک تست خودکار هم همین را در CI تضمین می‌کند.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required === undefined) {
      throw AppError.forbidden('این مسیر مجوز اعلام‌شده ندارد');
    }

    if (required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw AppError.unauthorized();
    }

    const granted = required.every((permission) => user.permissions.includes(permission));
    if (!granted) {
      throw AppError.forbidden();
    }

    return true;
  }
}
