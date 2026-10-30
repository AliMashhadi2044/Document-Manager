import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from '@dm/shared';

import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
  PUBLIC_KEY,
  READ_ONLY_KEY,
} from './auth.decorators';
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
  /** مجوزهای «یکی از این‌ها» — نشان `@RequireAnyPermission`. */
  readonly anyPermissions: readonly Permission[] | undefined;
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
        anyPermissions: Reflect.getMetadata(ANY_PERMISSIONS_KEY, handler) as
          | Permission[]
          | undefined,
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
  // نگهبان fail-closed: هیچ نشانی روی مسیر نباشد، مسیر بسته است.
  if (route.permissions === undefined && route.anyPermissions === undefined) return false;

  // فهرست خالی در `@RequirePermission` یعنی «فقط ورود لازم است».
  const hasAll = (route.permissions ?? []).every((permission) => permissions.includes(permission));
  const hasAny =
    route.anyPermissions === undefined ||
    route.anyPermissions.some((permission) => permissions.includes(permission));

  return hasAll && hasAny;
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
   * استثناهای عمدی: ثبت بازخورد، بازگشایی بازخورد و ارجاع برای اصلاح — که اصلاً کار
   * ناظرند. هر مسیر نوشتنی دیگری که ناظر بتواند صدا بزند، یک اشتباه است.
   *
   * `FeedbackController.changeStatus` با `@RequireAnyPermission` باز است، ولی ناظر از
   * آن تنها گذارِ «بازگشایی» را می‌تواند؛ این محدودیت در جدول گذارهای سرویس است و
   * تست خودش را در `feedback-transitions.test.ts` دارد.
   */
  it('ناظر هیچ مسیر نوشتنی‌ای جز بازخورد و ارجاع برای اصلاح ندارد', () => {
    const supervisor = DEFAULT_ROLE_PERMISSIONS.SUPERVISOR;

    const allowed = UNSAFE_ROUTES.filter(
      (route) => !route.isPublic && canCall(route, supervisor),
    ).map((route) => `${route.controller}.${route.method}`);

    expect(allowed.sort()).toEqual([
      // مسیرهای گزارش‌گیری عمومی (فاز ۸) POST و DELETE‌اند و واقعاً می‌نویسند — ولی
      // آنچه می‌نویسند **نمای شخصی خودِ کاربر** و **کار خروجی خودش** است، به‌علاوه یک
      // ردیف حسابرسی. هیچ‌کدام داده سند را لمس نمی‌کنند. نشان «فقط خواندنی» روی
      // این‌ها دروغ می‌بود.
      'AnalyticsController.deleteView',
      'AnalyticsController.exportNow',
      'AnalyticsController.queueExport',
      'AnalyticsController.saveView',
      // تغییر رمز خود، خروج از نشست‌های خود و خواندن اعلان‌های خودش، کار هر کاربر
      // واردشده است.
      'AuthController.changePassword',
      'AuthController.logoutAll',
      'DocumentsController.sendBack',
      'FeedbackController.changeStatus',
      'FeedbackController.create',
      'NotificationsController.markAllRead',
      'NotificationsController.markRead',
      /*
        ذخیرهٔ شخصی‌سازی: مسیری نوشتنی که **هر** کاربر واردشده دارد.

        آنچه می‌نویسد تم، رنگ، پینِ فهرست‌ها و آخرین بخشِ خودِ همان کاربر است و
        دامنه‌اش شناسهٔ نشست — نه داده سند و نه دسترسی. نشان «فقط خواندنی» رویش
        دروغ می‌بود، چون واقعاً در دیتابیس می‌نویسد.
      */
      'PreferencesController.replace',
      // اجرای گزارش POST است و واقعاً می‌نویسد — ولی تنها چیزی که می‌نویسد **گزارشِ
      // اجرا** است (یک ردیف `report_runs` و یک ردیف حسابرسی)، نه داده سند. نشان
      // «فقط خواندنی» روی این مسیرها دروغ می‌بود.
      'ReportsController.excelExport',
      'ReportsController.html',
      'ReportsController.pdfExport',
      'ReportsController.preview',
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
      // مسیرهای گزارش‌گیری عمومی (فاز ۸) POST و DELETE‌اند و واقعاً می‌نویسند — ولی
      // آنچه می‌نویسند **نمای شخصی خودِ کاربر** و **کار خروجی خودش** است، به‌علاوه یک
      // ردیف حسابرسی. هیچ‌کدام داده سند را لمس نمی‌کنند. نشان «فقط خواندنی» روی
      // این‌ها دروغ می‌بود.
      'AnalyticsController.deleteView',
      'AnalyticsController.exportNow',
      'AnalyticsController.queueExport',
      'AnalyticsController.saveView',
      'ArchiveController.complete',
      /*
        وضعیت پرداخت: تنها عددِ مالی‌ای که بایگانی می‌نویسد.

        مرز اینجا عوض شد و عمداً: سندی که بایگانی می‌شود، کار مالی‌اش لزوماً تمام
        نشده و کسی جز بایگان این را نمی‌داند. ولی آنچه می‌نویسد **مبلغ سند نیست**
        — مبلغ سند و فاکتورهایش دست‌نخورده می‌مانند و سرور هم اجازهٔ تغییرشان را
        نمی‌دهد (`document:update` و `invoice:*` را ندارد، و همین تست پایین‌تر
        صریحاً می‌سنجدش). این مسیر فقط می‌گوید از آن مبلغ چقدر پرداخت شده، و قید
        دیتابیس نمی‌گذارد جمعِ پرداخت‌شده و شناسایی با مبلغ سند فرق کند.
      */
      'ArchiveController.paymentStatus',
      'ArchiveController.saveInfo',
      'AttachmentsController.remove',
      /*
        چرخش برگه‌های اسکن: مسیری نوشتنی که بایگانی **باید** داشته باشد.

        صاف کردن اسکن کج، کارِ همان کسی است که اسکن در دستش است. آنچه می‌نویسد نه
        مبلغ است و نه حتی خودِ فایل — شیء ذخیره‌شده و checksum آن دست‌نخورده
        می‌مانند و فقط زاویهٔ نمایش و نسخهٔ دانلودی عوض می‌شود.
      */
      'AttachmentsController.setRotations',
      'AttachmentsController.upload',
      'AuthController.changePassword',
      'AuthController.logoutAll',
      'NotificationsController.markAllRead',
      'NotificationsController.markRead',
      /*
        ذخیرهٔ شخصی‌سازی: مسیری نوشتنی که **هر** کاربر واردشده دارد.

        آنچه می‌نویسد تم، رنگ، پینِ فهرست‌ها و آخرین بخشِ خودِ همان کاربر است و
        دامنه‌اش شناسهٔ نشست — نه داده سند و نه دسترسی. نشان «فقط خواندنی» رویش
        دروغ می‌بود، چون واقعاً در دیتابیس می‌نویسد.
      */
      'PreferencesController.replace',
      // اجرای گزارش: فقط ردیف اجرا می‌نویسد، نه داده سند (توضیح در تست ناظر).
      'ReportsController.excelExport',
      'ReportsController.html',
      'ReportsController.pdfExport',
      'ReportsController.preview',
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

  /*
    تفکیک وظایف بایگانی، با یک مرز دقیق‌تر.

    کارپردازی **بارگذاری** می‌کند — اسکن فاکتورها دست خودِ اوست و منتظر ماندن برای
    هر پیوست، کار را متوقف می‌کرد. ولی **حذف** پیوست و **ثبت بایگانی** نزد بایگانی
    می‌ماند: گذاشتن برگشت‌پذیر است، برداشتن نه.
  */
  it('کارپردازی پیوست می‌گذارد ولی برنمی‌دارد، و بایگانی نمی‌زند', () => {
    const procurement = DEFAULT_ROLE_PERMISSIONS.PROCUREMENT;

    expect(procurement).toContain('attachment:read');
    expect(procurement).toContain('attachment:upload');

    expect(procurement).not.toContain('attachment:delete');
    expect(procurement).not.toContain('archive:write');
  });

  it('هیچ مسیر نوشتنی‌ای بدون اعلام دسترسی نیست', () => {
    const undeclared = UNSAFE_ROUTES.filter(
      (route) =>
        !route.isPublic && route.permissions === undefined && route.anyPermissions === undefined,
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
    expect(authenticatedOnly).toEqual([
      'AuthController.changePassword',
      'AuthController.logoutAll',
      'AuthController.me',
      // شخصی‌سازی کاربر: مجوز گرفتن برای عوض کردن رنگ رابط معنایی نداشت، و دامنهٔ
      // هر دو مسیر همان کاربرِ نشست است.
      'PreferencesController.get',
      'PreferencesController.replace',
    ]);
  });

  it('نشان «فقط خواندنی» فقط روی مسیرهایی است که واقعاً نمی‌نویسند', () => {
    const readOnly = ROUTES.filter((route) => route.isReadOnly)
      .map((route) => `${route.controller}.${route.method}`)
      .sort();

    expect(readOnly).toEqual([
      // اجرای گزارش عمومی و برآورد تعداد ردیف خروجی: بدنه‌شان (درخت فیلتر و فهرست
      // ستون‌ها) در URL جا نمی‌شود، ولی هیچ‌کدام چیزی نمی‌نویسند.
      'AnalyticsController.exportPlan',
      'AnalyticsController.query',
      // چند مسیر گزارش هم POSTِ فقط-خواننده‌اند: شناسه سند و فروشنده در مسیر می‌آیند و
      // بدنه متد هیچ نوشتنی ندارد.
      'ReportsController.amountDetails',
      // ریز یک مقصد پرداخت: POST است چون کلید مقصد (شبا یا شناسهٔ قبض) در بدنه
      // می‌رود و نه در نشانی — نشانی جای چنین داده‌ای نیست — ولی چیزی نمی‌نویسد.
      'ReportsController.beneficiaryDetails',
      // اعتبارسنجی قالب بدون ذخیره: ورودی‌اش بزرگ است و در URL جا نمی‌شود، ولی چیزی
      // نمی‌نویسد.
      'ReportsController.checkTemplate',
      // گزینه‌های شرح یک ردیفِ فرم ریزهزینه: شرح پیش‌فرض و انواع کالا را می‌خواند و
      // چیزی ثبت نمی‌کند؛ نوشتنش مسیر جدا و مجوز `document:update` دارد.
      'ReportsController.lineTitleSuggestions',
      'ReportsController.productTypeSuggestions',
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
