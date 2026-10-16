import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from '@dm/shared';

import { PERMISSIONS_KEY, PUBLIC_KEY, READ_ONLY_KEY } from './auth.decorators';
import { AppModule } from '../../app.module';

/**
 * تفکیک وظایف نقش‌ها — معیارهای پذیرش ۱، ۲ و ۳ فاز ۵.
 *
 * این تست‌ها **از روی مسیرهای واقعی** برنامه کار می‌کنند، نه فهرستی دستی: گراف
 * ماژول‌ها پیموده می‌شود، هر مسیر HTTP با متد و مجوزش استخراج می‌شود، و ادعاهای
 * تفکیک وظایف روی همان مجموعه بررسی می‌شوند.
 *
 * ارزش این شکل از تست: اگر فردا کسی مسیر نوشتنی تازه‌ای اضافه کند و مجوزش را
 * اشتباه انتخاب کند — مثلاً مسیری که مبلغ را عوض می‌کند با مجوز `archive:write` —
 * این تست همان‌جا قرمز می‌شود، بدون اینکه کسی یادش بیفتد تستش را به‌روز کند.
 */

type Constructor = new (...args: never[]) => unknown;

interface RouteInfo {
  readonly controller: string;
  readonly method: string;
  /** متد HTTP به شکل عددی Nest: 0=GET, 1=POST, 2=PUT, 3=DELETE, 4=PATCH… */
  readonly httpMethod: number;
  readonly isPublic: boolean;
  /** مسیر POST که عمداً فقط می‌خواند (نشان `@ReadOnlyRoute`). */
  readonly isReadOnly: boolean;
  /** مجوز اعلام نشده؟ `undefined` یعنی فراموش شده، `[]` یعنی «فقط ورود لازم است». */
  readonly permissions: readonly Permission[] | undefined;
}

const HTTP_METHOD_NAMES: Record<number, string> = {
  0: 'GET',
  1: 'POST',
  2: 'PUT',
  3: 'DELETE',
  4: 'PATCH',
  5: 'ALL',
  6: 'OPTIONS',
  7: 'HEAD',
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function collectControllers(): Constructor[] {
  const seen = new Set<unknown>();
  const controllers = new Set<Constructor>();
  const queue: unknown[] = [AppModule];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null || seen.has(current)) continue;
    seen.add(current);

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

function collectRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const controller of collectControllers()) {
    const prototype = controller.prototype as unknown as Record<string, unknown>;
    const names = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== 'constructor' && typeof prototype[name] === 'function',
    );

    for (const name of names) {
      const handler = prototype[name] as object;
      const httpMethod = Reflect.getMetadata('method', handler) as number | undefined;
      if (httpMethod === undefined) continue;

      routes.push({
        controller: controller.name,
        method: name,
        httpMethod,
        isPublic:
          Reflect.getMetadata(PUBLIC_KEY, handler) === true ||
          Reflect.getMetadata(PUBLIC_KEY, controller) === true,
        isReadOnly: Reflect.getMetadata(READ_ONLY_KEY, handler) === true,
        permissions: Reflect.getMetadata(PERMISSIONS_KEY, handler) as Permission[] | undefined,
      });
    }
  }

  return routes;
}

const ROUTES = collectRoutes();

/**
 * «مسیر نوشتنی» یعنی متد HTTP ناامن **و** بدون نشان `@ReadOnlyRoute`.
 * بررسی تکراری بودن فروشنده یک POST است ولی چیزی نمی‌نویسد.
 */
const UNSAFE_ROUTES = ROUTES.filter(
  (route) => !SAFE_METHODS.has(HTTP_METHOD_NAMES[route.httpMethod] ?? 'GET') && !route.isReadOnly,
);

/** مسیری که کاربر با این مجموعه مجوز می‌تواند صدا بزند. */
function canCall(route: RouteInfo, permissions: readonly Permission[]): boolean {
  if (route.isPublic) return true;
  if (route.permissions === undefined) return false; // نگهبان fail-closed
  // فهرست خالی یعنی «فقط ورود لازم است» — هر کاربر واردشده‌ای می‌تواند.
  return route.permissions.every((permission) => permissions.includes(permission));
}

