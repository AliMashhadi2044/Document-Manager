import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { Observable, from, of, switchMap } from 'rxjs';
import { tap } from 'rxjs/operators';

import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../errors/app-error';
import type { AuthenticatedUser } from '../auth/auth.decorators';
import { serializeBigInts } from '../interceptors/bigint-serializer.interceptor';

export const IDEMPOTENT_KEY = 'requires_idempotency';
export const IDEMPOTENCY_HEADER = 'idempotency-key';

/** عملیات حساسی که نباید دوبار اجرا شوند: ثبت نهایی، بازگشایی، بایگانی، آپلود. */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

const RETENTION_HOURS = 24;

/**
 * ضد ثبت تکراری (ریسک R8).
 *
 * دوبار کلیک، retry شبکه یا رفرش صفحه نباید دو سند ثبت کند. اولین اجرای موفق پاسخش
 * ذخیره می‌شود و تکرار همان کلید، **همان پاسخ** را بدون اجرای دوباره برمی‌گرداند.
 *
 * این لایه اول نیست — قفل ردیف و ماشین وضعیت هم هستند. این لایه تضمین می‌کند که
 * تکرار درخواست، خطای گیج‌کننده هم به کاربر ندهد.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return next.handle();

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = request.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(header) ? header[0] : header;

    if (!key || key.trim().length === 0) {
      throw AppError.validation('هدر Idempotency-Key برای این عملیات الزامی است', [
        { path: 'headers.Idempotency-Key', message: 'این هدر الزامی است' },
      ]);
    }

    const user = request.user;
    if (!user) throw AppError.unauthorized();

    const endpoint = `${request.method} ${request.route?.path ?? request.url}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ endpoint, body: request.body ?? null }))
      .digest('hex');

    return from(this.prisma.idempotencyKey.findUnique({ where: { key } })).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.userId !== user.id || existing.endpoint !== endpoint) {
            throw AppError.conflict(
              'IDEMPOTENCY_KEY_REUSED',
              'این کلید قبلاً برای عملیات دیگری استفاده شده است',
            );
          }
          if (existing.requestHash !== requestHash) {
            throw AppError.conflict(
              'IDEMPOTENCY_PAYLOAD_MISMATCH',
              'همین کلید قبلاً با اطلاعات متفاوتی ارسال شده است',
            );
          }
          // همان پاسخ قبلی، بدون اجرای دوباره.
          return of(existing.responseBody);
        }

        return next.handle().pipe(
          tap((response) => {
            void this.prisma.idempotencyKey
              .create({
                data: {
                  key,
                  userId: user.id,
                  endpoint,
                  requestHash,
                  responseStatus: 200,
                  responseBody: serializeBigInts(response) as never,
                  expiresAt: new Date(Date.now() + RETENTION_HOURS * 3_600_000),
                },
              })
              .catch(() => undefined);
          }),
        );
      }),
    );
  }
}
