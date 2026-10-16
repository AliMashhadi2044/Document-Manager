import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, type Permission } from '@dm/shared';

import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY, PUBLIC_KEY } from './auth.decorators';
import { AppModule } from '../../app.module';

/**
 * معیار پذیرش فاز ۱: **هیچ endpoint بدون اعلام دسترسی وجود ندارد.**
 *
 * این تست هر متد هر controller را بازرسی می‌کند. مسیر باید یا `@RequirePermission(...)`
 * داشته باشد یا صریحاً `@Public()`. فراموش کردن هر دو، اینجا fail می‌شود — پس
 * endpoint محافظت‌نشده نمی‌تواند وارد مخزن شود.
 *
 * `PermissionGuard` هم در زمان اجرا همین را fail closed می‌کند؛ این تست خطا را به
 * زمان CI جلو می‌آورد.
 *
 * فهرست controllerها **از گراف ماژول‌ها** خوانده می‌شود، نه از فهرستی دستی در همین
 * فایل. فهرست دستی یعنی اولین controller فراموش‌شده، بی‌صدا از این تست بیرون می‌ماند —
 * دقیقاً همان چیزی که این تست باید جلویش را بگیرد.
 */

type Constructor = new (...args: never[]) => unknown;

/** پیمایش بازگشتی `imports` و `controllers` ماژول ریشه. */
function collectControllers(): Constructor[] {
  const seenModules = new Set<unknown>();
  const controllers = new Set<Constructor>();
  const queue: unknown[] = [AppModule];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null || seenModules.has(current)) continue;
    seenModules.add(current);

    // ماژول‌های پویا (`ConfigModule.forRoot(...)`) شکل `{ module, imports, controllers }` دارند.
    const target =
      typeof current === 'object' && current !== null && 'module' in current
        ? (current as { module: unknown }).module
        : current;
    if (typeof target !== 'function') continue;

    for (const controller of (Reflect.getMetadata('controllers', target) ?? []) as Constructor[]) {
      controllers.add(controller);
    }
    for (const imported of (Reflect.getMetadata('imports', target) ?? []) as unknown[]) {
      queue.push(imported);
    }
  }

  return [...controllers];
}

const CONTROLLERS = collectControllers();

interface RouteInfo {
  readonly controller: string;
  readonly method: string;
  readonly isPublic: boolean;
  readonly permissions: Permission[] | undefined;
  /** مجوزهای «یکی از این‌ها» — نشان `@RequireAnyPermission`. */
  readonly anyPermissions: Permission[] | undefined;
}

function collectRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const controller of CONTROLLERS) {
    const prototype = controller.prototype as unknown as Record<string, unknown>;
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
        anyPermissions: Reflect.getMetadata(ANY_PERMISSIONS_KEY, handler) as
          | Permission[]
          | undefined,
      });
    }
  }

  return routes;
}

describe('پوشش مجوز endpointها', () => {
  const routes = collectRoutes();

  it('خود تست سالم است: controllerها و مسیرها کشف شده‌اند', () => {
    // اگر پیمایش گراف ماژول بشکند، این تست سبز نمی‌ماند تا بقیه بی‌معنا سبز شوند.
    expect(CONTROLLERS.length).toBeGreaterThanOrEqual(9);
    expect(routes.length).toBeGreaterThan(20);
  });

  it('هر مسیر یا مجوز اعلام‌شده دارد یا صریحاً عمومی است', () => {
    const undeclared = routes.filter(
      (route) =>
        !route.isPublic && route.permissions === undefined && route.anyPermissions === undefined,
    );

    expect(
      undeclared.map((route) => `${route.controller}.${route.method}`),
      'این مسیرها نه @RequirePermission دارند و نه @Public',
    ).toEqual([]);
  });

  it('مجوزهای اعلام‌شده همگی در فهرست معتبر مجوزها هستند', () => {
    const invalid: string[] = [];

    for (const route of routes) {
      for (const permission of [...(route.permissions ?? []), ...(route.anyPermissions ?? [])]) {
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

  it('نشان «یکی از این مجوزها» هرگز با فهرست خالی به کار نرفته است', () => {
    // فهرست خالی در نگهبان یعنی «هیچ‌کس»؛ اگر جایی سهواً خالی بماند، مسیر برای همه
    // بسته می‌شود و این شکل از خرابی در زمان اجرا دیر پیدا می‌شود.
    const emptyAny = routes
      .filter((route) => route.anyPermissions?.length === 0)
      .map((route) => `${route.controller}.${route.method}`);

    expect(emptyAny).toEqual([]);
  });
});