describe('تفکیک وظایف نقش‌ها روی مسیرهای واقعی', () => {
  it('خود تست سالم است: مسیرهای نوشتنی کشف شده‌اند', () => {
    expect(UNSAFE_ROUTES.length).toBeGreaterThan(15);
    // ورود و خروج عمومی‌اند و نوشتنی؛ وجودشان نشانه درست کار کردن استخراج است.
    expect(UNSAFE_ROUTES.some((route) => route.isPublic)).toBe(true);
  });

  /**
   * معیار پذیرش ۱: ناظر روی **هر** مسیر نوشتنی ۴۰۳ می‌گیرد.
   *
   * دو استثنای عمدی: ثبت بازخورد و ارجاع برای اصلاح — که اصلاً کار ناظرند. هر مسیر
   * نوشتنی دیگری که ناظر بتواند صدا بزند، یک اشتباه است.
   */
  it('ناظر هیچ مسیر نوشتنی‌ای جز ثبت بازخورد و ارجاع برای اصلاح ندارد', () => {
    const supervisor = DEFAULT_ROLE_PERMISSIONS.SUPERVISOR;

    const allowed = UNSAFE_ROUTES.filter(
      (route) => !route.isPublic && canCall(route, supervisor),
    ).map((route) => `${route.controller}.${route.method}`);

    expect(allowed.sort()).toEqual([
      // خروج از نشست‌های خود کاربر و خواندن اعلان‌های خودش، کار هر کاربر واردشده است.
      'AuthController.logoutAll',
      'DocumentsController.sendBack',
      'FeedbackController.create',
      'NotificationsController.markAllRead',
      'NotificationsController.markRead',
    ]);
  });

  /**
   * معیار پذیرش ۲: بایگانی نمی‌تواند هیچ مبلغی را تغییر دهد.
   *
   * به‌جای تست رفتاری روی یک مسیر، همه مسیرهای نوشتنی‌ای که بایگانی می‌تواند صدا
   * بزند فهرست می‌شوند؛ اگر مسیری که مبلغ را لمس می‌کند در این فهرست ظاهر شود، تست
   * می‌شکند.
   */
  it('بایگانی فقط مسیرهای بایگانی، فایل و اعلان را دارد — هیچ مسیر مالی', () => {
    const archivist = DEFAULT_ROLE_PERMISSIONS.ARCHIVIST;

    const allowed = UNSAFE_ROUTES.filter(
      (route) => !route.isPublic && canCall(route, archivist),
    ).map((route) => `${route.controller}.${route.method}`);

    expect(allowed.sort()).toEqual([
      'ArchiveController.complete',
      'ArchiveController.saveInfo',
      'AttachmentsController.remove',
      'AttachmentsController.upload',
      'AuthController.logoutAll',
      'NotificationsController.markAllRead',
      'NotificationsController.markRead',
    ]);

    // و صریحاً: هیچ‌کدام از مجوزهای مالی را ندارد.
    for (const financial of [
      'document:update',
      'document:create',
      'document:finalize',
      'invoice:create',
      'invoice:update',
      'invoice:delete',
      'financial_settings:write',
    ] as Permission[]) {
      expect(archivist, `بایگانی نباید ${financial} داشته باشد`).not.toContain(financial);
    }
  });

  /** معیار پذیرش ۳: کارپردازی نمی‌تواند بازخورد ثبت کند. */
  it('کارپردازی مجوز ثبت بازخورد و ارجاع برای اصلاح را ندارد', () => {
    const procurement = DEFAULT_ROLE_PERMISSIONS.PROCUREMENT;

    expect(procurement).not.toContain('feedback:create');

    const createFeedback = UNSAFE_ROUTES.find(
      (route) => route.controller === 'FeedbackController' && route.method === 'create',
    );
    expect(createFeedback, 'مسیر ثبت بازخورد پیدا نشد').toBeDefined();
    expect(canCall(createFeedback as RouteInfo, procurement)).toBe(false);

    // ولی پاسخ دادن و رسیدگی کار اوست.
    const reply = UNSAFE_ROUTES.find(
      (route) => route.controller === 'FeedbackController' && route.method === 'reply',
    );
    expect(canCall(reply as RouteInfo, procurement)).toBe(true);
  });

  it('کارپردازی مجوز آپلود و حذف فایل ندارد — تفکیک وظایف بایگانی', () => {
    const procurement = DEFAULT_ROLE_PERMISSIONS.PROCUREMENT;

    expect(procurement).not.toContain('attachment:upload');
    expect(procurement).not.toContain('attachment:delete');
    expect(procurement).not.toContain('archive:write');

    // ولی می‌تواند فایل‌ها را ببیند و دانلود کند.
    expect(procurement).toContain('attachment:read');
  });

  it('هیچ مسیر نوشتنی‌ای بدون اعلام دسترسی نیست', () => {
    const undeclared = UNSAFE_ROUTES.filter(
      (route) => !route.isPublic && route.permissions === undefined,
    ).map((route) => `${route.controller}.${route.method}`);

    expect(undeclared).toEqual([]);
  });

  it('مسیرهای «فقط ورود لازم است» صریح و محدودند', () => {
    const authenticatedOnly = ROUTES.filter(
      (route) => !route.isPublic && route.permissions?.length === 0,
    )
      .map((route) => `${route.controller}.${route.method}`)
      .sort();

    // هر افزوده‌ای به این فهرست باید یک تصمیم آگاهانه باشد، نه نتیجه فراموشی.
    expect(authenticatedOnly).toEqual(['AuthController.logoutAll', 'AuthController.me']);
  });

  it('نشان «فقط خواندنی» فقط روی مسیرهای جست‌وجوی فروشنده است', () => {
    const readOnly = ROUTES.filter((route) => route.isReadOnly)
      .map((route) => `${route.controller}.${route.method}`)
      .sort();

    expect(readOnly).toEqual([
      'VendorsController.checkDuplicate',
      'VendorsController.validateIbanEndpoint',
    ]);
  });

  it('مسیرهای عمومی نوشتنی فقط ورود و خروج‌اند', () => {
    const publicUnsafe = UNSAFE_ROUTES.filter((route) => route.isPublic)
      .map((route) => `${route.controller}.${route.method}`)
      .sort();

    expect(publicUnsafe).toEqual(['AuthController.login', 'AuthController.logout']);
  });
});
