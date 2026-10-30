import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { AppError } from '../errors/app-error';
import type { Env } from '../config/env';

/**
 * سقف نرخ درخواست بر پایهٔ نشانی شبکه.
 *
 * قفلِ حساب که از قبل بود، فقط **یک نام کاربری** را می‌بندد؛ کسی که یک رمز را روی
 * پنجاه نام کاربری امتحان می‌کند هیچ‌وقت به آن سقف نمی‌خورد. و مسیرهای سنگین
 * گزارش، با درخواست پیاپی از یک نشانی، سرویس را برای بقیه کُند می‌کردند.
 *
 * **چرا در حافظهٔ همین فرآیند:** سامانه تک‌نمونه و روی شبکهٔ داخلی اجرا می‌شود
 * (docs/18-operations.md §۱). یک شمارندهٔ درون‌فرآیندی اینجا دقیق است و هیچ
 * وابستگی تازه‌ای (Redis یا کتابخانه) اضافه نمی‌کند. اگر روزی چند نمونه شد، سقف
 * به‌ازای هر نمونه اعمال می‌شود — سخت‌گیرانه‌تر نمی‌شود، ولی شُل‌تر هم بله؛ همان
 * روز باید به یک شمارندهٔ مشترک منتقل شود.
 *
 * این سقف **جای احراز هویت نیست**: پیش از نشست و مجوز اجرا می‌شود و فقط حجم
 * درخواست را می‌بندد.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitRule {
  readonly windowMs: number;
  readonly max: number;
}

/** سقف تعداد نشانی‌های هم‌زمان در حافظه، تا خودِ نگهبان به نشت حافظه تبدیل نشود. */
const MAX_BUCKETS = 20_000;

const AUTH_PATHS = ['/auth/login', '/auth/password'];

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * مسیرهای حساسِ هویت سقف جداگانه و بسیار تنگ‌تری دارند؛ سقف عمومی آن‌قدر بالاست
   * که کاربر واقعی هرگز نبیندش.
   */
  private readonly authRule: RateLimitRule;
  private readonly generalRule: RateLimitRule;

  constructor(config: ConfigService<Env, true>) {
    this.authRule = {
      windowMs: config.get('AUTH_RATE_LIMIT_WINDOW_MINUTES', { infer: true }) * 60_000,
      max: config.get('AUTH_RATE_LIMIT_MAX', { infer: true }),
    };
    this.generalRule = {
      windowMs: 60_000,
      max: config.get('GENERAL_RATE_LIMIT_MAX', { infer: true }),
    };
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const isAuth = AUTH_PATHS.some((path) => request.path.endsWith(path));
    const rule = isAuth ? this.authRule : this.generalRule;

    // کلید شامل قاعده است، وگرنه تلاش‌های ورود از سهمیهٔ عمومی خرج می‌شد.
    const key = `${isAuth ? 'auth' : 'all'}:${request.ip ?? 'unknown'}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.sweep(now);
      this.buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      return true;
    }

    bucket.count += 1;

    if (bucket.count > rule.max) {
      /*
        پیام، عدد سقف را نمی‌گوید.

        گفتنش به کسی که دارد حدس می‌زند یاد می‌دهد دقیقاً چقدر صبر کند؛ کاربر
        واقعی هم جز «کمی بعد» چیزی لازم ندارد.
      */
      throw AppError.tooManyRequests('درخواست‌های شما بیش از حد مجاز است. کمی بعد تلاش کنید.');
    }

    return true;
  }

  /** پاک کردن سطل‌های منقضی؛ و اگر باز هم پر بود، قدیمی‌ترین‌ها. */
  private sweep(now: number): void {
    if (this.buckets.size < MAX_BUCKETS) {
      if (this.buckets.size % 512 !== 0) return;
    }

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }

    // حملهٔ توزیع‌شده می‌تواند با نشانی‌های تازه حافظه را پر کند؛ در آن حالت
    // قدیمی‌ترین‌ها می‌روند. از دست رفتن شمارشِ یک نشانی، بدتر از مصرف حافظه نیست.
    while (this.buckets.size >= MAX_BUCKETS) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) break;
      this.buckets.delete(oldest.value);
    }
  }
}
