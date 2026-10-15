import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, type Permission } from '@dm/shared';

import { PERMISSIONS_KEY, PUBLIC_KEY } from './auth.decorators';
import { AuthController } from '../../modules/auth/auth.controller';
import { HealthController } from '../../modules/health/health.controller';

/**
 * معیار پذیرش فاز ۱: **هیچ endpoint بدون اعلام دسترسی وجود ندارد.**
 *
 * این تست هر متد هر controller را بازرسی می‌کند. مسیر باید یا `@RequirePermission(...)`
 * داشته باشد یا صریحاً `@Public()`. فراموش کردن هر دو، اینجا fail می‌شود — پس
 * endpoint محافظت‌نشده نمی‌تواند وارد مخزن شود.
 *
 * `PermissionGuard` هم در زمان اجرا همین را fail closed می‌کند؛ این تست خطا را به
 * زمان CI جلو می‌آورد.
 */

const CONTROLLERS = [AuthController, HealthController];

interface RouteInfo {
  readonly controller: string;
  readonly method: string;
  readonly isPublic: boolean;
  readonly permissions: Permission[] | undefined;
}

function collectRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const controller of CONTROLLERS) {
    const prototype = controller.prototype as Record<string, unknown>;
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== 'constructor' && typeof prototype[name] === 'function',
    );

    for (const name of methodNames) {
      const handler = prototype[name] as object;

      // فقط متدهایی که واقعاً مسیر HTTP هستند.
      const httpMethod = Reflect.getMetadata('method', handler);
      if (httpMethod === undefined) continue;

      routes.push({
        controller: controller.name,
        method: name,
        isPublic:
          Reflect.getMetadata(PUBLIC_KEY, handler) === true ||
          Reflect.getMetadata(PUBLIC_KEY, controller) === true,
        permissions: Reflect.getMetadata(PERMISSIONS_KEY, handler) as Permission[] | undefined,
      });
    }
  }

  return routes;
}

describe('پوشش مجوز endpointها', () => {
  const routes = collectRoutes();

  it('حداقل یک مسیر کشف شده است (خود تست سالم است)', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it('هر مسیر یا مجوز اعلام‌شده دارد یا صریحاً عمومی است', () => {
    const undeclared = routes.filter((route) => !route.isPublic && route.permissions === undefined);

    expect(
      undeclared.map((route) => `${route.controller}.${route.method}`),
      'این مسیرها نه @RequirePermission دارند و نه @Public',
    ).toEqual([]);
  });

  it('مجوزهای اعلام‌شده همگی در فهرست معتبر مجوزها هستند', () => {
    const invalid: string[] = [];

    for (const route of routes) {
      for (const permission of route.permissions ?? []) {
        if (!(PERMISSIONS as readonly string[]).includes(permission)) {
          invalid.push(`${route.controller}.${route.method} → ${permission}`);
        }
      }
    }

    expect(invalid).toEqual([]);
  });

  it('مسیرهای عمومی عمدی و محدود هستند', () => {
    const publicRoutes = routes
      .filter((route) => route.isPublic)
      .map((route) => `${route.controller}.${route.method}`)
      .sort();

    // فهرست سفید صریح: افزودن مسیر عمومی جدید باید یک تصمیم آگاهانه باشد.
    expect(publicRoutes).toEqual([
      'AuthController.login',
      'AuthController.logout',
      'HealthController.live',
      'HealthController.ready',
    ]);
  });
});
